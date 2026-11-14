import { describe, expect, it } from 'vitest';
import { countFailedInRow, pollBackoffFactor, runSourceHygiene, shouldQuarantineSource, sourceState } from '../src/core/source-health.ts';
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

  it('computes adaptive backoff multipliers and auto-quarantines chronically dead sources', async () => {
    expect(pollBackoffFactor({ failedInRow: 0, last24h: day(10, 20) })).toBe(1);
    expect(pollBackoffFactor({ failedInRow: 1, lastRun: run('timeout'), last24h: day(10, 20) })).toBe(2);
    expect(pollBackoffFactor({ failedInRow: 2, lastRun: run('timeout'), last24h: day(10, 20) })).toBe(3);
    expect(pollBackoffFactor({ failedInRow: 3, lastRun: run('timeout'), last24h: day(4, 5) })).toBe(4);
    expect(pollBackoffFactor({ failedInRow: 3, lastRun: run('HTTP 404'), last24h: { ...day(8, 0), errors: 8 } })).toBe(8);

    // Dead 404 endpoint with 6+ failed runs in 24h and 0 found is quarantined
    expect(
      shouldQuarantineSource({
        source,
        failedInRow: 3,
        lastRun: run('HTTP 404 for https://example.com/jobs.xml'),
        last24h: { ...day(6, 0), errors: 6 },
      }),
    ).toMatchObject({ quarantine: true, reason: expect.stringContaining('dead_endpoint') });

    // Chronic failure (12+ failed runs in 24h, 0 found) is quarantined
    expect(
      shouldQuarantineSource({
        source,
        failedInRow: 3,
        lastRun: run('HTTP 503 Service Unavailable'),
        last24h: { ...day(12, 0), errors: 12 },
      }),
    ).toMatchObject({ quarantine: true, reason: expect.stringContaining('chronic_failure_24h') });

    // runSourceHygiene disables dead sources in the store
    const store = createTestStore();
    const dead = await store.createSource({ kind: 'rss', title: 'Dead Feed' });
    const now = Date.now();
    for (let i = 6; i >= 1; i--) {
      const ts = new Date(now - i * 60_000).toISOString();
      await store.recordRun({ id: 'dead-' + i, sourceId: dead.id, startedAt: ts, finishedAt: ts, found: 0, inserted: 0, duplicates: 0, rejected: 0, delivered: 0, error: 'HTTP 404 Not Found' });
    }
    const summary = await runSourceHygiene(store);
    expect(summary.autoDisabled).toHaveLength(1);
    expect(summary.autoDisabled[0]!.sourceId).toBe(dead.id);
    const updated = await store.getSource(dead.id);
    expect(updated?.enabled).toBe(false);
    expect(updated?.config.autoDisableReason).toContain('dead_endpoint');
    await store.close();
  });
});
