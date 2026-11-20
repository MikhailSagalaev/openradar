import { describe, expect, it } from 'vitest';
import type { Lead } from '../src/core/types.ts';
import type { ApiUsageDim } from '../src/core/store.ts';
import { handleMcpRequest, mcpUsageDetail, type McpBackend } from '../src/mcp/server.ts';
import { ConfirmationLadder } from '../src/mcp/safety.ts';
import { liveDatasetCsv, liveReport, resetResearchCache } from '../src/research/service.ts';
import { createApp } from '../src/server/app.ts';
import { budgetBucket, createPopularCounters } from '../src/server/popular.ts';
import { countTokenDay, countUsage, flushUsage, USAGE_DETAIL_MAX, usageDim } from '../src/server/usage.ts';
import { createTestStore, makeTestRuntime, makeUserSession } from './helpers.ts';

type Content = { result: { content: Array<{ text: string }> }; error?: { code: number } };
const parsed = (resp: unknown) => JSON.parse((resp as Content).result.content[0]!.text);

describe('MCP safety ladder under concurrency', () => {
  const args = { title: 'Once', text: 'description', type: 'job' };
  const call = (backend: McpBackend, ladder: ConfirmationLadder, a: Record<string, unknown>, identity = 'agent:1') =>
    handleMcpRequest({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'submit_lead', arguments: a } }, backend, { ladder, identity });

  function slowBackend(fail = false) {
    const state = { calls: 0 };
    const backend: McpBackend = {
      listLeads: async () => [],
      getLead: async () => null,
      async submitLead() {
        state.calls++;
        await new Promise((resolve) => setTimeout(resolve, 5));
        if (fail && state.calls === 1) throw new Error('store down');
        return { ok: true, id: 'once', status: 'inserted' };
      },
    };
    return { backend, state };
  }

  it('executes a double confirmation once; the duplicate gets the same receipt as a replay', async () => {
    const { backend, state } = slowBackend();
    const ladder = new ConfirmationLadder();
    const held = parsed(await call(backend, ladder, args));
    const confirm = { ...args, confirm: true, confirmation_token: held.confirmationToken };
    const [a, b] = (await Promise.all([call(backend, ladder, confirm), call(backend, ladder, confirm)])).map(parsed);
    expect(state.calls).toBe(1);
    expect([a.replayed, b.replayed].sort()).toEqual([false, true]);
    expect(a.result).toEqual(b.result);
  });

  it('refuses an expired token (injected clock)', async () => {
    const { backend, state } = slowBackend();
    let now = 1_000_000;
    const ladder = new ConfirmationLadder({ windowMs: 60_000, now: () => now });
    const held = parsed(await call(backend, ladder, args));
    now += 60_001;
    const late = parsed(await call(backend, ladder, { ...args, confirm: true, confirmation_token: held.confirmationToken }));
    expect(late.status).toBe('held');
    expect(state.calls).toBe(0);
  });

  it('re-arms the hold when the action fails, so the user can retry the same token', async () => {
    const { backend, state } = slowBackend(true);
    const ladder = new ConfirmationLadder();
    const held = parsed(await call(backend, ladder, args));
    const confirm = { ...args, confirm: true, confirmation_token: held.confirmationToken };
    const failed = (await call(backend, ladder, confirm)) as Content;
    expect(failed.error?.code).toBe(-32603);
    const retried = parsed(await call(backend, ladder, confirm));
    expect(retried.status).toBe('executed');
    expect(retried.replayed).toBe(false);
    expect(state.calls).toBe(2);
  });

  it('binds the token to the caller: another identity cannot confirm it', async () => {
    const { backend, state } = slowBackend();
    const ladder = new ConfirmationLadder();
    const held = parsed(await call(backend, ladder, args, 'agent:1'));
    const confirm = { ...args, confirm: true, confirmation_token: held.confirmationToken };
    const foreign = parsed(await call(backend, ladder, confirm, 'agent:2'));
    expect(foreign.status).toBe('held');
    expect(state.calls).toBe(0);
    // The rightful caller still can; the foreign one cannot replay the receipt either.
    expect(parsed(await call(backend, ladder, confirm, 'agent:1')).status).toBe('executed');
    expect(parsed(await call(backend, ladder, confirm, 'agent:2')).status).toBe('held');
    expect(state.calls).toBe(1);
  });

  it('keeps the pending map bounded', async () => {
    const { backend } = slowBackend();
    const ladder = new ConfirmationLadder();
    for (let i = 0; i < 5_050; i++) await call(backend, ladder, { ...args, title: `t${i}` });
    expect(ladder.pendingCount).toBeLessThanOrEqual(5_000);
  });
});

