# Plan 013: Remove the hot-path performance bottlenecks (MinHash BigInt, rating N+1, ingest chain, SSE polling, feed sort)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 260a650..HEAD -- src/core/fingerprint.ts src/hub/rating.ts src/pipeline/ingest.ts src/server/v2.ts src/store/postgres.ts src/core/store.ts test/fingerprint.test.ts test/rating.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: L
- **Risk**: MED
- **Depends on**: plans/008-small-correctness-fixes.md (SimilarIndex loader), plans/012-hub-durability-drain.md (runner tests exist first)
- **Category**: perf
- **Planned at**: commit `260a650`, 2026-11-11

## Why this matters

Five measured bottlenecks on the path to the v1.0 goal (100k leads / 30 days):
1. **MinHash on BigInt** — the hottest per-post computation (runs for every polled post BEFORE dedup): 4 BigInt allocations + a modulo per word × 64 seeds. 32-bit `Math.imul` arithmetic is bit-for-bit equivalent modulo the 32-bit prime and orders of magnitude faster.
2. **Hourly rating recompute is per-lead N+1** — already `Promise.all` of 3 queries per lead, but still 3 round-trips × every lead with observations in the 30-day window, plus a full ledger rewrite and a rating reset. At 100k leads this is hundreds of thousands of queries per hour.
3. **Ingest runs 4–6 sequential SELECTs per raw post**, strictly serial within a source; a 2000-post page ≈ 10k round-trips.
4. **Every SSE stream polls the DB itself every 15s** (up to 500 streams) even when nothing changed; the event bus is process-local, so a worker cluster multiplies the polling.
5. **Feed sort by score/budget uses expressions** (`score − decay·age`, `COALESCE(usd)`) that no index covers → full scan+sort of active leads on every homepage request.

Each step is independently shippable and independently verifiable. Do them in order; stop after any step if its verification fails twice.

## Current state

- `src/core/fingerprint.ts:83–96` — the BigInt loop:

```ts
  const P32 = 4294967291; // Largest 32-bit prime
  for (const shingle of shingles) {
    const rawH = fnv1a32(shingle);
    for (let i = 0; i < MINHASH_K; i++) {
      const a = MINHASH_A[i] ?? 1;
      const b = MINHASH_B[i] ?? 0;
      // (a * rawH + b) % P32, mapped to 16-bit
      const combined = (Number((BigInt(a) * BigInt(rawH) + BigInt(b)) % BigInt(P32))) & 0xffff;
      if (combined < (minHashes[i] ?? 0xffff)) {
        minHashes[i] = combined;
      }
    }
  }
```

  `MINHASH_A/B` are 32-bit unsigned ints from an LCG (lines 31–45); `fnv1a32` returns `>>> 0`. `a * rawH` can reach ~2^64 — beyond `Number.MAX_SAFE_INTEGER`, so a naive `Math.imul` replacement is NOT equivalent. The correct fast path: split into 16-bit halves and reduce modulo P32 with 32-bit ops (see Step 1), OR keep BigInt but hoist `BigInt(a)`, `BigInt(b)`, `BigInt(P32)` out of the loop (cheap partial win). The sketch format (64×16-bit base64url) and `estimateJaccardFromSketches` MUST stay byte-compatible — existing stored sketches and the `mh` NIP tag depend on it.
- `src/hub/rating.ts:284–335` — `recomputeRatings`: groups `listObservationsSince(since)` by lead, then per lead `Promise.all([getLead, listObservations, listSignals])`, `evaluateLeadState`, `ledgerForLead`; finally `replaceLedger(leadIds, entries)` (DELETE + unnest INSERT in one tx) and `setParticipantRatings` (UPDATE all to 0 + unnest UPDATE). `WeightResolver` (67–113) caches per-run weights.
- `src/pipeline/ingest.ts:110–148` — the dedup chain: `findLeadByFingerprint` → `findLeadByCanonicalUrl` → `findRecentByTitleKey` (+ `listRecentByTitleKey` batch inside `findSameVacancy`) → `findCrossPost` (`findRecentByContacts`) → `similar.findSimilar`. All awaited serially; `ingestMany` (356) loops raws serially.
- `src/server/v2.ts:140–185` — SSE: per-stream `while` loop calls `getLeadsForFeed({ limit: 200, after, createdBefore })`, writes events, then sleeps `min(STREAM_POLL_MS=15s, STREAM_HEARTBEAT_MS=25s)`; `leadEvents.on('lead.created')` wakes the sleep early ONLY for zero-delay viewers. Constants at the top: `STREAM_POLL_MS`, `STREAM_HEARTBEAT_MS`, `MAX_STREAMS=500`, `let openStreams`.
- `src/store/postgres.ts:1210–1213` — sort clauses:

