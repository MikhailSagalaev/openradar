# AGENTS.md — Engineering & AI Agent Guide for openradar

This document defines the architecture, invariants, and verification commands for AI coding agents (Claude Code, Cursor, Codex, OpenCode, Gemini) and contributors working in `openradar`.

## 1. Quick Commands

```bash
pnpm install                       # install dependencies (Node 22.19+ or 24 LTS, pnpm 12+; CI tests both)
node scripts/check-version.js      # MUST PASS: package.json, src/version.ts, and server.json versions must match
pnpm typecheck                     # MUST PASS: tsc --noEmit (typechecks src/ and test/; @types/node is held at the Node 22 minimum)
pnpm build                         # MUST PASS: tsc -p tsconfig.build.json (builds dist/)
pnpm test                          # MUST PASS: vitest run against in-memory store (no network calls; TZ forced to Europe/Moscow as in CI)
pnpm lint                          # MUST PASS: oxlint over src/, test/, extension/, scripts/, bin/ (correctness rules; baseline debt in .oxlintrc.json)
pnpm test:python                   # Python SDK unit tests (uses python3, python or py -3, whichever is Python 3)
pnpm verify                        # MUST PASS: the local CI subset — lint + version lock + typecheck + build + tests + Python SDK
pnpm pack:extension                # builds extension.zip (not committed; the Docker build packs its own)
```

To run the full test suite against PostgreSQL (as CI does):

```bash
RADAR_TEST_STORE=postgres DATABASE_URL=postgres://radar:test_password@127.0.0.1:5432/radar_test pnpm test
```

CI runs that suite twice: against `pgvector/pgvector:pg18-trixie` (no `pg_search`: the `tsvector` search fallback) and against the pinned ParadeDB image of `docker-compose.yml` (BM25 `@@@` / `paradedb.score`). Bump the ParadeDB tag in `docker-compose.yml` and `.github/workflows/ci.yml` together.

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
| `src/core/` | Domain types (`types.ts`) and the store interface (`store.ts`), scoring & spam rules (`rules.ts`), salary and budget normalization (`salary.ts`, `extract.ts`, reference FX rates `fx.ts`, `salary-sanity.ts`), text cleanup (`text.ts`), fingerprints & MinHash sketches (`fingerprint.ts`), viewer access tiers (`access.ts`), source health & quality (`source-health.ts`, `source-quality.ts`), SSRF guard (`ssrf.ts`), URL canonicalization (`url.ts`), JobSpy export (`jobspy.ts`), X-Ray dorks (`xray.ts`) |
| `src/pipeline/` | Poll loop and background workers (`runner.ts`, `poll.ts`), lead ingestion (`ingest.ts`), near-duplicate merge by MinHash (`similar.ts`), schema.org page enrichment of short posts (`enrich.ts`), LLM decision worker (`decide.ts`), subscriptions & digests (`subscriptions.ts`, `digest.ts`), closed-post checks (`liveness.ts`), outbox (`outbox.ts`), re-processing jobs (`rescore.ts`, `refilter.ts`, `rekey.ts`, `retitle.ts`) |
| `src/sources/` | Source adapters (`rss.ts`, `telegram.ts`, `telegram-account.ts`, `hh.ts`, `kwork.ts`, `ats.ts`, `career-sites.ts`, `json-boards.ts`, `imap.ts`, `webhook.ts`, etc.), shared HTTP helpers (`http.ts`) and catalog presets (`presets.ts`) |
| `src/net/` | `radar/2` signed events (`protocol.ts`), secp256k1 keys & BIP-340 Schnorr signatures (`keys.ts`), robots.txt (`robots.ts`), bounded body reads (`body.ts`), outbound proxy (`proxy.ts`), TLS key-exchange groups (`tls.ts`) |
| `src/hub/` | Hub side of `radar/2`: event intake (`service.ts`), web-observation key (`web-key.ts`), participant rating ledger (`rating.ts`) |
| `src/sinks/` | Delivery sinks: console, Telegram, webhook, and node→hub signed sharing (`hub.ts`) |
| `src/classifier/` | OpenAI-compatible LLM classifier client (`openai.ts`) |
| `src/mcp/` | Model Context Protocol server (`server.ts`, tool list `MCP_TOOLS`) — JSON-RPC 2.0 over Streamable HTTP (`/mcp`) and stdio (`radar mcp`); input safety (`safety.ts`) |
| `src/research/` | Live market research report (`/research`), salary percentiles, role classification (`derive.ts`), model fact extraction (`model.ts`), FX history (`fx.ts`), visa sponsors, methodology pages |
| `src/server/` | Hono HTTP server (`app.ts`, `v2.ts`, `admin.ts`), SSR UI (`ui.ts`, `seo.ts`), i18n (`i18n.ts`), OpenAPI 3.1 (`openapi.ts`), auth & rate limits, extension collector (`collector.ts`) |
| `src/store/` | Storage implementations: in-memory (`memory.ts`) and PostgreSQL 18 with optional ParadeDB `pg_search` + `pgvector` (`postgres.ts`); migration runner (`migrator.ts`) |
| `src/publish/` | Public listing feed (`listing-feed.ts`, run by `scripts/publish-listing-feed.mjs`) |
| `src/cli/` | `radar` CLI (`index.ts`), connector scaffolding (`generator.ts`), push to a hub (`push.ts`); `bin/radar.js` runs the built CLI |
| `src/*.ts` | Runtime wiring (`runtime.ts`), env config (`config.ts`), library exports (`index.ts`, `sdk.ts`, `client.ts`), `version.ts` |
| `migrations/` | Numbered SQL migrations (repo root), applied by `radar migrate` via `src/store/migrator.ts` |
| `test/` | Vitest suites, fixtures (`test/fixtures/`), setup files (`setup.ts`, `postgres-setup.ts`) |
| `scripts/` | Tooling: version lock, extension packing, Python SDK runner, deploy helpers (`autodeploy.sh`, `pg-upgrade.sh`, `backup.sh`), feed and story-wall generators, pre-push hook (`hooks/`) |
| `extension/` | Browser extension (Manifest V3) for 1-click lead capture, market pay estimation, and collector |
| `sdk/python/` | Zero-dependency Python SDK (`HubClient`, `NodeClient`, BIP-340 `Key`, Telethon/Pyrogram helpers) |
| `integrations/` | Ready-made n8n workflow templates over the public API |
| `deploy/` | Auxiliary deployables (`model-relay/`: Vercel relay to the Groq API); the server itself deploys with `deploy-server.sh` + `docker-compose.yml` |
| `plans/` | Numbered implementation plans for agents (`plans/README.md`) |
| `docs/` | User and architecture docs (Russian and English) |

## 4. Ethics & Adapter Discipline

- **Respect `robots.txt`:** Check `src/net/robots.ts` and `docs/SOURCES_ROBOTS.md`. Never bypass logins, CAPTCHAs, or paywalls.
- **Keep contacts in the post:** Adapters pass the text and contacts as published; tier-based contact redaction for guests is enforced centrally by the server projection (`toPublicLead`).
- **Scaffolding a new source:** Run `pnpm new:connector <slug>` and follow `docs/PLUGINS.md`.
