# Документация openradar · Documentation Index

Навигатор по всем документам репозитория [openradar](../README.ru.md) ([English README](../README.md)).

---

## 1. Быстрый старт и использование · Getting Started

| Документ | Описание / Description |
| --- | --- |
| [GETTING_STARTED.md](GETTING_STARTED.md) | 9 пошаговых сценариев на русском: от чтения хаба до запуска своего сервера, парсера, расширения и MCP |
| [GETTING_STARTED_EN.md](GETTING_STARTED_EN.md) | English Getting Started guide: all 9 scenarios from reading the hub to self-hosting a node and MCP |
| [EXTENSION.md](EXTENSION.md) | Браузерное расширение (Chrome / Edge / Brave / Яндекс): сохранение заказов в 1 клик, оценка оплаты и X-Ray |

## 2. ИИ-агенты, API, уведомления и выгрузки · AI Agents, API & Exports

| Документ | Описание / Description |
| --- | --- |
| [MCP.md](MCP.md) | Подключение ИИ-агентов (Claude, Cursor, Gemini CLI, VS Code, Codex) к MCP-серверу `https://openradar.fun/mcp` |
| [SIGNALS.md](SIGNALS.md) | Signals: подписки на сохранённые поиски с доставкой в Telegram и на вебхук с HMAC-подписью |
| [JOBSPY_EXPORT.md](JOBSPY_EXPORT.md) | Выгрузка в JobSpy-совместимый CSV (`radar export --jobspy --source ... --type ... --since ...`) для pandas |
| [../integrations/README.md](../integrations/README.md) | Готовые воркфлоу для n8n (выгрузка дельты в Google Sheets, доставка вебхуков Signals в Slack) |
| [../sdk/python/README.md](../sdk/python/README.md) | Python SDK без внешних зависимостей (`HubClient`, `NodeClient`, BIP-340 `Key`, Telethon/Pyrogram) |

## 3. Архитектура, протокол, поиск и ML · Architecture, Protocol & Search

| Документ | Описание / Description |
| --- | --- |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Конвейер узла, нормализация, дедупликация (MinHash LSH), расчёт рейтинга заказа (0–100), схема БД и HTTP API |
| [PROTOCOL.md](PROTOCOL.md) | Децентрализованный протокол `radar/2`: формат наблюдений, BIP-340 подписи, склейка, уровни доступа и очки |
| [PARADEDB.md](PARADEDB.md) | Полнотекстовый BM25-поиск через ParadeDB (`pg_search` / Tantivy) поверх PostgreSQL 18 и фолбэк на `tsvector` |
| [QUALITY.md](QUALITY.md) | Правила качества ленты, фильтрация спама/инфобизнеса/рекламы каналов, разделение ролевых и стековых навыков |
| [DECISIONS.md](DECISIONS.md) | Каскадный классификатор решений (тип поста, направление, формат работы `remote/hybrid/onsite`, грейд) и ручная разметка |
| [LOCAL_LLM.md](LOCAL_LLM.md) | Подключение локальных и облачных LLM (Ollama, LM Studio, OpenAI-совместимые эндпоинты, Groq) для извлечения фактов |

## 4. Исследования рынка · Market Research

| Документ | Описание / Description |
| --- | --- |
| [RESEARCH_METHODOLOGY.md](RESEARCH_METHODOLOGY.md) | Методология расчёта рыночных зарплат и бюджетов заказов на `/research` (квартили, фильтрация выбросов, CC BY 4.0) |

## 5. Источники и этика сбора · Sources & Compliance

| Документ | Описание / Description |
| --- | --- |
| [PLUGINS.md](PLUGINS.md) | Как написать адаптер нового источника (`pnpm new:connector`) или получателя уведомлений (sink) |
| [GIG_SOURCES.md](GIG_SOURCES.md) | Карта площадок фриланс-заказов и проектной работы (РФ и мир) |
| [SOURCES_COVERAGE.md](SOURCES_COVERAGE.md) | Покрытие источников вакансий и заказов, ATS-провайдеры и открытые JSON-доски |
| [SOURCES_ROBOTS.md](SOURCES_ROBOTS.md) | Журнал аудита `robots.txt` и правил доступа к площадкам |
| [SOURCE_INDEXING_LOG.md](SOURCE_INDEXING_LOG.md) | Журнал решений по источникам (`indexed`, `blocked`, `retired`) с результатами HTTP-проверок |

## 6. Эксплуатация, дорожная карта и развитие · Operations & Roadmap

| Документ | Описание / Description |
| --- | --- |
| [BACKUP_AND_RESTORE.md](BACKUP_AND_RESTORE.md) | Резервное копирование PostgreSQL и восстановление из дампа |
| [PUBLISHING.md](PUBLISHING.md) | Выпуск релизов, автодеплой по git-тегам и публикация в MCP Registry через GitHub OIDC |
| [ROADMAP.md](ROADMAP.md) | Дорожная карта, эпики и критерии релиза v1.0 |
| [TASKS.md](TASKS.md) | Оперативный чек-лист задач |
| [STATE_2026-11.md](STATE_2026-11.md) | Срез состояния проекта и приоритетов (ноябрь 2026) |
| [AUDIT_2026-11.md](AUDIT_2026-11.md) | Аудит качества данных и выдачи MCP |
| [COMPETITORS.md](COMPETITORS.md) | Сравнение с коммерческими агрегаторами, JobSpy и карьерными ИИ-агентами |
| [BRAND.md](BRAND.md) | Логотипы, цвета и правила написания названия `openradar` |
| [CONTRIBUTORS.md](CONTRIBUTORS.md) | Участники разработки |
