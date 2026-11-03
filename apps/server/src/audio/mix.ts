/**
 * Joins spoken lines into one conversation track with natural timing:
 * trimmed clip edges, varied gaps, interruptions that cut in early, and
 * short reactions ("Right.") that follow quickly.
 */
import { concatWav, resample, type Pcm } from './wav.js';

export interface MixLine {
  pcm: Pcm;
  speaker: string;
  text: string;
  overlap?: boolean;
}

/** Deterministic pseudo-random numbers so re-renders sound the same. */
function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

/** Drops leading/trailing near-silence, keeping a few ms so words aren't clipped. */
export function trimSilence(pcm: Pcm, threshold = 400, padMs = 30): Pcm {
  const { samples, sampleRate } = pcm;
  let start = 0;
  let end = samples.length - 1;
  while (start < end && Math.abs(samples[start] ?? 0) < threshold) start++;
  while (end > start && Math.abs(samples[end] ?? 0) < threshold) end--;
  const pad = Math.round((sampleRate * padMs) / 1000);
  return {
    sampleRate,
    samples: samples.slice(Math.max(0, start - pad), Math.min(samples.length, end + pad + 1)),
  };
}

/** Pause before a line, in ms (negative = starts before the previous line ends). */
export function gapBefore(previousText: string, random: () => number): number {
  const prev = previousText.trim();
  if (/[—–-]$/.test(prev)) return -180; // the next host cuts in
  if (prev.endsWith('?')) return 120 + random() * 120; // answers come quickly
  if (prev.endsWith('!')) return 150 + random() * 150;
  return 180 + random() * 270;
}

export function mixConversation(lines: MixLine[], seed = 1): Buffer {
  const first = lines[0];
  if (!first) throw new Error('No audio to join');
  const rate = first.pcm.sampleRate;
  const random = rng(seed);
  const ms = (n: number) => Math.round((rate * n) / 1000);

  const placed: { start: number; samples: Int16Array; gain: number }[] = [];
  let end = 0;
  let previousText = '';

  for (const line of lines) {
    const samples = trimSilence(resample(line.pcm, rate)).samples;
    // Short reactions ("Right.", "Oh, nice.") follow quickly, as their own turn: voiced
    // separately, they sound pasted on when laid over the other host's words.
    const reaction = line.overlap || line.text.trim().split(/\s+/).length <= 3;
    const normal = gapBefore(previousText, random);
    const gap = reaction ? Math.min(normal, 90 + random() * 90) : normal;
    const start = placed.length === 0 ? 0 : Math.max(0, end + ms(gap));
    placed.push({ start, samples, gain: 1 });
    end = start + samples.length;
    previousText = line.text;
  }

  const length = Math.max(...placed.map((p) => p.start + p.samples.length));
  const mix = new Float32Array(length);
  for (const p of placed) {
    for (let i = 0; i < p.samples.length; i++) {
      mix[p.start + i]! += (p.samples[i] ?? 0) * p.gain;
    }
  }
  const out = new Int16Array(length);
  for (let i = 0; i < length; i++) out[i] = Math.max(-32768, Math.min(32767, Math.round(mix[i]!)));
  return concatWav([{ sampleRate: rate, samples: out }], 0);
}
