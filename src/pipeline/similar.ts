import { estimateJaccardFromSketches } from '../core/fingerprint.ts';
import type { Store } from '../core/store.ts';

/** Rule 4 of docs/PROTOCOL.md: texts this similar within this window are one lead. */
export const SIMILAR_JACCARD = 0.85;
export const SIMILAR_WINDOW_MS = 7 * 24 * 3600 * 1000;
/** Texts shorter than this (in words) are too generic to merge by similarity alone. */
export const SIMILAR_MIN_WORDS = 15;

interface Entry {
  id: string;
  createdAtMs: number;
  sketch: string;
}

function isEmptySketch(sketch: string): boolean {
  return !sketch || /^A*$/.test(sketch);
}

/**
 * In-process index of recent MinHash sketches. Loaded lazily from the store once,
 * then kept current by `add` after every insert. A linear scan over a week of leads
 * is a few milliseconds; the hub is a single process.
 */
export class SimilarIndex {
  private entries: Entry[] = [];
  private loading?: Promise<void>;

  constructor(private readonly store: Pick<Store, 'listRecentSketches'>, private readonly maxEntries = 50_000) {}

  private async ensureLoaded(now: Date): Promise<void> {
    this.loading ??= (async () => {
      const since = new Date(now.getTime() - SIMILAR_WINDOW_MS).toISOString();
      const rows = await this.store.listRecentSketches(since, this.maxEntries);
      const loaded = rows
        .filter((r) => !isEmptySketch(r.minhash))
        .map((r) => ({ id: r.id, createdAtMs: Date.parse(r.createdAt), sketch: r.minhash }));
      // keep anything added while loading
      const seen = new Set(this.entries.map((e) => e.id));
      this.entries = [...loaded.filter((e) => !seen.has(e.id)), ...this.entries];
    })();
    await this.loading;
  }

  private prune(now: Date): void {
    const cutoff = now.getTime() - SIMILAR_WINDOW_MS;
    if (this.entries.length && (this.entries.length > this.maxEntries || this.entries[0]!.createdAtMs < cutoff)) {
      this.entries = this.entries.filter((e) => e.createdAtMs >= cutoff).slice(-this.maxEntries);
    }
  }

  async findSimilar(sketch: string, now: Date, threshold = SIMILAR_JACCARD): Promise<string | undefined> {
    if (isEmptySketch(sketch)) return undefined;
    await this.ensureLoaded(now);
    this.prune(now);
    const cutoff = now.getTime() - SIMILAR_WINDOW_MS;
    let best: { id: string; j: number } | undefined;
    for (let i = this.entries.length - 1; i >= 0; i--) {
      const e = this.entries[i]!;
      if (e.createdAtMs < cutoff) continue;
      const j = estimateJaccardFromSketches(sketch, e.sketch);
      if (j >= threshold && (!best || j > best.j)) best = { id: e.id, j };
    }
    return best?.id;
  }

  add(id: string, sketch: string | undefined, createdAt: string): void {
    if (!sketch || isEmptySketch(sketch)) return;
    this.entries.push({ id, createdAtMs: Date.parse(createdAt), sketch });
  }

  remove(id: string): void {
    this.entries = this.entries.filter((e) => e.id !== id);
  }
}
