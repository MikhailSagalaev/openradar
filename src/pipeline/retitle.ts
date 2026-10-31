import { cleanTitle } from '../core/extract.ts';
import { titleKeyOf } from '../core/fingerprint.ts';
import type { Store } from '../core/store.ts';

export interface RetitleSummary {
  checked: number;
  retitled: number;
}

/** A stored title that still opens with channel hashtags («#ищу #смм …»). */
function needsRetitle(title: string): boolean {
  return /^\s*#/.test(title);
}

/**
 * One-off pass over stored leads whose titles still open with channel tags: the title is
 * recomputed from the post body with the current cleanTitle rules (v0.37.0 fixed the
 * pipeline, but posts ingested before it keep their mangled titles). The old title is
 * kept in metadata as `retitle_from`. Leads without a better line stay untouched.
 */
export async function retitleLeads(store: Store, options: { limit?: number } = {}): Promise<RetitleSummary> {
  if (!store.listHashTitledLeads || !store.updateLeadTitle) return { checked: 0, retitled: 0 };
  const leads = await store.listHashTitledLeads(options.limit ?? 5_000);
  let retitled = 0;
  for (const lead of leads) {
    if (!needsRetitle(lead.title)) continue;
    const next = cleanTitle('', lead.text || lead.title);
    // No better line in the body (a real hashtag-titled post): keep as is.
    if (!next || next.replace(/\s+/g, ' ').trim() === lead.title.replace(/\s+/g, ' ').trim()) continue;
    const applied = await store.updateLeadTitle(lead.id, next, titleKeyOf(next), lead.title);
    if (applied) retitled += 1;
  }
  return { checked: leads.length, retitled };
}
