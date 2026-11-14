import { describe, expect, it } from 'vitest';
import { ReplayCache, idempotencyKey } from '../src/core/replay.ts';
import { newDecisionReplay, runDecisions } from '../src/pipeline/decide.ts';
import { makeTestRuntime } from './helpers.ts';

const logger = { info() {}, warn() {}, error() {}, debug() {}, child() { return logger; } } as never;

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

  let runtimeNo = 0;
  async function runtimeWithLead() {
    const runtime = makeTestRuntime({ ...env });
    const source = await runtime.store.createSource({ kind: 'rss', title: 'Лента', config: {}, enabled: true });
    // Distinct identity per runtime: Postgres has UNIQUE(fingerprint) and a PRIMARY KEY on id,
    // and insertLead is ON CONFLICT DO NOTHING — a shared 'a'/'fa' would silently no-op.
    // Fresh createdAt too: Postgres listLeadsToDecide only sees the last 30 days.
    const n = ++runtimeNo;
    await runtime.store.insertLead({ id: `a${n}`, sourceId: source.id, type: 'job', title: 'Пост a', text: 'Текст вакансии достаточно длинный для решения модели.', fingerprint: `fa${n}`, titleKey: `ka${n}`, status: 'new', score: 50, reasons: [], skills: [], createdAt: new Date().toISOString() } as never);
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
    // Distinct lead ids (Postgres: UNIQUE fingerprint, PK id; insertLead is ON CONFLICT DO
    // NOTHING). Round 1 decides only its own lead (the other runtime does not exist yet);
    // round 2 then sees just its own fresh lead, because round 1's answer is already saved.
    const first = await runDecisions({ store: runtime.store, env: runtime.env, logger, fetchImpl }, 10);
    const other = await runtimeWithLead();
    const second = await runDecisions({ store: other.store, env: other.env, logger, fetchImpl }, 10);
    expect(first.asked).toBe(1);
    expect(second.asked).toBe(1);
    expect(calls).toBe(2); // a fresh cache paid again: no cross-runtime replay leak
    await runtime.store.close();
    await other.store.close();
  });
});
