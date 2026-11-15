# Plan 016: Expand source coverage from the @selflovefeels curation (verified adds)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 260a650..HEAD -- src/sources/ats-companies.ts src/sources/career-sites.ts src/sources/presets.ts src/sources/ats.ts docs/SOURCES_ROBOTS.md docs/SOURCE_INDEXING_LOG.md`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none (independent of 007–015; shares `presets.ts`/`career-sites.ts` with 015 only in disjoint regions)
- **Category**: direction
- **Planned at**: commit `260a650`, 2026-11-11

## Why this matters

The user supplied the original curation behind the competitor report:
`Job_Search_Resources main.pdf` (Aleksandra Magaramova, 12.03.2026, 6 pages) —
**78 platforms + 122 actively-hiring companies**, extracted to
`.research/job-search-resources-pdf.txt`. A live probe on 2026-11-11
(`.research/probe-ats.py`, `verify-ats.py`, `probe-embedded.py`,
`probe-boards.py`, `check-robots.py`) matched all 122 companies against our
catalogs: **48 already covered**, and **16 companies with verified live public
ATS boards are missing** (678 open jobs total), plus 4 companies on systems we
do not read yet (Teamtailor, Workday ×2, iCIMS) and 1 new RSS board. This plan
adds exactly the verified set — no guesses, no robots violations.

The probe also surfaced a **pre-existing robots conflict**: `api.smartrecruiters.com/robots.txt`
now reads `User-agent: LinkedInBot / Allow: /v1/companies/` + `User-agent: * / Disallow: /`,
while `src/sources/ats.ts:459` polls that API and `ats-companies.ts` lists 9
SmartRecruiters companies (Wise 441 jobs, ServiceNow 788 — both still answer 200).
Per AGENTS.md §4 and `docs/SOURCES_ROBOTS.md` policy we do not bypass robots;
this plan records the conflict and the operator decision, it does not silently
keep or silently drop the source.

## Current state

- `src/sources/ats-companies.ts` — `ATS_COMPANIES: Partial<Record<AtsProvider, string[]>>`, entries `'slug=Name'`. Counts on 260a650: ashby 313, greenhouse 407, lever 149, recruitee 206, workable 6, smartrecruiters 9, bamboohr 2, personio 5. Comment: "Each board was read before it went in."
- `src/sources/ats.ts:459` — SmartRecruiters endpoint `https://api.smartrecruiters.com/v1/companies/{slug}/postings?limit=100`; `ATS_PROVIDERS` = greenhouse, lever, ashby, workable, recruitee, smartrecruiters, pinpoint, bamboohr, personio. No teamtailor/icims.
- `src/sources/career-sites.ts` — `SITES: CareerSite[]` (41 entries): `sitemap` or `list` + `pattern` (first group = key) + `company: true`. Workday precedents: `career-crowdstrike` (`crowdstrike.wd5.myworkdayjobs.com/crowdstrikecareers/siteMap.xml`, pattern `/job/[^/]+/([^/]+)`), `career-intapp`. Presets built with `perPoll: 10, delayMs: 1500, maxAgeDays: 30`.
- `src/sources/presets.ts` — `BASE_PRESETS` + `CAREER_SITE_PRESETS` + `HH_EMPLOYER_PRESETS` + `JSON_BOARD_PRESETS`; rss presets are `{ id, kind: 'rss', title, description, config: { url } }`.
- `docs/SOURCES_ROBOTS.md` — policy table + "Решения" section; entries marked "ждёт решения оператора" exist (FL.ru, hh.ru, trudvsem). `docs/SOURCE_INDEXING_LOG.md` — indexed/blocked/retired journal.
- Verified probe artifacts (read them, do not re-probe blindly): `.research/sources-to-add.json` (consolidated), `.research/companies-ats-verified.json`, `.research/companies-embedded.json`, `.research/boards-rss-probe.json`.

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Typecheck | `pnpm typecheck`         | exit 0, no errors   |
| Tests     | `pnpm test`              | all pass (baseline: 82 files, 690 tests + earlier plans) |
| Focused   | `pnpm test -- sources ui-signals` | all pass |
| Robots audit | `pnpm build && node bin/radar.js robots --markdown` | prints table; new entries present |

## Scope

**In scope** (the only files you should modify/create):
- `src/sources/ats-companies.ts` (add verified slugs to greenhouse/ashby/lever)
- `src/sources/career-sites.ts` (add Workday ×2 + TradingView via teamtailor RSS is NOT here — see Step 3)
- `src/sources/presets.ts` (SwissDevJobs rss preset; TradingView rss preset)
- `docs/SOURCES_ROBOTS.md` (new rows + SmartRecruiters conflict decision row)
- `docs/SOURCE_INDEXING_LOG.md` (indexed + blocked entries)
- `test/sources.test.ts` ONLY if an existing assertion enumerates companies/presets and needs the new entries

