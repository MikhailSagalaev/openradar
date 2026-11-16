/**
 * Whether a lead may be indexed. Meta robots, the sitemap and JobPosting all ask
 * this function, so a closed or expired lead cannot stay in one surface and leave another.
 *
 * A quality threshold, once one is chosen, belongs here and nowhere else.
 */
import type { LeadState, LeadType } from './types.ts';
import { feedMaxAge } from '../pipeline/liveness.ts';

/** The two feed age limits. `feedMaxAge` is the only reader of these numbers. */
export interface TtlEnv {
  RADAR_GIG_TTL_DAYS: number;
  RADAR_JOB_TTL_DAYS: number;
}

/**
 * Defaults of RADAR_GIG_TTL_DAYS and RADAR_JOB_TTL_DAYS. Pages rendered without
 * a runtime (unit tests, previews) use the same numbers the feed uses out of the box.
 */
export const DEFAULT_TTL_ENV: TtlEnv = { RADAR_GIG_TTL_DAYS: 14, RADAR_JOB_TTL_DAYS: 30 };

/** Score floor for the index. Undefined until a threshold is chosen. */
export function indexableMinScore(): number | undefined {
  return undefined;
}

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
  lead: { state?: LeadState; type?: LeadType; createdAt: string; score?: number },
  env: TtlEnv,
  now: number = Date.now(),
): boolean {
  if (lead.state === 'closed') return false;
  if (isExpired(lead, env, now)) return false;
  const minScore = indexableMinScore();
  if (minScore !== undefined && (lead.score ?? 0) < minScore) return false;
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
 * Sitemap lastmod. `updatedAt` counts only when the lead was actually changed after
 * it was stored; otherwise the date is `createdAt`.
 */
export function leadLastmod(lead: { createdAt: string; updatedAt?: string }): string {
  const created = Date.parse(lead.createdAt);
  const updated = lead.updatedAt ? Date.parse(lead.updatedAt) : NaN;
  const ms = Number.isFinite(updated) && updated > created ? updated : created;
  return w3cDateTime(Number.isFinite(ms) ? ms : Date.now());
}

/**
 * `last_seen` is filled at insert, a moment after `created_at`. That is not an edit.
 * A later write (more than a minute after creation) is.
 */
export function updatedAtIfChanged(createdAt: string, candidate: string | null | undefined): string | undefined {
  if (!candidate) return undefined;
  const created = Date.parse(createdAt);
  const updated = Date.parse(candidate);
  if (!Number.isFinite(created) || !Number.isFinite(updated)) return undefined;
  if (updated - created <= 60_000) return undefined;
  return new Date(updated).toISOString();
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
