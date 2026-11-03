import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  defaultSettings,
  type Episode,
  type ProvidersResponse,
  type Transcript,
} from '@paper-podcast/shared';
import { buildApp, type BuildAppOptions } from './app.js';
import { concatWav } from './audio/wav.js';
import { testConfig } from './test-utils.js';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

let app: FastifyInstance | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

async function make(overrides: Partial<BuildAppOptions> = {}) {
  app = await buildApp({ config: await testConfig(), ...overrides });
  return app;
}

const longText = 'This paper studies things. '.repeat(100);
const fakeTranscript: Transcript = {
  title: 'A test episode',
  lines: [
    { speaker: 'Alex', text: 'word '.repeat(700).trim() },
    { speaker: 'Sam', text: 'word '.repeat(700).trim() },
  ],
};

function multipartBody(pdf: Buffer, settings: unknown) {
  const boundary = '----ppmtest';
  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="settings"\r\n\r\n${JSON.stringify(settings)}\r\n` +
        `--${boundary}\r\nContent-Disposition: form-data; name="paper"; filename="paper.pdf"\r\nContent-Type: application/pdf\r\n\r\n`,
    ),
    pdf,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return { body, headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } };
}

describe('server', () => {
  it('reports health', async () => {
    const res = await (await make()).inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'ok' });
  });

  it('lists providers with their availability', async () => {
    await make({ locateCommand: async (cmd) => (cmd === 'claude' ? '/usr/bin/claude' : null) });
    const res = await app!.inject({ method: 'GET', url: '/api/providers' });
    const body = res.json<ProvidersResponse>();
    expect(body.providers.find((p) => p.id === 'claude')?.available).toBe(true);
    expect(body.providers.find((p) => p.id === 'codex')?.available).toBe(false);
    expect(body.providers.find((p) => p.id === 'claude')?.models[0]?.id).toBe('claude-sonnet-5-5');
  });

  it('lists Kokoro voices and speaks a preview', async () => {
    const spoken: string[] = [];
    await make({
      speak: async (text, voice) => {
        spoken.push(`${voice}:${text}`);
        return concatWav([{ sampleRate: 8000, samples: new Int16Array(10) }]);
      },
    });
    const voices = await app!.inject({ method: 'GET', url: '/api/voices' });
    expect(voices.json<{ voices: { id: string }[] }>().voices[0]?.id).toBe('af_heart');

    const preview = await app!.inject({
      method: 'POST',
      url: '/api/voices/preview',
      payload: { voice: 'am_michael', text: 'Hello there' },
    });
    expect(preview.statusCode).toBe(200);
    expect(preview.headers['content-type']).toBe('audio/wav');
    // Cached on the second request.
    await app!.inject({
      method: 'POST',
      url: '/api/voices/preview',
      payload: { voice: 'am_michael', text: 'Hello there' },
    });
    expect(spoken).toEqual(['am_michael:Hello there']);

    const bad = await app!.inject({
      method: 'POST',
      url: '/api/voices/preview',
      payload: { voice: '../etc' },
    });
    expect(bad.statusCode).toBe(400);
  });

  it('validates settings', async () => {
    await make();
    const ok = await app!.inject({
      method: 'POST',
      url: '/api/settings/validate',
      payload: defaultSettings,
    });
    expect(ok.statusCode).toBe(200);
    const bad = await app!.inject({
      method: 'POST',
      url: '/api/settings/validate',
      payload: { ...defaultSettings, minMinutes: 30, maxMinutes: 5 },
    });
    expect(bad.statusCode).toBe(400);
  });

  it('rejects uploads that are not PDFs', async () => {
    await make();
    const { body, headers } = multipartBody(Buffer.from('hello'), defaultSettings);
    const res = await app!.inject({ method: 'POST', url: '/api/episodes', payload: body, headers });
    expect(res.statusCode).toBe(400);
  });

  it('runs the whole pipeline: paper to transcript to audio', async () => {
    const prompts: string[] = [];
    await make({
      pipeline: {
        extractText: async () => longText,
        generateText: async (prompt) => {
          prompts.push(prompt);
          return '```json\n' + JSON.stringify(fakeTranscript) + '\n```';
        },
        renderAudio: async (_t, _s, dir) => {
          const clip = { sampleRate: 8000, samples: new Int16Array(8000) };
          await writeFile(join(dir, 'episode.wav'), concatWav([clip, clip]));
        },
      },
    });

    const { body, headers } = multipartBody(Buffer.from('%PDF-1.4 fake'), defaultSettings);
    const created = await app!.inject({
      method: 'POST',
      url: '/api/episodes',
      payload: body,
      headers,
    });
    expect(created.statusCode).toBe(202);
    const { id } = created.json<Episode>();

    // Wait for the background job.
    let episode: Episode;
    for (let i = 0; ; i++) {
      episode = (await app!.inject({ method: 'GET', url: `/api/episodes/${id}` })).json<Episode>();
      if (episode.stage === 'done' || episode.stage === 'failed' || i > 100) break;
      await new Promise((r) => setTimeout(r, 10));
    }

    expect(episode.error).toBeUndefined();
    expect(episode.stage).toBe('done');
    expect(episode.transcript?.title).toBe('A test episode');
    expect(episode.estimatedMinutes).toBeCloseTo(1400 / 150);
    expect(prompts).toHaveLength(1);
    expect(prompts[0]).toContain('This paper studies things.');

    const audio = await app!.inject({ method: 'GET', url: `/api/episodes/${id}/audio` });
    expect(audio.statusCode).toBe(200);
    expect(audio.headers['content-type']).toBe('audio/wav');

    const ranged = await app!.inject({
      method: 'GET',
      url: `/api/episodes/${id}/audio`,
      headers: { range: 'bytes=0-99' },
    });
    expect(ranged.statusCode).toBe(206);
    expect(ranged.rawPayload.length).toBe(100);

    const list = await app!.inject({ method: 'GET', url: '/api/episodes' });
    expect(list.json<{ episodes: Episode[] }>().episodes).toHaveLength(1);
  });

  it('retries once when the script misses the length budget', async () => {
    const short = { title: 'Short', lines: [{ speaker: 'Alex', text: 'Too short.' }] };
    const replies = [JSON.stringify(short), JSON.stringify(fakeTranscript)];
    const prompts: string[] = [];
    await make({
      pipeline: {
        extractText: async () => longText,
        generateText: async (prompt) => {
          prompts.push(prompt);
          return replies.shift()!;
        },
        renderAudio: async (_t, _s, dir) =>
          writeFile(
            join(dir, 'episode.wav'),
            concatWav([{ sampleRate: 8000, samples: new Int16Array(10) }]),
          ),
      },
    });
    const { body, headers } = multipartBody(Buffer.from('%PDF-1.4 fake'), defaultSettings);
    const { id } = (
      await app!.inject({ method: 'POST', url: '/api/episodes', payload: body, headers })
    ).json<Episode>();
    for (let i = 0; i < 100; i++) {
      const ep = (await app!.inject({ method: 'GET', url: `/api/episodes/${id}` })).json<Episode>();
      if (ep.stage === 'done') break;
      await new Promise((r) => setTimeout(r, 10));
    }
    expect(prompts).toHaveLength(2);
    expect(prompts[1]).toContain('Your previous draft was 2 words');
  });

  it('reports a failure when the AI reply is not a transcript', async () => {
    await make({
      pipeline: {
        extractText: async () => longText,
        generateText: async () => 'Sorry, I cannot help with that.',
      },
    });
    const { body, headers } = multipartBody(Buffer.from('%PDF-1.4 fake'), defaultSettings);
    const { id } = (
      await app!.inject({ method: 'POST', url: '/api/episodes', payload: body, headers })
    ).json<Episode>();
    let ep: Episode | undefined;
    for (let i = 0; i < 100; i++) {
      ep = (await app!.inject({ method: 'GET', url: `/api/episodes/${id}` })).json<Episode>();
      if (ep.stage === 'failed') break;
      await new Promise((r) => setTimeout(r, 10));
    }
    expect(ep?.stage).toBe('failed');
    expect(ep?.error).toMatch(/JSON/);
  });
});
