import { describe, expect, it } from 'vitest';
import { parseCodexDefault, parseCodexModels } from './index.js';
import { cleanEnv } from '../run.js';

describe('codex models', () => {
  it('keeps listed models in priority order', () => {
    const out = JSON.stringify({
      models: [
        { slug: 'b', display_name: 'B', visibility: 'list', priority: 2 },
        { slug: 'hidden', visibility: 'hide', priority: 0 },
        { slug: 'a', display_name: 'A', visibility: 'list', priority: 1 },
      ],
    });
    expect(parseCodexModels(out)).toEqual([
      { id: 'a', label: 'A' },
      { id: 'b', label: 'B' },
    ]);
  });

  it('reads the configured default', () => {
    expect(parseCodexDefault('model_reasoning_effort = "medium"\nmodel = "gpt-x"\n')).toBe('gpt-x');
    expect(parseCodexDefault('')).toBeUndefined();
  });
});

describe('cleanEnv', () => {
  it('drops parent Claude Code session variables only', () => {
    expect(
      cleanEnv({
        CLAUDECODE: '1',
        CLAUDE_CODE_ENTRYPOINT: 'x',
        CLAUDE_CODE_USE_BEDROCK: '1',
        PATH: '/bin',
      }),
    ).toEqual({
      CLAUDE_CODE_USE_BEDROCK: '1',
      PATH: '/bin',
    });
  });
});
