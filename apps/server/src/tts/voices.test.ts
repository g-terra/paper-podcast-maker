import { describe, expect, it } from 'vitest';
import { assignVoices, describeVoice, listVoices } from './index.js';

describe('voices', () => {
  it('describes voice ids', () => {
    expect(describeVoice('am_michael')).toEqual({
      id: 'am_michael',
      name: 'Michael',
      gender: 'male',
      accent: 'American',
    });
    expect(describeVoice('bf_emma')).toMatchObject({ gender: 'female', accent: 'British' });
  });

  it('lists preferred voices first', async () => {
    const voices = await listVoices();
    expect(voices.slice(0, 2).map((v) => v.id)).toEqual(['af_heart', 'am_michael']);
  });

  it('keeps chosen voices and gives others distinct defaults', () => {
    expect(assignVoices(['', 'af_heart', ''], ['af_heart', 'am_michael', 'bf_emma'])).toEqual([
      'am_michael',
      'af_heart',
      'bf_emma',
    ]);
  });
});
