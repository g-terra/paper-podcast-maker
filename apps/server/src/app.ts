import { createReadStream, existsSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import Fastify, { type FastifyInstance } from 'fastify';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import {
  PodcastSettingsSchema,
  TranscriptSchema,
  type EpisodesResponse,
  type HealthResponse,
  type ProvidersResponse,
  type TtsEnginesResponse,
} from '@paper-podcast/shared';
import type { ServerConfig } from './config.js';
import { defaultLocator, detectProviders, type CommandLocator } from './providers/index.js';
import { detectTtsEngines } from './tts/index.js';
import { EpisodeService, type PipelineDeps } from './pipeline/episodes.js';

export interface BuildAppOptions {
  config: ServerConfig;
  logger?: boolean;
  /** Override CLI detection (used in tests). */
  locateCommand?: CommandLocator;
  /** Override pipeline steps (used in tests). */
  pipeline?: Partial<PipelineDeps>;
  /** Built web app to serve at `/`, if present. */
  webDir?: string;
}

export const SERVER_VERSION = '0.1.0';
const MAX_PDF_BYTES = 100 * 1024 * 1024;

export async function buildApp(options: BuildAppOptions): Promise<FastifyInstance> {
  const { config } = options;
  const app = Fastify({ logger: options.logger ?? false });
  const locateCommand = options.locateCommand ?? defaultLocator;
  const tts = { piperVoicesDir: config.piperVoicesDir };

  const episodes = new EpisodeService({
    dataDir: config.dataDir,
    tts,
    aiTimeoutMs: config.aiTimeoutMs,
    locateCommand,
    ...options.pipeline,
  });
  await episodes.load();

  await app.register(multipart, { limits: { fileSize: MAX_PDF_BYTES, files: 1 } });

  app.get('/api/health', async (): Promise<HealthResponse> => ({
    status: 'ok',
    version: SERVER_VERSION,
  }));

  app.get('/api/providers', async (): Promise<ProvidersResponse> => ({
    providers: await detectProviders(locateCommand),
  }));

  app.get('/api/tts', async (): Promise<TtsEnginesResponse> => ({
    engines: await detectTtsEngines(tts),
  }));

  app.post('/api/settings/validate', async (request, reply) => {
    const result = PodcastSettingsSchema.safeParse(request.body);
    if (!result.success) {
      return reply.code(400).send({ valid: false, issues: result.error.issues });
    }
    return { valid: true, settings: result.data };
  });

  app.get('/api/episodes', async (): Promise<EpisodesResponse> => ({ episodes: episodes.list() }));

  app.get<{ Params: { id: string } }>('/api/episodes/:id', async (request, reply) => {
    const episode = episodes.get(request.params.id);
    return episode ?? reply.code(404).send({ error: 'Episode not found' });
  });

  // multipart/form-data with a `paper` PDF file and a `settings` JSON field.
  app.post('/api/episodes', async (request, reply) => {
    let pdf: Buffer | undefined;
    let fileName = 'paper.pdf';
    let rawSettings: string | undefined;

    for await (const part of request.parts()) {
      if (part.type === 'file' && part.fieldname === 'paper') {
        pdf = await part.toBuffer();
        fileName = part.filename || fileName;
      } else if (part.type === 'field' && part.fieldname === 'settings') {
        rawSettings = String(part.value);
      }
    }

    if (!pdf || pdf.subarray(0, 5).toString('latin1') !== '%PDF-') {
      return reply.code(400).send({ error: 'Upload a PDF file in the "paper" field' });
    }
    let settingsJson: unknown;
    try {
      settingsJson = JSON.parse(rawSettings ?? '');
    } catch {
      return reply.code(400).send({ error: 'Missing or invalid "settings" JSON' });
    }
    const settings = PodcastSettingsSchema.safeParse(settingsJson);
    if (!settings.success) {
      return reply.code(400).send({ error: settings.error.issues[0]?.message ?? 'Bad settings' });
    }

    const episode = await episodes.create(fileName, new Uint8Array(pdf), settings.data);
    return reply.code(202).send(episode);
  });

  app.put<{ Params: { id: string } }>('/api/episodes/:id/transcript', async (request, reply) => {
    const episode = episodes.get(request.params.id);
    if (!episode) return reply.code(404).send({ error: 'Episode not found' });
    const transcript = TranscriptSchema.safeParse(request.body);
    if (!transcript.success) return reply.code(400).send({ error: 'Invalid transcript' });
    const names = new Set(episode.settings.hosts.map((h) => h.name));
    const unknown = transcript.data.lines.find((l) => !names.has(l.speaker));
    if (unknown) return reply.code(400).send({ error: `Unknown speaker "${unknown.speaker}"` });
    try {
      return reply.code(202).send(await episodes.rerender(episode.id, transcript.data));
    } catch (error) {
      return reply.code(409).send({ error: (error as Error).message });
    }
  });

  app.delete<{ Params: { id: string } }>('/api/episodes/:id', async (request, reply) => {
    if (!episodes.get(request.params.id)) return reply.code(404).send({ error: 'Not found' });
    try {
      await episodes.remove(request.params.id);
      return reply.code(204).send();
    } catch (error) {
      return reply.code(409).send({ error: (error as Error).message });
    }
  });

  app.get<{ Params: { id: string } }>('/api/episodes/:id/audio', async (request, reply) => {
    const episode = episodes.get(request.params.id);
    if (!episode?.audioUrl) return reply.code(404).send({ error: 'No audio yet' });
    const path = episodes.audioPath(episode.id);
    const { size } = await stat(path);
    const safeName = (episode.transcript?.title ?? 'episode').replace(/[^\w -]+/g, '').trim();

    reply.header('Accept-Ranges', 'bytes');
    reply.header('Content-Type', 'audio/wav');
    reply.header('Content-Disposition', `inline; filename="${safeName || 'episode'}.wav"`);

    // Range support so the audio player can seek.
    const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.range ?? '');
    if (range && (range[1] || range[2])) {
      const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
      const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
      if (start >= size || start > end) {
        return reply.code(416).header('Content-Range', `bytes */${size}`).send();
      }
      reply.code(206);
      reply.header('Content-Range', `bytes ${start}-${end}/${size}`);
      reply.header('Content-Length', end - start + 1);
      return reply.send(createReadStream(path, { start, end }));
    }
    reply.header('Content-Length', size);
    return reply.send(createReadStream(path));
  });

  if (options.webDir && existsSync(options.webDir)) {
    await app.register(fastifyStatic, { root: options.webDir });
    app.setNotFoundHandler((request, reply) =>
      request.url.startsWith('/api/')
        ? reply.code(404).send({ error: 'Not found' })
        : reply.sendFile('index.html'),
    );
  }

  return app;
}
