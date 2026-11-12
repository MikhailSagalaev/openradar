# Plan 015: Add Firecrawl Alexandria as an opt-in international job source

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 260a650..HEAD -- src/sources/ src/core/types.ts src/server/ui.ts src/server/app.ts src/config.ts .env.example test/sources.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none (independent of 007–013; can run in parallel on a separate branch)
- **Category**: direction
- **Planned at**: commit `260a650`, 2026-11-11

## Why this matters

OpenRadar's coverage gap versus Firecrawl Alexandria is international corporate vacancies at scale (BlitzAPI aggregates 33k+ live postings; our ATS adapters cover specific companies only). Alexandria is a pay-per-record data marketplace inside Firecrawl: one `POST https://api.firecrawl.dev/v2/scrape` with an `alexandria` block returns structured records from ~700 providers. A live smoke test on 2026-11-11 confirmed the contract: `blitzapi/jobs/search` with `job.title.include=['Product Manager']`, `job.date_posted.last_days=30`, `max_results=2` → `total_results: 33737`, 2 records, 4 credits (2 credits/record on the tested plan), empty results are free.

This plan adds an **opt-in, auth-required source adapter** that feeds Alexandria records into the existing pipeline (dedup, quality, scoring, delivery — all free downstream). It does NOT change the zero-paywall principle: the operator supplies their own `FIRECRAWL_API_KEY`, credits are their own, and the adapter is off unless configured. This is the "consume" direction of the Alexandria integration; the "supply" direction (OpenRadar as an Alexandria provider) is separate marketplace work, not code.

**Market context (2026-11-11, full 15-page competitor report):** Firecrawl shipped this catalog to end users on Nov 10 as job search tools inside ChatGPT/Claude (post link → `alexandria.firecrawl.dev/go/jobtools`; claims «7M+ open roles», «250M+ professional profiles»; ~986k post views and 12.4k saves in ~21h). An independent comparison against v0.67.0 concludes Firecrawl is not a direct competitor on RU/Telegram but validates plugin/MCP as the channel — the same two-direction strategy this plan (consume) and plan 011 (distribution) implement. There is no dedicated `match_resume` tool: assistants call the Firecrawl plugin, which routes to Alexandria — exactly the contract this adapter consumes.

**Public credit pricing (report, from the live catalog — our smoke price is a team discount, NOT the public rate):** Firecrawl plans Free 1 000 credits/mo (no card), Hobby $19/5 000, Standard $99/100 000, then Growth/Scale. Jobs: ATS providers (Ashby, Greenhouse, Workday, iCIMS, SmartRecruiters, SAP SuccessFactors, Workable, JOIN) ~2–5 credits/call; TheirStack 10 credits/returned vacancy; aggregators BlitzAPI, Crustdata, Sumble, Built In, Glassdoor US, JobLeads, ZipRecruiter US, Y Combinator. **Lever is NOT confirmed in the Jobs catalog** — do not claim "7M from Greenhouse+Lever+Ashby". People: Apollo search free/call, match+enrich 15; FullEnrich work email 30, mobile 300; People Data Labs 50–60. Empty answers are free for *some* providers only. A user complaint that one request ate half the free tier is plausible when an agent pulls a batch of people or an expensive job search — this is why the adapter's `maxResults ≤ 100` clamp and 1800s default poll interval are mandatory, not optional. The report also confirms the Jobs catalog has no hh.ru/SuperJob/Avito/Telegram and JobLeads' 40+ countries exclude Russia — the RU gap this adapter does NOT close (it is intl-only by design).

## Current state

