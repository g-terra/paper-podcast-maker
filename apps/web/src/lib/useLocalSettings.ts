import { useEffect, useState } from 'react';
import {
  PodcastSettingsSchema,
  defaultSettings,
  type PodcastSettings,
} from '@paper-podcast/shared';

// v3: Kokoro-only voices with speed, and Sonnet 5.5 as the default model.
const KEY = 'ppm.settings.v3';

/** Settings persisted in localStorage so they survive reloads. */
export function useLocalSettings() {
  const [settings, setSettings] = useState<PodcastSettings>(() => {
    try {
      const stored = PodcastSettingsSchema.safeParse(JSON.parse(localStorage.getItem(KEY) ?? ''));
      if (stored.success) return stored.data;
    } catch {
      // fall through to defaults
    }
    return defaultSettings;
  });

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(settings));
    } catch {
      // storage unavailable; settings just won't persist
    }
  }, [settings]);

  return [settings, setSettings] as const;
}
