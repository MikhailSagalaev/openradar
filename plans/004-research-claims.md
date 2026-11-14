# Plan 004: Stop publishing mixed-period and mislabeled research claims

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before the next step. On a STOP condition, stop and report. When done, set plan 004's status in `plans/README.md` to DONE.
>
> **Drift check (run first)**: `git diff --stat f02a024..HEAD -- src/research/report.ts src/research/pages.ts src/research/pages-en.ts src/store/postgres.ts docs/RESEARCH_METHODOLOGY.md`
> If `src/research/report.ts` contains `ciLow` or `adjustedGap`, STOP. The live site has those fields; this plan was written against commit `f02a024`, which does not. Do not delete them.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `f02a024`, 2026-11-09

## Why this matters

Three things the research page can be quoted for are not what the headings say.

1. `computeCartaCapital(records)` sums `record.pay` across every remaining record. A monthly salary in roubles and a one-off project budget are added into one "100% of contract capital". The editorial sentence then hardcodes a conclusion about engineering roles.
2. `computeTaskTransformation` classifies `${role} ${skills}`, not the post text. Every `ai` role becomes "AI agents, RAG and n8n". Every `content` role becomes "basic copywriting". `changePct` for the emerging side is wrapped in `Math.max(0, changePct)`, so a negative gap is stored as 0. The page subtitle calls `netShiftPct` an AI-skill premium.
3. `listLeadsForResearch` drops `rejected`, `failed`, `hidden_junk`, and `hidden_scam`. It keeps posts flagged `channel_ad`, `digest`, and `mlm`. Those flags only lower the feed score.

`docs/RESEARCH_METHODOLOGY.md` says the report uses the official exchange rate on the publication day, drops OLQI grades C and D, and treats n ≥ 30 as a consequence of the central limit theorem. None of that is what `src/research/report.ts` does. The page generated from `src/research/pages.ts` is the honest description. The markdown file is the one a journalist can quote by mistake.

## Current state

`src/research/report.ts`:

- `REPORT_VERSION = 1`
- `buildReport` calls `computeCartaCapital(records)`, `computeTaskTransformation(records)`, and `computeEditorialInsight(...)` on all non-excluded records.
- `dist` publishes a median from `MIN_MEDIAN` (10). Quartiles from `MIN_QUARTILES` (20). `RELIABLE` is 30 and is only a badge.
- Role `other` is omitted from the role chart in `src/research/pages.ts` (`s.key !== 'other'`) and is included in `jobs.pay`.

`src/store/postgres.ts` `listLeadsForResearch` WHERE clause:

```sql
state NOT IN ('hidden_junk', 'hidden_scam') AND status NOT IN ('rejected', 'failed')
```

Quality flags live in `metadata_json->'qualityFlags'`. Flag names: `channel_ad`, `digest`, `mlm`, `outstaff` (`src/core/quality.ts`).

Commit style: `fix(research): stop quoting a mixed-period capital share and a relabeled AI premium`.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Research tests | `pnpm test -- test/research.test.ts` | all pass |
| Typecheck | `pnpm typecheck` | exit 0 |
| Full tests | `pnpm test` | all pass |

## Scope

**In scope**:

- `src/research/report.ts`
- `src/research/pages.ts`
- `src/research/pages-en.ts`
- `src/store/postgres.ts` (`listLeadsForResearch` only)
- `src/store/memory.ts` (the same filter, if that method exists there)
- `docs/RESEARCH_METHODOLOGY.md`
- `test/research.test.ts`
- `plans/README.md` (status row only)

**Out of scope**:

- Rebuilding the task taxonomy on real post text. This plan removes the quote. It does not invent a better premium.
- The weekly Laspeyres index, experience-based grades, and one-sided ranges. Those are plan 006.
- `src/research/methodology.ts` helpers (`calculateOlqi`, `classifyTaskTransformation`). Leave them. They are unused by the report after this plan except where `report.ts` already imports `classifyTaskTransformation`. If that import becomes unused, delete the import. Do not delete the module.
- Wiring OLQI into `dist`.

## Git workflow

- Branch: `advisor/004-research-claims`
- One commit. Do not push.

## Steps

### Step 1: Drop ads, digests, and MLM from the research query

In `listLeadsForResearch`, add:

```sql
AND NOT (COALESCE(metadata_json->'qualityFlags', '[]'::jsonb) ?| ARRAY['channel_ad','digest','mlm'])
```

Leave `outstaff` in the sample. Mirror the predicate in the memory store if `listLeadsForResearch` is implemented there.