- Adapter contract: `src/core/types.ts:240–258` — `SourceAdapter { kind, access, description, risks, defaultPollIntervalSec?, poll(source, ctx) }`. `AccessKind = 'official' | 'public' | 'user-provided' | 'auth-required'` (line 2). `SourceConfig` (105–117) is an open record (`[key: string]: unknown`). `RawLead` (148–173): `sourceId, type?, externalId?, url?, title, text, author?, city?, budget?, currency?, rawSalary?, category?, skills?, isRemote?, publishedAt?, metadata?, raw?, contacts?, sourceRef?`.
- Credential precedent: `src/sources/adzuna.ts:47–51` reads `process.env.RADAR_ADZUNA_APP_ID/APP_KEY`, throws a clear error when missing, NEVER stores keys in source config. IMAP (`src/sources/imap.ts:88–99`) uses an env-name allow-list. Follow the Adzuna pattern (fixed env var name).
- POST precedent: `src/sources/kwork.ts:61–81` — `apiPost` uses `ctx.fetchImpl(url, { method: 'POST', headers, body, signal: AbortSignal.timeout(ctx.timeoutMs) })` + `readJsonLimited` (`src/net/body.ts`). For SSRF safety on a fixed public API host, call `assertSafeUrl` (`src/core/ssrf.ts:94`) before the fetch and use `safeFetchImpl(ctx.fetchImpl)` (line 163) — the host is a constant (`https://api.firecrawl.dev`), so the guard is cheap and keeps the adapter honest.
- Registry: `src/sources/index.ts:13,51–55` — import + `.register(adapter)`. UI access map: `src/server/ui.ts:197` `KIND_ACCESS` (static copy; `test/ui-signals.test.ts:45` asserts it equals what adapters declare — you MUST add the new kind there).
- Source form: `src/server/app.ts:597–602` `FORM_CONFIG_KEYS`, `buildSourceConfig` (604+) per-kind branches; `src/server/ui.ts` `renderNewSourcePage` renders per-kind fields (find the `kind === 'adzuna'` / ATS branches as the pattern). Presets: `src/sources/presets.ts:736–745` (adzuna-us) — preset shape `{ id, kind, title, description, config }`.
- Verified Alexandria response shape (live smoke, 2026-11-11, blitzapi/jobs/search):

```json
{ "success": true,
  "data": { "alexandria": [ { "provider": "blitzapi", "capability": "jobs/search", "creditsCost": 4,
    "data": { "total_results": 33737, "results": [ {
      "date_posted": "2026-11-11 11:34:25.004+01",
      "title": "Finance Manager - Product Costing",
      "url": "https://pl.linkedin.com/jobs/view/…",
      "company_name": "ABB",
      "ai_summary": "Own and govern global product costing…",
      "location": { "city": null, "country_code": "PL" }
    } ], "results_length": 2, "cursor": "…" } } ],
    "creditsCost": 4 } }
```

  Request body shape: `{ alexandria: { provider: 'blitzapi', capability: 'jobs/search', options: { job: { title: { include: [...] }, location: { country_code: { include: [...] } }, date_posted: { last_days: 30 } }, max_results: N } } }`. Auth: `Authorization: Bearer <FIRECRAWL_API_KEY>`. NOTE: `ai_summary` is a summary, NOT the full description; some records may carry more fields — map defensively, never assume.
- Conventions: `AGENTS.md` §4 — respect robots.txt (an official API is fine), keep contacts as published, `pnpm new:connector <slug>` scaffolds a connector (read `docs/PLUGINS.md` first; you may use the scaffold or write the file directly following adzuna.ts). Tests: zero live network — inject `fetchImpl` via `pollContext(body)` (`test/helpers.ts:52`) or a custom `PollContext`.

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Typecheck | `pnpm typecheck`         | exit 0, no errors   |
| Tests     | `pnpm test`              | all pass (baseline: 82 files, 690 tests + earlier plans) |
| Focused   | `pnpm test -- sources ui-signals` | all pass |
| Scaffold (optional) | `pnpm new:connector alexandria` | creates the connector skeleton per docs/PLUGINS.md |

## Scope

**In scope** (the only files you should modify/create):
- `src/sources/alexandria.ts` (create)
- `src/sources/index.ts` (register)
- `src/server/ui.ts` (`KIND_ACCESS` entry + source-form fields for the new kind ONLY)
- `src/server/app.ts` (`FORM_CONFIG_KEYS` + `buildSourceConfig` branch for the new kind ONLY)
- `src/sources/presets.ts` (one preset, disabled-by-default semantics per existing auth-required presets)
- `.env.example` (document `FIRECRAWL_API_KEY`)
- `test/sources.test.ts` (adapter tests), `test/ui-signals.test.ts` (only if the KIND_ACCESS assertion needs the new entry — it asserts equality, so it passes automatically once both sides match)

