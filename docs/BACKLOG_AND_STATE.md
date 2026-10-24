# OpenRadar: Backlog, Архитектурный статус и Журнал реализации

Данный документ является единым источником правды для команды инженеров и ИИ-агентов. Он фиксирует текущее состояние разработки децентрализованной mesh-сети OpenRadar, выполненные задачи, архитектурные инварианты и пошаговый план работ.

---

## 1. Системные инварианты проекта

- **Zero-Regression Policy:** Все существующие тесты (включая unit, e2e, security) обязаны оставаться зелеными при каждом коммите.
- **Zero Emoji Doctrine:** Строжайший запрет на использование любых эмодзи в коде, комментариях, коммитах, логах и UI. Дизайн платформы следует строгой швейцарской типографике (Swiss Style / Clean Monochrome).
- **Бренд:** Название пишется строго слитно — `OpenRadar`.
- **Защита безопасности:**
  - Полный запрет SSRF: все внешние HTTP-запросы обязаны проходить через `assertSafeUrl` / `fetchSafeHttp` с резолвом DNS и блокировкой приватных подсетей (RFC 1918, RFC 3927, loopback, AWS metadata 169.254.169.254).
  - CSRF-защита: проверка `Origin` / `Sec-Fetch-Site` для всех мутирующих запросов.
  - Rate limiting и скоринг репутации (Web-of-Trust) для защиты от Sybil-атак и DDoS.
- **Стек:** Node.js 22+ (native WebSocket, crypto OpenSSL), TypeScript 5.8+, Hono SSR, PostgreSQL 17 + `pgvector halfvec(384)`.

---

## 2. Статус реализации эпиков (Мастер-бэклог)

### EPIC 1: Рефакторинг ядра, Smart PII Scrubbing и крипто-примитивы radar/1
- [x] **Задача 1.1: Модернизация Smart PII Scrubbing** (`src/core/privacy.ts`)
  - Функция `scrubPII` маскирует персональные контакты (email, телефоны, личные хэндлы рядом с триггерами связи), сохраняя публичные каналы (`sourceChannelHandle`) и корпоративные карьерные ссылки.
  - Флаг `isActionable: boolean` отсекает посты из закрытых групп.
  - Тесты: 13 тестов в `test/privacy.test.ts` (100% pass).
- [x] **Задача 1.2: Протокол и схемы событий radar/1** (`src/net/protocol.ts`, `src/net/keys.ts`)
  - Генерация и парсинг ключей secp256k1 (`npub` / `nsec` Bech32).
  - Шифрованное локальное хранение приватных ключей (AES-256-GCM + scrypt).
  - Подпись и валидация BIP-340 Schnorr с коррекцией четности Y-координаты.
  - Zod-схемы и билдеры событий `kind: 30402` (RadarLead), `30403` (SourceManifest), `30404` (LeadSignal), `30405` (LeadAttestation), `30406` (TrustList).
  - Защита от спуфинга времени (дрейф не более $\pm 15$ минут).
  - Тесты: 7 тестов в `test/net-protocol.test.ts` (100% pass).
- [x] **Задача 1.3: MinHash-сигнатуры для быстрого P2P-дедупа** (`src/core/fingerprint.ts`)
  - 64 16-битных бакета (128 байт, base64url) для тега `["mh", "..."]`.
  - Оценка Жаккара: идентичные тексты = 1.0, репост со сменой абзацев $\ge 0.75$, разные вакансии $< 0.25$.
  - Тесты: 5 тестов в `test/fingerprint.test.ts` (100% pass).

### EPIC 2: Миграция БД, гибридный ИИ-арбитр (Grokipedia) и Web-of-Trust
- [x] **Задача 2.1: Миграция БД и обновление хранилища** (`migrations/008_mesh_and_arbiter.sql`, `src/store/postgres.ts`, `src/store/memory.ts`)
  - Таблицы `mesh_nodes`, `lead_attestations`, `arbiter_queue`.
  - Поля `publisher_pubkey`, `nostr_event_id`, `minhash_sketch`, `verification_state`, `attestation_count`, `is_mesh_exclusive`, `unlocked_at` в `leads`.
  - Методы `upsertMeshNode`, `getMeshNode`, `recordAttestation`, `enqueueArbiterCheck`, `getLeadsForFeed`.
- [x] **Задача 2.2: Фоновый ИИ-арбитр со слэшингом** (`src/pipeline/arbiter.ts`)
  - Детерминированная проверка кодов 404/410, маркеров закрытия и маркеров скама.
  - Опциональный LLM-верификатор через совместимый эндпоинт.
  - Slashing: при подтверждении активности лида все ключи, подавшие ложный донос `scam`, теряют 50% `trust_score` и получают `false_reports_count + 1`.
  - Тесты: 4 теста в `test/arbiter.test.ts` (100% pass).
