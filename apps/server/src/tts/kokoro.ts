import { readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { KokoroTTS } from 'kokoro-js';
import { concatWav } from '../audio/wav.js';

/** Kokoro-82M, run in-process with ONNX Runtime. ~90 MB (q8), downloaded once. */
export const KOKORO_MODEL = 'onnx-community/Kokoro-82M-v1.0-ONNX';
const DTYPE = (process.env.PPM_KOKORO_DTYPE ?? 'q8') as 'fp32' | 'fp16' | 'q8' | 'q4' | 'q4f16';

let loading: Promise<KokoroTTS> | undefined;
let loadedFrom: string | undefined;

/** Loads the model once per process, caching the download under `modelsDir`. */
export function loadKokoro(modelsDir: string): Promise<KokoroTTS> {
  if (!loading || loadedFrom !== modelsDir) {
    loadedFrom = modelsDir;
    loading = (async () => {
      const { env } = await import('@huggingface/transformers');
      env.cacheDir = modelsDir;
      const { KokoroTTS } = await import('kokoro-js');
      try {
        return await KokoroTTS.from_pretrained(KOKORO_MODEL, { dtype: DTYPE, device: 'cpu' });
      } catch (error) {
        throw new Error(
          `Couldn't load the Kokoro voice model (${(error as Error).message}). The first run downloads it from huggingface.co, so check your internet connection, or run \`ppm setup\`.`,
          { cause: error },
        );
      }
    })();
    // Let a failed download be retried on the next episode.
    loading.catch(() => {
      loading = undefined;
    });
  }
  return loading;
}

/** True when the kokoro-js package is installed. */
/** True once the model files are in the cache (no download needed). */
export async function kokoroModelReady(modelsDir: string): Promise<boolean> {
  try {
    const files = await readdir(join(modelsDir, ...KOKORO_MODEL.split('/'), 'onnx'));
    return files.some((f) => f.endsWith('.onnx'));
  } catch {
    return false;
  }
}

export function kokoroInstalled(): boolean {
  try {
    import.meta.resolve('kokoro-js');
    return true;
  } catch {
    return false;
  }
}

/** Voice ids bundled with kokoro-js (e.g. "af_heart"), read without loading the model. */
export async function kokoroVoices(): Promise<string[]> {
  const entry = fileURLToPath(import.meta.resolve('kokoro-js'));
  const files = await readdir(join(dirname(entry), '..', 'voices'));
  return (
    files
      // kokoro-js only phonemizes English: a* = American, b* = British voices.
      .filter((f) => f.endsWith('.bin') && /^[ab][fm]_/.test(f))
      .map((f) => f.slice(0, -4))
      .sort()
  );
}

/** Converts float samples in [-1, 1] to 16-bit PCM. */
export function floatTo16(samples: Float32Array): Int16Array {
  const out = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i] ?? 0));
    out[i] = Math.round(s < 0 ? s * 0x8000 : s * 0x7fff);
  }
  return out;
}

/**
 * Rewrites sounds the phonemizer can't say: it spells "Mm-hmm" as "em em hum", "Mhm" as letters
 * and reads "Uh-huh" as "uh-uh" (a no), so they become words that sound right.
 */
export function speakable(text: string): string {
  return text
    .replace(/\b(?:m+-?hm+|m+ hm+|uh-?huh|uh huh)\b/gi, (m) =>
      m[0] === m[0]?.toUpperCase() ? 'Yeah' : 'yeah',
    )
    .replace(/\b(?:hm+|m{2,})\b/gi, (m) => (m[0] === m[0]?.toUpperCase() ? 'Hmm' : 'hmm'));
}

/** Speaks `text` and returns a 16-bit mono WAV. */
export async function kokoroWav(
  modelsDir: string,
  text: string,
  voice: string,
  speed = 1,
): Promise<Buffer> {
  const tts = await loadKokoro(modelsDir);
  const chunks: Float32Array[] = [];
  let sampleRate = 24000;
  // stream() splits into sentences, which keeps each chunk under the model's token limit.
  // Voice ids come from kokoroVoices(); the type is a fixed union of them.
  const options = { voice: (voice || 'af_heart') as 'af_heart', speed };
  // Pass a closed splitter: given a plain string, kokoro-js 1.2 never closes its own splitter,
  // so the stream waits for more text forever after the last sentence.
  const { TextSplitterStream } = await import('kokoro-js');
  const splitter = new TextSplitterStream();
  splitter.push(speakable(text));
  splitter.close();
  for await (const { audio } of tts.stream(splitter, options)) {
    chunks.push(audio.audio);
    sampleRate = audio.sampling_rate;
  }
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const all = new Float32Array(total);
  let offset = 0;
  for (const c of chunks) {
    all.set(c, offset);
    offset += c.length;
  }
  return concatWav([{ sampleRate, samples: floatTo16(all) }], 0);
}