**Out of scope** (do NOT touch):
- `src/core/ssrf.ts`, `src/net/body.ts` — reuse, don't modify.
- The pipeline (ingest/dedup/quality/score) — RawLead is the contract; nothing downstream changes.
- MCP tools, server.json, skills — plans 007/011 own them.
- Apollo/HarvestAPI enrichment (People/Social capabilities) — this plan is jobs/search only; enrichment is a future adapter.
- Any payment/credit accounting beyond logging `creditsCost` — no billing code.

## Git workflow

- Branch: `advisor/015-alexandria-source`
- Commits: `feat(sources): Firecrawl Alexandria jobs adapter (opt-in, auth-required)`, `feat(ui): alexandria source form and preset`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: The adapter

Create `src/sources/alexandria.ts` modeled on `adzuna.ts`:

- `kind: 'alexandria'`, `access: 'auth-required'`, `defaultPollIntervalSec: 1800` (credit-costly; the board barely changes faster), `description` (ru, one line: official Firecrawl Alexandria API, BlitzAPI jobs, needs FIRECRAWL_API_KEY, pay-per-record), `risks` (ru array: credits spent per record — empty results free; rate limit 25 req/s; ai_summary is a summary not the full text; LinkedIn URLs are canonical job links).
- `poll(source, ctx)`:
  1. `const apiKey = process.env.FIRECRAWL_API_KEY?.trim(); if (!apiKey) throw new Error('Alexandria: set FIRECRAWL_API_KEY in the environment');`
  2. Read config: `titles: string[]` (from `config.titles` or comma-split `config.query`), `countries: string[]` (`config.countries`), `lastDays` (default 30, clamp 1–90), `maxResults` (default 20, clamp 1–100 — credit guard). Build `options.job` with `title.include` / `location.country_code.include` / `date_posted.last_days` only when non-empty.
  3. `await assertSafeUrl(API_URL)` (constant `https://api.firecrawl.dev/v2/scrape`), then POST via `safeFetchImpl(ctx.fetchImpl)` with `Authorization: Bearer`, `content-type: application/json`, `AbortSignal.timeout(ctx.timeoutMs)`, body `{ alexandria: { provider: 'blitzapi', capability: 'jobs/search', options } }`. Read with `readJsonLimited` (cap ~2MB).
  4. On `!response.ok` or `success !== true`: throw `Alexandria: HTTP <status>` (the poll runner records source health). On missing `data.alexandria[0].data.results`: return `[]` and `ctx.logger.warn` with the provider error if present.
  5. Log `ctx.logger.info('alexandria poll', { records, creditsCost, totalResults })` — credits visible in logs, never stored per-lead.
  6. Map each result → RawLead: `type: 'job'`, `externalId: 'alexandria:' + (url || title+company+date_posted hash)`, `url`, `title`, `text` = title + company + location + ai_summary joined (the pipeline extracts skills/salary from text), `author: company_name`, `city: location.city ?? undefined`, `isRemote` from `/remote|work from home/i` on title+summary (same heuristic as adzuna), `publishedAt` parsed from `date_posted` (format `YYYY-MM-DD HH:mm:ss.SSS±TZ` — parse defensively; if unparseable, omit), `raw: { provider, capability, country_code, totalResults }`. NO budget/salary mapping (BlitzAPI records in the smoke carried none; do not invent). Skip records without title AND url.
- Do NOT paginate via `cursor` in v1 (one page per poll keeps credit spend bounded); note it in risks.

**Verify**: `pnpm typecheck` → exit 0.

### Step 2: Register + KIND_ACCESS

- `src/sources/index.ts`: import and `.register(alexandriaSource)` (alphabetical position near adzuna).
- `src/server/ui.ts` `KIND_ACCESS` (~197): add `alexandria: 'auth-required'`. The existing test `test/ui-signals.test.ts:45` asserts map equality with adapter declarations — it must pass unchanged.

**Verify**: `pnpm test -- ui-signals sources` → all pass.

### Step 3: Source form + config

- `src/server/app.ts`: add `'titles'`, `'countries'`, `'lastDays'`, `'maxResults'` to `FORM_CONFIG_KEYS` (only if you use those exact field names); add a `kind === 'alexandria'` branch in `buildSourceConfig` parsing them (titles/countries via `parseList`, lastDays/maxResults via `asNumber` with the clamps from Step 1). Follow the adzuna/ats branch style.
- `src/server/ui.ts` `renderNewSourcePage`: add the alexandria field block (titles text input, countries text input, lastDays/maxResults numbers) next to the existing per-kind blocks; bilingual labels matching the file's ru/en pattern. Add a one-line hint that FIRECRAWL_API_KEY must be set in the environment (never a key input field).
- `formValues`/`formValuesFromSource` (app.ts ~520–594): thread the new fields so edits preserve them.

