#!/usr/bin/env node
// ppm: start, stop and check the paper-podcast-maker app from a terminal (macOS, Windows, Linux).
//   ppm start [--port N] [--mdns [--mdns-name NAME]] [--foreground] | stop | restart | status | open | logs | build | link | help
// The server runs in the background; its pid and port are kept in <data folder>/server.json.
import { spawn, spawnSync } from 'node:child_process';
import {
  accessSync,
  chmodSync,
  constants,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:net';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const WIN = process.platform === 'win32';
const MAC = process.platform === 'darwin';
const HOST = process.env.PPM_HOST ?? '127.0.0.1';
const DEFAULT_PORT = 8787;
const DATA_DIR = resolve(process.env.PPM_DATA_DIR ?? join(homedir(), '.paper-podcast-maker'));
const STATE = join(DATA_DIR, 'server.json');
const LOG = join(DATA_DIR, 'server.log');
const SERVER_ENTRY = join(ROOT, 'apps/server/dist/index.js');
const WEB_ENTRY = join(ROOT, 'apps/web/dist/index.html');
const SELF = join(ROOT, 'bin/ppm.mjs');

const COLOR = !process.env.NO_COLOR && process.stdout.isTTY;
const paint = (code, s) => (COLOR ? `\x1b[${code}m${s}\x1b[0m` : s);
const ok = (s) => console.log(`${paint('32', '✓')} ${s}`);
const warn = (s) => console.log(`${paint('33', '⚠')} ${s}`);
const fail = (s) => console.log(`${paint('31', '✗')} ${s}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const urlFor = (port) => `http://${HOST}:${port}`;

/** The value of `--flag value` or `--flag=value`, else undefined. */
function flagValue(args, ...names) {
  const i = args.findIndex((a) => names.includes(a) || names.some((n) => a.startsWith(`${n}=`)));
  if (i === -1) return undefined;
  return args[i].includes('=') ? args[i].slice(args[i].indexOf('=') + 1) : args[i + 1];
}

/** `--port 9000`, `--port=9000` or PPM_PORT; undefined when none was given. */
function requestedPort(args) {
  const raw = flagValue(args, '--port', '-p') ?? process.env.PPM_PORT;
  if (raw === undefined) return undefined;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    fail(`Not a valid port: ${raw}`);
    process.exit(1);
  }
  return port;
}

const truthy = (value) => /^(1|true|yes|on)$/i.test(value ?? '');

/** mDNS mode: `--mdns`, `--mdns-name NAME` or PPM_MDNS / PPM_MDNS_NAME. Returns the host label or null. */
function requestedMdns(args) {
  if (args.includes('--no-mdns')) return null;
  const name = flagValue(args, '--mdns-name') ?? process.env.PPM_MDNS_NAME;
  const on = args.includes('--mdns') || name !== undefined || truthy(process.env.PPM_MDNS);
  if (!on) return null;
  const label = (name ?? 'paper-podcast')
    .trim()
    .toLowerCase()
    .replace(/\.$/, '')
    .replace(/\.local$/, '');
  if (!/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(label)) {
    fail(`Not a valid mDNS name: ${name} (use letters, digits and dashes)`);
    process.exit(1);
  }
  return label;
}

const mdnsUrl = (state) => `http://${state.mdnsName}.local:${state.port}`;

/** Prints where the app can be reached. */
function printUrls(state, verb) {
  ok(`${verb}: ${urlFor(state.port)}`);
  if (!state.mdnsName) return;
  ok(`On your network: ${mdnsUrl(state)}`);
  warn('mDNS mode: anyone on this network can open the app and run your AI CLI through it.');
}

function readState() {
  try {
    return JSON.parse(readFileSync(STATE, 'utf8'));
  } catch {
    return null;
  }
}

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

/** True when a paper-podcast-maker server answers on this port. */
async function responds(port) {
  try {
    const res = await fetch(`${urlFor(port)}/api/health`, { signal: AbortSignal.timeout(2000) });
    return res.ok && (await res.json()).status === 'ok';
  } catch {
    return false;
  }
}

function portFree(port, host = HOST) {
  return new Promise((done) => {
    const probe = createServer()
      .once('error', () => done(false))
      .once('listening', () => probe.close(() => done(true)));
    probe.listen(port, host);
  });
}

/** The server this command started, if it is still running. */
async function running() {
  const state = readState();
  if (!state) return null;
  if (alive(state.pid) && (await responds(state.port))) return state;
  return null;
}

function run(cmd, args) {
  return spawnSync(cmd, args, { cwd: ROOT, stdio: 'inherit', shell: WIN }).status === 0;
}

/** Installs dependencies and builds when needed, so `ppm start` works on a fresh clone. */
function ensureBuilt(force = false) {
  if (!existsSync(join(ROOT, 'node_modules'))) {
    warn('Installing dependencies first (pnpm install)…');
    if (!run('pnpm', ['install'])) {
      fail('pnpm install failed. Is pnpm installed? Try: corepack enable');
      process.exit(1);
    }
  }
  if (force || !existsSync(SERVER_ENTRY) || !existsSync(WEB_ENTRY)) {
    warn('Building the app (pnpm build)…');
    if (!run('pnpm', ['build'])) {
      fail('pnpm build failed.');
      process.exit(1);
    }
  }
}

async function choosePort(args, host) {
  const asked = requestedPort(args);
  if (asked !== undefined) {
    if (await portFree(asked, host)) return asked;
    fail(`Port ${asked} is already in use. Pick another one, e.g.: ppm start --port ${asked + 1}`);
    process.exit(1);
  }
  for (let port = DEFAULT_PORT; port < DEFAULT_PORT + 20; port++) {
    if (await portFree(port, host)) {
      if (port !== DEFAULT_PORT) warn(`Port ${DEFAULT_PORT} is in use, using ${port} instead.`);
      return port;
    }
  }
  fail(
    `No free port between ${DEFAULT_PORT} and ${DEFAULT_PORT + 19}. Choose one: ppm start --port N`,
  );
  process.exit(1);
}

async function start(args) {
  const current = await running();
  if (current) {
    printUrls(current, 'Already running');
    console.log('  Stop it with: ppm stop');
    return current;
  }
  ensureBuilt();
  const mdnsName = requestedMdns(args);
  // mDNS mode listens on every interface so other devices can connect; otherwise loopback only.
  const host = process.env.PPM_HOST ?? (mdnsName ? '0.0.0.0' : HOST);
  const port = await choosePort(args, host);
  const env = {
    ...process.env,
    PPM_PORT: String(port),
    PPM_HOST: host,
    PPM_MDNS: mdnsName ? '1' : '0',
    ...(mdnsName && { PPM_MDNS_NAME: mdnsName }),
  };

  if (args.includes('--foreground') || args.includes('-f')) {
    console.log(`Starting on ${urlFor(port)} (Ctrl+C to stop)…`);
    const child = spawn(process.execPath, [SERVER_ENTRY], { cwd: ROOT, env, stdio: 'inherit' });
    child.on('exit', (code) => process.exit(code ?? 0));
    for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
    return null;
  }

  mkdirSync(DATA_DIR, { recursive: true });
  const log = openSync(LOG, 'a');
  const child = spawn(process.execPath, [SERVER_ENTRY], {
    cwd: ROOT,
    env,
    detached: true,
    windowsHide: true,
    stdio: ['ignore', log, log],
  });
  child.unref();
  const state = { pid: child.pid, port, host, mdnsName, startedAt: new Date().toISOString() };
  writeFileSync(STATE, `${JSON.stringify(state, null, 2)}\n`);

  for (let i = 0; i < 30; i++) {
    if (await responds(port)) {
      printUrls(state, 'App running');
      return state;
    }
    if (!alive(child.pid)) break;
    await sleep(500);
  }
  fail(`The server didn't start. Last lines of ${LOG}:`);
  console.log(tail(LOG, 15));
  rmSync(STATE, { force: true });
  process.exit(1);
}

async function stop() {
  const state = readState();
  if (!state || !alive(state.pid)) {
    rmSync(STATE, { force: true });
    console.log('Not running.');
    return;
  }
  try {
    process.kill(state.pid, 'SIGTERM');
  } catch {
    // Already gone.
  }
  for (let i = 0; i < 20 && alive(state.pid); i++) await sleep(250);
  if (alive(state.pid)) process.kill(state.pid, 'SIGKILL');
  rmSync(STATE, { force: true });
  ok(`Stopped (was on port ${state.port}).`);
}

async function status() {
  const state = await running();
  if (state) {
    printUrls(state, 'Running');
    console.log(`  pid ${state.pid}, since ${state.startedAt}`);
  } else {
    console.log('Not running. Start it with: ppm start');
    const port = requestedPort(process.argv.slice(3)) ?? DEFAULT_PORT;
    if (await responds(port))
      warn(`Another paper-podcast-maker server is answering on port ${port}.`);
  }
  console.log(`  Data folder: ${DATA_DIR}`);
  console.log(`  Log:         ${LOG}`);
}

function tail(file, n) {
  try {
    return readFileSync(file, 'utf8').trimEnd().split('\n').slice(-n).join('\n');
  } catch {
    return `(no log yet: ${file})`;
  }
}

function logs() {
  if (!WIN && spawnSync('which', ['tail']).status === 0) {
    spawnSync('tail', ['-n', '40', '-f', LOG], { stdio: 'inherit' });
  } else {
    console.log(tail(LOG, 40));
  }
}

function openBrowser(url) {
  const [cmd, args] = MAC ? ['open', [url]] : WIN ? ['explorer', [url]] : ['xdg-open', [url]];
  spawn(cmd, args, { stdio: 'ignore', detached: true })
    .on('error', () => warn(`Open ${url} in your browser.`))
    .unref();
}

const writable = (dir) => {
  try {
    accessSync(dir, constants.W_OK);
    return statSync(dir).isDirectory();
  } catch {
    return false;
  }
};

/** Puts a `ppm` command on PATH (a symlink in a bin folder you can write to). */
function link() {
  if (WIN) {
    warn(`On Windows, run it with: node "${SELF}" <command>  (or: pnpm ppm <command> in ${ROOT})`);
    return;
  }
  chmodSync(SELF, 0o755);
  const dirs = MAC
    ? ['/opt/homebrew/bin', '/usr/local/bin', join(homedir(), '.local/bin')]
    : [join(homedir(), '.local/bin'), '/usr/local/bin'];
  for (const dir of dirs) {
    if (!writable(dir)) continue;
    rmSync(join(dir, 'ppm'), { force: true });
    symlinkSync(SELF, join(dir, 'ppm'));
    ok(`Command installed: type 'ppm' anywhere (${join(dir, 'ppm')})`);
    return;
  }
  warn(`No writable bin folder found. Add an alias instead: alias ppm='${SELF}'`);
}

const HELP = `${paint('1', 'ppm: paper-podcast-maker')}

  ppm start          start the app in the background (${urlFor(DEFAULT_PORT)}, or the next free port)
      --port N       use port N (or set PPM_PORT)
      --mdns         also open it to your network as http://paper-podcast.local:<port>
                     (or set PPM_MDNS=1). Anyone on the network can then use it.
      --mdns-name N  use N.local instead (or set PPM_MDNS_NAME)
      --foreground   run in this terminal instead
  ppm stop           stop it
  ppm restart        stop, rebuild, start again (keeps the port and mDNS setting unless
                     --port, --mdns or --no-mdns is given)
  ppm status         is it running, and where?
  ppm open           open the app in your browser (starts it if needed)
  ppm logs           follow the server log
  ppm build          install dependencies and build the app
  ppm link           install the 'ppm' command on your PATH
`;

const [cmd = 'help', ...args] = process.argv.slice(2);
switch (cmd) {
  case 'start':
    await start(args);
    break;
  case 'stop':
    await stop();
    break;
  case 'restart': {
    const previous = readState();
    await stop();
    ensureBuilt(true);
    // Keep the previous port and mDNS setting unless new ones are given.
    const keep = [];
    if (previous && requestedPort(args) === undefined) keep.push('--port', String(previous.port));
    if (previous?.mdnsName && !args.some((a) => a.startsWith('--mdns') || a === '--no-mdns')) {
      keep.push('--mdns-name', previous.mdnsName);
    }
    await start([...args, ...keep]);
    break;
  }
  case 'status':
    await status();
    break;
  case 'open': {
    const state = await start(args);
    if (state) openBrowser(urlFor(state.port));
    break;
  }
  case 'logs':
    logs();
    break;
  case 'build':
    ensureBuilt(true);
    ok('Built.');
    break;
  case 'link':
    link();
    break;
  case 'help':
  case '--help':
  case '-h':
    console.log(HELP);
    break;
  default:
    fail(`Unknown command: ${cmd}`);
    console.log(HELP);
    process.exit(1);
}
