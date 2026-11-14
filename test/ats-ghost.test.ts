import { describe, expect, it } from 'vitest';
import { atsSource, diffBoard } from '../src/sources/ats.ts';
import { pollSource } from '../src/pipeline/poll.ts';
import { SinkRegistry } from '../src/sinks/index.ts';
import type { Lead, PollContext } from '../src/core/types.ts';
import { makeSource, makeTestRuntime } from './helpers.ts';

const NOW = new Date('2026-11-13T12:00:00.000Z');
const logger = { info() {}, warn() {}, error() {}, debug() {}, child() { return logger; } } as never;

/** A stored lead of the acme Ashby board, `daysAgo` old. */
function boardLead(store: ReturnType<typeof makeTestRuntime>['store'], sourceId: string, jobId: string, daysAgo: number, over: Partial<Lead> = {}) {
  return store.insertLead({
    id: `lead-${jobId}`, sourceId, type: 'job', title: `Role ${jobId}`, text: 'Build things.',
    url: `https://jobs.ashbyhq.com/acme/${jobId}`, externalId: `ashby:acme:${jobId}`,
    fingerprint: `fp-${jobId}`, titleKey: `role-${jobId}`, status: 'new', score: 50, reasons: [], skills: [],
    createdAt: new Date(NOW.getTime() - daysAgo * 86_400_000).toISOString(), ...over,
  } as Lead);
}

/** An Ashby board API answer listing the given job ids. */
function ashbyBody(ids: string[]) {
  return { jobs: ids.map((id) => ({ id, title: `Role ${id}`, jobUrl: `https://jobs.ashbyhq.com/acme/${id}`, location: 'Remote', isRemote: true, isListed: true, publishedAt: NOW.toISOString(), descriptionPlain: 'Build things.' })) };
}

function atsCtx(body: unknown, store?: PollContext['store'], ghostCheck = true): PollContext {
  return {
    fetchImpl: (async () => new Response(JSON.stringify(body), { status: 200 })) as unknown as typeof fetch,
    userAgent: 'test', timeoutMs: 5000, now: () => NOW, logger, store, ghostCheck,
  };
}

const acmeSource = () => makeSource({ kind: 'ats', title: 'Acme — Ashby', config: { provider: 'ashby', companies: ['acme=Acme'], perPoll: 1, perCompany: 100 } });

