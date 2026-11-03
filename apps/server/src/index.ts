import { fileURLToPath } from 'node:url';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';

const config = loadConfig();
// When built, serve the web app from apps/web/dist so one command runs everything.
const webDir = process.env.PPM_WEB_DIR ?? fileURLToPath(new URL('../../web/dist', import.meta.url));
const app = await buildApp({ config, logger: true, webDir });

try {
  await app.listen({ host: config.host, port: config.port });
  app.log.info(`Data folder: ${config.dataDir}`);
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
