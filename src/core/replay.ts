import { sha256 } from './fingerprint.ts';

/**
 * Idempotent expensive calls (plan 021E, Firecrawl Alexandria idea): a costly LLM or
 * enrichment call is keyed by a hash of (actor, request payload); a replay inside the
 * window returns the cached result instead of paying twice. In-process and bounded — the
 * decision store already keeps the durable answer, this guards the in-flight window where
 * a retry or a concurrent round could otherwise double-charge before the answer is saved.
 */

export interface ReplayOptions {
  /** How long a result is replayable. Default 10 minutes. */
  windowMs?: number;
  /** Hard cap on remembered keys; the oldest are evicted first. Default 5000. */
  maxEntries?: number;
  now?: () => number;
}

interface Entry<T> {
  value: T;
  at: number;
}

/** The idempotency key: who asks (actor) and exactly what (request). */
export function idempotencyKey(actor: string, request: unknown): string {
  return sha256(`${actor}\n${JSON.stringify(request)}`);
}

/**
 * Runs `call` once per key within the window. A replay returns the cached value without
 * invoking `call`; a concurrent replay awaits the same in-flight promise, so two rounds
 * never pay for the same answer. Failures are not cached: the next round may retry.
 */
export class ReplayCache<T> {
  private readonly done = new Map<string, Entry<T>>();
  private readonly inflight = new Map<string, Promise<T>>();
  private readonly windowMs: number;
  private readonly maxEntries: number;
  private readonly now: () => number;

  constructor(options: ReplayOptions = {}) {
    this.windowMs = options.windowMs ?? 10 * 60_000;
    this.maxEntries = options.maxEntries ?? 5000;
    this.now = options.now ?? Date.now;
  }

  /** True when a fresh result is already cached for the key (no call would be made). */
  has(key: string): boolean {
    const entry = this.done.get(key);
    if (!entry) return false;
    if (this.now() - entry.at > this.windowMs) {
      this.done.delete(key);
      return false;
    }
    return true;
  }

  async run(key: string, call: () => Promise<T>): Promise<{ value: T; replayed: boolean }> {
    const cached = this.done.get(key);
    if (cached && this.now() - cached.at <= this.windowMs) return { value: cached.value, replayed: true };
    if (cached) this.done.delete(key);

    const pending = this.inflight.get(key);
    if (pending) return { value: await pending, replayed: true };

    const promise = call();
    this.inflight.set(key, promise);
    try {
      const value = await promise;
      this.remember(key, value);
      return { value, replayed: false };
    } finally {
      this.inflight.delete(key);
    }
  }

  private remember(key: string, value: T): void {
    this.done.set(key, { value, at: this.now() });
    // Bounded: drop expired entries, then the oldest if still over the cap.
    if (this.done.size > this.maxEntries) {
      const cutoff = this.now() - this.windowMs;
      for (const [k, e] of this.done) if (e.at < cutoff) this.done.delete(k);
      while (this.done.size > this.maxEntries) {
        const oldest = this.done.keys().next().value;
        if (oldest === undefined) break;
        this.done.delete(oldest);
      }
    }
  }

  get size(): number {
    return this.done.size;
  }
}
