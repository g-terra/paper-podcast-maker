import { describe, expect, it } from 'vitest';
import { PodcastSettingsSchema, defaultSettings } from './settings.js';
import { estimateMinutes, WORDS_PER_MINUTE } from './transcript.js';

describe('PodcastSettingsSchema', () => {
  it('accepts the defaults', () => {
    expect(PodcastSettingsSchema.safeParse(defaultSettings).success).toBe(true);
  });

  it('rejects a minimum longer than the maximum', () => {
    const result = PodcastSettingsSchema.safeParse({
      ...defaultSettings,
      minMinutes: 20,
      maxMinutes: 10,
    });
    expect(result.success).toBe(false);
  });

  it('requires at least one host', () => {
    const result = PodcastSettingsSchema.safeParse({ ...defaultSettings, hosts: [] });
    expect(result.success).toBe(false);
  });
});

describe('estimateMinutes', () => {
  it('estimates from word count', () => {
    const text = Array.from({ length: WORDS_PER_MINUTE }, () => 'word').join(' ');
    expect(estimateMinutes({ lines: [{ speaker: 'Alex', text }] })).toBe(1);
  });
});
