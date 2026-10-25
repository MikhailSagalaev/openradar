import type { Context, Next } from 'hono';

interface RateLimitOptions {
  /** Sliding window in milliseconds. */
  windowMs: number;
  /** Maximum requests per window per client. */
  max: number;
  /**
   * Custom bucket key (e.g. a mesh node key instead of the spoofable IP).
   * Falls back to the proxy-derived client IP.
   */
  keyFrom?: (c: Context) => string | undefined;
}

/**
 * Fixed in-memory sliding-window limiter. State lives in the limiter instance,
 * so each route (and each app instance in tests) has its own bucket set.
 * Enough for a single-node self-hosted service; a shared store would be
 * needed for a cluster.
 */
export function rateLimit(options: RateLimitOptions) {
  const buckets = new Map<string, number[]>();

  return async (c: Context, next: Next): Promise<Response | void> => {
    const now = Date.now();
    if (buckets.size > 10_000) {
      for (const [key, hits] of buckets.entries()) {
        const alive = hits.filter((ts) => now - ts < options.windowMs);
        if (alive.length === 0) buckets.delete(key);
        else buckets.set(key, alive);
      }
    }

    // Our nginx APPENDS the real client IP to X-Forwarded-For, so the LAST
    // value is the only one the client cannot spoof by sending its own header.
    const forwardedParts = c.req.header('x-forwarded-for')?.split(',').map((p) => p.trim()).filter(Boolean) ?? [];
    const client = options.keyFrom?.(c) || forwardedParts[forwardedParts.length - 1] || c.req.header('x-real-ip') || 'local';
    const key = client;
    const hits = (buckets.get(key) ?? []).filter((ts) => now - ts < options.windowMs);
    if (hits.length >= options.max) {
      const retryAfterSec = Math.ceil((hits[0]! + options.windowMs - now) / 1000);
      c.header('retry-after', String(Math.max(1, retryAfterSec)));
      return c.json({ error: 'rate_limited' }, 429);
    }
    hits.push(now);
    buckets.set(key, hits);
    await next();
  };
}