describe('ATS board diff (plan 021B)', () => {
  it('soft-closes a removed job, keeps it for dedup, and reopens it when it returns', async () => {
    const runtime = makeTestRuntime();
    const source = await runtime.store.createSource({ kind: 'ats', title: 'Acme', config: { provider: 'ashby', companies: ['acme'] } });
    await boardLead(runtime.store, source.id, 'a', 5);
    await boardLead(runtime.store, source.id, 'b', 5);

    // The board now lists only "a": "b" was removed.
    const removed = await diffBoard(runtime.store, source, 'ashby', 'acme', new Set(['ashby:acme:a']), 30, NOW);
    expect(removed).toEqual({ closed: 1, reopened: 0 });
    const b = await runtime.store.getLead('lead-b');
    expect(b?.state).toBe('closed');
    expect(b).toBeDefined(); // soft-closed, not deleted: dedup history survives
    expect((await runtime.store.getLeadDecision('lead-b'))?.reason).toBe('removed from the board');
    expect((await runtime.store.getLead('lead-a'))?.state ?? 'active').toBe('active');

    // "b" comes back: reopened because the board itself closed it.
    const returned = await diffBoard(runtime.store, source, 'ashby', 'acme', new Set(['ashby:acme:a', 'ashby:acme:b']), 30, NOW);
    expect(returned).toEqual({ closed: 0, reopened: 1 });
    expect((await runtime.store.getLead('lead-b'))?.state).toBe('active');
    expect(await runtime.store.getLeadDecision('lead-b')).toBeNull();
    await runtime.store.close();
  });

  it('never reopens a job a moderator or the model closed', async () => {
    const runtime = makeTestRuntime();
    const source = await runtime.store.createSource({ kind: 'ats', title: 'Acme', config: { provider: 'ashby', companies: ['acme'] } });
    await boardLead(runtime.store, source.id, 'm', 5, { state: 'closed' });
    await runtime.store.setLeadDecision('lead-m', { state: 'closed', decidedBy: 'moderator', reason: 'spam' });
    await boardLead(runtime.store, source.id, 'x', 5, { state: 'closed' });
    await runtime.store.setLeadDecision('lead-x', { state: 'closed', decidedBy: 'model', reason: 'closed: 0.95' });

    const diff = await diffBoard(runtime.store, source, 'ashby', 'acme', new Set(['ashby:acme:m', 'ashby:acme:x']), 30, NOW);
    expect(diff).toEqual({ closed: 0, reopened: 0 });
    expect((await runtime.store.getLead('lead-m'))?.state).toBe('closed');
    expect((await runtime.store.getLead('lead-x'))?.state).toBe('closed');
    await runtime.store.close();
  });

  it('leaves jobs outside the age window and other boards alone', async () => {
    const runtime = makeTestRuntime();
    const source = await runtime.store.createSource({ kind: 'ats', title: 'Acme', config: { provider: 'ashby', companies: ['acme'] } });
    await boardLead(runtime.store, source.id, 'old', 90); // older than 2×30 days
    await runtime.store.insertLead({
      id: 'other-board', sourceId: source.id, type: 'job', title: 'Other', text: 't', externalId: 'ashby:other:z',
      fingerprint: 'fp-other', titleKey: 'other', status: 'new', score: 50, reasons: [], skills: [],
      createdAt: new Date(NOW.getTime() - 5 * 86_400_000).toISOString(),
    } as Lead);
    const diff = await diffBoard(runtime.store, source, 'ashby', 'acme', new Set(), 30, NOW);
    expect(diff).toEqual({ closed: 0, reopened: 0 });
    expect((await runtime.store.getLead('lead-old'))?.state ?? 'active').toBe('active');
    expect((await runtime.store.getLead('other-board'))?.state ?? 'active').toBe('active');
    await runtime.store.close();
  });

  it('does not diff a truncated board read (cap reached)', async () => {
    const runtime = makeTestRuntime();
    const source = await runtime.store.createSource({ kind: 'ats', title: 'Acme', config: { provider: 'ashby', companies: ['acme'], perPoll: 1, perCompany: 2 } });
    await boardLead(runtime.store, source.id, 'gone', 5);
    // The board lists 2 jobs (= perCompany): the read may be capped, so no removal is inferred.
    const leads = await atsSource.poll!(source, atsCtx(ashbyBody(['a', 'b']), runtime.store));
    expect(leads).toHaveLength(2);
    expect((await runtime.store.getLead('lead-gone'))?.state ?? 'active').toBe('active');
    await runtime.store.close();
  });

  it('respects the env kill switch and the per-source opt-out', async () => {
    const runtime = makeTestRuntime();
    const source = await runtime.store.createSource({ kind: 'ats', title: 'Acme', config: { provider: 'ashby', companies: ['acme'], perPoll: 1, perCompany: 100 } });
    await boardLead(runtime.store, source.id, 'gone', 5);
    await atsSource.poll!(source, atsCtx(ashbyBody(['a']), runtime.store, false)); // env off
    expect((await runtime.store.getLead('lead-gone'))?.state ?? 'active').toBe('active');
    const optedOut = { ...source, config: { ...source.config, ghostCheck: false } };
    await atsSource.poll!(optedOut, atsCtx(ashbyBody(['a']), runtime.store, true));
    expect((await runtime.store.getLead('lead-gone'))?.state ?? 'active').toBe('active');
    await runtime.store.close();
  });

  it('closes a removed job through the full poll path', async () => {
    const runtime = makeTestRuntime({ RADAR_PUBLIC_READ: true });
    const source = await runtime.store.createSource({ kind: 'ats', title: 'Acme', config: { provider: 'ashby', companies: ['acme'], perPoll: 1, perCompany: 100, intervalSec: 0 } });
    await boardLead(runtime.store, source.id, 'gone', 5);
    const deps = { store: runtime.store, sinks: new SinkRegistry(), logger, env: runtime.env, sources: runtime.sources, fetchImpl: (async () => new Response(JSON.stringify(ashbyBody(['fresh'])), { status: 200 })) as unknown as typeof fetch, now: () => NOW };
    const summary = await pollSource(source, deps);
    expect(summary.error).toBeUndefined();
    expect((await runtime.store.getLead('lead-gone'))?.state).toBe('closed');
    await runtime.store.close();
  });
});
