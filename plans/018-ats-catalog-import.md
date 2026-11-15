# Plan 018: Import the MIT groundtruth ATS board catalog (hundreds of companies)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 260a650..HEAD -- src/sources/ats-companies.ts src/sources/ats.ts scripts/ docs/SOURCES_ROBOTS.md docs/SOURCE_INDEXING_LOG.md`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: L
- **Risk**: LOW (additive catalog; per-board failures already tolerated)
- **Depends on**: 016 (shares `ats-companies.ts`; run after 016's verified adds land)
- **Category**: direction
- **Planned at**: commit `260a650`, 2026-11-11

## Why this matters

The user asked for "hundreds of sources". The single highest-leverage, fully
legal answer is the **groundtruthtools/ats-jobs-mcp** board directory: a
**MIT-licensed** `directory.json` with **7 479 boards** (4 168 Greenhouse +
3 311 Ashby), each row "confirmed against the applicant-tracking system's own
public API on the date shown" (2026-08-24). A live cross-match against our
catalog (`.research/analyze-groundtruth.py`) found **6 761 boards we do not
have** (2 959 Ashby + 3 802 Greenhouse), of which **2 767 Ashby boards had live
jobs (~47 847 postings)** in the snapshot. A sequential live re-verification of
the top-25 new Ashby boards (`.research/reverify-sequential.py` +
`reverify-groundtruth.py`) confirmed **all 25 are live** — the apparent
"JSONDecodeError" failures were just our probe truncating huge boards
(bjakcareer 33 MB, harvey 5 MB); our ATS adapter reads up to `ATS_MAX_BYTES =
40 MB` (`ats.ts:469`) so it handles them. This is a clean, attributed,
robots-respecting way to grow the company catalog by an order of magnitude.

**License**: `directory.json` is MIT (Copyright 2026 Ground Truth) — facts/data
are reusable with attribution. We import the *board mappings* (ats + slug), not
their code. The job-count column is a stale snapshot and is used only to
*prioritize* verification, never trusted as live.

## Current state

- `src/sources/ats-companies.ts` — `ATS_COMPANIES: Partial<Record<AtsProvider, string[]>>`, entries `'slug=Name'`, alphabetical per provider. Counts on 260a650: ashby 313, greenhouse 407 (our probe parsed 306/392 due to a few multi-line entries — reconcile by reading the file, not the probe).
- `src/sources/ats.ts` — `poll()` rotates `nextBatch(source.id, companies, perPoll, …)` with `perPoll` default 5 (max 20), `perCompany` default 100, `maxAgeDays` 30; per-board failures are caught and logged (`ctx.logger.warn('ATS board failed', …)`), so dead boards never break the batch. `ENDPOINTS.ashby` = `https://api.ashbyhq.com/posting-api/job-board/{slug}?includeCompensation=true`; `ENDPOINTS.greenhouse` = `…/v1/boards/{slug}/jobs?content=true`.
- The groundtruth catalog lives at `.research/repos/groundtruth/src/ats_jobs_mcp/directory.json` (cloned, MIT). Shape: `{ "_note": …, "boards": [ { "ats": "ashby"|"greenhouse", "board": "<slug>", "checked": "2026-08-24", "company": <string|null>, "jobs": <int> } ] }`. NOTE: `company` is often null and slugs are case-mixed/duplicated (e.g. `OpenAI`/`openai`) — dedupe case-insensitively.
- `.research/groundtruth-new-boards.json` — precomputed `{ total, live, overlap: 718, new_live_by_provider: {ashby: 2767}, new_live_boards: [...] }` (boards NOT in our catalog, jobs>0). Use it as the candidate seed; re-derive if absent.
- `docs/SOURCES_ROBOTS.md` — Greenhouse/Ashby API rows already exist (allowed). `docs/SOURCE_INDEXING_LOG.md` — journal.

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Typecheck | `pnpm typecheck`         | exit 0, no errors   |
| Tests     | `pnpm test`              | all pass |
| Focused   | `pnpm test -- sources`   | all pass |
| Verify boards | `node scripts/verify-ats-boards.mjs --provider ashby --limit 50` (new script, Step 1) | prints live/dead counts |

## Scope

**In scope**:
- `scripts/verify-ats-boards.mjs` (NEW — offline verification helper, reads a candidate JSON, polls boards sequentially with delay, writes verified slugs)
- `src/sources/ats-companies.ts` (append verified slugs in batches)
- `docs/SOURCES_ROBOTS.md`, `docs/SOURCE_INDEXING_LOG.md` (attribution + import journal)
- `test/sources.test.ts` ONLY if a count assertion needs updating

**Out of scope**:
- `src/sources/ats.ts` — no adapter change needed (rotation + tolerance already handle a large catalog). Do NOT raise `perPoll` globally; a bigger catalog just means more rotations.
- Importing groundtruth *code* (MIT permits it, but we only need the data; keep our clean adapter).
- Greenhouse bulk import in the first pass — the snapshot shows greenhouse `jobs` all 0 (their greenhouse probe didn't capture counts), so verify greenhouse separately/later; start with Ashby where live counts are confirmed.
- Any board whose API disallows us (Ashby/Greenhouse APIs are allowed per existing robots rows; re-confirm if a board returns 403).

## Git workflow

- Branch: `advisor/018-ats-catalog-import`
- Commits: `feat(sources): board verification helper`, `feat(sources): import verified Ashby boards (batch 1)`, `docs(sources): groundtruth catalog attribution and import log`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Build the verification helper

Create `scripts/verify-ats-boards.mjs` (Node, zero new deps, uses global `fetch`):
- Input: a JSON file of candidates `[{ats, slug, jobs, company}]` (default `.research/groundtruth-new-boards.json` → `new_live_boards`), flags `--provider`, `--limit`, `--delay-ms` (default 1200), `--out`.
- For each candidate, GET the provider endpoint (reuse the exact URLs from `ats.ts` ENDPOINTS), read the FULL body (no truncation — boards can be 30 MB+), parse JSON, count jobs. Classify: `live` (jobs>0), `empty` (200, jobs=0), `dead` (404/410), `blocked` (403/CF), `error` (timeout/parse).
- **Sequential with delay** (Ashby rate-limits bursts — our probe proved 6-parallel causes false failures). Honor `Retry-After` on 429 with a cooldown.
- Write `{live:[{slug,name,jobs}], empty:[...], dead:[...], blocked:[...], error:[...]}` to `--out`. `name` = `company` if present else a title-cased slug.
- This script is a maintainer tool, NOT part of the poll loop and NOT run in tests (no network in tests).

**Verify**: `node scripts/verify-ats-boards.mjs --provider ashby --limit 10 --out .research/verify-smoke.json` → prints a summary, `.research/verify-smoke.json` has ≥1 live. (Operator runs this; it makes live calls by design.)

### Step 2: Verify and import Ashby batch 1 (top ~300 by snapshot jobs)

1. Operator runs the helper over the top 300 Ashby candidates by `jobs` (the snapshot prioritizes; live count decides). Expect a high live rate (top-25 was 25/25).
2. Append the `live` slugs to `ATS_COMPANIES.ashby` in alphabetical order, `'slug=Name'`, deduping case-insensitively against existing entries. Skip `empty`/`dead`/`blocked` (log them).
3. Keep batches reviewable: ~300 per commit. The catalog can grow to thousands across batches; each batch is independently shippable.

**Verify**: `pnpm typecheck` → exit 0; `pnpm test -- sources` → all pass.

### Step 3: Attribution + import journal

- In `docs/SOURCE_INDEXING_LOG.md` add an "Импорт каталога борд" section: source = groundtruthtools/ats-jobs-mcp `directory.json` (MIT, Copyright 2026 Ground Truth), snapshot date 2026-08-24, import date, batch sizes, live/empty/dead counts, and the verification method (sequential live API read). Record that job-count snapshots are prioritization-only.
- In `docs/SOURCES_ROBOTS.md` note the catalog provenance under the Greenhouse/Ashby rows (data MIT, boards polled via the same allowed public APIs).
- Add the MIT attribution notice where the repo keeps third-party notices (check `NOTICE`/`THIRD_PARTY`/`package.json` — if none, the indexing-log attribution suffices; do not invent a new license file).

**Verify**: `pnpm test` → all pass.

### Step 4 (optional, later batches): Greenhouse + remaining Ashby

- Greenhouse: the snapshot has no live counts, so run the helper over greenhouse candidates with a smaller `--limit` first to gauge the live rate, then import in batches. Same dedupe/alphabetical rules.
- Continue Ashby beyond batch 1 in subsequent commits. Stop when the live rate drops below ~50% (the tail of the snapshot is stale) and record the cutoff.

**Verify**: `pnpm typecheck && pnpm test` → exit 0.

## Test plan

- No adapter logic changes → existing source tests stay green. The verification helper is excluded from tests (network). If `test/sources.test.ts` asserts a company count, update it.
- Verification: `pnpm typecheck && pnpm test` → all pass.

## Done criteria

- [ ] `pnpm typecheck` exits 0; `pnpm test` exits 0
- [ ] `scripts/verify-ats-boards.mjs` exists and classifies live/empty/dead/blocked
- [ ] ≥1 batch of verified Ashby boards imported (alphabetical, deduped, attributed)
- [ ] Import journal + MIT attribution recorded; dead/blocked boards logged, not imported
- [ ] No adapter (`ats.ts`) change; no files outside scope modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

- The live rate of the top-300 Ashby batch is < 50% (the catalog snapshot may have aged badly — report the measured rate before importing more).
- Ashby/Greenhouse API returns 403/CF for a majority of boards (robots/access changed — re-read robots.txt, report; do not bypass).
- A verification fails twice after a reasonable fix attempt.
- `ats-companies.ts` structure differs from the excerpt (re-read; reconcile).

## Maintenance notes

- The catalog is a living artifact: re-run the helper periodically to (a) add newly-live boards and (b) prune boards that died (the adapter tolerates dead boards, but a clean catalog rotates faster). groundtruth publishes daily `job_changes` snapshots upstream — a future enhancement could diff against those instead of re-polling everything.
- A larger catalog means each company is polled less often (rotation spreads `perPoll` across more boards). If freshness suffers, the operator can raise `perPoll` per-source (config) — that is a tuning decision, not a code change in this plan.
- This is the "hundreds of sources" answer: ~2 767 live Ashby boards available immediately, ~3 802 Greenhouse candidates to verify. Combined with 016/017/019/020 it grows coverage from ~1 100 companies to several thousand, all via allowed public APIs.
- Reviewer: confirm every imported slug was live-verified (not trusted from the snapshot), deduped case-insensitively, and attributed; confirm no groundtruth code was copied.
