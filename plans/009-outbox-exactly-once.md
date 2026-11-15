# Plan 009: Make outbox delivery exactly-once and align the two stores

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 260a650..HEAD -- src/store/postgres.ts src/store/memory.ts src/core/store.ts src/pipeline/ingest.ts src/pipeline/outbox.ts test/pipeline.test.ts test/store.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none (plan 008 touches `updateLeadScore` in the same file — run 008 first or rebase carefully)
- **Category**: bug
- **Planned at**: commit `260a650`, 2026-11-11

## Why this matters

The transactional outbox is the delivery backbone (Telegram, webhook, hub). Three defects break its guarantees:
1. `getPendingDeliveries` runs `SELECT … FOR UPDATE SKIP LOCKED` through `pool.query` — an implicit single-statement transaction. The row lock is released the instant the query returns, so the locking is a no-op: the background outbox worker can pick up a delivery while the inline ingest path is still sending it, and two server instances are not protected at all → duplicate Telegram/webhook messages.
2. The memory and Postgres stores disagree on semantics: memory's `findRecentByTitleKey` requires a null city when no city is given, Postgres matches any city; Postgres `updateLeadStatus` overwrites `delivered_at` with NULL when called without the parameter, memory keeps it. Dev/tests (memory) verify behavior that production (Postgres) does not have.
3. Deleted leads linger in the in-memory LSH index (`SimilarIndex.remove()` exists but is never called), so dedup can merge new posts into deleted ids.

## Current state

- `src/store/postgres.ts:1677–1697` — the broken claim:

```ts
  async getPendingDeliveries(limit = 50): Promise<LeadDeliveryRecord[]> {
    const res = await this.pool.query(
      `SELECT lead_id, sink, status, attempts, next_attempt_at, last_error, created_at, updated_at
       FROM lead_deliveries
       WHERE status != 'sent' AND attempts < 5 AND next_attempt_at <= NOW()
       ORDER BY next_attempt_at ASC
       LIMIT $1
       FOR UPDATE SKIP LOCKED`,
      [limit]
    );
    return res.rows.map(/* … */);
  }
```

- `migrations/001_init.sql:61–71` — `lead_deliveries(lead_id, sink)` PK, `status TEXT DEFAULT 'pending'` (pending/sent/failed), `attempts`, `next_attempt_at`, no lease column. Latest migration is `038_paradedb_search.sql` → the new one is `039_delivery_lease.sql`.
- `src/pipeline/ingest.ts:280–306` — inline delivery right after insert: `initLeadDeliveries(lead.id, registeredSinks)` → `deps.sinks.deliver(lead, …)` → per-result `recordDelivery` + `updateLeadDelivery`. Nothing claims the rows first, so the 60s outbox loop (`src/pipeline/runner.ts:95`, `processOutbox`) can race it.
- `src/pipeline/outbox.ts:19–76` — `processOutbox`: `getPendingDeliveries(limit)` → per item `getLead` → `sinks.deliverTo` → `updateLeadDelivery('sent'|'failed', …, nextAttempt)` + `recordDelivery`. Backoff `Math.min(3600, 2^attempts * 10)` seconds.
- `src/store/memory.ts:1105–1111` — `getPendingDeliveries` filters `status !== 'sent' && attempts < 5 && nextAttemptAt <= now`, no claiming.
- `src/core/store.ts:601–604` — optional store methods: `initLeadDeliveries?`, `updateLeadDelivery?`, `getPendingDeliveries?`, `getLeadDeliveries?`. `LeadDeliveryRecord` at lines 81–90.
- Title dedup divergence:
  - `src/store/memory.ts` `findRecentByTitleKey`: `if (city && lead.city !== city) return false; if (!city && lead.city !== null && lead.city !== undefined) return false;`
  - `src/store/postgres.ts:395–396`: with city → `title_key = $1 AND city = $2`; without → `title_key = $1` only (any city).
