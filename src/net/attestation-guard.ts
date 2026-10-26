/**
 * Attestation Guard for OpenRadar Mesh Nodes.
 * Prevents DDoS amplification and SSRF via rogue attestation events:
 * 1. Strictly whitelists allowed public freelancing & job board domains.
 * 2. Rate-limits attestation crawls per domain and per publisher pubkey.
 */

export const ATTESTATION_ALLOWED_DOMAINS = new Set([
  'fl.ru',
  'habr.com',
  'kwork.ru',
  't.me',
  'hh.ru',
  'remoteok.com',
  'weworkremotely.com',
  'trudvsem.ru',
  'freelance.ru',
  'vc.ru',
  'openradar.fun',
]);

export function isAllowedAttestationDomain(urlStr: string): boolean {
  try {
    const parsed = new URL(urlStr);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    const hostname = parsed.hostname.toLowerCase();
    for (const allowed of ATTESTATION_ALLOWED_DOMAINS) {
      if (hostname === allowed || hostname.endsWith(`.${allowed}`)) {
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

export class AttestationRateLimiter {
  private domainTimestamps = new Map<string, number[]>();
  private pubkeyTimestamps = new Map<string, number[]>();

  constructor(
    private maxPerDomainPerHour: number = 10,
    private maxPerPubkeyPerHour: number = 30,
  ) {}

  canAttest(urlStr: string, pubkey: string, now: number = Date.now()): boolean {
    let hostname: string;
    try {
      hostname = new URL(urlStr).hostname.toLowerCase();
    } catch {
      return false;
    }

    const windowStart = now - 3600 * 1000;

    const domainHits = (this.domainTimestamps.get(hostname) ?? []).filter((t) => t > windowStart);
    if (domainHits.length >= this.maxPerDomainPerHour) {
      return false;
    }

    const pubkeyHits = (this.pubkeyTimestamps.get(pubkey) ?? []).filter((t) => t > windowStart);
    if (pubkeyHits.length >= this.maxPerPubkeyPerHour) {
      return false;
    }

    domainHits.push(now);
    this.domainTimestamps.set(hostname, domainHits);

    pubkeyHits.push(now);
    this.pubkeyTimestamps.set(pubkey, pubkeyHits);

    return true;
  }

  reset(): void {
    this.domainTimestamps.clear();
    this.pubkeyTimestamps.clear();
  }
}
