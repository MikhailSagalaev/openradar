import { sha256 } from '../core/fingerprint.ts';

/**
 * MCP write safety-ladder (plan 021C, Dreamwork / OpenPostings ideas — clean-room): a
 * consequential write tool (submit_lead, vote_lead, save_search) is dry-run by default. The
 * first call returns `held` with a summary and a confirmation token; the action executes only
 * on a repeat call carrying that token AND identical arguments. A replayed confirmation
 * returns the original receipt instead of acting twice (dedup by URL / lead / filters).
 *
 * Read tools are untouched. The web UI and the browser extension use the REST routes, not the
 * MCP dispatcher, so their write path is unchanged — this ladder guards the agent surface only.
 */

/** Tools that change state and therefore require explicit confirmation. */
export const WRITE_TOOLS = new Set(['submit_lead', 'vote_lead', 'save_search']);

/** How long a held action stays confirmable. Default 5 minutes. */
export const CONFIRM_WINDOW_MS = 5 * 60_000;
/** Hard cap on remembered receipts; the oldest are evicted first. */
const MAX_RECEIPTS = 5000;

export interface HeldAction {
  status: 'held';
  tool: string;
  /** A short, human-readable description of what will happen. */
  summary: string;
  confirmationToken: string;
  /** Seconds until the token expires. */
  expiresIn: number;
  instructions: string;
}

export interface ExecutedReceipt<T = unknown> {
  status: 'executed';
  tool: string;
  /** True when this is a replay of an earlier confirmation, not a fresh action. */
  replayed: boolean;
  result: T;
  /** Attribution: the agent acted on the user's behalf (OpenPostings idea). */
  actedOnBehalfOfUser: true;
}

export type LadderOutcome<T = unknown> = HeldAction | ExecutedReceipt<T>;

interface Pending {
  tool: string;
  /** Hash of the payload bound to the caller identity (see boundHash). */
  argsHash: string;
  expiresAt: number;
}

interface Receipt {
  tool: string;
  /** The exact payload this token confirmed; a changed payload must re-arm a hold, not replay. */
  argsHash: string;
  result: unknown;
  at: number;
}

interface InFlight {
  tool: string;
  argsHash: string;
  promise: Promise<unknown>;
}

/** Hard cap on outstanding held actions; the oldest are evicted first. */
const MAX_PENDING = 5000;

/** Stable hash of the action's arguments (key order independent). */
export function argsHash(tool: string, args: Record<string, unknown>): string {
  const clean: Record<string, unknown> = {};
  for (const key of Object.keys(args).sort()) {
    if (key === 'confirm' || key === 'confirmation_token') continue; // confirmation meta, not the action
    clean[key] = args[key];
  }
  return sha256(`${tool}\n${JSON.stringify(clean)}`);
}

/**
 * The payload hash bound to the caller: a token held for one caller (agent user, web viewer,
 * the local stdio operator) cannot be confirmed by another, even with identical arguments.
 */
export function boundHash(tool: string, args: Record<string, unknown>, identity = ''): string {
  return sha256(`${identity}\n${argsHash(tool, args)}`);
}

/** A one-line summary of the pending action for the confirmation prompt. */
export function summarizeAction(tool: string, args: Record<string, unknown>): string {
  if (tool === 'submit_lead') {
    const title = typeof args.title === 'string' ? args.title : '(no title)';
    const type = args.type === 'job' ? 'vacancy' : 'order';
    const url = typeof args.url === 'string' && args.url ? ` (${args.url})` : '';
    return `Submit a new ${type}: «${title}»${url}`;
  }
  if (tool === 'vote_lead') {
    return `Vote «${String(args.verdict)}» on lead ${String(args.id)}`;
  }
  if (tool === 'save_search') {
    const parts = [args.query, args.skill, args.type, args.remote === true ? 'remote' : undefined, args.market]
      .filter((p) => typeof p === 'string' && p).join(', ');
    return `Subscribe the user to a saved search${parts ? `: ${parts}` : ''} (Telegram/webhook delivery)`;
  }
  return `Run ${tool}`;
}

/**
 * The confirmation ladder. In-process and bounded: the durable effect lives in the store
 * (a submitted lead, a recorded vote, a saved search); this guards the agent's two-step
 * consent and dedups a replayed confirmation within the window.
 */
