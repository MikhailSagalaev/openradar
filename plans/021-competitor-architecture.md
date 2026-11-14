# Plan 021: Borrow competitor architecture (explainable scoring, freshness, MCP safety, visa enrichment)

> **Executor instructions**: This is a **roadmap of independent sub-projects**, not a single linear plan. Pick ONE sub-project (A–F below), execute it fully with its own verification, update its status, and stop — do not attempt all six in one pass. Each sub-project honors its STOP conditions. When a sub-project ships, update its row in `plans/README.md` (021 stays IN PROGRESS until all chosen sub-projects ship or are deferred).
>
> **Drift check (run first per sub-project)**: `git diff --stat 260a650..HEAD -- <that sub-project's in-scope files>`
> If an in-scope file changed since this plan was written, compare the "Current state" excerpt against the live code before proceeding; on a mismatch, STOP.

## Status

- **Priority**: P3 (direction; each sub-project re-prioritized on its own merits)
- **Effort**: L (total); each sub-project S–M
- **Risk**: LOW–MED per sub-project (additive; no rewrite of the hot path)
- **Depends on**: 008 (scoring/dedup stability) for A/B; 011 (MCP surface truthfulness) for C
- **Category**: direction
- **Planned at**: commit `260a650`, 2026-11-11
- **Progress**: **D shipped 2026-11-13** (UK Register of Licensed Sponsors; 13 tests, live 15/21). **B shipped 2026-11-13** (ATS board-diff ghost-jobs; 6 tests). **F shipped 2026-11-13** (public listing feed JSON+MD, guest-projection source, opt-in workflow; 8 tests, live 200 listings / 0 leaks). **E shipped 2026-11-13** (idempotent paid model call via replay cache, 6 tests; source-quality already covered by the existing `scoreSource` system since 0.55.0 — no duplicate added). **A shipped 2026-11-13** (explainable scoring: checks + gates + verdict, additive to the 0–100 score, API/UI/OpenAPI; 8 tests; MCP details projection deferred with C). C deferred until 011 lands (same files).

## Why this matters

A deep read of competitor public repos (`.research/repos/findings.md`, 9 repos
cloned + analyzed) surfaced architectural ideas worth borrowing. **License
isolation is absolute** (OpenRadar core AGPL-3.0, plugin Apache-2.0):

| Donor | License | Code reuse? |
|---|---|---|
| JobSpy | MIT | ✅ core + plugin (attribution) |
| Dreamwork MCP + 13 feeds | MIT | ✅ (attribution) |
| groundtruth board catalog | MIT (data) | ✅ data (plan 018) |
| Jobbie feed | MIT | ✅ (plan 019) |
| Four-Leaf client | MIT | ✅ client only |
| Firecrawl core | AGPL-3.0 | ✅ core only; SDK MIT ✅✅ |
| **OpenPostings** | **NO LICENSE** | ❌ ideas only |
| **JobOps** | **AGPL + Commons Clause** | ❌ ideas only |
| **recruiters.rip** | **BSL 1.1 → Apache 2030** | ❌ until 2030; ideas now |
| **Simplify listings** | **NO LICENSE** | ❌ |

**Rule**: for ❌ donors, borrow *ideas and public endpoint facts* (not
copyrightable), write clean implementations. Never copy their code, schemas
verbatim, or prose. The sub-projects below are all clean-room designs inspired
by observed behavior, not ports of unlicensed code.

## Current state (anchors)

- `src/core/rules.ts` — deterministic scoring/spam rules; `src/core/decisions.ts` — `DECISION_QUESTIONS`, `decisionAction`, `scoreShift`, `ModelDecision` (scam/closed/kind). `src/pipeline/decide.ts` — cascade classifier; `setLeadDecision(... reason: 'model …: scam X, closed Y, kind')`, `updateLeadScore(clamp 0..100)`.
- `src/pipeline/enrich.ts` — LLM enrichment. `src/hub/rating.ts` — participant rating ledger (BIP-340). `src/pipeline/outbox.ts` — delivery outbox (plan 009 makes it exactly-once).
- `src/mcp/server.ts` — tools: `search_leads`, `get_lead_details`, `submit_lead` (write), `vote_lead` (write), `get_market_analytics`, `list_saved_searches`, `save_search` (write). **Write tools already exist** — a safety-ladder applies to them, not a hypothetical future.
- `src/sources/ats.ts` — `maxAgeDays` 30 filter; boards list every open job (years-old too). `src/core/dedup.ts` — MinHash dedup.
- `src/core/xray.ts` — X-Ray dorks for contacts.

