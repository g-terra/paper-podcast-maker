import type { AiProviderId, ModelOption, PodcastSettings } from './settings.js';
import type { Transcript } from './transcript.js';

/** Response of `GET /api/health`. */
export interface HealthResponse {
  status: 'ok';
  version: string;
}

/** One entry of `GET /api/providers`. */
export interface ProviderStatus {
  id: AiProviderId;
  label: string;
  /** CLI binary the server looks for on PATH. */
  command: string;
  /** Whether the CLI was found on this machine. */
  available: boolean;
  /** Models to offer; the first is the default. */
  models: ModelOption[];
}

export interface ProvidersResponse {
  providers: ProviderStatus[];
}

/** One Kokoro voice, from `GET /api/voices`. */
export interface Voice {
  /** Kokoro id, e.g. "af_heart". */
  id: string;
  /** Display name, e.g. "Heart". */
  name: string;
  gender: 'female' | 'male';
  accent: 'American' | 'British';
}

export interface VoicesResponse {
  voices: Voice[];
  /** False until the Kokoro model has been downloaded (the first preview or episode does it). */
  modelReady: boolean;
}

/** Body of `POST /api/voices/preview`; the reply is a WAV file. */
export interface VoicePreviewRequest {
  voice: string;
  text?: string;
  speed?: number;
}

export const episodeStages = [
  'queued',
  'extracting',
  'writing',
  'speaking',
  'done',
  'failed',
] as const;
export type EpisodeStage = (typeof episodeStages)[number];

/** Response of `GET /api/episodes/:id` and entries of `GET /api/episodes`. */
export interface Episode {
  id: string;
  paperName: string;
  createdAt: string;
  stage: EpisodeStage;
  /** Human-readable progress detail, e.g. "Voicing line 12 of 40". */
  detail: string;
  error?: string;
  settings: PodcastSettings;
  transcript?: Transcript;
  /** Estimated spoken length of the transcript, in minutes. */
  estimatedMinutes?: number;
  /** Set once audio has been rendered. */
  audioUrl?: string;
}

export interface EpisodesResponse {
  episodes: Episode[];
}
