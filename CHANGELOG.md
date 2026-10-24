# Changelog

## 0.4.2

- Growth layer: search-driven SEO landing pages (`/catalog/:slug`, 10 pages like
  "Заказы на разработку"), `robots.txt` and `sitemap.xml`; every landing doubles
  as an RSS subscription with feed auto-discovery.
- Telegram digest: top fresh leads sent to `RADAR_DIGEST_CHAT_ID` every
  `RADAR_DIGEST_INTERVAL_HOURS` (default 6) via the existing bot token.
- Stored lead text is capped at 3000 chars (new leads + migration 007 backfill),
  and `sanitizePrivacy` is applied centrally in `prepareRawLead` so phone/email
  from any source or submission never reach the public base (152-ФЗ).
- Lead type heuristics: URLs/titles like Habr Career vacancies are typed `job`;
  migration 007 backfills historical rows, so the "Вакансии" tab is no longer
  limited to RemoteOK.

## 0.4.1

- CI runs the suite twice: against the in-memory store and against a real PostgreSQL 17 + pgvector service (`RADAR_TEST_STORE=postgres`, per-test schema reset via `test/postgres-setup.ts`).
- Fixed in PostgresStore by that new coverage: `insertLead` did not store the lead `type` (the job/gig filter silently returned only gigs in production), and `getSourceHealth` returned `successRate` as a fraction while the UI and the memory store use percent.
- Salary extraction from free text is now anchored to a currency unit or a marker word ("оклад", "вилка"): "3 - 5 лет опыта" no longer becomes a salary range (`extractAnchoredSalary`).
- Added migration `006_search_trgm.sql`: pg_trgm GIN indexes on `title` and `text` so the ILIKE search fallback stops doing sequential scans.
- Rate limiting on sensitive endpoints (login, votes, submit, preview, ingest), a `Content-Security-Policy` header, and hourly purging of expired sessions alongside the other maintenance cleanups.

## 0.4.0

- GitHub OAuth login (`/auth/github`): voting and lead submission via `/submit` now require a registered user; anonymous visitors can browse.
- Votes are stored per user in `lead_votes` (one vote per signal, weight 1.0); client-supplied `weight`/`reputation` was removed from the vote API until the reputation engine ships.
- The lead funnel (statuses and `+10/-20` feedback) is admin-only again.
- Security fixes: `/api/preview` fetches through the SSRF-guarded client with DNS checks on every redirect hop; the RSS feed escapes `]]>` inside CDATA; a duplicate `external_id` no longer aborts the whole poll run.
- Added migration `005_github_auth.sql` (`sessions.user_id`).

## 0.3.0

- Product UI: separate Leads and Sources pages, a lead detail page, search and status filters.
- Source editing: title, filters and connection settings can be changed without recreating the source.
- Rejected leads are sorted below actionable ones.
- Cleaner first-run and empty states; monochrome layout with a consistent top navigation.
- Lead rows link to an internal detail view with full text, score and delivery status.
- Updated screenshots and README.

## 0.2.3

- The dashboard, source page, login and extension popup are fully monochrome.
- Status is conveyed by filled, ring and muted dots instead of colour.
- Updated screenshots.

## 0.2.2

- The admin session cookie is marked `Secure` when the request arrives over HTTPS.
- Test deployment behind nginx with `X-Forwarded-Proto`.

## 0.2.1

- Sources can be added, enabled, disabled and deleted from the dashboard.
- New source form covers RSS, Telegram, Kwork, IMAP and webhook; webhook tokens are shown once.
- Updated CI actions to checkout v7, setup-node v7 and pnpm/action-setup v6.
- Added tests for the dashboard source flow.

## 0.2.0

- Added an IMAP source for job-alert emails; credentials stay in an environment variable.
- Added per-source health: 24-hour counters, success rate, last run and a `/sources/:id` page.
- Added a Manifest V3 browser extension that sends a page or selection to a webhook source.
- Redesigned the dashboard and source page: fewer blocks, one accent, no cards or shadows.
- Added `--token` for webhook sources and automatic token generation.
- Added the `defineSource` / `defineSink` SDK helpers and `docs/PLUGINS.md`.
- Added CI, `SECURITY.md`, `PUBLISHING.md` and the extension guide.

## 0.1.0

- Initial MVP: RSS, Telegram public, Kwork and webhook sources.
- SQLite store, deduplication, spam rules, scoring.
- Console, Telegram and webhook sinks.
- CLI, HTTP API, server-rendered dashboard.
- 28 tests and a Dockerfile.
