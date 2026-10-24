/**
 * OpenRadar B2B Realtime Firehose API.
 * Server-Sent Events (SSE) stream for automated agency SDRs and corporate subscribers.
 */

import { EventEmitter } from 'node:events';
import type { Context } from 'hono';
import type { Lead, LeadType } from '../core/types.ts';
import type { Runtime } from '../runtime.ts';

export const firehoseEmitter = new EventEmitter();
firehoseEmitter.setMaxListeners(100);

/**
 * Broadcasts newly created or ingested leads to active Firehose subscribers.
 */
export function broadcastToFirehose(lead: Lead): void {
  firehoseEmitter.emit('lead', lead);
}

export interface FirehoseFilter {
  stacks?: string[];
  minBudget?: number;
  types?: LeadType[];
  onlyVerified?: boolean;
}

export function parseFirehoseFilter(c: Context): FirehoseFilter {
  const stackParam = c.req.query('stack') || c.req.query('skills');
  const stacks = stackParam
    ? stackParam.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
    : undefined;

  const minBudgetParam = c.req.query('min_budget') || c.req.query('minBudget');
  const minBudget = minBudgetParam ? Number(minBudgetParam) : undefined;

  const typeParam = c.req.query('type') || c.req.query('types');
  const types = typeParam
    ? (typeParam.split(',').map((t) => t.trim()) as LeadType[])
    : undefined;

  const onlyVerified = c.req.query('only_verified') === 'true';

  return { stacks, minBudget, types, onlyVerified };
}

export function matchesFirehoseFilter(lead: Lead, filter: FirehoseFilter): boolean {
  if (filter.types && filter.types.length > 0) {
    if (!lead.type || !filter.types.includes(lead.type)) return false;
  }

  if (filter.minBudget !== undefined) {
    const leadBudget = lead.budget ?? lead.normalizedUsdMin ?? 0;
    if (leadBudget < filter.minBudget) return false;
  }

  if (filter.onlyVerified) {
    if (lead.verification_state !== 'attested' && lead.verification_state !== 'verified_active') {
      return false;
    }
  }

  if (filter.stacks && filter.stacks.length > 0) {
    if (!lead.skills || !Array.isArray(lead.skills)) return false;
    const lowerLeadSkills = lead.skills.map((s) => s.toLowerCase());
    const matchesStack = filter.stacks.some((s) => lowerLeadSkills.includes(s));
    if (!matchesStack) return false;
  }

  return true;
}

/**
 * Validates B2B access authorization for Firehose subscribers.
 */
export async function authorizeFirehose(c: Context, runtime: Runtime): Promise<boolean> {
  const authHeader = c.req.header('authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();

  if (!token) return false;

  // 1. Admin token bypass
  if (runtime.env.RADAR_ADMIN_TOKEN && token === runtime.env.RADAR_ADMIN_TOKEN) {
    return true;
  }

  // 2. Active mesh node / B2B contributor check
  if (runtime.store.getMeshNode) {
    const node = await runtime.store.getMeshNode(token);
    if (node && (node.valid_leads_7d >= 3 || node.valid_attestations_24h >= 10 || node.trust_score >= 0.20)) {
      return true;
    }
  }

  return false;
}
