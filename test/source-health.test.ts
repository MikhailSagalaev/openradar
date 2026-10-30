import { describe, expect, it } from 'vitest';
import { countFailedInRow, sourceState } from '../src/core/source-health.ts';
import type { RunRecord, SourceRecord } from '../src/core/types.ts';
import { createTestStore } from './helpers.ts';

const source = { id: 's', kind: 'rss', title: 'Feed', enabled: true, config: {}, createdAt: '', updatedAt: '' } as SourceRecord;
const run = (error?: string): RunRecord => ({ id: 'r', sourceId: 's', startedAt: '', found: error ? 0 : 5, inserted: 0, duplicates: 0, rejected: 0, delivered: 0, error });
const day = (runs: number, found: number) => ({ found, inserted: 0, duplicates: 0, rejected: 0, delivered: 0, errors: 0, runs });

describe('source state', () => {
  it('tells broken from empty and one failed poll from a broken source', () => {
    expect(sourceState({ source, lastRun: run(), last24h: day(12, 40), failedInRow: 0 })).toBe('ok');
    expect(sourceState({ source, lastRun: run(), last24h: day(12, 0), failedInRow: 0 })).toBe('empty');
    expect(sourceState({ source, lastRun: run('fetch failed'), last24h: day(12, 40), failedInRow: 1 })).toBe('unstable');
    expect(sourceState({ source, lastRun: run('fetch failed'), last24h: day(12, 40), failedInRow: 3 })).toBe('error');
    expect(sourceState({ source, lastRun: run('HTTP 403 for https://api.hh.ru/vacancies'), last24h: day(12, 0), failedInRow: 1 })).toBe('blocked');
    expect(sourceState({ source, last24h: day(0, 0) })).toBe('waiting');
    expect(sourceState({ source: { ...source, enabled: false }, lastRun: run(), last24h: day(0, 0) })).toBe('disabled');
  });

  it('counts failures only at the head of the history', () => {
    expect(countFailedInRow([run('x'), run('x'), run()])).toBe(2);
    expect(countFailedInRow([run(), run('x'), run('x')])).toBe(0);
    expect(countFailedInRow([run('x'), run('x'), run('x'), run('x')])).toBe(3);
  });

  it('is filled in by the store', async () => {
    const store = createTestStore();
    const created = await store.createSource({ kind: 'rss', title: 'Feed' });
    const at = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
    for (const [m, error] of [[30, undefined], [20, 'fetch failed'], [10, 'fetch failed']] as const) {
      await store.recordRun({ id: `r${m}`, sourceId: created.id, startedAt: at(m), finishedAt: at(m), found: 0, inserted: 0, duplicates: 0, rejected: 0, delivered: 0, error });
    }
    const health = (await store.getSourceHealth()).find((item) => item.source.id === created.id)!;
    expect(health.failedInRow).toBe(2);
    expect(sourceState(health)).toBe('unstable');
    await store.close();
  });
});