**Out of scope** (do NOT touch):
- `src/sources/ats.ts` — no new providers in this plan (teamtailor/icims adapters are plan 017).
- SmartRecruiters company list — frozen pending operator decision (Step 4).
- Pipeline, MCP, server, extension — nothing downstream changes.
- Any source whose robots.txt disallows the polled address (Gun.io `/feed/`, SmartRecruiters API for non-LinkedIn bots).

## Git workflow

- Branch: `advisor/016-source-expansion`
- Commits: `feat(sources): 16 verified ATS companies from the selflovefeels curation`, `feat(sources): Workday sitemaps + SwissDevJobs/TradingView feeds`, `docs(sources): robots decisions and indexing log for the expansion`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add the 16 verified ATS companies

In `src/sources/ats-companies.ts`, insert in alphabetical order within each provider block (entries verified live 2026-11-11, job counts in `.research/companies-ats-verified.json`):

- greenhouse: `gensyn=Gensyn`, `innovecs=Innovecs`, `lokalise=Lokalise`, `pandadoc=PandaDoc`, `tamara=Tamara`, `zscaler=Zscaler`
- ashby: `buffer=Buffer`, `checkly=Checkly`, `cointracker=CoinTracker`, `haus=Haus`, `nousresearch=Nous Research`, `productwind=ProductWind`, `snyk=Snyk`, `wonderful=Wonderful`
- lever: `brevo=Brevo`, `contentsquare=Contentsquare`

Before inserting, re-verify each board with ONE request (the probe scripts are in `.research/`); a board that now returns 0 jobs or 404 is skipped and noted in the indexing log (boards close — the ATS adapter already tolerates this, but the catalog rule is "read before it went in").

**Verify**: `pnpm typecheck` → exit 0; `pnpm test -- sources` → all pass.

### Step 2: Workday sitemaps (Abbott, Elevance Health)

In `src/sources/career-sites.ts` `SITES`, following the `career-crowdstrike` pattern exactly:

```ts
{ id: 'career-abbott', name: 'Abbott', sitemap: 'https://abbott.wd5.myworkdayjobs.com/abbottcareers/siteMap.xml', pattern: String.raw`/job/[^/]+/([^/]+)`, company: true },
{ id: 'career-elevance', name: 'Elevance Health', sitemap: 'https://elevancehealth.wd1.myworkdayjobs.com/ANT/siteMap.xml', pattern: String.raw`/job/[^/]+/([^/]+)`, company: true },
```

Both robots.txt explicitly `Allow` the polled paths (verified). NOTE: these are healthcare/insurance employers — most postings are non-IT; the pipeline's IT/role classification already handles mixed boards (same as Siemens-class sites). Keep `maxAgeDays: 30` default; consider `maxPages: 300` for Abbott if the sitemap is huge (check its size first; the preset builder applies maxPages only when set).

**Verify**: `pnpm typecheck` → exit 0; `pnpm test -- sources` → all pass.

### Step 3: Two RSS presets (SwissDevJobs, TradingView via Teamtailor)

In `src/sources/presets.ts` `BASE_PRESETS`:

```ts
{ id: 'swissdevjobs', kind: 'rss', title: 'SwissDevJobs — IT-вакансии Швейцарии', description: 'Официальный RSS-фид IT-вакансий Швейцарии (swissdevjobs.ch)', config: { url: 'https://swissdevjobs.ch/rss' } },
{ id: 'tradingview-teamtailor', kind: 'rss', title: 'TradingView — Вакансии', description: 'RSS карьерной доски TradingView (Teamtailor)', config: { url: 'https://tradingview.teamtailor.com/jobs.rss', company: 'TradingView' } },
```

Check how existing rss presets pass `company` (see `HH_EMPLOYER_PRESETS` — `config.company`); if the rss adapter ignores `company`, omit it (the feed titles carry the company). Robots verified: swissdevjobs.ch allows `/rss`; tradingview.teamtailor.com allows the feed (`Content-Signal: search=yes`).

**Verify**: `pnpm test -- sources` → all pass.

### Step 4: Record the SmartRecruiters robots conflict (operator decision)

