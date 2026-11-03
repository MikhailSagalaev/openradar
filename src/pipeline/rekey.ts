import { titleKeyOf } from '../core/fingerprint.ts';
import type { Store } from '../core/store.ts';

export interface RekeySummary {
  checked: number;
  rekeyed: number;
}

/**
 * Rebuilds stored dedup keys with the app's own rule. Migration 025 (0.40.4) rewrote
 * title_key in SQL, which keeps «ё», drops letters outside Latin and Cyrillic and does
 * not cut at 160, so reposts of older leads stopped matching them. Reads by id, page by page.
 */
export async function rekeyTitles(store: Store, options: { pageSize?: number } = {}): Promise<RekeySummary> {
  if (!store.listTitleKeys || !store.updateLeadTitleKey) return { checked: 0, rekeyed: 0 };
  const pageSize = options.pageSize ?? 1_000;
  let afterId: string | null = null;
  let checked = 0;
  let rekeyed = 0;
  for (;;) {
    const page = await store.listTitleKeys(afterId, pageSize);
    if (!page.length) break;
    for (const row of page) {
      checked += 1;
      const key = titleKeyOf(row.title);
      if (key === row.titleKey) continue;
      await store.updateLeadTitleKey(row.id, key);
      rekeyed += 1;
    }
    afterId = page[page.length - 1]!.id;
    if (page.length < pageSize) break;
  }
  return { checked, rekeyed };
}
