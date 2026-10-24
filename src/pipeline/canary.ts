/**
 * OpenRadar Canary Trap Engine.
 * Injects synthetic honeypot leads with dead URLs and traps blind validators
 * who mass-sign Kind 30405 "verified" attestations without executing actual HTTP fetches.
 * Trapped cheating nodes are instantly slashed (trust_score = 0.0) and permanently banned.
 */

import { randomBytes, createHash } from 'node:crypto';
import type { Lead } from '../core/types.ts';
import type { Store, MeshNodeRecord } from '../core/store.ts';
import { RadarEventKinds, type NostrEvent } from '../net/protocol.ts';
import { encodeBech32 } from '../net/keys.ts';

export const CANARY_DOMAIN = 'canary.openradar.fun';
export const CANARY_PREFIX = 'canary:trap:';

export function isCanaryLead(
  lead: Partial<Lead> | { url?: string; canonicalUrl?: string; fingerprint?: string; metadata?: Record<string, unknown>; id?: string },
): boolean {
  if (!lead) return false;
  if (lead.metadata?.is_canary === true) return true;
  if (lead.url && lead.url.includes(CANARY_DOMAIN)) return true;
  if (lead.canonicalUrl && lead.canonicalUrl.includes(CANARY_DOMAIN)) return true;
  if (lead.id && lead.id.startsWith('canary-')) return true;
  return false;
}

export function createCanaryLead(params?: {
  id?: string;
  sourceId?: string;
  now?: Date;
}): Lead {
  const trapId = params?.id ?? randomBytes(8).toString('hex');
  const now = params?.now ?? new Date();
  const trapUrl = `https://${CANARY_DOMAIN}/trap/${trapId}`;
  const sha = createHash('sha256').update(`${CANARY_PREFIX}${trapId}`).digest('hex');

  return {
    id: `canary-${trapId}`,
    sourceId: params?.sourceId ?? 'canary-generator',
    type: 'job',
    title: `Lead Systems Verification Architect (Trap #${trapId.slice(0, 6)})`,
    text: `Synthetic canary job posting for protocol verification. URL is intentionally broken: ${trapUrl}`,
    url: trapUrl,
    canonicalUrl: trapUrl,
    fingerprint: sha,
    titleKey: `lead systems verification architect trap ${trapId.slice(0, 6)}`,
    status: 'new',
    score: 5,
    reasons: ['canary_honeypot_trap'],
    createdAt: now.toISOString(),
    is_mesh_exclusive: true,
    verification_state: 'killed_closed',
    metadata: {
      is_canary: true,
      trap_id: trapId,
      created_at: now.toISOString(),
    },
  };
}

/**
 * Executes Cheater Slashing:
 * Sets node trust_score to 0.0, sets is_banned to true, and increments false_reports_count.
 */
export async function slashCheatingNode(
  pubkey: string,
  store: Store,
  reason = 'Blind attestation on canary trap',
): Promise<MeshNodeRecord> {
  const normPubkey = pubkey.toLowerCase();
  const npub = encodeBech32('npub', normPubkey);
  const existing = await store.getMeshNode?.(normPubkey);

  return await store.upsertMeshNode({
    pubkey: normPubkey,
    npub,
    trust_score: 0.0,
    is_banned: true,
    false_reports_count: (existing?.false_reports_count ?? 0) + 999,
  });
}

/**
 * Evaluates an incoming Nostr attestation (Kind 30405).
 * If the attestation falsely asserts status "verified" on a canary lead,
 * the signer is caught cheating and permanently slashed.
 */
export async function handleCanaryAttestation(
  event: NostrEvent,
  store: Store,
): Promise<{ caught: boolean; slashedPubkey?: string }> {
  if (event.kind !== RadarEventKinds.LeadAttestation) {
    return { caught: false };
  }

  // Extract status tag: ["status", "verified"]
  const statusTag = event.tags.find((t) => t[0] === 'status');
  const status = statusTag ? statusTag[1] : '';

  if (status !== 'verified') {
    return { caught: false };
  }

  // Find target lead ID or hash from tags
  const eTag = event.tags.find((t) => t[0] === 'e');
  const dTag = event.tags.find((t) => t[0] === 'd');
  const targetId = eTag?.[1] || dTag?.[1];

  if (!targetId) return { caught: false };

  // Check if target is a canary lead
  let isCanary = false;
  if (targetId.startsWith('canary-') || targetId.includes(CANARY_DOMAIN)) {
    isCanary = true;
  } else {
    const lead = await store.getLead(targetId);
    if (lead && isCanaryLead(lead)) {
      isCanary = true;
    }
  }

  if (isCanary) {
    await slashCheatingNode(event.pubkey, store);
    return {
      caught: true,
      slashedPubkey: event.pubkey.toLowerCase(),
    };
  }

  return { caught: false };
}

/**
 * Injects a new canary trap lead into the store.
 */
export async function injectCanaryTrap(store: Store): Promise<Lead> {
  const canary = createCanaryLead();
  await store.insertLead(canary);
  return canary;
}

/**
 * Background worker that injects a canary trap every intervalMs (default 6 hours).
 */
export function startCanaryTrapWorker(
  store: Store,
  intervalMs = 6 * 3600 * 1000,
): { stop: () => void } {
  const timer = setInterval(() => {
    injectCanaryTrap(store).catch(() => {});
  }, intervalMs);

  return {
    stop: () => clearInterval(timer),
  };
}
