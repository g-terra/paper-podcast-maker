// Small helpers for the `ppm` command, kept separate so they can be tested.
import { createServer } from 'node:net';

export const DEFAULT_PORT = 8787;

/** Parses `ppm <command> [--port N] [--no-open] ...` into a command and options. */
export function parseArgs(argv) {
  const [command = 'help', ...rest] = argv;
  const options = { port: undefined, open: true, follow: true };
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg === '--port' || arg === '-p') options.port = rest[++i];
    else if (arg.startsWith('--port=')) options.port = arg.slice('--port='.length);
    else if (arg === '--no-open') options.open = false;
    else if (arg === '--no-follow') options.follow = false;
  }
  if (options.port !== undefined) {
    const n = Number(options.port);
    if (!Number.isInteger(n) || n < 1 || n > 65535)
      throw new Error(`Invalid port: ${options.port}`);
    options.port = n;
  }
  return { command, options };
}

/** Resolves true when nothing is listening on 127.0.0.1:port. */
export function isPortFree(port, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const server = createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => server.close(() => resolve(true)));
    server.listen(port, host);
  });
}

/** First free port from `start`, trying `attempts` ports. */
export async function findFreePort(start, attempts = 20, check = isPortFree) {
  for (let port = start; port < start + attempts; port++) {
    if (await check(port)) return port;
  }
  return null;
}

/** True when our server answers on this port. */
export async function isOurServer(port) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/health`, {
      signal: AbortSignal.timeout(1500),
    });
    const body = await res.json();
    return body?.app === 'paper-podcast-maker';
  } catch {
    return false;
  }
}

/** True if any file under `dirs` is newer than `since` (ms). */
export async function newerThan(dirs, since) {
  const { readdir, stat } = await import('node:fs/promises');
  const { join } = await import('node:path');
  async function walk(dir) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return false;
    }
    for (const e of entries) {
      if (e.name === 'node_modules' || e.name === 'dist') continue;
      const p = join(dir, e.name);
      if (e.isDirectory() ? await walk(p) : (await stat(p)).mtimeMs > since) return true;
    }
    return false;
  }
  for (const dir of dirs) if (await walk(dir)) return true;
  return false;
}
