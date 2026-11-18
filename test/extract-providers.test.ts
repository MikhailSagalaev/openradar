import { describe, expect, it } from 'vitest';
import { loadEnv } from '../src/config.ts';
import { extractionEnabled, runModelExtraction } from '../src/research/model.ts';
import { extractProviders, newExtractProviders } from '../src/research/providers.ts';
import { makeTestRuntime, testEnv } from './helpers.ts';

const facts = { isPost: true, confidence: 0.9, role: 'bots', payMin: 15000, payMax: 15000, currency: 'RUB', period: 'project' };
const okBody = JSON.stringify({ choices: [{ message: { content: JSON.stringify(facts) } }] });
const logger = { info() {}, warn() {}, error() {}, debug() {}, child() { return logger; } } as never;

const dead = { baseUrl: 'https://dead.test/v1', apiKey: 'dk', model: 'dead-model' };
const live = { baseUrl: 'https://live.test/v1', apiKey: 'lk', model: 'live-model' };

// loadEnv merges overrides after schema parsing, so tests pass the parsed shape (an array).
function envWith(providers: unknown[], extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { RADAR_EXTRACT_ENABLED: true, RADAR_EXTRACT_PROVIDERS: providers, ...extra };
}

async function withLead(envOver: Record<string, unknown>, id = 'm1') {
  const runtime = makeTestRuntime(envOver as never);
  const source = await runtime.store.createSource({ kind: 'telegram', title: 'tg', config: { channel: 'jobs' } });
  await runtime.store.insertLead({
    id, sourceId: source.id, type: 'gig', title: 'Нужен бот', text: 'Бот для записи клиентов, плачу 15 тысяч',
    fingerprint: `f${id}`, titleKey: `k${id}`, status: 'new', score: 50, reasons: [], skills: [], createdAt: new Date().toISOString(),
  } as never);
  return runtime;
}

/** Routes by URL: dead endpoints answer with the given status, live ones return facts. */
function fetchByHost(deadStatus: Map<string, number>) {
  const calls: string[] = [];
  const fetchImpl = (async (input: RequestInfo | URL) => {
    const url = input.toString();
    calls.push(url);
    for (const [host, status] of deadStatus) if (url.startsWith(host)) return new Response('{}', { status });
    return new Response(okBody, { status: 200 });
  }) as typeof fetch;
  return { calls, fetchImpl };
}

describe('the provider list', () => {
  it('puts the JSON pool first and appends the legacy provider once', () => {
    const env = testEnv(envWith([live], { OPENAI_API_KEY: 'legacy', OPENAI_BASE_URL: 'https://legacy.test/v1', OPENAI_MODEL: 'lm', RADAR_EXTRACT_FALLBACK_MODEL: 'lf' }) as never);
    expect(extractProviders(env)).toEqual([
      live,
      { baseUrl: 'https://legacy.test/v1', apiKey: 'legacy', model: 'lm', fallbackModel: 'lf' },
    ]);
  });

  it('does not duplicate the legacy endpoint already in the pool', () => {
    const env = testEnv(envWith([{ ...live }], { OPENAI_API_KEY: 'lk', OPENAI_BASE_URL: 'https://live.test/v1' }) as never);
    expect(extractProviders(env)).toHaveLength(1);
  });

  it('is empty for gigachat and without any key', () => {
    expect(extractProviders(testEnv({ RADAR_EXTRACT_PROVIDER: 'gigachat', GIGACHAT_AUTH_KEY: 'k', ...envWith([live]) } as never))).toEqual([]);
    expect(extractProviders(testEnv())).toEqual([]);
  });

  it('parses the JSON env and rejects malformed values at config load', () => {
    const prev = process.env.RADAR_EXTRACT_PROVIDERS;
    try {
      process.env.RADAR_EXTRACT_PROVIDERS = JSON.stringify([live]);
      expect(loadEnv().RADAR_EXTRACT_PROVIDERS).toEqual([live]);
      process.env.RADAR_EXTRACT_PROVIDERS = 'not-json';
      expect(() => loadEnv()).toThrow();
      process.env.RADAR_EXTRACT_PROVIDERS = '[{"baseUrl":"nope"}]';
      expect(() => loadEnv()).toThrow();
    } finally {
      if (prev === undefined) delete process.env.RADAR_EXTRACT_PROVIDERS;
      else process.env.RADAR_EXTRACT_PROVIDERS = prev;
    }
  });

  it('enables extraction with only the pool configured', () => {
    expect(extractionEnabled(testEnv(envWith([live]) as never))).toBe(true);
    expect(extractionEnabled(testEnv({ RADAR_EXTRACT_ENABLED: true }))).toBe(false);
  });
});

