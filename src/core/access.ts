import type { Lead, Viewer, ViewerTier } from './types.ts';

/**
 * radar/2 access model. Every viewer sees the same leads; the tier only decides
 * how long after a lead was first seen it becomes visible, and whether contacts
 * are shown. A self-hosted node (RADAR_MODE=node) has no delays at all.
 */
export type RadarMode = 'node' | 'hub';

export const DEFAULT_TIER_DELAY_MIN: Record<ViewerTier, number> = {
  admin: 0,
  core: 0,
  active: 30,
  member: 180,
  guest: 720,
};

/** Parses `guest=720,member=180,active=30,core=0` (minutes); unknown keys are ignored. */
export function parseTierDelays(raw: string | undefined): Record<ViewerTier, number> {
  const delays = { ...DEFAULT_TIER_DELAY_MIN };
  if (!raw) return delays;
  for (const part of raw.split(',')) {
    const [key, value] = part.split('=').map((item) => item.trim());
    const minutes = Number(value);
    if (key && key in delays && key !== 'admin' && Number.isFinite(minutes) && minutes >= 0) {
      delays[key as ViewerTier] = minutes;
    }
  }
  return delays;
}

export interface AccessPolicy {
  mode: RadarMode;
  delays: Record<ViewerTier, number>;
}

export function delayMinutes(viewer: Viewer, policy: AccessPolicy): number {
  if (policy.mode === 'node' || viewer.tier === 'admin') return 0;
  return policy.delays[viewer.tier] ?? policy.delays.guest;
}

/** Upper bound for `created_at` of leads this viewer may see, or undefined for no limit. */
export function visibleBefore(viewer: Viewer, policy: AccessPolicy, now: Date = new Date()): string | undefined {
  const minutes = delayMinutes(viewer, policy);
  if (minutes <= 0) return undefined;
  return new Date(now.getTime() - minutes * 60_000).toISOString();
}

export function canSeeContacts(viewer: Viewer): boolean {
  return viewer.tier !== 'guest';
}

/** Single-lead check for detail pages and APIs: hidden or not-yet-visible leads are 404 for non-admins. */
export function viewerCanSeeLead(viewer: Viewer, lead: Lead, policy: AccessPolicy, now: Date = new Date()): boolean {
  if (viewer.tier === 'admin') return true;
  // A closed lead stays readable by its link (the page says it is closed); hidden ones do not.
  const state = lead.state ?? 'active';
  if ((state !== 'active' && state !== 'closed') || lead.status === 'rejected') return false;
  const cutoff = visibleBefore(viewer, policy, now);
  return cutoff === undefined || lead.createdAt <= cutoff;
}
