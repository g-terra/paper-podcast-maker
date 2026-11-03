import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ServerConfig } from './config.js';

export async function testConfig(): Promise<ServerConfig> {
  const dataDir = await mkdtemp(join(tmpdir(), 'ppm-test-'));
  return {
    host: '127.0.0.1',
    port: 0,
    dataDir,
    piperVoicesDir: join(dataDir, 'piper'),
    aiTimeoutMs: 1000,
  };
}
