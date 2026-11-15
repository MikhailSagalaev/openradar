# Plan 007: Make the machine-readable docs tell agents the truth

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 260a650..HEAD -- src/server/openapi.ts src/server/seo.ts test/openapi.test.ts test/seo.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: docs
- **Planned at**: commit `260a650`, 2026-11-11

## Why this matters

Agents discover OpenRadar through `/openapi.json` and `/llms.txt` (MCP directories, Smithery, Glama). Today the OpenAPI spec describes `/mcp` as a **GET** endpoint while the server only accepts **POST** (GET returns 405), and `llms.txt` tells agents to call `get_market_stats` — a tool that does not exist (the real one is `get_market_analytics`; calling the documented name returns JSON-RPC error -32601). Every generated client breaks on its first call. This is the flagship distribution surface of the project (roadmap #59); Firecrawl wins agents precisely because its contracts are accurate.

## Current state

- `src/server/openapi.ts` — builds the OpenAPI 3.1 document. Lines 160–166:

```ts
      '/mcp': {
        get: {
          summary: 'Model Context Protocol server',
          description: 'Streamable HTTP MCP with tools search_leads, get_lead_details, estimate_compensation, submit_lead, vote_lead, get_market_analytics, save_search, list_saved_searches, xray_generate_dorks. Keyless guest access; a signed participant key raises the tier.',
          responses: { '200': { description: 'JSON-RPC over MCP; see https://modelcontextprotocol.io' } },
        },
      },
```

- `src/server/app.ts:2508–2510` — the real routes (do NOT change them):

```ts
  app.on(['GET', 'DELETE'], '/mcp', (c) => c.body(null, 405, { allow: 'POST' }));
  app.post('/mcp', rateLimit({ windowMs: 60_000, max: 60 }), async (c) => {
```

- `src/server/seo.ts:1677` — inside `renderLlmsTxt`:

```
- [HTTP API и MCP](${baseUrl}/openapi.json): OpenAPI-схема публичного API; каталог — ${baseUrl}/.well-known/api-catalog; MCP-сервер — ${baseUrl}/mcp (tools: search_leads, get_lead_details, get_market_stats).
```

- `src/mcp/server.ts:56` — the single source of truth: `export const MCP_TOOLS: McpTool[] = [ … ]`. `tools/list` returns it verbatim (line 344).
- `test/openapi.test.ts` — existing contract tests; pattern: `makeRuntime()` → `app.request('/openapi.json')` → assert on the parsed spec. It already checks the main paths exist and that every live `/api/leads` field is in the `Lead` schema.
- `test/seo.test.ts` — imports `renderLlmsTxt` from `../src/server/seo.ts` and tests it directly.
- Conventions: `AGENTS.md` §2 — `pnpm typecheck` includes `test/`; zero live network calls in tests; no inline `<script>` CSP violations. Version lock (`package.json` / `src/version.ts` / `server.json`) is NOT touched by this plan.

## Commands you will need

| Purpose   | Command                        | Expected on success |
|-----------|--------------------------------|---------------------|
| Typecheck | `pnpm typecheck`               | exit 0, no errors   |
| Tests     | `pnpm test`                    | all pass (baseline: 82 files, 690 tests) |
| Focused   | `pnpm test -- openapi seo`     | all pass            |

## Scope

**In scope** (the only files you should modify):
- `src/server/openapi.ts`
- `src/server/seo.ts`
- `test/openapi.test.ts`
- `test/seo.test.ts`

**Out of scope** (do NOT touch):
- `src/server/app.ts` — the routes are correct; the docs are wrong.
- `src/mcp/server.ts` — the tool list is the truth, not the thing to fix.
- `server.json`, `package.json`, `src/version.ts` — no version bump in this plan.
- Any other doc prose (README, docs/) — only the two machine-read surfaces.

## Git workflow

- Branch: `advisor/007-machine-docs`
- Commit style matches the repo (conventional): `fix(docs): describe /mcp as POST and list real MCP tools in llms.txt`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Describe /mcp as POST in the OpenAPI spec

In `src/server/openapi.ts`, replace the `get:` key of the `'/mcp'` path with `post:`. Keep the summary/description text. Add a `requestBody` describing JSON-RPC 2.0 (content `application/json`, schema `{ type: 'object' }` — do not invent a full JSON-RPC schema) and keep the `200` response. Do not add a `get` entry: GET is a 405 by design.

**Verify**: `pnpm typecheck` → exit 0.

### Step 2: Make llms.txt name the real tools

In `src/server/seo.ts` line ~1677, replace the hardcoded tool list `search_leads, get_lead_details, get_market_stats` with the full real list, comma-separated: `search_leads, get_lead_details, estimate_compensation, submit_lead, vote_lead, get_market_analytics, save_search, list_saved_searches, xray_generate_dorks`. Keep the rest of the line unchanged. (Hardcoding is acceptable here ONLY because Step 3 adds a test that fails whenever the list drifts from `MCP_TOOLS`.)

**Verify**: `pnpm typecheck` → exit 0.

### Step 3: Add drift-proof contract tests

In `test/openapi.test.ts`, add two tests inside the existing `describe`:

1. `/mcp` is POST-only in the spec:
   - `const spec = await (await app.request('/openapi.json')).json();`
   - `expect(spec.paths['/mcp']).toHaveProperty('post');`
   - `expect(spec.paths['/mcp']).not.toHaveProperty('get');`
   - Live behavior: `const res = await app.request('/mcp'); expect(res.status).toBe(405);` and a POST with body `JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' })`, header `content-type: application/json` → status 200, `body.result.tools` is an array.
2. Tool-list parity: import `MCP_TOOLS` from `../src/mcp/server.ts`; POST `tools/list` as above; expect the returned tool names (sorted) to equal `MCP_TOOLS.map(t => t.name).sort()`. Also assert every tool name appears in `spec.paths['/mcp'].post.description` (the description lists them).

In `test/seo.test.ts`, add one test: import `MCP_TOOLS`; call `renderLlmsTxt` the same way existing tests in that file do (read the file for the exact signature/args); for every `tool.name` in `MCP_TOOLS`, expect the rendered text to contain it; expect it NOT to contain `get_market_stats`.

**Verify**: `pnpm test -- openapi seo` → all pass, including 3 new tests.

## Test plan

- New tests listed in Step 3 (2 in `test/openapi.test.ts`, 1 in `test/seo.test.ts`).
- Structural pattern: the existing tests in those same files (`makeRuntime`, `app.request`).
- Verification: `pnpm test` → all pass (baseline 690 + 3 new).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm test` exits 0; the 3 new tests exist and pass
- [ ] `spec.paths['/mcp'].get` is absent and `.post` present (covered by test)
- [ ] `renderLlmsTxt` output contains no `get_market_stats` (covered by test)
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The excerpts in "Current state" don't match the live code (drift).
- `MCP_TOOLS` is no longer exported from `src/mcp/server.ts` or `tools/list` no longer returns it verbatim.
- A verification fails twice after a reasonable fix attempt.
- The fix appears to require touching `src/server/app.ts` or `src/mcp/server.ts`.

## Maintenance notes

- When a tool is added/removed in `src/mcp/server.ts`, the Step-3 parity tests force updating both the OpenAPI description and `llms.txt` in the same change. That is the point.
- Deferred: a full JSON-RPC request schema in OpenAPI, and publishing the spec to MCP registries — separate work (plan 011 covers `server.json`).
