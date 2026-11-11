import type { Store } from './store.ts';
import type { SourceHealth } from './types.ts';

/**
 * What a source is doing, in one word. «Broken» and «empty» are different answers: a feed that
 * answers with nothing new is fine, a feed that does not answer is not, and a site that refuses
 * us (403, 429, a captcha) needs a different fix from a site that is down. One failed poll is
 * noise: foreign boards drop out for a few hours at night. A source is broken after
 * BROKEN_AFTER failed polls in a row.
 */
export type SourceState = 'ok' | 'empty' | 'unstable' | 'error' | 'blocked' | 'disabled' | 'waiting';

/** Failed polls in a row before a source counts as broken. */
export const BROKEN_AFTER = 3;

/** Minimum failed polls over the last 24h before chronic-failure auto-quarantine triggers. */
export const QUARANTINE_MIN_RUNS_24H = 12;

/** Minimum failed polls over the last 24h for permanent HTTP 404/410/DNS dead endpoints. */
export const DEAD_ENDPOINT_MIN_RUNS_24H = 6;

/** Answers that mean «the site refuses us», not «the site is down». */
const BLOCKED_ERROR = /HTTP\s+(?:401|403|429|451)\b|captcha|cloudflare|access\s+denied|forbidden|too\s+many\s+requests|FLOOD_WAIT|AUTH_KEY|SESSION_REVOKED/i;

/** Answers that mean the endpoint itself is gone or invalid (404, 410, NXDOMAIN). */
const DEAD_SOURCE_ERROR = /HTTP\s+(?:404|410)\b|ENOTFOUND|EAI_AGAIN|NXDOMAIN|ERR_INVALID_URL|no\s+longer\s+exists/i;

export function sourceState(health: Pick<SourceHealth, 'source' | 'lastRun' | 'last24h' | 'failedInRow'>): SourceState {
  if (!health.source.enabled) return 'disabled';
  if (!health.lastRun) return 'waiting';
  const failed = health.failedInRow ?? (health.lastRun.error ? 1 : 0);
  if (failed > 0) {
    if (health.lastRun.error && BLOCKED_ERROR.test(health.lastRun.error)) return 'blocked';
    return failed >= BROKEN_AFTER ? 'error' : 'unstable';
  }
  if (health.last24h.runs > 0 && health.last24h.found === 0) return 'empty';
  return 'ok';
}

/** Failed runs at the head of a newest-first list of runs, up to BROKEN_AFTER. */
export function countFailedInRow(runs: Array<{ error?: string }>): number {
  let failed = 0;
  for (const run of runs.slice(0, BROKEN_AFTER)) {
    if (!run.error) break;
    failed += 1;
  }
  return failed;
}

/**
 * Adaptive polling backoff multiplier for unstable, blocked, or broken sources.
 * Healthy sources return 1; failing sources back off (2x, 3x, 4x, 8x) so the poller
 * does not hammer dead or rate-limiting servers.
 */
export function pollBackoffFactor(health?: Pick<SourceHealth, 'failedInRow' | 'lastRun' | 'last24h'>): number {
  if (!health) return 1;
  const failed = health.failedInRow ?? (health.lastRun?.error ? 1 : 0);
  if (failed <= 0) return 1;
  if (failed === 1) return 2;
  if (failed === 2) return 3;
  if (health.last24h.runs >= DEAD_ENDPOINT_MIN_RUNS_24H && health.last24h.errors === health.last24h.runs) {
    return 8;
  }
  return 4;
}

/**
 * Decides whether a source should be automatically disabled (quarantined) because it has been
 * continuously failing with 0 leads found over the last 24h.
 */
export function shouldQuarantineSource(
  health: Pick<SourceHealth, 'source' | 'failedInRow' | 'lastRun' | 'last24h'>,
): { quarantine: boolean; reason?: string } {
  if (!health.source.enabled) return { quarantine: false };
  if (health.source.config?.hygieneExempt === true) return { quarantine: false };
  const failed = health.failedInRow ?? (health.lastRun?.error ? 1 : 0);
  if (failed < BROKEN_AFTER) return { quarantine: false };

  const err = health.lastRun?.error ?? '';
  const allFailed24h = health.last24h.runs > 0 && health.last24h.errors === health.last24h.runs && health.last24h.found === 0;

  if (allFailed24h && DEAD_SOURCE_ERROR.test(err) && health.last24h.runs >= DEAD_ENDPOINT_MIN_RUNS_24H) {
    return { quarantine: true, reason: `dead_endpoint: ${err.slice(0, 120)}` };
  }
  if (allFailed24h && health.last24h.runs >= QUARANTINE_MIN_RUNS_24H) {
    return { quarantine: true, reason: `chronic_failure_24h (${health.last24h.errors}/${health.last24h.runs} failed): ${err.slice(0, 120)}` };
  }
  return { quarantine: false };
}

export interface SourceHygieneSummary {
  checked: number;
  backedOff: Array<{ sourceId: string; title: string; factor: number; state: SourceState }>;
  autoDisabled: Array<{ sourceId: string; title: string; reason: string }>;
}

/**
 * Evaluates all sources' health and automatically disables chronically dead sources
 * while reporting sources currently under adaptive backoff.
 */
export async function runSourceHygiene(store: Store, now = new Date()): Promise<SourceHygieneSummary> {
  const healthList = await store.getSourceHealth();
  const backedOff: SourceHygieneSummary['backedOff'] = [];
  const autoDisabled: SourceHygieneSummary['autoDisabled'] = [];

  for (const h of healthList) {
    if (!h.source.enabled) continue;
    const q = shouldQuarantineSource(h);
    if (q.quarantine && q.reason) {
      await store.updateSource(h.source.id, {
        enabled: false,
        config: {
          ...h.source.config,
          autoDisabledAt: now.toISOString(),
          autoDisableReason: q.reason,
        },
      });
      autoDisabled.push({ sourceId: h.source.id, title: h.source.title, reason: q.reason });
      continue;
    }
    const factor = pollBackoffFactor(h);
    if (factor > 1) {
      backedOff.push({
        sourceId: h.source.id,
        title: h.source.title,
        factor,
        state: sourceState(h),
      });
    }
  }

  return {
    checked: healthList.length,
    backedOff,
    autoDisabled,
  };
}
