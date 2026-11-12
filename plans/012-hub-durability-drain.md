# Plan 012: Make hub events durable and drain in-flight work on shutdown

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 260a650..HEAD -- src/hub/service.ts src/core/store.ts src/store/memory.ts src/store/postgres.ts src/pipeline/runner.ts src/cli/index.ts test/hub.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: plans/009-outbox-exactly-once.md (leases make the drain meaningful; run 009 first)
- **Category**: bug
- **Planned at**: commit `260a650`, 2026-11-11

## Why this matters

Two durability gaps cost participants real data:
1. **Hub commits the event before ingesting it.** `handleObservation` stores the signed event first; if `ingestRawLead` then throws (transient DB error) or loses an insert race (`duplicate:race` returns no lead), the event is already committed. Every retry of the SAME signed event hits `insertEvent → false → status 'duplicate'` and returns early — the observation, the participant's proof-of-first-observation, and their rating points are lost forever. The node→hub outbox retries exactly this way, so a single blip permanently drops data.
2. **Shutdown does not drain.** SIGTERM clears the timers and closes the store while a poll/outbox/delivery cycle is still running. A delivery recorded as `failed` mid-write, or an outbox row claimed but never updated, is left inconsistent; combined with the old no-op lock this caused re-sends on start. Plan 009's leases bound the damage, but the process should still finish what it started.

## Current state

- `src/hub/service.ts:134–194` — `handleObservation`. The critical sequence (lines 153–165):

```ts
  if (!(await storeEvent(event, deps))) return { id: event.id, status: 'duplicate' };

  const source = await ensureHubSource(deps.store);
  const raw = observationToRawLead(observation, source.id);
  const outcome = await ingestRawLead(raw, source, deps);
  const lead = outcome.lead;
  if (!lead) return { id: event.id, status: 'duplicate' };

  const merged = outcome.status === 'duplicate';
  if (outcome.status === 'rejected') return { id: event.id, status: 'rejected:not_a_lead', leadId: lead.id };
  // … addObservation({ eventId: event.id, leadId: lead.id, … isFirst: !merged … }) …
```

  `storeEvent` (122–132) is `store.insertEvent` — insert-or-false, no delete counterpart exists (`grep deleteEvent src/core/store.ts` → none).
- `src/pipeline/ingest.ts:270–271` — the race path: `const inserted = await deps.store.insertLead(lead); if (!inserted) return { status: 'duplicate', reasons: ['duplicate:race'] };` (no lead in the outcome).
- `src/store/memory.ts:1452–1455` — `addObservation` is idempotent by `eventId` (`if (this.observations.some(o => o.eventId === record.eventId)) return;`). Postgres (`src/store/postgres.ts:2155–2164`) uses `ON CONFLICT (event_id) DO NOTHING`. So re-running the observation side effects for the same event is safe.
- `src/store/memory.ts:1446–1450` — `insertEvent` returns false when the id exists; events live in `this.events` Map. Postgres `insertEvent` is an INSERT … ON CONFLICT DO NOTHING returning rowCount>0 (verify in the live file).
- `src/hub/service.ts:196–213` — `handleSignal` has the same commit-before-effect shape (`storeEvent` → `upsertSignal` → `evaluateLeadState`); `upsertSignal` is idempotent (ON CONFLICT DO UPDATE).
- `src/pipeline/runner.ts` — `PollRunner`: `start()` (54–89) sets `this.timer` (poll tick) and `this.backgroundTimer` (60s background cycle); `background()` (91–153) awaits `processOutbox`, maintenance, liveness, subscriptions, digest; fire-and-forget branches (`runLivenessIfDue`, `runUserTelegramIfDue`, `runEnrichmentIfDue`, `runDecisionsIfDue`, extraction, research build) track their own `*Running` flags. `stop()` (368–373) ONLY clears the two timers.
- `src/cli/index.ts:747–759` — serve shutdown:

```ts
      const shutdown = (): void => {
        bot.abort();
        runner?.stop();
        server.close(async () => {
          try {
            await runtime.store.close();
          } finally {
            process.exit(0);
          }
        });
      };
      process.once('SIGINT', shutdown);
      process.once('SIGTERM', shutdown);
```

