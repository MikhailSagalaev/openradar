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

const HH_MIRROR_HOST = /^(?:[\w-]+\.)?(?:hh\.(?:ru|kz|uz)|headhunter\.(?:ge|kg)|rabota\.by)$/i;

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
    if (HH_MIRROR_HOST.test(url.hostname) && /^\/vacancy\/\d+(?:\/|$)/.test(url.pathname)) {
      url.protocol = 'https:';
      url.hostname = 'hh.ru';
      url.port = '';
    }

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
