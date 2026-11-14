# Plan 017: New source providers (Teamtailor, iCIMS) and curation Telegram channels

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 260a650..HEAD -- src/sources/ats.ts src/sources/ats-companies.ts src/sources/presets.ts src/core/types.ts src/server/ui.ts src/server/app.ts test/sources.test.ts test/ui-signals.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: LOW
- **Depends on**: 016 (it records the TradingView rss stopgap and the blocked-channel evidence this plan builds on)
- **Category**: direction
- **Planned at**: commit `260a650`, 2026-11-11

## Why this matters

The verified probe of the @selflovefeels curation (`.research/`) found companies
on ATS systems OpenRadar does not read: **Teamtailor** (TradingView, 30 live jobs
via `https://tradingview.teamtailor.com/jobs.rss`, robots allows) and **iCIMS**
(Sargent & Lundy, `careers-sargentlundy.icims.com/sitemap.xml`, robots allows job
pages). Both are common Western ATS; adding them as providers unlocks whole
company lists later, the same way greenhouse/ashby/lever did. The curation's 8
Telegram channels were probed too: only **2 are real job channels worth adding**
(dev_connectablejobs 29.1K subs, zarubezhom_jobs 106K subs); 2 are already
covered (devjobs, jobforjunior); 4 are bots/dead/spam (evidence below) — this
plan adds the 2 and records the 4 as rejected so nobody re-probes them.

## Current state

- `src/sources/ats.ts` — `AtsProvider` union + `ATS_PROVIDERS` + `ATS_LABELS` + `ENDPOINTS` (line ~455) + `PARSERS` maps; `poll()` rotates `nextBatch` over `companiesOf(source)`, filters by `maxAgeDays`, tolerates per-board failures. Adding a provider = union entry + label + endpoint + parser (+ fixture test).
- Teamtailor contract (verified 2026-11-11): per-company RSS at `https://{slug}.teamtailor.com/jobs.rss` — RSS 2.0 with `<item><title>`, `<description>` (HTML), `<link>`, `<pubDate>`, plus `tt:` location namespace. Also JSON at `https://{slug}.teamtailor.com/jobs.json` (verify before choosing; prefer the RSS since it is confirmed). robots of tradingview.teamtailor.com: `Disallow: /app/ /messages/ /messenger/ /facebook/tab/ /jobs/internal/` — the feed is allowed; `Content-Signal: search=yes, ai-train=no, ai-input=yes`.
- iCIMS contract (verified): sitemap at `https://careers-{slug}.icims.com/sitemap.xml`; job URLs like `/jobs/{id}/{slug-suffix}/job`. robots allows `/jobs/` except referral/login/candidate paths. NOTE: iCIMS job pages may render via JS — verify one page carries the vacancy in HTML (JSON-LD JobPosting) before writing the parser; if not, STOP and fall back to the sitemap adapter pattern used by career-sites.ts.
- `src/sources/telegram.ts` — public `t.me/s/{channel}` preview adapter, `config.channel`, proxy support. Existing telegram presets live in `presets.ts` (10 channels) — follow their shape.
- `src/server/ui.ts` `KIND_ACCESS` (~197) mirrors adapter kinds; `test/ui-signals.test.ts:45` asserts equality — new providers reuse kind `ats`, so NO ui change is needed for them (verify).
- Probe evidence: `.research/companies-embedded.json` (TradingView teamtailor, Sargent & Lundy icims), `.research/check-tg2.py` output (channel verdicts).

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Typecheck | `pnpm typecheck`         | exit 0, no errors   |
| Tests     | `pnpm test`              | all pass |
| Focused   | `pnpm test -- sources ui-signals` | all pass |

## Scope

**In scope**:
- `src/sources/ats.ts` (teamtailor provider; icims ONLY if the HTML check passes)
- `src/sources/ats-companies.ts` (teamtailor: `tradingview=TradingView`; icims: `sargentlundy=Sargent & Lundy` if added)
- `src/sources/presets.ts` (2 telegram presets; remove the `tradingview-teamtailor` rss stopgap from 016 IF the teamtailor provider lands — keep both only during transition, then drop the rss one)
- `test/sources.test.ts` (provider fixtures), `test/fixtures/` (teamtailor RSS fixture; icims fixture if added)
- `docs/SOURCES_ROBOTS.md`, `docs/SOURCE_INDEXING_LOG.md` (new rows + rejected channels)

**Out of scope**:
- Workday as an ATS provider (016 uses sitemaps; a workday JSON provider is future work — the sitemap approach already works).
- SmartRecruiters (robots conflict — operator decision pending in 016).
- The 4 rejected Telegram channels — do not add them.
- Pipeline/MCP/server beyond what the provider registration requires.

## Git workflow

- Branch: `advisor/017-new-providers`
- Commits: `feat(sources): teamtailor provider (RSS boards)`, `feat(sources): icims provider` (only if HTML check passes), `feat(sources): two verified telegram channels from the curation`, `docs(sources): provider and channel decisions`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Teamtailor provider

