import { pollBackoffFactor, shouldQuarantineSource } from '../core/source-health.ts';
import { randomUUID } from 'node:crypto';
import type { PollContext, SourceRecord } from '../core/types.ts';
import { sourceProxyUrl } from '../net/proxy.ts';
import type { SourceRegistry } from '../sources/index.ts';
import { type IngestDeps, ingestRawLeads } from './ingest.ts';

export interface PollDeps extends IngestDeps {
  sources: SourceRegistry;
}

export interface PollSummary {
  sourceId: string;
  sourceTitle: string;
  found: number;
  inserted: number;
  duplicates: number;
  rejected: number;
  delivered: number;
  failed: number;
  durationMs: number;
  error?: string;
}

export async function pollSource(
  source: SourceRecord,
  deps: PollDeps,
): Promise<PollSummary> {
  const startedAt = new Date().toISOString();
  const startedMs = Date.now();
  const logger = deps.logger.child(`source:${source.id}`);
  const empty: PollSummary = {
    sourceId: source.id,
    sourceTitle: source.title,
    found: 0,
    inserted: 0,
    duplicates: 0,
    rejected: 0,
    delivered: 0,
    failed: 0,
    durationMs: 0,
  };

  const adapter = deps.sources.get(source.kind);
  if (!adapter) {
    const error = `No adapter registered for kind "${source.kind}"`;
    await deps.store.recordRun({
      id: randomUUID(),
      sourceId: source.id,
      startedAt,
      finishedAt: new Date().toISOString(),
      found: 0,
      inserted: 0,
      duplicates: 0,
      rejected: 0,
      delivered: 0,
      error,
    });
    return { ...empty, durationMs: Date.now() - startedMs, error };
  }

  if (!adapter.poll) {
    const error = `Source "${source.id}" is not pollable; POST to /api/ingest/${source.id}`;
    await deps.store.recordRun({
      id: randomUUID(),
      sourceId: source.id,
      startedAt,
      finishedAt: new Date().toISOString(),
      found: 0,
      inserted: 0,
      duplicates: 0,
      rejected: 0,
      delivered: 0,
      error,
    });
    return { ...empty, durationMs: Date.now() - startedMs, error };
  }

  const ctx: PollContext = {
    fetchImpl: deps.fetchImpl ?? fetch,
    userAgent: deps.env.RADAR_USER_AGENT,
    timeoutMs: deps.env.RADAR_HTTP_TIMEOUT_MS,
    logger,
    now: deps.now ?? (() => new Date()),
    proxyUrl: sourceProxyUrl(source.config),
    store: deps.store,
    ghostCheck: deps.env.RADAR_ATS_GHOST_CHECK !== false,
  };

  try {
    const raws = await adapter.poll(source, ctx);
    const summary = await ingestRawLeads(raws, source, deps);
    const result: PollSummary = {
      sourceId: source.id,
      sourceTitle: source.title,
      found: summary.found,
      inserted: summary.inserted,
      duplicates: summary.duplicates,
      rejected: summary.rejected,
      delivered: summary.delivered,
      failed: summary.failed,
      durationMs: Date.now() - startedMs,
    };

    await deps.store.recordRun({
      id: randomUUID(),
      sourceId: source.id,
      startedAt,
      finishedAt: new Date().toISOString(),
      found: result.found,
      inserted: result.inserted,
      duplicates: result.duplicates,
      rejected: result.rejected,
      delivered: result.delivered,
    });

    logger.info('poll finished', result);
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('poll failed', { error: message });
    await deps.store.recordRun({
      id: randomUUID(),
      sourceId: source.id,
      startedAt,
      finishedAt: new Date().toISOString(),
      found: 0,
      inserted: 0,
      duplicates: 0,
      rejected: 0,
      delivered: 0,
      error: message,
    });
    return { ...empty, durationMs: Date.now() - startedMs, error: message };
  }
}

export function pLimit(concurrency: number) {
  const queue: Array<() => void> = [];
  let active = 0;

  const next = () => {
    active--;
    if (queue.length > 0) {
      active++;
      const fn = queue.shift()!;
      fn();
    }
  };

  return async <T>(fn: () => Promise<T>): Promise<T> => {
    if (active >= concurrency) {
      await new Promise<void>((resolve) => queue.push(resolve));
    } else {
      active++;
    }
    try {
      return await fn();
    } finally {
      next();
    }
  };
}

/** When each source was last started in this process; drives the order and per-source intervals. */
const lastPolledAt = new Map<string, number>();

export interface PollAllOptions {
  /** Do not start sources after this moment (epoch ms); the rest go first on the next run. */
  deadline?: number;
}

/**
 * Polls the enabled sources, the longest-waiting first. A source may set `config.intervalSec`
 * to be polled less often than every tick. With a deadline, a slow run stops starting new
 * sources instead of growing longer than the tick.
 */
const MAX_BACKOFF_INTERVAL_SEC = 6 * 3600;
const DEFAULT_ERROR_BASE_INTERVAL_SEC = 300;

export async function pollAll(deps: PollDeps, options: PollAllOptions = {}): Promise<PollSummary[]> {
  const [allSources, healthList] = await Promise.all([
    deps.store.listSources(),
    deps.store.getSourceHealth ? deps.store.getSourceHealth().catch(() => []) : Promise.resolve([]),
  ]);
  const healthById = new Map(healthList.map((h) => [h.source.id, h]));
  const now = Date.now();
  const eligible: SourceRecord[] = [];

  for (const source of allSources) {
    if (!source.enabled) continue;
    const adapter = deps.sources.get(source.kind);
    if (!adapter?.poll) continue;

    const health = healthById.get(source.id);
    if (health) {
      const q = shouldQuarantineSource(health);
      if (q.quarantine && q.reason) {
        await deps.store.updateSource(source.id, {
          enabled: false,
          config: {
            ...source.config,
            autoDisabledAt: new Date(now).toISOString(),
            autoDisableReason: q.reason,
          },
        }).catch(() => {});
        deps.logger.warn('source auto-disabled by hygiene check', {
          sourceId: source.id,
          title: source.title,
          reason: q.reason,
        });
        continue;
      }
    }

    const baseIntervalSec = Number(source.config.intervalSec) || adapter.defaultPollIntervalSec || 0;
    const factor = pollBackoffFactor(health);
    const effectiveIntervalSec = factor > 1
      ? Math.min((baseIntervalSec || DEFAULT_ERROR_BASE_INTERVAL_SEC) * factor, MAX_BACKOFF_INTERVAL_SEC)
      : baseIntervalSec;

    const last = lastPolledAt.get(source.id);
    if (effectiveIntervalSec > 0 && last !== undefined && now - last < effectiveIntervalSec * 1000) {
      continue;
    }
    eligible.push(source);
  }

  const sources = eligible.sort((a, b) => (lastPolledAt.get(a.id) ?? 0) - (lastPolledAt.get(b.id) ?? 0));

  const concurrency = Math.max(1, deps.env.RADAR_POLL_CONCURRENCY ?? 16);
  const limit = pLimit(concurrency);
  const results = await Promise.all(
    sources.map((source) =>
      limit(async () => {
        if (options.deadline !== undefined && Date.now() > options.deadline) return null;
        lastPolledAt.set(source.id, Date.now());
        return pollSource(source, deps);
      }),
    ),
  );
  const skipped = results.filter((r) => r === null).length;
  if (skipped) deps.logger.warn('poll run hit its deadline; the remaining sources go first next time', { skipped });
  return results.filter((r): r is PollSummary => r !== null);
}
