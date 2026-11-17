/**
 * Leads a guest can open, and that the index is willing to point at.
 * The similar-lead block and the catalog use this so a member-only or noindex
 * card never becomes a public link.
 */
import type { AccessPolicy } from './access.ts';
import { isIndexable, type TtlEnv } from './indexable.ts';
import type { Lead } from './types.ts';

/** Guest-visible, still in the feed, and above the quality threshold. `isIndexable` is the only check. */
export function isPublicCard(lead: Lead, policy: AccessPolicy, env: TtlEnv, now: Date = new Date()): boolean {
  return isIndexable(lead, env, policy, now.getTime());
}

/** Up to `limit` guest-visible indexable leads, skipping the card they are listed under. */
export function selectPublicSimilar(
  candidates: Lead[],
  selfId: string,
  options: { env: TtlEnv; policy: AccessPolicy; now?: Date; limit?: number },
): Lead[] {
  const now = options.now ?? new Date();
  const limit = options.limit ?? 6;
  const seen = new Set<string>();
  const out: Lead[] = [];
  for (const lead of candidates) {
    if (lead.id === selfId || seen.has(lead.id)) continue;
    if (!isPublicCard(lead, options.policy, options.env, now)) continue;
    seen.add(lead.id);
    out.push(lead);
    if (out.length >= limit) break;
  }
  return out;
}
