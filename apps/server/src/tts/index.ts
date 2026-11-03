import { readdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import type { TtsEngineId, TtsEngineStatus } from '@paper-podcast/shared';
import { findOnPath } from '../providers/path.js';
import { runCommand } from '../run.js';
import { kokoroInstalled, kokoroSynthesize, kokoroVoices } from './kokoro.js';

export interface TtsContext {
  piperVoicesDir: string;
  /** Where downloaded TTS models (Kokoro) are cached. */
  modelsDir: string;
}

export interface TtsEngine {
  id: TtsEngineId;
  label: string;
  /** Returns the executable to run, or null when the engine isn't installed. */
  locate(): Promise<string | null>;
  listVoices(executable: string, ctx: TtsContext): Promise<string[]>;
  /** Speaks the text in `textFile` and writes a 16-bit PCM WAV to `outFile`. */
  synthesize(
    executable: string,
    args: { textFile: string; outFile: string; voice: string },
    ctx: TtsContext,
  ): Promise<void>;
  hint: string;
}

const kokoro: TtsEngine = {
  id: 'kokoro',
  label: 'Kokoro (neural, recommended)',
  hint: 'Natural voices that run inside the app. The first episode downloads the model once (about 90 MB).',
  locate: async () => (kokoroInstalled() ? 'kokoro' : null),
  listVoices: () => kokoroVoices(),
  synthesize: (_exe, args, ctx) => kokoroSynthesize(ctx.modelsDir, args),
};

const say: TtsEngine = {
  id: 'say',
  label: 'macOS say',
  hint: 'Built into macOS. Add more voices in System Settings > Accessibility > Spoken Content.',
  locate: async () => (process.platform === 'darwin' ? findOnPath('say') : null),
  async listVoices(exe) {
    const { stdout } = await runCommand(exe, ['-v', '?']);
    return parseSayVoices(stdout);
  },
  async synthesize(exe, { textFile, outFile, voice }) {
    const args = ['-f', textFile, '-o', outFile, '--file-format=WAVE', '--data-format=LEI16@22050'];
    if (voice) args.unshift('-v', voice);
    await runCommand(exe, args);
  },
};

const espeak: TtsEngine = {
  id: 'espeak-ng',
  label: 'eSpeak NG',
  hint: 'Install with your package manager, e.g. `apt install espeak-ng` or `brew install espeak-ng`. Robotic but fast.',
  locate: () => findOnPath('espeak-ng'),
  async listVoices(exe) {
    const { stdout } = await runCommand(exe, ['--voices=en']);
    return parseEspeakVoices(stdout);
  },
  async synthesize(exe, { textFile, outFile, voice }) {
    await runCommand(exe, [...(voice ? ['-v', voice] : []), '-w', outFile, '-f', textFile]);
  },
};

const piper: TtsEngine = {
  id: 'piper',
  label: 'Piper (neural)',
  hint: 'Natural-sounding. Install with `pipx install piper-tts`, then put voice .onnx files (with their .onnx.json) in the Piper voices folder.',
  locate: () => findOnPath('piper'),
  async listVoices(_exe, ctx) {
    try {
      const files = await readdir(ctx.piperVoicesDir);
      return files.filter((f) => f.endsWith('.onnx')).sort();
    } catch {
      return [];
    }
  },
  async synthesize(exe, { textFile, outFile, voice }, ctx) {
    const voices = await this.listVoices(exe, ctx);
    const model = voice || voices[0];
    if (!model) throw new Error(`No Piper voices found in ${ctx.piperVoicesDir}`);
    // Voices are file names inside the voices folder; never accept a path.
    if (basename(model) !== model) throw new Error('Piper voice must be a file name');
    await runCommand(exe, ['--model', join(ctx.piperVoicesDir, model), '--output_file', outFile], {
      stdin: await readFile(textFile, 'utf8'),
    });
  },
};

const sapiList = `Add-Type -AssemblyName System.Speech
$s = New-Object System.Speech.Synthesis.SpeechSynthesizer
$s.GetInstalledVoices() | Where-Object { $_.Enabled } | ForEach-Object { $_.VoiceInfo.Name }`;

const sapiSpeak = `param([string]$TextFile, [string]$OutFile, [string]$Voice)
Add-Type -AssemblyName System.Speech
$s = New-Object System.Speech.Synthesis.SpeechSynthesizer
if ($Voice) { $s.SelectVoice($Voice) }
$fmt = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(22050, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
$s.SetOutputToWaveFile($OutFile, $fmt)
$s.Speak([System.IO.File]::ReadAllText($TextFile))
$s.Dispose()`;

const sapi: TtsEngine = {
  id: 'sapi',
  label: 'Windows speech',
  hint: 'Built into Windows. Add voices in Settings > Time & language > Speech.',
  locate: async () =>
    process.platform === 'win32'
      ? ((await findOnPath('powershell')) ?? (await findOnPath('pwsh')))
      : null,
  async listVoices(exe) {
    const { stdout } = await runCommand(exe, ['-NoProfile', '-NonInteractive', '-Command', '-'], {
      stdin: sapiList,
    });
    return stdout
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
  },
  async synthesize(exe, { textFile, outFile, voice }) {
    const script = join(textFile + '.ps1');
    await writeFile(script, sapiSpeak, 'utf8');
    if (voice && !/^[\w .()-]+$/.test(voice)) throw new Error('Unexpected Windows voice name');
    await runCommand(exe, [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      script,
      textFile,
      outFile,
      voice,
    ]);
  },
};

export const ttsEngines: readonly TtsEngine[] = [kokoro, say, piper, espeak, sapi];

export function getTtsEngine(id: TtsEngineId): TtsEngine {
  const engine = ttsEngines.find((e) => e.id === id);
  if (!engine) throw new Error(`Unknown TTS engine ${id}`);
  return engine;
}

export async function detectTtsEngines(ctx: TtsContext): Promise<TtsEngineStatus[]> {
  return Promise.all(
    ttsEngines.map(async (engine) => {
      const exe = await engine.locate();
      const voices = exe ? await engine.listVoices(exe, ctx).catch(() => []) : [];
      const hint =
        engine.id === 'piper' && exe && voices.length === 0
          ? `Piper is installed but has no voices. Download a voice (.onnx and .onnx.json) into ${ctx.piperVoicesDir}`
          : engine.hint;
      return { id: engine.id, label: engine.label, available: exe !== null, voices, hint };
    }),
  );
}

export function parseSayVoices(output: string): string[] {
  // Lines look like: "Samantha            en_US    # Hello! My name is Samantha."
  const voices: string[] = [];
  for (const line of output.split('\n')) {
    const match = /^(.+?)\s+([a-z]{2,3}[_-][A-Za-z0-9]+)\s+#/.exec(line);
    if (match?.[1]) voices.push(match[1].trim());
  }
  return voices;
}

export function parseEspeakVoices(output: string): string[] {
  // Columns: Pty Language Age/Gender VoiceName File Other Languages.
  // MBROLA voices (file "mb/...") need extra packages, so they are skipped.
  const languages = output
    .split('\n')
    .slice(1)
    .map((line) => line.trim().split(/\s+/))
    .filter((cols) => cols[1] && cols[4] && !cols[4].startsWith('mb/') && cols[1] !== 'variant')
    .map((cols) => cols[1]!);
  const unique = [...new Set(languages)];
  // "+f3" selects a female variant, which helps tell two hosts apart.
  return [...unique, ...unique.slice(0, 3).map((v) => `${v}+f3`)];
}

/** Picks a voice per host: their chosen one, or a distinct installed voice. */
export function assignVoices(chosen: string[], installed: string[], preferred: string[]): string[] {
  const pool = [
    ...preferred.filter((v) => installed.includes(v)),
    ...installed.filter((v) => !preferred.includes(v)),
  ].filter((v) => !chosen.includes(v));
  let next = 0;
  return chosen.map((voice) => voice || pool[next++] || installed[0] || '');
}

/** Voices that sound good as defaults, per engine, best first. */
export const preferredVoices: Record<TtsEngineId, string[]> = {
  // A woman and a man first, so two hosts sound clearly different.
  kokoro: ['af_heart', 'am_michael', 'bf_emma', 'bm_george', 'af_bella', 'am_fenrir'],
  say: ['Samantha', 'Daniel', 'Karen', 'Moira', 'Alex', 'Fred'],
  'espeak-ng': ['en-us', 'en-gb+f3', 'en-gb', 'en-us+f3'],
  piper: [],
  sapi: ['Microsoft Zira Desktop', 'Microsoft David Desktop'],
};
