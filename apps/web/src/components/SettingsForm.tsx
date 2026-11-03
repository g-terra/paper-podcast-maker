import { useState } from 'react';
import {
  PodcastSettingsSchema,
  aiProviderIds,
  defaultSettings,
  type PodcastSettings,
} from '@paper-podcast/shared';

const inputClass =
  'w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500';

export function SettingsForm() {
  const [settings, setSettings] = useState<PodcastSettings>(defaultSettings);
  const validation = PodcastSettingsSchema.safeParse(settings);

  const update = <K extends keyof PodcastSettings>(key: K, value: PodcastSettings[K]) =>
    setSettings((s) => ({ ...s, [key]: value }));

  return (
    <form className="space-y-6" onSubmit={(e) => e.preventDefault()}>
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="space-y-1">
          <span className="text-sm font-medium">AI provider</span>
          <select
            className={inputClass}
            value={settings.provider}
            onChange={(e) => update('provider', e.target.value as PodcastSettings['provider'])}
          >
            {aiProviderIds.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-sm font-medium">Min length (min)</span>
          <input
            type="number"
            min={1}
            className={inputClass}
            value={settings.minMinutes}
            onChange={(e) => update('minMinutes', Number(e.target.value))}
          />
        </label>
        <label className="space-y-1">
          <span className="text-sm font-medium">Max length (min)</span>
          <input
            type="number"
            min={1}
            className={inputClass}
            value={settings.maxMinutes}
            onChange={(e) => update('maxMinutes', Number(e.target.value))}
          />
        </label>
      </div>

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">Hosts</legend>
        {settings.hosts.map((host, i) => (
          <div key={i} className="grid gap-2 sm:grid-cols-3">
            {(['name', 'role', 'voice'] as const).map((field) => (
              <input
                key={field}
                aria-label={`Host ${i + 1} ${field}`}
                placeholder={field}
                className={inputClass}
                value={host[field]}
                onChange={(e) =>
                  update(
                    'hosts',
                    settings.hosts.map((h, j) => (j === i ? { ...h, [field]: e.target.value } : h)),
                  )
                }
              />
            ))}
          </div>
        ))}
      </fieldset>

      {!validation.success && (
        <ul className="list-disc space-y-1 pl-5 text-sm text-red-700">
          {validation.error.issues.map((issue) => (
            <li key={issue.path.join('.') + issue.message}>{issue.message}</li>
          ))}
        </ul>
      )}

      <button
        type="submit"
        disabled
        title="Transcript generation is not wired up yet"
        className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
      >
        Generate podcast
      </button>
    </form>
  );
}
