import { employerOf } from '../core/company.ts';
import type { Store } from '../core/store.ts';

export interface ReemployersSummary {
  checked: number;
  updated: number;
}

/** Fills the employer of stored leads with the app's own rule. Reads by id, page by page. */
export async function fillEmployers(store: Store, options: { pageSize?: number } = {}): Promise<ReemployersSummary> {
  if (!store.listLeadsForEmployers || !store.setLeadEmployer) return { checked: 0, updated: 0 };
  const pageSize = options.pageSize ?? 1_000;
  let afterId: string | null = null;
  let checked = 0;
  let updated = 0;
  for (;;) {
    const page = await store.listLeadsForEmployers(afterId, pageSize);
    if (!page.length) break;
    for (const row of page) {
      checked += 1;
      const employer = employerOf(row, row.sourceKind);
      if ((employer?.key ?? undefined) === row.companyKey && (employer?.name ?? undefined) === row.company) continue;
      await store.setLeadEmployer(row.id, employer?.name, employer?.key);
      updated += 1;
    }
    afterId = page[page.length - 1]!.id;
    if (page.length < pageSize) break;
  }
  return { checked, updated };
}
