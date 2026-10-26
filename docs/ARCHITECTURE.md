# Архитектура Radar

Статус: v0.7 (radar/2). Документ описывает конвейер одного узла. Сеть «узлы → хаб» описана в [PROTOCOL.md](PROTOCOL.md).

## 1. Задача

Radar — самостоятельный сервис, который превращает разрозненные публичные заказы в один нормализованный поток лидов:

```
источник → нормализация → дедуп → правила → (опционально LLM) → скор → доставка
```

Он не является ни парсером «всего интернета», ни публичной базой заказов, ни SaaS. Ценность — в трубе и контрактах, а не в количестве площадок.

### Не-цели v0.1

- обход авторизации, CAPTCHA и приватных групп;
- автоматические отклики и переписка с заказчиками;
- центральный хостинг с чужой базой лидов;
- гарантия полноты источника;
- мобильное приложение и мультитенантность.

## 2. Принципы

1. **Ядро не знает про источники.** Источник — адаптер с маленьким контрактом.
2. **Сначала правила, потом LLM.** Без ключа и без сети классификатор просто выключен.
3. **PostgreSQL 17 и Outbox Pattern.** Выделенная СУБД с pgvector и гарантированной доставкой.
4. **Дедуп объяснимый.** Канонический URL, хэш текста и ключ заголовка, а не «магия».
5. **Данные у оператора.** Self-hosted, без телеметрии и облачной БД.
6. **Легальность по дизайну.** Адаптер обязан объявить уровень доступа и риски.
7. **Ошибка источника не роняет сервис.** Пишется в `runs`, источник продолжает жить.

## 3. Слои

```
┌─────────────────────────────────────────────────────┐
│  Интерфейсы: CLI · HTTP API · Dashboard · Scheduler  │
└───────────────────────┬─────────────────────────────┘
                        │
┌───────────────────────▼─────────────────────────────┐
│  Pipeline: prepare → dedup → rules → optional LLM   │
│            → score → store → deliver                │
└───────┬───────────────────────┬─────────────────────┘
        │                       │
┌───────▼────────┐    ┌─────────▼────────┐    ┌───────▼──────┐
│ Sources        │    │ Store (Postgres) │    │ Sinks        │
│ rss, telegram, │    │ sources, leads,  │    │ console,     │
│ kwork, webhook │    │ runs, deliveries │    │ telegram,    │
└────────────────┘    └──────────────────┘    │ webhook      │
                                             └──────────────┘
```

| Каталог | Ответственность |
|---|---|
| `src/core/` | типы, текст, URL, fingerprint, извлечение полей, правила, скор |
| `src/sources/` | адаптеры источников и реестр |
| `src/sinks/` | адаптеры доставки и реестр |
| `src/store/` | PostgreSQL-репозиторий, миграции и In-Memory store |
| `src/pipeline/` | ingest, poll, планировщик, outbox воркер |
| `src/server/` | Hono API и server-rendered dashboard |
| `src/cli/` | команды `radar` |
| `src/classifier/` | опциональный LLM-совместимый классификатор |

## 4. Поток данных

1. **Poll.** Планировщик или CLI вызывает `adapter.poll(source, ctx)`.
2. **RawLead.** Адаптер возвращает массив сырых объектов: заголовок, текст, URL, дата, автор, бюджет.
3. **Prepare.** `prepareRawLead` чистит HTML и эмодзи, канонизирует URL, извлекает бюджет и город, считает `fingerprint` и `titleKey`.
4. **Dedup.**
   - точное совпадение `fingerprint` (канонический URL или хэш текста);
   - совпадение `titleKey + city` за последние 24 часа (кросс-источниковый дубль).
5. **Rules.** Спам-паттерны, include/exclude-ключевики, минимальный бюджет, возраст, строгий город.
6. **LLM (опционально).** Если включён и есть ключ: `isLead`, `confidence ≥ 0.6`; при ошибке — продолжаем по правилам.
7. **Store.** Лид пишется со статусом `new` или `rejected`; уникальные индексы защищают от гонок.
8. **Deliver.** Синки получают лид; каждый результат пишется в `deliveries`; итог — `delivered` или `failed`.
9. **Run.** Итоги опроса пишутся в `runs` для диагностики.

## 5. Контракты

### Источник