export class ConfirmationLadder {
  private readonly pending = new Map<string, Pending>();
  private readonly inFlight = new Map<string, InFlight>();
  private readonly receipts = new Map<string, Receipt>();
  private readonly windowMs: number;
  private readonly now: () => number;

  constructor(options: { windowMs?: number; now?: () => number } = {}) {
    this.windowMs = options.windowMs ?? CONFIRM_WINDOW_MS;
    this.now = options.now ?? Date.now;
  }

  /**
   * Runs a write call through the ladder. Without a valid token + identical args (from the
   * same caller identity) it returns a `held` action and `execute` is not called. With them
   * the pending entry is consumed synchronously, before any await, so concurrent duplicate
   * confirmations cannot both execute: they share the one in-flight execution and get its
   * receipt as a replay. If `execute` throws, the hold is re-armed so the user can retry.
   */
  async run(tool: string, args: Record<string, unknown>, execute: () => Promise<unknown>, identity = ''): Promise<LadderOutcome> {
    const hash = boundHash(tool, args, identity);
    const token = typeof args.confirmation_token === 'string' ? args.confirmation_token : '';
    const confirmed = args.confirm === true && token.length > 0;
    if (!confirmed) return this.hold(tool, hash, args);

    const receipt = this.receipts.get(token);
    // A receipt only replays for the identical tool AND payload AND caller; altered args re-arm a hold.
    if (receipt && receipt.tool === tool && receipt.argsHash === hash && this.now() - receipt.at <= this.windowMs) {
      return replayOf(tool, receipt.result);
    }
    const running = this.inFlight.get(token);
    if (running && running.tool === tool && running.argsHash === hash) {
      return replayOf(tool, await running.promise);
    }
    const pending = this.pending.get(token);
    if (!pending || pending.tool !== tool || pending.argsHash !== hash || pending.expiresAt <= this.now()) {
      // A token without a matching held action (expired, foreign, or altered args) is refused.
      return this.hold(tool, hash, args, 'The confirmation token is invalid, expired, or the arguments changed. Review and confirm again.');
    }
    // Consume synchronously: from here on a duplicate sees the in-flight entry, not the hold.
    this.pending.delete(token);
    const promise = Promise.resolve().then(execute);
    this.inFlight.set(token, { tool, argsHash: hash, promise });
    try {
      const result = await promise;
      this.receipts.set(token, { tool, argsHash: hash, result, at: this.now() });
      this.evict();
      return { status: 'executed', tool, replayed: false, result, actedOnBehalfOfUser: true };
    } catch (error) {
      // Re-arm: the action failed, so the same token stays confirmable until it expires.
      this.pending.set(token, pending);
      throw error;
    } finally {
      this.inFlight.delete(token);
    }
  }

  /** Outstanding held actions (bounded; for tests and introspection). */
  get pendingCount(): number {
    return this.pending.size;
  }

  private hold(tool: string, hash: string, args: Record<string, unknown>, note?: string): HeldAction {
    const token = sha256(`${tool}\n${hash}\n${this.now()}\n${Math.random()}`);
    this.pending.set(token, { tool, argsHash: hash, expiresAt: this.now() + this.windowMs });
    this.evict();
    return {
      status: 'held',
      tool,
      summary: summarizeAction(tool, args),
      confirmationToken: token,
      expiresIn: Math.round(this.windowMs / 1000),
      instructions:
        (note ? note + ' ' : '') +
        'Nothing was done yet. Show the summary to the user and, only if they approve, call the same tool again with the identical arguments plus confirm:true and confirmation_token:"' + token + '".',
    };
  }

  private evict(): void {
    const now = this.now();
    const cutoff = now - this.windowMs;
    for (const [k, v] of this.pending) if (v.expiresAt <= now) this.pending.delete(k);
    for (const [k, v] of this.receipts) if (v.at < cutoff) this.receipts.delete(k);
    trimOldest(this.pending, MAX_PENDING);
    trimOldest(this.receipts, MAX_RECEIPTS);
  }
}

function replayOf(tool: string, result: unknown): ExecutedReceipt {
  return { status: 'executed', tool, replayed: true, result, actedOnBehalfOfUser: true };
}

/** Maps iterate in insertion order, so the first keys are the oldest. */
function trimOldest(map: Map<string, unknown>, max: number): void {
  while (map.size > max) {
    const oldest = map.keys().next().value;
    if (oldest === undefined) break;
    map.delete(oldest);
  }
}
