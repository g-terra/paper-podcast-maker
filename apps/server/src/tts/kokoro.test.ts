import { describe, expect, it } from 'vitest';
import { floatTo16, kokoroInstalled, kokoroVoices } from './kokoro.js';
import { assignVoices, preferredVoices } from './index.js';

describe('kokoro', () => {
  it('is installed and lists its bundled voices without loading the model', async () => {
    expect(kokoroInstalled()).toBe(true);
    const voices = await kokoroVoices();
    expect(voices).toContain('af_heart');
    expect(voices).toContain('am_michael');
  });

  it('gives two auto hosts a woman and a man', async () => {
    const voices = await kokoroVoices();
    expect(assignVoices(['', ''], voices, preferredVoices.kokoro)).toEqual([
      'af_heart',
      'am_michael',
    ]);
  });

  it('converts float samples to 16-bit PCM with clipping', () => {
    expect([...floatTo16(Float32Array.from([0, 1, -1, 2, -2, 0.5]))]).toEqual([
      0, 32767, -32768, 32767, -32768, 16384,
    ]);
  });
});
