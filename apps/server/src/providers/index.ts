import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AiProviderId, ProviderStatus } from '@paper-podcast/shared';
import { runCommand } from '../run.js';
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
    const { stdout } = await runCommand(executable, args, { stdin: prompt, timeoutMs });
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

export async function detectProviders(
  locate: CommandLocator = defaultLocator,
): Promise<ProviderStatus[]> {
  return Promise.all(
    providerDefinitions.map(async ({ id, label, command }) => ({
      id,
      label,
      command,
      available: (await locate(command)) !== null,
    })),
  );
}
