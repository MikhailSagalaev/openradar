import type { Store } from '../core/store.ts';
import { deriveRecord } from '../research/derive.ts';

/**
 * Fills the direction of stored posts with the rule the research reports use.
 * The rule only fills what is empty or `other`: a direction a person or the decision
 * model already set is kept, so startup hygiene cannot wipe model answers back to `other`.
 */
export async function fillDirections(store: Store, options: { pageSize?: number } = {}): Promise<{ checked: number; updated: number }> {
  if (!store.listLeadsForDirections || !store.setLeadDirection) return { checked: 0, updated: 0 };
  const pageSize = options.pageSize ?? 1_000;
  let afterId: string | null = null;
  let checked = 0;
  let updated = 0;
  for (;;) {
    const page = await store.listLeadsForDirections(afterId, pageSize);
    if (!page.length) break;
    for (const lead of page) {
      checked += 1;
      const settled = lead.direction && lead.direction !== '' && lead.direction !== 'other';
      if (settled) continue;
      const { role } = deriveRecord(lead, { useModel: false });
      if (role === 'other' || role === lead.direction) continue;
      await store.setLeadDirection(lead.id, role);
      updated += 1;
    }
    afterId = page[page.length - 1]!.id;
    if (page.length < pageSize) break;
  }
  return { checked, updated };
}
