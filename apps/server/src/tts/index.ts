import type { EnginesResponse, TtsEngine, Voice } from '@paper-podcast/shared';
import { kokoroModelReady, kokoroVoices, kokoroWav } from './kokoro.js';
import {
  elevenLabsKey,
  elevenLabsKeyFromEnv,
  elevenLabsVoices,
  elevenLabsWav,
  type Fetch,
} from './elevenlabs.js';

export interface TtsContext {
  /** Where the downloaded Kokoro model is cached. */
  modelsDir: string;
  /** Holds the saved ElevenLabs key. */
  dataDir: string;
  env?: NodeJS.ProcessEnv;
  /** Overridable for tests. */
  fetch?: Fetch;
}

export interface SpeakOptions {
  speed?: number;
  previousText?: string;
  nextText?: string;
}

export async function engineStatus(ctx: TtsContext): Promise<EnginesResponse> {
  const hasKey = Boolean(await elevenLabsKey(ctx));
  return {
    engines: [
      {
        id: 'kokoro',
        label: 'Kokoro',
        available: true,
        cloud: false,
        ...((await kokoroModelReady(ctx.modelsDir))
          ? {}
          : { detail: 'The voice model downloads once (about 90 MB) on first use.' }),
      },
      {
        id: 'elevenlabs',
        label: 'ElevenLabs',
        available: hasKey,
        cloud: true,
        detail: hasKey
          ? elevenLabsKeyFromEnv(ctx)
            ? 'Using the key from ELEVENLABS_API_KEY.'
            : 'Using your saved API key.'
          : 'Needs an ElevenLabs API key.',
      },
    ],
  };
}

/** Voices for an engine, best defaults first. */
export function engineVoices(ctx: TtsContext, engine: TtsEngine): Promise<Voice[]> {
  return engine === 'elevenlabs' ? elevenLabsVoices(ctx) : listVoices();
}

/** Speaks one line with the chosen engine and returns a 16-bit mono WAV. */
export function speakLine(
  ctx: TtsContext,
  engine: TtsEngine,
  text: string,
  voice: string,
  options: SpeakOptions = {},
): Promise<Buffer> {
  return engine === 'elevenlabs'
    ? elevenLabsWav(ctx, text, voice, options)
    : kokoroWav(ctx.modelsDir, text, voice, options.speed ?? 1);
}

/** A woman and a man first, so two auto hosts sound clearly different. */
export const preferredVoices = [
  'af_heart',
  'am_michael',
  'bf_emma',
  'bm_george',
  'af_bella',
  'am_fenrir',
];

/** "am_michael" -> { name: "Michael", gender: "male", accent: "American" }. */
export function describeVoice(id: string): Voice {
  const raw = id.slice(3);
  return {
    id,
    name: raw.charAt(0).toUpperCase() + raw.slice(1),
    gender: id[1] === 'm' ? 'male' : 'female',
    accent: id[0] === 'b' ? 'British' : 'American',
  };
}

export async function listVoices(): Promise<Voice[]> {
  const ids = await kokoroVoices();
  // Preferred voices first, then the rest alphabetically.
  const ordered = [
    ...preferredVoices.filter((v) => ids.includes(v)),
    ...ids.filter((v) => !preferredVoices.includes(v)),
  ];
  return ordered.map(describeVoice);
}

/** Picks a voice per host: their chosen one, or a distinct installed voice. */
export function assignVoices(
  chosen: string[],
  installed: string[],
  preferred = preferredVoices,
): string[] {
  const pool = [
    ...preferred.filter((v) => installed.includes(v)),
    ...installed.filter((v) => !preferred.includes(v)),
  ].filter((v) => !chosen.includes(v));
  let next = 0;
  return chosen.map((voice) => voice || pool[next++] || installed[0] || '');
}
