import type { SignalRecord, Store } from '../core/store.ts';
import { WeightResolver, type WeightInput } from './rating.ts';

/**
 * Source-quality feedback (plan 021E, Firecrawl Alexandria idea): the participant rating
 * ledger is extended to the SOURCES that bring leads. A source's quality is the weighted
 * balance of the community's signals on its posts over a window — useful against junk/scam —
 * so a board that keeps bringing junk drifts down and one that brings good leads drifts up.
 *
 * Additive and read-only: it aggregates the signals already stored, no new table, no billing
 * (the hub is free). The same weights as the participant ledger apply: a moderator counts 1,
 * a mature GitHub account 0.2 plus rating, a fresh key 0 — a ring of new keys cannot inflate
 * a source. Closed signals are neutral (a job ending is not a quality judgement).
 */

export const SOURCE_QUALITY_WINDOW_MS = 30 * 24 * 3600 * 1000;
/** Below this weighted volume the rating is provisional (too few signals to judge). */
export const SOURCE_QUALITY_MIN_VOLUME = 1.0;

export interface SourceQuality {
  sourceId: string;
  /** Weighted useful, junk, scam and closed signal sums over the window. */
  useful: number;
  junk: number;
  scam: number;
  closed: number;
  /** useful + junk + scam: the volume that actually judges quality. */
  volume: number;
  /** (useful − junk − 2·scam) / volume, in [−2, 1]; 0 when there is no volume. */
  score: number;
  /** False until enough weighted signals accumulated. */
  confident: boolean;
  /** Distinct leads of this source that carried a signal in the window. */
  leads: number;
}

/** Pure aggregation: signals already grouped by source, with a weight per signer. */
export function aggregateSourceQuality(
  bySource: Map<string, SignalRecord[]>,
  weightOf: (pubkey: string) => number,
): SourceQuality[] {
  const out: SourceQuality[] = [];
  for (const [sourceId, signals] of bySource) {
    let useful = 0, junk = 0, scam = 0, closed = 0;
    const leads = new Set<string>();
    for (const s of signals) {
      const w = weightOf(s.pubkey);
      if (w <= 0) continue;
      leads.add(s.leadId);
      if (s.signal === 'useful') useful += w;
      else if (s.signal === 'junk') junk += w;
      else if (s.signal === 'scam') scam += w;
      else if (s.signal === 'closed') closed += w;
    }
    const volume = useful + junk + scam;
    const score = volume > 0 ? (useful - junk - 2 * scam) / volume : 0;
    out.push({
      sourceId,
      useful: round(useful),
      junk: round(junk),
      scam: round(scam),
      closed: round(closed),
      volume: round(volume),
      score: round(score),
      confident: volume >= SOURCE_QUALITY_MIN_VOLUME,
      leads: leads.size,
    });
  }
  // Best first; provisional sources sink below confident ones of equal score.
  out.sort((a, b) => Number(b.confident) - Number(a.confident) || b.score - a.score || a.sourceId.localeCompare(b.sourceId));
  return out;
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/**
 * Computes source quality from the store: signals in the window, joined to their lead's
 * source, weighted like the participant ledger. Sources with no signals are omitted.
 */
export async function computeSourceQuality(
  store: Store,
  moderators: Set<string>,
  now: Date = new Date(),
  windowMs: number = SOURCE_QUALITY_WINDOW_MS,
): Promise<SourceQuality[]> {
  if (!store.listSignalsSince) return [];
  const since = new Date(now.getTime() - windowMs).toISOString();
  const signals = await store.listSignalsSince(since);
  if (signals.length === 0) return [];
  const weights = new WeightResolver(store, moderators, now);
  const bySource = new Map<string, SignalRecord[]>();
  for (const s of signals) {
    const lead = await store.getLead(s.leadId);
    if (!lead) continue;
    const list = bySource.get(lead.sourceId) ?? [];
    list.push(s);
    bySource.set(lead.sourceId, list);
  }
  // Resolve every distinct signer once, then aggregate purely.
  const signers = [...new Set(signals.map((s) => s.pubkey))];
  const weightMap = new Map<string, number>();
  for (const signer of signers) weightMap.set(signer, await weights.weightOf(signer));
  return aggregateSourceQuality(bySource, (pubkey) => weightMap.get(pubkey) ?? 0);
}

/** Re-exported for callers that build a WeightInput by hand (tests, admin tools). */
export type { WeightInput };
