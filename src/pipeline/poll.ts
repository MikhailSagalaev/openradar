import { randomUUID } from 'node:crypto';
import type { PollContext, SourceRecord } from '../core/types.ts';
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

export async function pollAll(deps: PollDeps): Promise<PollSummary[]> {
  const allSources = await deps.store.listSources();
  const sources = allSources.filter((source) => {
    if (!source.enabled) return false;
    const adapter = deps.sources.get(source.kind);
    return Boolean(adapter?.poll);
  });

  const concurrency = Math.max(1, deps.env.RADAR_POLL_CONCURRENCY ?? 4);
  const limit = pLimit(concurrency);
  return Promise.all(sources.map((source) => limit(() => pollSource(source, deps))));
}