describe('the provider pool', () => {
  it('parks a dead provider until the cooldown passes', () => {
    let at = 1_000_000;
    const env = testEnv(envWith([dead, live], { RADAR_EXTRACT_PROVIDER_COOLDOWN_MIN: 10 }) as never);
    const pool = newExtractProviders(env, () => at);
    expect(pool.current()).toEqual(dead);
    pool.park(dead, 402);
    expect(pool.current()).toEqual(live);
    pool.park(live, 401);
    expect(pool.current()).toBeUndefined();
    expect(pool.parkedStatus()).toBe(401);
    at += 10 * 60_000;
    expect(pool.current()).toEqual(dead);
  });
});

describe('rotating providers in a batch', () => {
  it('a dead endpoint hands the same post to the next one', async () => {
    const runtime = await withLead(envWith([dead, live]));
    const { calls, fetchImpl } = fetchByHost(new Map([['https://dead.test', 402]]));
    const providers = newExtractProviders(runtime.env);
    const summary = await runModelExtraction({ ...runtime, logger, fetchImpl, providers }, { limit: 10, pauseMs: 0 });
    expect(summary).toMatchObject({ asked: 1, saved: 1, failed: 0 });
    expect(summary.stopped).toBeUndefined();
    expect(calls[0]).toBe('https://dead.test/v1/chat/completions');
    expect(calls[1]).toBe('https://live.test/v1/chat/completions');
    // The stored facts name the model that actually answered.
    const stored = (await runtime.store.getLead('m1'))!.metadata as { model?: { model?: string } };
    expect(stored.model?.model).toBe('live-model');
    // Next round: the dead endpoint stays parked, only the live one is called.
    await runtime.store.insertLead({
      id: 'm2', sourceId: (await runtime.store.listSources())[0]!.id, type: 'gig', title: 'Нужен сайт', text: 'Лендинг, бюджет 20 тысяч',
      fingerprint: 'fm2', titleKey: 'km2', status: 'new', score: 50, reasons: [], skills: [], createdAt: new Date().toISOString(),
    } as never);
    calls.length = 0;
    const second = await runModelExtraction({ ...runtime, logger, fetchImpl, providers }, { limit: 10, pauseMs: 0 });
    expect(second.saved).toBe(1);
    expect(calls).toEqual(['https://live.test/v1/chat/completions']);
  });

  it('stops with the parking status when every endpoint is dead, without extra calls', async () => {
    const runtime = await withLead(envWith([dead, live]));
    const { calls, fetchImpl } = fetchByHost(new Map([['https://dead.test', 402], ['https://live.test', 401]]));
    const providers = newExtractProviders(runtime.env);
    const summary = await runModelExtraction({ ...runtime, logger, fetchImpl, providers }, { limit: 10, pauseMs: 0 });
    expect(summary.stopped).toBe(401);
    calls.length = 0;
    const again = await runModelExtraction({ ...runtime, logger, fetchImpl, providers }, { limit: 10, pauseMs: 0 });
    expect(again.stopped).toBe(401);
    expect(calls.length).toBe(0);
  });

  it('a 429 pauses the batch but does not park the endpoint', async () => {
    const runtime = await withLead(envWith([live]));
    const { calls, fetchImpl } = fetchByHost(new Map([['https://live.test', 429]]));
    const providers = newExtractProviders(runtime.env);
    const summary = await runModelExtraction({ ...runtime, logger, fetchImpl, providers }, { limit: 10, pauseMs: 0 });
    expect(summary.stopped).toBeUndefined();
    expect(summary.pausedMs).toBeGreaterThanOrEqual(0);
    const before = calls.length;
    await runModelExtraction({ ...runtime, logger, fetchImpl, providers }, { limit: 10, pauseMs: 0 });
    expect(calls.length).toBeGreaterThan(before);
  });

  it('records the cascade fallback model when the primary returns nothing usable', async () => {
    const runtime = await withLead(envWith([{ ...live, fallbackModel: 'live-fallback' }]));
    const calls: string[] = [];
    const fetchImpl = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { model: string };
      calls.push(body.model);
      if (body.model === 'live-model') return new Response(JSON.stringify({ choices: [{ message: { content: 'not json' } }] }), { status: 200 });
      return new Response(okBody, { status: 200 });
    }) as typeof fetch;
    const providers = newExtractProviders(runtime.env);
    const summary = await runModelExtraction({ ...runtime, logger, fetchImpl, providers }, { limit: 10, pauseMs: 0 });
    expect(summary.saved).toBe(1);
    expect(calls).toEqual(['live-model', 'live-fallback']);
    const stored = (await runtime.store.getLead('m1'))!.metadata as { model?: { model?: string } };
    expect(stored.model?.model).toBe('live-fallback');
  });
});