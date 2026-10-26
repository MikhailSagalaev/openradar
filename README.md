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

> **Status:** v0.7, protocol radar/2. Node, hub, rating and SDKs are in place; see [docs/PROTOCOL.md](docs/PROTOCOL.md).

## Two ways to use it

1. **Self-hosted node.** Run `radar` on your machine or server, connect your sources and accounts, and get your own feed and notifications (Telegram, webhook). Nothing leaves your node unless you mark a source as shared.
2. **Join the hub.** Send observations to the shared hub (openradar.fun) from your node, from the SDK or from any scraper. The hub merges posts seen in different places into one lead, credits whoever saw it first, and gives early access by contribution: active contributors see new leads immediately, everyone else with a delay; guests see the feed without contacts.

| Tier | How | Delay | Contacts |
| --- | --- | --- | --- |
| Guest | not signed in | 12 h | no |
| Member | GitHub sign-in, or rating >= 1 | 3 h | yes |
| Active | rating >= 10 over 30 days | 30 min | yes |
| Core | rating >= 50, or moderator | none | yes |

Rating comes from confirmed leads you saw first (x1.5 for private channels and for a 6-hour exclusive), confirmations, and signals that matched the outcome; leads hidden as junk or scam cost points.

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

RSS, public Telegram channels (`t.me/s`), Kwork, hh.ru, Работа России, RemoteOK, IMAP job alerts, webhook and the browser extension. See [docs/PLUGINS.md](docs/PLUGINS.md) to write an adapter.

Any other parser (a Telethon script reading private channels, a Playwright scraper) sends radar/2 observations ([docs/PROTOCOL.md](docs/PROTOCOL.md)) to a webhook source:

```bash
node bin/radar.js source add --kind webhook --title "My parser"   # prints the source id and token
python my_parser.py | node bin/radar.js push --source <id>            # NDJSON, one observation per line
# or over HTTP: POST /api/v2/ingest/<id> with header x-radar-token
```

Straight to the hub with the Python SDK ([sdk/python](sdk/python/README.md), Telethon / Pyrogram helpers included):

```python
from openradar import HubClient, Key
hub = HubClient("https://openradar.fun", Key.from_string(os.environ["RADAR_KEY"]))
hub.observe([{"source": {"platform": "telegram", "channel": "-1001234567890", "visibility": "private", "message_id": "48213"},
              "text": "Ищем React-разработчика..."}])
```

The TypeScript package exports the same `HubClient` and `NodeClient`. To share a node source with the hub, set `RADAR_HUB_URL` and `RADAR_NODE_KEY` (`radar key`), then `radar source share <id>`.

## Interfaces

- Dashboard and lead pages, RSS (`/feed.rss`), search catalog pages.
- HTTP API (`/api/*`) and the hub API (`/v2/*`: feed, SSE stream, lead cards, author history, rating, moderation).
- MCP server for AI agents (`radar mcp` over stdio, `POST /mcp` over HTTP): same feed, same access rules.
- Browser extension: [docs/EXTENSION.md](docs/EXTENSION.md).

## Development

- Node.js >= 22.19, pnpm >= 11.
- `pnpm typecheck && pnpm test` must stay green. Tests never call the network.
- `RADAR_TEST_STORE=postgres DATABASE_URL=... pnpm test` runs the same suite against PostgreSQL.

Contributions: [CONTRIBUTING.md](CONTRIBUTING.md). Security reports: [SECURITY.md](SECURITY.md).

## License

AGPL-3.0. See [LICENSE](LICENSE).