- [x] **Задача 2.3: Web-of-Trust PageRank и привязка GitHub NIP-39** (`src/core/reputation.ts`)
  - Проверка GitHub Gist с доказательством `npub` и возраста аккаунта $> 90$ дней (подъем базового траста до 0.40).
  - Персонализированный PageRank (15 итераций, $d = 0.85$) с защитой от Sybil-атак (100 сговорившихся «голых» ключей не могут перевесить 1 верифицированный узел).
  - Тесты: 4 теста в `test/reputation.test.ts` (100% pass).

### EPIC 3: Узел radar node, клиент ретрансляторов и Tit-for-Tat механика
- [x] **Задача 3.1: Пул ретрансляторов Nostr и CLI `radar node`** (`src/net/relay-pool.ts`, `src/cli/node.ts`)
  - Клиент WebSocket-пула с авто-реконнектом (exponential backoff) и параллельной публикацией в релеи (`publish`, `subscribe`).
  - Команда `radar node start`: генерация ключа, запуск адаптеров, отправка событий `kind: 30402`, background-аттестация чужих событий `kind: 30405`.
  - Тесты: 3 теста в `test/relay-pool.test.ts` (100% pass).
- [x] **Задача 3.2: Индексатор ретрансляторов и Tit-for-Tat доступ** (`src/index/relay-subscriber.ts`, `src/core/access-tier.ts`)
  - Подписка на ретрансляторы по фильтрам `kinds: [30402..30405]`.
  - Rate-limiting (60 лидов/час для верифицированных, 10 лидов/час для новых).
  - Сохранение с 12-часовым лагом для безбилетников (`unlocked_at = NOW() + 12h`).
  - Автоматическая peer-аттестация при повторном обнаружении хэша.
  - Мгновенный real-time доступ для `ActiveContributor` и строгий швейцарский статус-баннер с счетчиком скрытых лидов для гостей.
  - Тесты: 3 теста в `test/access-tier.test.ts` (100% pass).

### EPIC 4: Браузерное расширение как узел сети (Manifest V3 + NIP-07)
- [x] **Задача 4.1: Крипто-ключ и подпись в extension** (`extension/crypto.js`, `extension/manifest.json`)
  - Генерация и хранение secp256k1 ключа в `chrome.storage.local` с NIP-07 совместимостью (`window.nostr`).
  - Локальный клиентский `scrubPIILocal` прямо в сервис-воркере расширения.
  - Подпись событий `kind: 30402` и мгновенная разблокировка статуса `ActiveContributor` для браузера.
  - Тесты: 5 тестов в `test/extension.test.ts` (100% pass).

### EPIC 5: Коммерческий слой B2D / B2B
- [x] **Задача 5.1: MCP-сервер для ИИ-агентов** (`src/mcp/server.ts`, `src/cli/index.ts`, `src/server/app.ts`)
  - Стандартный Model Context Protocol (MCP) JSON-RPC 2.0 сервер с транспортами `stdio` (CLI `radar mcp`) и HTTP (`POST /mcp`).
  - Экспортированы 4 инструмента:
    1. `search_leads`: семантический и параметрический поиск по стеку, типу, бюджету и верификации.
    2. `get_lead_details`: получение полного очищенного текста, канала и статуса верификации.
    3. `verify_lead_url`: мгновенный триггер проверки источника арбитром через SSRF Guard.
    4. `get_market_analytics`: 7-дневная аналитика спроса на навыки и медианных бюджетов.
  - Тесты: 6 тестов в `test/mcp.test.ts` (100% pass).
- [x] **Задача 5.2: B2B Realtime Firehose API** (`src/server/firehose.ts`, `src/server/app.ts`, `src/pipeline/ingest.ts`)
  - Эндпоинт `GET /api/v1/firehose` (Server-Sent Events) с Bearer-авторизацией для агентств и верифицированных узлов.
  - Фильтрация по `stack`, `min_budget`, `types`, `only_verified`.
  - Heartbeat каждые 15 секунд и автоматическая трансляция при инжесте новых лидов.
  - Тесты: 3 теста в `test/firehose.test.ts` (100% pass).

### EPIC 6: HRW-шардинг и ротация эпох
- [x] **Задача 6.1: Рандеву-хэширование (HRW)** (`src/net/sharding.ts`)
  - Равномерное детерминированное шардирование источников между активными узлами (1000 источников на 10 узлов = $100 \pm 25$ на узел).
  - Свойство минимального нарушения кэша при отказе узла (перераспределяются только источники упавшего узла).
  - Ротация эпох каждые 6 часов (`EPOCH_DURATION_SEC = 21600`) для предотвращения монополизации.
  - Тесты: 4 теста в `test/sharding.test.ts` (100% pass).

---

## 3. Релиз OpenRadar v0.5.0: Защита второго порядка и Ghost Job X-Ray

### EPIC 7: Защита арбитра от ложных срабатываний (SPA / Login-Wall Guard)
- [x] **Задача 7.1: MinHash Divergence Guard в арбитре** (`src/pipeline/arbiter.ts`)
  - При HTTP 200 OK арбитр сравнивает текущий MinHash скачанной страницы с исходным `minhash_sketch` лида (или тегом `["mh", "..."]`).
  - При коэффициенте Жаккара $J < 0.35$ (редирект на главную, заглушка закрытия без явного текста, пустой Next.js/React скелет, логин-волл) выставляется вердикт `inconclusive`, а статус переводится в `under_review`.
  - **Инвариант слэшинга:** Слэшинг репутации (`trust_score * 0.5`) категорически запрещен при вердикте `inconclusive`. Репортеры не наказываются за закрытые SPA-страницы.
  - Тесты: 5 тестов в `test/arbiter.test.ts` (100% pass).

