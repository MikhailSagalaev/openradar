# Подключить агента к openradar

openradar отдаёт вакансии и заказы через MCP. Адрес: `https://openradar.fun/mcp`, транспорт Streamable HTTP. Регистрация не нужна. Без токена работает гостевой доступ: новые посты видны с задержкой, контакты скрыты. Токен агента из [профиля](https://openradar.fun/me) снимает ограничения своего уровня и открывает сохранённые поиски.

## Клиенты

**Claude Code**

```bash
claude mcp add --transport http openradar https://openradar.fun/mcp
```

**Claude Desktop и claude.ai.** Настройки, раздел Connectors, Add custom connector, адрес `https://openradar.fun/mcp`.

**Cursor**, файл `~/.cursor/mcp.json`:

```json
{ "mcpServers": { "openradar": { "url": "https://openradar.fun/mcp" } } }
```

**Gemini CLI**, файл `~/.gemini/settings.json`:

```json
{ "mcpServers": { "openradar": { "httpUrl": "https://openradar.fun/mcp" } } }
```

**VS Code**, файл `.vscode/mcp.json`:

```json
{ "servers": { "openradar": { "type": "http", "url": "https://openradar.fun/mcp" } } }
```

**Codex**, файл `~/.codex/config.toml`:

```toml
[mcp_servers.openradar]
url = "https://openradar.fun/mcp"
```

С токеном добавьте заголовок `Authorization: Bearer mcp_…`. Свой узел подключается так же, адрес `/mcp` на вашем домене, или через stdio: [GETTING_STARTED.md](GETTING_STARTED.md#8-mcp-сервер).

## Инструменты

| Инструмент | Что делает |
|---|---|
| `search_leads` | поиск по ленте: запрос, тип, рынок, формат работы (`workplace`), направление (`direction`), грейд (`grade`), компания (`company`), навыки, наличие и порог бюджета, дата, сортировка (`new`, `score`, `budget`, `relevance`) |
| `get_lead_details` | полная карточка |
| `estimate_compensation` | оценка рыночной оплаты (p25, медиана, p75) по роли, стеку и грейду |
| `submit_lead` | отправить найденную вакансию или заказ в сеть (нужен токен) |
| `vote_lead` | проголосовать за качество лида: `useful`, `junk`, `scam`, `closed` (нужен токен) |
| `get_market_analytics` | сводка по рынку |
| `save_search` | сохранить поиск, новые посты придут в Telegram или на вебхук (нужен токен) |
| `list_saved_searches` | сохранённые поиски (нужен токен) |
| `xray_generate_dorks` | поисковые запросы для выхода на нанимающих руководителей |

Запрос для проверки: «Найди заказы на Python с бюджетом от 30 000 ₽ за последние три дня».

## Для каталогов

Карточка сервера: `/.well-known/mcp/server-card.json`, описание для реестра: [server.json](../server.json).

Официальный реестр обновляется сам при каждом релизе: workflow `MCP registry` входит через GitHub OIDC, токены не нужны.
