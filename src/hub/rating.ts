import type { LedgerEntry, ObservationRecord, ParticipantRecord, SignalRecord, Store } from '../core/store.ts';
import type { Lead, LeadState, ViewerTier } from '../core/types.ts';

/**
 * radar/2 rating, tiers and weighted signals (docs/PROTOCOL.md, "Рейтинг и уровни",
 * "Сигналы и модерация"). The ledger is recomputed from observations and signals,
 * so the job is idempotent and a moderator decision re-scores everyone involved.
 */

export const RATING_WINDOW_MS = 30 * 24 * 3600 * 1000;
export const TIER_ACTIVE = 10;
export const TIER_CORE = 50;
export const GITHUB_MATURE_DAYS = 90;

export const POINTS = {
  first: 1.0,
  privateMultiplier: 1.5,
  exclusiveMultiplier: 1.5,
  exclusiveMs: 6 * 3600 * 1000,
  confirm: 0.2,
  maxConfirmers: 3,
  signalMatch: 0.1,
  hiddenFirst: -3.0,
  hiddenConfirm: -0.5,
} as const;

const CONFIRM_MIN_WEIGHT = 0.2;
const USEFUL_CONFIRMS = 1.0;
const AGE_CONFIRM_MS = 24 * 3600 * 1000;
const AGE_MAX_COMPLAINTS = 0.5;
const HIDE_THRESHOLD = 2.0;
const CLOSE_THRESHOLD = 1.5;

/** Web (GitHub) voters sign as `web:<user id>` in the signals table. */
export const WEB_SIGNAL_PREFIX = 'web:';

export interface WeightInput {
  rating: number;
  moderator: boolean;
  /** GitHub account creation time of the linked account, if any. */
  githubCreatedAt?: string;
}

export function baseWeight(input: WeightInput, now: Date = new Date()): number {
  if (input.moderator) return 1;
  if (!input.githubCreatedAt) return 0;
  const ageDays = (now.getTime() - Date.parse(input.githubCreatedAt)) / 86_400_000;
  return ageDays >= GITHUB_MATURE_DAYS ? 0.2 : 0;
}

/** w = min(1, w0 + R/30); 1 for moderators. */
export function signalWeight(input: WeightInput, now: Date = new Date()): number {
  if (input.moderator) return 1;
  return Math.min(1, baseWeight(input, now) + Math.max(0, input.rating) / 30);
}

/** Tier of an authenticated participant. A bare key with no rating and no GitHub is a guest. */
export function tierFor(p: { rating: number; moderator: boolean; githubLinked: boolean }): ViewerTier {
  if (p.moderator || p.rating >= TIER_CORE) return 'core';
  if (p.rating >= TIER_ACTIVE) return 'active';
  if (p.githubLinked || p.rating >= 1) return 'member';
  return 'guest';
}

/** Resolves signal weights for participant keys and `web:<user id>` voters, with a per-run cache. */
export class WeightResolver {
  private cache = new Map<string, Promise<number>>();

  constructor(
    private readonly store: Store,
    private readonly moderators: Set<string>,
    private readonly now: Date = new Date(),
  ) {}

  weightOf(signer: string): Promise<number> {
    let pending = this.cache.get(signer);
    if (!pending) {
      pending = this.resolve(signer);
      this.cache.set(signer, pending);
    }
    return pending;
  }

  private async resolve(signer: string): Promise<number> {
    if (signer.startsWith(WEB_SIGNAL_PREFIX)) {
      const userId = Number(signer.slice(WEB_SIGNAL_PREFIX.length));
      if (!Number.isInteger(userId)) return 0;
      const [user, participant] = await Promise.all([
        this.store.getUserById(userId),
        this.store.getParticipantByGithubUser(userId),
      ]);
      if (participant?.bannedAt) return 0;
      return signalWeight(
        {
          rating: participant?.rating ?? 0,
          moderator: participant ? this.moderators.has(participant.pubkey) : false,
          githubCreatedAt: user?.githubCreatedAt,
        },
        this.now,
      );
    }
    const participant = await this.store.getParticipant(signer);
    if (!participant || participant.bannedAt) return this.moderators.has(signer) ? 1 : 0;
    return this.weightOfParticipant(participant);
  }

