import type { AiProviderId } from './settings.js';

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
}

export interface ProvidersResponse {
  providers: ProviderStatus[];
}
