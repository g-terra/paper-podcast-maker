import type {
  Episode,
  EpisodesResponse,
  HealthResponse,
  PodcastSettings,
  ProvidersResponse,
  Transcript,
  VoicePreviewRequest,
  VoicesResponse,
} from '@paper-podcast/shared';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `${path} failed with ${res.status}`);
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

export const api = {
  health: () => request<HealthResponse>('/api/health'),
  providers: () => request<ProvidersResponse>('/api/providers'),
  voices: () => request<VoicesResponse>('/api/voices'),
  previewVoice: async (body: VoicePreviewRequest): Promise<Blob> => {
    const res = await fetch('/api/voices/preview', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new Error(err?.error ?? `Preview failed with ${res.status}`);
    }
    return res.blob();
  },
  episodes: () => request<EpisodesResponse>('/api/episodes'),
  episode: (id: string) => request<Episode>(`/api/episodes/${id}`),
  createEpisode: (paper: File, settings: PodcastSettings) => {
    const form = new FormData();
    form.append('settings', JSON.stringify(settings));
    form.append('paper', paper);
    return request<Episode>('/api/episodes', { method: 'POST', body: form });
  },
  updateTranscript: (id: string, transcript: Transcript) =>
    request<Episode>(`/api/episodes/${id}/transcript`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(transcript),
    }),
  deleteEpisode: (id: string) => request<void>(`/api/episodes/${id}`, { method: 'DELETE' }),
};