describe('bounded analytics dimensions', () => {
  it('labels MCP calls from an allowlist only', () => {
    expect(mcpUsageDetail({ method: 'tools/list' })).toBe('tools/list');
    expect(mcpUsageDetail({ method: 'tools/call', params: { name: 'search_leads' } })).toBe('tools/call:search_leads');
    expect(mcpUsageDetail({ method: 'tools/call', params: { name: 'x'.repeat(5000) } })).toBe('tools/call:unknown');
    expect(mcpUsageDetail({ method: `evil/${'y'.repeat(5000)}` })).toBe('unknown');
    expect(mcpUsageDetail(null)).toBe('unknown');
  });

  it('caps every detail label', () => {
    expect(usageDim({ surface: 'api', detail: 'z'.repeat(500), tier: 'guest' }).detail).toHaveLength(USAGE_DETAIL_MAX);
  });

  it('counts an unknown MCP method through the app as `unknown`', async () => {
    const runtime = makeTestRuntime({ RADAR_PUBLIC_READ: true });
    const app = createApp(runtime);
    await app.request('/mcp', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: `x/${'q'.repeat(3000)}` }),
    });
    await flushUsage(runtime);
    const stats = await runtime.store.agentUsageStats!(3);
    expect(stats.details.filter((d) => d.surface === 'mcp').map((d) => d.detail)).toEqual(['unknown']);
    await runtime.store.close();
  });
});

describe('usage counters are buffered', () => {
  it('aggregates calls per cell and token actives per day into one write each', async () => {
    const runtime = makeTestRuntime();
    const bumps: Array<[ApiUsageDim, number]> = [];
    const touches: Array<[number, string | undefined]> = [];
    runtime.store.bumpApiUsage = async (dim, calls = 1) => { bumps.push([dim, calls]); };
    runtime.store.touchTokenDay = async (userId, day) => { touches.push([userId, day]); };
    const dim = usageDim({ surface: 'api', detail: '/api/leads', tier: 'guest' });
    for (let i = 0; i < 3; i++) countUsage(runtime as never, dim);
    for (let i = 0; i < 3; i++) countTokenDay(runtime as never, 7);
    expect(bumps).toHaveLength(0);
    await flushUsage(runtime as never);
    expect(bumps).toEqual([[dim, 3]]);
    expect(touches).toHaveLength(1);
    // Already marked active today: no second upsert on the next flush.
    countTokenDay(runtime as never, 7);
    await flushUsage(runtime as never);
    expect(touches).toHaveLength(1);
    expect(bumps).toHaveLength(1);
  });

  it('a failing store write never escapes the flush', async () => {
    const runtime = makeTestRuntime();
    runtime.store.bumpApiUsage = async () => { throw new Error('db down'); };
    countUsage(runtime as never, usageDim({ surface: 'api', detail: '/x', tier: 'guest' }));
    await expect(flushUsage(runtime as never)).resolves.toBeUndefined();
  });
});

