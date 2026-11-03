import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { Lead } from '../src/core/types.ts';
import { researchRecords } from '../src/research/service.ts';
import { createTestStore } from './helpers.ts';

describe('research reads posts a page at a time', () => {
  it('returns every post of the period once, also when several share a creation time', async () => {
    const store = createTestStore();
    const source = await store.createSource({ kind: 'rss', title: 'Feed' });
    const run = randomUUID().replace(/-/g, '');
    // A period of its own far in the past, so other tests' posts stay out of it.
    const day = '2001-03-04';
    const ids: string[] = [];
    for (let i = 0; i < 7; i++) {
      const id = `page-${run}-${i}`;
      ids.push(id);
      await store.insertLead({
        id, sourceId: source.id, type: 'job', title: `Python-разработчик ${i}`, text: 'Удалённо, от 200 000 ₽',
        fingerprint: `fp-${id}`, externalId: `ext-${id}`, titleKey: `python ${run} ${i}`, status: 'new', score: 60, reasons: [],
        // Three posts in the same millisecond: the cursor must not skip or repeat them.
        createdAt: i < 3 ? `${day}T10:00:00.000Z` : `${day}T1${i}:00:00.000Z`,
        publishedAt: `${day}T09:00:00.000Z`, currency: 'RUB', isRemote: true,
      } as Lead);
    }
    const records = await researchRecords(store, `${day}T00:00:00.000Z`, '2001-03-05T00:00:00.000Z', {}, 2);
    expect(records.map((r) => r.id).sort()).toEqual([...ids].sort());
  });
});
