import { assertSafeUrl, safeFetchImpl } from '../core/ssrf.ts';
import { readTextLimited } from '../net/body.ts';
import { fetchTextViaProxy } from '../net/proxy.ts';
import type { PollContext } from '../core/types.ts';

export async function fetchText(
  ctx: PollContext,
  initialUrl: string,
  extraHeaders?: Record<string, string>,
  /** Body ceiling; the default fits any page or feed, a few APIs need more. */
  maxBytes?: number,
): Promise<string> {
  if (ctx.proxyUrl) {
    return fetchTextViaProxy(initialUrl, {
      proxyUrl: ctx.proxyUrl,
      userAgent: ctx.userAgent,
      timeoutMs: ctx.timeoutMs,
      headers: extraHeaders,
      maxBytes,
    });
  }

  let currentUrl = initialUrl;
  let redirects = 0;
  const maxRedirects = 5;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ctx.timeoutMs);

  try {
    while (redirects <= maxRedirects) {
      // Защита от SSRF: резолв DNS и проверка на запрещенные приватные IP
      await assertSafeUrl(currentUrl);

      const response = await safeFetchImpl(ctx.fetchImpl)(currentUrl, {
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          'User-Agent': ctx.userAgent,
          Accept: extraHeaders?.Accept ?? 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'ru-RU,ru;q=0.9,en;q=0.8',
          ...extraHeaders,
        },
      });

      // Ручная обработка редиректов с валидацией целевого адреса
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

      return await readTextLimited(response, maxBytes);
    }

    throw new Error(`Too many redirects (max ${maxRedirects})`);
  } finally {
    clearTimeout(timer);
  }
}
