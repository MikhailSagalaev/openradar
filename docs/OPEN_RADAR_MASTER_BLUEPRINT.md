# OpenRadar (Core + Mesh): Архитектурная спецификация, системные принципы и бэклог для ИИ-агента

> **Инструкция для ИИ-агента (System Prompt Context):**
> Ты — Senior Systems Architect и Lead TypeScript/PostgreSQL Engineer, работающий над репозиторием `radar-oss` (`openradar.fun`). Твоя задача — последовательно реализовать эволюцию текущего монолитного ядра OpenRadar в децентрализованную устойчивую сеть **OpenRadar Mesh** с гибридной ИИ-модерацией (по паттерну Grokipedia), защитой теории игр (Tit-for-Tat + Skin-in-the-Game) и B2B/B2D-монетизацией (MCP-сервер для ИИ-агентов, Firehose API и DuckDB Lakehouse).
> Строго соблюдай архитектурные инварианты, файловую структуру и критерии приемки (Definition of Done), описанные ниже.

---

## 1. Общие инженерные принципы и инварианты (Неприкосновенные правила)

При внесении любых изменений в кодовую базу ИИ-агент обязан соблюдать следующие ограничения:

1. **Zero-Regression Policy:**
   * Текущий набор тестов (95/95 pass) и строгая типизация (`tsc --noEmit` = 0 ошибок) не должны ломаться ни на одном коммите.
   * Каждая новая фича или рефакторинг сопровождается unit- и интеграционными тестами.
2. **Производительность и экономика ресурсов:**
   * **Runtime:** Node.js 22 LTS, TypeScript (ESM), веб-слой на **Hono SSR**. Никаких тяжелых клиентских SPA-фреймворков. Бюджет ответа сервера: $\text{TTFB} < 25\text{ мс}$.
   * **Хранилище горячих данных:** PostgreSQL 17 + `pgvector` с использованием половинной точности `halfvec(384)` (FP16) для HNSW-индексов. Запрещено использовать `vector(384)` с полной точностью FP32 для экономии $50\%$ RAM.
   * **Холодное хранилище (Lakehouse):** Лиды старше 180 дней или в статусе `closed` архивируются партициями в S3 Parquet. Аналитические запросы по истории выполняются через **DuckDB** поверх Parquet без нагрузки на OLTP-базу.
