import type { PodcastSettings, TtsEngineId, AiProviderId } from './settings.js';
import type { Transcript } from './transcript.js';

/** Response of `GET /api/health`. */
export interface HealthResponse {
  status: 'ok';
  /** Lets the `ppm` command recognise its own server on a port. */
  app: 'paper-podcast-maker';
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
}

export interface ProvidersResponse {
  providers: ProviderStatus[];
}

/** One entry of `GET /api/tts`. */
export interface TtsEngineStatus {
  id: TtsEngineId;
  label: string;
  available: boolean;
  /** Installed voices; empty when the engine is unavailable. */
  voices: string[];
  /** Short hint shown when the engine is missing or has no voices. */
  hint: string;
}

export interface TtsEnginesResponse {
  engines: TtsEngineStatus[];
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
