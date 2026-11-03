import { useEffect, useState } from 'react';
import {
  PodcastSettingsSchema,
  defaultSettings,
  type PodcastSettings,
} from '@paper-podcast/shared';

// v4: two fixed host personalities (anchor and explainer) instead of free-text roles.
const KEY = 'ppm.settings.v4';

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
