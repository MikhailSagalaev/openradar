import { describe, expect, it } from 'vitest';
import { ReplayCache, idempotencyKey } from '../src/core/replay.ts';
import { newDecisionReplay, runDecisions } from '../src/pipeline/decide.ts';
import { aggregateSourceQuality, computeSourceQuality } from '../src/hub/source-quality.ts';
import { createApp } from '../src/server/app.ts';
import type { SignalRecord } from '../src/core/store.ts';
import { makeTestRuntime } from './helpers.ts';

const NOW = new Date('2026-11-13T12:00:00.000Z');
const logger = { info() {}, warn() {}, error() {}, debug() {}, child() { return logger; } } as never;
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

describe('replay cache (plan 021E idempotency)', () => {
  it('runs once per key and replays inside the window', async () => {
    let clock = 1_000_000;
    const cache = new ReplayCache<string>({ windowMs: 1000, now: () => clock });
    let calls = 0;
    const call = async () => { calls++; return 'answer'; };
    expect(await cache.run('k', call)).toEqual({ value: 'answer', replayed: false });
    expect(await cache.run('k', call)).toEqual({ value: 'answer', replayed: true });
    expect(calls).toBe(1);
    clock += 1001; // window expired
    expect(await cache.run('k', call)).toEqual({ value: 'answer', replayed: false });
    expect(calls).toBe(2);
  });

  it('dedupes concurrent in-flight calls for the same key', async () => {
    const cache = new ReplayCache<number>();
    let calls = 0;
    let release!: (v: number) => void;
    const gate = new Promise<number>((r) => { release = r; });
    const call = () => { calls++; return gate; };
    const a = cache.run('k', call);
    const b = cache.run('k', call);
    release(42);
    expect(await a).toEqual({ value: 42, replayed: false });
    expect(await b).toEqual({ value: 42, replayed: true });
    expect(calls).toBe(1);
  });

  it('does not cache failures and stays bounded', async () => {
    const cache = new ReplayCache<string>({ maxEntries: 2 });
    let calls = 0;
    await expect(cache.run('bad', async () => { calls++; throw new Error('boom'); })).rejects.toThrow('boom');
    await expect(cache.run('bad', async () => { calls++; throw new Error('boom'); })).rejects.toThrow('boom');
    expect(calls).toBe(2); // a failure is retried, not replayed
    await cache.run('a', async () => 'x');
    await cache.run('b', async () => 'x');
    await cache.run('c', async () => 'x');
    expect(cache.size).toBeLessThanOrEqual(2);
  });

  it('keys on actor and payload', () => {
    expect(idempotencyKey('m', { a: 1 })).toBe(idempotencyKey('m', { a: 1 }));
    expect(idempotencyKey('m', { a: 1 })).not.toBe(idempotencyKey('m', { a: 2 }));
    expect(idempotencyKey('m', { a: 1 })).not.toBe(idempotencyKey('other', { a: 1 }));
  });
});

describe('idempotent model decisions (plan 021E)', () => {
  const env = { RADAR_DECIDE_ENABLED: true, RADAR_DECIDE_KEY: 'k', RADAR_DECIDE_URL: 'https://d.test/v1', RADAR_DECIDE_MODEL: 'm' };
  const answer = { answers: { kind: { type: 'choice', choice: 'vacancy', confidence: 0.9 }, closed: { type: 'noul', noul: 0.01 }, scam: { type: 'noul', noul: 0 }, fullness: { type: 'score', score: 2 } }, usage: { input_tokens: 100 } };

  async function runtimeWithLead() {
    const runtime = makeTestRuntime({ ...env });
    const source = await runtime.store.createSource({ kind: 'rss', title: 'Лента', config: {}, enabled: true });
    await runtime.store.insertLead({ id: 'a', sourceId: source.id, type: 'job', title: 'Пост a', text: 'Текст вакансии достаточно длинный для решения модели.', fingerprint: 'fa', titleKey: 'ka', status: 'new', score: 50, reasons: [], skills: [], createdAt: NOW.toISOString() } as never);
    return runtime;
  }

  it('a shared cache pays once across overlapping rounds (in-flight dedup)', async () => {
    const runtime = await runtimeWithLead();
    let calls = 0;
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const fetchImpl = (async () => { calls++; await gate; return new Response(JSON.stringify(answer), { status: 200 }); }) as unknown as typeof fetch;
    const replay = newDecisionReplay();
    const deps = { store: runtime.store, env: runtime.env, logger, fetchImpl, replay };
    // Two rounds start before either answer is saved: the second must replay, not re-bill.
    const first = runDecisions(deps, 10);
    const second = runDecisions(deps, 10);
    release();
    const [a, b] = await Promise.all([first, second]);
    expect(calls).toBe(1); // the paid model call happened exactly once
    expect(a.asked + b.asked).toBe(2);
    expect(a.replayed + b.replayed).toBe(1); // one round replayed the other's in-flight answer
    await runtime.store.close();
  });

  it('a fresh cache pays again (no cross-runtime leak)', async () => {
    const runtime = await runtimeWithLead();
    let calls = 0;
    const fetchImpl = (async () => { calls++; return new Response(JSON.stringify(answer), { status: 200 }); }) as unknown as typeof fetch;
    // Same lead content, two independent runtimes: each pays once, no module-level leak.
    const other = await runtimeWithLead();
    await runDecisions({ store: runtime.store, env: runtime.env, logger, fetchImpl }, 10);
    await runDecisions({ store: other.store, env: other.env, logger, fetchImpl }, 10);
    expect(calls).toBe(2);
    await runtime.store.close();
    await other.store.close();
  });
});

