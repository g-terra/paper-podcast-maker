import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  providerModels,
  type AiProviderId,
  type ModelOption,
  type ProviderStatus,
} from '@paper-podcast/shared';
import { CommandError, runCommand } from '../run.js';
import { findOnPath } from './path.js';

export interface GenerateOptions {
  model: string;
  timeoutMs: number;
}

export interface ProviderDefinition {
  id: AiProviderId;
  label: string;
  /** CLI binary name expected on PATH. */
  command: string;
  /** Sends `prompt` to the CLI and returns the model's final text answer. */
  generate(executable: string, prompt: string, options: GenerateOptions): Promise<string>;
}

const claude: ProviderDefinition = {
  id: 'claude',
  label: 'Claude Code CLI',
  command: 'claude',
  async generate(executable, prompt, { model, timeoutMs }) {
    // Print mode, no tools: we only want text back. The prompt goes over stdin
    // because a paper is far too long for a command-line argument.
    const args = ['-p', '--output-format', 'json', '--tools', '', '--no-session-persistence'];
    if (model) args.push('--model', model);
    let stdout: string;
    try {
      ({ stdout } = await runCommand(executable, args, { stdin: prompt, timeoutMs }));
    } catch (error) {
      // On failure the CLI still prints its JSON result; report just its message.
      const reason = error instanceof CommandError ? claudeErrorText(error.stdout) : undefined;
      if (reason) throw new Error(`Claude CLI failed: ${reason}`, { cause: error });
      throw error;
    }
    let parsed: { result?: unknown; is_error?: boolean };
    try {
      parsed = JSON.parse(stdout) as typeof parsed;
    } catch {
      return stdout;
    }
    if (parsed.is_error) throw new Error(`Claude CLI reported an error: ${String(parsed.result)}`);
    if (typeof parsed.result !== 'string') throw new Error('Claude CLI returned no result text');
    return parsed.result;
  },
};

/** The `result` text of a Claude CLI JSON reply, if the output is one. */
export function claudeErrorText(stdout: string): string | undefined {
  try {
    const parsed = JSON.parse(stdout) as { result?: unknown };
    return typeof parsed.result === 'string' && parsed.result ? parsed.result : undefined;
  } catch {
    return undefined;
  }
}

const codex: ProviderDefinition = {
  id: 'codex',
  label: 'OpenAI Codex CLI',
  command: 'codex',
  async generate(executable, prompt, { model, timeoutMs }) {
    // Run in an empty temp folder with a read-only sandbox, and read the final
    // message from a file so agent progress output doesn't get mixed in.
    const dir = await mkdtemp(join(tmpdir(), 'ppm-codex-'));
    try {
      const outFile = join(dir, 'last-message.txt');
      const args = [
        'exec',
        '--skip-git-repo-check',
        '--ephemeral',
        '--sandbox',
        'read-only',
        '--color',
        'never',
        '-C',
        dir,
        '-o',
        outFile,
      ];
      if (model) args.push('--model', model);
      args.push('-');
      await runCommand(executable, args, { stdin: prompt, timeoutMs, cwd: dir });
      return await readFile(outFile, 'utf8');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  },
};

export const providerDefinitions: readonly ProviderDefinition[] = [claude, codex];

export type CommandLocator = (command: string) => Promise<string | null>;
export const defaultLocator: CommandLocator = (command) => findOnPath(command);

export function getProvider(id: AiProviderId): ProviderDefinition {
  const provider = providerDefinitions.find((p) => p.id === id);
  if (!provider) throw new Error(`Unknown provider ${id}`);
  return provider;
}

/** Parses `codex debug models` JSON into the listed models. */
export function parseCodexModels(stdout: string): ModelOption[] {
  const parsed = JSON.parse(stdout) as {
    models?: { slug?: string; display_name?: string; visibility?: string; priority?: number }[];
  };
  return (parsed.models ?? [])
    .filter((m) => m.slug && m.visibility !== 'hide')
    .sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0))
    .map((m) => ({ id: m.slug!, label: m.display_name || m.slug! }));
}

/** The `model = "..."` line of ~/.codex/config.toml, if any. */
export function parseCodexDefault(toml: string): string | undefined {
  return /^\s*model\s*=\s*"([^"]+)"/m.exec(toml)?.[1];
}

export type ModelLister = (id: AiProviderId, executable: string) => Promise<ModelOption[]>;

/** Models for a CLI, best effort: Codex can list its catalog; Claude only takes known names. */
export const defaultModelLister: ModelLister = async (id, executable) => {
  if (id !== 'codex') return providerModels[id];
  let models: ModelOption[] = [];
  try {
    const { stdout } = await runCommand(executable, ['debug', 'models'], { timeoutMs: 20_000 });
    models = parseCodexModels(stdout);
  } catch {
    // `debug models` is an internal command and may change; fall back to the CLI default.
  }
  const configured = parseCodexDefault(
    await readFile(join(homedir(), '.codex', 'config.toml'), 'utf8').catch(() => ''),
  );
  if (configured) {
    // Put the user's configured model first so it is the default.
    const label = models.find((m) => m.id === configured)?.label ?? configured;
    models = [
      { id: configured, label: `${label} (your default)` },
      ...models.filter((m) => m.id !== configured),
    ];
  }
  return models.length ? models : providerModels.codex;
};

let modelCache: Partial<Record<AiProviderId, ModelOption[]>> = {};
export function clearModelCache() {
  modelCache = {};
}

export async function detectProviders(
  locate: CommandLocator = defaultLocator,
  listModels: ModelLister = defaultModelLister,
): Promise<ProviderStatus[]> {
  return Promise.all(
    providerDefinitions.map(async ({ id, label, command }) => {
      const exe = await locate(command);
      if (exe && !modelCache[id]) modelCache[id] = await listModels(id, exe);
      return {
        id,
        label,
        command,
        available: exe !== null,
        models: (exe && modelCache[id]) || providerModels[id],
      };
    }),
  );
}
