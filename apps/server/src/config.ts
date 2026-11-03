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
  /** Advertise the app on the local network as `<mdnsName>.local` (and listen beyond loopback). */
  mdns: boolean;
  mdnsName: string;
}

const truthy = (value: string | undefined) => /^(1|true|yes|on)$/i.test(value ?? '');

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const dataDir = resolve(env.PPM_DATA_DIR ?? join(homedir(), '.paper-podcast-maker'));
  const mdns = truthy(env.PPM_MDNS);
  return {
    // Bind to loopback by default: this server is only meant for the local UI.
    // mDNS mode is opt-in and listens on every interface so other devices can reach it.
    host: env.PPM_HOST ?? (mdns ? '0.0.0.0' : '127.0.0.1'),
    port: Number(env.PPM_PORT ?? 8787),
    dataDir,
    modelsDir: resolve(env.PPM_MODELS_DIR ?? join(dataDir, 'models')),
    piperVoicesDir: resolve(env.PPM_PIPER_VOICES_DIR ?? join(dataDir, 'piper-voices')),
    aiTimeoutMs: Number(env.PPM_AI_TIMEOUT_MS ?? 15 * 60 * 1000),
    mdns,
    mdnsName: env.PPM_MDNS_NAME ?? 'paper-podcast',
  };
}
