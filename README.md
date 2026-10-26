# OpenRadar

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/logo-white.png">
    <source media="(prefers-color-scheme: light)" srcset="assets/logo-black.png">
    <img alt="OpenRadar Logo" src="assets/logo-black.png" width="360">
  </picture>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-AGPLv3-blue.svg" alt="License: AGPL v3"></a>
  <a href="docs/PROTOCOL.md"><img src="https://img.shields.io/badge/protocol-radar%2F2-purple.svg" alt="Protocol: radar/2"></a>
</p>

**OpenRadar** is an open, non-commercial network that collects job vacancies (`job`) and freelance orders (`gig`) from any source into one clean feed: public boards, RSS, Telegram channels (public or private, through your own account), email alerts, or your own scrapers.

No paywalls, no paid responses, no commercial tier. Contacts stay in the post: you write to the client directly.

> **Status:** radar/2 is being rolled out (v0.7). The self-hosted node works today; the hub protocol is described in [docs/PROTOCOL.md](docs/PROTOCOL.md).

## Two ways to use it

1. **Self-hosted node.** Run `radar` on your machine or server, connect your sources and accounts, and get your own feed and notifications (Telegram, webhook). Nothing leaves your node unless you mark a source as shared.
2. **Join the hub.** Send observations to the shared hub (openradar.fun) from your node, from the SDK or from any scraper. The hub merges posts seen in different places into one lead, credits whoever saw it first, and gives early access by contribution: active contributors see new leads immediately, everyone else with a delay; guests see the feed without contacts.

## Quick start (node)

```bash
git clone https://github.com/MikhailSagalaev/radar-oss.git
cd radar-oss
pnpm install
pnpm dev -- init
pnpm dev -- serve
```

The dashboard opens on `http://127.0.0.1:8787`. Without `DATABASE_URL` the node uses an in-memory store; for production use PostgreSQL 17:

```bash
cp .env.example .env    # set RADAR_ADMIN_TOKEN, POSTGRES_PASSWORD, DATABASE_URL
docker compose up -d
```

`docker compose` refuses to start without real secrets in `.env`.

## Sources

RSS, public Telegram channels (`t.me/s`), Kwork, hh.ru, Работа России, RemoteOK, IMAP job alerts, webhook (`POST /api/ingest/:sourceId`) and the browser extension. Any other source can push JSON to the webhook. See [docs/PLUGINS.md](docs/PLUGINS.md) to write an adapter.

## Interfaces

- Dashboard and lead pages, RSS (`/feed.rss`), search catalog pages.
- HTTP API (`/api/*`).
- MCP server for AI agents (`radar mcp` over stdio, `POST /mcp` over HTTP): same feed, same access rules.
- Browser extension: [docs/EXTENSION.md](docs/EXTENSION.md).

## Development

- Node.js >= 22.19, pnpm >= 11.
- `pnpm typecheck && pnpm test` must stay green. Tests never call the network.
- `RADAR_TEST_STORE=postgres DATABASE_URL=... pnpm test` runs the same suite against PostgreSQL.

Contributions: [CONTRIBUTING.md](CONTRIBUTING.md). Security reports: [SECURITY.md](SECURITY.md).

## License

AGPL-3.0. See [LICENSE](LICENSE).
