import { spawn } from 'node:child_process';

export interface RunOptions {
  stdin?: string;
  timeoutMs?: number;
  cwd?: string;
}

export interface RunResult {
  stdout: string;
  stderr: string;
}

export class CommandError extends Error {
  constructor(
    message: string,
    readonly stderr: string,
  ) {
    super(message);
  }
}

/**
 * Runs a command without a shell and collects its output. On Windows, `.cmd`
 * and `.bat` shims (how npm installs CLIs) need a shell, so arguments must
 * never contain untrusted text there; callers pass user text through stdin
 * or files instead.
 */
export function runCommand(
  command: string,
  args: string[],
  options: RunOptions = {},
): Promise<RunResult> {
  return new Promise((resolvePromise, reject) => {
    const needsShell = process.platform === 'win32' && /\.(cmd|bat)$/i.test(command);
    const child = spawn(needsShell ? `"${command}"` : command, args, {
      cwd: options.cwd,
      shell: needsShell,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (d: string) => (stdout += d));
    child.stderr.setEncoding('utf8').on('data', (d: string) => (stderr += d));

    const timer =
      options.timeoutMs !== undefined
        ? setTimeout(() => {
            child.kill();
            reject(new CommandError(`${command} timed out after ${options.timeoutMs} ms`, stderr));
          }, options.timeoutMs)
        : undefined;

    child.on('error', (error) => {
      clearTimeout(timer);
      reject(new CommandError(`Could not start ${command}: ${error.message}`, stderr));
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolvePromise({ stdout, stderr });
      else {
        const tail = (stderr.trim() || stdout.trim()).split('\n').slice(-5).join('\n');
        reject(new CommandError(`${command} exited with code ${code}: ${tail}`, stderr));
      }
    });

    child.stdin.on('error', () => {
      // The process may exit before reading stdin; the close handler reports it.
    });
    child.stdin.end(options.stdin ?? '');
  });
}