Bump `REPORT_VERSION` from 1 to 2 only if it is still 1. If it is already greater than 1, STOP.

### Step 2: Stop the mixed capital total and the AI-premium quote

In `buildReport`:

- Call `computeCartaCapital` twice: once with `jobs` (the Russian-scope job records already filtered in `buildReport`) and once with `gigs`. Store them as `cartaJobs` and `cartaGigs`. Do not pass the combined `records` array.
- Each chart's capital is the sum of `pay` inside that set only. Jobs are monthly roubles. Gigs are project roubles. The function may stay; the caller changes.
- Do not call `computeTaskTransformation` from `buildReport`. Remove `taskTransformation` from the object passed to the page, or set it `undefined`.
- `computeEditorialInsight` must describe only `cartaJobs`. Delete the hardcoded sentence that the money sits in engineering roles. If the volume leader and the capital leader differ, say those two labels and their shares. If they are the same, say that. Do not add a third conclusion that is not computed from `cartaJobs`.

In `src/research/pages.ts` and `src/research/pages-en.ts`, render two charts (vacancies, orders) from the two series. Remove the call to `renderTaskTransformationSection`. You may leave the function in the file if TypeScript does not flag it. `noUnusedLocals` is off. Prefer deleting the section renderer and its embed route if the route only serves that section. Search for `task-transformation`. If an HTTP route returns that section, return 404 or remove the route. Do not leave a public embed of the old premium.

### Step 3: Tests

In `test/research.test.ts`, add or adjust cases so that:

- A fixture set with one job `pay: 200000` period month and one gig `pay: 200000` period project does not produce a single capital series where those two are added. Assert the job series capital and the gig series capital separately.
- `buildReport(...).taskTransformation` is `undefined`.
- A record is not required to prove the SQL flag filter in this file. Add a one-line comment in the SQL instead. If `test/research.test.ts` builds reports from `ResearchRecord[]` and never hits Postgres, do not open a database.

**Verify**: `pnpm test -- test/research.test.ts` → pass.

### Step 4: Mark the markdown methodology as a proposal

At the top of `docs/RESEARCH_METHODOLOGY.md`, under the title, add a short status block in Russian:

- The implemented rules are the methodology section rendered from `src/research/pages.ts` and the code in `src/research/report.ts`.
- This file is a proposal. It is not a description of the published numbers.
- Delete or rewrite these claims so they are not readable as current behavior: official FX on the day of the post (`budget_usd_normalized`), OLQI grades C and D excluded from medians, n ≥ 30 justified by the central limit theorem. Replace each with one sentence: the code uses the fixed table `RUB_PER` in `src/research/derive.ts`, OLQI is not applied to the report, and n ≥ 30 is a display badge (`RELIABLE`), not a theorem.

Do not rewrite the design-system or chart-archetype sections.

**Verify**: `rg -n "budget_usd_normalized|Центральн" docs/RESEARCH_METHODOLOGY.md` → no matches. `pnpm typecheck` → exit 0. `pnpm test` → all pass.

## Done criteria

- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm test` exits 0
- [ ] `rg -n "computeTaskTransformation\\(" src/research/report.ts` shows the function definition only, no call from `buildReport`
- [ ] `rg -n "channel_ad" src/store/postgres.ts` shows the research query excluding that flag
- [ ] `docs/RESEARCH_METHODOLOGY.md` no longer states official daily FX, OLQI exclusion, or the CLT justification as current behavior
- [ ] `REPORT_VERSION` is 2
- [ ] Plan 004 status is DONE
- [ ] `git status --short` shows only in-scope files

## STOP conditions

- `report.ts` already contains `ciLow` or `adjusted`. STOP. Do not strip those fields to match this plan.
- `REPORT_VERSION` is not 1. STOP. Plan 006 also bumps the version; report the value you found.
- Removing the task-transformation embed breaks a test you cannot update inside `test/research.test.ts` or `test/research-index.test.ts`. Update those tests if they only assert the old section's presence. If they assert a numeric premium, change the assertion to `undefined`. If the failure is elsewhere, STOP.
- The carta change would require editing `src/research/derive.ts`. That file is plan 006.

## Maintenance notes

- Monthly snapshots saved with `REPORT_VERSION` 1 stay as they were (`monthSnapshot` returns a report when `report.version <= REPORT_VERSION`). Readers of an old month still see the old charts. The live page uses the new code. Call that out in the commit message.
- Plan 006 adds the weekly index on top of this report shape. Do not start 006 in the same commit.