  async weightOfParticipant(participant: ParticipantRecord): Promise<number> {
    if (this.moderators.has(participant.pubkey)) return 1;
    const user = participant.githubUserId ? await this.store.getUserById(participant.githubUserId) : null;
    return signalWeight({ rating: participant.rating, moderator: false, githubCreatedAt: user?.githubCreatedAt }, this.now);
  }
}

export interface SignalSums {
  useful: number;
  junk: number;
  scam: number;
  closed: number;
}

/** Weighted signal sums; the first observer's own signals do not count. */
export async function sumSignals(signals: SignalRecord[], weights: WeightResolver, author?: string): Promise<SignalSums> {
  const sums: SignalSums = { useful: 0, junk: 0, scam: 0, closed: 0 };
  for (const s of signals) {
    if (author && s.pubkey === author) continue;
    sums[s.signal] += await weights.weightOf(s.pubkey);
  }
  return sums;
}

/** State from weighted signals alone (no decisions): hide on J+S >= 2 and J+S > 2U, close on C >= 1.5. */
export function stateFromSignals(sums: SignalSums): LeadState {
  const complaints = sums.junk + sums.scam;
  if (complaints >= HIDE_THRESHOLD && complaints > 2 * sums.useful) {
    return sums.scam >= sums.junk ? 'hidden_scam' : 'hidden_junk';
  }
  if (sums.closed >= CLOSE_THRESHOLD) return 'closed';
  return 'active';
}

/**
 * Recomputes a lead's state: a moderator decision is final, then a flagged contact,
 * then an author's closing, then weighted signals. Writes the state when it changed.
 */
export async function evaluateLeadState(
  store: Store,
  lead: Lead,
  weights: WeightResolver,
): Promise<LeadState> {
  const decision = await store.getLeadDecision(lead.id);
  let state: LeadState;
  if (decision?.decidedBy === 'moderator') {
    state = decision.state;
  } else if ((await store.getContactFlags(lead.contacts ?? [])).some((f) => f.flag === 'scam')) {
    state = 'hidden_scam';
  } else {
    const [signals, observations] = await Promise.all([store.listSignals(lead.id), store.listObservations(lead.id)]);
    const author = observations.find((o) => o.isFirst)?.pubkey;
    const fromSignals = stateFromSignals(await sumSignals(signals, weights, author));
    // The author or the board closing the post holds unless signals hide it.
    const closedBy = decision && (decision.decidedBy === 'author' || decision.decidedBy === 'source') ? decision : null;
    state = closedBy && fromSignals === 'active' ? closedBy.state : fromSignals;
  }
  if ((lead.state ?? 'active') !== state) await store.updateLeadState?.(lead.id, state);
  return state;
}

