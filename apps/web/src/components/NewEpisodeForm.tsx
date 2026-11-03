import { useState } from 'react';
import {
  PodcastSettingsSchema,
  type Episode,
  type PodcastSettings,
  type ProviderStatus,
  type TtsEngineStatus,
} from '@paper-podcast/shared';
import { api } from '../lib/api';
import { useLocalSettings } from '../lib/useLocalSettings';
import { Card, Field, buttonClass, inputClass, secondaryButtonClass } from './ui';

interface Props {
  providers: ProviderStatus[];
  engines: TtsEngineStatus[];
  onCreated: (episode: Episode) => void;
}

export function NewEpisodeForm({ providers, engines, onCreated }: Props) {
  const [settings, setSettings] = useLocalSettings();
  const [paper, setPaper] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // If the saved choice isn't installed here, fall back to one that is.
  const providerId = providers.find((p) => p.id === settings.provider)?.available
    ? settings.provider
    : (providers.find((p) => p.available)?.id ?? settings.provider);
  const engineId = engines.find((e) => e.id === settings.ttsEngine)?.available
    ? settings.ttsEngine
    : (engines.find((e) => e.available)?.id ?? settings.ttsEngine);
  const effective: PodcastSettings = { ...settings, provider: providerId, ttsEngine: engineId };

  const validation = PodcastSettingsSchema.safeParse(effective);
  const provider = providers.find((p) => p.id === providerId);
  const engine = engines.find((e) => e.id === engineId);

  const update = <K extends keyof PodcastSettings>(key: K, value: PodcastSettings[K]) =>
    setSettings((s) => ({ ...s, [key]: value }));
  const updateHost = (i: number, patch: Partial<PodcastSettings['hosts'][number]>) =>
    update(
      'hosts',
      settings.hosts.map((h, j) => (j === i ? { ...h, ...patch } : h)),
    );

  const problems = [
    ...(validation.success ? [] : validation.error.issues.map((i) => i.message)),
    ...(provider && !provider.available
      ? [`${provider.label} was not found on this machine.`]
      : []),
    ...(engine && !engine.available ? [`${engine.label} is not available on this machine.`] : []),
  ];
  const canSubmit = paper && problems.length === 0 && !submitting;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!paper || !validation.success) return;
    setSubmitting(true);
    setError(null);
    try {
      onCreated(await api.createEpisode(paper, validation.data));
      setPaper(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card title="New episode">
      <form className="space-y-6" onSubmit={submit}>
        <Field label="Paper (PDF)">
          <input
            type="file"
            accept="application/pdf,.pdf"
            className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-indigo-50 file:px-3 file:py-2 file:text-indigo-700"
            onChange={(e) => setPaper(e.target.files?.[0] ?? null)}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Script writer">
            <select
              className={inputClass}
              value={providerId}
              onChange={(e) => update('provider', e.target.value as PodcastSettings['provider'])}
            >
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                  {p.available ? '' : ' (not found)'}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Model (optional)" hint="Leave empty to use the CLI's default model.">
            <input
              className={inputClass}
              value={settings.model}
              placeholder={providerId === 'claude' ? 'e.g. sonnet' : 'e.g. gpt-5'}
              onChange={(e) => update('model', e.target.value)}
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Min length (minutes)">
            <input
              type="number"
              min={1}
              className={inputClass}
              value={settings.minMinutes}
              onChange={(e) => update('minMinutes', Number(e.target.value))}
            />
          </Field>
          <Field label="Max length (minutes)">
            <input
              type="number"
              min={1}
              className={inputClass}
              value={settings.maxMinutes}
              onChange={(e) => update('maxMinutes', Number(e.target.value))}
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Audience">
            <select
              className={inputClass}
              value={settings.audience}
              onChange={(e) => update('audience', e.target.value as PodcastSettings['audience'])}
            >
              <option value="general">General public</option>
              <option value="student">Students</option>
              <option value="expert">Experts</option>
            </select>
          </Field>
          <Field label="Tone (optional)">
            <input
              className={inputClass}
              value={settings.tone}
              placeholder="e.g. light and playful, or calm and precise"
              onChange={(e) => update('tone', e.target.value)}
            />
          </Field>
        </div>

        <Field
          label="Voice engine"
          hint={
            engine && (!engine.available || engine.voices.length === 0) ? engine.hint : undefined
          }
        >
          <select
            className={inputClass}
            value={engineId}
            onChange={(e) => update('ttsEngine', e.target.value as PodcastSettings['ttsEngine'])}
          >
            {engines.map((e) => (
              <option key={e.id} value={e.id}>
                {e.label}
                {e.available ? ` (${e.voices.length} voices)` : ' (not available)'}
              </option>
            ))}
          </select>
        </Field>

        <fieldset className="space-y-3">
          <div className="flex items-center justify-between">
            <legend className="text-sm font-medium">Hosts</legend>
            <button
              type="button"
              className={secondaryButtonClass}
              disabled={settings.hosts.length >= 4}
              onClick={() =>
                update('hosts', [
                  ...settings.hosts,
                  { name: `Host ${settings.hosts.length + 1}`, role: 'Co-host', voice: '' },
                ])
              }
            >
              Add host
            </button>
          </div>
          {settings.hosts.map((host, i) => (
            <div key={i} className="space-y-2 rounded-lg border border-slate-200 p-3">
              <div className="grid gap-2 sm:grid-cols-2">
                <input
                  aria-label={`Host ${i + 1} name`}
                  placeholder="Name"
                  className={inputClass}
                  value={host.name}
                  onChange={(e) => updateHost(i, { name: e.target.value })}
                />
                <select
                  aria-label={`Host ${i + 1} voice`}
                  className={inputClass}
                  value={host.voice}
                  onChange={(e) => updateHost(i, { voice: e.target.value })}
                >
                  <option value="">Auto voice</option>
                  {host.voice && !engine?.voices.includes(host.voice) && (
                    <option value={host.voice}>{host.voice} (not installed)</option>
                  )}
                  {engine?.voices.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2">
                <input
                  aria-label={`Host ${i + 1} role`}
                  placeholder="Role in the conversation"
                  className={inputClass}
                  value={host.role}
                  onChange={(e) => updateHost(i, { role: e.target.value })}
                />
                <button
                  type="button"
                  className={secondaryButtonClass}
                  disabled={settings.hosts.length <= 1}
                  onClick={() =>
                    update(
                      'hosts',
                      settings.hosts.filter((_, j) => j !== i),
                    )
                  }
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </fieldset>

        {problems.length > 0 && (
          <ul className="list-disc space-y-1 pl-5 text-sm text-red-700">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        )}
        {error && <p className="text-sm text-red-700">{error}</p>}

        <button type="submit" disabled={!canSubmit} className={buttonClass}>
          {submitting ? 'Uploading…' : paper ? 'Make the podcast' : 'Choose a paper first'}
        </button>
      </form>
    </Card>
  );
}
