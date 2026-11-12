# Plan 020: Add verified CIS/EU RSS boards (cheapest coverage growth)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 260a650..HEAD -- src/sources/presets.ts src/sources/rss.ts docs/SOURCES_ROBOTS.md docs/SOURCE_INDEXING_LOG.md test/sources.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (pure additive RSS presets; independent of 016–019)
- **Category**: direction
- **Planned at**: commit `260a650`, 2026-11-11

## Why this matters

The source audit (`.research/sources/catalog.md`, 129 records, live robots +
feed probes) found **9 new RSS boards that are not yet covered, all verified
live with items > 0 and robots-allowed**. These are the cheapest possible
coverage growth — each is a few lines of preset using the existing `rss`
adapter, no code. They fill real gaps: Ukraine IT (Djinni, DOU), Kazakhstan /
Georgia / RU regions (hh.kz, headhunter.ge, Zarplata), Denmark (Jobindex),
JS niche (JSJobbs), US remote (Virtual Vocations), Switzerland (SwissDevJobs).

Re-verified live 2026-11-11 (`.research/verify-rss-batch.py`):

| Board | Feed URL | Items | robots verdict |
|---|---|---|---|
| Djinni (UA) | https://djinni.co/jobs/rss/ | 57 | allow (/jobs2,/q,/developers,/free-jobs,/set_lang disallowed; /jobs/rss/ ok) |
| DOU (UA) | https://jobs.dou.ua/vacancies/feeds/ | 45 | allow (/vacancies/*search=* disallowed; feeds ok) |
| hh.kz (KZ) | https://hh.kz/search/vacancy/rss | 20 | allow (/rss/* disallowed but /search/vacancy/rss NOT matched) |
| headhunter.ge (GE) | https://headhunter.ge/search/vacancy/rss | 20 | allow (same hh engine; robots re-confirm — timed out on 2nd probe) |
| Zarplata.ru (RU) | https://www.zarplata.ru/search/vacancy/rss | 20 | allow (same hh engine; robots re-confirm — timed out on 2nd probe) |
| Jobindex.dk (DK) | https://www.jobindex.dk/jobsoegning.rss | 20 | allow |
| JSJobbs (JS) | https://jsjobbs.com/rss | 100 | allow (empty Disallow) |
| Virtual Vocations (US) | https://www.virtualvocations.com/rss | 50 | allow (registration for full access, but RSS is public) |
| SwissDevJobs (CH) | https://swissdevjobs.ch/rss | 43 | allow |

**hh-family robots nuance (important)**: hh.kz / headhunter.ge / zarplata.ru
share the hh.ru engine whose robots disallows `/rss/*`. The *search* RSS at
`/search/vacancy/rss` is NOT covered by that rule (verdict allow), unlike hh.ru
where `Disallow: *?*` blocks the query-bearing search RSS (hh.ru is already
"ждёт решения оператора" in our docs). So these three are legal to add; hh.ru
itself stays untouched.

## Current state

