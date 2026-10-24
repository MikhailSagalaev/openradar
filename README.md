# OpenRadar

[![CI](https://github.com/MikhailSagalaev/radar-oss/actions/workflows/ci.yml/badge.svg)](https://github.com/MikhailSagalaev/radar-oss/actions/workflows/ci.yml)

OpenRadar — открытая, честная и децентрализованная библиотека вакансий (`job`) и заказов (`gig`), где качество данных регулируется сообществом.

Включает персональный автономный пайплайн для сбора заказов и распределённый хаб сообщества с голосованием за полезность, скам и актуальность.

[Философия и Дорожная карта проекта](docs/ROADMAP_AND_PHILOSOPHY.md) | [Концепция и Архитектура](docs/OPEN_RADAR_CONCEPT_AND_ARCHITECTURE.md) | [Руководство контрибьютора](CONTRIBUTING.md)

**Live Demo:** [https://openradar.fun](https://openradar.fun) (гостевой режим открыт без авторизации).

---

## Миссия и Философия

Рынок труда и фриланса монополизирован закрытыми досками, которые берут плату за каждый отклик и годами хранят «мёртвые» вакансии ради трафика.

Философия **OpenRadar**:
1. **Бесплатный доступ к информации:** Данные о вакансиях и заказах должны быть доступны без платных стен и скрытых комиссий.
2. **Коллективный отбор (Community Curation):** Сообщество голосует (`полезно`, `мусор`, `скам`, `закрыто`). Вес голоса зависит от прозрачной репутации.
3. **Децентрализация (Hub + Nodes):** Запускайте изолированный радар на своём сервере со своими секретными источниками или подключайтесь к общему хабу.
4. **Защита приватности (Privacy First):** Личные контакты авторов не хранятся — в базе только суть задачи и ссылка на первоисточник (152-ФЗ / GDPR).
5. **Zero Emoji & Чистый дизайн:** Строгая швейцарская типографика, разделительные линии и мгновенный поиск по горячей клавише `/`.

---

## Возможности

- **Два режима данных:** Заказы фриланса (`gig`) и вакансии (`job`) с вилками зарплат, стеком и форматом работы (удалёнка/офис).
- **Добавление по ссылке в 1 клик (`/submit`):** Вставьте URL любой вакансии или заказа — система на лету извлечёт заголовок, компанию, вилку и стек.
- **Персональные RSS-ленты:** Кнопка RSS генерирует персональный фид под любой запрос (например, `/feed.rss?q=Python&type=job`).
- **Нормализация IT-стека:** Полнотекстовый поиск не теряет спецсимволы в `C++`, `C#`, `.NET`, `1С` и `Node.js`.
- **Мультивалютная нормализация вилок:** Приведение окладов, рейтов и фиксированных бюджетов (RUB, EUR, KZT, BYN, UAH) к каноническому USD.
- **Анти-скам защита сообщества:** Защита от снайпинга по `/24` подсетям, caution-баннеры и автоматический скрывающий киллсвитч при 3 независимых страйках.
- **Официальные источники данных:** Интеграция с HeadHunter Open API, RemoteOK, Работа России (Минтруд), Хабр Карьера, FL.ru, Kwork, RSS/Atom и IMAP.
- **3-уровневый дедупликатор:** Нормализация URL + SimHash текста + `pgvector halfvec(384)` косинусное сходство.
- **Продуктовая воронка откликов:** `new` → `interesting` → `applied` → `in_work` → `rejected` с начислением неявных полезных весов.
- **Безопасность энтерпрайз-уровня:** Session ID в HttpOnly/Secure куках, SSRF DNS-валидатор (блокировка приватных IP и metadata), CSRF Origin Guard, защита от Stored XSS.
- **Браузерное расширение (Manifest V3):** Отправка со страницы в 1 клик с прямой ссылкой на карточку в хабе.
- **CLI генератор коннекторов:** Команда `pnpm new:connector <name>` создаёт каркас нового парсера с тестами за 1 команду.

## Быстрый старт

Requirements: Docker Compose (recommended) or Node.js 22.12+, pnpm 11, and PostgreSQL 17.

### Running with Docker Compose (Recommended)

```bash
cp .env.example .env
# Set RADAR_ADMIN_TOKEN and POSTGRES_PASSWORD in .env
docker compose up -d --build
```

The database runs on PostgreSQL 17 with `pgvector`. Radar is available at `http://127.0.0.1:8787`.

### Running Locally

```bash
pnpm install
cp .env.example .env
pnpm build

# Run migrations
node bin/radar.js migrate

# Load popular freelance presets (FL.ru, Habr Freelance, Kwork, Telegram)
node bin/radar.js source presets --add

node bin/radar.js poll
node bin/radar.js leads
node bin/radar.js serve
```

Open `http://127.0.0.1:8787`. If `RADAR_ADMIN_TOKEN` is set, the dashboard asks for it once and stores it in an HTTP-only cookie.

## Авторизация

- **Просмотр** (`/`, `/leads/:id`, `/feed.rss`, `/api/delta`) публичен при `RADAR_PUBLIC_READ=true`.
- **Голосование и добавление лидов через `/submit`** доступны только после входа через GitHub. Создайте OAuth App на [github.com/settings/developers](https://github.com/settings/developers) с callback `https://your-domain/auth/github/callback` и задайте `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`.
- Вес голоса — 1.0 на участника, один голос на сигнал; повторный голос того же сигнала не учитывается. Админ-токен права голоса не даёт.
- **Воронка статусов** (`interesting` / `applied` / `in_work`) и оценка `+10/-20` — личный инструмент оператора, управляется админ-токеном.

For development without a build:

```bash
pnpm dev -- source list
pnpm dev -- serve
```

### IMAP

Point Radar at a mailbox that already receives job alerts. The password is read from an environment variable, not stored in the database.

```bash
export RADAR_IMAP_PASSWORD="app-password"

node bin/radar.js source add \
  --kind imap \
  --title "Job alerts" \
  --host imap.example.com \
  --user radar@example.com \
  --password-env RADAR_IMAP_PASSWORD \
  --mailbox INBOX \
  --subject "заказ" \
  --since-days 7
```

Use an app password, not the main account password. `--mark-seen` is off by default, so a failed run can be retried.

## Sources

| Kind | Access | Status | Requirements |
|---|---|---|---|
| `rss` | official | works | a feed URL |
| `imap` | user-provided | works | host, user and an env var with the password |
| `telegram` | public | works | a public channel username; reads `t.me/s/` |
| `kwork` | public | works, fragile | no account; parses the embedded page state |
| `trudvsem` | official | works | none; Работа России (Минтруд) Open API |
| `hh` | official | works | none for reading; a Bearer token or residential IP helps against the hh.ru WAF |
| `remoteok` | official | works | none; returns the full jobs list |
| `webhook` | user-provided | works | `POST /api/ingest/:sourceId` with a per-source token |

Planned: RSS auto-discovery, generic JSON API.

Every adapter declares its access level and risks in code. New adapters are expected to ship with a fixture and a contract test.

## Sinks
| Kind | Configuration |
|---|---|
| `console` | `RADAR_CONSOLE_SINK=true` (default) |
| `telegram` | `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` |
| `webhook` | `WEBHOOK_URL` + optional `WEBHOOK_SECRET` |

A sink failure marks the lead as `failed`, records the error and does not stop other sinks.

### Webhook Signature Verification

When `WEBHOOK_SECRET` is configured, outgoing webhook requests include `x-radar-timestamp` (unix timestamp in seconds) and `x-radar-signature` headers (`HMAC-SHA256(secret, "${timestamp}.${rawBody}")` in hex).

Example verification in Node.js:

```javascript
import crypto from 'node:crypto';

function verifyRadarWebhook(rawBody, headers, secret) {
  const timestamp = headers['x-radar-timestamp'];
  const signature = headers['x-radar-signature'];
  if (!timestamp || !signature) return false;

  // Protect against replay attacks (5 minute window)
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) {
    return false;
  }

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody}`)
    .digest('hex');

  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}
```

## Browser extension

A tiny Manifest V3 extension sends the current page or selected text to a webhook source. It has no build step and no dependencies.

```bash
node bin/radar.js source add --kind webhook --title "Browser"
# copy the token printed once

# chrome://extensions -> Developer mode -> Load unpacked -> extension/
```

See [docs/EXTENSION.md](docs/EXTENSION.md) for the full walkthrough.

## Health

The dashboard shows one row per source on `/sources`: status, last run and 24-hour counters. Click a source for `/sources/:id` with the configuration, recent leads, runs and success rate. The same data is available at `GET /api/sources/health`.

![Sources](docs/screenshots/sources.png)

![Source health](docs/screenshots/source.png)

## CLI

| Command | What it does |
|---|---|
| `radar migrate` | apply database migrations in PostgreSQL |
| `radar init` | initialize database and print next steps |
| `radar source add ...` | add a source |
| `radar source list` | list sources |
| `radar source enable <id>` / `disable` / `remove` | manage sources |
| `radar poll [id]` | poll one source or all enabled sources once |
| `radar run [--once]` | poll continuously |
| `radar serve [--port] [--no-scheduler]` | HTTP API + dashboard |
| `radar leads [--status] [--source] [--json]` | list leads |
| `radar runs` | recent poll runs |
| `radar stats` | counters |
| `radar export --format json\|csv` | export leads |

## HTTP API

`GET /health` is public. Everything under `/api` requires the admin token unless `RADAR_PUBLIC_READ=true`; mutations always require it.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/stats` | counters |
| `GET` | `/api/sources` | list sources |
| `GET` | `/api/sources/health` | per-source 24-hour health |
| `POST` | `/api/sources` | create a source |
| `PATCH` | `/api/sources/:id` | enable/disable or edit |
| `DELETE` | `/api/sources/:id` | delete |
| `POST` | `/api/sources/:id/poll` | poll one source |
| `POST` | `/api/poll` | poll all enabled sources |
| `GET` | `/api/leads` | list leads |
| `GET` | `/api/runs` | recent runs |
| `POST` | `/api/ingest/:sourceId` | accept a lead from a webhook source |

The UI has two pages: `/` for leads and `/sources` for sources. A lead opens at `/leads/:id` with the full text and delivery details. New sources are added at `/sources/new`; an existing one is edited at `/sources/:id/edit`.

![Lead](docs/screenshots/lead.png)

![New source](docs/screenshots/new-source.png)

Authentication: `Authorization: Bearer <RADAR_ADMIN_TOKEN>` or `x-radar-token`. A webhook source may have its own `config.token` and accepts `x-radar-token: <source token>` on `/api/ingest/:sourceId`.

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | `postgres://radar:...@postgres:5432/radar` | PostgreSQL connection string |
| `RADAR_HOST_PORT` | `8787` | HTTP port exposed on the host |
| `RADAR_ADMIN_TOKEN` | unset | protects the API and dashboard (min 32 chars in production) |
| `RADAR_USER_AGENT` | `RadarBot/0.4.0 ...` | sent to sources |
| `RADAR_HTTP_TIMEOUT_MS` | `15000` | per-request timeout |
| `RADAR_POLL_INTERVAL_SEC` | `300` | scheduler interval |
| `RADAR_PUBLIC_READ` | `false` | allow read-only API without a token |
| `GITHUB_CLIENT_ID` | unset | GitHub OAuth app id; required for voting and `/submit` |
| `GITHUB_CLIENT_SECRET` | unset | GitHub OAuth app secret |
| `RADAR_CONSOLE_SINK` | `true` | log delivered leads |
| `TELEGRAM_BOT_TOKEN` | unset | Telegram sink |
| `TELEGRAM_CHAT_ID` | unset | Telegram sink target |
| `WEBHOOK_URL` | unset | webhook sink |
| `WEBHOOK_SECRET` | unset | `x-radar-secret` header |
| `RADAR_LLM_ENABLED` | `false` | enable the classifier |
| `OPENAI_API_KEY` | unset | classifier key |
| `OPENAI_BASE_URL` | `https://api.openai.com/v1` | OpenAI-compatible endpoint |
| `OPENAI_MODEL` | `gpt-4o-mini` | classifier model |
| `PORT` | `8787` | HTTP port |

## Docker

```bash
cp .env.example .env
docker compose up -d --build
```

The database lives in `./data`, mounted into the container. The image runs `radar serve`; the scheduler is enabled by default.

## Legal and ethics

Radar is a self-hosted tool. Whoever runs it is responsible for what it collects and where it sends it.

- Prefer feeds, official APIs and data the operator already has access to.
- Do not use Radar to bypass authentication, CAPTCHA or private groups.
- Public pages are not automatically free to republish: database rights, copyright, personal-data law and platform terms still apply.
- Store the minimum, link to the original and do not build a public database of other people's orders.
- Respect rate limits and identify your bot with a real `RADAR_USER_AGENT`.

## Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the pipeline, contracts, data model and roadmap. Adapter authors should read [docs/PLUGINS.md](docs/PLUGINS.md); publishing notes are in [docs/PUBLISHING.md](docs/PUBLISHING.md).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). The short version: add one adapter, one fixture, one test; do not add a source that requires bypassing a protection.

## License

AGPL-3.0-only. See [LICENSE](LICENSE).
