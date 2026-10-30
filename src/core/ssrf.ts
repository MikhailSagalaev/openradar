import dns from 'node:dns/promises';
import { lookup as dnsLookupCb, type LookupAddress } from 'node:dns';
import net from 'node:net';
import { Agent, fetch as undiciFetch } from 'undici';

type Lookup = (hostname: string) => Promise<Array<{ address: string; family: number }>>;
const systemLookup: Lookup = (hostname) => dns.lookup(hostname, { all: true });
let lookupImpl: Lookup = systemLookup;

/** Tests only: replaces DNS resolution so unit tests never touch the network. `null` restores it. */
export function setDnsLookupForTests(fn: Lookup | null): void {
  lookupImpl = fn ?? systemLookup;
}

function isBlockedIpv4([a, b, c]: number[]): boolean {
  if (a === undefined || b === undefined || c === undefined) return true;
  return (
    a === 0 || // 0.0.0.0/8 (current network)
    a === 10 || // 10.0.0.0/8 (private)
    a === 127 || // 127.0.0.0/8 (loopback)
    (a === 169 && b === 254) || // 169.254.0.0/16 (link-local, cloud metadata e.g. 169.254.169.254)
    (a === 172 && b >= 16 && b <= 31) || // 172.16.0.0/12 (private)
    (a === 192 && b === 168) || // 192.168.0.0/16 (private)
    (a === 100 && b >= 64 && b <= 127) || // 100.64.0.0/10 (carrier-grade NAT)
    (a === 192 && b === 0 && c === 0) || // 192.0.0.0/24 (IETF protocol assignments)
    (a === 198 && (b === 18 || b === 19)) || // 198.18.0.0/15 (benchmarking)
    a >= 224 // 224.0.0.0/4 multicast and 240.0.0.0/4 reserved
  );
}

/** The 16 bytes of an IPv6 address, or undefined when it does not parse. */
function ipv6Bytes(ip: string): number[] | undefined {
  let text = ip.split('%')[0] ?? '';
  const tail: number[] = [];
  // A dotted IPv4 tail (::ffff:1.2.3.4) becomes the last four bytes.
  const dotted = /(\d+\.\d+\.\d+\.\d+)$/.exec(text);
  if (dotted?.[1]) {
    if (!net.isIPv4(dotted[1])) return undefined;
    tail.push(...dotted[1].split('.').map(Number));
    text = text.slice(0, -dotted[1].length);
    if (text.endsWith(':') && !text.endsWith('::')) text = text.slice(0, -1);
  }
  const halves = text.split('::');
  if (halves.length > 2) return undefined;
  const words = (part: string | undefined) => (part ? part.split(':') : []);
  const head = words(halves[0]);
  const rest = words(halves[1]);
  const missing = 8 - tail.length / 2 - head.length - rest.length;
  if (halves.length === 1 ? missing !== 0 : missing < 0) return undefined;
  const hextets = [...head, ...Array<string>(halves.length === 2 ? missing : 0).fill('0'), ...rest];
  const bytes: number[] = [];
  for (const h of hextets) {
    if (!/^[0-9a-f]{1,4}$/i.test(h)) return undefined;
    const v = parseInt(h, 16);
    bytes.push(v >> 8, v & 0xff);
  }
  bytes.push(...tail);
  return bytes.length === 16 ? bytes : undefined;
}

