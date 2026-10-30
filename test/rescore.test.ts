import { describe, expect, it } from 'vitest';
import { prepareRawLead } from '../src/core/prepare.ts';
import { scoreLead } from '../src/core/rules.ts';
import { rescoreLeads } from '../src/pipeline/rescore.ts';
import { createTestStore } from './helpers.ts';

describe('rescore', () => {
  it('recomputes the base score with the current formula and keeps votes', async () => {
    const store = createTestStore();
    const source = await store.createSource({ kind: 'rss', title: 'Feed' });
    const createdAt = new Date('2026-10-20T10:00:00Z');
    const raw = { sourceId: source.id, title: 'Ищу практика', text: 'Нужен человек', publishedAt: createdAt.toISOString() };
    await store.insertLead({
      ...raw,
      id: 'old', externalId: 'old', titleKey: 'old', fingerprint: 'fp-old',
      status: 'new', score: 65, reasons: [], createdAt: createdAt.toISOString(),
    });

    const expected = scoreLead(prepareRawLead(raw, source, createdAt), source, createdAt);
    expect(expected).toBeLessThan(65);
    expect(await rescoreLeads(store)).toEqual({ checked: 1, changed: 1, requalified: 0 });
    expect((await store.getLead('old'))?.score).toBe(expected);

    // A useful vote on top of the new base is kept by the next rescore.
    await store.recordVote('old', 'useful', 1);
    const voted = (await store.getLead('old'))!.score;
    expect(voted).toBeGreaterThan(expected);
    await rescoreLeads(store);
    expect((await store.getLead('old'))?.score).toBe(voted);
    await store.close();
  });

  it('reads a long window page by page', async () => {
    const store = createTestStore();
    const source = await store.createSource({ kind: 'rss', title: 'Feed' });
    const createdAt = new Date('2026-10-20T10:00:00Z');
    for (let i = 0; i < 5; i += 1) {
      await store.insertLead({
        sourceId: source.id, title: `Нужен дизайнер ${i}`, text: 'Логотип для кофейни',
        id: `l${i}`, externalId: `l${i}`, titleKey: `l${i}`, fingerprint: `fp-${i}`,
        status: 'new', score: 50, reasons: [], createdAt: createdAt.toISOString(),
      });
    }
    expect((await rescoreLeads(store, { pageSize: 2 })).checked).toBe(5);
    expect((await rescoreLeads(store, { pageSize: 2, limit: 3 })).checked).toBe(3);
    await store.close();
  });
});
