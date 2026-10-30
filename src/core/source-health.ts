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

/** Answers that mean «the site refuses us», not «the site is down». */
const BLOCKED_ERROR = /HTTP\s+(?:401|403|429|451)\b|captcha|cloudflare|access\s+denied|forbidden|too\s+many\s+requests|FLOOD_WAIT|AUTH_KEY|SESSION_REVOKED/i;

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