describe('source quality (plan 021E)', () => {
  const sig = (leadId: string, pubkey: string, signal: SignalRecord['signal'], days = 1): SignalRecord =>
    ({ leadId, pubkey, signal, comment: '', createdAt: daysAgo(days) });

  it('aggregates weighted signals into a score and confidence', () => {
    const bySource = new Map<string, SignalRecord[]>([
      ['good', [sig('l1', 'mod', 'useful'), sig('l2', 'mod', 'useful')]],
      ['bad', [sig('l3', 'mod', 'junk'), sig('l4', 'mod', 'scam')]],
      ['quiet', [sig('l5', 'ghost', 'useful')]], // zero-weight signer
    ]);
    const weights: Record<string, number> = { mod: 1, ghost: 0 };
    const [good, bad] = aggregateSourceQuality(bySource, (p) => weights[p] ?? 0);
    expect(good).toMatchObject({ sourceId: 'good', score: 1, confident: true, volume: 2 });
    expect(bad!.score).toBeLessThan(0);
    expect(bad!.confident).toBe(true);
    const quiet = aggregateSourceQuality(bySource, (p) => weights[p] ?? 0).find((q) => q.sourceId === 'quiet')!;
    expect(quiet).toMatchObject({ volume: 0, score: 0, confident: false });
  });

  it('closed signals are neutral and scam weighs double', () => {
    const bySource = new Map<string, SignalRecord[]>([
      ['s', [sig('l1', 'mod', 'useful'), sig('l2', 'mod', 'scam'), sig('l3', 'mod', 'closed')]],
    ]);
    const [q] = aggregateSourceQuality(bySource, () => 1);
    // (1 useful − 2·1 scam) / (1+1) = −0.5; closed excluded from volume
    expect(q!.score).toBe(-0.5);
    expect(q!.volume).toBe(2);
    expect(q!.closed).toBe(1);
  });

  it('computes from the store with moderator and mature-GitHub weights', async () => {
    const runtime = makeTestRuntime();
    const source = await runtime.store.createSource({ kind: 'rss', title: 'Борд', config: {} });
    const insert = (id: string) => runtime.store.insertLead({ id, sourceId: source.id, type: 'job', title: id, text: 't', fingerprint: `f${id}`, titleKey: `k${id}`, status: 'new', score: 50, reasons: [], skills: [], createdAt: daysAgo(2) } as never);
    await insert('l1'); await insert('l2'); await insert('l3'); await insert('l4');
    // A moderator (weight 1) and a mature GitHub account (weight 0.2).
    await runtime.store.touchParticipant('modkey');
    await runtime.store.upsertSignal(sig('l1', 'modkey', 'useful'));
    const user = await runtime.store.upsertGitHubUser!({ githubId: 7, handle: 'veteran', githubCreatedAt: daysAgo(400) });
    await runtime.store.touchParticipant('vetkey');
    await runtime.store.linkParticipantGithub('vetkey', user.id);
    await runtime.store.upsertSignal(sig('l2', 'vetkey', 'useful'));
    await runtime.store.upsertSignal(sig('l3', 'vetkey', 'junk'));
    // An out-of-window signal must not count (its own lead: one signal per lead+signer).
    await runtime.store.upsertSignal(sig('l4', 'modkey', 'scam', 90));

    const quality = await computeSourceQuality(runtime.store, new Set(['modkey']), NOW);
    const q = quality.find((x) => x.sourceId === source.id)!;
    expect(q).toBeDefined();
    expect(q.useful).toBeCloseTo(1.2, 5); // mod 1 + vet 0.2
    expect(q.junk).toBeCloseTo(0.2, 5);
    expect(q.scam).toBe(0); // the 90-day-old scam is outside the window
    expect(q.confident).toBe(true);
    await runtime.store.close();
  });

  it('is exposed to admins only', async () => {
    const runtime = makeTestRuntime({ RADAR_ADMIN_GITHUB: 'boss' });
    const app = createApp(runtime);
    const denied = await app.request('/admin/source-quality');
    expect(denied.status).toBe(403);
    await runtime.store.close();
  });
});
