import { describe, expect, it } from 'vitest';
import { ReplayCache } from '../src/core/replay.ts';
import { newDecisionReplay, runDecisions } from '../src/pipeline/decide.ts';
import { makeTestRuntime } from './helpers.ts';

const logger = { info() {}, warn() {}, error() {}, debug() {}, child() { return logger; } } as never;
const env = { RADAR_DECIDE_ENABLED: true, RADAR_DECIDE_KEY: 'k', RADAR_DECIDE_URL: 'https://d.test/v1', RADAR_DECIDE_MODEL: 'm' };
const answer = { answers: { kind: { type: 'choice', choice: 'vacancy', confidence: 0.9 }, closed: { type: 'noul', noul: 0.01 }, scam: { type: 'noul', noul: 0 }, fullness: { type: 'score', score: 2 } }, usage: { input_tokens: 100 } };

let runNo = 0;
async function runtimeWithLeads(count: number) {
  const runtime = makeTestRuntime({ ...env });
  const source = await runtime.store.createSource({ kind: 'rss', title: 'Лента', config: {}, enabled: true });
  const n = ++runNo;
  const ids: string[] = [];
  for (let i = 0; i < count; i++) {
    const id = `dr${n}-${i}`;
    ids.push(id);
    // Same title and text: the scrubbed payload, and so the idempotency key, is identical.
    await runtime.store.insertLead({ id, sourceId: source.id, type: 'job', title: 'Пост', text: 'Одинаковый текст вакансии для решения модели.', fingerprint: `fdr${n}-${i}`, titleKey: `kdr${n}-${i}`, status: 'new', score: 50, reasons: [], skills: [], createdAt: new Date().toISOString() } as never);
  }
  return { runtime, ids };
}

describe('decision replay keeps only answers', () => {
  it('ReplayCache does not remember a value the predicate rejects', async () => {
    const cache = new ReplayCache<number | string>({ shouldCache: (v) => typeof v === 'string' });
    let calls = 0;
    expect((await cache.run('k', async () => { calls++; return 429; })).replayed).toBe(false);
    expect((await cache.run('k', async () => { calls++; return 'ok'; })).value).toBe('ok');
    expect(await cache.run('k', async () => { calls++; return 'again'; })).toEqual({ value: 'ok', replayed: true });
    expect(calls).toBe(2);
  });

  it('a 429 is not replayed: the next round asks the service again', async () => {
    const { runtime } = await runtimeWithLeads(1);
    const statuses = [429, 200];
    let calls = 0;
    const fetchImpl = (async () => {
      const status = statuses[calls++]!;
      return status === 200 ? new Response(JSON.stringify(answer), { status }) : new Response('slow down', { status });
    }) as unknown as typeof fetch;
    const replay = newDecisionReplay();
    const first = await runDecisions({ store: runtime.store, env: runtime.env, logger, fetchImpl, replay }, 10);
    expect(first.stopped).toBe(429);
    const second = await runDecisions({ store: runtime.store, env: runtime.env, logger, fetchImpl, replay }, 10);
    expect(calls).toBe(2);
    expect(second.stopped).toBeUndefined();
    expect(second.saved).toBe(1);
    await runtime.store.close();
  });

  it('an unparsable answer is not replayed either', async () => {
    const { runtime } = await runtimeWithLeads(1);
    let calls = 0;
    const fetchImpl = (async () => {
      calls++;
      return new Response(JSON.stringify(calls === 1 ? { nonsense: true } : answer), { status: 200 });
    }) as unknown as typeof fetch;
    const replay = newDecisionReplay();
    expect((await runDecisions({ store: runtime.store, env: runtime.env, logger, fetchImpl, replay }, 10)).failed).toBe(1);
    expect((await runDecisions({ store: runtime.store, env: runtime.env, logger, fetchImpl, replay }, 10)).saved).toBe(1);
    expect(calls).toBe(2);
    await runtime.store.close();
  });

  it('two posts with the same text: one paid call, each decision under its own lead', async () => {
    const { runtime, ids } = await runtimeWithLeads(2);
    let calls = 0;
    const fetchImpl = (async () => { calls++; return new Response(JSON.stringify(answer), { status: 200 }); }) as unknown as typeof fetch;
    const saved: string[] = [];
    const save = runtime.store.saveModelDecision!.bind(runtime.store);
    runtime.store.saveModelDecision = async (decision) => { saved.push(decision.leadId); await save(decision); };
    const summary = await runDecisions({ store: runtime.store, env: runtime.env, logger, fetchImpl, replay: newDecisionReplay() }, 10);
    expect(calls).toBe(1);
    expect(summary.saved).toBe(2);
    expect(summary.replayed).toBe(1);
    expect(saved.sort()).toEqual([...ids].sort());
    // Nothing is left to decide: neither post stays undecided.
    expect(await runtime.store.listLeadsToDecide!(10)).toHaveLength(0);
    await runtime.store.close();
  });
});
