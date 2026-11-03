import { describe, expect, it } from 'vitest';
import { claudeErrorText } from './index.js';

describe('claudeErrorText', () => {
  it('pulls the message out of a failed JSON reply', () => {
    const out = JSON.stringify({
      is_error: true,
      result: 'Failed to authenticate: OAuth session expired and could not be refreshed',
      usage: { input_tokens: 0 },
    });
    expect(claudeErrorText(out)).toBe(
      'Failed to authenticate: OAuth session expired and could not be refreshed',
    );
  });

  it('ignores output that is not JSON', () => {
    expect(claudeErrorText('boom')).toBeUndefined();
  });
});
