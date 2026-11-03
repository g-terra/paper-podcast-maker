import { useRef, useState } from 'react';
import {
  PodcastSettingsSchema,
  hostPersonas,
  type Episode,
  type PodcastSettings,
  type ProviderStatus,
  type Voice,
} from '@paper-podcast/shared';
import { api } from '../lib/api';
import { useLocalSettings } from '../lib/useLocalSettings';
import { useVoicePreview } from '../lib/useVoicePreview';
import { Card, Segmented, Slider, buttonClass, inputClass } from './ui';

interface Props {
  providers: ProviderStatus[];
  voices: Voice[];
  modelReady: boolean;
  onCreated: (episode: Episode) => void;
}

const MAX_MINUTES = 60;

export function NewEpisodeForm({ providers, voices, modelReady, onCreated }: Props) {
  const [settings, setSettings] = useLocalSettings();
  const [paper, setPaper] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const preview = useVoicePreview();

  // Only offer script writers found on this machine; fall back if the saved one is missing.
  const available = providers.filter((p) => p.available);
  const provider = available.find((p) => p.id === settings.provider) ?? available[0];
  const models = provider?.models ?? [];
  const model = models.some((m) => m.id === settings.model)
    ? settings.model
    : (models[0]?.id ?? '');
  const effective: PodcastSettings = {
    ...settings,
    provider: provider?.id ?? settings.provider,
    model,
  };
  const validation = PodcastSettingsSchema.safeParse(effective);

  const update = <K extends keyof PodcastSettings>(key: K, value: PodcastSettings[K]) =>
    setSettings((s) => ({ ...s, [key]: value }));
  const updateHost = (i: number, patch: Partial<PodcastSettings['hosts'][number]>) =>
    update(
      'hosts',
      settings.hosts.map((h, j) => (j === i ? { ...h, ...patch } : h)),
    );

  const problems = [
    ...(available.length === 0
      ? ['No script writer found. Install the Claude Code or Codex CLI, then reload.']
      : []),
    ...(validation.success ? [] : validation.error.issues.map((i) => i.message)),
  ];
  const canSubmit = paper && problems.length === 0 && !submitting;

  function choosePaper(file: File | undefined) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
      setError('Please choose a PDF file.');
      return;
    }
    setError(null);
    setPaper(file);
  }

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
      <form className="space-y-7" onSubmit={submit}>
        {/* Paper */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => fileInput.current?.click()}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && fileInput.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            choosePaper(e.dataTransfer.files[0]);
          }}
          className={`cursor-pointer rounded-xl border-2 border-dashed p-6 text-center transition ${
            dragging
              ? 'border-indigo-500 bg-indigo-50'
              : paper
                ? 'border-emerald-300 bg-emerald-50'
                : 'border-slate-300 hover:border-indigo-400 hover:bg-slate-50'
          }`}
        >
          <input
            ref={fileInput}
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            onChange={(e) => choosePaper(e.target.files?.[0])}
          />
          {paper ? (
            <p className="text-sm">
              <span className="font-medium text-emerald-800">{paper.name}</span>
              <span className="block text-xs text-slate-500">
                Click to choose a different paper
              </span>
            </p>
          ) : (
            <p className="text-sm text-slate-600">
              <span className="font-medium text-indigo-700">Drop a paper here</span> or click to
              choose a PDF
            </p>
          )}
        </div>

        {/* Script writer */}
        <section className="space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Script writer
          </h3>
          {available.length > 0 && provider && (
            <div className="flex flex-wrap items-center gap-3">
              <Segmented
                label="Script writer"
                value={provider.id}
                options={available.map((p) => ({ value: p.id, label: p.label }))}
                onChange={(id) => {
                  const next = available.find((p) => p.id === id);
                  setSettings((s) => ({ ...s, provider: id, model: next?.models[0]?.id ?? '' }));
                }}
              />
              <select
                aria-label="Model"
                className={`${inputClass} w-auto`}
                value={model}
                onChange={(e) => update('model', e.target.value)}
              >
                {models.map((m) => (
                  <option key={m.id || 'default'} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
          )}
          {providers
            .filter((p) => !p.available)
            .map((p) => (
              <p key={p.id} className="text-xs text-slate-500">
                {p.label} isn't installed (<code>{p.command}</code> not found).
              </p>
            ))}
        </section>

        {/* Episode */}
        <section className="space-y-4">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Episode</h3>
          <Slider
            label="Shortest"
            value={settings.minMinutes}
            min={1}
            max={MAX_MINUTES}
            display={`${settings.minMinutes} min`}
            onChange={(v) =>
              setSettings((s) => ({ ...s, minMinutes: v, maxMinutes: Math.max(v, s.maxMinutes) }))
            }
          />
          <Slider
            label="Longest"
            value={settings.maxMinutes}
            min={1}
            max={MAX_MINUTES}
            display={`${settings.maxMinutes} min`}
            onChange={(v) =>
              setSettings((s) => ({ ...s, maxMinutes: v, minMinutes: Math.min(v, s.minMinutes) }))
            }
          />
          <Slider
            label="Speaking speed"
            value={settings.speed}
            min={0.7}
            max={1.3}
            step={0.05}
            display={`${settings.speed.toFixed(2)}×`}
            onChange={(v) => update('speed', v)}
          />
          <div className="space-y-1">
            <span className="text-sm font-medium">Audience</span>
            <div>
              <Segmented
                label="Audience"
                value={settings.audience}
                options={[
                  { value: 'general', label: 'Everyone' },
                  { value: 'student', label: 'Students' },
                  { value: 'expert', label: 'Experts' },
                ]}
                onChange={(v) => update('audience', v)}
              />
            </div>
          </div>
          <label className="block space-y-1">
            <span className="text-sm font-medium">Tone (optional)</span>
            <input
              className={inputClass}
              value={settings.tone}
              placeholder="e.g. light and playful, or calm and precise"
              onChange={(e) => update('tone', e.target.value)}
            />
          </label>
        </section>

        {/* Hosts */}
        <section className="space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Hosts</h3>
          {!modelReady && (
            <p className="text-xs text-slate-500">
              The first voice preview downloads the Kokoro voice model (about 90 MB, once), so it
              can take half a minute.
            </p>
          )}
          {settings.hosts.map((host, i) => {
            const persona = hostPersonas[host.persona];
            const key = `host-${i}`;
            const sample = `Hi, I'm ${host.name || 'your host'}. Welcome to the show!`;
            // Each personality has its own kind of voice: deep male or upbeat female.
            const choices = voices.filter((v) => v.gender === persona.gender);
            const autoVoice = choices.find((v) => v.id === persona.defaultVoice) ?? choices[0];
            const voiceId = host.voice || autoVoice?.id || '';
            const busy = preview.loading === key;
            const isPlaying = preview.playing === key;
            return (
              <div key={host.persona} className="space-y-2 rounded-xl border border-slate-200 p-3">
                <div>
                  <p className="text-sm font-semibold text-slate-800">{persona.label}</p>
                  <p className="text-xs leading-relaxed text-slate-500">{persona.description}</p>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <input
                    aria-label={`${persona.label} name`}
                    placeholder="Name"
                    className={inputClass}
                    value={host.name}
                    onChange={(e) => updateHost(i, { name: e.target.value })}
                  />
                  <div className="flex gap-2">
                    <select
                      aria-label={`${persona.label} voice`}
                      className={inputClass}
                      value={choices.some((v) => v.id === host.voice) ? host.voice : ''}
                      onChange={(e) => updateHost(i, { voice: e.target.value })}
                    >
                      <option value="">Default ({autoVoice?.name ?? 'any'})</option>
                      {(['American', 'British'] as const).map((accent) => (
                        <optgroup key={accent} label={accent}>
                          {choices
                            .filter((v) => v.accent === accent)
                            .map((v) => (
                              <option key={v.id} value={v.id}>
                                {v.name}
                              </option>
                            ))}
                        </optgroup>
                      ))}
                    </select>
                    <button
                      type="button"
                      aria-label={isPlaying ? 'Stop preview' : `Preview ${host.name}'s voice`}
                      title={isPlaying ? 'Stop' : 'Hear this voice'}
                      disabled={!voiceId || busy}
                      onClick={() =>
                        isPlaying
                          ? preview.stop()
                          : preview.play(key, voiceId, sample, settings.speed)
                      }
                      className="shrink-0 rounded-md bg-indigo-50 px-3 text-sm font-medium text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
                    >
                      {busy ? '…' : isPlaying ? '■' : '▶'}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
          {preview.error && <p className="text-sm text-red-700">Preview failed: {preview.error}</p>}
        </section>

        {problems.length > 0 && (
          <ul className="list-disc space-y-1 pl-5 text-sm text-red-700">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        )}
        {error && <p className="text-sm text-red-700">{error}</p>}

        <button type="submit" disabled={!canSubmit} className={`${buttonClass} w-full py-3`}>
          {submitting ? 'Uploading…' : paper ? 'Make the podcast' : 'Choose a paper first'}
        </button>
      </form>
    </Card>
  );
}
