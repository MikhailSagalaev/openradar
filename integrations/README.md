# Готовые интеграции

Шаблоны для автоматизаций поверх публичного API openradar. Импортируйте JSON в n8n
(Workflows → Import from File) и подставьте свои URL/креденшелы.

| Файл | Что делает |
| --- | --- |
| `n8n/signal-webhook-to-slack.json` | подписка на фильтр ленты (Signals в профиле openradar) → пост в Slack-канал |
| `n8n/daily-delta-to-google-sheets.json` | раз в сутки `/api/delta` → новые лиды в Google Sheets |

Подписки создаются в профиле openradar: фильтр ленты → «Следить» → канал webhook
(подпись запроса проверяется секретом, который показывается один раз).
