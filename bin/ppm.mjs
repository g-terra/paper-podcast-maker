#!/usr/bin/env node
// ppm: start, stop and open Paper Podcast Maker from a terminal (macOS, Windows, Linux).
// Started through bin/ppm (macOS/Linux) or bin/ppm.cmd (Windows), or `pnpm ppm <command>`.
import { spawn, spawnSync } from 'node:child_process';
import {
  accessSync,
  appendFileSync,
  chmodSync,
  constants,
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readlinkSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_PORT,
  findFreePort,
  isOurServer,
  isPortFree,
  newerThan,
  parseArgs,
} from './lib/util.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MAC = process.platform === 'darwin';
const WIN = process.platform === 'win32';
const DATA = resolve(process.env.PPM_DATA_DIR ?? join(homedir(), '.paper-podcast-maker'));
const STATE = join(DATA, 'run.json');
const LOG = join(DATA, 'logs', 'server.log');
const SERVER = join(ROOT, 'apps/server/dist/index.js');
const WEB = join(ROOT, 'apps/web/dist/index.html');
const SELF = join(ROOT, 'bin/ppm');

const COLOR = !process.env.NO_COLOR && process.stdout.isTTY;
const paint = (code, s) => (COLOR ? `\x1b[${code}m${s}\x1b[0m` : s);
const ok = (s) => console.log(`${paint('32', '✓')} ${s}`);
const warn = (s) => console.log(`${paint('33', '⚠')} ${s}`);
const fail = (s) => console.log(`${paint('31', '✗')} ${s}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const url = (port) => `http://127.0.0.1:${port}`;

// ---------- state ----------
function readState() {
  try {
    return JSON.parse(readFileSync(STATE, 'utf8'));
  } catch {
    return null;
  }
}
const writeState = (s) => {
  mkdirSync(DATA, { recursive: true });
  writeFileSync(STATE, JSON.stringify(s, null, 2));
};
const clearState = () => rmSync(STATE, { force: true });
function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === 'EPERM';
  }
}
/** The server we started, if it is still running and answering. */
async function running() {
  const s = readState();
  if (s && alive(s.pid) && (await isOurServer(s.port))) return s;
  return null;
}

// ---------- build ----------
function which(bin) {
  const r = spawnSync(WIN ? 'where' : 'which', [bin], { encoding: 'utf8' });
  return r.status === 0 ? r.stdout.split(/\r?\n/).find(Boolean)?.trim() : null;
}
function pnpm(args) {
  // pnpm on PATH, else corepack's, else a one-off copy through npx.
  const [cmd, pre] = which('pnpm')
    ? ['pnpm', []]
    : which('corepack')
      ? ['corepack', ['pnpm']]
      : ['npx', ['-y', 'pnpm@10']];
  const r = spawnSync(cmd, [...pre, ...args], { cwd: ROOT, stdio: 'inherit', shell: WIN });
  return r.status === 0;
}
async function ensureBuilt() {
  if (!existsSync(join(ROOT, 'node_modules'))) {
    warn('Installing dependencies first (pnpm install)…');
    if (!pnpm(['install'])) throw new Error(`pnpm install failed in ${ROOT}`);
  }
  const builtAt = existsSync(SERVER) && existsSync(WEB) ? statSync(SERVER).mtimeMs : 0;
  const sources = ['apps/server/src', 'apps/web/src', 'packages/shared/src'].map((d) =>
    join(ROOT, d),
  );
  if (!builtAt || (await newerThan(sources, builtAt))) {
    warn(builtAt ? 'Code changed since the last build; rebuilding…' : 'Building the app…');
    if (!pnpm(['build'])) throw new Error('Build failed; run `pnpm build` to see why');
  }
}

