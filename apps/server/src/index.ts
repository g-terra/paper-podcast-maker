import { fileURLToPath } from 'node:url';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { startMdns, type MdnsHandle } from './mdns.js';

const config = loadConfig();
// When built, serve the web app from apps/web/dist so one command runs everything.
const webDir = process.env.PPM_WEB_DIR ?? fileURLToPath(new URL('../../web/dist', import.meta.url));
const app = await buildApp({ config, logger: true, webDir });
let mdns: MdnsHandle | undefined;

try {
  await app.listen({ host: config.host, port: config.port });
  app.log.info(`Data folder: ${config.dataDir}`);
  if (config.mdns) {
    mdns = startMdns(config.mdnsName, config.port);
    app.log.info(`Also on your network at http://${mdns.hostname}:${config.port}`);
    app.log.warn(
      'mDNS mode: anyone on this network can open the app and run your AI CLI through it.',
    );
  }
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

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, async () => {
    await mdns?.stop();
    await app.close();
    process.exit(0);
  });
}
