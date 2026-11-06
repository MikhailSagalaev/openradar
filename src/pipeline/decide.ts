import { DECISION_QUESTIONS, parseDecision, type ModelDecision } from '../core/decisions.ts';
import type { Store } from '../core/store.ts';
import type { Env, Logger } from '../core/types.ts';
import { scrubContacts } from '../server/collector.ts';

/**
 * Asks the decision model about new posts in the background. It only stores answers: the feed
 * does not read them. Contacts are cut before a post leaves the node, and posts of private
 * channels never leave it.
 */

/** Enough to tell what a post is, and it keeps the bill small. */
const MAX_TEXT = 2500;
const PARALLEL = 4;

function decideKey(env: Env): string | undefined {
  return env.RADAR_DECIDE_KEY ?? env.SUBQ_API_KEY;
}

export function decisionsEnabled(env: Env): boolean {
  return Boolean(env.RADAR_DECIDE_ENABLED && decideKey(env));
}

export interface DecideDeps {
  store: Store;
  env: Env;
  logger: Logger;
  fetchImpl: typeof fetch;
  now?: () => Date;
}

export interface DecideSummary {
  asked: number;
  saved: number;
  failed: number;
  tokens: number;
  /** The service said to stop: no credits, a bad key or too many requests. */
  stopped?: number;
}

const STOP = new Set([401, 402, 403, 429]);

async function askOne(lead: { id: string; title: string; text: string }, deps: DecideDeps): Promise<ModelDecision | number | undefined> {
  const { env } = deps;
  const state = scrubContacts(`${lead.title}\n\n${lead.text.slice(0, MAX_TEXT)}`);
  const response = await deps.fetchImpl(env.RADAR_DECIDE_URL!, {
    method: 'POST',
    headers: { authorization: `Bearer ${decideKey(env)}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model: env.RADAR_DECIDE_MODEL, state, questions: DECISION_QUESTIONS }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) return response.status;
  const decidedAt = (deps.now?.() ?? new Date()).toISOString();
  return parseDecision(await response.json(), lead.id, env.RADAR_DECIDE_MODEL!, decidedAt);
}

export async function runDecisions(deps: DecideDeps, limit: number): Promise<DecideSummary> {
  const summary: DecideSummary = { asked: 0, saved: 0, failed: 0, tokens: 0 };
  if (!decisionsEnabled(deps.env) || !deps.store.listLeadsToDecide || !deps.store.saveModelDecision) return summary;
  const leads = await deps.store.listLeadsToDecide(limit);
  let next = 0;
  await Promise.all(Array.from({ length: PARALLEL }, async () => {
    while (next < leads.length && summary.stopped === undefined) {
      const lead = leads[next++]!;
      summary.asked++;
      try {
        const answer = await askOne(lead, deps);
        if (typeof answer === 'number') {
          summary.failed++;
          if (STOP.has(answer)) summary.stopped = answer;
          else deps.logger.warn('decision refused', { status: answer });
        } else if (answer) {
          await deps.store.saveModelDecision!(answer);
          summary.saved++;
          summary.tokens += answer.tokens;
        } else {
          summary.failed++;
        }
      } catch (error) {
        summary.failed++;
        deps.logger.warn('decision failed', { error: error instanceof Error ? error.message : String(error) });
      }
    }
  }));
  return summary;
}
