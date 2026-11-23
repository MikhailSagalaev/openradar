import { describe, expect, it } from 'vitest';
import { atsSource, boardIdPrefix } from '../src/sources/ats.ts';
import type { Lead, PollContext } from '../src/core/types.ts';
import { makeTestRuntime } from './helpers.ts';

const NOW = new Date('2026-11-13T12:00:00.000Z');
const logger = { info() {}, warn() {}, error() {}, debug() {}, child() { return logger; } } as never;

function posting(req: string) {
  return { title: `Role ${req}`, externalPath: `/job/USA---Santa-Clara-CA/Role_${req}`, locationsText: 'USA - Santa Clara, CA', postedOn: 'Posted Today', bulletFields: [req] };
}

/**
 * A Workday CXS board of `ids`, served 20 per page. Like the live API, only the first page
 * carries the real total; later pages say 0.
 */
function workdayCtx(ids: string[], store: PollContext['store'], offsets: number[] = []): PollContext {
  return {
    fetchImpl: (async (_url: RequestInfo | URL, init?: RequestInit) => {
      const { offset, limit } = JSON.parse(String(init?.body)) as { offset: number; limit: number };
      offsets.push(offset);
      const page = ids.slice(offset, offset + limit).map(posting);
      return new Response(JSON.stringify({ total: offset === 0 ? ids.length : 0, jobPostings: page }), { status: 200 });
    }) as unknown as typeof fetch,
    userAgent: 'test', timeoutMs: 5000, now: () => NOW, logger, store, ghostCheck: true,
  };
}

function storedLead(store: ReturnType<typeof makeTestRuntime>['store'], sourceId: string, req: string) {
  return store.insertLead({
    id: `lead-${req}`, sourceId, type: 'job', title: `Role ${req}`, text: 'Build things.',
    url: `https://nvidia.wd5.myworkdayjobs.com/en-US/External/job/Role_${req}`, externalId: `workday:nvidia:${req}`,
    fingerprint: `fp-${req}`, titleKey: `role-${req}`, status: 'new', score: 50, reasons: [], skills: [],
    createdAt: new Date(NOW.getTime() - 3 * 86_400_000).toISOString(),
  } as Lead);
}

const ids = (n: number) => Array.from({ length: n }, (_, i) => `R${1000 + i}`);

describe('Workday ghost-job diff', () => {
  it('derives the board prefix the way the ids are built', () => {
    expect(boardIdPrefix('workday', 'nvidia@wd5')).toBe('workday:nvidia:');
    expect(boardIdPrefix('ashby', 'acme')).toBe('ashby:acme:');
  });

  it('closes a job that left a multi-page board and reopens it when it returns', async () => {
    const runtime = makeTestRuntime();
    const source = await runtime.store.createSource({ kind: 'ats', title: 'NVIDIA', config: { provider: 'workday', companies: ['nvidia@wd5=NVIDIA|External'], perCompany: 100, vendorPaceMs: 0 } });
    const board = ids(50); // three pages: 20, 20, 10 — pages 2 and 3 report total 0
    await storedLead(runtime.store, source.id, 'R1045'); // on page 3: must stay active
    await storedLead(runtime.store, source.id, 'R9999'); // gone from the board

    const offsets: number[] = [];
    const leads = await atsSource.poll!(source, workdayCtx(board, runtime.store, offsets));
    expect(offsets).toEqual([0, 20, 40]);
    expect(leads).toHaveLength(50);
    expect((await runtime.store.getLead('lead-R9999'))?.state).toBe('closed');
    expect((await runtime.store.getLead('lead-R1045'))?.state ?? 'active').toBe('active');

    await atsSource.poll!(source, workdayCtx([...board, 'R9999'], runtime.store));
    expect((await runtime.store.getLead('lead-R9999'))?.state).toBe('active');
    expect(await runtime.store.getLeadDecision('lead-R9999')).toBeNull();
    await runtime.store.close();
  });

  it('does not diff a board cut by the per-company cap', async () => {
    const runtime = makeTestRuntime();
    const source = await runtime.store.createSource({ kind: 'ats', title: 'NVIDIA', config: { provider: 'workday', companies: ['nvidia@wd5=NVIDIA|External'], perCompany: 20, vendorPaceMs: 0 } });
    await storedLead(runtime.store, source.id, 'R1030'); // on page 2, which the cap never reads
    const offsets: number[] = [];
    await atsSource.poll!(source, workdayCtx(ids(50), runtime.store, offsets));
    expect(offsets).toEqual([0]);
    expect((await runtime.store.getLead('lead-R1030'))?.state ?? 'active').toBe('active');
    await runtime.store.close();
  });

  it('advances by the raw page size, not by the postings it kept', async () => {
    const runtime = makeTestRuntime();
    const source = await runtime.store.createSource({ kind: 'ats', title: 'NVIDIA', config: { provider: 'workday', companies: ['nvidia@wd5=NVIDIA|External'], perCompany: 100, vendorPaceMs: 0 } });
    await storedLead(runtime.store, source.id, 'R1025');
    const offsets: number[] = [];
    const ctx: PollContext = {
      ...workdayCtx([], runtime.store),
      fetchImpl: (async (_url: RequestInfo | URL, init?: RequestInit) => {
        const { offset } = JSON.parse(String(init?.body)) as { offset: number };
        offsets.push(offset);
        // Page 1 has a posting without a title: dropped by the parser, still counted.
        const page = offset === 0
          ? [...ids(19).map(posting), { externalPath: '/job/x' }]
          : ids(30).slice(20).map(posting);
        return new Response(JSON.stringify({ total: offset === 0 ? 30 : 0, jobPostings: page }), { status: 200 });
      }) as unknown as typeof fetch,
    };
    const leads = await atsSource.poll!(source, ctx);
    expect(offsets).toEqual([0, 20]);
    expect(leads).toHaveLength(29);
    expect((await runtime.store.getLead('lead-R1025'))?.state ?? 'active').toBe('active');
    await runtime.store.close();
  });

  it('never diffs two sites of one tenant, whose ids cannot be told apart', async () => {
    const runtime = makeTestRuntime();
    const source = await runtime.store.createSource({ kind: 'ats', title: 'NVIDIA', config: { provider: 'workday', companies: ['nvidia@wd5=NVIDIA|External', 'nvidia@wd1=NVIDIA|Campus'], perPoll: 2, perCompany: 100, vendorPaceMs: 0 } });
    await storedLead(runtime.store, source.id, 'R9999');
    await atsSource.poll!(source, workdayCtx(ids(5), runtime.store));
    expect((await runtime.store.getLead('lead-R9999'))?.state ?? 'active').toBe('active');
    await runtime.store.close();
  });
});
