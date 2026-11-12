# Implementation Plans

Two generations live here:

- **001–006** — generated 2026-11-09 against `f02a024` (v0.41.2), research/salary quality. Rechecked against `260a650` (v0.67.0) on 2026-11-13: all six are covered upstream (chiefly `e6f7855`), in evolved form where noted in the status rows. Nothing was re-fixed. The only unadopted item is plan 006's optional `experienceYears` groundwork field (forward-looking, not a bug).
- **007–015** — generated 2026-11-11 against `260a650` (v0.67.0) after a four-auditor review (correctness, security, performance/architecture, tests/DX) with every finding re-verified against `origin/main`. Execute in the order below unless dependencies say otherwise. Each executor reads one plan fully, honors its STOP conditions, and updates its row when done.
- **016–021** — generated 2026-11-11 against `260a650` (v0.67.0) from the @selflovefeels curation (`Job_Search_Resources main.pdf`, 78 platforms + 122 companies) and a deep read of competitor public repos. Every added source was probed live (job count > 0 / feed items > 0) and robots-checked; evidence in `.research/`. These are the "hundreds of sources" + architecture-borrowing track. License isolation is strict: OpenPostings (no LICENSE), JobOps (Commons Clause), recruiters.rip (BSL until 2030), Simplify listings (no LICENSE) → ideas only, no code. MIT donors: JobSpy, Dreamwork MCP + 13 job feeds, groundtruth board catalog (7 479 boards), Jobbie feed, Four-Leaf client.

The live site `openradar.fun` may run a different build than this checkout. If a drift check shows identifiers absent from this tree (e.g. `ciLow`, `ciHigh`, `adjusted` in `/research/report.json`), stop and reconcile; do not delete them to match a plan.

## Execution order and status