Do NOT change the smartrecruiters company list or endpoint in this plan. In `docs/SOURCES_ROBOTS.md`:
1. Add a row for `api.smartrecruiters.com` with the current robots text (`User-agent: LinkedInBot / Allow: /v1/companies/`, `User-agent: * / Disallow: /`), marked **запрещено для RadarBot**.
2. In "Решения", add: "**ATS — SmartRecruiters (9 компаний, включая Wise и ServiceNow)** — robots.txt с 2026 года разрешает API только LinkedInBot. Решение: _ждёт решения оператора_ (варианты: отключить провайдер; читать публичные HTML-страницы jobs.smartrecruiters.com, если их robots позволит — проверить отдельно; запросить разрешение у SmartRecruiters). Новые компании (Alten 1265, Experian 398, Joom 2 — проверены, ответы 200) НЕ добавлять до решения."

Mirror the entry in `docs/SOURCE_INDEXING_LOG.md` (status `blocked`, reason robots, date 2026-11-11, probe evidence path `.research/companies-ats-verified.json`).

**Verify**: docs render as valid Markdown tables (existing test `test/` may lint docs — run `pnpm test`).

### Step 5: Indexing log + robots rows for everything added/blocked

In `docs/SOURCE_INDEXING_LOG.md` add:
- indexed: the 16 ATS companies (one grouped row per provider), Abbott/Elevance Workday sitemaps, SwissDevJobs, TradingView Teamtailor RSS — with verification date and job counts.
- blocked/retired (from `.research/sources-to-add.json` and `companies-embedded.json`): Gun.io (robots Disallow /feed/), the 45 careers pages with no public ATS signal or 403/404 (list them compactly with status), Hasura→promptql.io redirect, Grammarly→superhuman.com redirect, SGNL→crowdstrike.com redirect (the curation's URLs are stale — record the redirects so nobody re-probes blindly).
- In `docs/SOURCES_ROBOTS.md` add rows for the new polled addresses (swissdevjobs.ch/rss, tradingview.teamtailor.com/jobs.rss, the two Workday sitemaps) with their robots verdicts.

**Verify**: `pnpm test` → all pass; `node bin/radar.js robots --markdown` (after `pnpm build`) lists the new sources without errors.

## Test plan

- No new adapter code → no new unit tests required beyond keeping existing ones green. If `test/sources.test.ts` or `test/ui-signals.test.ts` enumerates preset/company counts, update the expectation.
- Manual smoke (operator, optional): enable the new presets on a dev node, confirm leads arrive and `source health` shows the new sources OK.
- Verification: `pnpm typecheck && pnpm test` → all pass.

## Done criteria

- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm test` exits 0
- [ ] 16 verified companies present in `ats-companies.ts` (or skipped with a logged reason if a board died since the probe)
- [ ] Abbott + Elevance in `career-sites.ts`; SwissDevJobs + TradingView presets in `presets.ts`
- [ ] SmartRecruiters conflict recorded in both docs, company list untouched
- [ ] Gun.io and the dead/redirected careers pages recorded as blocked/retired
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

- A listed board returns 0 jobs / 404 on re-verification AND more than 3 of the 16 fail (the curation may have aged — report, do not guess replacements).
- `api.smartrecruiters.com` robots text differs from the excerpt (re-read it; if it now allows `*`, the conflict step becomes "add Alten/Experian/Joom" — report the change first).
- Workday sitemap pattern does not match real URLs (fetch one page, confirm JSON-LD JobPosting or HTML title extraction works like crowdstrike; if not, move the entry to "нужен адаптер" in SOURCES_COVERAGE.md and skip).
- A verification fails twice after a reasonable fix attempt.

## Maintenance notes

- The full probe evidence lives in `.research/` (gitignored-style working dir; do not commit it). If `.research/` is absent at execution time, re-run `.research/probe-ats.py`-equivalent checks from the consolidated list in this plan before inserting.
- Deferred to plan 017: Teamtailor as a first-class ATS provider (RSS per company), iCIMS adapter, Workday as an ATS provider (instead of sitemap), the 8 Telegram channels from the curation (2 already covered: devjobs, jobforjunior; 6 new: g_jobbot, remote_it, hh_relocate, workabroadnow, dev_connectablejobs, zarubezhom_jobs — public t.me/s/ previews, same model as existing telegram presets).
- Deferred: HTML-only boards from the curation (JustRemote, SkipTheDrive, AIJobs, JSRemotely, IamExpat…) — need the sitemap/json-board treatment or the browser collector; each requires its own robots check first.
- Reviewer: confirm every added address was actually fetched (job count > 0 or feed items > 0) and robots allows it; confirm no SmartRecruiters company was added.
