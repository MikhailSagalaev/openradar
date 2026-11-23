import type { Context } from 'hono';
import type { Runtime } from '../runtime.ts';
import type { Viewer } from '../core/types.ts';
import type { ApiUsageDim } from '../core/store.ts';

/**
 * Agent analytics (план A, 2026-11-19): aggregated call counters over the API, MCP and
 * research surfaces. One upsert per dimension cell per day — never a per-call row, never
 * an IP, never a raw User-Agent. Counting is fire-and-forget: an analytics failure must
 * never break or slow the response it counts. Calls are aggregated in memory and flushed
 * every USAGE_FLUSH_MS (and on shutdown via flushUsage), not written per request.
 */

/** How often buffered counters are written to the store. */
export const USAGE_FLUSH_MS = 15_000;
/** Buffered dimension cells above this flush early, so the buffer stays bounded. */
export const USAGE_MAX_KEYS = 1000;
/** Hard cap on a dimension label: the detail is part of the counter's primary key. */
export const USAGE_DETAIL_MAX = 80;

/** Whitelisted attribution labels: every distribution surface links with its own ?via= value. */
export const VIA_LABELS = new Set([
  'docker-registry', 'treg', 'glama', 'awesome-mcp', 'awesome-list', 'plugin',
  'hn', 'producthunt', 'reddit', 'habr', 'tg', 'extension',
]);

/** Coarse client class from a User-Agent — a class name only, never the raw string or version. */
export function classifyUa(ua: string | undefined): string {
  const s = (ua ?? '').toLowerCase();
  if (!s) return 'other';
  if (s.includes('claude')) return 'claude';
  if (s.includes('codex') || s.includes('chatgpt') || s.includes('openai')) return 'openai';
  if (s.includes('cursor')) return 'cursor';
  if (s.includes('copilot')) return 'copilot';
  if (/bot|spider|crawl|slurp|headless/.test(s)) return 'bot';
  if (s.includes('mozilla')) return 'browser';
  if (/curl|wget|python|node|go-http|axios|okhttp|java\//.test(s)) return 'script';
  return 'other';
}

/** A stable route template: ids, numbers and emails collapse to `{id}` so counters stay bounded. */
export function pathTemplate(path: string): string {
  return path
    .split('/')
    .map((seg) => {
      if (!seg) return seg;
      if (/^[0-9a-f]{8}-[0-9a-f-]{20,}$/i.test(seg) || /^\d+$/.test(seg) || seg.includes('@') || seg.length > 60) return '{id}';
      return seg;
    })
    .join('/');
}

/** The whitelisted `?via=` label, or '' when absent or unknown. */
export function viaFrom(c: Context): string {
  const via = (c.req.query('via') ?? '').toLowerCase();
  return VIA_LABELS.has(via) ? via : '';
}

/** Collapse the fine viewer tiers into the three the analytics cares about. */
export function tierOf(viewer: Pick<Viewer, 'tier'>): 'guest' | 'member' | 'admin' {
  if (viewer.tier === 'admin') return 'admin';
  if (viewer.tier === 'guest') return 'guest';
  return 'member';
}

/** Builds the dimension cell for a counted call. */
export function usageDim(input: {
  surface: ApiUsageDim['surface'];
  detail: string;
  tier: ApiUsageDim['tier'];
  ua?: string;
  via?: string;
  now?: Date;
}): ApiUsageDim {
  return {
    day: (input.now ?? new Date()).toISOString().slice(0, 10),
    surface: input.surface,
    detail: input.detail.slice(0, USAGE_DETAIL_MAX),
    tier: input.tier,
    client: classifyUa(input.ua),
    via: input.via ?? '',
  };
}

interface UsageBuffer {
  dims: Map<string, { dim: ApiUsageDim; calls: number }>;
  /** Token actives not yet written, `${day}\n${userId}`. */
  tokenDays: Set<string>;
  /** Token actives already written for `seenDay`: one upsert per user per day, not per call. */
  seen: Set<string>;
  seenDay: string;
  timer?: ReturnType<typeof setInterval>;
}

const buffers = new WeakMap<Runtime, UsageBuffer>();

function bufferOf(runtime: Runtime): UsageBuffer {
  let buffer = buffers.get(runtime);
  if (!buffer) {
    buffer = { dims: new Map(), tokenDays: new Set(), seen: new Set(), seenDay: '' };
    buffers.set(runtime, buffer);
  }
  if (!buffer.timer) {
    const timer = setInterval(() => void flushUsage(runtime), USAGE_FLUSH_MS);
    timer.unref?.();
    buffer.timer = timer;
  }
  return buffer;
}

/** Fire-and-forget counter: buffered in memory; the store may not implement it and may fail — both are fine. */
export function countUsage(runtime: Runtime, dim: ApiUsageDim, calls = 1): void {
  if (!runtime.store.bumpApiUsage) return;
  const buffer = bufferOf(runtime);
  const key = [dim.day, dim.surface, dim.detail, dim.tier, dim.client, dim.via].join('\n');
  const cell = buffer.dims.get(key);
  if (cell) cell.calls += calls;
  else buffer.dims.set(key, { dim, calls });
  if (buffer.dims.size >= USAGE_MAX_KEYS) void flushUsage(runtime);
}

/** Marks a personal-token agent as active today; buffered with the same fire-and-forget contract. */
export function countTokenDay(runtime: Runtime, userId: number, now: Date = new Date()): void {
  if (!runtime.store.touchTokenDay) return;
  const buffer = bufferOf(runtime);
  const day = now.toISOString().slice(0, 10);
  if (buffer.seenDay !== day) {
    buffer.seenDay = day;
    buffer.seen.clear();
  }
  const key = `${day}\n${userId}`;
  if (buffer.seen.has(key)) return;
  buffer.seen.add(key);
  buffer.tokenDays.add(key);
}

/**
 * Writes every buffered counter to the store and clears the buffer. Called by the interval
 * timer, early when the buffer is large, and on shutdown before the store closes. Never throws.
 */
export async function flushUsage(runtime: Runtime): Promise<void> {
  const buffer = buffers.get(runtime);
  if (!buffer) return;
  const dims = [...buffer.dims.values()];
  const tokenDays = [...buffer.tokenDays];
  buffer.dims.clear();
  buffer.tokenDays.clear();
  const writes: Array<Promise<void> | undefined> = [];
  for (const { dim, calls } of dims) writes.push(Promise.resolve().then(() => runtime.store.bumpApiUsage?.(dim, calls)));
  for (const key of tokenDays) {
    const [day, id] = key.split('\n');
    writes.push(Promise.resolve().then(() => runtime.store.touchTokenDay?.(Number(id), day)));
  }
  const results = await Promise.allSettled(writes);
  const failed = results.find((r): r is PromiseRejectedResult => r.status === 'rejected');
  if (failed) {
    const error = failed.reason;
    runtime.logger.warn(`usage count failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/** Stops the flush timer (shutdown); call flushUsage first to keep the buffered counts. */
export function stopUsageFlush(runtime: Runtime): void {
  const buffer = buffers.get(runtime);
  if (buffer?.timer) {
    clearInterval(buffer.timer);
    buffer.timer = undefined;
  }
}

/** Counts a research data-file download (index/report/dataset) — public files, guest tier. */
export function countResearch(c: Context, runtime: Runtime, file: string): void {
  countUsage(runtime, usageDim({ surface: 'research', detail: file, tier: 'guest', ua: c.req.header('user-agent'), via: viaFrom(c) }));
}
