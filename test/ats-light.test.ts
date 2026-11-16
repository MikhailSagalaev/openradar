import { describe, expect, it } from 'vitest';
import { atsSource } from '../src/sources/ats.ts';
import type { PollContext } from '../src/core/types.ts';
import { makeSource, makeTestRuntime } from './helpers.ts';

const NOW = new Date('2026-11-13T12:00:00.000Z');
const FRESH = '2026-11-10T12:00:00.000Z';
const FRESH2 = '2026-11-12T12:00:00.000Z';
const logger = { info() {}, warn() {}, error() {}, debug() {}, child() { return logger; } } as never;

function ghCtx(calls: string[], opts: { status?: number; job2Updated?: string } = {}): PollContext {
  const job2 = opts.job2Updated ?? FRESH2;
  return {
    fetchImpl: (async (url: unknown) => {
      const url_ = String(url);
      calls.push(url_);
      if ((opts.status ?? 200) !== 200) return new Response('no such board', { status: opts.status });
      if (url_.includes('content=false')) {
        return new Response(JSON.stringify({ jobs: [
          { id: 1, title: 'Role 1', absolute_url: `https://boards.greenhouse.io/acme/jobs/1`, location: { name: 'Remote' }, first_published: FRESH, updated_at: { absolute_time: FRESH } },
          { id: 2, title: 'Role 2', absolute_url: `https://boards.greenhouse.io/acme/jobs/2`, location: { name: 'Remote' }, first_published: job2, updated_at: { absolute_time: job2 } },
          { id: 3, title: 'Old role', absolute_url: `https://boards.greenhouse.io/acme/jobs/3`, location: { name: 'Remote' }, first_published: '2020-01-01T00:00:00.000Z', updated_at: '2020-01-01T00:00:00.000Z' },
        ] }), { status: 200 });
      }
      const id = Number(url_.match(/jobs\/(\d+)/)?.[1]);
      const updated = id === 2 ? job2 : FRESH;
      return new Response(JSON.stringify({
        id, title: `Role ${id}`, absolute_url: `https://boards.greenhouse.io/acme/jobs/${id}`,
        location: { name: 'Remote' }, first_published: updated, updated_at: updated, content: '<p>Build things.</p>',
      }), { status: 200 });
    }) as unknown as typeof fetch,
    userAgent: 'test', timeoutMs: 5000, now: () => NOW, logger, ghostCheck: false,
  };
}

const ghSource = () => makeSource({
  kind: 'ats', title: 'Acme GH',
  config: { provider: 'greenhouse', companies: ['acme=Acme'], perPoll: 5, perCompany: 10, vendorPaceMs: 0 },
});

describe('greenhouse light poll', () => {
  it('reads the light listing, fetches details only for fresh-window jobs, skips the old one', async () => {
    const calls: string[] = [];
    const leads = await atsSource.poll(ghSource(), ghCtx(calls));
    expect(calls.filter((u) => u.includes('content=false'))).toHaveLength(1);
    expect(calls.filter((u) => u.includes('/jobs/1?'))).toHaveLength(1);
    expect(calls.filter((u) => u.includes('/jobs/2?'))).toHaveLength(1);
    expect(calls.filter((u) => u.includes('/jobs/3?'))).toHaveLength(0); // years old: not read in full
    expect(leads.map((l) => l.externalId)).toEqual(['greenhouse:acme:2', 'greenhouse:acme:1']);
  });

  it('emits nothing and spends one listing when the board has not changed', async () => {
    const calls: string[] = [];
    const ctx = ghCtx(calls);
    await atsSource.poll(ghSource(), ctx);
    const before = calls.length;
    const leads = await atsSource.poll(ghSource(), ctx);
    expect(leads).toEqual([]);
    expect(calls.length).toBe(before + 1); // the light listing only
  });

  it('fetches a detail only for the job whose timestamp changed', async () => {
    const calls: string[] = [];
    let job2 = FRESH2;
    const ctx = ghCtx(calls, { job2Updated: job2 });
    const src = ghSource();
    await atsSource.poll(src, ctx);
    job2 = '2026-11-13T09:00:00.000Z';
    const leads = await atsSource.poll(src, ghCtx(calls, { job2Updated: job2 }));
    expect(leads.map((l) => l.externalId)).toEqual(['greenhouse:acme:2']);
    expect(calls.filter((u) => u.includes('/jobs/2?'))).toHaveLength(2); // once per rotation that saw the change
  });

  it('feeds the exact board id set to ghost-job diffing', async () => {
    const runtime = makeTestRuntime();
    const source = await runtime.store.createSource({
      kind: 'ats', title: 'Acme GH store', config: { provider: 'greenhouse', companies: ['acme=Acme'], perPoll: 5, perCompany: 10, vendorPaceMs: 0 },
    });
    // The board listed job 9 before; now it lists only 1 and 2: job 9 soft-closes.
    await runtime.store.insertLead({
      id: 'lead-9', sourceId: source.id, type: 'job', title: 'Role 9', text: 'Build things.',
      url: 'https://boards.greenhouse.io/acme/jobs/9', externalId: 'greenhouse:acme:9',
      fingerprint: 'fp-9', titleKey: 'role-9', status: 'new', score: 50, reasons: [], skills: [],
      createdAt: NOW.toISOString(),
    } as never);
    // The listing mock always shows jobs 1, 2, 3: job 9 is gone from the board.
    const calls: string[] = [];
    await atsSource.poll(source, { ...ghCtx(calls), ghostCheck: true, store: runtime.store });
    const nine = await runtime.store.getLead('lead-9');
    expect(nine?.state).toBe('closed');
  });
});

describe('ATS board parking', () => {
  it('parks a board after three failed rotations and stops fetching it', async () => {
    const calls: string[] = [];
    const ctx = ghCtx(calls, { status: 404 });
    const src = makeSource({
      kind: 'ats', title: 'Dead GH',
      config: { provider: 'greenhouse', companies: ['deadco=Dead', 'zeta=Zeta'], perPoll: 2, perCompany: 10, vendorPaceMs: 0, lightPoll: false, ghostCheck: false },
    });
    for (let i = 0; i < 3; i++) await atsSource.poll(src, ctx);
    const after3 = calls.length;
    expect(after3).toBeGreaterThan(0);
    await atsSource.poll(src, ctx);
    expect(calls.length).toBe(after3); // parked: no fetches
  });
});
