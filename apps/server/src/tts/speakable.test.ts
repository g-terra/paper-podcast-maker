import { describe, expect, it } from 'vitest';
import { speakable } from './kokoro.js';

describe('speakable', () => {
  it('turns sounds the phonemizer spells out into words', () => {
    expect(speakable('Mm-hmm.')).toBe('Yeah.');
    expect(speakable('Mhm, right.')).toBe('Yeah, right.');
    expect(speakable('Uh-huh. And then?')).toBe('Yeah. And then?');
    expect(speakable('Hm. Mm, I see.')).toBe('Hmm. Hmm, I see.');
    expect(speakable('and mm-hm, sure')).toBe('and yeah, sure');
  });

  it('leaves real words alone', () => {
    expect(speakable('Hmm. Right. Yeah, humm... hummus and mmWave.')).toBe(
      'Hmm. Right. Yeah, humm... hummus and mmWave.',
    );
  });
});

describe('speakable cues', () => {
  it('drops ElevenLabs emotion cues so Kokoro does not read them out', () => {
    expect(speakable('[laughs] Okay, fair. [sighs] Fine.')).toBe('Okay, fair. Fine.');
  });
});
