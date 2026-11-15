# Plan 008: Close the small correctness holes (SimilarIndex poisoning, digest watermark, title clipping, vote race, dead code)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 260a650..HEAD -- src/pipeline/similar.ts src/pipeline/digest.ts src/core/extract.ts src/store/postgres.ts test/similar.test.ts test/title-quality.test.ts test/store.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `260a650`, 2026-11-11

## Why this matters

Five small, independent defects, each cheap to fix and each with a concrete cost:
1. One transient DB error permanently poisons the similar-text dedup index — every later ingest of a post with ≥15 words throws until the process restarts (full ingestion outage from a single blip).
2. The Telegram digest advances its watermark BEFORE sending — one failed send loses that window of top leads forever.
3. The title cleaner eats the last letter of a title when a metadata label is glued to it (`РазработчикКомпания: X` → `Разработчи`), corrupting `titleKey` and 24h title dedup.
4. `updateLeadScore` reads votes without a row lock and writes in a separate statement — a vote committed in between is silently erased until the next rescore.
5. Dead code: an unreachable second `return` in `recordUserVote` (leftover of an unfinished edit).

## Current state

- `src/pipeline/similar.ts` — `SimilarIndex`, two lazy loaders. Lines 46 and 74:

```ts
  private async ensureShared(now: Date): Promise<void> {
    this.loading ??= (async () => {
      if (await this.store.hasLeadBands?.()) return;
      // … loads sketches, saves bands …
    })();
    await this.loading;
    // …
  }

  private async ensureLoaded(now: Date): Promise<void> {
    this.loading ??= (async () => {
      // … listRecentSketches → addEntry …
    })();
    await this.loading;
  }
```

  `this.loading` is `private loading?: Promise<void>`. If the async body rejects, the rejected promise stays cached forever; every later `findSimilar` awaits the same rejection.
- `src/pipeline/digest.ts` — `runDigestIfDue`. Lines 53–60:

```ts
  if (lastDigestAt === undefined) {
    lastDigestAt = now;
    return { sent: false, leads: 0, skipped: 'not_due' };
  }
  if (now - lastDigestAt < intervalMs) return { sent: false, leads: 0, skipped: 'not_due' };

  const since = new Date(lastDigestAt).toISOString();
  lastDigestAt = now;
```

  On `!response.ok` or a thrown fetch the function returns `skipped: 'send_failed'` but `lastDigestAt` already moved → the window `[since, now]` is never retried. `lastDigestAt` is a module-level `let` (line 18).
- `src/core/extract.ts` — `cleanTitle`, line 219:

```ts
  candidate = candidate.replace(/(?:\s+|[a-zа-яё0-9\)])(?:Компания|Город|Работодатель|Company|City|Формат\s+работы|Формат|Локация|Уровень|Занятость|Вилка|ЗП|Зарплата)\s*:[^·\n]*/iu, '');
```

  The first group CONSUMES the character before the label. With `РазработчикКомпания: Acme` it eats the `к`.
- `src/store/postgres.ts` — `updateLeadScore`, lines 940–954: `SELECT status, votes_up, … FROM leads WHERE id = $1` via `this.pool.query` (no lock), then a separate `UPDATE leads SET score = $1, quality_score = $2 WHERE id = $3`. Compare `recordUserVote` (line ~2010) which correctly uses `pool.connect()` + `BEGIN` + `FOR UPDATE`.
- `src/store/postgres.ts` — `recordUserVote`, lines 2070–2090: after `await client.query('COMMIT');` there is a `return { …, myVote: activeVote };` followed by a SECOND unreachable `return { … alreadyVoted: false };` (no `myVote`).
- Conventions: `AGENTS.md` §2 — zero live network in tests; `pnpm typecheck` covers `test/`. Test helpers: `test/helpers.ts` (`makeTestRuntime`, `TEST_NOW`, `createTestStore` — memory by default, Postgres when `RADAR_TEST_STORE=postgres`). Existing patterns: `test/similar.test.ts`, `test/title-quality.test.ts`, `test/store.test.ts`.

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Typecheck | `pnpm typecheck`         | exit 0, no errors   |
| Tests     | `pnpm test`              | all pass (baseline: 82 files, 690 tests) |
| Focused   | `pnpm test -- similar title-quality store` | all pass |

