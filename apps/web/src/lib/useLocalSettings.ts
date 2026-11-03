import { useEffect, useState } from 'react';
import {
  PodcastSettingsSchema,
  defaultSettings,
  type PodcastSettings,
} from '@paper-podcast/shared';

// v2: Kokoro became the default voice engine.
const KEY = 'ppm.settings.v2';

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
