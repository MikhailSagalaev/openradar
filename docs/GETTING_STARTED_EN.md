# Getting Started with openradar

> На русском: [GETTING_STARTED.md](GETTING_STARTED.md)

Nine scenarios, from "just browse leads" to running your own 24/7 server. Each scenario stands on its own.

| I want to… | Scenario |
| --- | --- |
| browse fresh orders and job vacancies | [1. Read the hub (openradar.fun)](#1-read-the-hub-openradarfun) |
| run my own feed with custom filters and alerts | [2. Run a node on your computer](#2-run-a-node-on-your-computer) |
| run a node 24/7 on a server | [3. Run your own server](#3-run-your-own-server) |
| read private Telegram channels and chats | [4. Telegram via your own account](#4-telegram-via-your-own-account) |
| push leads from a custom scraper | [5. Connect your own parser](#5-connect-your-own-parser) |
| see leads earlier than guests | [6. Share with the hub and earn rating](#6-share-with-the-hub-and-earn-rating) |
| save leads from any website in one click | [7. Browser extension](#7-browser-extension) |
| search and submit leads from AI agents | [8. MCP server](#8-mcp-server) |
| add a new job board or source | [9. Write an adapter](#9-write-an-adapter) |

## 1. Read the hub openradar.fun

No installation required: open [openradar.fun](https://openradar.fun).

- **Without signing in (Guest):** the feed is shown with a 12-hour delay and without client contact details. That is enough to explore what kind of orders and vacancies are collected.
- **Sign in with GitHub (Member):** 3-hour delay and full client contacts. You can vote on posts: "Useful", "Junk", "Scam", or "Closed". Community votes hide spam for everyone. In the "Profile" menu you can see your tier, current delay, and how to level up.
- **Zero delay:** the real-time feed is unlocked for participants who contribute leads back to the network (scenarios 4, 5, 6, 7, and 8). Tiers and points are documented in [PROTOCOL.md](PROTOCOL.md).

What else is on the website:

- Full-text search, "Orders / Vacancies" toggle, and filters: sort by newest, best-described, highest budget, or relevance; filter by minimum budget, direction/role, skill, workplace arrangement (`remote`, `hybrid`, `onsite`), and post language. Any filtered URL can be bookmarked, and the RSS button gives an RSS feed with the exact same filters;
- Every lead gets a quality score from 0 to 100 (median around 60, 80+ is a strong lead). How it is calculated is explained in [ARCHITECTURE.md](ARCHITECTURE.md);
- Role categories and employer directory in the footer;
- Global RSS feed: `https://openradar.fun/feed.rss` for any RSS reader;
- "Add by URL": paste a link to a vacancy or freelance order to contribute it to the shared feed (after signing in).

## 2. Run a node on your computer

Your own node gives you an unthrottled local feed with your own sources and filters. Requires Node.js 22.19+ (Docker image and CI use Node 24 LTS) and pnpm 12+.

```bash
git clone https://github.com/MikhailSagalaev/openradar.git
cd openradar
pnpm install
pnpm dev serve
```

1. The console prints `токен администратора на этот запуск: …` (ephemeral admin token for this run). Copy the token.
2. Open `http://127.0.0.1:8787`, click "Sign in" → "Sign in with token".
3. Go to "Sources" → **"Platform Catalog"**. You will find presets for FL.ru, Habr Career, Kwork, Freelancehunt, hh.ru, Trudvsem, public Telegram channels, We Work Remotely, Jobicy, RemoteOK, Remotive, Arbeitnow, Himalayas, CryptocurrencyJobs, company ATS boards (Greenhouse, Ashby, Lever, Workable, Recruitee, SmartRecruiters), and more. Enable individual sources or click "Connect all". Connected sources are polled immediately, and the first leads appear within seconds.
4. Your node then polls enabled sources every 5 minutes (`RADAR_POLL_INTERVAL_SEC`).

**Filters.** Open any source to configure required keywords (posts without them are skipped), stop-words, minimum budget, and city. Each lead is scored 0–100 with transparent reasons ("direct client", "market-rate budget", etc.).

**Telegram notifications.** Create a bot with [@BotFather](https://t.me/BotFather), find your chat ID, and add to `.env`:

```bash
TELEGRAM_BOT_TOKEN=123456:ABC...
TELEGRAM_CHAT_ID=123456789
```

New matching leads will be delivered to your chat. You can also forward leads to a webhook via `WEBHOOK_URL` and `WEBHOOK_SECRET`.

**Storage.** Without `DATABASE_URL`, everything is stored in memory and resets on restart — convenient for quick testing. For persistent storage, use PostgreSQL/ParadeDB via Docker (scenario 3, which also works on a local machine).

**Persistent admin token.** To keep the same admin token across restarts, generate `.env`:

```bash
pnpm init:env    # creates .env with random admin token, DB password, and web-key secret
```

Your login token is `RADAR_ADMIN_TOKEN` in `.env`. Existing `.env` files are never overwritten unless `--force` is passed.

**Command line.** Everything in the web UI is also available via CLI: `pnpm dev --help`. For example: `pnpm dev leads`, `pnpm dev stats`, `pnpm dev export --jobspy --source telegram --type gig --since 30d`.

## 3. Run your own server

Requires a Linux server with Docker and Docker Compose.

```bash
git clone https://github.com/MikhailSagalaev/openradar.git /opt/radar
cd /opt/radar
node scripts/init-env.mjs    # generates .env with random secrets; pnpm is not required on the host
```

This populates `RADAR_ADMIN_TOKEN`, `POSTGRES_PASSWORD` (and matching `DATABASE_URL`), and `RADAR_WEB_KEY_SECRET`. Set `RADAR_PUBLIC_URL` in `.env` to your public domain.

Start the stack:

```bash
docker compose run --rm radar migrate
docker compose up -d
curl http://127.0.0.1:8787/health
```

By default, `docker-compose.yml` uses the ParadeDB image (`paradedb/paradedb:latest-pg18`), which bundles PostgreSQL 18, `pgvector`, and the `pg_search` Tantivy BM25 search engine. If you connect to a standard external PostgreSQL instance, search automatically falls back to native PostgreSQL full-text `tsvector`. See [PARADEDB.md](PARADEDB.md) for details.

**Domain and HTTPS.** The container binds to `127.0.0.1:${RADAR_HOST_PORT}`. Expose it through nginx (see [nginx.example.conf](nginx.example.conf)) and provision TLS with `certbot --nginx -d your-domain`.

**Upgrading.** [deploy-server.sh](../deploy-server.sh) pulls updates, backs up the database, runs migrations, and restarts the service:

```bash
RADAR_DIR=/opt/radar bash deploy-server.sh                    # latest main
RADAR_DIR=/opt/radar RADAR_REF=v0.63.0 bash deploy-server.sh  # specific release tag
```

**Automated release deploys.** [scripts/autodeploy.sh](../scripts/autodeploy.sh) can run from cron to roll out new `vX.Y.Z` tags automatically:

```cron
*/5 * * * * root RADAR_DIR=/opt/radar /opt/radar/scripts/autodeploy.sh >> /var/log/radar-autodeploy.log 2>&1
```

To pin a release, write the desired tag to `/opt/radar/.deploy-pin`; delete the file to unpin.

**Scheduled backups:** see [BACKUP_AND_RESTORE.md](BACKUP_AND_RESTORE.md).

**Public feed & hub mode.** `RADAR_PUBLIC_READ=true` opens read access without logging in. `RADAR_MODE=hub` enables tier-based delays and contact redaction for guests; keep `node` for a personal node.

## 4. Telegram via your own account

Public Telegram channels are read without an account (source kind `telegram`). Private channels and group chats you belong to are read through your own Telegram account (source kind `telegram-account`).

1. Obtain `api_id` and `api_hash` at [my.telegram.org/apps](https://my.telegram.org/apps) and set `RADAR_TELEGRAM_API_ID` and `RADAR_TELEGRAM_API_HASH` in `.env`.
2. Authenticate once: `pnpm dev telegram login` (on a server: `docker compose run --rm -it radar telegram login`). Enter your phone number, Telegram code, and 2FA password if enabled. The command outputs `RADAR_TELEGRAM_SESSION=...`; paste it into `.env` and restart the node.
3. List accessible chats: `pnpm dev telegram chats` prints your channels and groups with their `@handle` or numeric ID.
4. In **Sources**, add a "Telegram (own account)" source and list the chat handles/IDs separated by commas. The node reads only new messages (30+ chars) and attaches the message author as the contact.

## 5. Connect your own parser

Any custom script (Telethon, Playwright, cron with curl) can push leads to your node for normalization, deduplication, contact extraction, and scoring:

1. Create a webhook source and save the printed ID and token:
   ```bash
   pnpm dev source add --kind webhook --title "My parser"
   ```
2. POST observations (only `source.platform`, `source.channel`, and `text` are required):
   ```bash
   curl -X POST http://127.0.0.1:8787/api/v2/ingest/<id> \
     -H "x-radar-token: <token>" -H "content-type: application/json" \
     -d '[{"source": {"platform": "telegram", "channel": "-1001234567890", "message_id": "48213"},
           "text": "Hiring a React developer, remote, $4,000/mo. DM @irina_hr"}]'
   ```

Full schema details are in [PROTOCOL.md](PROTOCOL.md). A ready-made Python SDK with Telethon and Pyrogram helpers is in [sdk/python](../sdk/python/README.md).

## 6. Share with the hub and earn rating

Participants who contribute leads to the network unlock earlier access on the hub. Points are awarded for leads you observe first that get confirmed; private channels earn a 1.5x multiplier. Submitting spam or scam costs rating points.

**Generate a participant key:**

```bash
pnpm dev key
```

**Option A: From your node.** Add to `.env`:

```bash
RADAR_HUB_URL=https://openradar.fun
RADAR_NODE_KEY=nsec1...
```

Then mark the sources you want to share in the UI or via `pnpm dev source share <id>`.

**Option B: Directly from Python** without running a full node:

```python
import os
from openradar import HubClient, Key

hub = HubClient("https://openradar.fun", Key.from_string(os.environ["RADAR_KEY"]))
hub.observe([{"source": {"platform": "telegram", "channel": "-1001234567890", "visibility": "private", "message_id": "48213"},
              "text": "Looking for a React developer..."}])
```

## 7. Browser extension

Saves any vacancy or freelance order from any web page to the shared database via the toolbar popup, context menu, or `Alt+Shift+R`, and estimates market pay for the role on the page. Works in Chrome, Edge, Yandex Browser, and Brave.

1. Download the archive from [openradar.fun/extension](https://openradar.fun/extension) and unzip it.
2. Open `chrome://extensions/`, enable Developer mode, click "Load unpacked", and select the unzipped folder.
3. Click **"Sign in with GitHub"** in the popup. See [EXTENSION.md](EXTENSION.md) for details.

## 8. MCP server

Every node (and the public hub at `https://openradar.fun/mcp`) exposes a Model Context Protocol (MCP) server. AI agents can:

- `search_leads` — search vacancies and orders by `query`, `type` (`job` | `gig`), `market` (`ru` | `intl`), `remote`, `workplace` (`remote` | `hybrid` | `onsite`), `direction`, `skills`, `grade`, `company`, `has_budget`, `min_budget_rub`, `since`, and `sort` (`new`, `score`, `budget`, `relevance`);
- `get_lead_details` — read full text, contacts (according to viewer tier), source, and budget;
- `estimate_compensation` — get market pay percentiles (p25, median, p75) and sample count for a role, stack, and seniority;
- `submit_lead` and `vote_lead` — contribute discovered leads and cast verification votes (`useful`, `junk`, `scam`, `closed`) using a personal token;
- `get_market_analytics` — top skills and median budgets across recent leads;
- `save_search` and `list_saved_searches` — subscribe to Telegram/webhook alerts for matching leads (requires `Authorization: Bearer mcp_…` from `https://openradar.fun/me`);
- `xray_generate_dorks` — build targeted search queries for hiring managers and team leads.

Connect in Claude Code:

```bash
claude mcp add --transport http openradar https://openradar.fun/mcp
```

Or run locally over stdio (after `pnpm build`):

```json
{
  "mcpServers": {
    "openradar": {
      "command": "node",
      "args": ["/path/to/openradar/bin/radar.js", "mcp"],
      "env": { "DATABASE_URL": "postgres://..." }
    }
  }
}
```

## 9. Write an adapter

A new source adapter is one module, one fixture, and one test. Scaffold it with:

```bash
pnpm new:connector mysite
```

Adapter rules are in [PLUGINS.md](PLUGINS.md) and the review checklist is in [CONTRIBUTING.md](../CONTRIBUTING.md).

## Troubleshooting

| Symptom | What to check |
| --- | --- |
| Telegram source shows "Network error" | `t.me` is unreachable from your server. Configure `RADAR_PROXY_URL`. |
| `hh` (Open API) returns 0 leads | hh.ru blocks datacenter IPs on the open API. Use the HeadHunter RSS preset or an API token. |
| `FATAL: RADAR_ADMIN_TOKEN is missing` | Required in production and must be at least 32 characters long. |
| Docker Compose rejects `.env` | Placeholder secrets from `.env.example` are still present. Run `node scripts/init-env.mjs --force`. |
| Node health check | Check `GET /health` and the "Sources" tab for status, last error, and 24h counters. |
