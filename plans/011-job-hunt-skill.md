# Plan 011: Ship the job-hunt skill and a complete server.json (agent distribution, roadmap #59)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 260a650..HEAD -- server.json src/mcp/server.ts src/cli/index.ts package.json src/version.ts test/mcp.test.ts test/sdk.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: plans/007-machine-docs-truth.md (the skill documents tool names; they must be truthful first)
- **Category**: direction
- **Planned at**: commit `260a650`, 2026-11-11

## Why this matters

Firecrawl's job-hunt skill wins distribution: one install gives an agent a complete resume→roles→contacts→outreach workflow. OpenRadar has the data advantage (RU boards, freelance gigs, closed Telegram channels, free contacts from posts, compensation estimates) but no packaged skill — roadmap #59 promises "skills" yet no `skills/` directory exists. Meanwhile `server.json` (the MCP Registry manifest) advertises only the hosted remote; the project's main pitch — "run your own node" — is invisible to registries because the stdio package (`radar mcp`) is not declared. This plan ships both: a self-contained job-hunt skill over the existing MCP tools, and a complete registry manifest.

**External validation (2026-11-11, full 15-page competitor report):** Firecrawl announced job search tools for ChatGPT/Claude on Nov 10 (19:49 MSK; the post link resolves to `alexandria.firecrawl.dev/go/jobtools` → Jobs catalog; claims «7M+ open roles» and «250M+ professional profiles»). By Nov 11 ~16:30 MSK the post had ~986k views and 12,434 saves vs 5,574 likes — saves > likes signals a large audience bookmarking a job-hunt tool. An independent comparison against v0.67.0 concludes: not a direct competitor on RU/Telegram, but confirmation that plugin + MCP is the right distribution channel. Distribution parity detail: Firecrawl installs as a ChatGPT plugin, Claude connector, and MCP in Cursor/Codex/Claude Code/Gemini CLI (official Cursor server `https://mcp.firecrawl.dev/v2/mcp-oauth`, account login, no key in config) — our `server.json` must likewise declare BOTH the hosted remote and the stdio package so registries see the self-host pitch.

**Trust objection to answer in the skill text:** the blog says "no mail merge, no automatic chains", yet co-founder Eric Ciarla's launch quote promoted cold email "at scale" (243 likes / ~24k views) — and "at scale" is exactly what the comments attack (top skepticism: "Is this the new way to automatically get mass rejected?", "flood recruiters with near-identical resumes", "don't build an AI slop cannon"; three persistent fears: auto-rejections/spam, freshness/accuracy, credit cost). The skill's drafts-only outreach rule below mirrors the blog stance and our ARCHITECTURE.md non-goal — make it visible. Also pitch the report's four verified differentiators: (1) RU + Telegram sources absent from the Jobs catalog and from OpenPostings/JobOps; (2) free hub with no per-view credit meter; (3) clean licensing — core AGPL-3.0 + plugin Apache-2.0, versus OpenPostings (NO LICENSE file) and JobOps (AGPL + Commons Clause, not OSI); (4) dedup + freshness + link-to-original as the direct answer to "the same three remote roles" / "is this vacancy still open?", plus freelance gigs Firecrawl lacks. Do NOT copy code from OpenPostings/JobOps (license-incompatible); architectural ideas only. (Source: competitor report PDF, 15 pages; figures as reported.)

## Current state

- `server.json` (whole file):

```json
{
  "$schema": "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json",
  "name": "io.github.MikhailSagalaev/openradar",
  "title": "openradar",
  "description": "Open base of job vacancies and freelance orders from Russian and international boards and Telegram.",
  "version": "0.67.0",
  "websiteUrl": "https://openradar.fun",
  "repository": { "url": "https://github.com/MikhailSagalaev/openradar", "source": "github" },
  "remotes": [ { "type": "streamable-http", "url": "https://openradar.fun/mcp" } ]
}
```