## Sub-projects (pick one)

### A. Explainable scoring: checks + gates + letter verdict (from SuperImpress / pathpipe / JobOps — ideas only)

**Goal**: replace the single opaque 0–100 score with a small set of named checks and binary gates, plus a human-readable verdict, without breaking the existing score contract.
- Add to the decision/score output: `checks` (e.g. work-match, seniority, requirements, industry, location) each `{name, pass, note}`; `gates` (right-to-work/language/company-blocklist) as hard binary filters applied BEFORE scoring; `verdict` ∈ strong/stretch/skip derived from score+gates.
- Essential-criteria gate (pathpipe idea): a user/profile "essential" miss ⇒ not strong fit regardless of numeric score.
- Keep `updateLeadScore` 0–100 intact (downstream/UI depend on it); the checks are additive metadata on the decision/lead, surfaced in `get_lead_details` and the UI lead card.
- **In scope**: `src/core/decisions.ts`, `src/pipeline/decide.ts`, `src/core/types.ts` (additive fields), `src/server/ui.ts` (lead card), `src/mcp/server.ts` (details projection), tests. **Out**: rewriting rules.ts scoring math; the hot path (plan 013 owns perf).
- **Verify**: `pnpm typecheck && pnpm test` → pass; a fixture lead shows checks+gates+verdict; a gated lead is never "strong".
- **STOP**: if the score contract is consumed in a way that additive fields break (re-read `toPublicLead`/UI first).

### B. Freshness + ghost-job detection (from OpenPostings soft-hide / groundtruth job_changes / Four-Leaf active:false — ideas only)

**Goal**: distinguish "closed/removed" from "never seen", and keep history for dedup instead of hard-deleting.
- Soft-hide expired postings (mark `hidden`/`closed` with a timestamp) rather than delete, so dedup history survives (OpenPostings `pruneExpiredPostings` idea).
- Optional board-diff: snapshot a board's job-id set per poll; emit `posted`/`removed`/`reopened` signals (groundtruth `job_changes` idea) → a removed job becomes `active:false` (Four-Leaf idea) instead of vanishing.
- Age-based inactive threshold (Simplify/Jobbie idea) as a cheap ghost-job heuristic.
- **In scope**: `src/sources/ats.ts` (per-board snapshot, bounded), `src/core/types.ts`, store interface + memory/postgres (additive status), tests. **Out**: a full crawler; plan 013's perf work.
- **Verify**: `pnpm typecheck && pnpm test`; a removed job is `active:false`, not deleted; dedup still recognizes a reopened job.
- **STOP**: if snapshot storage grows unbounded (cap per-board history; report).

### C. MCP safety-ladder for write tools (from Dreamwork / OpenPostings — MIT Dreamwork code OK)

**Goal**: consequential MCP tools (`submit_lead`, `vote_lead`, `save_search`, and any future apply/reply) require explicit confirmation and are dry-run by default.
- Dreamwork pattern (MIT, may adapt with attribution): first call returns `held` + summary + `confirmationToken`; execution only on repeat with the token AND identical args; receipt ledger. OpenPostings idea: `dry_run_only=true` default, `commit=false` default, `approved_by_user` required, attribution "agent acted on behalf of user", dedup repeat by URL.
- Scope keys (Dreamwork): read/write/apply/send; a key cannot manage keys/session/account.
- Cursor digest (Dreamwork): `search_leads` cursor carries a filter digest; a foreign cursor is rejected, not silently continued.
- Tool-catalog drift test (Dreamwork): generate the README/llms.txt tool table from registered tools and assert equality in CI (ties into plan 007/011).
- **In scope**: `src/mcp/server.ts`, `src/core/types.ts` (token/receipt types), store (receipt ledger), tests, `server.json`/llms.txt (plan 011 coordination). **Out**: changing read-tool behavior.
- **Verify**: `pnpm typecheck && pnpm test`; a write tool without confirmation returns `held`; with token+identical args it executes once; replay is deduped.
- **STOP**: if existing write-tool callers (extension/web) would break (keep a compatibility path; report).

### D. Visa-sponsor enrichment (from JobOps — government open data, clean implementation)