- `src/sources/presets.ts` — `BASE_PRESETS` holds rss presets shaped `{ id, kind:'rss', title, description, config:{ url } }` (e.g. `remoteok`, `weworkremotely`, `himalayas`, `landing-jobs`, `jobicy`, `dribbble-jobs`). Some pass `config.company` for employer feeds.
- `src/sources/rss.ts` — the `rss` adapter (kind `rss`, access `public`); reads RSS/Atom, no code change needed for a standard feed.
- `docs/SOURCES_ROBOTS.md` — policy table + "Решения"; hh.ru/FL.ru/trudvsem marked "ждёт решения оператора". `docs/SOURCE_INDEXING_LOG.md` — journal.
- SwissDevJobs is ALSO proposed in plan 016 Step 3 — **coordinate**: add it in exactly one plan. If 016 ran first, skip it here; if 020 runs first, 016 skips it. (Recommend: keep SwissDevJobs in 016, drop from 020's list to avoid a duplicate preset id.)

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Typecheck | `pnpm typecheck`         | exit 0, no errors   |
| Tests     | `pnpm test`              | all pass |
| Focused   | `pnpm test -- sources ui-signals` | all pass |

## Scope

**In scope**:
- `src/sources/presets.ts` (add the rss presets)
- `docs/SOURCES_ROBOTS.md`, `docs/SOURCE_INDEXING_LOG.md` (rows + journal)
- `test/sources.test.ts` / `test/ui-signals.test.ts` ONLY if a preset-count assertion needs updating

**Out of scope**:
- `src/sources/rss.ts` — no adapter change (standard feeds).
- hh.ru itself (robots-blocked, operator decision pending) — do not touch.
- HTML-only boards (JustRemote, SkipTheDrive, IamExpat, The Hub, JOIN.com, …) — they need the sitemap/json-board treatment or collector; separate plans.
- SwissDevJobs if 016 already added it (avoid duplicate id).

## Git workflow

- Branch: `advisor/020-cis-eu-rss`
- Commits: `feat(sources): verified CIS/EU RSS boards`, `docs(sources): robots rows and indexing log for the new feeds`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Re-confirm feeds + robots, then add presets

1. Re-run a live check of each feed (one GET) and its robots.txt before inserting (the audit is a snapshot; headhunter.ge/zarplata robots timed out on the second probe — confirm they allow `/search/vacancy/rss`). A feed that now returns 0 items / 403 / HTML is skipped and logged.
2. Add to `BASE_PRESETS` (ids kebab-case, unique; skip SwissDevJobs if 016 added it):

```ts
{ id: 'djinni', kind: 'rss', title: 'Djinni — IT-вакансии Украины', description: 'Крупнейшая украинская IT-доска, много remote (djinni.co)', config: { url: 'https://djinni.co/jobs/rss/' } },
{ id: 'dou-jobs', kind: 'rss', title: 'DOU Jobs — IT-вакансии Украины', description: 'Главная IT-доска Украины (jobs.dou.ua)', config: { url: 'https://jobs.dou.ua/vacancies/feeds/' } },
{ id: 'hh-kz', kind: 'rss', title: 'HeadHunter Казахстан', description: 'Вакансии Казахстана (hh.kz, поисковый RSS)', config: { url: 'https://hh.kz/search/vacancy/rss' } },
{ id: 'hh-ge', kind: 'rss', title: 'HeadHunter Грузия', description: 'Вакансии Грузии (headhunter.ge, поисковый RSS)', config: { url: 'https://headhunter.ge/search/vacancy/rss' } },
{ id: 'zarplata-ru', kind: 'rss', title: 'Zarplata.ru — вакансии России', description: 'Российская доска вакансий (zarplata.ru, поисковый RSS)', config: { url: 'https://www.zarplata.ru/search/vacancy/rss' } },
{ id: 'jobindex-dk', kind: 'rss', title: 'Jobindex — вакансии Дании', description: 'Крупнейшая доска вакансий Дании (jobindex.dk)', config: { url: 'https://www.jobindex.dk/jobsoegning.rss' } },
{ id: 'jsjobbs', kind: 'rss', title: 'JSJobbs — JavaScript-вакансии', description: 'Нишевая доска JavaScript-вакансий (jsjobbs.com)', config: { url: 'https://jsjobbs.com/rss' } },
{ id: 'virtual-vocations', kind: 'rss', title: 'Virtual Vocations — удалённые вакансии США', description: 'Проверенные удалённые вакансии (virtualvocations.com, публичный RSS)', config: { url: 'https://www.virtualvocations.com/rss' } },
```

Follow the exact title/description language style of the existing presets (RU titles). If the rss adapter benefits from a language hint for these (mostly RU/UA/EN), check how existing presets signal it and match — do not invent a new config field.

**Verify**: `pnpm typecheck` → exit 0; `pnpm test -- sources ui-signals` → all pass.

### Step 2: Robots rows + indexing log

- `docs/SOURCES_ROBOTS.md`: add a row per new feed with its robots verdict; explicitly note the hh-family nuance (`/rss/*` disallowed, `/search/vacancy/rss` allowed) so a future auditor doesn't "fix" it into a block.
- `docs/SOURCE_INDEXING_LOG.md`: indexed entries with verification date + item counts; any skipped feed (dead/blocked) recorded with reason.

**Verify**: `pnpm test` → all pass.

## Test plan

- No adapter change → existing tests stay green; update any preset-count assertion.
- Verification: `pnpm typecheck && pnpm test` → all pass.

## Done criteria

- [ ] `pnpm typecheck` exits 0; `pnpm test` exits 0
- [ ] 8 new rss presets added (9 minus SwissDevJobs if 016 owns it), each live-verified before insert
- [ ] hh-family robots nuance documented; hh.ru untouched
- [ ] No duplicate preset id (`git grep` the ids); no files outside scope modified
- [ ] `plans/README.md` status row updated

## STOP conditions

- A feed returns HTML / 0 items / 403 on re-verification (skip + log; if >3 of 8 fail, report — the audit may have aged).
- headhunter.ge / zarplata robots actually disallow `/search/vacancy/rss` (then those two are blocked — skip, log, do not bypass).
- A preset id collides with an existing one (rename; report).
- A verification fails twice after a reasonable fix attempt.

## Maintenance notes

- These are standard RSS feeds; if a board changes its feed URL the source health will show it — update the preset, same as any rss source.
- Virtual Vocations gates full descriptions behind registration; the public RSS may carry truncated text. Verify the feed body is useful; if it's title-only, note it (the pipeline still scores on title+company, but flag the limitation).
- Deferred (own plans): the HTML-only boards from the audit (JustRemote, SkipTheDrive, IamExpat, Together Abroad, Undutchables, The Hub, JOIN.com, RemoteCrew, Tproger, Rabota.ru, Freelance.ru, YouDo, Praca.by, Jobs.ge) — each needs a sitemap/json-board config or the browser collector, plus its own robots check.
- Reviewer: confirm each added feed was fetched live (items>0) and robots allows the exact polled path; confirm hh.ru was not touched; confirm no duplicate ids.
