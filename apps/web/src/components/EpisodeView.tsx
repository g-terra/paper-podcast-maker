import { useState } from 'react';
import type { Episode, Transcript } from '@paper-podcast/shared';
import { api } from '../lib/api';
import { Card, buttonClass, secondaryButtonClass } from './ui';

const stageLabel: Record<Episode['stage'], string> = {
  queued: 'Queued',
  extracting: 'Reading the paper',
  writing: 'Writing the script',
  speaking: 'Recording voices',
  done: 'Ready',
  failed: 'Failed',
};

interface Props {
  episode: Episode;
  onChange: (episode: Episode) => void;
  onDeleted: (id: string) => void;
}

export function EpisodeView({ episode, onChange, onDeleted }: Props) {
  const busy = episode.stage !== 'done' && episode.stage !== 'failed';
  const [draft, setDraft] = useState<Transcript | null>(null);
  const [error, setError] = useState<string | null>(null);
  const transcript = draft ?? episode.transcript;

  async function saveAndRerender() {
    if (!draft) return;
    setError(null);
    try {
      onChange(await api.updateTranscript(episode.id, draft));
      setDraft(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function remove() {
    if (!confirm('Delete this episode and its files?')) return;
    try {
      await api.deleteEpisode(episode.id);
      onDeleted(episode.id);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <Card
      title={episode.transcript?.title ?? episode.paperName}
      actions={
        <button className={secondaryButtonClass} onClick={remove} disabled={busy}>
          Delete
        </button>
      }
    >
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span
          className={`rounded-full px-3 py-1 font-medium ${
            episode.stage === 'done'
              ? 'bg-emerald-100 text-emerald-800'
              : episode.stage === 'failed'
                ? 'bg-red-100 text-red-800'
                : 'animate-pulse bg-indigo-100 text-indigo-800'
          }`}
        >
          {stageLabel[episode.stage]}
        </span>
        {busy && <span className="text-slate-600">{episode.detail}</span>}
        {episode.estimatedMinutes !== undefined && (
          <span className="text-slate-500">
            About {episode.estimatedMinutes.toFixed(1)} min (target {episode.settings.minMinutes}–
            {episode.settings.maxMinutes})
          </span>
        )}
        <span className="text-slate-400">{episode.paperName}</span>
      </div>

      {episode.error && (
        <p className="whitespace-pre-wrap rounded-md bg-red-50 p-3 text-sm text-red-800">
          {episode.error}
        </p>
      )}

      {episode.audioUrl && !busy && (
        <div className="space-y-2">
          <audio controls className="w-full" src={episode.audioUrl} />
          <a className="text-sm text-indigo-700 underline" href={episode.audioUrl} download>
            Download audio (WAV)
          </a>
        </div>
      )}

      {transcript && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-medium">Transcript</h3>
            {draft && (
              <div className="flex gap-2">
                <button className={secondaryButtonClass} onClick={() => setDraft(null)}>
                  Discard edits
                </button>
                <button className={buttonClass} onClick={saveAndRerender} disabled={busy}>
                  Save and re-record
                </button>
              </div>
            )}
          </div>
          {error && <p className="text-sm text-red-700">{error}</p>}
          <ol className="space-y-3">
            {transcript.lines.map((line, i) => (
              <li key={i} className="grid gap-1 sm:grid-cols-[6rem_1fr]">
                <span className="text-sm font-semibold text-indigo-700">{line.speaker}</span>
                <textarea
                  className="w-full resize-y rounded-md border border-transparent bg-transparent p-1 text-sm leading-relaxed hover:border-slate-200 focus:border-indigo-400 focus:bg-white focus:outline-none"
                  rows={Math.max(2, Math.ceil(line.text.length / 90))}
                  value={line.text}
                  disabled={busy}
                  onChange={(e) =>
                    setDraft({
                      ...transcript,
                      lines: transcript.lines.map((l, j) =>
                        j === i ? { ...l, text: e.target.value } : l,
                      ),
                    })
                  }
                />
              </li>
            ))}
          </ol>
        </div>
      )}
    </Card>
  );
}