```ts
interface SourceAdapter {
  kind: 'rss' | 'telegram' | 'kwork' | 'webhook' | 'imap' | 'trudvsem' | 'hh' | 'remoteok';
  access: 'official' | 'public' | 'user-provided' | 'auth-required';
  description: string;
  risks: string[];
  poll?(source: SourceRecord, ctx: PollContext): Promise<RawLead[]>;
}
```

`poll` отсутствует у webhook-источника: данные приходят через `POST /api/ingest/:sourceId`.

### Синк

```ts
interface SinkAdapter {
  kind: string;
  /** Необязательный фильтр: false — лид не ставится в очередь этого синка. */
  accepts?(lead: Lead, source: SourceRecord): boolean;
  deliver(lead: Lead, ctx: SinkContext): Promise<void>;
}
```

### Хранилище

`Store` — интерфейс из `src/core/store.ts`. Production реализация построена на PostgreSQL 17 с pgvector, миграциями через advisory lock и Transactional Outbox Pattern для надёжной доставки. Для изолированных тестов используется In-Memory реализация `MemoryStore`.

## 6. Модель данных

```
sources(id, kind, title, enabled, config_json, created_at, updated_at)
leads(id, source_id, external_id, url, canonical_url, title, text, author,
      city, budget, type, fingerprint, title_key, status, score,
      votes_up, votes_down, votes_scam, votes_closed, quality_score,
      reasons_json, created_at, delivered_at)
lead_votes(user_id, lead_id, signal, weight, counted_at, created_at)
app_users(id, tg_id, github_id, handle, role, reputation, created_at, banned_at)
deliveries(id, lead_id, sink, status, error, created_at)
lead_deliveries(lead_id, sink, status, attempts, next_attempt_at, last_error)
outbox_events(id, event_type, payload, status, created_at, processed_at)
runs(id, source_id, started_at, finished_at, found, inserted,
     duplicates, rejected, delivered, error)
sessions(id, user_id, created_at, expires_at)
```

Индексы:

- `UNIQUE(fingerprint)` и `UNIQUE(source_id, external_id)` — двухуровневый дедуп;
- `PRIMARY KEY (user_id, lead_id, signal)` в `lead_votes` — один голос на участника;
- `(status, created_at)`, `(source_id, created_at)`, `(title_key, created_at)`, GIN по `tsvector` — выборки и поиск.

`config_json` и `reasons_json` — JSON. Секреты в БД не хранятся: только имена переменных окружения и токены вебхуков. Таблицы `app_users`, `lead_votes` и колонка `leads.embedding` (halfvec) — задел под Этапы 3–4 роадмапа; эмбеддинги пока не заполняются.

## 7. Источники: политика

| Тип | Доступ | Что делает | Риски |
|---|---|---|---|
| RSS | official | читает фид | почти нет; зависит от фида |
| IMAP | user-provided | читает письма-оповещения | пароль в env; письма теряют вёрстку |
| Telegram public | public | `t.me/s/<channel>` | вёрстка, лимиты, неполная история |
| Kwork | public | `window.stateData` | вёрстка, условия площадки |
| Webhook | user-provided | входящий JSON | доверие к отправителю |
| Browser extension | user-provided | отправляет страницу в webhook | токен хранится в браузере |

Правила для нового адаптера:

1. Никакого обхода логина, CAPTCHA, платных стен и приватных групп.
2. Объявить `access` и `risks` в коде.
3. Уважать `RADAR_HTTP_TIMEOUT_MS` и не делать больше одного запроса на источник за тик.
4. Не хранить чужие cookies и сессии в репозитории.
5. Приложить фикстуру и тест: адаптер без теста не принимается.

## 8. Синки

- `console` — по умолчанию, удобно для первого запуска.
- `telegram` — `sendMessage` с HTML и ссылкой на источник.
- `webhook` — JSON `{ event: "lead.created", lead }`, опциональный `x-radar-secret`.
- `hub` — узел → хаб: лиды источников с флагом `share` подписываются ключом `RADAR_NODE_KEY` и уходят в `RADAR_HUB_URL` как наблюдения kind 4040. Повторы — через outbox.

Синк не имеет права ронять пайплайн: ошибка ловится, пишется в `deliveries` и `lastError` лида.

## 9. LLM

- Включается только `RADAR_LLM_ENABLED=true` и наличием API-ключа.
- Любой стандартный endpoint: внешний шлюз или локальный сервис с HTTP API.
- Ответ — строгий JSON; текст лида передаётся как данные, не как инструкции.
- Ошибка/таймаут → `null`, пайплайн продолжает по правилам.
- Модель не влияет на дедуп и не может «оживить» отклонённый спам.

