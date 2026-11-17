/**
 * Whether a lead may be indexed. Meta robots, the sitemap and JobPosting all ask
 * this function, so a closed or expired lead cannot stay in one surface and leave another.
 *
 * A guest who would get 404 must not find the URL in the sitemap. `isIndexable` is
 * therefore `viewerCanSeeLead` for a guest, plus "still in the feed" (not expired)
 * and `state === 'active'` (a closed lead stays readable by link, but leaves the index).
 *
 * The quality threshold is an extra condition on top of those rules. It lives in
 * `indexableMinScore` and `leadQuality` and does not replace them.
 */
import type { Lead, LeadState, LeadStatus, LeadType } from './types.ts';
import { DEFAULT_TIER_DELAY_MIN, viewerCanSeeLead, type AccessPolicy } from './access.ts';
import { feedMaxAge } from '../pipeline/liveness.ts';
import {
  DEFAULT_INDEXABLE_MIN_QUALITY,
  QUALITY_POINTS,
  leadQuality,
  type LeadQualityInput,
} from './lead-quality.ts';

/** Feed age limits, plus the quality threshold from the process config. */
export interface TtlEnv {
  RADAR_GIG_TTL_DAYS: number;
  RADAR_JOB_TTL_DAYS: number;
  /** How many `leadQuality` checks must pass. `0` turns the gate off. */
  RADAR_INDEXABLE_MIN_QUALITY?: number;
}

/**
 * Defaults of the feed age limits and the quality threshold. Pages rendered
 * without a runtime use the same numbers the process uses out of the box.
 */
export const DEFAULT_TTL_ENV: TtlEnv = {
  RADAR_GIG_TTL_DAYS: 14,
  RADAR_JOB_TTL_DAYS: 30,
  RADAR_INDEXABLE_MIN_QUALITY: DEFAULT_INDEXABLE_MIN_QUALITY,
};

/**
 * How many `leadQuality` checks a lead must pass. Read from the runtime env,
 * not from `process.env`. An unreadable value uses the default. This is not the feed rating.
 */
export function indexableMinScore(env: { RADAR_INDEXABLE_MIN_QUALITY?: number }): number {
  const value = env.RADAR_INDEXABLE_MIN_QUALITY;
  if (value === undefined || !Number.isInteger(value) || value < 0 || value > QUALITY_POINTS) {
    return DEFAULT_INDEXABLE_MIN_QUALITY;
  }
  return value;
}

/** A self-hosted node: guests have no delay. Hub mode passes the runtime policy instead. */
export const NODE_INDEX_POLICY: AccessPolicy = { mode: 'node', delays: { ...DEFAULT_TIER_DELAY_MIN } };

const GUEST = { tier: 'guest' } as const;

export function isExpired(
  lead: { type?: LeadType; createdAt: string },
  env: TtlEnv,
  now: number = Date.now(),
): boolean {
  const maxAge = feedMaxAge(env);
  if (!maxAge) return false;
  const days = lead.type === 'job' ? maxAge.job : maxAge.gig;
  return now - Date.parse(lead.createdAt) > days * 86_400_000;
}

export function isIndexable(
  lead: { state?: LeadState; status?: LeadStatus; type?: LeadType; createdAt: string; score?: number } & LeadQualityInput,
  env: TtlEnv,
  policy: AccessPolicy = NODE_INDEX_POLICY,
  now: number = Date.now(),
): boolean {
  const state = lead.state ?? 'active';
  if (state !== 'active') return false;
  if (!viewerCanSeeLead(GUEST, lead as Lead, policy, new Date(now))) return false;
  if (isExpired(lead, env, now)) return false;
  const minScore = indexableMinScore(env);
  if (minScore > 0 && leadQuality(lead).score < minScore) return false;
  return true;
}

/**
 * Days until a lead of this type leaves the feed, or undefined when that limit is off.
 * `feedMaxAge` stands in 36500 days for a switched-off limit; that is not a real expiry.
 */
export function ttlDays(lead: { type?: LeadType }, env: TtlEnv): number | undefined {
  const maxAge = feedMaxAge(env);
  if (!maxAge) return undefined;
  const days = lead.type === 'job' ? maxAge.job : maxAge.gig;
  if (days >= 36_500) return undefined;
  return days;
}

/** W3C Datetime (sitemaps.org): complete date plus hours, minutes, seconds, and a timezone. */
export function w3cDateTime(ms: number): string {
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/**
 * The instant `isExpired` becomes true: `createdAt + TTL`. At this exact millisecond
 * the lead is still inside the feed (`>`), and one millisecond later it is expired.
 */
export function validThrough(lead: { type?: LeadType; createdAt: string }, env: TtlEnv): string | undefined {
  const days = ttlDays(lead, env);
  if (days === undefined) return undefined;
  const created = Date.parse(lead.createdAt);
  if (!Number.isFinite(created)) return undefined;
  return w3cDateTime(created + days * 86_400_000);
}

/**
 * Sitemap lastmod. Leads have no maintained update time (`last_seen` is the insert
 * default and is not an edit), so the date is `createdAt`.
 */
export function leadLastmod(createdAt: string): string {
  const created = Date.parse(createdAt);
  return w3cDateTime(Number.isFinite(created) ? created : Date.now());
}

/** ISO week of an instant, in UTC: `2026-W45`. */
export function isoWeekKey(iso: string): string | undefined {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return undefined;
  const date = new Date(ms);
  const utc = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - day);
  const year = utc.getUTCFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const week = Math.ceil(((utc.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

/** Oldest `createdAt` that can still be indexable, plus a day so the `>` boundary is inside the query. */
export function indexableCreatedAfter(env: TtlEnv, now: number = Date.now()): string | undefined {
  const maxAge = feedMaxAge(env);
  if (!maxAge) return undefined;
  const days = Math.max(maxAge.gig, maxAge.job);
  return new Date(now - (days + 1) * 86_400_000).toISOString();
}
