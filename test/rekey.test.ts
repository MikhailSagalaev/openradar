import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { Lead } from '../src/core/types.ts';
import { titleKeyOf } from '../src/core/fingerprint.ts';
import { rekeyTitles } from '../src/pipeline/rekey.ts';
import { TEST_NOW, createTestStore } from './helpers.ts';

function lead(id: string, sourceId: string, title: string, titleKey: string): Lead {
  return {
    id, sourceId, type: 'gig', title, text: title,
    fingerprint: `fp-${id}`, externalId: `ext-${id}`, titleKey, status: 'new', score: 60, reasons: [],
    createdAt: TEST_NOW.toISOString(), currency: 'RUB', isRemote: true,
  } as Lead;
}

describe('rekey pass over stored leads', () => {
  it('rebuilds keys that migration 025 wrote with its own SQL rule, page by page', async () => {
    const store = createTestStore();
    const source = await store.createSource({ kind: 'rss', title: 'Feed' });
    const run = randomUUID().replace(/-/g, '');
    const [a, b, c] = ['a', 'b', 'c'].map((s) => `rekey-${run}-${s}`);
    // What 025 stored: «ё» kept, letters outside Latin/Cyrillic dropped.
    await store.insertLead(lead(a!, source.id, `Ищем партнёра ${run}`, `ищем партнёра ${run}`));
    await store.insertLead(lead(b!, source.id, `Café menu ${run}`, `caf menu ${run}`));
    await store.insertLead(lead(c!, source.id, `Нужен дизайнер ${run}`, titleKeyOf(`Нужен дизайнер ${run}`)));

    const summary = await rekeyTitles(store, { pageSize: 2 });
    expect(summary.checked).toBeGreaterThanOrEqual(3);
    expect(summary.rekeyed).toBeGreaterThanOrEqual(2);
    expect((await store.getLead(a!))?.titleKey).toBe(`ищем партнера ${run}`);
    expect((await store.getLead(b!))?.titleKey).toBe(`café menu ${run}`);
    expect((await store.getLead(c!))?.titleKey).toBe(titleKeyOf(`Нужен дизайнер ${run}`));
    expect((await store.findRecentByTitleKey(titleKeyOf(`Ищем партнёра ${run}`), undefined, '2000-01-01T00:00:00Z'))?.id).toBe(a);

    expect(await rekeyTitles(store, { pageSize: 2 })).toMatchObject({ rekeyed: 0 });
  });
});