- Conventions: `AGENTS.md` §2 — zero live network in tests; hub tests: `test/hub.test.ts` builds signed events with `buildObservationEvent`/`signEvent` (`src/net/protocol.ts`) and posts to `/v2/events` via `app.request`; `hub()` helper sets `RADAR_MODE: 'hub'`. Runner has NO tests today (this plan adds the first).

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Typecheck | `pnpm typecheck`         | exit 0, no errors   |
| Tests     | `pnpm test`              | all pass (baseline: 82 files, 690 tests) |
| Focused   | `pnpm test -- hub runner` | all pass |

## Scope

**In scope** (the only files you should modify/create):
- `src/hub/service.ts`
- `src/core/store.ts` (add `deleteEvent`)
- `src/store/memory.ts`, `src/store/postgres.ts` (implement `deleteEvent` ONLY)
- `src/pipeline/runner.ts` (drain support)
- `src/cli/index.ts` (serve shutdown only)
- `test/hub.test.ts`
- `test/runner.test.ts` (create)

**Out of scope** (do NOT touch):
- `src/pipeline/ingest.ts` — the race path stays; the hub compensates around it.
- `src/pipeline/outbox.ts`, delivery methods — plan 009 owns them.
- `src/hub/rating.ts` — rating recompute is plan 013.
- The `radar poll` command's shutdown (`cli/index.ts:693–707`) — it already cooperates via `stopping`; leave it.
- Event schema, signature verification, NIP-98 — verified sound.

## Git workflow

- Branch: `advisor/012-hub-durability-drain`
- Commits: `fix(hub): roll back the event commit when ingestion fails`, `fix(runner): drain in-flight cycles before closing the store`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add deleteEvent to the store interface and both stores

- `src/core/store.ts`: next to `insertEvent` (line 285) add `deleteEvent(id: string): Promise<void>;` with a comment: "Rolls back a committed event whose side effects failed; the event may be retried."
- `src/store/memory.ts`: `async deleteEvent(id) { this.events.delete(id); }`
- `src/store/postgres.ts`: `async deleteEvent(id) { await this.pool.query('DELETE FROM events WHERE id = $1', [id]); }` — observations reference `events(id) ON DELETE CASCADE` (`migrations/012_radar2_hub.sql:31`), so a partially-written observation row goes with it. Verify the FK in the live migration before relying on it.

**Verify**: `pnpm typecheck` → exit 0.

### Step 2: Roll back the event when observation side effects fail

In `handleObservation` (`src/hub/service.ts`), wrap everything AFTER `storeEvent` succeeds in try/catch:

```ts
  if (!(await storeEvent(event, deps))) return { id: event.id, status: 'duplicate' };
  try {
    // … existing body: ensureHubSource → ingestRawLead → addObservation → contacts → flags …
  } catch (error) {
    await deps.store.deleteEvent(event.id).catch(() => undefined);
    throw error; // the caller logs and the node outbox retries the same signed event
  }
```

Also handle the no-lead race path: when `outcome.lead` is undefined (the `duplicate:race` case), delete the event and return `{ id: event.id, status: 'duplicate' }` — the retry will re-ingest and find the winner lead via fingerprint. Keep the `rejected:not_a_lead` path as-is (a rejection is a final decision; the event stays committed).

Apply the same try/catch rollback to `handleSignal` (its `upsertSignal`/`evaluateLeadState` can throw after the commit). `handleStatus`/`handleProfile`: read them; if they commit-then-effect, wrap identically; if their effects are single idempotent writes, leave them and note it.

**Verify**: `pnpm typecheck` → exit 0; `pnpm test -- hub` → all pass.

### Step 3: Hub durability regression tests

In `test/hub.test.ts` (follow the existing `hub()`/`send()` helpers):
1. **Ingest failure is retryable**: build a signed observation; wrap `runtime.store.insertLead` to throw ONCE (spy that delegates afterwards); POST the event → expect a 500-class outcome or thrown error surfaced by the route (read how `/v2/events` reports errors first); POST the SAME event again → `accepted`, and `listObservationsByPubkey(pubkey, 10)` contains it. Before the fix, the second POST returned `duplicate` with no observation.
2. **Insert race is retryable**: make `insertLead` return false once (simulating a concurrent winner) while a lead with the same fingerprint already exists (ingest a twin first via the normal path); POST the event → `duplicate`; POST again → `accepted`/`duplicate` WITH the observation recorded against the winner lead.
3. **Idempotent success**: POST the same valid event twice → first `accepted`, second `duplicate`, exactly ONE observation row.

