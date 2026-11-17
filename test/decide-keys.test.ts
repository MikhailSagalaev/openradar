import { describe, expect, it } from 'vitest';
import { decideKeys, decisionsEnabled, newDecisionKeys, runDecisions } from '../src/pipeline/decide.ts';
import { makeTestRuntime } from './helpers.ts';

const answer = {
  answers: {
    kind: { type: 'choice', choice: 'vacancy', confidence: 0.97 },
    closed: { type: 'noul', noul: 0.02 },
    scam: { type: 'noul', noul: 0 },
    fullness: { type: 'score', score: 2.4 },
  },
  usage: { input_tokens: 600 },
};

const base = { RADAR_DECIDE_ENABLED: true, RADAR_DECIDE_URL: 'https://d.test/v1/systemone', RADAR_DECIDE_MODEL: 'm' };
const logger = { info() {}, warn() {}, error() {}, debug() {}, child() { return logger; } } as never;

async function withLeads(ids: string[], envOver: Record<string, unknown> = {}) {
  const runtime = makeTestRuntime({ ...base, ...envOver });
  const source = await runtime.store.createSource({ kind: 'rss', title: 'Лента', config: {}, enabled: true });
  for (const id of ids) {
    await runtime.store.insertLead({
      id, sourceId: source.id, type: 'job', title: `Пост ${id}`, text: 'Текст поста',
      fingerprint: `f${id}`, titleKey: `k${id}`, status: 'new', score: 50, reasons: [], skills: [], createdAt: new Date().toISOString(),
    } as never);
  }
  return runtime;
}

/** Answers 402 for the dead keys, 200 for the rest; records the bearer of every call. */
function fetchByKeys(dead: string[]) {
  const sent: string[] = [];
  const fetchImpl = (async (_url: string, init: RequestInit) => {
    const auth = String((init.headers as Record<string, string>).authorization ?? '');
    sent.push(auth);
    const key = auth.replace('Bearer ', '');
    if (dead.includes(key)) return new Response('{}', { status: 402 });
    return new Response(JSON.stringify(answer), { status: 200 });
  }) as unknown as typeof fetch;
  return { sent, fetchImpl };
}

describe('the key pool', () => {
  it('merges override, comma list and single key in order, trimmed and deduplicated', () => {
    const keys = decideKeys({
      RADAR_DECIDE_KEY: ' top ', SUBQ_API_KEYS: 'a, b ,top,,a', SUBQ_API_KEY: 'single',
    } as never);
    expect(keys).toEqual(['top', 'a', 'b', 'single']);
  });

  it('is empty without any key', () => {
    expect(decideKeys({} as never)).toEqual([]);
    expect(decisionsEnabled({ ...base } as never)).toBe(false);
    expect(decisionsEnabled({ ...base, SUBQ_API_KEYS: 'a,b' } as never)).toBe(true);
  });

  it('parks a dead key until the cooldown passes, then tries it again', () => {
    let at = 1_000_000;
    const pool = newDecisionKeys({ ...base, SUBQ_API_KEYS: 'a,b', RADAR_DECIDE_KEY_COOLDOWN_MIN: 10 } as never, () => at);
    expect(pool.current()).toBe('a');
    pool.park('a', 402);
    expect(pool.current()).toBe('b');
    pool.park('b', 402);
    expect(pool.current()).toBeUndefined();
    expect(pool.parkedStatus()).toBe(402);
    at += 10 * 60_000;
    expect(pool.current()).toBe('a');
  });

  it('cooldown 0 retries parked keys on the very next call', () => {
    const pool = newDecisionKeys({ ...base, SUBQ_API_KEYS: 'a', RADAR_DECIDE_KEY_COOLDOWN_MIN: 0 } as never);
    pool.park('a', 402);
    expect(pool.current()).toBe('a');
  });
});

describe('rotating keys in a round', () => {
  it('a dead key hands the same post to the next one', async () => {
    const runtime = await withLeads(['a', 'b'], { SUBQ_API_KEYS: 'dead,alive' });
    const { sent, fetchImpl } = fetchByKeys(['dead']);
    const keys = newDecisionKeys(runtime.env);
    const summary = await runDecisions({ store: runtime.store, env: runtime.env, logger, fetchImpl, keys }, 10);
    expect(summary).toMatchObject({ asked: 2, saved: 2, failed: 0, tokens: 1200 });
    expect(summary.stopped).toBeUndefined();
    expect(sent[0]).toBe('Bearer dead');
    expect(sent.filter((a) => a === 'Bearer alive').length).toBe(2);
    // The dead key stays parked for the next round: only the alive one is called.
    sent.length = 0;
    await runtime.store.insertLead({
      id: 'c', sourceId: (await runtime.store.listSources())[0]!.id, type: 'job', title: 'Пост c', text: 'Текст',
      fingerprint: 'fc', titleKey: 'kc', status: 'new', score: 50, reasons: [], skills: [], createdAt: new Date().toISOString(),
    } as never);
    const second = await runDecisions({ store: runtime.store, env: runtime.env, logger, fetchImpl, keys }, 10);
    expect(second.saved).toBe(1);
    expect(sent).toEqual(['Bearer alive']);
  });

  it('stops with the parking status when every key is dead, without extra calls', async () => {
    const runtime = await withLeads(['a', 'b', 'c', 'd', 'e', 'f'], { SUBQ_API_KEYS: 'd1,d2' });
    const { sent, fetchImpl } = fetchByKeys(['d1', 'd2']);
    const keys = newDecisionKeys(runtime.env);
    const summary = await runDecisions({ store: runtime.store, env: runtime.env, logger, fetchImpl, keys }, 10);
    expect(summary.stopped).toBe(402);
    expect(sent.length).toBeLessThanOrEqual(8);
    // Next round: all keys parked, no network call at all.
    sent.length = 0;
    const again = await runDecisions({ store: runtime.store, env: runtime.env, logger, fetchImpl, keys }, 10);
    expect(again.stopped).toBe(402);
    expect(sent.length).toBe(0);
  });

  it('a 429 stops the batch but does not park the key', async () => {
    const runtime = await withLeads(['a', 'b'], { SUBQ_API_KEYS: 'k1,k2' });
    let calls = 0;
    const fetchImpl = (async () => { calls++; return new Response('{}', { status: 429 }); }) as unknown as typeof fetch;
    const keys = newDecisionKeys(runtime.env);
    const summary = await runDecisions({ store: runtime.store, env: runtime.env, logger, fetchImpl, keys }, 10);
    expect(summary.stopped).toBe(429);
    const before = calls;
    await runDecisions({ store: runtime.store, env: runtime.env, logger, fetchImpl, keys }, 10);
    expect(calls).toBeGreaterThan(before);
  });

  it('works with the single key as before when no pool is given', async () => {
    const runtime = await withLeads(['a'], { SUBQ_API_KEY: 'solo' });
    const { sent, fetchImpl } = fetchByKeys([]);
    const summary = await runDecisions({ store: runtime.store, env: runtime.env, logger, fetchImpl }, 10);
    expect(summary.saved).toBe(1);
    expect(sent).toEqual(['Bearer solo']);
  });
});