- `delivered_at` divergence: `src/store/postgres.ts` `updateLeadStatus` (~956) sets `delivered_at = $2` unconditionally in the scoreDelta branch (NULL when the arg is absent); `src/store/memory.ts:563–575` only assigns when `deliveredAt !== undefined`.
- `src/pipeline/similar.ts:172` — `remove(id)` exists, comment says "Only the in-memory index needs this: stored bands go with the lead (ON DELETE CASCADE)". No caller anywhere (`grep -rn "\.remove(" src/` shows none for SimilarIndex).
- Deletion paths: `src/server/app.ts:2582` (`runtime.store.deleteLead`), `src/store/memory.ts:1390` `cleanupOldLeads`, `src/store/postgres.ts:2104` `cleanupOldLeads` (SQL DELETE). `src/runtime.ts:67` constructs `similar: new SimilarIndex(store)`.
- Conventions: `AGENTS.md` — tests run against memory by default; Postgres suite via `RADAR_TEST_STORE=postgres DATABASE_URL=… pnpm test`. Existing outbox test: `test/pipeline.test.ts` ~line 250–345 (ingest → failed telegram → `updateLeadDelivery` with past `nextAttemptAt` → `processOutbox` → no webhook duplicate). Store parity tests belong in `test/store.test.ts` (uses `TEST_NOW`, `makeLead`).

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Typecheck | `pnpm typecheck`         | exit 0, no errors   |
| Tests     | `pnpm test`              | all pass (baseline: 82 files, 690 tests) |
| Focused   | `pnpm test -- pipeline store` | all pass |
| Postgres (if available) | `RADAR_TEST_STORE=postgres DATABASE_URL=postgres://radar:test_password@127.0.0.1:5432/radar_test pnpm test` | all pass |

## Scope

**In scope** (the only files you should modify):
- `migrations/039_delivery_lease.sql` (create)
- `src/core/store.ts` (delivery method signatures only)
- `src/store/postgres.ts` (delivery methods, `findRecentByTitleKey` unchanged, `updateLeadStatus`)
- `src/store/memory.ts` (delivery methods, `findRecentByTitleKey`, deletion hooks)
- `src/pipeline/ingest.ts` (claim before inline delivery)
- `src/pipeline/outbox.ts` (use the claim API)
- `src/pipeline/similar.ts` (only if a hook signature needs it — prefer not)
- `src/core/events.ts` (add `emitLeadDeleted`, Step 7)
- `src/runtime.ts` (wire deletion → `similar.remove`, Step 7)
- `src/server/app.ts` (only the one emit line after `deleteLead`, Step 7)
- `test/pipeline.test.ts`, `test/store.test.ts`, `test/similar.test.ts`

**Out of scope** (do NOT touch):
- `src/pipeline/runner.ts`, `src/cli/index.ts` — shutdown drain is plan 012.
- `src/hub/*` — hub event durability is plan 012.
- Sink adapters (`src/sinks/*`) — their `deliver`/`deliverTo` contracts stay.
- The `attempts < 5` retry cap and backoff formula — keep behavior.

## Git workflow

- Branch: `advisor/009-outbox-exactly-once`
- Commits: `fix(store): lease outbox rows instead of a no-op row lock`, then `fix(store): align memory and postgres dedup and delivered_at`, then `fix(similar): drop deleted leads from the in-memory index`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add a lease column (migration 039)

Create `migrations/039_delivery_lease.sql`:

```sql
-- Outbox leases: a claimed row is invisible to other workers until the lease expires.
ALTER TABLE lead_deliveries ADD COLUMN IF NOT EXISTS leased_until TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_lead_deliveries_due
  ON lead_deliveries (next_attempt_at)
  WHERE status <> 'sent';
```

Follow the naming/style of `migrations/038_paradedb_search.sql`. The migration runner picks up new files automatically (`checkMigrations` in `src/store/postgres.ts`).

**Verify**: `pnpm typecheck` → exit 0 (SQL is not typechecked; the store tests in Postgres mode exercise it).

### Step 2: Replace the no-op lock with an atomic claim

In `src/core/store.ts`, change the optional method to a claim:

```ts
  /** Atomically claims due deliveries for `leaseMs`; claimed rows are skipped by other callers until the lease expires or the row is updated. */
  claimPendingDeliveries?(limit: number, leaseMs: number): Promise<LeadDeliveryRecord[]>;
```

Keep `getPendingDeliveries?` as a read-only peek (the admin UI may use it; grep first — if nothing calls it after Step 4, remove it from the interface and both stores).

