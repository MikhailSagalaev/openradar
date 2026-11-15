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

type IndexStore = Pick<Store, 'listRecentSketches'>
  & Partial<Pick<Store, 'saveLeadBands' | 'findBandCandidates' | 'pruneLeadBands' | 'hasLeadBands'>>;

/** Candidates read per lookup: a band shared by more posts than this is too generic to help. */
const MAX_CANDIDATES = 200;
const PRUNE_EVERY_MS = 3600_000;

/**
 * LSH index of recent MinHash sketches: 16 bands narrow the candidates to posts sharing one,
 * and the sketches decide. Stores with band tables (Postgres, migration 027) keep the index
 * there, shared by every process and kept across restarts; other stores keep it in memory.
 */
export class SimilarIndex {
  private entries: Entry[] = [];
  private buckets = new Map<string, Set<Entry>>();
  private loading?: Promise<void>;
  private prunedAt = 0;

  constructor(private readonly store: IndexStore, private readonly maxEntries = 50_000) {}

  private get shared(): boolean {
    return Boolean(this.store.saveLeadBands && this.store.findBandCandidates);
  }

  /** The first lookup after the upgrade fills the table with the last week's posts. */
  private async ensureShared(now: Date): Promise<void> {
    this.loading ??= (async () => {
      if (await this.store.hasLeadBands?.()) return;
      const since = new Date(now.getTime() - SIMILAR_WINDOW_MS).toISOString();
      for (const row of await this.store.listRecentSketches(since, this.maxEntries)) {
        if (!isEmptySketch(row.minhash)) await this.store.saveLeadBands!(row.id, computeMinHashBands(row.minhash), row.createdAt);
      }
    })().catch((error) => {
      // A transient failure must not poison every later lookup with the cached rejection.
      this.loading = undefined;
      throw error;
    });
    await this.loading;
    if (now.getTime() - this.prunedAt > PRUNE_EVERY_MS && this.store.pruneLeadBands) {
      this.prunedAt = now.getTime();
      await this.store.pruneLeadBands(new Date(now.getTime() - SIMILAR_WINDOW_MS).toISOString());
    }
  }

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
    })().catch((error) => {
      // A transient failure must not poison every later lookup with the cached rejection.
      this.loading = undefined;
      throw error;
    });
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
    if (this.shared) return this.findShared(sketch, now, threshold);
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

  private async findShared(sketch: string, now: Date, threshold: number): Promise<string | undefined> {
    await this.ensureShared(now);
    const bands = computeMinHashBands(sketch);
    if (!bands.length) return undefined;
    const since = new Date(now.getTime() - SIMILAR_WINDOW_MS).toISOString();
    let best: { id: string; j: number } | undefined;
    for (const candidate of await this.store.findBandCandidates!(bands, since, MAX_CANDIDATES)) {
      const j = estimateJaccardFromSketches(sketch, candidate.minhash);
      if (j >= threshold && (!best || j > best.j)) best = { id: candidate.id, j };
    }
    return best?.id;
  }

  async add(id: string, sketch: string | undefined, createdAt: string): Promise<void> {
    if (!sketch || isEmptySketch(sketch)) return;
    if (this.shared) {
      await this.store.saveLeadBands!(id, computeMinHashBands(sketch), createdAt);
      return;
    }
    this.addEntry({ id, createdAtMs: Date.parse(createdAt), sketch });
  }

  /** Only the in-memory index needs this: stored bands go with the lead (ON DELETE CASCADE). */
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
