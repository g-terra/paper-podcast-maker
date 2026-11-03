import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

export interface ServerConfig {
  host: string;
  port: number;
  /** Where uploaded papers, transcripts and audio are stored. */
  dataDir: string;
  /** Folder scanned for Piper `.onnx` voice models. */
  piperVoicesDir: string;
  /** Upper bound for one AI CLI run, in milliseconds. */
  aiTimeoutMs: number;
}

/** Reads `--port 1234` / `--port=1234` from the command line, if given. */
export function portFromArgs(argv: string[]): string | undefined {
  for (const [i, arg] of argv.entries()) {
    if (arg === '--port' || arg === '-p') return argv[i + 1];
    if (arg.startsWith('--port=')) return arg.slice('--port='.length);
  }
  return undefined;
}

export function loadConfig(
  env: NodeJS.ProcessEnv = process.env,
  argv: string[] = process.argv.slice(2),
): ServerConfig {
  const port = Number(portFromArgs(argv) ?? env.PPM_PORT ?? 8787);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`Invalid port: ${portFromArgs(argv) ?? env.PPM_PORT}`);
  }
  const dataDir = resolve(env.PPM_DATA_DIR ?? join(homedir(), '.paper-podcast-maker'));
  return {
    // Bind to loopback by default: this server is only meant for the local UI.
    host: env.PPM_HOST ?? '127.0.0.1',
    port,
    dataDir,
    piperVoicesDir: resolve(env.PPM_PIPER_VOICES_DIR ?? join(dataDir, 'piper-voices')),
    aiTimeoutMs: Number(env.PPM_AI_TIMEOUT_MS ?? 15 * 60 * 1000),
  };
}
