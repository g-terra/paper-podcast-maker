import { describe, expect, it } from 'vitest';
import { concatWav, readWav, resample } from './wav.js';

describe('wav', () => {
  it('round-trips and joins clips with a gap', () => {
    const a = { sampleRate: 1000, samples: Int16Array.from([1, 2, 3]) };
    const b = { sampleRate: 1000, samples: Int16Array.from([4, 5]) };
    const joined = readWav(concatWav([a, b], 2));
    expect(joined.sampleRate).toBe(1000);
    expect([...joined.samples]).toEqual([1, 2, 3, 0, 0, 4, 5]);
  });

  it('resamples to the first clip rate', () => {
    const a = { sampleRate: 1000, samples: new Int16Array(10) };
    const b = { sampleRate: 2000, samples: new Int16Array(20).fill(100) };
    const joined = readWav(concatWav([a, b], 0));
    expect(joined.samples.length).toBe(20);
  });

  it('downmixes stereo', () => {
    const buf = concatWav([{ sampleRate: 8, samples: Int16Array.from([10, 20]) }], 0);
    // Rewrite the header as stereo with one frame (10, 20).
    buf.writeUInt16LE(2, 22);
    expect([...readWav(buf).samples]).toEqual([15]);
  });

  it('interpolates when resampling', () => {
    const out = resample({ sampleRate: 1, samples: Int16Array.from([0, 100]) }, 2);
    expect([...out.samples]).toEqual([0, 50, 100, 100]);
  });
});