In `src/store/postgres.ts`, implement `claimPendingDeliveries` as a single statement (atomic, no explicit transaction needed):

```sql
UPDATE lead_deliveries
SET leased_until = NOW() + ($2 || ' milliseconds')::interval
WHERE (lead_id, sink) IN (
  SELECT lead_id, sink FROM lead_deliveries
  WHERE status <> 'sent' AND attempts < 5 AND next_attempt_at <= NOW()
    AND (leased_until IS NULL OR leased_until < NOW())
  ORDER BY next_attempt_at ASC
  LIMIT $1
  FOR UPDATE SKIP LOCKED
)
RETURNING lead_id, sink, status, attempts, next_attempt_at, last_error, created_at, updated_at
```

Here the `FOR UPDATE SKIP LOCKED` is real: it runs inside the UPDATE's own transaction. Map rows exactly like the current `getPendingDeliveries`. `updateLeadDelivery` must also clear the lease: add `leased_until = NULL` to its SET list.

In `src/store/memory.ts`, implement the same semantics with a `leasedUntil?: string` field on the stored record: filter `status !== 'sent' && attempts < 5 && nextAttemptAt <= now && (!leasedUntil || leasedUntil <= now)`, set `leasedUntil = now + leaseMs` on the claimed records, return them. `updateLeadDelivery` clears `leasedUntil`.

**Verify**: `pnpm typecheck` → exit 0.

### Step 3: Claim before inline delivery in ingest