3. **Безопасность по умолчанию (Security First):**
   * **SSRF DNS Resolver Guard:** Любой исходящий HTTP-запрос (при импорте по URL, проверке аттестации или работе ИИ-арбитра) обязан проходить через резолвер IP с жесткой блокировкой приватных подсетей (`10.0.0.0/8`, `127.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, link-local `169.254.169.254`, IPv6 loopback/unique-local).
   * **CSRF & XSS:** Все мутирующие маршруты защищены `CSRF Origin Guard` / `SameOrigin`. Все пользовательские URL санитизируются (разрешены только `https://` и `http://`; схемы `javascript:`, `data:`, `vbscript:` блокируются).
   * **Локальное хранение секретов узла:** Сессии Telegram MTProto, токены VK и приватные ключи `nsec` (`secp256k1`) хранятся только на узле пользователя в системном связке ключей (`keytar`) или зашифрованном файле (`AES-256-GCM`) и никогда не передаются на сервер.
4. **Дизайн-система (Swiss Typography & Zero Emoji):**
   * Строгий швейцарский интернациональный стиль: системные шрифты, чистая модульная сетка, разделительные линии `1px`, сдержанные микроанимации.
   * **Правило Zero Emoji:** Полный запрет на использование эмодзи в UI, логах, ответах API и документации. Все статусы отображаются строгими текстовыми бейджами и геометрическими индикаторами.
   * Обязательная поддержка двух локалей (`EN` / `RU`) во всех шаблонах SSR.

---

## 2. Целевая архитектура системы (Core + Mesh + AI Gatekeeper)

### 2.1. Схема потоков данных

```text
[ Узел radar-node: TG MTProto / VK / RSS / IMAP ] ──┐
[ Браузерное расширение (MV3 + NIP-07 Signer) ]   ──┼──> [ 1. Конвейер узла: Prepare + Smart PII Scrub ]
[ Прямые корпоративные вебхуки (ATS NIP-05) ]     ──┘                        │
                                                                             ▼
                                                         [ 2. Подпись secp256k1 (Событие radar/1) ]
                                                                             │
                                                                             ▼
                                                   [ 3. Сеть ретрансляторов Nostr (Relay A, Relay B, ...) ]
                                                                             │
                                                                             ▼
                                                   [ 4. Индексатор (openradar.fun / Независимый узел) ]
                                                      ├─> Каскад дедупликации (URL Hash -> MinHash -> halfvec)
                                                      ├─> Расчет доверия (Web-of-Trust PageRank + GitHub NIP-39)
                                                      └─> ИИ-арбитр (Grokipedia-style проверка Scam/Closed)
                                                                             │
                                       ┌─────────────────────────────────────┴─────────────────────────────────────┐
                                       ▼                                                                           ▼
                 [ Горячий слой: PostgreSQL 17 + halfvec(384) ]                              [ Холодный слой: S3 Parquet + DuckDB ]
                                       │                                                                           │
         ┌─────────────────────────────┼─────────────────────────────┐                                             ▼
         ▼                             ▼                             ▼                              [ B2B Market Intelligence API ]
[ Hono SSR Web UI ]        [ B2D MCP Server (AI Agents) ]   [ Firehose Webhooks ]                   (Аналитика вилок, спроса и трендов)
(Tit-for-Tat доступ)       (JSON-поток для LLM-агентов)     (Реалтайм B2B-стрим)
```

---

### 2.2. Четыре ключевых архитектурных механизма (Устранение уязвимостей)

#### Механизм 1. Умный скраббинг персданных (Smart PII Scrubbing) без потери связности
* **Проблема:** Полное удаление любых `@ников` и ссылок вместе с приватными ссылками `t.me/c/...` делает лиды из Telegram-каналов мертвыми (некуда откликнуться и нельзя перейти в приватный канал).
* **Решение в `src/core/privacy.ts`:**
  1. Скраббер разделяет **личные контакты физлица** (телефоны, личные email, прямые личные аккаунты в тексте после паттернов «писать в лс / DM `@username`») и **идентификаторы источника/компании** (публичный юзернейм самого канала `@channel_name`, название компании, корпоративный домен, публичная ссылка на вакансию).
  2. Личные контакты физлиц маскируются согласно 152-ФЗ / GDPR (`[contact hidden — see original post]`).
  3. В метаданные события обязательно записывается публичный адрес канала-источника (`["src", "tg", "<channel_username>", "<msg_id>"]`) или публичный инвайт-хэш, чтобы соискатель всегда мог перейти в сам канал и увидеть оригинал.
  4. Если источник — полностью закрытый чат без публичного юзернейма или внешней ссылки на форму отклика, узел не публикует бесполезный огрызок в общую сеть, а помечает его как `local_only`.

#### Механизм 2. Гибридный ИИ-арбитр по модели Grokipedia + Skin-in-the-Game (Защита от атаки «Жадный фрилансер»)
* **Проблема:** В игре с нулевой суммой сговорившиеся фрилансеры могут кидать 3 страйка `Scam` на лучшие заказы, чтобы сработал автоматический Kill-switch и скрыл лид от конкурентов.
* **Решение в `src/pipeline/arbiter.ts` и `src/core/reputation.ts`:**
  1. Пользовательские голоса `Scam` ($S$) и `Closed` ($C$) **не скрывают лид напрямую**. Они переводят карточку в статус `under_review` и ставят задачу в очередь фонового арбитра (`arbiter_queue`).
  2. **Фоновый воркер-арбитр** скачивает страницу первоисточника `u` (через SSRF-safe клиент) и прогоняет через двухступенчатый верификатор:
     * *Ступень А (Детерминированная):* HTTP-статус ($404 / 410$), наличие маркеров закрытия в DOM/JSON-LD («Вакансия в архиве», «Заказ закрыт», `validThrough` в прошлом) или сигнатур мошенничества (требование крипто-депозита, оплаты за тестовое задание).
     * *Ступень Б (LLM Gatekeeper):* Легкий вызов модели (с жесткой JSON-схемой ответа `{ verdict: "active" | "closed" | "scam", confidence: number, reason: string }`).
  3. Если арбитр подтверждает `scam` или `closed` с $\text{confidence} \ge 0.85$, индексатор публикует подписанное событие аттестации (`kind: 30405`) и активирует Kill-switch.
  4. **Наказание за ложный донос (Slashing):** Если группа ключей отправила сигнал `scam`, но арбитр и $\ge 2$ независимых узла подтвердили, что вакансия живая и легитимная (`verdict: "active"`), репутационный вес ($\text{Trust}_{\text{node}}$) каждого солгавшего ключа умножается на коэффициент штрафа $0.5$ (потеря $50\%$ веса голоса).
  5. **Неявный позитивный сигнал ($U_{\text{implicit}}$):** Вместо ожидания альтруистичных лайков, переход авторизованного участника с $\text{Trust} > 0.3$ по ссылке первоисточника без последующего репорта `scam`/`junk` в течение 15 минут начисляет $+0.25$ к $U$.

#### Механизм 3. Экономика обмена Proof-of-Contribution (Tit-for-Tat против проблемы безбилетника)
* **Проблема:** Пользователям невыгодно запускать узел или расширение, если все эксклюзивные лиды доступны бесплатно в реальном времени.
* **Решение в `src/core/access-tier.ts`:**
  * Все лиды делятся на 2 потока: **Public Base** (серверные коннекторы открытых API и RSS) и **Mesh Realtime** (лиды, присланные узлами участников и браузерными расширениями).
  * Поток **Public Base** доступен всем сразу (0 секунд задержки, работает на SEO).
  * Поток **Mesh Realtime** отдается в реальном времени ($t_{\text{delay}} = 0$) только тем пользователям, у которых выполняется условие контрибьюции:
    $$\text{ActiveContributor} \iff (\text{ValidLeads}_{7\text{d}} \ge 3) \lor (\text{ValidAttestations}_{24\text{h}} \ge 10) \lor (\text{SubscriptionTier} \in \{\text{PRO}, \text{B2B}\})$$
  * Для обычных посетителей без узла/расширения эксклюзивные лиды из Mesh-сети открываются с временным лагом $t_{\text{delay}} = 12\text{ часов}$ (в ленте отображается строгий счетчик: `14 exclusive mesh leads locked for 11h 40m — run radar-node or extension to unlock realtime`).

#### Механизм 4. Математическая модель ранжирования и Web-of-Trust
Итоговый рейтинг лида рассчитывается по формуле:

$$\text{Score} = 0.35 \times \text{Quality}_{\text{model}} + 0.35 \times \text{Community}_{\text{weighted}} + 0.15 \times \text{Trust}_{\text{publisher}} + 0.15 \times \text{Freshness}$$

Где взвешенный социальный сигнал учитывает PageRank-доверие каждого голосующего ключа $i$:

$$U_w = \sum_{i \in V_U} w_i, \quad J_w = \sum_{i \in V_J} w_i, \quad S_w = \sum_{i \in V_S} w_i$$

$$\text{Community}_{\text{weighted}} = \frac{U_w - J_w - 3 S_w}{U_w + J_w + S_w + 2} \in [-1, 1]$$

Затухание свежести во времени ($\Delta t$ в часах с момента публикации):

$$\text{Freshness} = e^{-\lambda \Delta t}, \quad \lambda = \frac{\ln 2}{24} \approx 0.02888 \text{ (период полураспада 24 часа)}$$

---

## 3. Спецификация протокола `radar/1` (поверх Nostr NIP-01) и Схема БД

### 3.1. Типы событий (Event Kinds)

Все события подписываются алгоритмом Schnorr по кривой `secp256k1` согласно стандарту Nostr NIP-01:

| Kind | Название | Тип (NIP-01) | Назначение и обязательные теги |
| :--- | :--- | :--- | :--- |
| `30402` | `RadarLead` | Parameterized Replaceable | Публикация вакансии или заказа. Теги: `["d", "<content_hash>"]`, `["u", "<canonical_url>"]`, `["t", "job" \| "gig"]`, `["src", "<platform>", "<channel>", "<ext_id>"]`, `["mh", "<minhash_b64>"]`, `["v", "radar/1"]` |
| `30403` | `SourceManifest` | Parameterized Replaceable | Манифест узла: какие источники он читает. Теги: `["d", "<source_id>"]`, `["cap", "preview" \| "mtproto" \| "rss" \| "ext"]`, `["interval", "600"]` |
| `30404` | `LeadSignal` | Regular | Голос / репорт участника. Теги: `["e", "<lead_event_id>"]`, `["h", "<content_hash>"]`, `["signal", "useful" \| "junk" \| "scam" \| "closed"]` |
| `30405` | `LeadAttestation` | Regular | Криптографическое подтверждение URL вторым узлом или вердикт ИИ-арбитра. Теги: `["e", "<lead_event_id>"]`, `["h", "<recomputed_hash>"]`, `["status", "verified" \| "mismatch" \| "closed" \| "scam"]`, `["confidence", "0.95"]` |
| `30406` | `TrustList` | Parameterized Replaceable | Подписываемый список модерации (блок-лист ключей/доменов или seed-ключи). Теги: `["d", "moderation-blocklist"]`, `["p", "<npub>"]`, `["domain", "<bad_domain>"]` |

### 3.2. Изменения схемы PostgreSQL 17 (`src/store/migrations/`)

ИИ-агент должен создать новую миграцию `src/store/migrations/004_mesh_and_arbiter.sql`:

```sql
-- Узлы сети и их Web-of-Trust репутация
CREATE TABLE IF NOT EXISTS mesh_nodes (
    pubkey TEXT PRIMARY KEY, -- hex secp256k1 pubkey
    npub TEXT NOT NULL UNIQUE,
    github_username TEXT,
    github_gist_url TEXT,
    nip05_domain TEXT,
    trust_score REAL NOT NULL DEFAULT 0.05 CHECK (trust_score >= 0.0 AND trust_score <= 1.0),
    valid_leads_7d INTEGER NOT NULL DEFAULT 0,
    valid_attestations_24h INTEGER NOT NULL DEFAULT 0,
    false_reports_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Расширение таблицы leads полями Mesh-сети и ИИ-арбитра
ALTER TABLE leads
    ADD COLUMN IF NOT EXISTS publisher_pubkey TEXT REFERENCES mesh_nodes(pubkey),
    ADD COLUMN IF NOT EXISTS nostr_event_id TEXT UNIQUE,
    ADD COLUMN IF NOT EXISTS minhash_sketch BYTEA,
    ADD COLUMN IF NOT EXISTS verification_state TEXT NOT NULL DEFAULT 'unverified'
        CHECK (verification_state IN ('unverified', 'attested', 'under_review', 'verified_active', 'killed_scam', 'killed_closed')),
    ADD COLUMN IF NOT EXISTS attestation_count INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS is_mesh_exclusive BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS unlocked_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Индекс для фильтрации Tit-for-Tat доступа и векторного поиска
CREATE INDEX IF NOT EXISTS idx_leads_visibility
    ON leads (verification_state, unlocked_at DESC);

-- Таблица криптографических подтверждений и сигналов (NIP-01 события 30404 и 30405)
CREATE TABLE IF NOT EXISTS lead_attestations (
    id BIGSERIAL PRIMARY KEY,
    nostr_event_id TEXT NOT NULL UNIQUE,
    lead_id TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    signer_pubkey TEXT NOT NULL REFERENCES mesh_nodes(pubkey),
    kind INTEGER NOT NULL CHECK (kind IN (30404, 30405)),
    signal_or_status TEXT NOT NULL,
    recomputed_hash TEXT,
    confidence REAL DEFAULT 1.0,
    raw_event JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (lead_id, signer_pubkey, kind)
);

-- Очередь задач для фонового ИИ-арбитра (Grokipedia Gatekeeper)
CREATE TABLE IF NOT EXISTS arbiter_queue (
    lead_id TEXT PRIMARY KEY REFERENCES leads(id) ON DELETE CASCADE,
    trigger_reason TEXT NOT NULL, -- 'scam_threshold' | 'closed_report' | 'hash_mismatch'
    attempts INTEGER NOT NULL DEFAULT 0,
    next_run_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## 4. Приоритизированный бэклог разработки для ИИ-агента

ИИ-агент должен выполнять задачи строго последовательно от **Epic 1** к **Epic 6**. После завершения каждой задачи агент обязан запустить `npm test` и `npm run typecheck`.

---

### EPIC 1: Рефакторинг ядра, Smart PII Scrubbing и крипто-примитивы `radar/1`

#### Задача 1.1: Модернизация `src/core/privacy.ts` (Smart PII Scrubbing)
* **Цель:** Устранить проблему мертвых лидов из закрытых каналов при полном соблюдении 152-ФЗ / GDPR.
* **Что сделать:**
  1. Обновить функцию `scrubPII(rawText: string, sourceMeta: SourceMetadata): ScrubResult`.
  2. Вырезать телефоны, личные email и личные хэндлы физлиц в теле текста (`@username` рядом с триггерами связи: `лс`, `личка`, `dm`, `пишите`, `контакт`, `tg:`), заменяя их на `[contact hidden]`.
  3. Сохранять и извлекать в отдельное поле `sourceChannelHandle` публичный идентификатор самого канала/сообщества (например, `t.me/s/golang_jobs` $\rightarrow$ `@golang_jobs`) и корпоративные ссылки (`https://company.com/careers/...`).
  4. Добавить флаг `isActionable: boolean` — возвращать `false`, если у лида нет ни публичного URL, ни публичного идентификатора канала/источника, куда можно перейти.
* **Acceptance Criteria (DoD):**
  * Написаны unit-тесты в `test/privacy.test.ts` на 10+ кейсов (пост с личным `@cto_alex` и публичным каналом `@rust_jobs`, пост только с закрытым `t.me/c/12345/67` без канала, пост с корпоративным URL).

#### Задача 1.2: Реализация протокола и схем событий `src/net/protocol.ts` и `src/net/keys.ts`
* **Цель:** Создать криптографическое ядро для подписи и валидации событий `radar/1` поверх `nostr-tools`.
* **Что сделать:**
  1. Установить зависимость `nostr-tools` (или использовать встроенный `@noble/curves/secp256k1` + `@noble/hashes`).
  2. В `src/net/keys.ts` реализовать генерацию, импорт/экспорт ключей (`nsec` / `npub`) и шифрованное локальное хранение приватного ключа с использованием `AES-256-GCM` (ключ выводится через `scrypt` из пароля или системного хранилища).
  3. В `src/net/protocol.ts` описать Zod- или TypeBox-схемы и билдеры для событий `kind: 30402` (`RadarLead`), `30403` (`SourceManifest`), `30404` (`LeadSignal`), `30405` (`LeadAttestation`), `30406` (`TrustList`).
  4. Реализовать функцию `verifyRadarEvent(event: NostrEvent): ValidationResult`, проверяющую криптографическую подпись Schnorr, соответствие `id = sha256(serialized_event)`, актуальность `created_at` (допуск $\pm 15\text{ мин}$ для защиты от тайм-спуфинга) и валидность тегов.
* **Acceptance Criteria (DoD):**
  * 100% покрытие тестами в `test/net-protocol.test.ts` (подпись, валидация, отказ при подделке 1 байта контента, отказ при просроченном timestamp).

#### Задача 1.3: MinHash-эскизы для быстрой P2P-дедупликации в `src/core/fingerprint.ts`
* **Цель:** Позволить ретрансляторам и индексаторам находить нечеткие дубликаты без пересчета тяжелых LLM-эмбеддингов на каждом узле.
* **Что сделать:**
  1. Добавить в `src/core/fingerprint.ts` генератор компактного MinHash-эскиза (`computeMinHashSketch(normalizedText: string): string` — 64х16-битных хэша по 3-граммам слов, закодированных в `base64url` для тега `["mh", "..."]`).
  2. Реализовать функцию оценки коэффициента Жаккара `estimateJaccardFromSketches(mhA: string, mhB: string): number`. При пороге $\ge 0.75$ считать лиды нечеткими дубликатами.
* **Acceptance Criteria (DoD):**
  * Тесты в `test/fingerprint.test.ts` подтверждают, что репост вакансии с измененным заголовком или переставленными абзацами дает Jaccard $\ge 0.75$, а разные вакансии — $< 0.25$.

---

### EPIC 2: Миграция БД, гибридный ИИ-арбитр (Grokipedia-паттерн) и защита репутации

#### Задача 2.1: Применение миграции `004_mesh_and_arbiter.sql` и обновление `src/store/postgres.ts`
* **Цель:** Подготовить хранилище к работе с узлами, аттестациями, очередью арбитра и Tit-for-Tat доступом.
* **Что сделать:**
  1. Добавить файл миграции `src/store/migrations/004_mesh_and_arbiter.sql`.
  2. Обновить репозиторий в `src/store/postgres.ts`: добавить методы `upsertMeshNode`, `recordAttestation`, `enqueueArbiterCheck`, `getLeadsForFeed(viewerContext: ViewerAccessContext)`.
* **Acceptance Criteria (DoD):**
  * Миграция накатывается идемпотентно (`IF NOT EXISTS`), все существующие тесты БД проходят.

#### Задача 2.2: Реализация фонового ИИ-арбитра в `src/pipeline/arbiter.ts`
* **Цель:** Защитить Kill-switch от намеренного скликивания лучших заказов конкурентами.
* **Что сделать:**
  1. Изменить обработчик пользовательских сигналов (`POST /api/leads/:id/vote` и прием событий `kind: 30404`): при достижении $S \ge 2$ или $C \ge 2$ лид **не скрывается**, а переводится в `verification_state = 'under_review'` и добавляется в `arbiter_queue`.
  2. Создать модуль `src/pipeline/arbiter.ts`:
     * Безопасная загрузка страницы `u` через существующий `SSRF DNS Resolver Guard` с таймаутом $5000\text{ мс}$.
     * **Детерминированный анализатор:** проверка кодов $404 / 410$, проверка текста на стоп-маркеры закрытия («вакансия в архиве», «заказ закрыт», «неактуально», `validThrough` истек) и маркеры скама (запрос seed-фразы, предоплата за верификацию/тестовое).
     * **Опциональный LLM-верификатор** (через совместимый локальный или сетевой endpoint из `process.env.ARBITER_LLM_URL`): передается очищенный текст страницы и возвращается строгий JSON `{ verdict: "active" | "closed" | "scam", confidence: number, reason: string }`.
  3. Если вердикт `scam` или `closed` с $\text{confidence} \ge 0.85$ — обновить статус лида на `killed_scam` / `killed_closed` и выпустить подписанное сервером событие аттестации `kind: 30405`.
  4. **Slashing (Skin-in-the-Game):** Если вердикт арбитра `active` ($\text{confidence} \ge 0.85$), для всех ключей, отправивших `scam` по этому лиду, уменьшить `trust_score = trust_score * 0.5` и увеличить `false_reports_count + 1`.
* **Acceptance Criteria (DoD):**
  * Тесты в `test/arbiter.test.ts` проверяют: (а) 5 фейковых жалоб `scam` на живую вакансию не скрывают ее, а режут рейтинг жалобщиков вдвое; (б) жалоба на реально закрытую вакансию (HTTP 404 или текст «Вакансия в архиве») скрывает карточку.

#### Задача 2.3: Web-of-Trust PageRank и привязка GitHub (NIP-39) в `src/core/reputation.ts`
* **Цель:** Исключить влияние Sybil-ботов (новых ключей без истории) на ранжирование.
* **Что сделать:**
  1. Реализовать верификатор привязки GitHub (`verifyGithubClaim(npub: string, gistUrl: string)`): проверка через GitHub API, что gist принадлежит аккаунту, содержит подпись `npub`, а возраст аккаунта GitHub $> 90\text{ дней}$. При успешной проверке базовый `trust_score` узла повышается с $0.05$ до $0.40$.
  2. Реализовать периодический пересчет `recomputeWebOfTrust()` (итеративный PageRank за 15 итераций с коэффициентом затухания $d = 0.85$ от seed-ключей индексатора и верифицированных GitHub-узлов).
* **Acceptance Criteria (DoD):**
  * Тесты подтверждают, что 100 новых «голых» ключей без аттестаций и без GitHub-привязки не могут перевесить голос 1 верифицированного узла.

---

### EPIC 3: Узел `radar node`, клиент ретрансляторов и Tit-for-Tat механика

#### Задача 3.1: Клиент ретрансляторов Nostr (`src/net/relay-pool.ts`) и CLI `radar node` (`src/cli/node.ts`)
* **Цель:** Позволить любому разработчику запустить узел одной командой `npx radar-oss node` или в Docker.
* **Что сделать:**
  1. В `src/net/relay-pool.ts` реализовать легкий пул WebSocket-соединений к массиву ретрансляторов (по умолчанию `wss://relay.openradar.fun` + 2 резервных публичных relay) с автоматическим реконнектом (exponential backoff) и публикацией в $\ge 3$ релея параллельно.
  2. В `src/cli/node.ts` реализовать команду `radar node start`:
     * При первом запуске генерирует пару ключей `secp256k1` и выводит `npub`.
     * Запускает локальные адаптеры из `src/sources/*` (RSS, публичные превью `t.me/s/...`, HH с домашнего IP, RemoteOK).
     * Прогоняет каждый найденный лид через `prepare` $\rightarrow$ `scrubPII` $\rightarrow$ `computeMinHashSketch` $\rightarrow$ подписывает как событие `kind: 30402` и отправляет в пул ретрансляторов.
     * Слушает из ретрансляторов чужие события `kind: 30402` с публичным URL (с вероятностью $10\%$ для экономии трафика), скачивает URL, сверяет `content_hash` и публикует событие аттестации `kind: 30405` (`verified` или `mismatch`).
* **Acceptance Criteria (DoD):**
  * Интеграционный тест с локальным mock WebSocket-ретранслятором: узел `radar node` находит лид, подписывает его и успешно доставляет на индексатор.

#### Задача 3.2: Индексатор ретрансляторов (`src/index/relay-subscriber.ts`) и Tit-for-Tat доступ (`src/core/access-tier.ts`)
* **Цель:** Принимать события из Mesh-сети на сервере `openradar.fun` и мотивировать запуск узлов.
* **Что сделать:**
  1. Создать сервис `src/index/relay-subscriber.ts`, который подписывается на ретрансляторы по фильтру `kinds: [30402, 30403, 30404, 30405, 30406]`.
  2. При получении `kind: 30402`:
     * Проверить подпись и лимиты (Rate Limit: не более 60 лидов/час на верифицированный ключ, 10 лидов/час на новый ключ; при превышении — отбросить).
     * Если лид новый — сохранить в БД с флагом `is_mesh_exclusive = true` и `unlocked_at = NOW() + INTERVAL '12 hours'`, начислить узлу `valid_leads_7d + 1`.
     * Если такой `content_hash` уже есть в БД от другого узла — засчитать событие как автоматическую аттестацию (`attestation_count + 1`). При `attestation_count >= 2` перевести лид в `verification_state = 'attested'`.
  3. В `src/core/access-tier.ts` и Hono SSR роутах (`src/server/routes.ts`):
     * Проверять статус текущего пользователя (по сессии GitHub или заголовку `X-Radar-Node-Pubkey` с подписанным токеном NIP-98).
     * Если пользователь — `ActiveContributor` ($\text{ValidLeads}_{7\text{d}} \ge 3$ или $\text{ValidAttestations}_{24\text{h}} \ge 10$ или платный ключ), показывать все лиды сразу, игнорируя `unlocked_at`.
     * Если пользователь — гость без вклада, скрывать лиды с `unlocked_at > NOW()` и выводить в верхней части ленты строгую швейцарскую строку статуса с количеством заблокированных эксклюзивных лидов и кнопкой подключения узла/расширения.
* **Acceptance Criteria (DoD):**
  * Тесты проверяют, что контрибьютор видит свежий Mesh-лид сразу, а анонимный безбилетник видит счетчик ожидания 12 часов.

---

### EPIC 4: Браузерное расширение как полноценный узел сети (Manifest V3 + NIP-07)

#### Задача 4.1: Внедрение крипто-ключа и подписи в `extension/`
* **Цель:** Превратить браузерное расширение в самый массовый и безопасный узел сети без риска банов в Telegram.
* **Что сделать:**
  1. Добавить в `extension/` генерацию и хранение ключа `secp256k1` в `chrome.storage.local` (плюс совместимость с внешними NIP-07 расширениями `window.nostr`, если они установлены).
  2. При нажатии `Alt+Shift+R` (или клике по иконке расширения) на странице вакансии в LinkedIn, X/Twitter, Habr Career, Wellfound или Notion-доске:
     * Извлечь `schema.org/JobPosting` или выделенный блок текста.
     * Выполнить локальный `scrubPII` прямо в сервис-воркере расширения.
     * Подписать событие `kind: 30402` локальным ключом пользователя и отправить на ретранслятор / API индексатора.
     * Автоматически сохранить в `cookies` / заголовках браузера токен контрибьютора, разблокирующий пользователю реалтайм-ленту `openradar.fun` (Tit-for-Tat).
* **Acceptance Criteria (DoD):**
  * Захват страницы в 1 клик создает валидное подписанное событие `kind: 30402` и мгновенно активирует статус `ActiveContributor` для браузера пользователя.

---

### EPIC 5: Коммерческий слой B2D / B2B (MCP-сервер для ИИ-агентов, Firehose API и Lakehouse Analytics)

#### Задача 5.1: MCP-сервер для ИИ-агентов (`src/mcp/server.ts`)
* **Цель:** Дать внешним ИИ-агентам прямой протокольный доступ к поиску заказов и аналитике рынка.
* **Что сделать:**
  1. Реализовать стандартный **Model Context Protocol (MCP)** сервер (транспорт `stdio` для локального CLI `radar mcp` и `SSE / Streamable HTTP` на эндпоинте `/mcp` в Hono).
  2. Описать 3 MCP-инструмента (`tools`):
     * `search_verified_leads`: поиск по стеку, типу (`job`/`gig`), бюджету, `remote` и гибридному векторному сходству (`halfvec(384)`). Возвращает только проверенные лиды (`verification_state IN ('attested', 'verified_active')`).
     * `get_salary_benchmarks`: запрос в DuckDB поверх Parquet/Postgres для получения медианных вилок (p25, p50, p75, p90) по указанному стеку и грейду.
     * `report_lead_signal`: позволяет ИИ-агенту пользователя отправить подписанный сигнал `closed` или `scam`, если агент перешел по ссылке и обнаружил, что заказ закрыт.
* **Acceptance Criteria (DoD):**
  * Тест MCP-протокола: запрос `tools/list` и вызов `search_verified_leads` возвращают валидный JSON-RPC 2.0 ответ со временем выполнения $< 50\text{ мс}$.

#### Задача 5.2: Коммерческий Firehose API и DuckDB Market Intelligence (`src/server/b2b-api.ts`)
* **Цель:** Подготовить инфраструктуру для платных B2B-подписок (агентства лидогенерации и HR-аналитика).
* **Что сделать:**
  1. Добавить таблицу API-ключей (`b2b_api_keys` с тарифными лимитами и фильтрами вебхуков).
  2. Реализовать эндпоинт `GET /api/v1/firehose/stream` (Server-Sent Events) и доставку исходящих подписанных вебхуков для B2B-клиентов в момент появления нового подтвержденного лида (`verification_state = 'attested'`).
  3. Реализовать эндпоинт `GET /api/v1/analytics/market-pulse` на базе **DuckDB**: агрегированная статистика без каких-либо персональных данных (динамика спроса по языкам программирования, медианные бюджеты, среднее время жизни вакансии до статуса `closed`).
* **Acceptance Criteria (DoD):**
  * Маршруты закрыты авторизацией `Bearer <api_key>`, покрыты тестами и не возвращают никаких полей с персданными.

---

### EPIC 6: Безопасный Telegram MTProto-коннектор и проверяемый HRW-шардинг

#### Задача 6.1: Безопасный коннектор `src/sources/telegram-mtproto.ts`
* **Цель:** Дать продвинутым операторам узлов возможность индексировать нишевые Telegram-каналы без бана основного аккаунта.
* **Что сделать:**
  1. Реализовать адаптер на базе `gramjs` (`telegram`), работающий **исключительно на узле `radar node`**.
  2. Встроить жесткие предохранители на уровне кода:
     * **Strict Read-Only:** блокировать любые методы записи/вступления (`messages.sendMessage`, `channels.joinChannel` запрещены на уровне обертки).
     * Индексировать только каналы (`broadcast = true`), явно включенные пользователем в белый список конфига; личные диалоги и маленькие групповые чаты игнорировать по умолчанию.
     * Принудительный rate-limiter: не чаще 1 запроса `messages.getHistory` в $3000\text{–}6000\text{ мс}$ со случайным джиттером и автоматическим сном при получении `FLOOD_WAIT_X`.
     * При настройке CLI выводить явное предупреждение с рекомендацией использовать отдельный технический Telegram-аккаунт.
* **Acceptance Criteria (DoD):**
  * Тесты с моком MTProto проверяют соблюдение интервалов джиттера, обработку `FLOOD_WAIT` и блокировку чтения приватных личных диалогов.

#### Задача 6.2: Шардинг опроса через Rendezvous Hashing (HRW) с защитой от затмения (`src/net/sharding.ts`)
* **Цель:** Распределить опрос публичных источников между узлами сети без единого координатора и защититься от Eclipse-атаки (утаивания вакансий).
* **Что сделать:**
  1. Реализовать функцию расчета ранга узла для источника $S$ в текущей часовой эпохе $E = \lfloor \text{unix\_time} / 3600 \rfloor$:
     $$\text{score}(S, \text{npub}, E) = \text{SHA256}(S \parallel \text{npub} \parallel E)$$
  2. Добавление эпохи $E$ в хэш приводит к автоматической ротации ответственных узлов каждый час: злоумышленник не может подобрать статический `npub`, чтобы вечно монополизировать канал $S$.
  3. Учитывать в списке кандидатов только узлы с $\text{Trust}_{\text{node}} \ge 0.25$, опубликовавшие активный манифест `kind: 30403`. Топ-$k$ ($k = 2$) узлов опрашивают источник регулярно, а любой другой узел с вероятностью $5\%$ делает контрольную canary-проверку.
* **Acceptance Criteria (DoD):**
  * Детерминированные unit-тесты в `test/sharding.test.ts` подтверждают равномерность распределения источников по узлам и смену лидеров при смене часовой эпохи $E$.

---

## 5. Порядок запуска работы для ИИ-агента (Команда старта)

Когда этот файл загружен в контекст агента, выполни следующий алгоритм действий:
1. Прочитай структуру текущего репозитория (`package.json`, `tsconfig.json`, `src/`).
2. Запусти существующие тесты (`npm test`) и проверку типов (`npm run typecheck`), чтобы зафиксировать базовую зеленую линию (baseline).
3. Начни выполнение с **EPIC 1 $\rightarrow$ Задача 1.1 (`src/core/privacy.ts`)**, затем переходи к **Задаче 1.2** и далее строго по списку, отчитываясь после каждого закрытого эпика результатами тестов.