- `package.json`: `"name": "radar"`, `"bin": { "radar": "./bin/radar.js" }`, version `0.67.0`. `bin/radar.js` imports `../dist/cli/index.js` (built by `pnpm build`).
- `src/cli/index.ts:1135–1146` — `radar mcp` runs the MCP server over stdio (`startMcpStdio`).
- `src/mcp/server.ts:56` — `export const MCP_TOOLS`: `search_leads`, `get_lead_details`, `estimate_compensation`, `submit_lead`, `vote_lead`, `get_market_analytics`, `save_search`, `list_saved_searches`, `xray_generate_dorks`. Read each tool's `description` and `inputSchema` there before writing the skill — the skill must match them exactly.
- `src/version.ts` — `export const VERSION = '0.67.0'`. `AGENTS.md` §2.1: version changes must update `package.json`, `src/version.ts`, `server.json` together (`scripts/check-version.js` enforces). This plan does NOT bump the version.
- No `skills/` directory exists (`git ls-tree -r HEAD --name-only | grep -i skill` → empty).
- MCP auth: keyless guest access; a participant key raises the tier (`src/server/app.ts:2510` route; token via `Authorization: Bearer …` or `x-radar-token`). The stdio server uses the local store directly (no token needed).
- Conventions: docs are bilingual where user-facing (ru primary); `AGENTS.md` is the agent guide; tests must not make live network calls.

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Typecheck | `pnpm typecheck`         | exit 0, no errors   |
| Tests     | `pnpm test`              | all pass (baseline: 82 files, 690 tests) |
| Version lock | `node scripts/check-version.js` | exit 0 |
| Build     | `pnpm build`             | exit 0 (stdio entry must exist in dist/) |
| Stdio smoke | `echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' \| node bin/radar.js mcp` | JSON-RPC response listing the 9 tools (PowerShell: `'{"jsonrpc":"2.0","id":1,"method":"tools/list"}' \| node bin/radar.js mcp`) |

## Scope

**In scope** (the only files you should modify/create):
- `skills/job-hunt/SKILL.md` (create)
- `server.json` (add `packages`, keep `remotes`)
- `test/mcp.test.ts` (manifest/skill parity tests)
- `AGENTS.md` (one line pointing at the skill, repository map row)

**Out of scope** (do NOT touch):
- `src/mcp/server.ts` — tools are the truth; if a tool is missing for the workflow, note it in Maintenance notes, do not add tools here.
- `package.json`, `src/version.ts` — no version bump, no new scripts.
- `src/server/seo.ts`, `src/server/openapi.ts` — plan 007 owns them.
- Any Firecrawl/Alexandria integration code — the skill may REFERENCE optional external enrichment (Step 2), but no adapter is built here (that is plan 015).

## Git workflow

- Branch: `advisor/011-job-hunt-skill`
- Commits: `feat(skills): job-hunt workflow over the openradar MCP tools`, `feat(registry): declare the stdio package in server.json`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Declare the stdio package in server.json

Add a `packages` array alongside `remotes` (keep everything else):

```json
  "packages": [
    {
      "registryType": "npm",
      "identifier": "radar",
      "version": "0.67.0",
      "transport": { "type": "stdio" },
      "runtimeHint": "node",
      "environmentVariables": [
        { "name": "DATABASE_URL", "description": "PostgreSQL connection string; without it the node uses an ephemeral in-memory store", "isRequired": false },
        { "name": "RADAR_ADMIN_TOKEN", "description": "Admin token for the HTTP API; not needed for stdio MCP", "isRequired": false }
      ]
    }
  ]
```

