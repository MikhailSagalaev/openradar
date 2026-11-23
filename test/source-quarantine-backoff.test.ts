import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ERROR_BASE_INTERVAL_SEC,
  MAX_BACKOFF_INTERVAL_SEC,
  QUARANTINE_MIN_RUNS_24H,
  countFailedInRow,
  failingRunsPerDay,
  pollBackoffFactor,
  shouldQuarantineSource,
} from '../src/core/source-health.ts';
import type { RunRecord, SourceHealth, SourceRecord } from '../src/core/types.ts';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const START = Date.parse('2026-11-01T00:00:00.000Z');

/**
 * Plays the poller's schedule (the same backoff as pollAll, on a one-minute tick) for a
 * source that answers `fails(t)`, and reports when — if ever — it is quarantined.
 */
function simulate(baseIntervalSec: number, fails: (t: number) => boolean, days: number, withInterval = true) {
  const source = { id: 's', kind: 'ats', title: 'Board', enabled: true, config: {}, createdAt: new Date(START - 30 * DAY).toISOString(), updatedAt: '' } as SourceRecord;
  const runs: Array<{ at: number; error?: string }> = [];
  const healthAt = (t: number): SourceHealth => {
    const day = runs.filter((r) => r.at > t - DAY);
    const errors = day.filter((r) => r.error).length;
    const newestFirst = [...runs].reverse() as Array<{ error?: string }>;
    return {
      source,
      lastRun: runs.length ? ({ id: 'r', sourceId: 's', startedAt: '', found: runs.at(-1)!.error ? 0 : 3, inserted: 0, duplicates: 0, rejected: 0, delivered: 0, error: runs.at(-1)!.error } as RunRecord) : undefined,
      last24h: { found: (day.length - errors) * 3, inserted: 0, duplicates: 0, rejected: 0, delivered: 0, errors, runs: day.length },
      successRate: 0,
      failedInRow: countFailedInRow(newestFirst),
    };
  };
  let last: number | undefined;
  for (let t = START; t < START + days * DAY; t += 60_000) {
    const health = healthAt(t);
    if (shouldQuarantineSource(health, withInterval ? { baseIntervalSec, now: new Date(t) } : {}).quarantine) return { quarantinedAt: t, runs };
    const factor = pollBackoffFactor(health);
    const interval = factor > 1 ? Math.min((baseIntervalSec || DEFAULT_ERROR_BASE_INTERVAL_SEC) * factor, MAX_BACKOFF_INTERVAL_SEC) : baseIntervalSec;
    if (last !== undefined && t - last < interval * 1000) continue;
    last = t;
    runs.push({ at: t, error: fails(t) ? 'HTTP 503 Service Unavailable' : undefined });
  }
  return { quarantinedAt: undefined, runs };
}

const brokenFrom = (at: number) => (t: number) => t >= at;

describe('chronic-failure quarantine under the poll backoff', () => {
  it('the fixed 12-run minimum never catches an hourly source that fails for days (the bug)', () => {
    const { quarantinedAt } = simulate(3600, brokenFrom(START + 2 * DAY), 10, false);
    expect(quarantinedAt).toBeUndefined();
  });

  it.each([900, 1800, 3600, 6 * 3600])('quarantines a source polled every %is about a day after it breaks', (base) => {
    const brokeAt = START + 2 * DAY;
    const { quarantinedAt } = simulate(base, brokenFrom(brokeAt), 10);
    expect(quarantinedAt).toBeDefined();
    // Not before every poll of a whole day failed, and not much later either.
    expect(quarantinedAt! - brokeAt).toBeGreaterThanOrEqual(DAY - MAX_BACKOFF_INTERVAL_SEC * 1000);
    expect(quarantinedAt! - brokeAt).toBeLessThan(2 * DAY);
  });

  it('a fast source keeps the 12-run minimum', () => {
    expect(failingRunsPerDay(0)).toBeGreaterThanOrEqual(QUARANTINE_MIN_RUNS_24H);
    expect(failingRunsPerDay(300)).toBeGreaterThanOrEqual(QUARANTINE_MIN_RUNS_24H);
    expect(failingRunsPerDay(3600)).toBe(3);
  });

  it('never quarantines a slow source that fails often but not always', () => {
    // Every other poll fails: it still brings posts, so it is not chronically dead.
    let n = 0;
    const { quarantinedAt } = simulate(6 * 3600, () => n++ % 2 === 0, 10);
    expect(quarantinedAt).toBeUndefined();
  });

  it('never quarantines a slow source on an outage shorter than a day', () => {
    const brokeAt = START + 2 * DAY;
    const { quarantinedAt } = simulate(3600, (t) => t >= brokeAt && t < brokeAt + 18 * HOUR, 6);
    expect(quarantinedAt).toBeUndefined();
  });

  it('keeps the full minimum for a source younger than a day', () => {
    const young = { id: 'y', kind: 'ats', title: 'New', enabled: true, config: {}, createdAt: new Date(START - 10 * HOUR).toISOString(), updatedAt: '' } as SourceRecord;
    const health = {
      source: young,
      lastRun: { id: 'r', sourceId: 'y', startedAt: '', found: 0, inserted: 0, duplicates: 0, rejected: 0, delivered: 0, error: 'HTTP 503' } as RunRecord,
      last24h: { found: 0, inserted: 0, duplicates: 0, rejected: 0, delivered: 0, errors: 4, runs: 4 },
      failedInRow: 3,
    };
    expect(shouldQuarantineSource(health, { baseIntervalSec: 3600, now: new Date(START) }).quarantine).toBe(false);
    expect(shouldQuarantineSource({ ...health, source: { ...young, createdAt: new Date(START - 2 * DAY).toISOString() } }, { baseIntervalSec: 3600, now: new Date(START) }).quarantine).toBe(true);
  });
});
