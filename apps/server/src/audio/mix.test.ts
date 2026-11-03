import { describe, expect, it } from 'vitest';
import { gapBefore, mixConversation, pauseForReaction, trimSilence, type MixLine } from './mix.js';
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

describe('pauseForReaction', () => {
  it('finds a breath in the second half, and nothing in continuous speech', () => {
    const speech = new Int16Array(3000).fill(1000);
    speech.fill(0, 2000, 2250);
    expect(pauseForReaction(speech, RATE)).toBe(2060);
    expect(pauseForReaction(new Int16Array(3000).fill(1000), RATE)).toBeNull();
  });
});

describe('mixConversation', () => {
  it('places lines one after another with a pause', () => {
    const out = readWav(mixConversation([line('A', 'Hello.', 1000), line('B', 'Hi.', 1000)]));
    // 2 s of speech plus a 180–450 ms pause (padding adds a few ms).
    expect(out.samples.length).toBeGreaterThan(2180);
    expect(out.samples.length).toBeLessThan(2520);
  });

  it('mixes a backchannel under the end of the previous line', () => {
    const solo = readWav(mixConversation([line('A', 'Hello.', 1000), line('A', 'More.', 1000)]));
    const withReaction = readWav(
      mixConversation([
        line('A', 'Hello.', 1000),
        line('B', 'Right.', 200, true),
        line('A', 'More.', 1000),
      ]),
    );
    // The reaction overlaps instead of adding its own 200 ms.
    expect(withReaction.samples.length).toBeLessThan(solo.samples.length + 200);
    // Somewhere the two voices add up.
    expect(Math.max(...withReaction.samples)).toBeGreaterThan(1000);
  });

  it('slips a backchannel into a pause in the previous line', () => {
    // 1.3 s of speech, a 300 ms breath, then 1 s more.
    const speech = new Int16Array(2600).fill(1000);
    speech.fill(0, 1300, 1600);
    const out = readWav(
      mixConversation([
        { pcm: { sampleRate: RATE, samples: speech }, speaker: 'A', text: 'One. Two.' },
        line('B', 'Right.', 200, true),
      ]),
    );
    // The reaction (700 after gain) sits in the breath, not on top of the speech.
    expect(out.samples[1400]).toBe(700);
    expect(Math.max(...out.samples)).toBe(1000);
  });

  it('starts an interruption before the previous line ends', () => {
    const out = readWav(
      mixConversation([line('A', 'So the thing is—', 1000), line('B', 'Wait.', 1000)]),
    );
    expect(out.samples.length).toBeLessThan(2000);
  });
});
