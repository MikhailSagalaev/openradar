/**
 * OpenRadar Tit-for-Tat Access Tier Engine.
 * Enforces 12-hour lag for passive readers (free-riders) while granting
 * zero-lag real-time access to active network contributors.
 */

import type { Lead } from './types.ts';
import type { MeshNodeRecord, UserRecord } from './store.ts';

export type UserAccessTier = 'active_contributor' | 'free_rider';

export interface AccessTierInfo {
  tier: UserAccessTier;
  isRealtime: boolean;
  reason: string;
  validLeads7d: number;
  validAttestations24h: number;
  trustScore: number;
}

export interface DetermineAccessTierParams {
  user?: UserRecord | null;
  meshNode?: MeshNodeRecord | null;
  isAdmin?: boolean;
}

/**
 * Determines whether a viewer qualifies as an ActiveContributor (real-time stream)
 * or FreeRider (12-hour delayed stream).
 */
export function determineAccessTier(params: DetermineAccessTierParams): AccessTierInfo {
  if (params.isAdmin) {
    return {
      tier: 'active_contributor',
      isRealtime: true,
      reason: 'Administrator privilege',
      validLeads7d: 999,
      validAttestations24h: 999,
      trustScore: 1.0,
    };
  }

  // Registered web users (GitHub OAuth) are the community tier: they get
  // realtime access without needing a mesh node.
  if (params.user) {
    return {
      tier: 'active_contributor',
      isRealtime: true,
      reason: 'Registered contributor (GitHub account)',
      validLeads7d: 0,
      validAttestations24h: 0,
      trustScore: 0.40,
    };
  }

  const node = params.meshNode;
  if (node?.is_banned) {
    return {
      tier: 'free_rider',
      isRealtime: false,
      reason: 'Node is banned due to cheater slashing',
      validLeads7d: 0,
      validAttestations24h: 0,
      trustScore: 0,
    };
  }

  const validLeads7d = node?.valid_leads_7d ?? 0;
  const validAttestations24h = node?.valid_attestations_24h ?? 0;
  const trustScore = node?.trust_score ?? 0;

  // GitHub 7-Day Trial: ActiveContributor status via GitHub trust is valid strictly for the first 7 days
  const verifiedTime = node?.github_verified_at ?? node?.created_at;
  const isWithinGithubTrial = verifiedTime
    ? (Date.now() - new Date(verifiedTime).getTime()) <= 7 * 86400 * 1000
    : false;

  // Active Contributor requirements:
  // - >= 3 valid leads submitted in past 7 days, OR
  // - >= 10 valid attestations performed in past 24h, OR
  // - trust_score >= 0.20 strictly within the first 7 days of GitHub verification
  const isContributor =
    validLeads7d >= 3 ||
    validAttestations24h >= 10 ||
    (isWithinGithubTrial && trustScore >= 0.20);

  if (isContributor) {
    return {
      tier: 'active_contributor',
      isRealtime: true,
      reason: isWithinGithubTrial && validLeads7d < 3 && validAttestations24h < 10
        ? 'Verified contributor (GitHub 7-day trial active)'
        : 'Verified contributor (Tit-for-Tat quorum met)',
      validLeads7d,
      validAttestations24h,
      trustScore,
    };
  }

  return {
    tier: 'free_rider',
    isRealtime: false,
    reason: 'Guest / passive viewer (12-hour lag applied)',
    validLeads7d,
    validAttestations24h,
    trustScore,
  };
}

export interface FilterLeadsResult {
  visibleLeads: Lead[];
  lockedCount: number;
}

/**
 * Filters a list of leads according to viewer's access tier.
 * Active contributors receive all valid leads immediately.
 * Free-riders have mesh-exclusive and locked leads filtered out.
 */
export function filterLeadsForViewer(
  leads: Lead[],
  tierInfo: AccessTierInfo,
  now: Date = new Date(),
): FilterLeadsResult {
  if (tierInfo.isRealtime) {
    return {
      visibleLeads: leads.filter(
        (l) => l.verification_state !== 'killed_scam' && l.verification_state !== 'killed_closed',
      ),
      lockedCount: 0,
    };
  }

  const nowIso = now.toISOString();
  let lockedCount = 0;
  const visibleLeads: Lead[] = [];

  for (const lead of leads) {
    if (lead.verification_state === 'killed_scam' || lead.verification_state === 'killed_closed') {
      continue;
    }

    const isLocked =
      Boolean(lead.is_mesh_exclusive) ||
      (lead.unlocked_at !== undefined && lead.unlocked_at > nowIso);

    if (isLocked) {
      lockedCount++;
    } else {
      visibleLeads.push(lead);
    }
  }

  return {
    visibleLeads,
    lockedCount,
  };
}
