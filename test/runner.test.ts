import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The poll loop, the outbox and the model extraction are stood in for: these tests are about
// the runner's scheduling, not about what each job does.
const pollAll = vi.fn(async () => [] as unknown[]);
const processOutbox = vi.fn(async () => ({ processed: 0, delivered: 0, failed: 0 }));
const extraction = { enabled: false, summary: { asked: 0, saved: 0, failed: 0, ids: [] as string[] } as Record<string, unknown> };
const runModelExtraction = vi.fn(async () => extraction.summary);

vi.mock('../src/pipeline/poll.ts', async (importOriginal) => ({ ...(await importOriginal<object>()), pollAll }));
vi.mock('../src/pipeline/outbox.ts', async (importOriginal) => ({ ...(await importOriginal<object>()), processOutbox }));
vi.mock('../src/research/model.ts', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  extractionEnabled: () => extraction.enabled,
  runModelExtraction,
}));

const { PollRunner } = await import('../src/pipeline/runner.ts');
const { ServiceMonitor } = await import('../src/core/services.ts');
const { SinkRegistry } = await import('../src/sinks/index.ts');
const { makeTestRuntime } = await import('./helpers.ts');

const logger = { info() {}, warn() {}, error() {}, debug() {}, child() { return logger; } } as never;

/** The runner's private schedule, reached for the tests. */
interface Internals {
  runDecisionsIfDue(): void;
  runEnrichmentIfDue(): void;
  runExtractionIfDue(): void;
  decisionsRunning: boolean;
  enrichmentRunning: boolean;
  extractionRunning: boolean;
  nextDecisionsAt: number;
  lastExtractionAt: number;
  timer: unknown;
  backgroundTimer: unknown;
  running: boolean;
  backgroundRunning: boolean;
  runMaintenanceIfDue(): Promise<void>;
}

const decideEnv = { RADAR_DECIDE_ENABLED: true, RADAR_DECIDE_KEY: 'k', RADAR_DECIDE_URL: 'https://d.test/v1', RADAR_DECIDE_MODEL: 'm', RADAR_DECIDE_PER_HOUR: 30 };
const answer = { answers: { kind: { type: 'choice', choice: 'vacancy', confidence: 0.9 }, closed: { type: 'noul', noul: 0.01 }, scam: { type: 'noul', noul: 0 }, fullness: { type: 'score', score: 2 } }, usage: { input_tokens: 100 } };

let leadNo = 0;
async function runnerWith(env: Record<string, unknown>, fetchImpl: typeof fetch, withLead = true) {
  const runtime = makeTestRuntime(env as never);
  if (withLead) {
    const source = await runtime.store.createSource({ kind: 'rss', title: 'Лента', config: {}, enabled: true });
    const n = ++leadNo;
    await runtime.store.insertLead({ id: `rl${n}`, sourceId: source.id, type: 'job', title: 'Пост', text: 'Текст вакансии достаточно длинный для решения модели.', fingerprint: `frl${n}`, titleKey: `krl${n}`, status: 'new', score: 50, reasons: [], skills: [], createdAt: new Date().toISOString() } as never);
  }
  const services = new ServiceMonitor();
  const record = vi.spyOn(services, 'record');
  const deps = { store: runtime.store, sinks: new SinkRegistry(), logger, env: runtime.env, sources: runtime.sources, fetchImpl, services };
  const runner = new PollRunner(deps, 60, logger);
  return { runtime, runner, internals: runner as unknown as Internals, record };
}

