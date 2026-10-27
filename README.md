# OpenRadar

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/logo-white.png">
    <source media="(prefers-color-scheme: light)" srcset="assets/logo-black.png">
    <img alt="OpenRadar" src="assets/logo-black.png" width="360">
  </picture>
</p>

<p align="center">
  <a href="https://openradar.fun"><img src="https://img.shields.io/badge/live-openradar.fun-10b981.svg" alt="Live hub: openradar.fun"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-AGPLv3-blue.svg" alt="License: AGPL v3"></a>
  <a href="docs/PROTOCOL.md"><img src="https://img.shields.io/badge/protocol-radar%2F2-purple.svg" alt="Protocol: radar/2"></a>
</p>

OpenRadar is an open base of job vacancies and freelance orders. Parsers, nodes and people add posts from boards, RSS feeds, Telegram channels and email alerts; the hub merges duplicates and keeps one clean feed.

Job seekers should not have to pay for subscriptions to parsers or for responding to a vacancy. OpenRadar has no paid tier: the contacts are in the post, and you write to the client directly. Anyone can run their own copy.

**Live hub:** [openradar.fun](https://openradar.fun)

<p align="center">
  <a href="https://openradar.fun"><img alt="The openradar.fun feed" src="docs/screenshots/hub.jpg" width="800"></a>
</p>

## What it does

- **One feed of every trade.** FL.ru, Kwork, Freelancehunt, Habr Career, hh.ru, Работа России, We Work Remotely, Jobicy, RemoteOK and public Telegram channels: development, design, video, writing, ads, sales and more. A post seen on two boards is one lead.
- **Search, filters and a score.** Budget from, skill, remote only, language; newest, best or highest budget first. Each lead gets a 0-100 score from its pay, skills, detail and a direct contact.
- **Browser extension.** Sign in with GitHub once, then add a vacancy or an order from any site in one click; it also shows what similar work usually pays and whether the pay on the page is below, within or above it.
- **Votes and submissions.** Signed-in users mark leads as useful, junk, scam or closed, and add posts by link.
- **RSS for any query**, an HTTP API and an MCP server over the same feed.
- **Your own node.** Run it at home or on a server, connect your sources, filters and notifications (Telegram, webhook). Nothing leaves the node unless you share a source.

## The network

Nodes and parsers can send their posts to the shared hub. Every post is signed with the participant's key. The hub merges the same post seen in different places, credits whoever saw it first, and lowers the weight of junk and scam by the votes and the rating of the participants who reported it.

People who send leads see the feed earlier:

| Tier | How | Delay | Contacts |
| --- | --- | --- | --- |
| Guest | not signed in | 12 h | hidden |
| Member | GitHub sign-in, or rating 1+ | 3 h | shown |
| Active | rating 10+ over 30 days | 30 min | shown |
| Core | rating 50+, or moderator | none | shown |

Rating comes from confirmed leads you saw first (×1.5 for private channels and for a 6-hour exclusive), confirmations and signals that matched the outcome; leads hidden as junk or scam cost points. Details: [docs/PROTOCOL.md](docs/PROTOCOL.md).

## Quick start

Node.js 22.19+ and pnpm 11+:

```bash
git clone https://github.com/MikhailSagalaev/openradar.git
cd openradar
pnpm install
pnpm dev serve
```

`serve` prints a one-off admin token. Open `http://127.0.0.1:8787`, sign in with it, go to **Источники** and press **Загрузить популярные биржи**: the boards are polled right away and the first leads appear within seconds.

Without `DATABASE_URL` the node keeps everything in memory. For a persistent node, use PostgreSQL 17 through Docker:

```bash
cp .env.example .env    # set RADAR_ADMIN_TOKEN, POSTGRES_PASSWORD, DATABASE_URL
docker compose run --rm radar migrate
docker compose up -d
```

`docker compose` refuses to start with the example secrets from `.env.example`.

## Connecting a parser

Any script (a Telethon reader for private channels, a Playwright scraper, a cron job) can send posts to a node:

```bash
pnpm dev source add --kind webhook --title "My parser"   # prints the source id and token
python my_parser.py | pnpm dev push --source <id>        # NDJSON, one post per line
# or over HTTP: POST /api/v2/ingest/<id> with the header x-radar-token
```

Or straight to the hub with the Python SDK (standard library only, Telethon and Pyrogram helpers included):

```bash
pip install "git+https://github.com/MikhailSagalaev/openradar#subdirectory=sdk/python"
```

```python
import os
from openradar import HubClient, Key

hub = HubClient("https://openradar.fun", Key.from_string(os.environ["RADAR_KEY"]))
hub.observe([{"source": {"platform": "telegram", "channel": "-1001234567890", "visibility": "private", "message_id": "48213"},
              "text": "Ищем React-разработчика..."}])
```

`RADAR_KEY` is your participant key (`pnpm dev key`); your rating is bound to it. The TypeScript package exports the same `HubClient` and `NodeClient`.

## Documentation

| Document | Contents |
| --- | --- |
| [GETTING_STARTED.md](docs/GETTING_STARTED.md) | Scenarios: reading the hub, running a node, a server, a parser, sharing with the hub |
| [PROTOCOL.md](docs/PROTOCOL.md) | radar/2: posts, signatures, merging, tiers, rating, moderation |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | The node pipeline, the score, the data model, HTTP routes |
| [PLUGINS.md](docs/PLUGINS.md) | Writing a source or sink adapter |
| [EXTENSION.md](docs/EXTENSION.md) | The browser extension and the market estimate |
| [BACKUP_AND_RESTORE.md](docs/BACKUP_AND_RESTORE.md) | Backups |
| [sdk/python](sdk/python/README.md) | Python SDK |

## Contributing

New boards are the most useful contribution: one adapter, one fixture, one test. See [CONTRIBUTING.md](CONTRIBUTING.md). Report vulnerabilities privately: [SECURITY.md](SECURITY.md).

## License

AGPL-3.0. See [LICENSE](LICENSE).