## 10. Runtime

### CLI

`init`, `migrate`, `source add/list/share/enable/disable/remove`, `poll`, `run`, `serve`, `leads`, `runs`, `stats`, `export`, `push` (NDJSON-наблюдения из stdin), `key` (ключ участника), `mcp`.

### HTTP

- `GET /health` — публичный.
- `GET /auth/github` и `GET /auth/github/callback` — OAuth-вход через GitHub; сессия в HttpOnly-cookie.
- `GET /` — лиды с поиском и фильтрами по типу и статусу.
- `GET /leads/:id` — карточка лида: полный текст, источник, скор, причины.
- `POST /leads/:id/vote` и `POST /api/leads/:id/vote` — голосование; только пользователь с GitHub-входом, один голос на сигнал.
- `POST /leads/:id/status`, `POST /leads/:id/feedback`, `PATCH /api/leads/:id/status` — воронка; только админ.
- `GET /submit`, `POST /submit`, `POST /api/submit`, `POST /api/preview` — добавление по ссылке; запись — только после GitHub-входа, превью ходит через SSRF-guarded fetch.
- `GET /feed.rss`, `/feed.xml`, `/api/feed.rss` — RSS-лента под запрос.
- `GET /api/delta` — поток изменений для синхронизации узлов (JSON/NDJSON).
- `GET /sources`, `/sources/new`, `/sources/:id`, `/sources/:id/edit` — дашборд источников.
- `POST /sources`, `POST /sources/:id`, toggle/delete — управление; только админ.
- `/api/*` — чтение: токен, GitHub-сессия или `RADAR_PUBLIC_READ`; управление источниками: только админ.
- `/api/ingest/:sourceId` — админский токен или токен источника.
- `/api/v2/ingest/:sourceId` — наблюдения radar/2 (до 500, JSON или NDJSON), тот же доступ.
- `/v2/*` — API хаба (`RADAR_MODE=hub`): `events`, `feed`, `stream`, `leads/:id`, `contacts/:value`, `me`, `link/github`, `moderation/*`. Описание — [PROTOCOL.md](PROTOCOL.md).
- `/mcp` — MCP поверх ленты с теми же задержками и правилами контактов.

### Browser extension

`extension/` — Manifest V3 без сборки. Читает активную вкладку после клика и отправляет `title`, `text`, `url` в webhook-источник. Токен источника хранится в `chrome.storage.local`; это осознанно не синхронизируемый секрет.

### Планировщик

`PollRunner` запускает `pollAll` каждые `RADAR_POLL_INTERVAL_SEC` секунд, не допускает наложения запусков и логирует итоги. `serve --no-scheduler` оставляет только HTTP.

## 11. Безопасность

- Секреты только в env; `.env` в `.gitignore`.
- Авторизация: админ-токен (минимум 32 символа в production) и GitHub OAuth (`read:user`, state-проверка) для участников. Сессии в HttpOnly/SameSite-cookie; сессия пользователя не даёт админских прав.
- SSRF: исходящие запросы (`fetchText`, `fetchSafeHttp`) резолвят DNS и блокируют приватные/метаданные-адреса на каждом редиректе; `/api/preview` ходит через тот же guard. Известное ограничение (аудит C1): фильтр стоит заменить поддерживаемой библиотекой.
- Вебхук: отдельный токен на источник, лимит 100 объектов за запрос.
- HTML из источников не рендерится как HTML: только текст и экранирование.
- Prompt injection: текст лида передаётся классификатору как данные, без инструментов и без исполнения.
- Контакты: хранятся структурно (`lead_contacts`); гостям хаба не отдаются ни в одном интерфейсе (страницы, API, RSS, каталог, MCP).
- Хаб: события подписаны (BIP-340), HTTP-запросы — подписью NIP-98 с привязкой к URL, методу и телу, одноразово. Голая подпись ключом даёт уровень гостя.

## 12. Легальность

Radar — инструмент, а не разрешение. Ответственность несёт тот, кто запускает сбор.

- Публичная страница не значит «свободно для перепубликации»: действуют права изготовителя базы данных, авторские права, 152-ФЗ и правила площадок.
- hh.ru закрыл публичный API вакансий в 2026; Upwork отключил RSS в 2024. Площадки закрывают доступ, а не открывают.
- Поэтому приоритет: RSS, официальные API, письма-оповещения, данные, которые оператор и так получил.
- При требовании площадки источник удаляется из конфигурации узла; на хабе модератор скрывает лиды канала.

