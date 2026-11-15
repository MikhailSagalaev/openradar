# Plan 006: Publish a composition-stable weekly pay index and label one-sided ranges

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before the next step. On a STOP condition, stop and report. When done, set plan 006's status in `plans/README.md` to DONE.
>
> **Drift check (run first)**: `git diff --stat f02a024..HEAD -- src/research/report.ts src/research/derive.ts src/research/pages.ts src/research/pages-en.ts`
> Plan 004 must be DONE. If `taskTransformation` is still attached in `buildReport`, STOP and finish 004 first.
> If `report.ts` contains `ciLow` or `adjusted`, STOP. This plan was written for commit `f02a024` plus plan 004. Do not remove fields you did not add.

## Status

- **Priority**: P2
- **Effort**: L
- **Risk**: MED
- **Depends on**: plans/004-research-claims.md
- **Category**: bug
- **Planned at**: commit `f02a024`, 2026-11-09

## Why this matters

The live report on 9 November 2026 has this weekly series for Russian vacancies that state pay:

| Week | n | Median, ₽ |
|------|---|-----------|
| 2026-10-05 | 25 | 423 000 |
| 2026-10-12 | 404 | 300 000 |
| 2026-10-19 | 988 | 250 000 |
| 2026-10-26 | 3 933 | 120 000 |
| 2026-11-02 | 35 586 | 98 000 |
| 2026-11-09 | 5 649 | 90 000 |

`jobs.remote` and `jobs.ai` on that same payload already have an `adjusted` gap. `jobs.weekly` does not. The drop is the mix: the early weeks are a few hundred posts, and the week of 2 November is 35 586, mostly new hh.ru volume. A reader treats the line as a pay cut.

Separately, `normalizePay` sets `point` to the midpoint of a range and to the only bound when the post says `от X` or `до Y`. Those points enter one median. Posts with only a floor are much more common than posts with only a ceiling, so the pooled median sits near the floor.

`detectGrade` reads a grade word in the title, the board's grade, or a `#middle` tag. It does not read `опыт от 3 лет`. Empty grade is the common case, and the grades that match are the words employers actually write (`старший`, `ведущий`, `руководитель`), so the graded slice is top-heavy. Plan 006 does not pretend experience years are a grade. It records them as a separate field and does not push them into `grade`.

## Current state

After plan 004:

- `REPORT_VERSION` is 2.
- `buildReport` still fills `jobs.weekly` from `dist` of that week's `ruJobs` pay points. See `mondayOf` and the `weekly` assignment in `buildReport`.
- `src/research/derive.ts` `normalizePay` sets `point` to the average of min and max when both exist, otherwise the one present bound.
- `detectGrade` does not look at years of experience.
- The page chart is `weekly()` in `src/research/pages.ts`.

Commit style: `fix(research): index weekly pay on a fixed role basket`.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Research tests | `pnpm test -- test/research.test.ts` | all pass |
| Typecheck | `pnpm typecheck` | exit 0 |
| Full tests | `pnpm test` | all pass |

## Scope

**In scope**:

- `src/research/derive.ts`
- `src/research/report.ts`
- `src/research/pages.ts`
- `src/research/pages-en.ts`
- `test/research.test.ts`
- `plans/README.md` (status row only)

**Out of scope**:

- The volume index in `src/research/index.ts`. Do not drop 6 November from it.
- Mapping years of experience onto `grade`.
- Imputing a midpoint for `от X` from a spread coefficient.
- Reintroducing `taskTransformation`.

## Git workflow

- Branch: `advisor/006-weekly-pay-index`
- One commit. Do not push.

## Steps

### Step 1: Record which bound the post stated

On `ResearchRecord`, add optional `payBound: 'point' | 'range' | 'from' | 'to'`.

Set it in `deriveRecord` from the pay object before normalization:

- both min and max equal, or only one of them equal to the other: `'point'`
- both set and different: `'range'`
- only min: `'from'`
- only max: `'to'`

`pay` stays the current point estimate. Do not change `point`'s formula. Bump `REPORT_VERSION` from 2 to 3.

In `dist` input, the caller can filter. Add `jobs.payByBound: { point: Dist; range: Dist; from: Dist; to: Dist }` on the report, each via the existing `dist` (so a cell under 10 posts has no median).

### Step 2: Fixed-basket weekly index

Add `jobs.weeklyIndexed: Array<{ week: string; n: number; median?: number; roles: number }>`.

