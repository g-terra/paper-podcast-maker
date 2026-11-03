import { describe, expect, it } from 'vitest';
import { defaultSettings } from '@paper-podcast/shared';
import { buildTranscriptPrompt, MAX_PAPER_CHARS, parseTranscript, wordTargets } from './prompt.js';

describe('buildTranscriptPrompt', () => {
  it('includes hosts, word budget and the paper', () => {
    const prompt = buildTranscriptPrompt('PAPER BODY', defaultSettings);
    const { min, max } = wordTargets(defaultSettings);
    expect(prompt).toContain('- Alex:');
    expect(prompt).toContain(`between ${min} and ${max} words`);
    expect(prompt).toContain('PAPER BODY');
  });

  it('truncates very long papers', () => {
    const prompt = buildTranscriptPrompt('x'.repeat(MAX_PAPER_CHARS + 10), defaultSettings);
    expect(prompt).toContain('[Paper truncated for length.]');
  });
});

describe('parseTranscript', () => {
  it('reads JSON surrounded by chatter and normalises speaker case', () => {
    const out = parseTranscript(
      'Here you go:\n{"title":"T","lines":[{"speaker":"alex","text":"Hi"}]}\nEnjoy!',
      defaultSettings,
    );
    expect(out.lines[0]).toEqual({ speaker: 'Alex', text: 'Hi' });
  });

  it('flattens chapters, keeping each title on its first line, and keeps the summary', () => {
    const out = parseTranscript(
      JSON.stringify({
        title: 'Focus',
        summary: 'Where you aim your attention changes how you learn.',
        chapters: [
          {
            title: 'Why Focus Matters',
            lines: [
              { speaker: 'Alex', text: 'Picture this.' },
              { speaker: 'Sam', text: 'Wild idea.' },
            ],
          },
          { title: 'Three Takeaways', lines: [{ speaker: 'Alex', text: 'First, focus out.' }] },
        ],
      }),
      defaultSettings,
    );
    expect(out).toEqual({
      title: 'Focus',
      summary: 'Where you aim your attention changes how you learn.',
      lines: [
        { speaker: 'Alex', text: 'Picture this.', chapter: 'Why Focus Matters' },
        { speaker: 'Sam', text: 'Wild idea.' },
        { speaker: 'Alex', text: 'First, focus out.', chapter: 'Three Takeaways' },
      ],
    });
  });

  it('asks for chapters, a summary and a closing with takeaways', () => {
    const prompt = buildTranscriptPrompt('paper', defaultSettings);
    expect(prompt).toContain('"chapters"');
    expect(prompt).toContain('"summary"');
    expect(prompt).toMatch(/takeaways/);
  });

  it('rejects unknown speakers', () => {
    expect(() =>
      parseTranscript('{"title":"T","lines":[{"speaker":"Bob","text":"Hi"}]}', defaultSettings),
    ).toThrow(/unknown speaker/);
  });
});
