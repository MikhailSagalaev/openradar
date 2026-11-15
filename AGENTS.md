# AGENTS.md — Engineering & AI Agent Guide for openradar

This document defines the architecture, invariants, and verification commands for AI coding agents (Claude Code, Cursor, Codex, OpenCode, Gemini) and contributors working in `openradar`.

## 1. Quick Commands

```bash
pnpm install                       # install dependencies (Node 22.19+ / 24 LTS, pnpm 12+)
node scripts/check-version.js      # MUST PASS: package.json, src/version.ts, and server.json versions must match
pnpm typecheck                     # MUST PASS: tsc --noEmit (typechecks both src/ and test/)
pnpm build                         # MUST PASS: tsc -p tsconfig.build.json (builds dist/)
pnpm test                          # MUST PASS: vitest run against in-memory store (no network calls)
pnpm lint                          # MUST PASS: oxlint over src/ and test/ (correctness rules; baseline debt in .oxlintrc.json)
pnpm verify                        # MUST PASS: the local CI subset — lint + version lock + typecheck + build + tests + Python SDK (needs `python` on PATH)
python3 -m unittest discover -s sdk/python/tests  # Python SDK unit tests
```

To run the full test suite against PostgreSQL (as CI does):

```bash
RADAR_TEST_STORE=postgres DATABASE_URL=postgres://radar:test_password@127.0.0.1:5432/radar_test pnpm test
```

## 2. Critical Invariants (Preventing CI Failures)

1. **Three-way version lock (`scripts/check-version.js`):**
   Whenever bumping the version, update **all three files** together:
   - `package.json` (`"version"`)
   - `src/version.ts` (`export const VERSION = ...`)
   - `server.json` (`"version"` for the MCP Registry)
2. **Typecheck includes `test/`:**
   `pnpm build` uses `tsconfig.build.json` (which excludes `test/`), whereas CI runs `pnpm typecheck` (`tsconfig.json`, which includes `test/`). Always run `pnpm typecheck` after changing interfaces in `src/core/types.ts`, `src/server/ui.ts`, or `src/mcp/server.ts`.
3. **Zero live network calls in tests:**
   All unit and integration tests under `test/` must use saved fixtures (`test/fixtures/`) or injected `fetchImpl` mocks. Never make external HTTP requests in tests.
4. **No inline `<script>` blocks violating CSP:**
   Pages rendered by `src/server/ui.ts` and `src/server/seo.ts` are checked by `test/inline-scripts.test.ts` and `test/hardening.test.ts`. Follow existing patterns and run `pnpm test`.

## 3. Repository Map

| Path | Responsibility |
| --- | --- |
| `src/core/` | Domain types (`types.ts`), scoring & spam rules (`rules.ts`), salary normalization (`salary.ts`, `money.ts`), text & skill extraction (`text.ts`), deduplication & MinHash (`dedup.ts`), JobSpy export (`jobspy.ts`), X-Ray dorks (`xray.ts`) |
| `src/pipeline/` | Poll loop (`runner.ts`, `poll.ts`), lead ingestion (`ingest.ts`), LLM enrichment (`enrich.ts`), cascade decision classifier (`decide.ts`), subscriptions (`subscriptions.ts`), outbox (`outbox.ts`) |
| `src/sources/` | Source adapters (`rss.ts`, `telegram.ts`, `telegram-account.ts`, `hh.ts`, `kwork.ts`, `ats.ts`, `career-sites.ts`, `json-boards.ts`, etc.) and catalog presets (`presets.ts`) |
| `src/hub/` | `radar/2` decentralized observation protocol, BIP-340 Schnorr signatures, viewer tiers, and participant rating ledger (`rating.ts`) |
| `src/mcp/` | Model Context Protocol server (`server.ts`) — JSON-RPC 2.0 over Streamable HTTP (`/mcp`) and stdio (`radar mcp`) |
| `src/research/` | Live market research report (`/research`), salary percentiles, role classification (`derive.ts`), and methodology |
| `src/server/` | Hono HTTP server (`app.ts`, `v2.ts`, `admin.ts`), SSR UI (`ui.ts`, `seo.ts`), i18n (`i18n.ts`), OpenAPI 3.1 (`openapi.ts`) |
| `src/store/` | Storage interface implementation for in-memory (`memory.ts`) and PostgreSQL 18 / ParadeDB `pg_search` + `pgvector` (`postgres.ts`), plus SQL migrations (`migrations/`) |
| `extension/` | Browser extension (Manifest V3) for 1-click lead capture, market pay estimation, and collector |
| `sdk/python/` | Zero-dependency Python SDK (`HubClient`, `NodeClient`, BIP-340 `Key`, Telethon/Pyrogram helpers) |

## 4. Ethics & Adapter Discipline

- **Respect `robots.txt`:** Check `src/net/robots.ts` and `docs/SOURCES_ROBOTS.md`. Never bypass logins, CAPTCHAs, or paywalls.
- **Keep contacts in the post:** Adapters pass the text and contacts as published; tier-based contact redaction for guests is enforced centrally by the server projection (`toPublicLead`).
- **Scaffolding a new source:** Run `pnpm new:connector <slug>` and follow `docs/PLUGINS.md`.