### EPIC 8: Устранение дыр в Tit-for-Tat (GitHub 7-Day Trial & Canary Traps)
- [x] **Задача 8.1: GitHub 7-Day Trial** (`src/core/access-tier.ts`, `migrations/009_v050_features.sql`, `src/store/postgres.ts`, `src/store/memory.ts`)
  - Добавлено поле `github_verified_at` и `is_banned` в таблицу `mesh_nodes`.
  - Статус `ActiveContributor` по подтвержденному GitHub действует строго первые 7 дней. По истечении 7 дней узел обязан вносить вклад в сеть ($\ge 3$ лидов в неделю или $\ge 10$ аттестаций в сутки) для сохранения режима без лага.
  - Тесты: 3 теста в `test/access-tier.test.ts` (100% pass).
- [x] **Задача 8.2: Канарейки (Canary Traps & Cheater Slashing)** (`src/pipeline/canary.ts`, `src/index/relay-subscriber.ts`)
  - Генератор и фоновый воркер тестовых лидов-канареек (`canary.openradar.fun`) с заведомо битыми URL.
  - Автоматическое вычисление слепых ботов-валидаторов: при получении события 30405 со статусом `verified` на канарейку узел мгновенно банится (`trust_score = 0.0`, `is_banned = true`, `false_reports_count += 999`).
  - Тесты: 3 теста в `test/canary.test.ts` (100% pass).

### EPIC 9: Защита авторов узлов от деанонимизации (Blinded Relaying / HMAC Keys)
- [x] **Задача 9.1: Генерация производных ключей эпохи** (`src/net/derived-keys.ts`, `src/cli/node.ts`)
  - Детерминированная деривация: $\text{privkey}_{\text{child}} = \text{HMAC-SHA256}(\text{master\_privkey}, \text{source\_id} \parallel \text{week\_epoch})$ с гарантией четности координаты Y кривой secp256k1 (BIP-340).
  - Публичные события 30402 подписываются дочерним ключом эпохи.
  - Устранена возможность деанонимизации авторов сканирования через корреляцию каналов.
  - Тесты: 5 тестов в `test/derived-keys.test.ts` (100% pass).

### EPIC 10: Вирусное расширение «Ghost Job & Salary X-Ray» (Manifest V3)
- [x] **Задача 10.1: Сверхбыстрый аналитический эндпоинт `/api/v1/xray`** (`src/pipeline/xray.ts`, `src/server/app.ts`)
  - Отдает за $< 25\text{ мс}$ медианную зарплату, квартили (p25, p75), количество дубликатов по рынку и оценку надежности источника (0.95 для верифицированных).
  - Поддержка CORS для запросов со сторонних доменов.
- [x] **Задача 10.2: Swiss-Style плашка в расширении** (`extension/content.js`, `extension/background.js`)
  - На сайтах hh.ru, linkedin.com, career.habr.com, kwork.ru, upwork.com внедряет аккуратную тонкую плашку `[ OpenRadar X-Ray ]` прямо над заголовком вакансии.
  - В фоне парсит `schema.org/JobPosting` и синхронизирует лид с сетью.
  - Полное соответствие Zero-Emoji Doctrine.
  - Тесты: 4 теста в `test/xray.test.ts` (100% pass).

---

## 4. Сводка тестового покрытия

На релизе v0.5.0:
- Всего тестовых файлов: **27** (+3 новых файла)
- Всего тестов: **170** (+13 новых тестов, 100% pass)
- Ошибки компилятора TypeScript: **0** (`tsc --noEmit`)

---

## 5. Памятка для ИИ-агентов (AI Agent Directives)

1. **Команды запуска тестов и сборки:**
   - Полный прогон тестов: `node ./node_modules/vitest/vitest.mjs run`
   - Проверка типов TypeScript: `node ./node_modules/typescript/bin/tsc --noEmit`
   - Запуск узла в dev-режиме: `node ./bin/radar.js node start --once`
   - Запуск MCP-сервера для ИИ: `node ./bin/radar.js mcp`

2. **Работа со сторонними API и парсерами:**
   - Любой исходящий HTTP-запрос ОБЯЗАН проходить валидацию адреса через `assertSafeUrl` из `src/core/ssrf.ts` для блокировки локальных сетей и метаданных облаков (SSRF-защита).
   - Все тексты вакансий перед сохранением или трансляцией в сеть Nostr обязаны проходить очистку персональных данных через `scrubPII` из `src/core/privacy.ts`.

3. **Соблюдение дизайна:**
   - Никаких эмодзи в интерфейсе, логах, коде и коммитах.
   - Использовать строгие компоненты швейцарской типографики из `src/server/ui.ts`.
