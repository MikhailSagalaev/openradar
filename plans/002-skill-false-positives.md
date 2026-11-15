# Plan 002: Stop English prose from becoming skills

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before the next step. On a STOP condition, stop and report. When done, set plan 002's status in `plans/README.md` to DONE.
>
> **Drift check (run first)**: `git diff --stat f02a024..HEAD -- src/core/text.ts`
> On an excerpt mismatch, STOP.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `f02a024`, 2026-11-09

## Why this matters

`extractTechSkills` tags every lead. Those tags feed the skill filter, the IT checkbox, and the score. Three patterns tag ordinary English:

- Lead `1de37aa0-216a-4a8f-a777-6cc6ccdd4ebf` (Fabletics merchant, El Segundo) is stored with skill `Swift` because the text says `take swift, strategic actions`.
- `\bps\b` tags Photoshop on `P.S.`
- `illustration` tags `for illustration` in non-design posts.
- Lead `82e4d5f2-8e1c-4459-9c72-855718c504ee` is stored with `Битрикс` because the agency wrote `Официальные партнеры ... «БИТРИКС 24»`.

## Current state

`src/core/text.ts` exports `TECH_SKILL_PATTERNS` and `extractTechSkills`. There is no dedicated test file. Relevant patterns today:

```ts
[/\bswift\b/i, 'Swift'],
[/\bphotoshop\b|\bps\b(?![a-z])/i, 'Photoshop'],
[/\bbitrix\b|битрикс/i, 'Битрикс'],
[/иллюстрац|illustration/i, 'Иллюстрация'],
```

`extractTechSkills` pushes the first `max` matches (default 8) and does not look at the sentence around the match.

Commit style: `fix(skills): do not tag swift, ps, or illustration from plain English`.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| New tests | `pnpm test -- test/text-skills.test.ts` | all pass |
| Typecheck | `pnpm typecheck` | exit 0 |
| Full tests | `pnpm test` | all pass |

## Scope

**In scope**:

- `src/core/text.ts`
- `test/text-skills.test.ts` (create)
- `plans/README.md` (status row only)

**Out of scope**:

- `src/server/filters.ts` `IT_SKILLS` — plan 005. Do not add or remove names there.
- `src/research/derive.ts` role regexes. `linux` → sysadmin is real and is not this plan.
- Re-extracting skills on already stored leads. Say in the commit message that a rescore does not rewrite `skills_json` today. If you find that `rescoreLeads` does not save skills, do not add that write. STOP and report it as follow-up rather than widening the store interface.

## Git workflow

- Branch: `advisor/002-skill-false-positives`
- One commit. Do not push.

## Steps

### Step 1: Tighten the four patterns

In `src/core/text.ts`:

- Swift: remove the case-insensitive `\bswift\b`. Match `Swift` only as a capitalized token (`/\bSwift(?:\s*UI)?\b/`) or the case-insensitive tokens `SwiftUI`, `iOS`, and `Xcode` in the same text. Implementation: if the Swift pattern matches, keep the tag only when the text also matches `/SwiftUI|\biOS\b|Xcode|\bSwift\b/.test` and the matched Swift token is not the lowercase word `swift` alone. `take swift, strategic actions` must not tag Swift. `iOS, Swift, UIKit` must tag Swift.
- Photoshop: delete the `\bps\b` alternative. Keep `photoshop` and `фотошоп`.
- Illustration: replace the pattern with `/иллюстрац/i` or `/\b(?:digital|vector|book|2d|3d)\s+illustration\b/i`. Bare `for illustration` must not match.
- Bitrix: after a `битрикс` / `bitrix` match, drop the tag when that sentence also matches `/партн[её]р/i`. A sentence is the slice between newlines and `.` `!` `?`. `Официальные партнеры «БИТРИКС 24»` drops the tag. `Нужен программист Битрикс` keeps it.

Do this inside `extractTechSkills` so every caller gets it. Do not copy the list.

### Step 2: Tests

Create `test/text-skills.test.ts` importing `extractTechSkills` from `../src/core/text.ts`. Cases:

- `take swift, strategic actions` → result does not include `Swift`
- `iOS developer, Swift and SwiftUI` → includes `Swift`
- `P.S. see the brief` → does not include `Photoshop`
- `Adobe Photoshop` → includes `Photoshop`
- `for illustration only` → does not include `Иллюстрация`
- `нужна иллюстрация персонажа` → includes `Иллюстрация`
- `Официальные партнеры «БИТРИКС 24»` → does not include `Битрикс`
- `Программист Битрикс, обмен с 1С` → includes `Битрикс`

**Verify**: `pnpm test -- test/text-skills.test.ts` → 8 tests pass. `pnpm typecheck` → exit 0. `pnpm test` → all pass.

## Done criteria

- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm test -- test/text-skills.test.ts` exits 0 with the 8 cases
- [ ] `pnpm test` exits 0
- [ ] `git status --short` shows only `src/core/text.ts`, `test/text-skills.test.ts`, and the status edit in `plans/README.md`
- [ ] Plan 002 status is DONE

## STOP conditions

- `TECH_SKILL_PATTERNS` is not an array of `[RegExp, string]` in `src/core/text.ts`.
- A capital-Swift rule would reject a fixture already in `test/` that expects lowercase `swift` to be a skill. Search first: `rg -n "swift" test src`. If a test requires the old behavior, STOP and report the file. Do not weaken the new tests to go green.
- The Bitrix sentence rule starts deleting `Битрикс` from posts that also say `программист` in another sentence. The rule is per sentence. If the test cannot express that, STOP.

## Maintenance notes

- Stored `skills_json` stays wrong until a future rescore writes skills. Reviewers should not expect the live Fabletics card to change from this commit alone.
- Plan 005 counts skills after this correction. Land 002 first.
