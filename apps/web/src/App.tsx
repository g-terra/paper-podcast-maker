import { useCallback, useEffect, useState } from 'react';
import type { Episode, ProviderStatus, TtsEngineStatus } from '@paper-podcast/shared';
import { api } from './lib/api';
import { NewEpisodeForm } from './components/NewEpisodeForm';
import { EpisodeView } from './components/EpisodeView';

type ServerState =
  | { kind: 'loading' }
  | { kind: 'offline' }
  | { kind: 'online'; providers: ProviderStatus[]; engines: TtsEngineStatus[] };

export function App() {
  const [server, setServer] = useState<ServerState>({ kind: 'loading' });
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(() => {
    Promise.all([api.providers(), api.engines(), api.episodes()])
      .then(([{ providers }, { engines }, { episodes }]) => {
        setServer({ kind: 'online', providers, engines });
        setEpisodes(episodes);
        setSelectedId((id) => id ?? episodes[0]?.id ?? null);
      })
      .catch(() => setServer({ kind: 'offline' }));
  }, []);

  useEffect(load, [load]);
  const retry = () => {
    setServer({ kind: 'loading' });
    load();
  };

  const upsert = useCallback((episode: Episode) => {
    setEpisodes((list) => {
      const rest = list.filter((e) => e.id !== episode.id);
      return [episode, ...rest].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    });
  }, []);

  // Poll episodes that are still being made.
  const pending = episodes.filter((e) => e.stage !== 'done' && e.stage !== 'failed');
  const pendingKey = pending.map((e) => e.id).join(',');
  useEffect(() => {
    if (!pendingKey) return;
    const timer = setInterval(() => {
      for (const id of pendingKey.split(','))
        api
          .episode(id)
          .then(upsert)
          .catch(() => {});
    }, 1500);
    return () => clearInterval(timer);
  }, [pendingKey, upsert]);

  const selected = episodes.find((e) => e.id === selectedId);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <main className="mx-auto max-w-6xl space-y-8 px-4 py-10">
        <header className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Paper Podcast Maker</h1>
          <p className="text-slate-600">
            Turn an academic paper into a podcast episode on your machine.
          </p>
        </header>

        {server.kind === 'loading' && (
          <p className="text-sm text-slate-500">Connecting to the local server…</p>
        )}
        {server.kind === 'offline' && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
            The local server isn't reachable. Start it with{' '}
            <code className="font-mono">pnpm dev</code> (or{' '}
            <code className="font-mono">pnpm start</code>), then{' '}
            <button className="underline" onClick={retry}>
              try again
            </button>
            .
          </div>
        )}

        {server.kind === 'online' && (
          <div className="grid gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
            <div className="space-y-6">
              <NewEpisodeForm
                providers={server.providers}
                engines={server.engines}
                onCreated={(ep) => {
                  upsert(ep);
                  setSelectedId(ep.id);
                }}
              />
              {episodes.length > 0 && (
                <nav className="space-y-2">
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                    Episodes
                  </h2>
                  <ul className="space-y-1">
                    {episodes.map((ep) => (
                      <li key={ep.id}>
                        <button
                          onClick={() => setSelectedId(ep.id)}
                          className={`w-full rounded-md px-3 py-2 text-left text-sm ${
                            ep.id === selectedId
                              ? 'bg-indigo-100 text-indigo-900'
                              : 'hover:bg-slate-100'
                          }`}
                        >
                          <span className="block truncate font-medium">
                            {ep.transcript?.title ?? ep.paperName}
                          </span>
                          <span className="text-xs text-slate-500">
                            {new Date(ep.createdAt).toLocaleString()} · {ep.stage}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </nav>
              )}
            </div>
            <div>
              {selected ? (
                <EpisodeView
                  key={selected.id}
                  episode={selected}
                  onChange={upsert}
                  onDeleted={(id) => {
                    setEpisodes((list) => list.filter((e) => e.id !== id));
                    setSelectedId(null);
                  }}
                />
              ) : (
                <div className="rounded-xl border border-dashed border-slate-300 p-10 text-center text-slate-500">
                  Choose a paper and press “Make the podcast”. Your episodes show up here.
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