// ---------- commands ----------
async function start({ port }) {
  const current = await running();
  if (current) {
    if (port && port !== current.port) {
      warn(`Already running on port ${current.port}. Use: ppm restart --port ${port}`);
    } else ok(`Already running: ${url(current.port)}`);
    return current.port;
  }

  let chosen = port ?? readState()?.port ?? DEFAULT_PORT;
  if (!(await isPortFree(chosen))) {
    if (await isOurServer(chosen)) {
      warn(`Another copy of the app (not started by ppm) is using port ${chosen}.`);
      console.log('  Stop it with: ppm stop --port ' + chosen);
    }
    if (port) throw new Error(`Port ${port} is in use. Pick another with --port.`);
    const free = await findFreePort(chosen + 1);
    if (!free) throw new Error(`No free port near ${chosen}. Pick one with --port.`);
    warn(`Port ${chosen} is busy; using ${free} instead.`);
    chosen = free;
  }

  await ensureBuilt();
  mkdirSync(dirname(LOG), { recursive: true });
  const out = openSync(LOG, 'a');
  appendFileSync(LOG, `\n--- ppm start ${new Date().toISOString()} on port ${chosen}\n`);
  const child = spawn(process.execPath, [SERVER, '--port', String(chosen)], {
    cwd: ROOT,
    detached: true,
    windowsHide: true,
    stdio: ['ignore', out, out],
    env: { ...process.env, PPM_PORT: String(chosen) },
  });
  child.unref();
  writeState({ pid: child.pid, port: chosen, startedAt: new Date().toISOString() });

  for (let i = 0; i < 40; i++) {
    if (await isOurServer(chosen)) {
      ok(`App running: ${url(chosen)}`);
      return chosen;
    }
    if (!alive(child.pid)) break;
    await sleep(250);
  }
  clearState();
  fail(`The server didn't start. Last lines of ${LOG}:`);
  console.log(readFileSync(LOG, 'utf8').trimEnd().split('\n').slice(-15).join('\n'));
  process.exit(1);
}

/** PID listening on a port, for servers ppm didn't start (macOS/Linux only). */
function pidOnPort(port) {
  if (WIN || !which('lsof')) return null;
  const r = spawnSync('lsof', ['-ti', `tcp:${port}`, '-sTCP:LISTEN'], { encoding: 'utf8' });
  const pid = Number(r.stdout.trim().split('\n')[0]);
  return pid || null;
}

async function stop({ port }) {
  const s = readState();
  let pid = s && alive(s.pid) && (!port || port === s.port) ? s.pid : null;
  const target = port ?? s?.port ?? DEFAULT_PORT;
  // A server started another way (pnpm start) on the port: stop it only if it is ours.
  if (!pid && (await isOurServer(target))) pid = pidOnPort(target);
  if (!pid) {
    if (await isOurServer(target)) {
      fail(`The app is running on port ${target}, but ppm can't find its process.`);
      console.log('  Close the terminal running it, or stop it from Task Manager.');
      return;
    }
    clearState();
    ok('Not running');
    return;
  }
  try {
    process.kill(pid);
  } catch {
    // already gone
  }
  for (let i = 0; i < 20 && alive(pid); i++) await sleep(150);
  if (s?.pid === pid) clearState();
  ok('Stopped');
}

async function status() {
  const s = await running();
  if (s) {
    ok(`Running: ${url(s.port)} (pid ${s.pid}, since ${new Date(s.startedAt).toLocaleString()})`);
  } else {
    console.log('Not running. Start it with: ppm start');
    if (await isOurServer(DEFAULT_PORT)) {
      warn(`A copy not started by ppm is answering on ${url(DEFAULT_PORT)}.`);
    }
  }
  console.log(`  Data:  ${DATA}`);
  console.log(`  Logs:  ${LOG}`);
}

function openBrowser(target) {
  const [cmd, args] = MAC
    ? ['open', [target]]
    : WIN
      ? ['explorer', [target]]
      : ['xdg-open', [target]];
  spawn(cmd, args, { stdio: 'ignore', detached: true })
    .on('error', () => warn(`Open ${target} in your browser.`))
    .unref();
}

function logs({ follow }) {
  if (!existsSync(LOG)) return console.log(`(no log yet: ${LOG})`);
  if (follow && !WIN && which('tail')) {
    spawnSync('tail', ['-n', '40', '-f', LOG], { stdio: 'inherit' });
  } else console.log(readFileSync(LOG, 'utf8').trimEnd().split('\n').slice(-40).join('\n'));
}

