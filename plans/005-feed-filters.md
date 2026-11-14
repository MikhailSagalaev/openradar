# Plan 005: Make skill counts follow the active filters, and split budget steps

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before the next step. On a STOP condition, stop and report. When done, set plan 005's status in `plans/README.md` to DONE.
>
> **Drift check (run first)**: `git diff --stat f02a024..HEAD -- src/server/app.ts src/server/filters.ts src/server/ui.ts`
> On an excerpt mismatch, STOP. Plan 002 should already be merged if you care that the counts use corrected skills. This plan does not depend on 002 to compile.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: plans/002-skill-false-positives.md (for correct tags; the code stands alone)
- **Category**: bug
- **Planned at**: commit `f02a024`, 2026-11-09

## Why this matters

`popularSkills` counts skills on the latest 2000 leads from the last 14 days and caches that list for 10 minutes. The dropdown prints the count next to the name. The count does not change when the visitor selects IT only, remote, language, type, or budget. Choosing `Продажи` together with IT only returns leads that have both, while the label still shows the unfiltered count.

`BUDGET_STEPS_RUB` is `5000, 20000, 50000, 100000` for orders and for vacancies. The live 30-day median of Russian vacancies that state pay is 99 000 ₽. The 5 000 and 20 000 steps do nothing for vacancies, and there is no step at 150 000 or above.

## Current state

`src/server/app.ts` `popularSkills` takes no arguments. Cache shape: `{ at: number; items: Array<{ name: string; count: number }> }`. It calls `runtime.store.getLeadsForFeed({ limit: 2000, createdAfter })`.

`src/server/filters.ts`:

```ts
export const BUDGET_STEPS_RUB = [5_000, 20_000, 50_000, 100_000] as const;
```

`src/server/ui.ts` builds the budget dropdown from `BUDGET_STEPS_RUB` only. The page already knows `type` (`'' | 'gig' | 'job'`) in `renderLeadsPage`.

The home route parses `type` and `filters` before render and passes `popularSkills: await popularSkills()`.

Commit style: `fix(feed): count skills inside the active filters and split budget steps by type`.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Filter tests | `pnpm test -- test/filters.test.ts` | all pass. Create the file if it does not exist. Search first. |
| Typecheck | `pnpm typecheck` | exit 0 |
| Full tests | `pnpm test` | all pass |

## Scope

**In scope**:

- `src/server/filters.ts`
- `src/server/app.ts` (`popularSkills` and its call on `GET /` only)
- `src/server/ui.ts` (budget dropdown only)
- `test/filters.test.ts` (create or extend)
- `plans/README.md` (status row only)

**Out of scope**:

- Replacing `IT_SKILLS` with research roles. Leads have no stored role in this commit.
- SQL faceting (`GROUP BY skill`) inside Postgres. Counting 2000 already-fetched leads is the current mechanism. Keep it.
- The RSS and API list routes. They do not render the dropdown.

## Git workflow

- Branch: `advisor/005-feed-filters`
- One commit. Do not push.

## Steps

### Step 1: Budget steps depend on type

In `src/server/filters.ts`, replace the single constant with:

```ts
export const GIG_BUDGET_STEPS_RUB = [5_000, 20_000, 50_000, 100_000] as const;
export const JOB_BUDGET_STEPS_RUB = [80_000, 150_000, 250_000, 400_000] as const;

export function budgetStepsFor(type: '' | 'job' | 'gig'): readonly number[] {
  if (type === 'job') return JOB_BUDGET_STEPS_RUB;
  if (type === 'gig') return GIG_BUDGET_STEPS_RUB;
  return JOB_BUDGET_STEPS_RUB;
}
```

The mixed tab uses the vacancy scale. A visitor looking at everything can still type another floor: `parseFeedFilters` already accepts any positive `budget` up to 100_000_000, and the dropdown already appends the current value when it is not one of the steps. Keep that branch.

Delete `BUDGET_STEPS_RUB` and update the import in `src/server/ui.ts`. Pass `type` into the dropdown builder.

### Step 2: Skill counts honor the other filters

Change `popularSkills` to accept the current feed filters and the page type.

Cache key: a string of `type`, `it`, `remote`, `language`, `budgetRub`. Do not include `skill` or `q` or `sort`. TTL stays 10 minutes. Keep one cache entry per key, not a single global entry. Cap the map at 32 entries; drop the oldest when it grows past that.

Query `getLeadsForFeed` with `filterOptions` of those filters, `type`, `limit: 2000`, and the same 14-day `createdAfter`. Do not set `skill` on that query, or the open dropdown would only contain the selected skill.

The rest of the counting (threshold 2, top 30) stays.

`GET /` already has `type` and `filters` before the render call. Pass them in.

### Step 3: Tests

In `test/filters.test.ts`:

- `budgetStepsFor('gig')` deep-equals `[5000, 20000, 50000, 100000]`
- `budgetStepsFor('job')` deep-equals `[80000, 150000, 250000, 400000]`
- `budgetStepsFor('')` deep-equals the job steps

The cache key is a closure inside `app.ts`. Do not export the server to test it. Testing `budgetStepsFor` is the required automated check. In a comment at the `popularSkills` cache, state the key fields so a reviewer can see that `skill` is excluded.

**Verify**: `pnpm test -- test/filters.test.ts` → pass. `pnpm typecheck` → exit 0. `pnpm test` → all pass. `rg -n "BUDGET_STEPS_RUB" src` → no matches.

## Done criteria

- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm test` exits 0
- [ ] `BUDGET_STEPS_RUB` is gone
- [ ] `popularSkills` takes the active filters and its cache key omits `skill`
- [ ] `git status --short` shows only in-scope files
- [ ] Plan 005 status is DONE

## STOP conditions

- `getLeadsForFeed` does not accept `skillsAny`, `language`, `minBudgetUsd`, or `type`. `filterOptions` returns those fields today. If the store type rejects them, STOP.
- The home handler does not have `type` and `filters` in scope at the `popularSkills()` call. STOP and report the line. Do not thread the filters through a new global.
- The UI dropdown is not built from `BUDGET_STEPS_RUB` (the excerpt moved). STOP.

## Maintenance notes

- Counts are still a sample of 2000 leads, not a SQL `COUNT`. The label is the count inside that sample. Do not format it as the size of the whole database.
- Job steps are fixed rouble floors converted by `rubToUsd` at the reference rate 1/92. A later FX change in `src/core/salary.ts` moves these floors. That is existing behavior.
