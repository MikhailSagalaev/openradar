# Plan 014: Add the verify toolchain and document the silent data-retention knob

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 260a650..HEAD -- package.json .env.example AGENTS.md .github/workflows/ src/config.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: dx
- **Planned at**: commit `260a650`, 2026-11-11

## Why this matters

Two operator/developer gaps:
1. **No canonical local verification command.** CI runs typecheck + build + tests + version-lock + Python SDK tests, but `package.json` has no `verify` script and no lint/format tooling — the full check sequence lives only in CI YAML. A contributor (or an executor agent) cannot reproduce CI locally with one command, and nothing catches style drift.
2. **Silent data deletion is undocumented.** `RADAR_RETENTION_DAYS` (default 180, `src/config.ts:88`) drives `cleanupOldLeads` in the hourly maintenance — leads older than the window are permanently deleted. `.env.example` never mentions it. An operator running a long-lived archive node loses data without ever seeing the knob.

## Current state

- `package.json` scripts (verified): `dev`, `build`, `typecheck`, `test`, `test:watch`, `pack:extension`, `new:connector`, `init:env`, `start`, `rebuild`. NO `lint`, `format`, `verify`. No eslint/prettier/biome config in the repo root (`git ls-tree HEAD --name-only` — verify).
- `.github/workflows/` — read the CI workflow(s) to extract the EXACT check sequence (typecheck, build, test, `node scripts/check-version.js`, Python SDK unittest, possibly postgres-mode tests). The `verify` script must mirror the local-runnable subset.
- `src/config.ts:88` — `RADAR_RETENTION_DAYS: z.coerce.number().int().positive().default(180)`.
- `src/pipeline/runner.ts:310` — `const leads = await store.cleanupOldLeads?.(this.deps.env.RADAR_RETENTION_DAYS);` inside hourly maintenance.
- `.env.example` — documents TTLs (`RADAR_GIG_TTL_DAYS=14`, `RADAR_JOB_TTL_DAYS=30`) but NOT retention. The TTL section (lines ~36–39) is the natural home.
- `AGENTS.md` §1 — Quick Commands list; the canonical place to document `verify`.
- Conventions: the repo has NO formatter today — introducing one must not reformat the whole codebase in this plan (that would bury every other plan's diff). Choose a LINT-ONLY setup with no formatting rules, or a formatter check limited to NEW files is not enforceable — therefore: add eslint with a minimal ruleset that passes on the current code, no prettier.

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Install   | `pnpm install`           | exit 0 |
| Typecheck | `pnpm typecheck`         | exit 0 |
| Tests     | `pnpm test`              | all pass |
| New verify | `pnpm verify`           | exit 0 (runs the CI subset locally) |
| New lint  | `pnpm lint`              | exit 0 on the CURRENT code (baseline must be clean) |

## Scope

**In scope** (the only files you should modify/create):
- `package.json` (scripts + devDependencies only; NO version bump)
- `eslint.config.js` (create, flat config, minimal)
- `.env.example` (retention documentation)
- `AGENTS.md` (verify/lint in Quick Commands)
- `.github/workflows/*.yml` (ONLY add a lint step if CI exists and the addition is one line; otherwise leave CI untouched and note it)

**Out of scope** (do NOT touch):
- `src/version.ts`, `server.json` — no version bump (the three-way lock stays as-is).
- Any `src/` or `test/` file — if lint flags existing code, adjust the RULESET to pass, do not reformat the codebase.
- Prettier/biome formatting — explicitly deferred (a repo-wide format is a separate, operator-approved change).
- `src/config.ts` — the retention default stays 180; this plan only documents it.

## Git workflow

- Branch: `advisor/014-verify-toolchain`
- Commits: `chore(dx): add pnpm verify mirroring the CI checks`, `chore(dx): minimal eslint baseline`, `docs: document RADAR_RETENTION_DAYS`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add the verify script

Read `.github/workflows/` and extract the local-runnable checks. Add to `package.json`:

```json
"verify": "node scripts/check-version.js && pnpm typecheck && pnpm build && pnpm test"
```

If CI also runs the Python SDK tests and `python3` is a documented prerequisite (AGENTS.md §1 lists it), append `&& python3 -m unittest discover -s sdk/python/tests` — but ONLY if that command passes on this machine; if Python is unavailable, leave it out and note it in the script comment/AGENTS.md. Do not include the Postgres-mode test run (needs a database).

**Verify**: `pnpm verify` → exit 0.

### Step 2: Minimal eslint baseline

- `pnpm add -D eslint @eslint/js typescript-eslint` (versions: latest stable compatible with the repo's Node 22+; pin caret ranges like the rest of package.json).
- Create `eslint.config.js` (flat config): JS recommended + typescript-eslint recommended, scoped to `src/**/*.ts` and `test/**/*.ts`, ignoring `dist/`, `node_modules/`, `extension/` (plain browser JS with chrome globals — out of scope), `sdk/`.
- Run `pnpm lint`. If the recommended ruleset flags existing code: DISABLE the specific offending rules in the config (with a comment per disabled rule: "baseline: N existing violations, fix in a follow-up") until lint passes. Do NOT edit source files. The goal is a gate against NEW violations of the enabled rules, not a cleanup.
- Add `"lint": "eslint ."` to scripts.

**Verify**: `pnpm lint` → exit 0; `pnpm typecheck` → exit 0 (eslint config is JS, not typechecked, but the install must not break anything).

### Step 3: Wire lint into verify and CI

- Prepend lint to verify: `"verify": "pnpm lint && node scripts/check-version.js && pnpm typecheck && pnpm build && pnpm test"`.
- If a CI workflow exists, add a one-line lint step next to typecheck. If the workflow structure makes this non-trivial, SKIP the CI edit and note it in Maintenance notes.

**Verify**: `pnpm verify` → exit 0.

### Step 4: Document retention

In `.env.example`, next to the TTL lines (~36–39), add:

```
# Permanent deletion: leads older than this many days are removed by the hourly
# maintenance job (default 180). This is NOT the feed TTL above — it deletes data.
# Raise it for an archive node; there is no undo.
RADAR_RETENTION_DAYS=180
```

In `AGENTS.md` §1, add `pnpm verify` and `pnpm lint` to the Quick Commands block with one-line descriptions.

**Verify**: `pnpm test` → all pass (no code changed); grep `.env.example` for `RADAR_RETENTION_DAYS` → present.

## Test plan

- No new unit tests (tooling/docs plan). The verification IS the test: `pnpm verify` and `pnpm lint` exit 0 on the current tree.
- Regression guard: `pnpm test` still passes (baseline 690 + earlier plans).

## Done criteria

- [ ] `pnpm verify` exits 0
- [ ] `pnpm lint` exits 0 on the unmodified source tree
- [ ] `grep -n "RADAR_RETENTION_DAYS" .env.example` → present with the deletion warning
- [ ] `AGENTS.md` Quick Commands lists verify and lint
- [ ] No `src/` or `test/` file is modified (`git status`)
- [ ] No version bump (`node scripts/check-version.js` exits 0)
- [ ] `plans/README.md` status row updated

## STOP conditions

- The eslint baseline cannot be made clean without editing source files (report which rules and how many violations; do not reformat).
- `pnpm verify` fails on a check that also fails on the untouched tree (a pre-existing CI break — report it, do not fix it here).
- Adding the CI lint step requires restructuring the workflow (skip and note).
- A verification fails twice after a reasonable fix attempt.

## Maintenance notes

- The disabled eslint rules are a debt list: each comment names the rule and violation count. A follow-up plan can enable them one at a time with the fixes.
- Deferred: repo-wide formatting (prettier/biome) — needs operator approval because it touches every file; extension/ linting (chrome globals); Python linting.
- Reviewer: confirm the verify script mirrors CI exactly (diff against the workflow) and that no source file changed.
