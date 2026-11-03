import { describe, expect, it } from 'vitest';
import { loadConfig, portFromArgs } from './config.js';

describe('config', () => {
  it('reads the port from args, then env, then the default', () => {
    expect(portFromArgs(['--port', '9000'])).toBe('9000');
    expect(portFromArgs(['--port=9001'])).toBe('9001');
    expect(loadConfig({}, ['-p', '9002']).port).toBe(9002);
    expect(loadConfig({ PPM_PORT: '9003' }, []).port).toBe(9003);
    expect(loadConfig({}, []).port).toBe(8787);
  });

  it('rejects bad ports', () => {
    expect(() => loadConfig({}, ['--port', 'abc'])).toThrow(/Invalid port/);
  });
});
