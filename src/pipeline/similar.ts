import { computeMinHashBands, estimateJaccardFromSketches } from '../core/fingerprint.ts';
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
 * In-process LSH index of recent MinHash sketches. Uses 16-band Locality-Sensitive Hashing
 * to prune candidate search from O(N) linear scans down to O(1) indexed lookups.
 */
export class SimilarIndex {
  private entries: Entry[] = [];
  private buckets = new Map<string, Set<Entry>>();
  private loading?: Promise<void>;

  constructor(private readonly store: Pick<Store, 'listRecentSketches'>, private readonly maxEntries = 50_000) {}

  private addEntry(entry: Entry): void {
    this.entries.push(entry);
    const bands = computeMinHashBands(entry.sketch);
    for (const b of bands) {
      let set = this.buckets.get(b);
      if (!set) {
        set = new Set();
        this.buckets.set(b, set);
      }
      set.add(entry);
    }
  }

  private async ensureLoaded(now: Date): Promise<void> {
    this.loading ??= (async () => {
      const since = new Date(now.getTime() - SIMILAR_WINDOW_MS).toISOString();
      const rows = await this.store.listRecentSketches(since, this.maxEntries);
      const loaded = rows
        .filter((r) => !isEmptySketch(r.minhash))
        .map((r) => ({ id: r.id, createdAtMs: Date.parse(r.createdAt), sketch: r.minhash }));
      // keep anything added while loading
      const seen = new Set(this.entries.map((e) => e.id));
      for (const item of loaded) {
        if (!seen.has(item.id)) {
          this.addEntry(item);
        }
      }
      // prune() takes the first entry as the oldest: entries added while loading came first.
      this.entries.sort((a, b) => a.createdAtMs - b.createdAtMs);
    })();
    await this.loading;
  }

  private prune(now: Date): void {
    const cutoff = now.getTime() - SIMILAR_WINDOW_MS;
    if (this.entries.length && (this.entries.length > this.maxEntries || this.entries[0]!.createdAtMs < cutoff)) {
      const kept = this.entries.filter((e) => e.createdAtMs >= cutoff).slice(-this.maxEntries);
      const keptSet = new Set(kept);
      for (const e of this.entries) {
        if (!keptSet.has(e)) {
          const bands = computeMinHashBands(e.sketch);
          for (const b of bands) {
            const set = this.buckets.get(b);
            if (set) {
              set.delete(e);
              if (set.size === 0) this.buckets.delete(b);
            }
          }
        }
      }
      this.entries = kept;
    }
  }

  async findSimilar(sketch: string, now: Date, threshold = SIMILAR_JACCARD): Promise<string | undefined> {
    if (isEmptySketch(sketch)) return undefined;
    await this.ensureLoaded(now);
    this.prune(now);

    const cutoff = now.getTime() - SIMILAR_WINDOW_MS;
    const bands = computeMinHashBands(sketch);
    if (!bands.length) return undefined;

    // Collect candidate entries matching at least 1 LSH band
    const candidates = new Set<Entry>();
    for (const b of bands) {
      const bucket = this.buckets.get(b);
      if (bucket) {
        for (const e of bucket) {
          if (e.createdAtMs >= cutoff) {
            candidates.add(e);
          }
        }
      }
    }

    if (candidates.size === 0) return undefined;

    let best: { id: string; j: number } | undefined;
    for (const e of candidates) {
      const j = estimateJaccardFromSketches(sketch, e.sketch);
      if (j >= threshold && (!best || j > best.j)) {
        best = { id: e.id, j };
      }
    }
    return best?.id;
  }

  add(id: string, sketch: string | undefined, createdAt: string): void {
    if (!sketch || isEmptySketch(sketch)) return;
    this.addEntry({ id, createdAtMs: Date.parse(createdAt), sketch });
  }

  remove(id: string): void {
    const entry = this.entries.find((e) => e.id === id);
    if (!entry) return;
    this.entries = this.entries.filter((e) => e.id !== id);
    const bands = computeMinHashBands(entry.sketch);
    for (const b of bands) {
      const set = this.buckets.get(b);
      if (set) {
        set.delete(entry);
        if (set.size === 0) this.buckets.delete(b);
      }
    }
  }
}
