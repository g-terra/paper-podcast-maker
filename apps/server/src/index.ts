import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { startMdns, type MdnsHandle } from './mdns.js';

// `npx @elevenlabs/cli onboard init` saves the key to the project's .env.local; read only that key.
for (const file of ['.env.local', '.env']) {
  try {
    const key = parseEnv(
      readFileSync(new URL(`../../../${file}`, import.meta.url), 'utf8'),
    ).ELEVENLABS_API_KEY;
    if (key && !process.env.ELEVENLABS_API_KEY) process.env.ELEVENLABS_API_KEY = key;
  } catch {
    // no such file
  }
}

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
      'mDNS mode: anyone on this network can open the app and run your AI CLI (and ElevenLabs credits) through it.',
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
