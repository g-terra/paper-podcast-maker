import { access, constants } from 'node:fs/promises';
import { delimiter, join } from 'node:path';

/** Returns the full path of `command` if it is an executable on PATH, otherwise null. */
export async function findOnPath(
  command: string,
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): Promise<string | null> {
  const dirs = (env.PATH ?? env.Path ?? '').split(delimiter).filter(Boolean);
  const extensions =
    platform === 'win32' ? (env.PATHEXT ?? '.EXE;.CMD;.BAT;.COM').split(';') : [''];

  for (const dir of dirs) {
    for (const ext of extensions) {
      const candidate = join(dir, command + ext);
      try {
        await access(candidate, platform === 'win32' ? constants.F_OK : constants.X_OK);
        return candidate;
      } catch {
        // not here, keep looking
      }
    }
  }
  return null;
}