function isBlockedIpv6(b: number[]): boolean {
  const zeros = (from: number, to: number) => b.slice(from, to).every((x) => x === 0);
  // IPv4 inside IPv6: mapped ::ffff:0:0/96 and compatible ::/96 (:: and ::1 included) reach
  // the IPv4 address on a dual-stack host, so the embedded address decides.
  if (zeros(0, 10) && ((b[10] === 0xff && b[11] === 0xff) || (b[10] === 0 && b[11] === 0))) {
    return isBlockedIpv4(b.slice(12));
  }
  // NAT64 64:ff9b::/96 translates to the embedded IPv4 address; 64:ff9b:1::/48 is local-use.
  if (b[0] === 0x00 && b[1] === 0x64 && b[2] === 0xff && b[3] === 0x9b) {
    return zeros(4, 12) ? isBlockedIpv4(b.slice(12)) : b[4] === 0 && b[5] === 1;
  }
  // 6to4 2002::/16 carries an IPv4 address in bytes 2-5.
  if (b[0] === 0x20 && b[1] === 0x02) return isBlockedIpv4(b.slice(2, 6));
  // Teredo 2001::/32 tunnels to an obfuscated IPv4 address; nothing a source needs lives there.
  if (b[0] === 0x20 && b[1] === 0x01 && b[2] === 0 && b[3] === 0) return true;
  const [b0 = 0, b1 = 0] = b;
  if ((b0 & 0xfe) === 0xfc) return true; // fc00::/7 (unique local)
  if (b0 === 0xfe && (b1 & 0x80) === 0x80) return true; // fe80::/10 link-local, fec0::/10 site-local
  if (b0 === 0xff) return true; // ff00::/8 multicast
  return false;
}

/** True for an IP address no outgoing request may reach. A hostname that is not an IP is false. */
export function isPrivateOrBlockedIp(ip: string): boolean {
  const clean = ip.trim().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (net.isIPv4(clean)) return isBlockedIpv4(clean.split('.').map(Number));
  if (net.isIPv6(clean)) {
    const bytes = ipv6Bytes(clean.toLowerCase());
    return bytes ? isBlockedIpv6(bytes) : true;
  }
  return false;
}

export async function assertSafeUrl(urlString: string): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(urlString);
  } catch {
    throw new Error(`Invalid URL: "${urlString}"`);
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Blocked unsafe protocol "${parsed.protocol}". Only http: and https: are permitted.`);
  }

  const hostname = parsed.hostname.replace(/^\[|\]$/g, '');

  // Direct IP literal in URL
  if (isPrivateOrBlockedIp(hostname)) {
    throw new Error(`Blocked request to private/internal IP address: ${hostname}`);
  }

  // Resolve hostname via DNS
  try {
    const addresses = await lookupImpl(hostname);
    for (const addr of addresses) {
      if (isPrivateOrBlockedIp(addr.address)) {
        throw new Error(
          `Blocked request to private/internal IP address (${addr.address}) for host: ${hostname}`,
        );
      }
    }
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('Blocked request')) {
      throw err;
    }
    throw new Error(`DNS lookup failed for host "${hostname}": ${err instanceof Error ? err.message : String(err)}`);
  }

  return parsed;
}

type LookupCallback = (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void;

/**
 * DNS lookup for the connection itself. assertSafeUrl resolves the name before the request,
 * but the connection resolves it again; a name that answers with a public address first and
 * a private one second (DNS rebinding) would slip through without this check.
 */
function guardedLookup(hostname: string, options: { family?: number; all?: boolean }, callback: LookupCallback): void {
  dnsLookupCb(hostname, { family: options.family ?? 0, all: true }, (err, addresses) => {
    if (err) return callback(err, '');
    const blocked = addresses.find((a) => isPrivateOrBlockedIp(a.address));
    if (blocked) {
      return callback(new Error(`Blocked request to private/internal IP address (${blocked.address}) for host: ${hostname}`), '');
    }
    if (options.all) return callback(null, addresses);
    const first = addresses[0];
    if (!first) return callback(new Error(`DNS lookup returned no address for host: ${hostname}`), '');
    callback(null, first.address, first.family);
  });
}

let guardedAgent: Agent | undefined;

/** fetch whose connections refuse private addresses, whatever the name resolves to at connect time. */
export const guardedFetch = ((input: string | URL, init?: RequestInit) => {
  guardedAgent ??= new Agent({ connect: { lookup: guardedLookup as never } });
  return undiciFetch(input, { ...(init as object), dispatcher: guardedAgent });
}) as unknown as typeof fetch;

/** The fetch for user-supplied URLs: the real network goes through guardedFetch, test doubles stay as they are. */
export function safeFetchImpl(fetchImpl: typeof fetch | undefined): typeof fetch {
  return !fetchImpl || fetchImpl === globalThis.fetch ? guardedFetch : fetchImpl;
}
