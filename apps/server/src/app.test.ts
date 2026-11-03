import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { defaultSettings, type ProvidersResponse } from '@paper-podcast/shared';
import { buildApp } from './app.js';

let app: FastifyInstance | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe('server', () => {
  it('reports health', async () => {
    app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'ok' });
  });

  it('lists providers with their availability', async () => {
    app = buildApp({
      locateCommand: async (cmd) => (cmd === 'claude' ? '/usr/bin/claude' : null),
    });
    const res = await app.inject({ method: 'GET', url: '/api/providers' });
    const body = res.json<ProvidersResponse>();
    expect(body.providers.find((p) => p.id === 'claude')?.available).toBe(true);
    expect(body.providers.find((p) => p.id === 'codex')?.available).toBe(false);
  });

  it('validates settings', async () => {
    app = buildApp();
    const ok = await app.inject({
      method: 'POST',
      url: '/api/settings/validate',
      payload: defaultSettings,
    });
    expect(ok.statusCode).toBe(200);

    const bad = await app.inject({
      method: 'POST',
      url: '/api/settings/validate',
      payload: { ...defaultSettings, minMinutes: 30, maxMinutes: 5 },
    });
    expect(bad.statusCode).toBe(400);
  });
});
