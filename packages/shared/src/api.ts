import type { AiProviderId, ModelOption, PodcastSettings, TtsEngine } from './settings.js';
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

/** One entry of `GET /api/engines`. */
export interface TtsEngineStatus {
  id: TtsEngine;
  label: string;
  /** True when the engine can be used now (ElevenLabs needs an API key). */
  available: boolean;
  /** Runs in the cloud, so the script text leaves this machine. */
  cloud: boolean;
  /** Short note for the UI, e.g. why it isn't available. */
  detail?: string;
}

export interface EnginesResponse {
  engines: TtsEngineStatus[];
}

/** One voice, from `GET /api/voices?engine=…`. */
export interface Voice {
  /** Engine-specific id, e.g. Kokoro "af_heart". */
  id: string;
  /** Display name, e.g. "Heart". */
  name: string;
  gender: 'female' | 'male' | 'neutral';
  /** e.g. "American", "British"; may be empty. */
  accent: string;
  /** Extra description shown next to the name, e.g. "warm, narration". */
  description?: string;
}

export interface VoicesResponse {
  engine: TtsEngine;
  voices: Voice[];
  /** False until the Kokoro model has been downloaded (the first preview or episode does it). */
  modelReady: boolean;
}

/** Body of `POST /api/voices/preview`; the reply is a WAV file. */
export interface VoicePreviewRequest {
  engine?: TtsEngine;
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
