import type { Context } from 'hono';
import type { Runtime } from '../runtime.ts';
import type { Viewer } from '../core/types.ts';
import type { ApiUsageDim } from '../core/store.ts';

/**
 * Agent analytics (план A, 2026-11-19): aggregated call counters over the API, MCP and
 * research surfaces. One upsert per dimension cell per day — never a per-call row, never
 * an IP, never a raw User-Agent. Counting is fire-and-forget: an analytics failure must
 * never break or slow the response it counts.
 */

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
    detail: input.detail,
    tier: input.tier,
    client: classifyUa(input.ua),
    via: input.via ?? '',
  };
}

/** Fire-and-forget counter: the store may not implement it and may fail — both are fine. */
export function countUsage(runtime: Runtime, dim: ApiUsageDim, calls = 1): void {
  runtime.store.bumpApiUsage?.(dim, calls).catch((error) => {
    runtime.logger.warn(`usage count failed: ${error instanceof Error ? error.message : String(error)}`);
  });
}

/** Marks a personal-token agent as active today; same fire-and-forget contract. */
export function countTokenDay(runtime: Runtime, userId: number): void {
  runtime.store.touchTokenDay?.(userId).catch(() => {});
}

/** Counts a research data-file download (index/report/dataset) — public files, guest tier. */
export function countResearch(c: Context, runtime: Runtime, file: string): void {
  countUsage(runtime, usageDim({ surface: 'research', detail: file, tier: 'guest', ua: c.req.header('user-agent'), via: viaFrom(c) }));
}
