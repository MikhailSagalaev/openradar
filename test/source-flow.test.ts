import { afterEach, describe, expect, it } from 'vitest';
import { detectSilentDrops, reportSilentDrops, type SourceFlowStats } from '../src/core/source-health.ts';
import { ServiceMonitor } from '../src/core/services.ts';
import type { Runtime } from '../src/runtime.ts';
import { makeTestRuntime, testEnv } from './helpers.ts';

const openRuntimes: Runtime[] = [];
afterEach(async () => {
  for (const runtime of openRuntimes.splice(0)) await runtime.store.close().catch(() => undefined);
});

const stat = (over: Partial<SourceFlowStats> = {}): SourceFlowStats => ({
  sourceId: 's', title: 'S', enabled: true,
  recent: { runs: 100, errors: 0, inserted: 50 },
  previous: { runs: 100, errors: 0, inserted: 1000 },
  ...over,
});

describe('detectSilentDrops', () => {
  it('flags a live source whose inserts collapsed', () => {
    const drops = detectSilentDrops([stat()]);
    expect(drops).toHaveLength(1);
    expect(drops[0]!.ratio).toBeCloseTo(0.05);
  });
  it('ignores failing polls, small history, disabled sources and mild dips', () => {
    expect(detectSilentDrops([stat({ recent: { runs: 100, errors: 30, inserted: 50 } })])).toHaveLength(0);
    expect(detectSilentDrops([stat({ previous: { runs: 100, errors: 0, inserted: 50 } })])).toHaveLength(0);
    expect(detectSilentDrops([stat({ enabled: false })])).toHaveLength(0);
    expect(detectSilentDrops([stat({ recent: { runs: 100, errors: 0, inserted: 300 } })])).toHaveLength(0);
    expect(detectSilentDrops([stat({ recent: { runs: 5, errors: 0, inserted: 0 } })])).toHaveLength(0);
  });
});

describe('flow stats over the store', () => {
  it('aggregates two windows and surfaces a silent drop', async () => {
    const base = makeTestRuntime();
    const runtime = base as unknown as Runtime;
    openRuntimes.push(runtime);
    const src = await runtime.store.createSource({ kind: 'rss', title: 'Drifting feed' });
    const now = Date.now();
    const run = (id: string, daysAgo: number, inserted: number) =>
      runtime.store.recordRun({
        id, sourceId: src.id, startedAt: new Date(now - daysAgo * 86_400_000).toISOString(),
        found: inserted, inserted, duplicates: 0, rejected: 0, delivered: 0,
      });
    for (let i = 0; i < 5; i += 1) await run(`p${i}`, 8, 200); // previous window: 1000
    for (let i = 0; i < 20; i += 1) await run(`r${i}`, 2, 5); // recent window: 100
    const stats = await runtime.store.getFlowStats!(7);
    const mine = stats.find((s) => s.sourceId === src.id)!;
    expect(mine.previous.inserted).toBe(1000);
    expect(mine.recent.inserted).toBe(100);

    const warns: string[] = [];
    const logger = { warn: (m: string) => warns.push(m), info() {}, error() {}, debug() {}, child() { return logger; } } as never;
    const services = new ServiceMonitor({ env: testEnv() });
    const drops = await reportSilentDrops(runtime.store, services, logger);
    expect(drops.map((d) => d.sourceId)).toContain(src.id);
    expect(warns.length).toBeGreaterThan(0);
    expect(services.get('source-flow')?.status).toBe('degraded');
  });
});
