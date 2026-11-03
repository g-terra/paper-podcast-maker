import { randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  countWords,
  estimateMinutes,
  type Episode,
  type PodcastSettings,
  type Transcript,
} from '@paper-podcast/shared';
import { extractPdfText } from '../pdf.js';
import { getProvider, type CommandLocator } from '../providers/index.js';
import { assignVoices, engineVoices, speakLine, type TtsContext } from '../tts/index.js';
import { kokoroModelReady } from '../tts/kokoro.js';
import { readWav } from '../audio/wav.js';
import { mixConversation, type MixLine } from '../audio/mix.js';
import { buildTranscriptPrompt, parseTranscript, wordTargets } from './prompt.js';

export interface PipelineDeps {
  dataDir: string;
  tts: TtsContext;
  aiTimeoutMs: number;
  locateCommand: CommandLocator;
  /** Overridable for tests. */
  generateText?: (prompt: string, settings: PodcastSettings) => Promise<string>;
  extractText?: (pdf: Uint8Array) => Promise<string>;
  renderAudio?: (transcript: Transcript, settings: PodcastSettings, dir: string) => Promise<void>;
}

const AUDIO_FILE = 'episode.wav';

/** Stores episodes as folders under `<dataDir>/episodes/<id>` and runs the pipeline. */
export class EpisodeService {
  private readonly episodes = new Map<string, Episode>();
  private readonly running = new Map<string, Promise<void>>();

  constructor(private readonly deps: PipelineDeps) {}

  private dir(id: string) {
    return join(this.deps.dataDir, 'episodes', id);
  }

  async load(): Promise<void> {
    const root = join(this.deps.dataDir, 'episodes');
    const ids = await readdir(root).catch(() => []);
    for (const id of ids) {
      try {
        const ep = JSON.parse(await readFile(join(root, id, 'episode.json'), 'utf8')) as Episode;
        // Anything mid-flight when the server stopped will never finish.
        if (ep.stage !== 'done' && ep.stage !== 'failed') {
          ep.stage = 'failed';
          ep.error = 'The server stopped while this episode was being made.';
        }
        this.episodes.set(id, ep);
      } catch {
        // skip unreadable folders
      }
    }
  }