```ts
      : options.sort === 'score'
        ? `score - EXTRACT(EPOCH FROM (now() - created_at)) / 3600 * ${SCORE_DECAY_PER_HOUR} DESC, created_at DESC, id DESC`
        : options.sort === 'budget'
          ? 'COALESCE(normalized_usd_max, normalized_usd_min) DESC NULLS LAST, created_at DESC, id DESC'
```

  `SCORE_DECAY_PER_HOUR = 1/6` (`src/core/store.ts:44`). Existing indexes: `idx_leads_community_score (score DESC, created_at DESC)` (002), `idx_leads_salary_usd` (004). Latest migration: 038 (plan 009 adds 039 — coordinate numbering; if 009 landed, this plan's migration is 040).
- Conventions: `AGENTS.md` — zero live network in tests; `pnpm typecheck` covers test/. Patterns: `test/fingerprint.test.ts` (sketch properties), `test/rating.test.ts` (recompute summaries), `test/pipeline.test.ts` (ingest with fake sinks).

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Typecheck | `pnpm typecheck`         | exit 0, no errors   |
| Tests     | `pnpm test`              | all pass (baseline: 82 files, 690 tests + earlier plans' additions) |
| Focused   | `pnpm test -- fingerprint rating pipeline` | all pass |
| Postgres (if available) | `RADAR_TEST_STORE=postgres DATABASE_URL=… pnpm test` | all pass |

## Scope

**In scope** (the only files you should modify/create):
- `src/core/fingerprint.ts`
- `src/hub/rating.ts`
- `src/core/store.ts` (batch method signatures for Steps 2–3)
- `src/store/postgres.ts`, `src/store/memory.ts` (implement the batch methods; sort index usage)
- `src/pipeline/ingest.ts` (batch prefetch only)
- `src/server/v2.ts` (shared SSE wake)
- `migrations/040_feed_sort_indexes.sql` (create; renumber if 039 is taken — check `ls migrations/`)
- `test/fingerprint.test.ts`, `test/rating.test.ts`, `test/pipeline.test.ts`, `test/store.test.ts`

**Out of scope** (do NOT touch):
- `src/pipeline/runner.ts` — plan 012 owns it; the rating recompute cadence stays hourly.
- Sketch format, `estimateJaccardFromSketches`, band computation — byte compatibility is a hard constraint.
- `src/hub/service.ts` — plan 012 owns it.
- The SSE wire protocol (event names, cursor encoding) — clients depend on it.
- ParadeDB/pg_search configuration (038) — search ranking already uses it; this plan only touches score/budget sort.

## Git workflow

- Branch: `advisor/013-hot-path-perf`
- One commit per step: `perf(fingerprint): hoist BigInt constants out of the MinHash loop`, `perf(hub): batch the rating recompute reads`, `perf(ingest): prefetch dedup candidates in batches`, `perf(sse): share one feed poll across streams`, `perf(store): index-backed feed sort`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: MinHash — hoist BigInt constants (safe partial win)

The full `Math.imul` rewrite requires a proven modulo-P32 reduction for 64-bit products; do NOT attempt it without a property test against the BigInt oracle. The safe, verified win: hoist the per-seed BigInt conversions out of the shingle loop:

```ts
  const bigA = MINHASH_A.map((a) => BigInt(a ?? 1));
  const bigB = MINHASH_B.map((b) => BigInt(b ?? 0));
  const bigP = BigInt(P32);
  for (const shingle of shingles) {
    const rawH = BigInt(fnv1a32(shingle));
    for (let i = 0; i < MINHASH_K; i++) {
      const combined = Number((bigA[i]! * rawH + bigB[i]!) % bigP) & 0xffff;
      if (combined < (minHashes[i] ?? 0xffff)) minHashes[i] = combined;
    }
  }
```

This removes 3 of 4 BigInt allocations per word×seed and the repeated `BigInt(P32)`. Add a property test to `test/fingerprint.test.ts`: for 200 random-ish texts (deterministic seed), the new implementation's sketch equals a reference BigInt implementation inlined in the test (copy the OLD loop into the test as the oracle). Also assert sketch length/format unchanged and `estimateJaccardFromSketches(s, s) === 1`.

Optional stretch (ONLY if the property test harness is in place): implement the 16-bit-split reduction and prove equality against the oracle on 10k inputs; if any mismatch, revert to the hoisted version and note it.

**Verify**: `pnpm test -- fingerprint` → all pass including the oracle test; `pnpm typecheck` → exit 0.

### Step 2: Batch the rating recompute reads

Add optional batch methods to `src/core/store.ts` (next to the existing per-lead ones):

```ts
  getLeadsByIds?(ids: string[]): Promise<Lead[]>;
  listObservationsForLeads?(leadIds: string[]): Promise<ObservationRecord[]>;
  listSignalsForLeads?(leadIds: string[]): Promise<SignalRecord[]>;
```

Implement in Postgres (`WHERE id = ANY($1::text[])`, `WHERE lead_id = ANY($1::text[])`) and memory (filter maps). In `recomputeRatings`, when all three exist: fetch the lead ids from `byLead`, call the three batch methods ONCE, group results by leadId in Maps, then run the existing per-lead logic against the Maps (no per-lead store reads). Keep the per-lead fallback when the methods are absent. `evaluateLeadState` still calls `getLeadDecision`/`getContactFlags` per lead — batch those too ONLY if trivial (`getLeadDecisions?(ids)`); otherwise leave and note the remaining N+1 in Maintenance notes. Do NOT change `replaceLedger`/`setParticipantRatings` semantics.

Add a test to `test/rating.test.ts`: seed N leads with observations/signals (existing helpers), run `recomputeRatings`, assert the summary equals the pre-change behavior (same leads/entries/participants) AND count store calls via a spy wrapper to prove the batch path issues O(1) reads for the three methods.

**Verify**: `pnpm test -- rating` → all pass; `pnpm typecheck` → exit 0.

### Step 3: Prefetch ingest dedup candidates in batches

In `ingestMany` (`src/pipeline/ingest.ts:356`), before the serial loop, prefetch for the whole page when the store supports it: fingerprints (`findLeadsByFingerprints?(fps: string[])`), canonical URLs (`findLeadsByCanonicalUrls?(urls: string[])`). Add these optional methods to the interface + both stores. Pass the prefetched maps into `ingestRawLead` via an optional `prefetch` parameter on `IngestDeps` (or a new optional arg) so the single-post path is unchanged. The title/contact/similar stages stay per-post (they need windowed scans); document that. Keep the serial loop (ordering matters for dedup within a page).

Test in `test/pipeline.test.ts`: ingest a page of 50 raws where 25 are duplicates of the other 25; assert identical outcomes to the unbatched path and that the batch methods were called once each (spy).

**Verify**: `pnpm test -- pipeline` → all pass; `pnpm typecheck` → exit 0.

### Step 4: Share one feed poll across SSE streams

In `src/server/v2.ts`, replace per-stream polling with a shared poller: one module-level loop (started lazily when `openStreams` goes 0→1, stopped when it returns to 0) that calls `getLeadsForFeed` once per `STREAM_POLL_MS` and broadcasts new leads to registered streams via the existing `leadEvents` bus or a local subscriber set. Each stream keeps its own cursor (`after`) and tier `createdBefore` — the shared poll fetches the UNION window (no `createdBefore`, max limit) and each stream filters/projects per viewer exactly as today. Heartbeats stay per-stream. The wire protocol (event `lead`, cursor ids) must not change. Keep `MAX_STREAMS` and the 503 behavior.

This is the riskiest step: write the test FIRST (characterization): open two streams with different tiers via `app.request('/v2/stream?cursor=…')` (read how existing tests consume SSE — `test/server.test.ts` or `test/access.test.ts` may have a pattern; if none, use `app.request` and read the streamed body with a reader), ingest a lead, assert both receive it with their respective projections/delays. Then refactor and keep the test green.

**Verify**: `pnpm test` → all pass; manual smoke optional (not required).

### Step 5: Index-backed feed sort

Create `migrations/040_feed_sort_indexes.sql` (check the next free number first):

```sql
-- Expression indexes matching the feed's score-decay and USD-budget sorts.
CREATE INDEX IF NOT EXISTS idx_leads_score_decay
  ON leads ((score - EXTRACT(EPOCH FROM (now() - created_at)) / 3600 * (1.0/6)) DESC, created_at DESC, id DESC)
  WHERE state = 'active' AND status <> 'rejected';
```

NOTE: `now()` in an index expression is NOT immutable — Postgres rejects it. Therefore the score-decay index is impossible as written; the correct approach is a GENERATED STORED column refreshed on write, OR accept the sort cost and index only the budget side:

```sql
CREATE INDEX IF NOT EXISTS idx_leads_usd_sort
  ON leads (COALESCE(normalized_usd_max, normalized_usd_min) DESC NULLS LAST, created_at DESC, id DESC)
  WHERE state = 'active' AND status <> 'rejected';
```

Implement ONLY the budget index (immutable expression — allowed). For the score sort, do NOT add a generated column in this plan (write-path churn); instead document in Maintenance notes that the score-decay sort needs a materialized `effective_score` column maintained on insert/vote/rescore, and leave the expression sort as-is. Verify the budget index is used: under `RADAR_TEST_STORE=postgres`, `EXPLAIN` the budget-sorted feed query (add a store test that runs EXPLAIN and asserts `Index Scan` using `idx_leads_usd_sort` — skip the test when not on Postgres).

**Verify**: `pnpm typecheck` → exit 0; `pnpm test` → all pass; Postgres-mode EXPLAIN test passes when available.

## Test plan

- New: MinHash oracle property test; rating batch-call-count test; ingest prefetch parity test; SSE two-tier characterization test; budget-index EXPLAIN test (Postgres-gated).
- Structural patterns: `test/fingerprint.test.ts`, `test/rating.test.ts`, `test/pipeline.test.ts`.
- Verification: `pnpm test` → all pass; Postgres suite when available.

## Done criteria

- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm test` exits 0; new tests exist and pass
- [ ] MinHash sketches byte-identical to the oracle (covered by test)
- [ ] `grep -n "BigInt(a) \* BigInt(rawH)" src/core/fingerprint.ts` → no matches (constants hoisted)
- [ ] SSE wire protocol unchanged (characterization test green)
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

- The excerpts don't match the live code (drift).
- The MinHash oracle test shows ANY mismatch after the hoist (the hoist must be exactly equivalent; if not, revert and report).
- The SSE refactor breaks a tier-delay or cursor assertion you cannot fix within scope.
- Postgres rejects the budget index expression (report the exact error; do not switch to a generated column without a new plan).
- A verification fails twice after a reasonable fix attempt.

## Maintenance notes

- Deferred (document, don't build): full `Math.imul` MinHash (needs the proven reduction + 10k-input oracle), `effective_score` generated column for the score sort, batching `getLeadDecision`/`getContactFlags` in the rating loop, cross-worker SSE fan-out (needs Redis/pg LISTEN — the shared poller is per-process by design).
- The shared SSE poller fetches the union window without tier filtering; a hub with many delayed tiers fetches slightly more rows than before — bounded by `limit 200` per tick, acceptable.
- Reviewer: the MinHash oracle test is the load-bearing artifact — scrutinize it; the SSE characterization test must cover cursor resume (`Last-Event-ID`) as well as live delivery.