Weights, computed once from all `ruJobs` in the report window:

- Group by `role`. Drop `other`.
- Keep roles with at least 30 paid posts (`RELIABLE`) in the whole window.
- Weight of a role is its paid count divided by the sum of paid counts of the kept roles.

For each week that already appears in `jobs.weekly`:

- For each kept role, take that week's paid posts in the role. If the role has fewer than 10 paid posts that week, skip it (no median).
- The week's index is the weighted average of the role medians that exist, weights renormalized over the roles that have a median that week.
- `roles` is how many role medians entered.
- If no role qualifies, `median` is omitted.

Leave `jobs.weekly` as the raw median. The page must chart `weeklyIndexed` and print one line: the raw median is also available and moves when the mix of roles changes. Do not delete the raw series from the JSON.

### Step 3: Experience is not a grade

Add optional `experienceYears?: number` on `ResearchRecord`. Set it only when the title or the first 600 characters of the text match `опыт(?:а)?\s+(?:от\s+)?(\d{1,2})\s*(?:[-–—]|до)\s*(\d{1,2})\s*(?:год|лет)` or `опыт(?:а)?\s+от\s+(\d{1,2})\s*(?:год|лет)`. Store the lower number. Do not call `detectGrade` with it. Do not add it to `byGrade`.

This step exists so a later report can tabulate experience without corrupting the grade median. Put `experienceYears` on the CSV column list in `src/research/service.ts` only if you are already editing that file. You are not. Skip the CSV. The field on the record is enough.

### Step 4: Tests

In `test/research.test.ts`:

- Two roles, fixed weights. Week 1 is only the high-pay role (median 400000, n ≥ 10). Week 2 is the same role at 400000 (n ≥ 10) plus a large low-pay role that is not in the basket (or is in the basket with a stable median). Construct the fixture so the raw weekly median falls and `weeklyIndexed` median stays within 5% of week 1. Use `RELIABLE` and `MIN_MEDIAN`: the kept role needs 30 posts across the window and 10 in each week. A compact way: 30 posts of role A at 400000 in week 1 and 10 posts of role A at 400000 plus 40 posts of role B at 80000 in week 2. Role B has 40 posts, so it is also in the basket. Then week 2's indexed median is the weighted mix of 400000 and 80000, not the raw median of all 50. Assert indexed is not equal to the raw median of week 2, and that role A's contribution is still 400000 by checking the indexed value equals `(30*400000 + 40*80000) / 70` rounded the way `dist` rounds (to thousands). Write the expected number out after you compute `dist` on each role, and assert against that. Do not assert the raw series disappeared.
- A record parsed from `от 100 000 ₽` has `payBound: 'from'`. A record from `от 100 000 до 200 000 ₽` has `payBound: 'range'`.
- `опыт от 3 лет` sets `experienceYears` to 3 and does not set `grade` when the title has no grade word.

**Verify**: `pnpm test -- test/research.test.ts` → pass. `pnpm typecheck` → exit 0. `pnpm test` → all pass.

## Done criteria

- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm test` exits 0
- [ ] `REPORT_VERSION` is 3
- [ ] `jobs.weekly` still present and `jobs.weeklyIndexed` filled by the test fixture
- [ ] `payBound` is set on records that have pay
- [ ] The Russian research page charts `weeklyIndexed`, and the caption says the raw median moves with the mix of roles
- [ ] `git status --short` shows only in-scope files
- [ ] Plan 006 status is DONE

## STOP conditions

- Plan 004 is not DONE (`taskTransformation` still assigned in `buildReport`, or `REPORT_VERSION` is still 1).
- `ciLow` or `adjusted` appeared. STOP.
- The indexed median cannot be computed without changing `dist`. Use `dist(...).median` per role. Do not fork the quantile function.
- A test fixture needs more than 200 `ResearchRecord` literals and you start generating them from the network or from `dataset.csv`. Build them in a loop inside the test. No network.

## Maintenance notes

- The basket is the report window, not a permanent 2026 weight set. A month snapshot therefore has its own weights. That is a Laspeyres index inside one report, not across months. Say so in the chart caption. A cross-month chain index is out of scope.
- `experienceYears` will be misread as a grade if a later page prints it in the grade table. Do not add it there.
- Old snapshots stay at version 2 or 1 and have no `weeklyIndexed`. The page must tolerate a missing `weeklyIndexed` and fall back to `weekly` for those snapshots only.
