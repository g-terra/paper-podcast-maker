import { describe, expect, it } from 'vitest';
import { createServer } from 'node:net';
import { findFreePort, isPortFree, parseArgs } from './util.mjs';

describe('parseArgs', () => {
  it('reads the command and options', () => {
    expect(parseArgs(['start', '--port', '9000', '--no-open'])).toEqual({
      command: 'start',
      options: { port: 9000, open: false, follow: true },
    });
    expect(parseArgs(['open', '--port=9001']).options.port).toBe(9001);
    expect(parseArgs([]).command).toBe('help');
  });

  it('rejects bad ports', () => {
    expect(() => parseArgs(['start', '--port', 'x'])).toThrow(/Invalid port/);
  });
});

describe('ports', () => {
  it('skips busy ports', async () => {
    expect(await findFreePort(8787, 5, async (p) => p === 8789)).toBe(8789);
    expect(await findFreePort(8787, 2, async () => false)).toBeNull();
  });

  it('detects a port in use', async () => {
    const server = createServer();
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const { port } = server.address();
    expect(await isPortFree(port)).toBe(false);
    await new Promise((r) => server.close(r));
    expect(await isPortFree(port)).toBe(true);
  });
});
