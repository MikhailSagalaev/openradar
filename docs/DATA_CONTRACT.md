# Контракт данных для операторов узлов · Node Operator Data Contract

Этот документ фиксирует гарантии сохранности данных, конфигурации и совместимости при обновлении саморазвёрнутых узлов `openradar` (включая подготовку к ветке `v1.0`).

## 1. Что никогда не перезаписывается при обновлении

При запуске `deploy-server.sh`, `scripts/autodeploy.sh` или `pnpm init:env`:

1. **Файл `.env` и секреты оператора:**
   - `scripts/init-env.mjs` никогда не изменяет существующий `.env` без явного флага `--force`.
   - `deploy-server.sh` сохраняет все пользовательские ключи (`RADAR_ADMIN_TOKEN`, `RADAR_NODE_KEY`, `RADAR_WEB_KEY_SECRET`, `RADAR_TELEGRAM_SESSION*`, `DATABASE_URL`, `RADAR_PROXY_URL`).
2. **Тома PostgreSQL и история публикаций:**
   - Данные хранятся в именованном Docker-томе PostgreSQL (`pgdata`).
   - При смене мажорной версии PostgreSQL в `docker-compose.yml` скрипт `scripts/pg-upgrade.sh` автоматически снимает дамп со старого контейнера, разворачивает его в новый том и оставляет старый том нетронутым для мгновенного отката.
   - Перед каждым запуском миграций в `deploy-server.sh` создаётся полный дамп `backups/pre-deploy-YYYYMMDD-HHMMSS.dump` (`pg_dump -Fc`). Если создание бэкапа не удалось — деплой останавливается до применения миграций.
3. **Пользовательские источники и подписки:**
   - Все источники, добавленные оператором через веб-интерфейс или CLI (`sources`), их индивидуальные интервалы опроса (`intervalSec`), стоп-слова, прокси и статус `enabled` хранятся в БД и сохраняются при любых обновлениях кода.
   - Миграции в `migrations/*.sql` идемпотентны, выполняются строго вперёд в транзакции и фиксируются в таблице `schema_migrations`.

## 2. Обратная совместимость API и протокола `radar/2`

- **Публичные маршруты чтения:** `GET /api/leads`, `GET /api/market`, `GET /api/insights`, `GET /api/companies/suggest`, `GET /v2/feed`, `GET /v2/stream`, `POST /mcp` и `GET /feed.rss` сохраняют обратную совместимость полей JSON-ответов (новые поля добавляются только аддитивно).
- **Формат наблюдений `radar/2.observation`:** узлы и внешние парсеры (Python SDK / TypeScript SDK / webhook `POST /api/v2/ingest/:id`), отправляющие минимальный контракт (`source.platform`, `source.channel`, `text`), продолжают работать без изменений при обновлении хаба или узла.
- **Контракт адаптеров источников (`SourceAdapter`):** интерфейс `poll(source, ctx) => Promise<RawLead[]>` в `src/sources/` стабилен; новые поля `RawLead` всегда опциональны.