## Scope

**In scope** (the only files you should modify):
- `src/pipeline/similar.ts`
- `src/pipeline/digest.ts`
- `src/core/extract.ts`
- `src/store/postgres.ts` (only `updateLeadScore` and the dead return in `recordUserVote`)
- `test/similar.test.ts`
- `test/digest.test.ts` (create)
- `test/title-quality.test.ts`
- `test/store.test.ts`

**Out of scope** (do NOT touch):
- `src/pipeline/runner.ts`, `src/cli/index.ts` — scheduling/shutdown is plan 012.
- `src/store/memory.ts` — its `updateLeadScore` has no concurrency; parity work is plan 009.
- The digest's module-global state refactor and the 200-lead window cap — deferred (see Maintenance notes).
- `SimilarIndex.remove()` wiring — plan 009 owns deletion paths.

## Git workflow

- Branch: `advisor/008-small-correctness`
- One commit per fix, e.g. `fix(similar): reset the cached loader promise when loading fails`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Reset the SimilarIndex loader on failure

In both `ensureShared` and `ensureLoaded`, replace the bare `this.loading ??= (async …)()` with a promise that clears itself on rejection:

```ts
    this.loading ??= (async () => {
      // … existing body unchanged …
    })().catch((error) => {
      this.loading = undefined;
      throw error;
    });
    await this.loading;
```

Keep the bodies identical. The next call after a failure must retry loading, not re-await the cached rejection.

**Verify**: `pnpm typecheck` → exit 0; `pnpm test -- similar` → all pass.

### Step 2: Add a regression test for the poisoned loader

In `test/similar.test.ts` (follow its existing structure), add a test with a fake store whose `listRecentSketches` rejects on the first call and resolves `[]` afterwards. Construct `new SimilarIndex(fakeStore)` (memory mode: the fake must NOT define `saveLeadBands`/`findBandCandidates`). First `findSimilar(sketch, now)` rejects; second call resolves (undefined is fine). Use a real non-empty sketch from `computeMinHashSketch` in `src/core/fingerprint.ts`.

**Verify**: `pnpm test -- similar` → all pass including the new test.

### Step 3: Advance the digest watermark only after a successful send

In `src/pipeline/digest.ts`, remove the early `lastDigestAt = now;` (line 60). Instead set `lastDigestAt = now;` immediately before `return { sent: true, leads: top.length };` (after the `response.ok` check). The `nothing_new` path: also advance the watermark there (return `skipped: 'nothing_new'` only after setting `lastDigestAt = now`) so an empty window does not re-scan forever. The `send_failed` paths must leave `lastDigestAt` untouched.

**Verify**: `pnpm typecheck` → exit 0.

### Step 4: Test the digest watermark

Create `test/digest.test.ts`. Because `lastDigestAt` is module-global, order matters: use ONE `describe` with sequential `it`s (vitest runs them in order within a file) or `vi.resetModules()` + dynamic import per test. Cases:
1. First call with `RADAR_DIGEST_CHAT_ID` + `TELEGRAM_BOT_TOKEN` set → `skipped: 'not_due'` (baseline).
2. Inject a clock: the function uses `Date.now()` — use `vi.useFakeTimers()` / `vi.setSystemTime()` to jump past `RADAR_DIGEST_INTERVAL_HOURS`. Seed one fresh lead via `makeTestRuntime` store (`ingestRawLead` pattern from `test/openapi.test.ts`), `fetchImpl` mock returning `new Response('', { status: 500 })` → `skipped: 'send_failed'`.
3. Immediately retry with `fetchImpl` returning ok → `sent: true` and the lead from step 2 is included (window not lost). THIS is the regression: before the fix, step 3 would report `nothing_new`.

**Verify**: `pnpm test -- digest` → all pass.

### Step 5: Stop the title cleaner from eating a letter

In `src/core/extract.ts` line 219, change the consuming prefix `(?:\s+|[a-zа-яё0-9\)])` to a lookbehind so the character is preserved:

