# Plan 003: Stop adapter labels from marking English posts as Russian

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before the next step. On a STOP condition, stop and report. When done, set plan 003's status in `plans/README.md` to DONE.
>
> **Drift check (run first)**: `git diff --stat f02a024..HEAD -- src/core/text.ts src/store/postgres.ts src/store/memory.ts src/server/filters.ts src/core/extract.ts src/server/ui.ts`
> On an excerpt mismatch, STOP.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: MED
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `f02a024`, 2026-11-09

## Why this matters

The Russian feed filter is `title ~ '[А-Яа-яЁё]'` in Postgres and the same test on `lead.title` in the memory store and in `matchesSavedFilters`. Research uses a different rule, `scopeOf`: Cyrillic letters must be at least a quarter of Cyrillic plus Latin.

Sitemap and board adapters prepend lines such as `Компания: Fabletics` and `Город: El Segundo` into the title or the title blob. Live lead `1de37aa0-216a-4a8f-a777-6cc6ccdd4ebf` has title text starting `Merchant — Merchant` and then those two Russian labels, city El Segundo, on-site, salary in USD. The feed treats it as Russian. The display helper `leadTitle` strips some labels and does not strip `Город:`.

## Current state

Postgres, `src/store/postgres.ts`, inside the lead list WHERE builder:

```ts
if (options.language) {
  conditions.push(options.language === 'ru' ? `title ~ '[А-Яа-яЁё]'` : `title !~ '[А-Яа-яЁё]'`);
}
```

`src/server/filters.ts` `matchesSavedFilters` uses `/[А-Яа-яЁё]/.test(lead.title)`.

`src/store/memory.ts` uses the same title test (search for `options.language`).

`src/core/extract.ts` `cleanTitle` and `src/server/ui.ts` `leadTitle` strip `Компания|Работодатель|Company|Формат|Локация|...` and do not mention `Город`.

`src/research/derive.ts` `scopeOf` is the research rule. Do not change it in this plan. The feed stays title-based; it only ignores adapter labels.

Commit style: `fix(feed): ignore company and city labels when detecting Russian titles`.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Unit tests | `pnpm test -- test/feed-language.test.ts` | all pass |
| Typecheck | `pnpm typecheck` | exit 0 |
| Full tests | `pnpm test` | all pass |

## Scope

**In scope**:

- `src/core/text.ts` (add `titleForLanguage` and `feedLanguageOf`)
- `src/store/postgres.ts` (the language condition only)
- `src/store/memory.ts` (the language condition only)
- `src/server/filters.ts` (`matchesSavedFilters` language branch only)
- `src/core/extract.ts` and `src/server/ui.ts` (add `Город` to the existing label strip)
- `test/feed-language.test.ts` (create)
- `plans/README.md` (status row only)

**Out of scope**:

- A new `language` column or a backfill.
- `scopeOf` and any research figure.
- Rewriting stored titles.

## Git workflow

- Branch: `advisor/003-feed-language`
- One commit. Do not push.

## Steps

### Step 1: One function for the feed language

Add to `src/core/text.ts`:

```ts
const ADAPTER_LABEL = /(?:^|\n)\s*(?:Компания|Город|Работодатель|Company|Location|Локация|Формат(?:\s+работы)?|Уровень|Занятость)\s*:[^\n]*/gi;

export function titleForLanguage(title: string): string {
  return title.replace(ADAPTER_LABEL, ' ').replace(/\s+/g, ' ').trim();
}

export function feedLanguageOf(title: string): 'ru' | 'en' {
  return /[А-Яа-яЁё]/.test(titleForLanguage(title)) ? 'ru' : 'en';
}
```

`Удалённо` as a lone word is not in this regex. A real Russian title may be just `Удалённо, Python-разработчик` and must stay `ru` because of `разработчик`. An English title whose only Cyrillic is the label lines must become `en`.

### Step 2: Use it in all three feed checks

- `matchesSavedFilters`: compare `feedLanguageOf(lead.title)` with `filters.language` instead of testing the raw title.
- `src/store/memory.ts`: same function. Do not leave a second regex.
- `src/store/postgres.ts`: replace the title test with a `regexp_replace` that removes the same labels, then test Cyrillic on the result. Postgres `~` is case-sensitive unless `~*`. Use a pattern equivalent to `ADAPTER_LABEL`. Add a one-line comment: the pattern must match `ADAPTER_LABEL` in `src/core/text.ts`.

Postgres has no import of that function. The unit tests lock the TypeScript side. The SQL must be readable next to the comment. Do not create a generated SQL string from the JS regex; write the SQL pattern out and list the same labels.

### Step 3: Strip `Город:` in the visible title

Add `Город` to the label alternation in `cleanTitle` (`src/core/extract.ts`) and `leadTitle` (`src/server/ui.ts`). Do not change the rest of those regexes.

### Step 4: Tests

Create `test/feed-language.test.ts`:

- `feedLanguageOf('Merchant — Merchant\nКомпания: Fabletics\nГород: El Segundo')` is `'en'`
- `feedLanguageOf('Python-разработчик')` is `'ru'`
- `feedLanguageOf('Senior Python\nКомпания: Fabletics')` is `'en'`
- `feedLanguageOf('Удалённо, аналитик')` is `'ru'`
- `titleForLanguage` of the Fabletics string does not contain `Компания` or `Город`

**Verify**: `pnpm test -- test/feed-language.test.ts` → 5 pass. `pnpm typecheck` → exit 0. `pnpm test` → all pass.

## Done criteria

- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm test` exits 0
- [ ] `rg -n "title ~ '\[А-Яа-яЁё\]'" src/store/postgres.ts` returns no matches
- [ ] `feedLanguageOf` is used by `matchesSavedFilters` and the memory store
- [ ] `git status --short` shows only in-scope files
- [ ] Plan 003 status is DONE

## STOP conditions

- The language condition is not a title regex (the live code already stores a language column). STOP and report. Do not add a second rule.
- Matching the SQL to `ADAPTER_LABEL` needs a Postgres integration test and `DATABASE_URL` is unset. Ship the unit tests. Do not skip the SQL edit.
- `cleanTitle`'s regex no longer looks like the excerpt. STOP rather than guessing a second stripper.

## Maintenance notes

- A new adapter label (`Бренд:`, `Офис:`) must be added in three places: `ADAPTER_LABEL`, the Postgres pattern, and the display strip in `extract.ts` and `ui.ts`. Reviewers should check that list.
- Research `scopeOf` remains the ratio rule. A post can be `en` on the feed and `ru` in research if the body is Russian and the title is English. That split is intentional in this plan.