In `src/pipeline/ingest.ts` (~281), after `initLeadDeliveries`, claim the rows for this lead before sending. Simplest correct shape: call `deps.store.claimPendingDeliveries?.(registeredSinks.length, 120_000)` is WRONG (it could claim other leads' rows) — instead add a targeted store method `claimLeadDeliveries?(leadId: string, leaseMs: number): Promise<LeadDeliveryRecord[]>` (Postgres: same UPDATE … WHERE lead_id = $1 AND status <> 'sent'; memory: same filter by leadId) and use it here. Deliver only the claimed sinks; keep the existing `recordDelivery`/`updateLeadDelivery` loop. If the store lacks the method (older custom stores), fall back to today's behavior.

**Verify**: `pnpm typecheck` → exit 0; `pnpm test -- pipeline` → all pass.

### Step 4: Switch processOutbox to the claim API

In `src/pipeline/outbox.ts`, replace `getPendingDeliveries(limit)` with `claimPendingDeliveries(limit, 120_000)` (guard on method presence like today). Everything else stays. The lease (2 min) must exceed the worst per-item delivery time (sinks use `AbortSignal.timeout` ≤ 15s; 50 items × 15s worst case = 12.5 min > lease — therefore claim per item is safer: keep the batch claim but set `leaseMs = 15 * 60_000`). Document the choice in a comment.

**Verify**: `pnpm typecheck` → exit 0; `pnpm test -- pipeline` → all pass (the existing outbox test must still pass: it resets `nextAttemptAt` via `updateLeadDelivery`, which now also clears the lease).

### Step 5: Concurrency regression tests

In `test/pipeline.test.ts`, add:
1. **Double claim**: seed a lead with a failing sink (pattern from the existing outbox test), reset `nextAttemptAt` to the past, then `const a = await store.claimPendingDeliveries(50, 60_000); const b = await store.claimPendingDeliveries(50, 60_000);` → `a` has the row, `b` is empty. After `updateLeadDelivery(..., 'failed', …, pastDate)`, a new claim returns it again.
2. **Inline vs outbox**: ingest with a sink whose `deliver` blocks on a promise you control; while it is blocked, run `processOutbox` → it must process 0 items for that lead; release the sink → ingest completes; outbox then sees nothing pending. (Memory store is enough; the Postgres path is exercised by the same test under `RADAR_TEST_STORE=postgres`.)

**Verify**: `pnpm test -- pipeline` → all pass including 2 new tests.

### Step 6: Align store semantics

- `src/store/memory.ts` `findRecentByTitleKey`: when `city` is undefined, match ANY city (delete the `if (!city && lead.city !== null …)` clause) — Postgres behavior wins because ingest's employer check (`src/pipeline/ingest.ts:126–133`) already guards cross-company merges.
- `src/store/postgres.ts` `updateLeadStatus`: never overwrite `delivered_at` with NULL when the parameter is absent. In BOTH branches use `delivered_at = COALESCE($2::timestamptz, delivered_at)` (pass `null` when absent) — memory behavior wins.
- Add parity tests to `test/store.test.ts` (they run against whichever store `createTestStore()` returns): title-key match without city finds a lead WITH a city; `updateLeadStatus(id, 'failed')` after a delivered lead keeps `deliveredAt`.

**Verify**: `pnpm test -- store` → all pass including new cases.

### Step 7: Drop deleted leads from the in-memory index

The index instance lives in `src/runtime.ts:67`. Deletions happen in `app.ts:2582` and `cleanupOldLeads` (runner maintenance). Wire them without touching out-of-scope files:
- In `src/runtime.ts`, after constructing `similar`, subscribe it to a new event `lead.deleted` on `leadEvents` (`src/core/events.ts`): add `emitLeadDeleted(id)` there (mirror `emitLeadClosed`, listeners must not throw), and in runtime `leadEvents.on('lead.deleted', (id) => similar.remove(id))`.
- Emit from the two deletion sites: `src/server/app.ts:2582` after a successful delete, and — since `cleanupOldLeads` is a store method — emit inside `MemoryStore.cleanupOldLeads`/`deleteLead` is NOT allowed (stores must not import the event bus; check existing imports first). Instead: `src/pipeline/runner.ts` maintenance already receives the cleanup count; extend `cleanupOldLeads` to RETURN the deleted ids (`Promise<string[]>` would change the interface — out of scope). **Chosen approach**: keep it minimal — emit `lead.deleted` from `app.ts:2582` only, and in `MemoryStore.deleteLead`/`cleanupOldLeads` do nothing extra; the LSH prune already evicts entries older than the 7-day window, so retention-deleted ids self-heal. Document this in a comment at the emit site.

If `src/core/events.ts` or `src/runtime.ts` wiring conflicts with the drift check, STOP. In `src/server/app.ts` touch ONLY the single emit line after the successful `deleteLead` at ~2582 — nothing else in that file.

**Verify**: `pnpm typecheck` → exit 0; `pnpm test` → all pass; add a `test/similar.test.ts` case: `add(id, sketch, now)` → `remove(id)` → `findSimilar(sketch, now)` returns undefined.

## Test plan

- New: double-claim + inline-vs-outbox race (`test/pipeline.test.ts`), store parity (`test/store.test.ts`), remove-from-index (`test/similar.test.ts`).
- Structural pattern: the existing outbox test in `test/pipeline.test.ts` (~250–345).
- Verification: `pnpm test` → all pass; if Postgres is available, the full suite under `RADAR_TEST_STORE=postgres` too.

## Done criteria

- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm test` exits 0; new tests exist and pass
- [ ] `grep -n "FOR UPDATE SKIP LOCKED" src/store/postgres.ts` appears only inside the claim UPDATE (not a bare pool.query SELECT)
- [ ] `grep -rn "getPendingDeliveries" src/` shows no pipeline caller (peek-only or removed)
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

- The excerpts don't match the live code (drift) — especially if upstream already added a lease/claim mechanism.
- The Postgres claim UPDATE deadlocks or the migration runner rejects 039 (report the exact error; do not renumber existing migrations).
- A verification fails twice after a reasonable fix attempt.
- Step 7 requires importing the event bus into a store module (forbidden by the layering — stop and report).

## Maintenance notes

- Lease duration (15 min) vs sink timeouts: if a sink ever gains a longer timeout, revisit `leaseMs` in `processOutbox`.
- A crashed worker's claimed rows become visible again after the lease expires — at-least-once across crashes is inherent; sinks must stay idempotent (Telegram/webhook dedup by lead id is the sink's job, unchanged here).
- Plan 012 (shutdown drain) reduces the crash window further; plan 013 (perf) must not reintroduce per-row round-trips into the claim path.
- Reviewer: scrutinize the claim SQL under concurrent workers (two `psql` sessions claiming simultaneously must not overlap) and the `delivered_at` COALESCE in both UPDATE branches.
