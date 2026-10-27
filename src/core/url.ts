const TRACKING_PARAMS = new Set([
  'gclid',
  'dclid',
  'fbclid',
  'yclid',
  'msclkid',
  'mc_cid',
  'mc_eid',
  'ref',
  'referrer',
  'source',
  'from',
  '_openstat',
]);

export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Canonical form used only for deduplication. It intentionally drops
 * fragments and campaign parameters, sorts the rest and removes a trailing
 * slash so the same vacancy from two feeds hashes to one key.
 */
export function canonicalizeUrl(raw: string, base?: string): string | undefined {
  if (!raw) return undefined;
  try {
    const url = new URL(raw, base);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined;
    url.hash = '';
    url.hostname = url.hostname.toLowerCase();

    for (const key of [...url.searchParams.keys()]) {
      const lower = key.toLowerCase();
      if (TRACKING_PARAMS.has(lower) || lower.startsWith('utm_')) {
        url.searchParams.delete(key);
      }
    }
    url.searchParams.sort();

    let pathname = url.pathname.replace(/\/+$/, '');
    if (!pathname) pathname = '/';

    return `${url.protocol}//${url.host}${pathname}${url.search}`;
  } catch {
    return undefined;
  }
}

export function domainOf(raw: string): string | undefined {
  try {
    return new URL(raw).hostname.replace(/^www\./, '');
  } catch {
    return undefined;
  }
}