**Verify**: `pnpm typecheck` → exit 0; `pnpm test -- server` → all pass.

### Step 4: Preset + env docs

- `src/sources/presets.ts`: add one preset `{ id: 'alexandria-jobs', kind: 'alexandria', title: 'Alexandria — Международные вакансии (BlitzAPI)', description: '…требует FIRECRAWL_API_KEY; кредиты Firecrawl за запись…', config: { lastDays: 30, maxResults: 20 } }`. Check how existing auth-required presets (adzuna) are gated in the presets endpoint — follow the same gating (the preset may be listed but the source fails fast without the key; that is the adzuna behavior — match it).
- `.env.example`: add a commented `# FIRECRAWL_API_KEY=` block near the Adzuna/Kwork credentials section explaining: optional, pay-per-record, empty results free, get a key at firecrawl.dev.

**Verify**: `pnpm test -- sources` → all pass.

### Step 5: Adapter tests (zero network)

In `test/sources.test.ts` (follow its existing adapter-test pattern, e.g. adzuna/arbeitnow tests):
1. **Missing key**: `process.env.FIRECRAWL_API_KEY` unset → `poll` rejects with the clear error (save/restore the env var in the test).
2. **Happy path**: set a fake key; `PollContext` with `fetchImpl` returning the VERIFIED smoke response shape (inline fixture above, 2 records); assert 2 RawLeads with correct title/url/author/city/type, `externalId` prefixed `alexandria:`, and that the request body sent to fetchImpl contains `provider: 'blitzapi'`, `capability: 'jobs/search'`, `date_posted.last_days: 30` (capture the init arg).
3. **Empty results**: `results: []` → `[]`, no throw (free page).
4. **HTTP error**: fetchImpl returns 402 → poll rejects with `Alexandria: HTTP 402`.
5. **Clamps**: `maxResults: 5000` in config → request body `max_results <= 100`; `lastDays: 0` → clamped to 1.
6. **Defensive mapping**: a record with null city, missing ai_summary, unparseable date_posted → still a valid RawLead, no throw.

**Verify**: `pnpm test -- sources` → all pass including 6 new tests; `pnpm test` → all pass.

## Test plan

- New: 6 adapter tests in `test/sources.test.ts`; KIND_ACCESS parity is covered by the existing `test/ui-signals.test.ts`.
- Structural pattern: existing adzuna/arbeitnow tests in `test/sources.test.ts`; `pollContext` helper.
- Verification: `pnpm test` → all pass. NO live Firecrawl call in tests (the smoke fixture is inlined).

## Done criteria

- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm test` exits 0; the 6 new tests exist and pass
- [ ] `grep -rn "FIRECRAWL_API_KEY" src/` shows env-only reads (no config storage of the key)
- [ ] `KIND_ACCESS.alexandria === 'auth-required'` (covered by existing parity test)
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

- The excerpts don't match the live code (drift) — especially if upstream already added an alexandria/firecrawl adapter.
- The live Alexandria contract differs from the verified fixture (if you re-run the smoke and the shape changed, STOP and report the new shape — do not guess mappings).
- `docs/PLUGINS.md` mandates a scaffold structure that conflicts with this plan (follow the doc, note the deviation).
- A verification fails twice after a reasonable fix attempt.

## Maintenance notes

- Credit spend is bounded by `maxResults ≤ 100` per poll and `defaultPollIntervalSec 1800`; an operator polling 20 records every 30 min spends ≤ 960 records/day. Surface `creditsCost` in source health later if operators ask.
- Deferred: cursor pagination, other capabilities (Apollo people/enrichment, HarvestAPI social posts), other job providers (greenhouse/ashby via Alexandria), and the "supply" direction (OpenRadar as an Alexandria provider — marketplace submission, not code).
- The skill (plan 011) can reference this source once landed: "intl corporate coverage via the operator's own Firecrawl key".
- Reviewer: check the SSRF guard is applied even though the host is constant, the key never enters source config or logs, and the date parsing cannot throw on malformed input.
