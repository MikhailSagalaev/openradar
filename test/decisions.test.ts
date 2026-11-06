import { describe, expect, it } from 'vitest';
import { DECISION_VERSION, disagreement, parseDecision, scoreDecisions } from '../src/core/decisions.ts';
import { decisionsEnabled, runDecisions } from '../src/pipeline/decide.ts';
import { createApp } from '../src/server/app.ts';
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

const env = { RADAR_DECIDE_ENABLED: true, RADAR_DECIDE_KEY: 'k', RADAR_DECIDE_URL: 'https://d.test/v1/systemone', RADAR_DECIDE_MODEL: 'm' };
const logger = { info() {}, warn() {}, error() {}, debug() {}, child() { return logger; } } as never;

async function withLeads(ids: string[], over: Record<string, unknown> = {}) {
  const runtime = makeTestRuntime({ ...env });
  const source = await runtime.store.createSource({ kind: 'rss', title: 'Лента', config: {}, enabled: true });
  for (const id of ids) {
    await runtime.store.insertLead({
      id, sourceId: source.id, type: 'job', title: `Пост ${id}`, text: 'Пишите на hr@acme.test или +7 999 123-45-67',
      fingerprint: `f${id}`, titleKey: `k${id}`, status: 'new', score: 50, reasons: [], skills: [], createdAt: new Date().toISOString(), ...over,
    } as never);
  }
  return runtime;
}

describe('answers', () => {
  it('read the shape asked for', () => {
    expect(parseDecision(answer, 'a', 'm', 'now')).toMatchObject({ kind: 'vacancy', kindConfidence: 0.97, closed: 0.02, tokens: 600, version: DECISION_VERSION });
  });

  it('turn anything else down', () => {
    expect(parseDecision({ answers: { ...answer.answers, kind: { choice: 'spam' } } }, 'a', 'm', 'now')).toBeUndefined();
    expect(parseDecision({}, 'a', 'm', 'now')).toBeUndefined();
    expect(parseDecision(null, 'a', 'm', 'now')).toBeUndefined();
  });

  it('say where the model disagrees with the node', () => {
    expect(disagreement({ kind: 'vacancy', closed: 0.9, scam: 0 }, { type: 'job', state: 'active' })).toBe('closed');
    expect(disagreement({ kind: 'vacancy', closed: 0.9, scam: 0 }, { type: 'job', state: 'closed' })).toBeUndefined();
    expect(disagreement({ kind: 'order', closed: 0, scam: 0 }, { type: 'job' })).toBe('type');
    expect(disagreement({ kind: 'other', closed: 0, scam: 0 }, { type: 'job' })).toBe('other');
    expect(disagreement({ kind: 'vacancy', closed: 0, scam: 0 }, { type: 'job' })).toBeUndefined();
  });
});

describe('the score against hand labels', () => {
  it('counts precision and recall of each flag', () => {
    const score = scoreDecisions([
      { verdict: 'closed', type: 'job', kind: 'vacancy', kindConfidence: 0.9, closed: 0.9 },
      { verdict: 'good', type: 'job', kind: 'vacancy', kindConfidence: 0.9, closed: 0.8 },
      { verdict: 'junk', type: 'job', kind: 'other', kindConfidence: 0.95, closed: 0 },
      { verdict: 'wrong_type', type: 'job', kind: 'order', kindConfidence: 0.6, closed: 0 },
    ]);
    expect(score.closed).toEqual({ flagged: 2, right: 1, actual: 1, caught: 1 });
    expect(score.junk).toEqual({ flagged: 1, right: 1, actual: 1, caught: 1 });
    expect(score.type).toEqual({ flagged: 1, right: 1, actual: 1, caught: 1 });
    expect(score.closedBrier).toBeCloseTo((0.01 + 0.64) / 4);
    expect(score.byConfidence.find((b) => b.at === 0.9)?.answered).toBe(3);
  });

  it('has nothing to say without labels', () => {
    expect(scoreDecisions([]).closedBrier).toBeNull();
  });
});

describe('asking the model', () => {
  it('stays off without a key', () => {
    expect(decisionsEnabled({ ...env, RADAR_DECIDE_KEY: undefined } as never)).toBe(false);
  });

  it('sends no contacts, saves answers and does not ask twice', async () => {
    const runtime = await withLeads(['a', 'b']);
    const sent: string[] = [];
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      sent.push(String(init.body));
      return new Response(JSON.stringify(answer), { status: 200 });
    }) as unknown as typeof fetch;
    const deps = { store: runtime.store, env: runtime.env, logger, fetchImpl };
    const summary = await runDecisions(deps, 10);
    expect(summary).toMatchObject({ asked: 2, saved: 2, failed: 0, tokens: 1200 });
    expect(sent.join()).not.toContain('hr@acme.test');
    expect(sent.join()).not.toContain('999 123');
    expect((await runDecisions(deps, 10)).asked).toBe(0);
  });

  it('keeps private posts on the node', async () => {
    const runtime = await withLeads(['p'], { sourceRef: { platform: 'telegram', channel: 'x', visibility: 'private' } });
    expect(await runtime.store.listLeadsToDecide!(10)).toHaveLength(0);
  });

  it('stops when the service says no credits', async () => {
    const runtime = await withLeads(['a', 'b', 'c', 'd', 'e', 'f']);
    let calls = 0;
    const fetchImpl = (async () => { calls++; return new Response('{}', { status: 402 }); }) as unknown as typeof fetch;
    const summary = await runDecisions({ store: runtime.store, env: runtime.env, logger, fetchImpl }, 10);
    expect(summary.stopped).toBe(402);
    expect(calls).toBeLessThanOrEqual(4);
  });
});

describe('admin page', () => {
  it('is closed to guests', async () => {
    const app = createApp(makeTestRuntime({ RADAR_PUBLIC_READ: true }));
    expect((await app.request('/admin/decisions')).status).toBe(302);
  });
});
