/**
 * Joins spoken lines into one conversation track with natural timing:
 * trimmed clip edges, varied gaps, interruptions that cut in early, and
 * short backchannels ("Mm-hmm.") mixed under the end of the previous line.
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
  let mainEnd = 0; // end of the last main (non-overlapping) line
  let mainStart = 0;
  let mainSpeaker = '';
  let mainText = '';
  let floor = 0; // the next main line must not start before this

  for (const line of lines) {
    const samples = trimSilence(resample(line.pcm, rate)).samples;
    const canOverlap = line.overlap && placed.length > 0 && line.speaker !== mainSpeaker;
    if (canOverlap) {
      // Land the reaction near the end of the other host's line, at a lower volume.
      const lead = Math.min(ms(450), Math.round((mainEnd - mainStart) * 0.3));
      const start = Math.max(mainStart, mainEnd - lead - samples.length / 2);
      placed.push({ start: Math.round(start), samples, gain: 0.7 });
      floor = Math.max(floor, Math.round(start) + samples.length - ms(80));
      continue;
    }
    const start =
      placed.length === 0 ? 0 : Math.max(floor, mainEnd + ms(gapBefore(mainText, random)));
    placed.push({ start, samples, gain: 1 });
    mainStart = start;
    mainEnd = start + samples.length;
    mainSpeaker = line.speaker;
    mainText = line.text;
    floor = 0;
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
