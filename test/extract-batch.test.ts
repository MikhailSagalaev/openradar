import { describe, expect, it } from 'vitest';
import { loadEnv } from '../src/config.ts';
import { runModelExtraction } from '../src/research/model.ts';
import { newExtractProviders } from '../src/research/providers.ts';
import { makeTestRuntime } from './helpers.ts';

const logger = { info() {}, warn() {}, error() {}, debug() {}, child() { return logger; } } as never;
const facts = { isPost: true, confidence: 0.9, role: 'bots', payMin: 15000, payMax: 15000, currency: 'RUB', period: 'project' };
const live = { baseUrl: 'https://live.test/v1', apiKey: 'lk', model: 'live-model' };

function envWith(batch: number): Record<string, unknown> {
  return {
    RADAR_EXTRACT_ENABLED: true,
    RADAR_EXTRACT_PROVIDERS: [{ baseUrl: 'https://live.test/v1', apiKey: 'lk', model: 'live-model' }],
    RADAR_EXTRACT_BATCH: batch,
    RADAR_EXTRACT_APPLY: false,
  } as never;
}

async function withLeads(count: number): Promise<ReturnType<typeof makeTestRuntime>> {
  const runtime = makeTestRuntime(envWith(3) as never);
  const source = await runtime.store.createSource({ kind: 'telegram', title: 'tg', config: { channel: 'jobs' } });
  for (let i = 0; i < count; i++) {
    await runtime.store.insertLead({
      id: `m${i}`, sourceId: source.id, type: 'gig', title: `Нужен бот ${i}`, text: 'Бот для записи клиентов, плачу 15 тысяч',
      fingerprint: `f${i}`, titleKey: `k${i}`, status: 'new', score: 50, reasons: [], skills: [], createdAt: new Date().toISOString(),
    } as never);
  }
  return runtime;
}

describe('batched model extraction (план 021E/D2)', () => {
  it('answers a whole chunk with one request when RADAR_EXTRACT_BATCH ≥ 2', async () => {
    const runtime = await withLeads(3);
    let calls = 0;
    const fetchImpl = (async (url: string | URL, init?: RequestInit) => {
      calls++;
      expect(String(url)).toBe('https://live.test/v1/chat/completions');
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ results: [facts, facts, facts] }) } }] }), { status: 200 });
    }) as never;
    const summary = await runModelExtraction(
      { store: runtime.store, env: loadEnv(envWith(3) as never), logger, fetchImpl, providers: newExtractProviders(loadEnv(envWith(3) as never)) },
      { limit: 10, pauseMs: 0 },
    );
    expect(calls).toBe(1);
    expect(summary.saved).toBe(3);
    expect(summary.failed).toBe(0);
    expect(summary.ids).toEqual(['m0', 'm1', 'm2']);
    await runtime.store.close();
  });

  it('falls back to the single-lead path when the batch shape breaks', async () => {
    const runtime = await withLeads(3);
    let batchCalls = 0;
    let singleCalls = 0;
    const fetchImpl = (async (url: string | URL) => {
      batchCalls++;
      // A broken batch: two results for three posts.
      const body = batchCalls === 1 && singleCalls === 0
        ? JSON.stringify({ results: [facts, facts] })
        : JSON.stringify(facts);
      if (body === JSON.stringify(facts)) singleCalls++;
      return new Response(JSON.stringify({ choices: [{ message: { content: body } }] }), { status: 200 });
    }) as never;
    const summary = await runModelExtraction(
      { store: runtime.store, env: loadEnv(envWith(3) as never), logger, fetchImpl, providers: newExtractProviders(loadEnv(envWith(3) as never)) },
      { limit: 10, pauseMs: 0 },
    );
    expect(summary.saved).toBe(3);
    expect(summary.failed).toBe(0);
    expect(batchCalls).toBeGreaterThan(0);
    expect(singleCalls).toBe(3);
    await runtime.store.close();
  });

  it('keeps one lead per call when RADAR_EXTRACT_BATCH is 0', async () => {
    const runtime = await withLeads(2);
    let calls = 0;
    const fetchImpl = (async () => {
      calls++;
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(facts) } }] }), { status: 200 });
    }) as never;
    const summary = await runModelExtraction(
      { store: runtime.store, env: loadEnv(envWith(0) as never), logger, fetchImpl, providers: newExtractProviders(loadEnv(envWith(0) as never)) },
      { limit: 10, pauseMs: 0 },
    );
    expect(calls).toBe(2);
    expect(summary.saved).toBe(2);
    await runtime.store.close();
  });
});
