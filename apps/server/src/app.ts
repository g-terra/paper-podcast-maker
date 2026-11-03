import Fastify, { type FastifyInstance } from 'fastify';
import {
  PodcastSettingsSchema,
  type HealthResponse,
  type ProvidersResponse,
} from '@paper-podcast/shared';
import { detectProviders, type CommandLocator } from './providers/index.js';

export interface BuildAppOptions {
  logger?: boolean;
  /** Override CLI detection (used in tests). */
  locateCommand?: CommandLocator;
}

export const SERVER_VERSION = '0.0.0';

export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const app = Fastify({ logger: options.logger ?? false });

  app.get('/api/health', async (): Promise<HealthResponse> => ({
    status: 'ok',
    version: SERVER_VERSION,
  }));

  app.get('/api/providers', async (): Promise<ProvidersResponse> => ({
    providers: await detectProviders(options.locateCommand),
  }));

  app.post('/api/settings/validate', async (request, reply) => {
    const result = PodcastSettingsSchema.safeParse(request.body);
    if (!result.success) {
      return reply.code(400).send({ valid: false, issues: result.error.issues });
    }
    return { valid: true, settings: result.data };
  });

  return app;
}