1. Verify the JSON endpoint `https://tradingview.teamtailor.com/jobs.json` with one request. If it returns a clean job array, prefer it (structured locations/dates); otherwise use the confirmed RSS.
2. Add `'teamtailor'` to `AtsProvider`, `ATS_PROVIDERS`, `ATS_LABELS` (`Teamtailor`), `ENDPOINTS` (`https://{slug}.teamtailor.com/jobs.rss` or `.json`), and a `fromTeamtailor` parser following `fromLever` style: title, link, description→stripHtml, pubDate→publishedAt, location from `tt:` fields or the description header; `externalId: teamtailor:{slug}:{id-from-link}`; `city`/`isRemote` via the existing `cityFor`/`REMOTE` helpers.
3. The shared `poll()` reads JSON via `fetchBoard` — if you chose RSS, the parser receives XML text; `JSON.parse` is NOT used by the shared path, parsers get the raw string (check `PARSERS` signature — each parser parses its own text). Confirm by reading `fromPersonio` (XML precedent) before writing.
4. Add `tradingview=TradingView` under a new `teamtailor:` block in `ats-companies.ts`.
5. Fixture test in `test/sources.test.ts`: save a trimmed real RSS/JSON response (no personal data) to `test/fixtures/teamtailor-tradingview.xml|json`, mock `fetchImpl`, assert ≥1 RawLead with correct title/url/externalId/publishedAt.

**Verify**: `pnpm typecheck` → exit 0; `pnpm test -- sources ui-signals` → all pass (KIND_ACCESS unchanged — kind stays `ats`).

### Step 2: iCIMS provider (conditional)

1. Fetch `https://careers-sargentlundy.icims.com/jobs/search` and one job page. If the vacancy text is in the HTML (or JSON-LD), proceed; if JS-only, STOP this step, record "icims: нужен браузерный сборщик" in SOURCES_COVERAGE.md, and skip the provider (the sitemap adapter from career-sites.ts may still read titles — evaluate and note).
2. If proceeding: add `'icims'` provider. iCIMS has no simple per-company JSON list like greenhouse; the honest path is the sitemap: `https://careers-{slug}.icims.com/sitemap.xml` → job URLs → fetch each page (bounded by `perPoll`, like career-sites). If that duplicates the sitemap adapter's job, prefer adding `career-sargentlundy` to `career-sites.ts` INSTEAD of a new provider, and record why. Do not build a fragile HTML scraper when the sitemap adapter already does it.

**Verify**: `pnpm typecheck && pnpm test -- sources` → exit 0.

### Step 3: Two Telegram presets

In `presets.ts`, following the existing telegram preset shape:

```ts
{ id: 'tg-dev_connectablejobs', kind: 'telegram', title: 'Telegram — Developer Jobs & Connections', description: 'Публичный канал вакансий для разработчиков (29K+ подписчиков)', config: { channel: 'dev_connectablejobs' } },
{ id: 'tg-zarubezhom_jobs', kind: 'telegram', title: 'Telegram — Работа за рубежом', description: 'Публичный канал вакансий за рубежом и релокации (106K+ подписчиков)', config: { channel: 'zarubezhom_jobs' } },
```

Re-verify both previews return ≥10 messages before inserting (`.research/check-tg.py`).

**Verify**: `pnpm test -- sources` → all pass.

### Step 4: Record rejected channels and provider decisions

In `docs/SOURCE_INDEXING_LOG.md` (blocked/retired section) add the 4 rejected channels with evidence (probed 2026-11-11):
- `g_jobbot` — это бот getmatch («getmatch: бот с IT-вакансиями»), не канал; getmatch уже подключён через sitemap.
- `hh_relocate` — контакт/бот, 0 сообщений в превью.
- `remote_it` — канал продаётся (описание «用户名出售 @NFTStore»), спам.
- `workabroadnow` — туристическое агентство Work Abroad LLC, не job-канал.
And note devjobs/jobforjunior already covered. In `docs/SOURCES_ROBOTS.md` add rows for the new provider addresses (teamtailor feed, icims sitemap if used) and the 2 channels (t.me robots = 404 → allowed, same as existing telegram rows).

**Verify**: `pnpm test` → all pass.

## Test plan

- New: teamtailor fixture test (+ icims only if the provider lands). Zero live network in tests.
- Verification: `pnpm typecheck && pnpm test` → all pass.

## Done criteria

- [ ] `pnpm typecheck` exits 0; `pnpm test` exits 0
- [ ] teamtailor provider + TradingView company + fixture test landed
- [ ] iCIMS either landed with a fixture OR recorded as "needs browser collector" with evidence
- [ ] 2 telegram presets added; 4 rejected channels recorded with reasons
- [ ] TradingView rss stopgap from 016 removed if the provider supersedes it
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

- Teamtailor RSS/JSON shape differs from the verified fixture (re-fetch; report the new shape, do not guess).
- iCIMS pages are JS-only AND the sitemap adapter cannot read titles — record and skip, do not build a headless-browser scraper (AGENTS.md §4: no bot-check bypass).
- A verification fails twice after a reasonable fix attempt.

## Maintenance notes

- Teamtailor is widespread in EU startups; after this lands, a company-list expansion pass (like ats-companies) can add dozens more — each board must be read before it goes in.
- The curation's stale URLs (Hasura→promptql.io, Grammarly→superhuman.com, SGNL→crowdstrike.com) are recorded in 016's log; if any of those companies matter, probe their NEW careers pages separately.
- Reviewer: confirm the teamtailor parser handles the `tt:` location namespace and HTML descriptions; confirm no rejected channel was added.
