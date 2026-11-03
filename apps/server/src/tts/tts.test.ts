import { describe, expect, it } from 'vitest';
import { assignVoices, parseEspeakVoices, parseSayVoices } from './index.js';

describe('voice parsing', () => {
  it('parses macOS say voices, including names with spaces', () => {
    const out = `Samantha            en_US    # Hello! My name is Samantha.
Grandma (English (US)) en_US    # Hello! My name is Grandma.
Daniel              en_GB    # Hello! My name is Daniel.`;
    expect(parseSayVoices(out)).toEqual(['Samantha', 'Grandma (English (US))', 'Daniel']);
  });

  it('parses espeak-ng voices', () => {
    const out = `Pty Language       Age/Gender VoiceName          File                 Other Languages
 2  en-gb           --/M      English_(Great_Britain) gmw/en               (en 2)
 2  en-us           --/M      English_(America)  gmw/en-US            (en 3)
 5  en-us           --/F      us-mbrola-1        mb/mb-us1            (en 8)
 5  variant         --/M      Storm              !v/Storm             (en-us 5)`;
    expect(parseEspeakVoices(out)).toEqual(['en-gb', 'en-us', 'en-gb+f3', 'en-us+f3']);
  });
});

describe('assignVoices', () => {
  it('keeps chosen voices and gives others distinct defaults', () => {
    expect(assignVoices(['', 'Daniel', ''], ['Daniel', 'Fred', 'Samantha'], ['Samantha'])).toEqual([
      'Samantha',
      'Daniel',
      'Fred',
    ]);
  });
});