describe('per-request viewer memo', () => {
  it('resolves the session user once per request', async () => {
    const runtime = makeTestRuntime({ RADAR_ADMIN_TOKEN: 'secret', RADAR_PUBLIC_READ: true });
    const session = await makeUserSession(runtime);
    const original = runtime.store.getUserBySession!.bind(runtime.store);
    let lookups = 0;
    runtime.store.getUserBySession = async (id) => { lookups++; return original(id); };
    const res = await createApp(runtime).request('/api/leads?limit=1', { headers: { cookie: `radar_session=${session}` } });
    expect(res.status).toBe(200);
    expect(lookups).toBe(1);
    await runtime.store.close();
  });

  it('a failing viewer lookup in the usage counter cannot turn a 200 into a 500', async () => {
    const runtime = makeTestRuntime({ RADAR_PUBLIC_READ: true });
    runtime.store.getUserBySession = async () => { throw new Error('db down'); };
    const res = await createApp(runtime).request('/api/ping', { headers: { cookie: 'radar_session=abc' } });
    expect(res.status).toBe(200);
    await runtime.store.close();
  });
});

describe('popular skills and directions cache', () => {
  const lead = (i: number, over: Partial<Lead> = {}): Lead => ({
    id: `l${i}`, sourceId: 's', type: 'job', title: `Python dev ${i}`, text: '', skills: ['Python', 'SQL'],
    fingerprint: `f${i}`, titleKey: `t${i}`, status: 'new', score: 50, reasons: [], createdAt: new Date().toISOString(),
    direction: 'backend', budget: 200_000, ...over,
  } as Lead);

  it('buckets any budget into the offered steps', () => {
    expect(budgetBucket(undefined, 'job')).toBeUndefined();
    expect(budgetBucket(10, 'job')).toBeUndefined();
    expect(budgetBucket(99_999_999, 'job')).toBe(400_000);
    expect(budgetBucket(170_000, 'job')).toBe(150_000);
    expect(budgetBucket(30_000, 'gig')).toBe(20_000);
  });

  it('shares one fetch of the recent window across keys and stays bounded', async () => {
    let loads = 0;
    const counters = createPopularCounters({
      loadRecent: async () => { loads++; return [lead(1), lead(2), lead(3, { direction: 'frontend' })]; },
      maxKeys: 4,
    });
    const [a, b] = await Promise.all([counters.popularSkills({ type: 'job' }), counters.popularSkills({ type: 'job' })]);
    expect(a).toEqual(b);
    expect(a.map((s) => s.name)).toEqual(['Python', 'SQL']);
    for (let budget = 1; budget < 2_000_000; budget += 7_919) await counters.popularSkills({ type: 'job', budgetRub: budget });
    for (const language of ['ru', 'en'] as const) for (const remote of [true, false]) await counters.popularSkills({ type: 'gig', language, remote });
    expect(counters.cachedSkillKeys).toBeLessThanOrEqual(4);
    const directions = await counters.directionCounts();
    expect(directions.get('backend')).toBe(2);
    expect(loads).toBe(1);
  });

  it('refetches after the TTL and does not cache a failed fetch', async () => {
    let now = 0;
    let loads = 0;
    const counters = createPopularCounters({
      loadRecent: async () => { loads++; if (loads === 1) throw new Error('db down'); return [lead(1), lead(2)]; },
      now: () => now,
      ttlMs: 1000,
    });
    await expect(counters.popularSkills({})).rejects.toThrow('db down');
    expect((await counters.popularSkills({})).length).toBeGreaterThan(0);
    now += 1001;
    await counters.popularSkills({});
    expect(loads).toBe(3);
  });
});

