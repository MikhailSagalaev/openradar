import { describe, expect, it } from 'vitest';
import type { Lead } from '../src/core/types.ts';
import { retitleLeads } from '../src/pipeline/retitle.ts';
import { TEST_NOW } from './helpers.ts';
import { MemoryStore } from '../src/store/memory.ts';

function lead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: overrides.id ?? 'lead-1', sourceId: 's', type: 'gig',
    title: overrides.title ?? '#ищу', text: overrides.text ?? '#ищу\nИщем менеджера по продажам / диагноста',
    fingerprint: 'fp', titleKey: 't', status: 'new', score: 60, reasons: [],
    createdAt: TEST_NOW.toISOString(), currency: 'RUB', isRemote: true,
    ...overrides,
  } as Lead;
}

async function seed(store: MemoryStore, leads: Lead[]): Promise<void> {
  for (const l of leads) {
    await store.insertLead({ ...l, fingerprint: `fp-${l.id}`, externalId: `ext-${l.id}` });
  }
}

describe('retitle pass over stored leads', () => {
  it('retitles hashtag-titled leads from the post body and rebuilds the dedup key', async () => {
    const store = new MemoryStore();
    await seed(store, [
      lead({ id: 'a', title: '#ищу', text: '#ищу\nИщем менеджера по продажам / диагноста' }),
      lead({ id: 'b', title: '#ищу #контент_менеджер #удалённо', text: '#ищу #контент_менеджер #удалённо\nВ онлайн-школу ищем контент-менеджера для Instagram и YouTube' }),
    ]);
    const summary = await retitleLeads(store);
    expect(summary).toEqual({ checked: 2, retitled: 2 });

    const a = await store.getLead('a');
    expect(a?.title).toBe('Ищем менеджера по продажам / диагноста');
    expect(a?.titleKey).toBe('ищем менеджера по продажам диагноста');
    expect((a?.metadata as any)?.retitle_from).toBe('#ищу');
    const b = await store.getLead('b');
    expect(b?.title).toBe('В онлайн-школу ищем контент-менеджера для Instagram и YouTube');
  });

  it('keeps a post whose title is legitimately a hashtag and does not touch clean titles', async () => {
    const store = new MemoryStore();
    const onlyTags = lead({ id: 'c', title: '#ищу #смм', text: '#ищу #смм' });
    await seed(store, [
      onlyTags,
      lead({ id: 'd', title: 'Разработчик на Python в команду аналитики', text: 'Обычный пост' }),
    ]);
    const summary = await retitleLeads(store);
    expect(summary.retitled).toBe(0);
    const c = await store.getLead('c');
    expect(c?.title).toBe('#ищу #смм');
    expect(c?.metadata).toBeUndefined();
  });

  it('honors the limit', async () => {
    const store = new MemoryStore();
    await seed(store, [lead({ id: 'x', title: '#ищу' }), lead({ id: 'y', title: '#ищу', text: '#ищу\nНастоящий текст заказа' })]);
    const summary = await retitleLeads(store, { limit: 1 });
    expect(summary.checked).toBe(1);
  });
});
