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
  if ((error as NodeJS.ErrnoException).code === 'EADDRINUSE') {
    app.log.error(
      `Port ${config.port} is already in use. Start on another port with \`pnpm start --port <n>\` or PPM_PORT=<n>.`,
    );
    process.exit(1);
  }
  app.log.error(error);
  process.exit(1);
}
