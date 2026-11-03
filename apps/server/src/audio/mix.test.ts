import { describe, expect, it } from 'vitest';
import { gapBefore, mixConversation, trimSilence, type MixLine } from './mix.js';
import { readWav } from './wav.js';

const RATE = 1000; // 1 sample = 1 ms keeps the arithmetic readable
const tone = (ms: number, value = 1000) => ({
  sampleRate: RATE,
  samples: new Int16Array(ms).fill(value),
});
const line = (speaker: string, text: string, ms: number, overlap = false): MixLine => ({
  pcm: tone(ms),
  speaker,
  text,
  overlap,
});

describe('trimSilence', () => {
  it('cuts quiet edges but keeps a little padding', () => {
    const pcm = { sampleRate: RATE, samples: new Int16Array(300) };
    pcm.samples.fill(1000, 100, 200);
    expect(trimSilence(pcm, 400, 10).samples.length).toBe(120);
  });
});

describe('gapBefore', () => {
  const r = () => 0.5;
  it('lets interrupted lines overlap and answers come quickly', () => {
    expect(gapBefore('So the thing is—', r)).toBeLessThan(0);
    expect(gapBefore('Why does that work?', r)).toBeLessThan(gapBefore('It works.', r));
  });
});

describe('mixConversation', () => {
  it('places lines one after another with a pause', () => {
    const out = readWav(
      mixConversation([
        line('A', 'Hello and welcome back.', 1000),
        line('B', 'Thanks, good to be here.', 1000),
      ]),
    );
    // 2 s of speech plus a 180–450 ms pause (padding adds a few ms).
    expect(out.samples.length).toBeGreaterThan(2180);
    expect(out.samples.length).toBeLessThan(2520);
  });

  it('plays short reactions as a quick turn instead of over the other host', () => {
    const out = readWav(
      mixConversation([
        line('A', 'Hello there.', 1000),
        line('B', 'Right.', 200, true),
        line('A', 'More of it.', 1000),
      ]),
    );
    // Nothing overlaps, so no sample is louder than one voice.
    expect(Math.max(...out.samples)).toBe(1000);
    // 2.2 s of speech, a 90–180 ms gap before the reaction and a normal pause after it.
    expect(out.samples.length).toBeGreaterThan(2200 + 90 + 180);
    expect(out.samples.length).toBeLessThan(2200 + 180 + 450 + 30);
  });

  it('starts an interruption before the previous line ends', () => {
    const out = readWav(
      mixConversation([line('A', 'So the thing is—', 1000), line('B', 'Wait.', 1000)]),
    );
    expect(out.samples.length).toBeLessThan(2000);
  });
});
