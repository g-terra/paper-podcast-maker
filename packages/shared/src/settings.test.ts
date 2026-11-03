import { describe, expect, it } from 'vitest';
import { PodcastSettingsSchema, defaultSettings } from './settings.js';
import { estimateMinutes, WORDS_PER_MINUTE } from './transcript.js';

describe('PodcastSettingsSchema', () => {
  it('accepts the defaults', () => {
    expect(PodcastSettingsSchema.safeParse(defaultSettings).success).toBe(true);
  });

  it('fills optional fields', () => {
    const { model, tone, ...rest } = defaultSettings;
    void model;
    void tone;
    const parsed = PodcastSettingsSchema.parse(rest);
    expect(parsed.model).toBe('');
    expect(parsed.tone).toBe('');
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

  it('rejects duplicate host names', () => {
    const host = defaultSettings.hosts[0]!;
    const result = PodcastSettingsSchema.safeParse({
      ...defaultSettings,
      hosts: [host, { ...host, name: host.name.toUpperCase() }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects odd model names', () => {
    const result = PodcastSettingsSchema.safeParse({ ...defaultSettings, model: 'x; rm -rf /' });
    expect(result.success).toBe(false);
  });
});

describe('estimateMinutes', () => {
  it('estimates from word count', () => {
    const text = Array.from({ length: WORDS_PER_MINUTE }, () => 'word').join(' ');
    expect(estimateMinutes({ lines: [{ speaker: 'Alex', text }] })).toBe(1);
  });
});
