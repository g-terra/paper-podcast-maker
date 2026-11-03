import { useEffect, useState } from 'react';
import type { ProviderStatus } from '@paper-podcast/shared';
import { api } from '../lib/api';

type State =
  { kind: 'loading' } | { kind: 'offline' } | { kind: 'online'; providers: ProviderStatus[] };

export function ServerStatus() {
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.health(), api.providers()])
      .then(([, { providers }]) => !cancelled && setState({ kind: 'online', providers }))
      .catch(() => !cancelled && setState({ kind: 'offline' }));
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.kind === 'loading') {
    return <p className="text-sm text-slate-500">Checking local server…</p>;
  }
  if (state.kind === 'offline') {
    return (
      <p className="text-sm text-amber-700">
        Local server not reachable. Start it with <code className="font-mono">pnpm dev</code>.
      </p>
    );
  }
  return (
    <ul className="flex flex-wrap gap-2 text-sm">
      {state.providers.map((p) => (
        <li
          key={p.id}
          className={`rounded-full px-3 py-1 ${
            p.available ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'
          }`}
        >
          {p.label}: {p.available ? 'found' : 'not found'}
        </li>
      ))}
    </ul>
  );
}
