import dns from 'node:dns/promises';

type Lookup = (hostname: string) => Promise<Array<{ address: string; family: number }>>;
const systemLookup: Lookup = (hostname) => dns.lookup(hostname, { all: true });
let lookupImpl: Lookup = systemLookup;

/** Tests only: replaces DNS resolution so unit tests never touch the network. `null` restores it. */
export function setDnsLookupForTests(fn: Lookup | null): void {
  lookupImpl = fn ?? systemLookup;
}

export function isPrivateOrBlockedIp(ip: string): boolean {
  let cleanIp = ip.trim();
  if (cleanIp.startsWith('::ffff:')) {
    cleanIp = cleanIp.slice(7);
  }

  // Check IPv4
  const parts = cleanIp.split('.').map(Number);
  if (parts.length === 4 && parts.every((p) => !isNaN(p) && p >= 0 && p <= 255)) {
    const [b0, b1] = parts;
    // 0.0.0.0/8 (current network)
    if (b0 === 0) return true;
    // 10.0.0.0/8 (private)
    if (b0 === 10) return true;
    // 127.0.0.0/8 (loopback)
    if (b0 === 127) return true;
    // 169.254.0.0/16 (link-local, cloud metadata e.g. 169.254.169.254)
    if (b0 === 169 && b1 === 254) return true;
    // 172.16.0.0/12 (private: 172.16.0.0 - 172.31.255.255)
    if (b0 === 172 && b1 !== undefined && b1 >= 16 && b1 <= 31) return true;
    // 192.168.0.0/16 (private)
    if (b0 === 192 && b1 === 168) return true;
    // 100.64.0.0/10 (carrier-grade NAT)
    if (b0 === 100 && b1 !== undefined && b1 >= 64 && b1 <= 127) return true;
    // 224.0.0.0/4 (multicast)
    if (b0 !== undefined && b0 >= 224) return true;
    return false;
  }

  // Check IPv6
  const normalized = cleanIp.toLowerCase();
  if (normalized === '::1' || normalized === '::') return true;
  // fc00::/7 (unique local)
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;
  // fe80::/10 (link-local)
  if (
    normalized.startsWith('fe8') ||
    normalized.startsWith('fe9') ||
    normalized.startsWith('fea') ||
    normalized.startsWith('feb')
  ) {
    return true;
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
