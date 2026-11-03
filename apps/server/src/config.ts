export interface ServerConfig {
  host: string;
  port: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  return {
    // Bind to loopback by default: this server is only meant for the local UI.
    host: env.PPM_HOST ?? '127.0.0.1',
    port: Number(env.PPM_PORT ?? 8787),
  };
}
