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
  /** Per-route override of the process-wide trusted-proxy setting. */
  trustProxy?: boolean;
  /** Optional HTML/redirect response when a form endpoint exceeds its limit. */
  onLimit?: (c: Context, retryAfterSec: number) => Response | Promise<Response>;
}

// Deployment invariant: forwarded headers are only trustworthy behind a proxy that
// APPENDS the real client IP to X-Forwarded-For (nginx `proxy_set_header X-Forwarded-For
// $proxy_add_x_forwarded_for;`). Reachable directly, the header is client-controlled,
// so by default every direct client shares one bucket instead of rotating keys.
let defaultTrustProxy = false;

/** Called once from createApp with the RADAR_TRUSTED_PROXY env flag. */
export function configureRateLimit(settings: { trustProxy: boolean }): void {
  defaultTrustProxy = settings.trustProxy;
}

/** The bucket key for a request: the proxy-derived client IP (see rateLimit) or a custom one. */
function bucketKey(c: Context, options: { keyFrom?: (c: Context) => string | undefined; trustProxy?: boolean }): string {
  const trustProxy = options.trustProxy ?? defaultTrustProxy;
  const forwardedParts = trustProxy
    ? c.req.header('x-forwarded-for')?.split(',').map((p) => p.trim()).filter(Boolean) ?? []
    : [];
  return options.keyFrom?.(c) || forwardedParts[forwardedParts.length - 1] || (trustProxy ? c.req.header('x-real-ip') : undefined) || 'local';
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

    const key = bucketKey(c, options);
    const hits = (buckets.get(key) ?? []).filter((ts) => now - ts < options.windowMs);
    // Agents pace themselves by these headers instead of discovering 429s blind.
    c.header('x-ratelimit-limit', String(options.max));
    c.header('x-ratelimit-remaining', String(Math.max(0, options.max - hits.length - 1)));
    c.header('x-ratelimit-reset', String(Math.ceil((now + options.windowMs) / 1000)));
    if (hits.length >= options.max) {
      const retryAfterSec = Math.ceil((hits[0]! + options.windowMs - now) / 1000);
      c.header('retry-after', String(Math.max(1, retryAfterSec)));
      c.header('x-ratelimit-remaining', '0');
      if (options.onLimit) return options.onLimit(c, Math.max(1, retryAfterSec));
      return c.json({ error: 'rate_limited' }, 429);
    }
    hits.push(now);
    buckets.set(key, hits);
    await next();
  };
}

/**
 * Caps concurrent requests per client, not the rate: a crawler that fires 15 parallel
 * search reads fits inside a per-minute budget yet pins the database anyway, because
 * every read runs the heavy BM25 ranking. Excess requests get 429 before the store is
 * touched. The counter releases in `finally`, so a cancelled or failed read never
 * leaks a slot.
 */
export function concurrencyLimit(options: { max: number; keyFrom?: (c: Context) => string | undefined; trustProxy?: boolean }) {
  const active = new Map<string, number>();

  return async (c: Context, next: Next): Promise<Response | void> => {
    const key = bucketKey(c, options);
    const running = active.get(key) ?? 0;
    if (running >= options.max) {
      c.header('retry-after', '5');
      return c.json({ error: 'rate_limited' }, 429);
    }
    active.set(key, running + 1);
    try {
      await next();
    } finally {
      const left = (active.get(key) ?? 1) - 1;
      if (left <= 0) active.delete(key);
      else active.set(key, left);
    }
  };
}