function update() {
  const r = spawnSync('git', ['-C', ROOT, 'pull', '--ff-only'], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error('git pull failed (local changes?)');
  if (!pnpm(['install'])) throw new Error('pnpm install failed');
  ok('Updated. The app rebuilds on the next start; run: ppm restart');
}

// ---------- the `ppm` command on PATH ----------
const writable = (d) => {
  try {
    accessSync(d, constants.W_OK);
    return statSync(d).isDirectory();
  } catch {
    return false;
  }
};
const userPath = (op) =>
  spawnSync(
    'powershell',
    [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      "$d=$env:PPM_BIN; $p=[Environment]::GetEnvironmentVariable('Path','User'); $l=@(($p -split ';') | Where-Object { $_ -and $_ -ne $d });" +
        (op === 'add' ? ' $l += $d;' : '') +
        " [Environment]::SetEnvironmentVariable('Path', ($l -join ';'), 'User')",
    ],
    { env: { ...process.env, PPM_BIN: join(ROOT, 'bin') }, stdio: 'ignore' },
  ).status === 0;

function install() {
  if (WIN) {
    if (userPath('add')) ok("Installed: open a new terminal, then type 'ppm'");
    else warn('Could not add ppm to your PATH. From this folder use: bin\\ppm.cmd');
    return;
  }
  chmodSync(SELF, 0o755);
  const dirs = MAC
    ? ['/opt/homebrew/bin', '/usr/local/bin', join(homedir(), '.local/bin')]
    : [join(homedir(), '.local/bin'), '/usr/local/bin'];
  for (const d of dirs) {
    if (!existsSync(d) || !writable(d)) continue;
    rmSync(join(d, 'ppm'), { force: true });
    symlinkSync(SELF, join(d, 'ppm'));
    ok(`Installed: you can now type 'ppm' anywhere (${join(d, 'ppm')})`);
    return;
  }
  const rc = join(homedir(), process.env.SHELL?.endsWith('/bash') ? '.bash_profile' : '.zshrc');
  const have = existsSync(rc) ? readFileSync(rc, 'utf8') : '';
  if (!have.includes('alias ppm=')) appendFileSync(rc, `alias ppm='${SELF}'\n`);
  ok(`Installed as an alias in ${rc}. Open a new terminal, then type 'ppm'.`);
}
function uninstall() {
  if (WIN) return void (userPath('remove') && ok('Removed ppm from your PATH'));
  for (const d of ['/opt/homebrew/bin', '/usr/local/bin', join(homedir(), '.local/bin')]) {
    const f = join(d, 'ppm');
    try {
      if (lstatSync(f).isSymbolicLink() && resolve(d, readlinkSync(f)) === SELF) {
        rmSync(f);
        ok(`Removed ${f}`);
      }
    } catch {
      // not there
    }
  }
}

const HELP = `${paint('1', 'ppm: Paper Podcast Maker')}

  ppm start [--port N]     start the app in the background (default port ${DEFAULT_PORT};
                           if it is busy, the next free port is used)
  ppm open [--port N]      open the app in your browser (starts it if needed)
  ppm stop [--port N]      stop it
  ppm restart [--port N]   stop, then start again (rebuilds if the code changed)
  ppm status               is it running, and where?
  ppm logs [--no-follow]   follow the server log
  ppm update               git pull and install dependencies
  ppm install              make the 'ppm' command available everywhere
  ppm uninstall            remove the 'ppm' command

  Data and logs live in ${DATA} (set PPM_DATA_DIR to change it).
`;

try {
  const { command, options } = parseArgs(process.argv.slice(2));
  switch (command) {
    case 'start':
      await start(options);
      break;
    case 'open': {
      const port = await start(options);
      openBrowser(url(port));
      break;
    }
    case 'stop':
      await stop(options);
      break;
    case 'restart': {
      const previous = readState()?.port;
      await stop({});
      await start({ ...options, port: options.port ?? previous });
      break;
    }
    case 'status':
      await status();
      break;
    case 'logs':
      logs(options);
      break;
    case 'update':
      update();
      break;
    case 'install':
      install();
      break;
    case 'uninstall':
      uninstall();
      break;
    case 'help':
    case '--help':
    case '-h':
      console.log(HELP);
      break;
    default:
      fail(`Unknown command: ${command}`);
      console.log(HELP);
      process.exit(1);
  }
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
