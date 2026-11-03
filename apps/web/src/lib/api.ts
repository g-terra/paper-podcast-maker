import type { HealthResponse, ProvidersResponse } from '@paper-podcast/shared';

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${path} failed with ${res.status}`);
  return (await res.json()) as T;
}

export const api = {
  health: () => getJson<HealthResponse>('/api/health'),
  providers: () => getJson<ProvidersResponse>('/api/providers'),
};