```ts
  candidate = candidate.replace(/(?<=\s|[a-zа-яё0-9\)])(?:Компания|Город|Работодатель|Company|City|Формат\s+работы|Формат|Локация|Уровень|Занятость|Вилка|ЗП|Зарплата)\s*:[^·\n]*/iu, '');
```

Node 22 supports lookbehind. Keep everything else in `cleanTitle` unchanged.

**Verify**: `pnpm typecheck` → exit 0; `pnpm test -- title-quality` → all pass.

### Step 6: Title regression tests

In `test/title-quality.test.ts`, add cases for `cleanTitle`:
- `cleanTitle('РазработчикКомпания: Acme')` → contains `Разработчик` (full word, no clipped `Разработчи`).
- `cleanTitle('Python Developer Company: Acme')` → contains `Developer`.
- `cleanTitle('Дизайнер Формат: удалённо')` → `Дизайнер` intact.
- Existing spaced-label behavior unchanged: `cleanTitle('Разработчик Компания: Acme')` → `Разработчик`.

**Verify**: `pnpm test -- title-quality` → all pass including new cases.

### Step 7: Lock the row in updateLeadScore

Rewrite `updateLeadScore` in `src/store/postgres.ts` to use a dedicated client and transaction, mirroring `recordUserVote`'s structure:

```ts
  async updateLeadScore(id: string, baseScore: number): Promise<number | undefined> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const res = await client.query(
        `SELECT status, votes_up, votes_down, votes_scam, votes_closed FROM leads WHERE id = $1 FOR UPDATE`,
        [id],
      );
      const row = res.rows[0];
      if (!row) { await client.query('ROLLBACK'); return undefined; }
      const { score } = recalculateVoteScoreAndStatus(/* unchanged args */);
      await client.query(`UPDATE leads SET score = $1, quality_score = $2 WHERE id = $3`, [score, baseScore, id]);
      await client.query('COMMIT');
      return score;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
```

Keep the exact `recalculateVoteScoreAndStatus` arguments from the current code.

**Verify**: `pnpm typecheck` → exit 0; `pnpm test -- store` → all pass.

### Step 8: Delete the unreachable return

In `recordUserVote` (`src/store/postgres.ts` ~2081–2090), delete the second `return { … alreadyVoted: false };` block that follows the first `return` after `COMMIT`. Do not change the first return (it carries `myVote`).

**Verify**: `pnpm typecheck` → exit 0; `pnpm test` → all pass.

## Test plan

- New: poisoned-loader retry (`test/similar.test.ts`), digest watermark retry (`test/digest.test.ts`, new file), glued-label title cases (`test/title-quality.test.ts`).
- The vote race is covered structurally by the `FOR UPDATE` transaction; a deterministic interleaving test needs Postgres — if `RADAR_TEST_STORE=postgres` is available, add a `Promise.all([recordUserVote, updateLeadScore])` test to `test/store.test.ts` asserting the vote survives; otherwise note it in the plan row and rely on the existing store tests.
- Verification: `pnpm test` → all pass (baseline 690 + new).

## Done criteria

- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm test` exits 0; new tests exist and pass
- [ ] `grep -n "lastDigestAt = now" src/pipeline/digest.ts` shows the assignment only in the baseline, nothing_new, and success paths (not before the fetch)
- [ ] `grep -n "FOR UPDATE" src/store/postgres.ts` includes the `updateLeadScore` SELECT
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

- The excerpts don't match the live code (drift).
- `cleanTitle`'s regex or label list differs materially from the excerpt (upstream keeps extending it — re-derive the lookbehind from the CURRENT regex, and if unsure, stop).
- A verification fails twice after a reasonable fix attempt.
- The digest test cannot control time without touching `src/pipeline/digest.ts` beyond the watermark move (do not refactor the module-global in this plan).

## Maintenance notes

- Deferred: digest module-global → per-runtime state, and the 200-lead window cap (`listLeads({ limit: 200 })` can miss fresh leads on a busy node). Both belong to a digest redesign, not this fix.
- `SimilarIndex.remove()` is still unwired; plan 009 connects it to deletion paths.
- Reviewer: check the lookbehind against Russian AND English glued labels, and that `nothing_new` advancing the watermark cannot skip a lead inserted between the scan and the assignment (single-threaded event loop: the scan and assignment are synchronous — safe).
