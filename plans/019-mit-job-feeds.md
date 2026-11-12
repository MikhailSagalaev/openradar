# Plan 019: Ingest MIT job feeds (Dreamwork ×13, Jobbie) as sources

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 260a650..HEAD -- src/sources/json-board.ts src/sources/presets.ts src/sources/json-boards.ts src/core/types.ts test/sources.test.ts docs/SOURCES_ROBOTS.md`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: 016 (shared `presets.ts`/docs; disjoint regions)
- **Category**: direction
- **Planned at**: commit `260a650`, 2026-11-11

## Why this matters

Two competitor projects publish **MIT-licensed daily job feeds** that are ready
to ingest with no scraping:

1. **Dreamwork** — 13 public repos `dreamworkhq/*-Jobs` (Remote-Tech-Jobs,
   AI-ML-Jobs, Tech-Internships-2027, New-Grad-SWE, Cybersecurity,
   Data-Engineering, Data-Science, DevOps-SRE-Cloud, Frontend-React,
   Python-Developer, Senior-SWE, Open-Tech-Internships-2027, …). Each has
   `data/listings.json`, auto-committed daily. Verified shape
   (`.research/repos/dreamwork-remote-tech-jobs/data/listings.json`, MIT
   Copyright 2026 Dreamwork): top-level `{generatedAt, source, list, count,
   listings:[…]}`, **600 rows**, fields `id, title, company, companyDomain,
   location, remoteType, salaryMin, salaryMax, salaryPeriod, aiRoleKind,
   postedAt, firstIndexedAt, url`.
2. **Jobbie** — `jobbie-bot/Summer-2027-Tech-Internships` (MIT, rebuilt every
   6 h): a README markdown table, **280 rows**, with **direct employer links**
   (job-boards.greenhouse.io, jobs.ashbyhq.com, jobs.lever.co, *.myworkdayjobs.com,
   apply.workable.com). Verified in `.research/repos/jobbie/README.md`.

**Critical caveat discovered by probing**: every Dreamwork `url` points to
`https://www.dreamworkhq.com/job/{id}?utm_source=github&utm_campaign=gh-…` —
their **tracking redirect**, NOT the employer's original page (all 600/600).
Jobbie's links ARE direct to the employer. OpenRadar's ethic is "keep the
original link" (`toPublicLead`, AGENTS.md §4), so the two feeds need different
treatment: Jobbie ingests as-is; Dreamwork either (a) keeps the redirect with
honest attribution, or (b) resolves the original via `companyDomain` + our ATS
catalog. This plan does (a) for Dreamwork v1 (simple, honest) and records (b)
as a follow-up; it does NOT silently present a tracking link as the original.

## Current state

- `src/sources/json-board.ts` — declarative `jsonBoardSource` (kind `json`). `JsonBoardConfig`: `url`, `list` (path to array), `id`, `title`, `text[]`, `link` (template `{field}`), `company`, `city`, `published`, `salaryMin/Max`, `currency`, `format`, `maxAgeDays`, `detail`/`detailRoot` (optional per-item fetch). `leadFromItem` builds `externalId: json:{host}:{id}`, `url: fillTemplate(config.link, item)`. `payText` assumes **monthly RUB** (`… в месяц`) — Dreamwork salaries are annual/USD with `salaryPeriod`, so salary mapping needs care (see Step 2).
- `src/sources/json-boards.ts` — `JSON_BOARD_PRESETS` (Sber, Wildberries, Magnit Tech, …), each `{ id, kind:'json', title, description, config: JsonBoardConfig }`.
- `src/sources/presets.ts` — aggregates presets; rss presets `{id, kind:'rss', config:{url}}`.
- Dreamwork raw JSON is hosted at `https://raw.githubusercontent.com/dreamworkhq/<Repo>/main/data/listings.json` (verify the exact branch/path per repo before adding). robots of raw.githubusercontent.com: allowed (static file host).
- Jobbie is a markdown table, not JSON — the json adapter cannot read it directly (see Step 3).

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Typecheck | `pnpm typecheck`         | exit 0, no errors   |
| Tests     | `pnpm test`              | all pass |
| Focused   | `pnpm test -- sources`   | all pass |

## Scope

**In scope**:
- `src/sources/json-boards.ts` (Dreamwork presets)
- `src/sources/json-board.ts` ONLY if a minimal, backward-compatible salary-period/currency enhancement is needed (Step 2) — otherwise leave untouched
- `src/sources/presets.ts` (if a Jobbie rss/other preset is added)
- `test/sources.test.ts` + `test/fixtures/` (Dreamwork fixture; salary-period test if enhanced)
- `docs/SOURCES_ROBOTS.md`, `docs/SOURCE_INDEXING_LOG.md`

**Out of scope**:
- Resolving Dreamwork redirects to employer originals (follow-up; needs per-company ATS lookup — do not build it here).
- A markdown-table parser for Jobbie in the core (Step 3 evaluates the cheapest honest path; if it needs a new adapter, defer to its own plan).
- Any non-MIT feed (Simplify listings have NO license — excluded).
- Pipeline/MCP/server.

## Git workflow

- Branch: `advisor/019-mit-job-feeds`
- Commits: `feat(sources): Dreamwork MIT job feeds as json presets`, `test(sources): dreamwork feed fixture`, `docs(sources): MIT feed attribution and redirect caveat`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Verify feed URLs and add 2–3 Dreamwork presets (pilot)

1. Confirm the raw URL for `Remote-Tech-Jobs`, `AI-ML-Jobs`, `Senior-SWE` (one GET each): `https://raw.githubusercontent.com/dreamworkhq/<Repo>/main/data/listings.json` returns the `{listings:[…]}` shape. Record the exact branch (`main`/`master`) per repo.
2. Add presets to `JSON_BOARD_PRESETS` (pilot 3; the other 10 follow the same shape once proven):

```ts
{
  id: 'dreamwork-remote-tech', kind: 'json',
  title: 'Dreamwork — Remote Tech Jobs',
  description: 'Ежедневный MIT-фид удалённых tech-вакансий (dreamworkhq). Ссылка ведёт на карточку Dreamwork, не на оригинал работодателя.',
  config: {
    url: 'https://raw.githubusercontent.com/dreamworkhq/Remote-Tech-Jobs/main/data/listings.json',
    list: 'listings', id: 'id', title: 'title',
    text: ['company', 'location', 'aiRoleKind'],
    link: '{url}', company: undefined, city: 'location',
    published: 'postedAt', format: 'remoteType',
    maxAgeDays: 14,
  },
},
```

NOTE: `company` in the config is a static string; Dreamwork's company is per-row (`company` field). The json adapter sets `author: config.company` (static). To carry the per-row company, either (a) add `company` to `text[]` so it appears in the body (done above) and accept `author` undefined, or (b) make a minimal enhancement so `config.company` can be a `{field}` template resolved per row (Step 2 option). Prefer (a) for v1 — no adapter change.

**Verify**: `pnpm typecheck` → exit 0; `pnpm test -- sources` → all pass.

### Step 2: Salary handling (decide, minimal)

Dreamwork `salaryMin/Max` are annual USD with `salaryPeriod` (`year`/`hour`/null). The json adapter's `payText` hardcodes `… {currency} в месяц` (monthly RUB) — mapping annual USD into it would be **wrong** (violates the salary-quality invariant from plans 001–006). Choose ONE:
- **(a) v1: omit salary** — do not set `salaryMin/Max` in the Dreamwork config; salaries are mostly null anyway (verified). Simplest, no adapter change, no wrong pay. **Recommended.**
- (b) Enhance `JsonBoardConfig` with optional `salaryPeriod` + per-row currency, and make `payText` period-aware (monthly/yearly/hourly) with a backward-compatible default. Only if the operator wants Dreamwork salaries; add a fixture test proving annual USD is not labeled monthly.

**Verify**: `pnpm test -- sources` → all pass (and the new salary test if (b)).

### Step 3: Jobbie — evaluate the cheapest honest path

Jobbie is a markdown table with direct employer links. Options, in order of preference:
1. Check if Jobbie also publishes a JSON/CSV artifact (inspect the repo `.github/workflows` and any `data/` file). If a machine-readable feed exists, add it as a json/rss preset like Dreamwork.
2. If only markdown: the links are mostly greenhouse/ashby/lever/workday — i.e. the SAME boards our ATS adapter already reads. The honest, zero-new-code move is to **extract the company slugs from Jobbie's links and feed them into the ATS catalog** (plan 018's helper), rather than parse markdown. Record this in the indexing log; do not build a markdown scraper in core.
3. If neither fits, defer Jobbie to its own plan (a small markdown-table adapter) — do not improvise here.

**Verify**: decision recorded in `docs/SOURCE_INDEXING_LOG.md`; no half-built parser left in core.

### Step 4: Attribution + caveat docs

- `docs/SOURCE_INDEXING_LOG.md`: Dreamwork feeds (MIT, Copyright 2026 Dreamwork), the 13 repo names, raw URLs, **the redirect caveat** (url → dreamworkhq tracking, not original), and the follow-up to resolve originals via companyDomain. Jobbie decision from Step 3.
- `docs/SOURCES_ROBOTS.md`: raw.githubusercontent.com row (allowed, static host) + the Dreamwork/Jobbie provenance.
- MIT attribution where third-party notices live (same place as plan 018).

**Verify**: `pnpm test` → all pass.

## Test plan

- New: a Dreamwork fixture (trim a real `listings.json` to ~5 rows, no personal data) in `test/fixtures/`, mock `fetchImpl`, assert the json adapter produces RawLeads with correct title/externalId/publishedAt/isRemote and that `url` is the Dreamwork card (documented behavior). If Step 2(b), add the salary-period test.
- Verification: `pnpm typecheck && pnpm test` → all pass.

## Done criteria

- [ ] `pnpm typecheck` exits 0; `pnpm test` exits 0
- [ ] ≥2 Dreamwork presets added with a fixture test; salary NOT mislabeled (omitted or period-correct)
- [ ] Redirect caveat documented; original-resolution recorded as follow-up
- [ ] Jobbie path decided and recorded (no abandoned parser in core)
- [ ] MIT attribution present; no non-MIT feed added
- [ ] No files outside scope modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

- A Dreamwork raw URL 404s or the shape differs from `{listings:[…]}` (re-fetch; report the new shape/branch, do not guess).
- The json adapter cannot represent the feed without a non-trivial change (report; prefer deferring over a risky adapter rewrite).
- Salary mapping would label annual/hourly pay as monthly (STOP — that regresses plans 001–006; omit salary instead).
- A verification fails twice after a reasonable fix attempt.

## Maintenance notes

- Dreamwork commits daily; `maxAgeDays: 14` keeps the flow fresh. The feed is a *supplement* (international remote/US internships), not a replacement for our RU/CIS moat.
- Follow-up (own plan): resolve Dreamwork `companyDomain` → our ATS catalog slug → original employer URL, so the lead link is the original (ethic-aligned). Until then the description must keep saying the link is a Dreamwork card.
- The 13 feeds overlap heavily (same jobs across category repos); dedup (MinHash + externalId) handles cross-feed duplicates, but consider enabling only 3–4 complementary feeds to avoid noise.
- Reviewer: confirm no annual salary is labeled monthly; confirm the redirect caveat is in the preset description and docs; confirm only MIT feeds were added.