let globalFetch: ReturnType<typeof vi.fn>;
beforeEach(() => {
  // Any call to the global fetch is a leak past the injected fetchImpl.
  globalFetch = vi.fn(async () => { throw new Error('global fetch used'); });
  vi.stubGlobal('fetch', globalFetch);
  pollAll.mockClear();
  processOutbox.mockClear();
  runModelExtraction.mockClear();
  extraction.enabled = false;
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('PollRunner decisions', () => {
  it('asks through the injected fetchImpl, never the global fetch', async () => {
    const injected = vi.fn(async () => new Response(JSON.stringify(answer), { status: 200 }));
    const { runtime, internals, record } = await runnerWith(decideEnv, injected as unknown as typeof fetch);
    const before = Date.now();
    internals.runDecisionsIfDue();
    await vi.waitFor(() => expect(internals.decisionsRunning).toBe(false));
    expect(injected).toHaveBeenCalledTimes(1);
    expect(String((injected.mock.calls[0] as unknown[])[0])).toBe('https://d.test/v1');
    expect(globalFetch).not.toHaveBeenCalled();
    expect(record).toHaveBeenCalledWith('subq', expect.any(String), 'ok');
    // A good round: the next batch is two minutes away, not an hour.
    expect(internals.nextDecisionsAt).toBeGreaterThanOrEqual(before + 2 * 60_000);
    expect(internals.nextDecisionsAt).toBeLessThan(before + 10 * 60_000);
    await runtime.store.close();
  });

  it.each([401, 402, 403, 429])('pauses an hour after HTTP %i and reports the service down', async (status) => {
    const injected = vi.fn(async () => new Response('no', { status }));
    const { runtime, internals, record } = await runnerWith(decideEnv, injected as unknown as typeof fetch);
    const before = Date.now();
    internals.runDecisionsIfDue();
    await vi.waitFor(() => expect(internals.decisionsRunning).toBe(false));
    expect(internals.nextDecisionsAt).toBeGreaterThanOrEqual(before + 60 * 60_000);
    expect(record).toHaveBeenCalledWith('subq', expect.any(String), 'error', expect.objectContaining({ httpStatus: status }));
    // Paused: another tick inside the hour asks nothing.
    const calls = injected.mock.calls.length;
    internals.runDecisionsIfDue();
    expect(internals.decisionsRunning).toBe(false);
    expect(injected.mock.calls.length).toBe(calls);
    expect(globalFetch).not.toHaveBeenCalled();
    await runtime.store.close();
  });

  it('a non-stop failure keeps the two-minute pace', async () => {
    const injected = vi.fn(async () => new Response('oops', { status: 500 }));
    const { runtime, internals, record } = await runnerWith(decideEnv, injected as unknown as typeof fetch);
    const before = Date.now();
    internals.runDecisionsIfDue();
    await vi.waitFor(() => expect(internals.decisionsRunning).toBe(false));
    expect(internals.nextDecisionsAt).toBeLessThan(before + 10 * 60_000);
    expect(record).not.toHaveBeenCalledWith('subq', expect.any(String), 'error', expect.anything());
    await runtime.store.close();
  });
});

describe('PollRunner enrichment', () => {
  it('reads pages through the injected fetchImpl', async () => {
    const injected = vi.fn(async () => new Response('not here', { status: 404 }));
    const { runtime, internals } = await runnerWith({ RADAR_ENRICH_PER_HOUR: 30 }, injected as unknown as typeof fetch, false);
    runtime.store.listLeadsToEnrich = async () => [{ id: 'e1', url: 'https://jobs.example.test/vacancy/1', text: 'short' }] as never;
    internals.runEnrichmentIfDue();
    await vi.waitFor(() => expect(internals.enrichmentRunning).toBe(false));
    expect(injected).toHaveBeenCalled();
    expect(injected.mock.calls.every((call) => String((call as unknown[])[0]).startsWith('https://jobs.example.test/'))).toBe(true);
    expect(globalFetch).not.toHaveBeenCalled();
    await runtime.store.close();
  });
});

describe('PollRunner model extraction', () => {
  it('waits out a 429 pause before the next batch', async () => {
    extraction.enabled = true;
    extraction.summary = { asked: 2, saved: 0, failed: 2, ids: [], pausedMs: 10 * 60_000 };
    const { runtime, internals, record } = await runnerWith({ RADAR_EXTRACT_PER_HOUR: 60 }, vi.fn() as unknown as typeof fetch, false);
    const before = Date.now();
    internals.runExtractionIfDue();
    await vi.waitFor(() => expect(internals.extractionRunning).toBe(false));
    // The next batch is due once the pause is over: lastExtractionAt + interval = now + pause.
    expect(internals.lastExtractionAt + 2 * 60_000).toBeGreaterThanOrEqual(before + 10 * 60_000);
    expect(internals.lastExtractionAt + 2 * 60_000).toBeLessThan(before + 11 * 60_000);
    expect(record).toHaveBeenCalledWith('extract', expect.any(String), 'degraded', expect.objectContaining({ httpStatus: 429 }));
    internals.runExtractionIfDue();
    expect(runModelExtraction).toHaveBeenCalledTimes(1);
    await runtime.store.close();
  });

  it('pauses an hour when the provider stops the batch', async () => {
    extraction.enabled = true;
    extraction.summary = { asked: 1, saved: 0, failed: 1, ids: [], stopped: 402 };
    const { runtime, internals, record } = await runnerWith({ RADAR_EXTRACT_PER_HOUR: 60 }, vi.fn() as unknown as typeof fetch, false);
    const before = Date.now();
    internals.runExtractionIfDue();
    await vi.waitFor(() => expect(internals.extractionRunning).toBe(false));
    expect(internals.lastExtractionAt + 2 * 60_000).toBeGreaterThanOrEqual(before + 60 * 60_000);
    expect(record).toHaveBeenCalledWith('extract', expect.any(String), 'error', expect.objectContaining({ httpStatus: 402 }));
    internals.runExtractionIfDue();
    expect(runModelExtraction).toHaveBeenCalledTimes(1);
    await runtime.store.close();
  });
});

describe('PollRunner lifecycle', () => {
  it('polls on its interval, runs the background loop with maintenance, and stop() clears both timers', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'Date'] });
    const injected = vi.fn(async () => new Response('', { status: 404 }));
    const { runtime, runner, internals } = await runnerWith({ RADAR_ENRICH_PER_HOUR: 0, RADAR_VISA_SPONSORS: false }, injected as unknown as typeof fetch, false);
    const cleanup = vi.fn(async () => 0);
    runtime.store.cleanupRuns = cleanup;

    runner.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(pollAll).toHaveBeenCalledTimes(1);
    expect(processOutbox).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(cleanup).toHaveBeenCalledTimes(1)); // maintenance is invoked
    // Both loops skip a tick while their previous run is active; on a real store (Postgres) the
    // first poll and the first background pass (maintenance) still await I/O here, so let them
    // finish before advancing the clock, and wait for the second pass the same way.
    await vi.waitFor(() => expect(internals.running).toBe(false));
    await vi.waitFor(() => expect(internals.backgroundRunning).toBe(false));

    await vi.advanceTimersByTimeAsync(60_000);
    await vi.waitFor(() => expect(pollAll).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(processOutbox).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(internals.backgroundRunning).toBe(false));

    runner.stop();
    expect(internals.timer).toBeUndefined();
    expect(internals.backgroundTimer).toBeUndefined();
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(pollAll).toHaveBeenCalledTimes(2);
    expect(processOutbox).toHaveBeenCalledTimes(2);
    expect(globalFetch).not.toHaveBeenCalled();
    await runtime.store.close();
  });
});

describe('PollRunner maintenance', () => {
  it('keeps running the rest of the pass when the lead lifecycle fails (unwritable archive dir)', async () => {
    const { runtime, internals } = await runnerWith({}, vi.fn() as unknown as typeof fetch, false);
    runtime.store.exportArchivedLeads = vi.fn(async () => {
      throw Object.assign(new Error("EACCES: permission denied, mkdir 'data/archives'"), { code: 'EACCES' });
    });
    const compact = vi.fn(async () => 0);
    runtime.store.compactOldLeads = compact;
    const cleanupRuns = vi.fn(async () => 0);
    runtime.store.cleanupRuns = cleanupRuns;
    const purge = vi.fn(async () => 0);
    runtime.store.purgeExpiredSessions = purge;

    await internals.runMaintenanceIfDue();

    expect(compact).not.toHaveBeenCalled(); // retention never runs past a failed export
    expect(cleanupRuns).toHaveBeenCalledWith(30);
    expect(purge).toHaveBeenCalled();
    await runtime.store.close();
  });
});