## 13. Roadmap

### v0.1 (сделано)

- RSS, Telegram public, Kwork, webhook.
- Дедуп, правила, скор, три синка.
- CLI, HTTP API, dashboard, тесты, Docker.

### v0.2 (сделано)

- IMAP-источник (письма-оповещения с бирж) — самый легальный и стабильный канал.
- Health-страница источника: last run, 24-часовые счётчики, success rate.
- Браузерное расширение «отправить страницу в Radar».
- Минималистичный дашборд и страница источника.
- Управление источниками из UI: добавление, включение, выключение, удаление.
- CI, SECURITY, PUBLISHING, SDK-хелперы и docs/PLUGINS.md.

### v0.3 (сделано)

- Единый продуктовый интерфейс: лиды, источники, карточка лида.
- Поиск и фильтры по статусу, сортировка actionable-лидов выше отклонённых.
- Редактирование источника без пересоздания.
- Понятные первые шаги и пустые состояния.

### v0.4 (сделано)

- GitHub OAuth: голосование и `/submit` — только для зарегистрированных участников; вес голоса 1.0, один голос на сигнал (`lead_votes`).
- Воронка статусов возвращена под админ-токен.
- `/api/preview` переведён на SSRF-guarded fetch; RSS-фид экранирует CDATA; дубликат `external_id` не роняет опрос.
- Генератор коннекторов пишет адаптер сразу в `src/sources/`.

### v0.7 (radar/2, сделано)

- Убраны коммерческий слой и mesh radar/1.
- Наблюдения radar/2 от любых парсеров, включая закрытые Telegram-каналы; структурированные контакты; склейка кросс-постов.
- Хаб: подписанные события, правила склейки, лента с задержкой по уровню, SSE, рейтинг за 30 дней, взвешенные сигналы, модерация.
- Узел → хаб для источников с `share`; SDK на Python и TypeScript.

### Дальше

- Замена SSRF-фильтра поддерживаемой библиотекой (аудит C1).
- Несколько воркеров хаба; индекс склейки в БД вместо памяти процесса.
- Экспорт в Notion/CRM/почту, RSS auto-discovery.

### v1.0

- Стабильный контракт адаптеров и semver.
- Публичный registry адаптеров с мейнтейнерами.
- Политика удаления источников и security policy.

## 14. Решения (ADR)

| Решение | Почему |
|---|---|
| Один пакет, а не монорепо | MVP быстрее; границы уже выражены каталогами, выделение в пакеты — механическое |
| PostgreSQL 17 + pgvector | строгая изоляция, параллельная обработка, векторный поиск и outbox |
| Hono, не NestJS | лёгкий HTTP-слой без декораторов и DI-контейнера |
| Правила до LLM | работает без ключа и без сети, объяснимо и дешево |
| Нет автопубликации | сбор и доставка отделены от решения человека |
| AGPL-3.0 | сервис остаётся открытым, включая сетевые форки |
| Webhook как источник | «принеси свои данные» — легальная альтернатива скрейпингу |

## 15. Как добавить адаптер

1. Создать `src/sources/<name>.ts` с объектом `SourceAdapter`.
2. Зарегистрировать его в `src/sources/index.ts`.
3. Добавить фикстуру в `test/fixtures/`.
4. Добавить тест в `test/sources.test.ts`: парсинг, пустой ответ, ошибка HTTP.
5. Описать доступ и риски в `risks`.
6. Проверить: `pnpm typecheck && pnpm test && pnpm build`.

## 16. Архитектура БД и изоляция (Database per Service)

Radar спроектирован как полностью обособленный сервис:
- **Изоляция данных:** Radar использует собственную выделенную базу данных PostgreSQL 17 с расширением `vector` (`pgvector`).
- **Связь с родительскими экосистемами (ProfiPass и др.) только по API:** отправка лидов осуществляется через стандартные Webhook-эндпоинты (`POST /api/ingest/:sourceId`), исключая общие таблицы или прямые SQL-связи.
- **Transactional Outbox:** каждая фиксация лида атомарно сохраняет событие в таблицу `outbox_events` и таблицу поканальной доставки `lead_deliveries` для надежной доставки без дублей (`FOR UPDATE SKIP LOCKED`).

