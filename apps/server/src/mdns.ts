import { networkInterfaces, type NetworkInterfaceInfo } from 'node:os';
import makeMdns from 'multicast-dns';
import type { Answer } from 'dns-packet';

/** Shown in service browsers (Finder, Bonjour browsers) next to the `_http._tcp` service. */
export const SERVICE_LABEL = 'Paper Podcast Maker';
const SERVICE_TYPE = '_http._tcp.local';
const TTL = 120;

/** `Paper-Podcast.local.` → `paper-podcast`; throws for names a `.local` host can't have. */
export function normalizeHostLabel(name: string): string {
  const label = name
    .trim()
    .toLowerCase()
    .replace(/\.$/, '')
    .replace(/\.local$/, '');
  if (!/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(label)) {
    throw new Error(`Not a valid mDNS name: "${name}" (use letters, digits and dashes)`);
  }
  return label;
}

/** The IPv4 addresses other devices on the network can reach (no loopback, no link-local). */
export function lanAddresses(
  interfaces: NodeJS.Dict<NetworkInterfaceInfo[]> = networkInterfaces(),
): string[] {
  const found = new Set<string>();
  for (const infos of Object.values(interfaces)) {
    for (const info of infos ?? []) {
      if (info.family !== 'IPv4' || info.internal || info.address.startsWith('169.254.')) continue;
      found.add(info.address);
    }
  }
  return [...found];
}

/** The records that answer a query for `<host>.local` or for the `_http._tcp` service. */
export function mdnsRecords(host: string, port: number, addresses: string[], ttl = TTL) {
  const hostname = `${host}.local`;
  const instance = `${SERVICE_LABEL}.${SERVICE_TYPE}`;
  const a: Answer[] = addresses.map((data) => ({ name: hostname, type: 'A', ttl, data }));
  const srv: Answer = {
    name: instance,
    type: 'SRV',
    ttl,
    data: { port, target: hostname, priority: 0, weight: 0 },
  };
  const txt: Answer = { name: instance, type: 'TXT', ttl, data: ['path=/'] };
  const ptr: Answer = { name: SERVICE_TYPE, type: 'PTR', ttl, data: instance };
  return { hostname, instance, a, srv, txt, ptr };
}

export interface MdnsHandle {
  hostname: string;
  stop(): Promise<void>;
}

/** Answers mDNS queries for `<name>.local` and advertises the app as an `_http._tcp` service. */
export function startMdns(name: string, port: number): MdnsHandle {
  const host = normalizeHostLabel(name);
  const mdns = makeMdns();
  const records = (ttl?: number) => mdnsRecords(host, port, lanAddresses(), ttl);
  const { hostname, instance } = records();

  mdns.on('query', (query) => {
    const r = records();
    const answers: Answer[] = [];
    const additionals: Answer[] = [];
    for (const q of query.questions) {
      const qname = q.name.toLowerCase();
      // dns-packet decodes type 255 as 'ANY', which its typings leave out.
      const any = (q.type as string) === 'ANY';
      if (qname === hostname && (q.type === 'A' || any)) answers.push(...r.a);
      if (qname === SERVICE_TYPE && (q.type === 'PTR' || any)) {
        answers.push(r.ptr);
        additionals.push(r.srv, r.txt, ...r.a);
      }
      if (qname === instance.toLowerCase()) {
        if (q.type === 'SRV' || any) answers.push(r.srv);
        if (q.type === 'TXT' || any) answers.push(r.txt);
        additionals.push(...r.a);
      }
    }
    if (answers.length) mdns.respond({ answers, additionals });
  });

  // Announce once so browsers already listening see the service right away.
  const r = records();
  mdns.respond({ answers: [...r.a, r.ptr, r.srv, r.txt] });

  return {
    hostname,
    stop: () =>
      new Promise((done) => {
        // A TTL of 0 tells other devices to forget the records ("goodbye").
        const bye = records(0);
        mdns.respond({ answers: [...bye.a, bye.ptr, bye.srv, bye.txt] }, () =>
          mdns.destroy(() => done()),
        );
      }),
  };
}
