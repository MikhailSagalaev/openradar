import { DECISION_QUESTIONS, decisionAction, parseDecision, scoreShift, type ModelDecision } from '../core/decisions.ts';
import { ReplayCache, idempotencyKey } from '../core/replay.ts';
import type { Store } from '../core/store.ts';
import type { Env, Logger } from '../core/types.ts';
import { scrubContacts } from '../server/collector.ts';

/**
 * Asks the decision model about new posts in the background. Contacts are cut before a post
 * leaves the node, and posts of private channels never leave it. With RADAR_DECIDE_APPLY sure
 * answers act on the feed, and every step can be taken back on /admin/decisions.
 */

/** Enough to tell what a post is, and it keeps the bill small. */
const MAX_TEXT = 2500;
const PARALLEL = 4;
/** An answer takes under a second. A silent connection stays silent, so a new one is quicker. */
const REQUEST_MS = 10_000;
const ATTEMPTS = 3;

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
  /** Idempotency cache for the paid call (plan 021E); the runner shares one across rounds. */
  replay?: ReplayCache<ModelDecision | number | undefined>;
}

export interface DecideSummary {
  asked: number;
  saved: number;
  failed: number;
  tokens: number;
  /** Replays served from the idempotency cache instead of paying the model again (plan 021E). */
  replayed: number;
  /** The service said to stop: no credits, a bad key or too many requests. */
  stopped?: number;
}

const STOP = new Set([401, 402, 403, 429]);

/**
 * Idempotency for the paid model call (plan 021E): keyed by model + the scrubbed payload, so
 * a retry or an overlapping round replays the cached answer instead of double-charging. The
 * durable answer lives in the store; this guards the in-flight window before it is saved.
 * The runner shares one cache across rounds; a caller without one gets a fresh cache.
 */
export function newDecisionReplay(): ReplayCache<ModelDecision | number | undefined> {
  return new ReplayCache<ModelDecision | number | undefined>({ windowMs: 10 * 60_000, maxEntries: 5000 });
}

async function askOne(lead: { id: string; title: string; text: string }, deps: DecideDeps): Promise<ModelDecision | number | undefined> {
  const { env } = deps;
  const state = scrubContacts(`${lead.title}\n\n${lead.text.slice(0, MAX_TEXT)}`);
  const response = await deps.fetchImpl(env.RADAR_DECIDE_URL!, {
    method: 'POST',
    headers: { authorization: `Bearer ${decideKey(env)}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model: env.RADAR_DECIDE_MODEL, state, questions: DECISION_QUESTIONS }),
    signal: AbortSignal.timeout(REQUEST_MS),
  });
  if (!response.ok) return response.status;
  const decidedAt = (deps.now?.() ?? new Date()).toISOString();
  return parseDecision(await response.json(), lead.id, env.RADAR_DECIDE_MODEL!, decidedAt);
}

async function withRetry<T>(ask: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await ask();
    } catch (error) {
      if (attempt >= ATTEMPTS) throw error;
    }
  }
}

/** Acts on stored answers. Each post once: an answer a person overruled stays overruled. */
export async function applyDecisions(deps: DecideDeps, limit: number): Promise<{ hidden: number; closed: number; moved: number; directed: number }> {
  const summary = { hidden: 0, closed: 0, moved: 0, directed: 0 };
  const { store, env } = deps;
  if (!env.RADAR_DECIDE_APPLY || !store.listDecisionsToApply || !store.markDecisionApplied) return summary;
  for (const { decision, score } of await store.listDecisionsToApply(limit)) {
    const action = decisionAction(decision);
    const shift = scoreShift(decision);
    if (action) {
      await store.setLeadDecision(decision.leadId, { state: action, decidedBy: 'model', reason: `model ${decision.model}: scam ${decision.scam.toFixed(2)}, closed ${decision.closed.toFixed(2)}, ${decision.kind}` });
      await store.updateLeadState!(decision.leadId, action);
      if (action === 'closed') summary.closed++;
      else summary.hidden++;
    }
    if (shift) {
      await store.updateLeadScore?.(decision.leadId, Math.max(0, Math.min(100, score + shift)));
      summary.moved++;
    }
    // A sure non-other direction fills an empty one or replaces "other" from the rules.
    if (
      decision.direction
      && decision.direction !== 'other'
      && (decision.directionConfidence ?? 0) >= 0.8
      && store.applyLeadDirection
    ) {
      await store.applyLeadDirection(decision.leadId, decision.direction);
      summary.directed++;
    }
    // Only fill workplace when rules left it empty: SubQ remote is noul, not hybrid-aware.
    if (decision.remote !== undefined && store.applyLeadWorkplace) {
      let wp: 'remote' | 'hybrid' | 'onsite' | undefined;
      if (typeof decision.remote === 'string') {
        const val = decision.remote.toLowerCase();
        wp = val === 'office' || val === 'onsite'
          ? 'onsite'
          : val === 'hybrid'
          ? 'hybrid'
          : 'remote';
      } else if (typeof decision.remote === 'number') {
        if (decision.remote >= 0.8) wp = 'remote';
        else if (decision.remote <= 0.2) wp = 'onsite';
      }
      if (wp) {
        await store.applyLeadWorkplace(decision.leadId, wp, wp === 'remote');
      }
    }
    await store.markDecisionApplied(decision.leadId, action ?? 'scored');
  }
  return summary;
}

export async function runDecisions(deps: DecideDeps, limit: number): Promise<DecideSummary> {
  const summary: DecideSummary = { asked: 0, saved: 0, failed: 0, tokens: 0, replayed: 0 };
  if (!decisionsEnabled(deps.env) || !deps.store.listLeadsToDecide || !deps.store.saveModelDecision) return summary;
  const leads = await deps.store.listLeadsToDecide(limit);
  const replay = deps.replay ?? newDecisionReplay();
  let next = 0;
  await Promise.all(Array.from({ length: PARALLEL }, async () => {
    while (next < leads.length && summary.stopped === undefined) {
      const lead = leads[next++]!;
      summary.asked++;
      try {
        // The paid call is idempotent: same model + scrubbed payload replays, never re-bills.
        const payload = scrubContacts(`${lead.title}\n\n${lead.text.slice(0, MAX_TEXT)}`);
        const key = idempotencyKey(deps.env.RADAR_DECIDE_MODEL ?? 'model', payload);
        const { value: answer, replayed } = await replay.run(key, () => withRetry(() => askOne(lead, deps)));
        if (replayed) summary.replayed++;
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