describe('research dataset CSV cache', () => {
  it('builds the CSV once per report build', async () => {
    resetResearchCache();
    const runtime = makeTestRuntime();
    const source = await runtime.store.createSource({ kind: 'rss', title: 'hh', config: { url: 'https://example.com/rss' } });
    const day = new Date(Date.now() - 3 * 86_400_000).toISOString();
    await runtime.store.insertLead({
      id: 'r1', sourceId: source.id, type: 'job', title: 'Senior Python разработчик', text: 'Компания: Acme', url: 'https://hh.ru/vacancy/1',
      fingerprint: 'fp-r1', titleKey: 'r1', status: 'new', score: 50, reasons: [], createdAt: day, publishedAt: day,
    } as Lead);
    const now = new Date();
    const first = await liveDatasetCsv(runtime.store, now);
    expect(first.split('\n').length).toBeGreaterThan(2);
    // Mutating the cached build's records would show up if the CSV were rebuilt per request.
    const { records } = await liveReport(runtime.store, now);
    records.push({ ...records[0]!, id: 'injected' });
    const second = await liveDatasetCsv(runtime.store, now);
    expect(second).toBe(first);
    expect(second).not.toContain('injected');
    // A new build (cache reset) rebuilds the CSV.
    resetResearchCache();
    expect(await liveDatasetCsv(runtime.store, now)).toBe(first);
    await runtime.store.close();
    resetResearchCache();
  });
});

describe('occupation filter inside the store', () => {
  it('fills pages and walks the cursor past sparse matches', async () => {
    const store = createTestStore();
    const source = await store.createSource({ kind: 'rss', title: `isco-${Date.now()}`, config: {} });
    const base = Date.now() - 6 * 3600_000;
    const at = (minute: number) => new Date(base + minute * 60_000).toISOString();
    const insert = (id: string, title: string, minute: number) => store.insertLead({
      id, sourceId: source.id, type: 'job', title, text: 'Описание', fingerprint: `fp-${id}`, titleKey: `tk-${id}`,
      status: 'new', score: 50, reasons: [], createdAt: at(minute),
    } as Lead);
    for (let i = 0; i < 250; i++) await insert(`old-${i}`, 'Курьер', i);
    for (let i = 0; i < 3; i++) await insert(`dev-${i}`, 'Python developer', 250 + i);
    for (let i = 0; i < 250; i++) await insert(`new-${i}`, 'Курьер', 253 + i);

    const newest = await store.getLeadsForFeed({ sourceId: source.id, occupationCodes: ['2512'], limit: 2 });
    expect(newest.map((l) => l.id)).toEqual(['dev-2', 'dev-1']);
    const ascending = await store.getLeadsForFeed({ sourceId: source.id, occupationCodes: ['25'], limit: 2, after: { createdAt: at(-1), id: '' } });
    expect(ascending.map((l) => l.id)).toEqual(['dev-0', 'dev-1']);
    const tail = await store.getLeadsForFeed({ sourceId: source.id, occupationCodes: ['2512'], limit: 5, after: { createdAt: ascending[1]!.createdAt, id: ascending[1]!.id } });
    expect(tail.map((l) => l.id)).toEqual(['dev-2']);
    await store.close();
  });

  it('serves /v2/feed?occupation_code with a full page', async () => {
    const runtime = makeTestRuntime({ RADAR_ADMIN_TOKEN: 'secret', RADAR_PUBLIC_READ: true });
    const source = await runtime.store.createSource({ kind: 'rss', title: 'isco-v2', config: {} });
    const base = Date.now() - 3600_000;
    for (let i = 0; i < 300; i++) {
      const dev = i < 2;
      await runtime.store.insertLead({
        id: `v${i}`, sourceId: source.id, type: 'job', title: dev ? 'Python developer' : 'Курьер', text: 'Описание',
        fingerprint: `fpv-${i}`, titleKey: `tkv-${i}`, status: 'new', score: 50, reasons: [], createdAt: new Date(base + i * 1000).toISOString(),
      } as Lead);
    }
    const res = await createApp(runtime).request('/v2/feed?occupation_code=2512&limit=2', { headers: { authorization: 'Bearer secret' } });
    expect(res.status).toBe(200);
    const body = await res.json() as { leads: Array<{ id: string }> };
    expect(body.leads.map((l) => l.id)).toEqual(['v1', 'v0']);
    await runtime.store.close();
  });
});