**Verify**: `pnpm test -- hub` → all pass including 3 new tests.

### Step 4: Drain support in PollRunner

In `src/pipeline/runner.ts`:
- Track the in-flight promises: `private inflight = new Set<Promise<unknown>>();` and a helper `private track<T>(p: Promise<T>): Promise<T> { this.inflight.add(p); void p.finally(() => this.inflight.delete(p)); return p; }`. Wrap the fire-and-forget branches (`checkLeadsLiveness`, `pollUserTelegram`, `runEnrichment`, `runDecisions`, extraction, the research chain) with `track(...)`. The awaited `background()` body is already awaited by its caller — track the `void this.background()` calls in `start()` too.
- Add `async drain(timeoutMs = 10_000): Promise<void>`: stop the timers (reuse `stop()`), then `await Promise.race([Promise.allSettled([...this.inflight]), sleep(timeoutMs)])`. Use a simple inline sleep promise; do NOT import a timer utility that keeps the process alive.
- Keep `stop()` synchronous and unchanged in behavior (the `radar poll` command and tests use it).

**Verify**: `pnpm typecheck` → exit 0.

### Step 5: Use the drain in serve shutdown

In `src/cli/index.ts` serve shutdown (747–756):

```ts
      const shutdown = (): void => {
        bot.abort();
        void (async () => {
          await runner?.drain(10_000);
          server.close(async () => {
            try {
              await runtime.store.close();
            } finally {
              process.exit(0);
            }
          });
        })();
      };
```

Add a hard-exit safety: `setTimeout(() => process.exit(0), 15_000).unref();` inside shutdown so a stuck sink cannot hang the process forever. Keep `process.once` handlers.

**Verify**: `pnpm typecheck` → exit 0; `pnpm test` → all pass.

### Step 6: First runner tests

Create `test/runner.test.ts` (memory store, `makeTestRuntime`, no network — inject `fetchImpl` that rejects if called):
1. **drain waits for a tracked cycle**: construct `PollRunner` with a `deliverSubscriptions` callback that blocks on a deferred promise; call the private background via `start()` with a tiny interval is timer-heavy — instead export nothing new: call `runner.start()`, immediately `const d = runner.drain(5_000)`, resolve the deferred, await `d` → resolves, and the callback completed. Use `vi.useFakeTimers()` if the interval tick interferes; keep the test deterministic.
2. **drain times out cleanly**: a callback that never resolves → `drain(50)` resolves within ~50ms (fake timers or a real short timeout), no unhandled rejection.
3. **stop() still clears timers**: after `stop()`, advancing fake timers does not start new polls.

**Verify**: `pnpm test -- runner` → all pass.

## Test plan

- New: 3 hub durability tests (`test/hub.test.ts`), 3 runner drain tests (`test/runner.test.ts`, new file — the scheduler had zero tests).
- Structural patterns: `test/hub.test.ts` helpers; `test/pipeline.test.ts` for deferred-promise sink control.
- Verification: `pnpm test` → all pass (baseline 690 + 6).

## Done criteria

- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm test` exits 0; the 6 new tests exist and pass
- [ ] `grep -n "deleteEvent" src/hub/service.ts` shows rollback in observation and signal handlers
- [ ] `grep -n "drain" src/cli/index.ts` shows the serve shutdown awaits it
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

- The excerpts don't match the live code (drift) — especially if upstream already added event rollback or a drain.
- The `events` FK cascade differs from `migrations/012_radar2_hub.sql` (verify before relying on cascade deletes).
- Wrapping fire-and-forget branches changes behavior the existing tests assert (report which test).
- A verification fails twice after a reasonable fix attempt.

## Maintenance notes

- Rollback + retry is safe because every observation side effect is idempotent by `eventId` (memory dedup, Postgres ON CONFLICT). If a future side effect is NOT idempotent, it must be made so before landing — the retry path will hit it twice.
- The 10s drain / 15s hard exit are deployment knobs; a sink with a longer timeout needs both raised together with plan 009's lease.
- Deferred: a persistent hub inbox (durable queue before commit) — the rollback approach achieves the same guarantee without a new table; revisit only if event volume makes retries expensive.
- Reviewer: check that `rejected:not_a_lead` still commits the event (final decision) and that the race-path rollback cannot delete an event whose observation ALREADY exists (it cannot: addObservation runs after the lead check).
