import { describe, expect, it } from 'vitest';
import type { NetworkInterfaceInfo } from 'node:os';
import { loadConfig } from './config.js';
import { lanAddresses, mdnsRecords, normalizeHostLabel } from './mdns.js';

const iface = (address: string, family: 'IPv4' | 'IPv6', internal = false) =>
  ({ address, family, internal, netmask: '', mac: '', cidr: null }) as NetworkInterfaceInfo;

describe('lanAddresses', () => {
  it('keeps reachable IPv4 addresses only', () => {
    const addresses = lanAddresses({
      lo0: [iface('127.0.0.1', 'IPv4', true), iface('::1', 'IPv6', true)],
      en0: [iface('fe80::1', 'IPv6'), iface('192.168.1.20', 'IPv4')],
      en5: [iface('169.254.10.3', 'IPv4')],
      bridge0: [iface('10.0.0.5', 'IPv4'), iface('192.168.1.20', 'IPv4')],
    });
    expect(addresses).toEqual(['192.168.1.20', '10.0.0.5']);
  });
});

describe('normalizeHostLabel', () => {
  it('accepts names with or without .local', () => {
    expect(normalizeHostLabel('Paper-Podcast.local.')).toBe('paper-podcast');
    expect(normalizeHostLabel('studio1')).toBe('studio1');
  });

  it('rejects names a host cannot have', () => {
    expect(() => normalizeHostLabel('my podcast')).toThrow(/Not a valid mDNS name/);
    expect(() => normalizeHostLabel('-bad')).toThrow();
    expect(() => normalizeHostLabel('')).toThrow();
  });
});

describe('mdnsRecords', () => {
  it('points the service at the host on the given port', () => {
    const r = mdnsRecords('paper-podcast', 9000, ['192.168.1.20']);
    expect(r.a).toEqual([
      { name: 'paper-podcast.local', type: 'A', ttl: 120, data: '192.168.1.20' },
    ]);
    expect(r.srv.data).toMatchObject({ port: 9000, target: 'paper-podcast.local' });
    expect(r.ptr).toMatchObject({ name: '_http._tcp.local', data: r.instance });
  });
});

describe('loadConfig mDNS settings', () => {
  it('is off and loopback-only by default', () => {
    const config = loadConfig({});
    expect(config.mdns).toBe(false);
    expect(config.host).toBe('127.0.0.1');
  });

  it('listens on every interface when PPM_MDNS is on', () => {
    const config = loadConfig({ PPM_MDNS: '1', PPM_MDNS_NAME: 'studio' });
    expect(config).toMatchObject({ mdns: true, host: '0.0.0.0', mdnsName: 'studio' });
    expect(loadConfig({ PPM_MDNS: 'true', PPM_HOST: '192.168.1.20' }).host).toBe('192.168.1.20');
    expect(loadConfig({ PPM_MDNS: '0' }).mdns).toBe(false);
  });
});
