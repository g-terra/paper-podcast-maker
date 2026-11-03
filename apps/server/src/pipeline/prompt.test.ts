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

  it('rejects unknown speakers', () => {
    expect(() =>
      parseTranscript('{"title":"T","lines":[{"speaker":"Bob","text":"Hi"}]}', defaultSettings),
    ).toThrow(/unknown speaker/);
  });
});
