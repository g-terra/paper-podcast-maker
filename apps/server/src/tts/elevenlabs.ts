import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Voice } from '@paper-podcast/shared';
import { concatWav } from '../audio/wav.js';

/**
 * ElevenLabs cloud text-to-speech. The API key comes from ELEVENLABS_API_KEY (the server also
 * reads the project's .env.local) or `<dataDir>/elevenlabs.key`; it only goes to api.elevenlabs.io.
 */
export const ELEVENLABS_API = 'https://api.elevenlabs.io';
export const ELEVENLABS_MODEL = process.env.PPM_ELEVENLABS_MODEL ?? 'eleven_multilingual_v2';
const SAMPLE_RATE = 24000;
const KEY_FILE = 'elevenlabs.key';

export type Fetch = typeof fetch;

export interface ElevenLabsContext {
  dataDir: string;
  env?: NodeJS.ProcessEnv;
  fetch?: Fetch;
}

export async function elevenLabsKey(ctx: ElevenLabsContext): Promise<string | undefined> {
  const fromEnv = (ctx.env ?? process.env).ELEVENLABS_API_KEY?.trim();
  if (fromEnv) return fromEnv;
  const saved = await readFile(join(ctx.dataDir, KEY_FILE), 'utf8').catch(() => '');
  return saved.trim() || undefined;
}

/** True when the key is set by the environment (the UI can't change it then). */
export function elevenLabsKeyFromEnv(ctx: ElevenLabsContext): boolean {
  return Boolean((ctx.env ?? process.env).ELEVENLABS_API_KEY?.trim());
}

/** Turns an ElevenLabs error reply into a sentence a person can act on. */
export async function elevenLabsError(res: Response): Promise<Error> {
  const body = (await res.json().catch(() => null)) as {
    detail?: string | { message?: string; status?: string };
  } | null;
  const detail =
    typeof body?.detail === 'string' ? body.detail : (body?.detail?.message ?? res.statusText);
  if (res.status === 401) {
    return new Error(
      `ElevenLabs rejected the API key. Put a valid key in the project's .env.local (ELEVENLABS_API_KEY=…) and restart. (${detail})`,
    );
  }
  if (res.status === 402 || /quota|credits/i.test(detail)) {
    return new Error(`Your ElevenLabs account is out of credits. (${detail})`);
  }
  return new Error(`ElevenLabs failed (${res.status}): ${detail}`);
}

async function requireKey(ctx: ElevenLabsContext): Promise<string> {
  const key = await elevenLabsKey(ctx);
  if (!key)
    throw new Error(
      "No ElevenLabs API key. Add ELEVENLABS_API_KEY=… to the project's .env.local, then run `ppm restart`.",
    );
  return key;
}

interface ApiVoice {
  voice_id: string;
  name: string;
  category?: string;
  description?: string | null;
  labels?: Record<string, string | undefined>;
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function describeElevenLabsVoice(v: ApiVoice): Voice {
  const labels = v.labels ?? {};
  const gender = labels.gender?.toLowerCase();
  const extra = [labels.description, labels.use_case]
    .filter(Boolean)
    .map((s) => s!.replace(/_/g, ' '));
  return {
    id: v.voice_id,
    // Library names are often "Rachel - calm narrator"; keep the short part.
    name: v.name.split(/\s+[-–]\s+/)[0]!.trim() || v.name,
    gender: gender === 'female' || gender === 'male' ? gender : 'neutral',
    accent: labels.accent ? capitalize(labels.accent) : '',
    ...(extra.length ? { description: [...new Set(extra)].join(', ') } : {}),
  };
}

let voicesCache: { key: string; at: number; voices: Voice[] } | undefined;

/** Voices in the user's ElevenLabs account, alternating women and men so auto hosts differ. */
export async function elevenLabsVoices(ctx: ElevenLabsContext): Promise<Voice[]> {
  const key = await requireKey(ctx);
  if (voicesCache && voicesCache.key === key && Date.now() - voicesCache.at < 10 * 60_000) {
    return voicesCache.voices;
  }
  const res = await (ctx.fetch ?? fetch)(`${ELEVENLABS_API}/v1/voices`, {
    headers: { 'xi-api-key': key },
  });
  if (!res.ok) throw await elevenLabsError(res);
  const body = (await res.json()) as { voices?: ApiVoice[] };
  const all = (body.voices ?? []).map(describeElevenLabsVoice);
  const women = all.filter((v) => v.gender === 'female');
  const men = all.filter((v) => v.gender === 'male');
  const ordered: Voice[] = [];
  for (let i = 0; i < Math.max(women.length, men.length); i++) {
    if (women[i]) ordered.push(women[i]!);
    if (men[i]) ordered.push(men[i]!);
  }
  ordered.push(...all.filter((v) => v.gender === 'neutral'));
  voicesCache = { key, at: Date.now(), voices: ordered };
  return ordered;
}

export interface ElevenLabsSpeakOptions {
  speed?: number;
  /** Neighbouring lines, so the intonation flows across turns. */
  previousText?: string;
  nextText?: string;
}

/** Speaks `text` and returns a 16-bit mono WAV. */
export async function elevenLabsWav(
  ctx: ElevenLabsContext,
  text: string,
  voice: string,
  options: ElevenLabsSpeakOptions = {},
): Promise<Buffer> {
  const key = await requireKey(ctx);
  if (!voice) throw new Error('Choose an ElevenLabs voice');
  const speed = Math.min(1.2, Math.max(0.7, options.speed ?? 1));
  const url = `${ELEVENLABS_API}/v1/text-to-speech/${encodeURIComponent(voice)}?output_format=pcm_${SAMPLE_RATE}`;
  const res = await (ctx.fetch ?? fetch)(url, {
    method: 'POST',
    headers: { 'xi-api-key': key, 'content-type': 'application/json', accept: 'audio/pcm' },
    body: JSON.stringify({
      text,
      model_id: ELEVENLABS_MODEL,
      ...(options.previousText ? { previous_text: options.previousText } : {}),
      ...(options.nextText ? { next_text: options.nextText } : {}),
      voice_settings: { stability: 0.45, similarity_boost: 0.75, speed },
    }),
  });
  if (!res.ok) throw await elevenLabsError(res);
  const raw = Buffer.from(await res.arrayBuffer());
  // Raw little-endian 16-bit mono PCM.
  const samples = new Int16Array(Math.floor(raw.length / 2));
  for (let i = 0; i < samples.length; i++) samples[i] = raw.readInt16LE(i * 2);
  return concatWav([{ sampleRate: SAMPLE_RATE, samples }], 0);
}