IMPORTANT: before writing, verify the npm package name actually published (`npm view radar name` may be a DIFFERENT package — the repo's package.json says `radar`, but check whether publishing happens under a scope; grep `.github/workflows/` for `npm publish` and the README install instructions). If the published name differs, use the published name and note the discrepancy. If nothing is published to npm yet, use `"registryType": "npm"` with the package.json name and add a STOP note in the plan row — do not invent a scope. The `version` MUST equal `package.json`'s version (the parity test in Step 3 enforces it).

**Verify**: `node scripts/check-version.js` → exit 0; `pnpm test -- mcp` → all pass.

### Step 2: Write skills/job-hunt/SKILL.md

A self-contained skill an agent can follow with ONLY the openradar MCP server connected. Structure (write in English with Russian examples, matching repo docs style):

1. **Frontmatter**: `name: job-hunt`, `description:` one line — when to use it (user asks to find jobs/orders matching a resume, RU or intl).
2. **Setup**: two connection modes — hosted (`https://openradar.fun/mcp`, streamable-http, keyless guest; participant key via `Authorization: Bearer` raises tier and unlocks contacts) and self-hosted (`npm i -g radar && radar mcp` stdio, or `radar serve` + `http://127.0.0.1:8787/mcp`). State the zero-paywall principle: no credits, no per-record fees.
3. **Workflow** (mirror the Firecrawl skill's steps but over our tools):
   - Ask for the resume (paste/attach) and location (city or remote). Wait.
   - Extract titles/seniority/skills from the resume. Run `search_leads` several times: `type: 'job'` for vacancies and `type: 'gig'` for freelance orders; vary title keywords; use the occupation/remote filters the tool's inputSchema actually declares (read it — do not invent filters). For remote, filter by country/city only and mark which leads say remote.
   - Pull 3–5 pages of 10, dedupe by lead id, rank by fit. Skip recruiters/staffing (the feed already flags agencies — use the lead's employer fields; describe what `get_lead_details` returns).
   - Show up to 10 strong fits: company, role, location, date, link, one line why. Say if fewer.
   - Compensation check: `estimate_compensation` per top lead — "is the pay fair for this role/market" (this is our edge over the Firecrawl skill).
   - Market context: `get_market_analytics` for the role's median/percentiles and trending skills.
   - Contacts: `get_lead_details` returns the contacts published IN the post (Telegram/phone/email) — free, no enrichment API. For decision-makers beyond the post, `xray_generate_dorks` produces LinkedIn/X-Ray search dorks; the agent runs them in a browser if available. Be explicit: we do NOT sell verified emails; optional external enrichment (Apollo/FullEnrich via the user's own Firecrawl key) is out of scope of this skill's core flow.
   - Save the search: `save_search` + `list_saved_searches` so the user gets ongoing delivery.
   - Outreach drafts: tie the user's experience to the lead text; drafts only — auto-sending is a project non-goal (ARCHITECTURE.md). State this explicitly in the skill (e.g. "drafts only; never auto-send; never mail-merge"): Firecrawl's own job-tools blog makes the same promise, and comment-section fear of spam/auto-rejections is the main trust objection — matching it is a positioning win, not just a constraint.
4. **Tool reference table**: name → purpose → key args, copied from `MCP_TOOLS` descriptions (truthful, per plan 007).
5. **Limits**: guest tier sees delayed feed without contacts on the hub; a self-hosted node has no delays. Rate limits exist (60 req/min on /mcp) — pace calls.

**Verify**: the file exists; every tool name in it appears in `MCP_TOOLS` (Step 3 test).

### Step 3: Parity tests

In `test/mcp.test.ts` (read its existing structure first), add:
1. `server.json` version equals `package.json` version and `src/version.ts` VERSION (import VERSION; read the JSONs with `fs.readFileSync` + `JSON.parse`, paths relative to the repo root via `new URL('../server.json', import.meta.url)`).
2. `server.json.packages[0].version` equals the same version; `packages[0].transport.type === 'stdio'`; `remotes[0].url` ends with `/mcp`.
3. Skill parity: read `skills/job-hunt/SKILL.md`; for every `MCP_TOOLS` tool name, expect the skill text to contain it; extract backticked tool-like tokens (`/`search_leads`/` style) from the skill and expect each to be a real tool name (catches invented tools).

**Verify**: `pnpm test -- mcp` → all pass including 3 new tests.

### Step 4: Point AGENTS.md at the skill

Add one row to the Repository Map: `skills/` | Agent skills over the MCP surface (`job-hunt`: resume → search → compensation → contacts → saved search). Add one sentence in the MCP section referencing `skills/job-hunt/SKILL.md` as the canonical agent workflow.

**Verify**: `pnpm typecheck` → exit 0; `pnpm test` → all pass.

## Test plan

- New: 3 parity tests in `test/mcp.test.ts` (version lock incl. packages, transport shapes, skill↔tools parity).
- Manual smoke (not a unit test — needs a built dist): `pnpm build` then the stdio `tools/list` command from the table above → 9 tools.
- Verification: `pnpm test` → all pass (baseline 690 + 3).

## Done criteria

- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm test` exits 0; the 3 new tests exist and pass
- [ ] `node scripts/check-version.js` exits 0
- [ ] `skills/job-hunt/SKILL.md` exists and names only real MCP tools (covered by test)
- [ ] `server.json` declares both `packages` (stdio) and `remotes` (http)
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

- The npm package name is ambiguous (published under a different name/scope, or not published at all) — report what you found; do not guess.
- `MCP_TOOLS` differs from the 9 names listed (drift) — re-derive the skill's tool table from the live export.
- The MCP registry schema rejects `packages` shape (validate against the `$schema` URL if reachable; otherwise match the schema's documented examples) — report the validation error.
- A verification fails twice after a reasonable fix attempt.

## Maintenance notes

- When tools change, the Step-3 parity test forces a skill update in the same PR.
- Deferred: a second skill (`market-research` over `get_market_analytics` + /research), publishing the skill to agent marketplaces, and the Alexandria hybrid enrichment (plan 015 builds the adapter; the skill can then reference it).
- The hosted remote needs no auth for guests; if tier-gated tools are added later, document the token flow in the skill's Setup section.
- Reviewer: read the skill end-to-end as if you were an agent with only the MCP server — every step must be executable with the declared tools and no invented filters.