**Goal**: for relocation-minded users, annotate a lead's company with "sponsors visas / unknown" using official open registers. Killer feature for the RU relocation audience.
- Registers (public government data): UK gov.uk Register of Licensed Sponsors, US USCIS H1B Data Hub, CA open.canada.ca LMIA (CKAN), NL IND recognised sponsors. Match lead.company against the register (normalized name fuzzy match), store a `visaSponsor` hint with source+date.
- This is an enrichment layer (like salary), NOT a scoring gate by default; surface in details/UI as a hint with provenance.
- **In scope**: NEW `src/research/visa-sponsors.ts` (register loaders + matcher), `src/pipeline/enrich.ts` (optional hook), `src/core/types.ts`, tests with saved register fixtures (no network in tests). **Out**: live scraping of gov sites in the poll loop (load registers as periodic static snapshots).
- **Verify**: `pnpm typecheck && pnpm test`; a known sponsor matches; an unknown company is "unknown", never "no".
- **STOP**: if a register's license/terms forbid redistribution (check each; store only the match hint, not the raw register, if required).

### E. Source-quality feedback + idempotent expensive calls (from Firecrawl Alexandria — AGPL core ideas)

**Goal**: rate source quality per result and make expensive LLM/enrichment calls idempotent.
- Firecrawl pattern: per-result feedback token → source quality rating (extend `src/hub/rating.ts` from participants to sources); idempotency key = hash(actor, request-id) with a replay window for costly enrich calls (avoid double-charging/double-running).
- **In scope**: `src/hub/rating.ts` (source dimension), `src/pipeline/enrich.ts` (idempotency), store, tests. **Out**: credit billing (the hub is free — no money layer).
- **Verify**: `pnpm typecheck && pnpm test`; a replayed enrich call returns the cached result; source rating updates from feedback.
- **STOP**: if idempotency storage conflicts with plan 009's outbox leases (coordinate; same store file).

### F. Public listing feed as distribution (from Simplify / Jobbie / Dreamwork — our data, our license)

**Goal**: publish a daily OpenRadar listing repo (JSON + Markdown, direct original links, RU-remote/TG focus) for SEO/stars/distribution — the reverse of plan 019 (we become the feed others ingest).
- Daily auto-commit artifact generated from our store; age-based inactive thresholds; every row links to the ORIGINAL employer post (ethic-aligned, unlike Dreamwork's redirect).
- **In scope**: NEW `scripts/publish-listing-feed.mjs` + a CI workflow; docs. **Out**: changing the core pipeline; this is a publishing tool.
- **Verify**: the script produces valid JSON+MD from a fixture store; links are originals; `pnpm test` stays green.
- **STOP**: if publishing would expose guest-redacted contacts (reuse `toPublicLead` projection; never publish redacted data).

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Typecheck | `pnpm typecheck`         | exit 0              |
| Tests     | `pnpm test`              | all pass            |
| Version   | `node scripts/check-version.js` | pass (if version touched) |

## Git workflow

- Branch per sub-project: `advisor/021a-explainable-scoring`, `021b-freshness`, `021c-mcp-safety`, `021d-visa`, `021e-source-quality`, `021f-listing-feed`.
- Commit style matches the repo. Do NOT push or open a PR unless the operator instructed it.

## Done criteria (per chosen sub-project)

- [ ] `pnpm typecheck` exits 0; `pnpm test` exits 0
- [ ] The sub-project's specific Verify above passes
- [ ] No ❌-donor code copied (clean-room; attribution for MIT donors)
- [ ] No files outside that sub-project's scope modified (`git status`)
- [ ] `plans/README.md` 021 row reflects which sub-projects shipped

## STOP conditions (global)

- Any temptation to copy OpenPostings/JobOps/recruiters.rip/Simplify code → STOP, redesign clean-room.
- A sub-project regresses plans 001–006 (salary quality), 008 (dedup), 009 (outbox), or 013 (perf) → STOP, coordinate.
- A verification fails twice after a reasonable fix attempt.

## Maintenance notes

- Recommended order: **C** (MCP safety — write tools already exist, highest trust value) → **A** (explainable scoring — user-facing differentiation) → **D** (visa enrichment — RU relocation moat) → **B** (freshness) → **E** (source quality) → **F** (distribution).
- Each sub-project is independently shippable and independently valuable; none requires the others.
- The full donor analysis with endpoint facts is in `.research/repos/findings.md` and `.research/repos/sources-inventory.json` (when written). Endpoint facts are not copyrightable; implementations must be our own.
- Reviewer: confirm license isolation per sub-project; confirm no hot-path regression; confirm MIT attribution where code was adapted (Dreamwork C, JobSpy if used).
