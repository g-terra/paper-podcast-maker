import type { Voice } from '@paper-podcast/shared';
import { kokoroVoices } from './kokoro.js';

export interface TtsContext {
  /** Where the downloaded Kokoro model is cached. */
  modelsDir: string;
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