/** Ledger entries for one lead, from its observations, signals and current state. */
export async function ledgerForLead(
  lead: Lead,
  observations: ObservationRecord[],
  signals: SignalRecord[],
  weights: WeightResolver,
  now: Date,
): Promise<LedgerEntry[]> {
  const entries: LedgerEntry[] = [];
  const ordered = [...observations].sort((a, b) => a.receivedAt.localeCompare(b.receivedAt));
  const first = ordered.find((o) => o.isFirst) ?? ordered[0];
  if (!first) return entries;
  const createdAt = lead.createdAt;
  const add = (pubkey: string, kind: LedgerEntry['kind'], points: number) => {
    if (pubkey.startsWith(WEB_SIGNAL_PREFIX)) return;
    entries.push({ pubkey, leadId: lead.id, kind, points: Math.round(points * 1000) / 1000, createdAt });
  };

  const confirmers: ObservationRecord[] = [];
  const seen = new Set([first.pubkey]);
  for (const o of ordered) {
    if (seen.has(o.pubkey)) continue;
    seen.add(o.pubkey);
    confirmers.push(o);
  }

  const state = lead.state ?? 'active';
  if (state === 'hidden_junk' || state === 'hidden_scam') {
    add(first.pubkey, 'hidden_first', POINTS.hiddenFirst);
    for (const o of confirmers) add(o.pubkey, 'hidden_confirm', POINTS.hiddenConfirm);
    const matched = state === 'hidden_scam' ? ['scam', 'junk'] : ['junk', 'scam'];
    for (const s of signals) if (matched.includes(s.signal) && s.pubkey !== first.pubkey) add(s.pubkey, 'signal_match', POINTS.signalMatch);
    return entries;
  }

  const sums = await sumSignals(signals, weights, first.pubkey);
  // Only observers with weight count: a ring of fresh keys must not confirm itself.
  const weightyConfirmers: ObservationRecord[] = [];
  for (const o of confirmers) {
    if ((await weights.weightOf(o.pubkey)) >= CONFIRM_MIN_WEIGHT) weightyConfirmers.push(o);
  }
  const confirmed = Boolean(lead.confirmedAt) || weightyConfirmers.length > 0 || sums.useful >= USEFUL_CONFIRMS;
  if (confirmed && !lead.confirmedAt) lead.confirmedAt = now.toISOString();
  // Surviving a day without complaints proves little for a key nobody vouches for.
  const aged =
    now.getTime() - Date.parse(createdAt) >= AGE_CONFIRM_MS &&
    sums.junk + sums.scam < AGE_MAX_COMPLAINTS &&
    (await weights.weightOf(first.pubkey)) >= CONFIRM_MIN_WEIGHT;
  if (!confirmed && !aged) return entries;

  if (!first.archived) {
    let points = POINTS.first;
    if (first.visibility !== 'public') points *= POINTS.privateMultiplier;
    const firstOther = confirmers[0];
    if (firstOther && Date.parse(firstOther.receivedAt) - Date.parse(first.receivedAt) >= POINTS.exclusiveMs) {
      points *= POINTS.exclusiveMultiplier;
    }
    if (!confirmed) points *= 0.5;
    add(first.pubkey, 'first', points);
  }
  for (const o of weightyConfirmers.filter((c) => !c.archived).slice(0, POINTS.maxConfirmers)) add(o.pubkey, 'confirm', POINTS.confirm);

  if (state === 'closed') {
    for (const s of signals) if (s.signal === 'closed' && s.pubkey !== first.pubkey) add(s.pubkey, 'signal_match', POINTS.signalMatch);
  } else if (confirmed) {
    for (const s of signals) if (s.signal === 'useful' && s.pubkey !== first.pubkey) add(s.pubkey, 'signal_match', POINTS.signalMatch);
  }
  return entries;
}

export interface RecomputeSummary {
  leads: number;
  entries: number;
  participants: number;
}

/**
 * The hourly job: re-evaluates every lead observed in the last 30 days, rewrites its
 * ledger entries and refreshes cached ratings. Weights come from the previous ratings.
 */
export async function recomputeRatings(store: Store, moderators: Set<string>, now: Date = new Date()): Promise<RecomputeSummary> {
  const since = new Date(now.getTime() - RATING_WINDOW_MS).toISOString();
  const weights = new WeightResolver(store, moderators, now);
  const byLead = new Map<string, ObservationRecord[]>();
  for (const o of await store.listObservationsSince(since)) {
    const list = byLead.get(o.leadId) ?? [];
    list.push(o);
    byLead.set(o.leadId, list);
  }

  const leadIds: string[] = [];
  const entries: LedgerEntry[] = [];
  for (const [leadId] of byLead) {
    const lead = await store.getLead(leadId);
    if (!lead) continue;
    lead.state = await evaluateLeadState(store, lead, weights);
    // all observations of the lead, not only the recent ones
    const observations = await store.listObservations(leadId);
    const signals = await store.listSignals(leadId);
    leadIds.push(leadId);
    const wasConfirmed = Boolean(lead.confirmedAt);
    entries.push(...(await ledgerForLead(lead, observations, signals, weights, now)));
    if (!wasConfirmed && lead.confirmedAt) await store.markLeadConfirmed?.(leadId, lead.confirmedAt);
  }
  await store.replaceLedger(leadIds, entries);

  const sums = await store.sumLedger(since);
  const ratings = new Map<string, number>();
  for (const [pubkey, points] of sums) if (points > 0) ratings.set(pubkey, Math.round(points * 1000) / 1000);
  await store.setParticipantRatings(ratings);
  return { leads: leadIds.length, entries: entries.length, participants: ratings.size };
}
