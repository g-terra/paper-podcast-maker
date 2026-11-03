import type { AiProviderId, ProviderStatus } from '@paper-podcast/shared';
import { findOnPath } from './path.js';

export interface ProviderDefinition {
  id: AiProviderId;
  label: string;
  /** CLI binary name expected on PATH. */
  command: string;
}

/**
 * The local AI CLIs we know how to drive. Actually invoking them to write a
 * transcript comes in a later change; for now the server only detects them.
 */
export const providerDefinitions: readonly ProviderDefinition[] = [
  { id: 'claude', label: 'Claude Code CLI', command: 'claude' },
  { id: 'codex', label: 'OpenAI Codex CLI', command: 'codex' },
];

export type CommandLocator = (command: string) => Promise<string | null>;

export async function detectProviders(
  locate: CommandLocator = (command) => findOnPath(command),
): Promise<ProviderStatus[]> {
  return Promise.all(
    providerDefinitions.map(async (def) => ({
      ...def,
      available: (await locate(def.command)) !== null,
    })),
  );
}