| Plan | Title | Priority | Effort | Depends on | Status |
|------|-------|----------|--------|------------|--------|
| 001 | Stop ad spend and client budgets from becoming pay | P1 | M | — | DONE upstream — `maskNotPaySentences` in salary.ts (ad spend/budgets/turnover masked), `updateLeadMoney` + rescore `moneyOf` reparse text budgets, DAY×21/WEEK×4.33 in facts.ts, PLN/h hourly; tests feed-quality-2026-11 + salary.test |
| 002 | Stop English prose from becoming skills | P1 | S | — | DONE upstream — Swift needs capitalized token or iOS/Xcode context, `\bps\b` removed, illustration narrowed, `bitrixIsSkill` partner rule; tests feed-quality-2026-11 |
| 003 | Stop adapter labels from marking English posts as Russian | P1 | S | — | DONE upstream — `titleForLanguage` in text.ts used by memory store + filters, postgres strips Компания/Город labels in the language condition, `Город` in cleanTitle |
| 004 | Stop publishing mixed-period and mislabeled research claims | P1 | M | — | DONE upstream (evolved) — research query drops channel_ad/digest/mlm in both stores; cartaCapital on gigs-only project pay; taskTransformation kept but rebuilt (word-boundary regexes, no Math.max clamp) and relabeled «разница в цене разных работ, а не надбавка за навык»; methodology rewritten honestly (CBR rate, order-statistic CIs, no OLQI/CLT claims); REPORT_VERSION 2 |
| 005 | Make skill counts follow the active filters, and split budget steps | P2 | M | 002 | DONE upstream — `popularSkills(filters)` with per-filter cache key + matchesSavedFilters, `budgetStepsFor(type)` job/gig scales wired into ui.ts |
| 006 | Publish a composition-stable weekly pay index and label one-sided ranges | P2 | L | 004 | DONE upstream (evolved) — `compositionIndex` Laspeyres basket (≥30/role, ≥10/week) published as `weeklyIndexed` with chart caption; one-sided ranges surfaced as `jobs.bounds` counts + range-only median instead of per-bound dists; `experienceYears` groundwork field not adopted (optional, no user-visible defect) |
| 007 | Make the machine-readable docs tell agents the truth | P1 | S | — | DONE — /mcp described as POST with JSON-RPC requestBody; llms.txt lists all 9 real tools; 3 drift-proof contract tests (693 total) |
| 008 | Close the small correctness holes (SimilarIndex, digest, title, vote race, dead code) | P1 | S | — | DONE — loader promise resets on rejection (+retry test); digest watermark moves only on success/nothing_new (+4 tests); title lookbehind keeps the glued letter (+test); updateLeadScore now BEGIN+FOR UPDATE (interleaving test needs Postgres, unavailable locally — structural fix verified by typecheck+store tests); dead return removed (699 total) |
| 009 | Make outbox delivery exactly-once and align the two stores | P1 | M | 008 (same file) | DONE — migration 039 lease column; atomic claim UPDATE (real FOR UPDATE SKIP LOCKED) in both stores; inline ingest claims its lead's rows; processOutbox leases 15 min; memory title-key any-city parity; delivered_at COALESCE in both branches; lead.deleted event → similar.remove; +4 tests (703 total). Postgres-mode suite not run locally (no server) |
| 010 | Close the five security gaps (extension hijack, author, logout, proxy trust, cookie Secure) | P1 | M | — | DONE — connect flow nonce (single-use, popup-generated) + https/loopback-only base gate before radarAccount write; author always from session on /submit and /api/submit; logout is same-origin POST (menu form button, CSP-safe); RADAR_TRUSTED_PROXY gates XFF/X-Real-IP rate-limit keys (default off, one shared bucket); cookie Secure from RADAR_PUBLIC_URL/NODE_ENV + one production warning when public URL unset; +8 tests (711 total), pack:extension ok |
| 011 | Ship the job-hunt skill and a complete server.json | P1 | M | 007 | TODO |
| 012 | Make hub events durable and drain in-flight work on shutdown | P1 | M | 009 | TODO |
| 013 | Remove the hot-path performance bottlenecks | P2 | L | 008, 012 | TODO |
| 014 | Add the verify toolchain and document the retention knob | P2 | S | — | DONE — `pnpm verify` (lint+version+typecheck+build+test+python) exit 0; lint = oxlint (typescript-eslint does not support the repo's TS 7.0 — deviation from plan, 8 baseline rules disabled in .oxlintrc.json as debt); CI lint step added; RADAR_RETENTION_DAYS documented in .env.example + AGENTS.md; no src/test edits |
| 015 | Add Firecrawl Alexandria as an opt-in international job source | P2 | M | — | DONE — adapter (auth-required, env-only key, SSRF guard, maxResults≤100 + lastDays clamps, creditsCost logged), registry+KIND_ACCESS+form+preset alexandria-jobs, .env.example docs, 6 zero-network tests on the verified smoke shape; 718 tests green |
| 016 | Expand source coverage from the @selflovefeels curation (verified adds) | P2 | M | — | DONE — 16 ATS companies re-verified live 2026-11-13 (Brevo back at 27 jobs), Abbott+Elevance Workday sitemaps (JSON-LD confirmed), SwissDevJobs+TradingView rss presets; SmartRecruiters robots conflict recorded (list frozen, operator decision); rejected/dead/redirected addresses journaled; 711 tests green |
| 017 | New source providers (Teamtailor, iCIMS) and curation Telegram channels | P3 | M | 016 | DONE (partial by design) — teamtailor provider live (JSON Feed + `_jobposting`, fixture+test, TradingView 29 jobs; transitional rss preset removed); tg-ai-ml-bigdata added (20 posts); @it_jobsfeed dead (retired); iCIMS contract verified (20 job links) but adapter deferred — single company, no confirmed demand; 712 tests green |
| 018 | Import the MIT groundtruth ATS board catalog (hundreds of companies) | P2 | L | 016 | DONE — `scripts/verify-ats-boards.mjs` (sequential, full-body, 429 cooldown); Ashby batch 1 live-verified 295/300 (98.3%), catalog 314→609; 3 dead + 2 empty logged, MIT attribution in indexing log + SOURCES_ROBOTS; no ats.ts change; batches 2+ (≈2400 Ashby, ≈3800 Greenhouse) remain operator-run |
| 019 | Ingest MIT job feeds (Dreamwork ×13, Jobbie) as sources | P2 | M | 016 | DONE — 3 Dreamwork presets (annual USD via new per-row `salaryPeriod`, tracking-card caveat in description) + Jobbie public JSON feed (`apply_url` original links, verbatim hourly `salary` field, tech includeKeywords); json-board currency passthrough; 2 fixtures + 3 tests, salary never mislabeled monthly; MIT attribution recorded |
| 020 | Add verified CIS/EU RSS boards (Djinni, DOU, hh.kz, hh.ge, Zarplata, Jobindex, JSJobbs, Virtual Vocations) | P2 | S | — | DONE — 8 presets live-verified 2026-11-13 (items 20–100 each), robots read for all (hh-family `/rss/*` does not cover `/search/vacancy/rss`); robots rows + indexing log; 711 tests green. SwissDevJobs left to 016 |
| 021 | Borrow competitor architecture: explainable scoring, freshness, MCP safety-ladder, visa-sponsor enrichment | P3 | L | 008, 011 | TODO |

Status values: TODO | IN PROGRESS | DONE | BLOCKED (one-line reason) | REJECTED (one-line rationale) | NEEDS-RECHECK (written against an older commit; verify before executing)

## Dependency notes

- 007 and 008 are independent S-fixes; run them first (007 unblocks 011's truthful tool names; 008 stabilizes SimilarIndex before 009/013 touch it).
- 009 edits `updateLeadStatus`/delivery in `postgres.ts`; 008 edits `updateLeadScore` in the same file — run 008 first or rebase carefully.
- 010 is independent of the correctness series (different files except `app.ts`; coordinate with 009's single emit line and 015's form branch — all touch `app.ts` in disjoint regions).
- 012 needs 009's leases so the drain has something coherent to wait for; 012 also adds the first runner tests, which 013 relies on.
- 013 is the L-effort perf series; each of its 5 steps is independently shippable — an executor may stop after any step and mark the plan IN PROGRESS with the completed steps listed.
- 014 and 015 are independent; 015 can run in parallel on a separate branch (it only shares `app.ts`/`ui.ts` form regions with 010 — disjoint).
- Recommended branch per plan: `advisor/NNN-<slug>`. Commit style matches the repo: `fix(similar): reset the cached loader promise when loading fails`. Do not push and do not open a PR unless the operator asks.
- Migration numbering: 009 creates 039, 013 creates 040 — if both run, check `ls migrations/` and renumber the later one.
- 016–020 are the source-expansion track (independent of the 007–015 correctness/security series except where noted). 016 is the entry point (verified company adds + the SmartRecruiters robots decision); 017/018/019 build on it. 020 is independent S-effort (pure RSS presets). 021 is the architecture-borrowing track and depends on 008 (scoring/dedup stability) and 011 (MCP surface). All source plans honor AGENTS.md §4 robots discipline; none may bypass logins/CAPTCHA/bot-checks.

## What the 007–015 series fixes

Agents breaking on first call because OpenAPI describes `/mcp` as GET and llms.txt names a nonexistent tool (007). A single DB blip permanently poisoning similar-text dedup; a failed digest silently eating its window; the title cleaner clipping the last letter before a glued metadata label; a vote erased by a concurrent rescore (008). Duplicate Telegram/webhook deliveries because the outbox row lock is a no-op, and memory/Postgres stores disagreeing on dedup and delivered_at (009). Any website hijacking the browser extension's stored account; author spoofing on web submits; cross-site force-logout; rate-limit bypass via a spoofable header; cookies without Secure behind a misconfigured proxy (010). No packaged agent workflow and a registry manifest that hides the self-hosted stdio package (011). Hub observations and rating points lost forever when ingestion fails after the event commit; SIGTERM killing in-flight deliveries (012). BigInt MinHash on the hottest path, per-lead N+1 rating recompute, serial dedup SELECTs, per-stream SSE polling, unindexed budget sort (013). No one-command local CI reproduction and an undocumented permanent-deletion knob (014). The international corporate vacancy coverage gap versus Firecrawl, closed opt-in with the operator's own key (015).

## Findings considered and rejected

- **Localhost CSRF allowance (security audit S6)**: already fixed upstream — `sameOrigin` (app.ts:485–519) only accepts loopback origins when the request's own Host is loopback. Do not "harden" it again.
- **Telegram master-secret fallback**: removed upstream ("No built-in fallback key in any mode"); the local v0.41.2 finding is obsolete.
- **Rescore offset clamp infinite loop**: fixed upstream via `createdBefore` keyset pagination; obsolete on v0.67.0.
- **Hardcoded test dates (3 failing tests on v0.41.2)**: fixed upstream with relative dates; CI on main is green (82 files / 690 tests verified locally 2026-11-11).
- **Phantom GET /api/leads/:id**: implemented upstream; only the llms.txt tool name remains wrong (007).
- **NIP-98 empty-body payload check**: the auditor verified the payload tag is enforced whenever a body is present; not a finding.
- **SSRF, session crypto, BIP-340/NIP-98 replay, SQL parameterization, HTML/RSS escaping, token hashing**: verified sound by the security audit — do not re-audit or refactor these in any plan.
- **undici dual-major (own ^8 + 7.30.1 via cheerio)**: posture, not a vulnerability (pnpm audit --prod: 0 advisories). Deduping requires a cheerio bump — separate dependency work, not in this series.
- **God-module splitting (ui.ts 4909 lines, app.ts ~2700, postgres.ts ~2700)**: real debt, but a refactor of that size needs its own plan series with characterization tests first; deferred. The v2.ts route-registration pattern is the exemplar when it happens.
- **Alexandria "supply" direction (OpenRadar as a provider)**: marketplace submission work, not code; tracked separately from 015.
- **Human gold set / useModel=false gate** (from the 001–006 generation): still not in this repo; the existing gate compares the model to regexes (`src/research/quality.ts`).

## External input: competitor report + curation + repo deep-dive (2026-11-11)

Three inputs were analyzed and folded into plans 016–021 (evidence in `.research/`, all live-probed and robots-checked):

1. **Competitor report** (15-page PDF, "Firecrawl Job Tools и конкуренты…"): validates 007–015. Firecrawl's Nov-10 ChatGPT/Claude launch (~986k views, 12.4k saves > 5.6k likes in ~21h) confirms plugin/MCP as the channel; the Jobs catalog has no hh.ru/SuperJob/Avito/Telegram and JobLeads excludes Russia (RU moat intact); public credit prices (ATS 2–5/call, TheirStack 10/vacancy, Apollo match 15, FullEnrich email 30 / mobile 300, PDL 50–60) make 015's credit guards mandatory; Lever is NOT in the Jobs catalog.
2. **Original curation** (`Job_Search_Resources main.pdf`, Aleksandra Magaramova, 12.03.2026, 6 pages = 78 platforms + 122 companies; extracted to `.research/job-search-resources-pdf.txt`). Cross-matched all 122 companies against our catalogs: **48 already covered**, **16 verified-new ATS companies (678 jobs)** → plan 016; Teamtailor/iCIMS/Workday examples → 017; 8 Telegram channels probed (2 worth adding, 2 already covered, 4 bots/dead/spam) → 017.
3. **Repo deep-dive** (`.research/repos/findings.md`, 9 repos cloned + analyzed; `sources-inventory.json` = 169 endpoint records). License verdicts confirmed: OpenPostings NO LICENSE, JobOps AGPL+Commons Clause, recruiters.rip BSL→2030, Simplify listings NO LICENSE → ideas only. MIT donors: JobSpy, Dreamwork MCP + **13 daily job feeds**, **groundtruth catalog (7 479 boards, 6 761 new, 2 767 live Ashby ≈ 47 847 jobs)**, Jobbie feed (280 direct-link rows), Four-Leaf client.

**The "hundreds of sources" answer** (all legal, robots-respecting):
- Plan 018: import the MIT groundtruth catalog → ~2 767 live Ashby boards immediately + ~3 802 Greenhouse to verify (grows ~1 100 companies → several thousand).
- Plan 016: +16 verified companies, +2 Workday sitemaps, +2 feeds.
- Plan 017: Teamtailor/iCIMS providers + 2 Telegram channels.
- Plan 019: Dreamwork ×13 + Jobbie MIT feeds (caveat: Dreamwork URLs are tracking redirects, not originals — documented).
- Plan 020: +8 verified CIS/EU RSS boards (Djinni, DOU, hh.kz, hh.ge, Zarplata, Jobindex, JSJobbs, Virtual Vocations).

**Architecture borrowing** → plan 021 (six independent sub-projects, clean-room, license-isolated): MCP safety-ladder (Dreamwork MIT), explainable scoring checks/gates/verdict (SuperImpress/pathpipe ideas), freshness/ghost-job detection (OpenPostings/groundtruth ideas), visa-sponsor enrichment (JobOps idea, gov open data), source-quality feedback + idempotent enrich (Firecrawl idea), public listing feed (Simplify/Jobbie pattern, our data).

**Key discovered conflict**: `api.smartrecruiters.com/robots.txt` now allows only LinkedInBot, but our existing 9 SmartRecruiters presets (Wise 441, ServiceNow 788) still poll it (answers 200). Plan 016 records this as an operator decision; no SmartRecruiters company is added until resolved.

Resolved follow-ups (were deferred, now done): the 8 Telegram channels evaluated (017); Hirify = competitor aggregator with /api/* robots-blocked, no feed (catalog.md); HireHi = live RU IT board, HTML-only, /api/ blocked (catalog.md, deferred to an HTML-source plan).
