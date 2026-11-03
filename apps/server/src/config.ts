import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

export interface ServerConfig {
  host: string;
  port: number;
  /** Where uploaded papers, transcripts and audio are stored. */
  dataDir: string;
  /** Cache for downloaded TTS models (Kokoro). */
  modelsDir: string;
  /** Folder scanned for Piper `.onnx` voice models. */
  piperVoicesDir: string;
  /** Upper bound for one AI CLI run, in milliseconds. */
  aiTimeoutMs: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const dataDir = resolve(env.PPM_DATA_DIR ?? join(homedir(), '.paper-podcast-maker'));
  return {
    // Bind to loopback by default: this server is only meant for the local UI.
    host: env.PPM_HOST ?? '127.0.0.1',
    port: Number(env.PPM_PORT ?? 8787),
    dataDir,
    modelsDir: resolve(env.PPM_MODELS_DIR ?? join(dataDir, 'models')),
    piperVoicesDir: resolve(env.PPM_PIPER_VOICES_DIR ?? join(dataDir, 'piper-voices')),
    aiTimeoutMs: Number(env.PPM_AI_TIMEOUT_MS ?? 15 * 60 * 1000),
  };
}