  list(): Episode[] {
    return [...this.episodes.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  get(id: string): Episode | undefined {
    return this.episodes.get(id);
  }

  audioPath(id: string): string {
    return join(this.dir(id), AUDIO_FILE);
  }

  async create(paperName: string, pdf: Uint8Array, settings: PodcastSettings): Promise<Episode> {
    const id = randomUUID();
    const episode: Episode = {
      id,
      paperName,
      createdAt: new Date().toISOString(),
      stage: 'queued',
      detail: 'Waiting to start',
      settings,
    };
    await mkdir(this.dir(id), { recursive: true });
    await writeFile(join(this.dir(id), 'paper.pdf'), pdf);
    await this.save(episode);
    this.track(id, this.run(episode, pdf));
    return episode;
  }

  /** Re-voices an episode after its transcript was edited. */
  async rerender(id: string, transcript: Transcript): Promise<Episode> {
    const episode = this.mustGet(id);
    if (this.running.has(id)) throw new Error('This episode is still being made');
    episode.transcript = transcript;
    episode.estimatedMinutes = estimateMinutes(transcript);
    delete episode.audioUrl;
    delete episode.error;
    this.track(
      id,
      this.step(episode, async () => {
        await this.speak(episode, transcript);
      }),
    );
    return episode;
  }

  async remove(id: string): Promise<void> {
    if (this.running.has(id)) throw new Error('This episode is still being made');
    this.episodes.delete(id);
    await rm(this.dir(id), { recursive: true, force: true });
  }

  /** Resolves when the episode's current job finishes (used by tests). */
  async settled(id: string): Promise<void> {
    await this.running.get(id);
  }

  private mustGet(id: string): Episode {
    const ep = this.episodes.get(id);
    if (!ep) throw new Error('Episode not found');
    return ep;
  }

  private track(id: string, job: Promise<void>) {
    this.running.set(
      id,
      job.finally(() => this.running.delete(id)),
    );
  }

  private async save(episode: Episode) {
    this.episodes.set(episode.id, episode);
    await writeFile(join(this.dir(episode.id), 'episode.json'), JSON.stringify(episode, null, 2));
  }

  private async update(episode: Episode, patch: Partial<Episode>) {
    Object.assign(episode, patch);
    await this.save(episode);
  }

  private async step(episode: Episode, work: () => Promise<void>) {
    try {
      await work();
      await this.update(episode, { stage: 'done', detail: 'Ready' });
    } catch (error) {
      await this.update(episode, {
        stage: 'failed',
        detail: 'Failed',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private run(episode: Episode, pdf: Uint8Array): Promise<void> {
    return this.step(episode, async () => {
      await this.update(episode, { stage: 'extracting', detail: 'Reading the paper' });
      const text = await (this.deps.extractText ?? extractPdfText)(pdf);
      if (text.length < 500) {
        throw new Error(
          'Could not find enough text in this PDF. Scanned PDFs need OCR before they can be used.',
        );
      }
      await writeFile(join(this.dir(episode.id), 'paper.txt'), text);

      const transcript = await this.write(episode, text);
      await this.speak(episode, transcript);
    });
  }

  private async write(episode: Episode, paperText: string): Promise<Transcript> {
    const { settings } = episode;
    const generate = this.deps.generateText ?? ((p, s) => this.generateWithCli(p, s));
    const { min, max } = wordTargets(settings);

    let feedback: string | undefined;
    let transcript: Transcript | undefined;
    // One retry: models often miss the word budget on the first try.
    for (let attempt = 1; attempt <= 2; attempt++) {
      await this.update(episode, {
        stage: 'writing',
        detail:
          attempt === 1
            ? `Writing the script with ${getProvider(settings.provider).label}`
            : 'Adjusting the script length',
      });
      const output = await generate(buildTranscriptPrompt(paperText, settings, feedback), settings);
      await writeFile(join(this.dir(episode.id), `ai-output-${attempt}.txt`), output);
      transcript = parseTranscript(output, settings);
      const words = countWords(transcript);
      // Allow 10% slack before asking for a rewrite.
      if (words >= min * 0.9 && words <= max * 1.1) break;
      feedback = `Your previous draft was ${words} words, but it must be between ${min} and ${max} words. ${
        words < min ? 'Make it longer by going deeper' : 'Make it shorter by cutting detail'
      } while keeping the same structure.`;
    }

    await this.update(episode, {
      transcript,
      estimatedMinutes: estimateMinutes(transcript!),
    });
    return transcript!;
  }

  private async generateWithCli(prompt: string, settings: PodcastSettings): Promise<string> {
    const provider = getProvider(settings.provider);
    const exe = await this.deps.locateCommand(provider.command);
    if (!exe) throw new Error(`${provider.label} (\`${provider.command}\`) was not found on PATH`);
    try {
      return await provider.generate(exe, prompt, {
        model: settings.model,
        timeoutMs: this.deps.aiTimeoutMs,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/authenticat|log ?in|oauth|unauthori[sz]ed|api key/i.test(message)) {
        throw new Error(
          `${provider.label} is not signed in. Run \`${provider.command}\` in a terminal and log in, then try again.\n\n${message}`,
          { cause: error },
        );
      }
      throw error;
    }
  }

  private async speak(episode: Episode, transcript: Transcript) {
    await this.update(episode, { stage: 'speaking', detail: 'Preparing voices' });
    const render = this.deps.renderAudio ?? ((t, s, d) => this.renderWithTts(episode, t, s, d));
    await render(transcript, episode.settings, this.dir(episode.id));
    await this.update(episode, {
      audioUrl: `/api/episodes/${episode.id}/audio?v=${Date.now()}`,
    });
  }

  private async renderWithTts(
    episode: Episode,
    transcript: Transcript,
    settings: PodcastSettings,
    dir: string,
  ) {
    const engine = settings.engine;
    const installed = (await engineVoices(this.deps.tts, engine)).map((v) => v.id);
    const voices = assignVoices(
      // A voice from another engine (settings saved before switching) means "pick one".
      settings.hosts.map((h) => (installed.includes(h.voice) ? h.voice : '')),
      installed,
      [],
    );
    const voiceFor = new Map(settings.hosts.map((h, i) => [h.name, voices[i] ?? '']));
    if (engine === 'kokoro' && !(await kokoroModelReady(this.deps.tts.modelsDir))) {
      await this.update(episode, {
        detail: 'Downloading the Kokoro voice model (once, about 90 MB)',
      });
    }

    const { lines } = transcript;
    const clips: MixLine[] = [];
    for (const [i, line] of lines.entries()) {
      await this.update(episode, {
        detail: `Voicing line ${i + 1} of ${lines.length}`,
      });
      const wav = await speakLine(
        this.deps.tts,
        engine,
        line.text,
        voiceFor.get(line.speaker) ?? '',
        { speed: settings.speed, previousText: lines[i - 1]?.text, nextText: lines[i + 1]?.text },
      );
      clips.push({
        pcm: readWav(wav),
        speaker: line.speaker,
        text: line.text,
        overlap: line.overlap,
      });
    }

    await this.update(episode, { detail: 'Joining the audio' });
    await writeFile(join(dir, AUDIO_FILE), mixConversation(clips, hashSeed(episode.id)));
  }
}

/** A stable number from an id, so re-recording an episode keeps the same timing. */
function hashSeed(id: string): number {
  let h = 2166136261;
  for (const ch of id) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}
