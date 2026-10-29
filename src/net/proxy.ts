/**
 * Optional outbound proxy support (RADAR_PROXY_URL or per-source config.proxyUrl).
 * Used by adapters whose target hosts are unreachable from the server network
 * (e.g. Telegram previews). The proxy bypasses assertSafeUrl deliberately:
 * the target host is fixed by the adapter and the channel name is validated,
 * so the SSRF surface is unchanged.
 */

import { fetch as undiciFetch, ProxyAgent } from 'undici';
import { readTextLimited } from './body.ts';

let cachedAgent: { url: string; agent: ProxyAgent } | undefined;

/**
 * The proxy a source asked for: its own `config.proxyUrl`, or RADAR_PROXY_URL with
 * `config.proxy: true`. Boards reachable directly stay direct.
 */
export function sourceProxyUrl(config?: Record<string, unknown>): string | undefined {
  if (typeof config?.proxyUrl === 'string' && config.proxyUrl.trim()) return config.proxyUrl.trim();
  return config?.proxy === true ? process.env.RADAR_PROXY_URL?.trim() || undefined : undefined;
}

export function resolveProxyUrl(config?: Record<string, unknown>): string | undefined {
  const fromConfig = typeof config?.proxyUrl === 'string' ? config.proxyUrl.trim() : '';
  return fromConfig || process.env.RADAR_PROXY_URL?.trim() || undefined;
}

export function getProxyAgent(proxyUrl: string): ProxyAgent {
  if (!cachedAgent || cachedAgent.url !== proxyUrl) {
    cachedAgent = { url: proxyUrl, agent: new ProxyAgent(proxyUrl) };
  }
  return cachedAgent.agent;
}

export interface ProxiedTextOptions {
  proxyUrl: string;
  userAgent: string;
  timeoutMs: number;
  headers?: Record<string, string>;
  maxRedirects?: number;
}

/**
 * Fetches a URL through the configured proxy with manual redirect handling —
 * the same contract as fetchText, but over undici's ProxyAgent.
 */
export async function fetchTextViaProxy(
  initialUrl: string,
  options: ProxiedTextOptions,
): Promise<string> {
  const agent = getProxyAgent(options.proxyUrl);
  const maxRedirects = options.maxRedirects ?? 5;
  let currentUrl = initialUrl;
  let redirects = 0;

  while (redirects <= maxRedirects) {
    const response = await undiciFetch(currentUrl, {
      dispatcher: agent,
      redirect: 'manual',
      signal: AbortSignal.timeout(options.timeoutMs),
      headers: {
        'User-Agent': options.userAgent,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ru-RU,ru;q=0.9,en;q=0.8',
        ...options.headers,
      },
    });

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (!location) {
        throw new Error(`HTTP ${response.status} redirect without Location header from ${currentUrl}`);
      }
      redirects++;
      if (redirects > maxRedirects) {
        throw new Error(`Too many redirects (max ${maxRedirects})`);
      }
      currentUrl = new URL(location, currentUrl).toString();
      continue;
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} for ${currentUrl}`);
    }

    return await readTextLimited(response);
  }

  throw new Error(`Too many redirects (max ${maxRedirects})`);
}
