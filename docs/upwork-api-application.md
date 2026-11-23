# Пакет заявки на Upwork API (подготовлено, НЕ подано)

Статус: готов к отправке владельцем. Агент подать не может: форма требует залогиненного аккаунта Upwork (логин, Cloudflare, верификация), обход логинов запрещён этикой проекта (AGENTS.md §4), пароли агент не вводит.

Дата подготовки: 2026-11-18. Связано с [research-run.md](research-run.md), гипотеза H4.

## 1. Куда подавать

- Официальная кнопка «Request an API Key»: **https://www.upwork.com/services/api/apply** (из статьи поддержки, проверена вживую 18.11).
- Входная точка: https://www.upwork.com/developer («Get an account → Apply for an API key → Try it out»).
- Нужен залогиненный аккаунт Upwork. Решение приходит на email примерно за неделю.
- [tryAGI/Upwork](https://github.com/tryAGI/Upwork) — это C# SDK (MIT), НЕ портал заявки. Для openradar (TypeScript) он полезен только как справочник по OAuth-потоку и GraphQL-схеме; адаптер будет свой (после Context Gate).

## 2. Чек-лист соответствия аккаунта (официальные требования)

Источник: https://support.upwork.com/hc/en-us/articles/115015857647-How-to-request-an-API-key-from-Upwork (проверено вживую 2026-11-18).

- [ ] Настоящее имя в профиле
- [ ] Действительный адрес в личном/корпоративном профиле
- [ ] Фото профиля
- [ ] Активный верифицированный платёжный метод
- [ ] Пройдена верификация личности (ID verification)
- [ ] **≥ $25 000 lifetime earnings/spend** (заработок или траты, суммарно; заработок агентства засчитывается только при текущей аффилиации)
- [ ] **Job Success Score ≥ 90%** (для фрилансеров и агентств)
- [ ] Аккаунт в good standing, без активных блокировок

**Критическое неизвестное:** есть ли у владельца (или партнёра) такой аккаунт. Без соответствия заявка бессмысленна — большинство отказов именно из-за несоответствия требованиям.

## 3. Что запрашивать

Scopes (по README tryAGI/Upwork, read-only job search):
- `Common Entities - Read-Only Access`
- `Read marketplace Job Postings`

Только чтение: `marketplaceJobPostingsSearch` (курсорная пагинация, сортировка по recency), `marketplaceJobPosting`, `marketplaceJobPostingsContents`. Никаких мутаций (proposals, invites и т.п.). Не использовать устаревший `marketplaceJobPostings`.

## 4. Обязательные подтверждения в форме

- [ ] Приложение укладывается в лимит **40 000 запросов/день** (наш план: сотни поисков/день с пагинацией и кэшем — на порядки меньше).
- [ ] Приложение **не использует имя, лого, фирменные цвета и другие товарные знаки Upwork**.
- [ ] Заявка не дублирует уже одобренный ключ.
- [ ] Описание: internal или public application; роль (client / agency owner / developer); зачем нужен ключ; если от имени клиента — email его аккаунта Upwork.

## 5. Черновик описания use-case (английский, честный)

> Project: openradar (openradar.fun) — an open-source, non-commercial labour-market research pipeline. Code is AGPL-3.0; research outputs are aggregate statistics published under CC BY 4.0 with a public methodology.
>
> Role: developer and project owner.
>
> Intended use: read-only marketplace job search (`marketplaceJobPostingsSearch`) to maintain a fixed daily panel of new freelance job postings by category and skill, alongside other public job boards and RSS feeds. We publish only aggregate, anonymized statistics (daily counts, median budgets, category shares); we do not republish individual postings, client or freelancer identities, and we perform no mutations (no proposals, invites or messages). The application carries no Upwork name, logo or brand assets.
>
> Volume: a few hundred search requests per day with cursor pagination and caching — far below the 40,000 requests/day limit.
>
> Question on permitted use: we understand the API is offered for personal and internal use only. Our research output is public (open data). Please confirm whether publishing aggregate, anonymized statistics derived from the API is permitted under your terms; if it is not, we will keep API-derived data internal or withdraw this request. We would also like to know whether nominative reference to Upwork in research publications (e.g. "postings observed on Upwork") is acceptable.

Примечание: последний абзац честный и повышает риск отказа, но скрывать публичный характер использования нельзя — это нарушение условий и репутационный риск. Альтернатива: сначала спросить поддержку о допустимости публикации агрегатов, потом подавать.

## 6. Красные флаги лицензирования (системное противоречие)

Официальная статья: **«Upwork API is available for personal and internal use only. Commercial use isn't supported.»** Sandbox/test accounts не выдают.

- openradar публикует данные открыто (CC BY 4.0) и постит выводы в X — это публичное использование. Совместимость с «personal/internal only» **неизвестна**; требуется явное подтверждение Upwork (в заявке или через поддержку/письменный запрос).
- Скрейпинг HTML требует письменного разрешения по политике Upwork (https://rottenwifi.com/how-to-search-upwork-job-listings-with-the-official-api-without-unauthorized-scraping/) — значит, путь запроса разрешения существует; можно спросить и о research-партнёрстве (у Upwork есть собственная исследовательская программа).
- До получения ясности: **не обещать Upwork в публичных выводах и не строить на нём ряды.**

## 7. Вариант B: партнёр с подходящим аккаунтом

Статья допускает заявку от имени клиента (нужен email его аккаунта). Партнёр-фрилансер/агентство с ≥$25k и JSS ≥90% может подать заявку для своего «internal» использования.
Риски: ключ привязан к аккаунту партнёра; ответственность за нарушения — на нём; нужно доверие и письменная договорённость; ограничение personal/internal всё равно действует. Не решает вопрос публикации агрегатов.

## 8. После одобрения (справочно, не план реализации)

- OAuth2 Authorization Code Grant: authorize `https://www.upwork.com/ab/account-security/oauth2/authorize`, token `https://www.upwork.com/api/v3/oauth2/token`, refresh — до истечения access-токена.
- GraphQL: `https://api.upwork.com/graphql`, `Authorization: Bearer`, опционально `X-Upwork-API-TenantId`.
- 429 → `RetryAfter`, backoff; missing-scope → запросить недостающие scopes у владельца ключа.
- Секреты не логировать и не хранить в репозитории.
- Дальнейшие шаги (адаптер, панель, версия индекса) — только после Context Gate и проверки terms.

## 9. Дерево решений / фолбэки

1. Аккаунт соответствует → подать заявку (этот пакет) → ждать ~неделю.
2. Отказ или нет аккаунта → H5: пилот «письма → IMAP» (Freelancer Plus $19.99/мес, ≥1 proposal; см. research-run).
3. Параллельно H6: расширить intl-панель разрешёнными лентами (Guru, PeoplePerHour, Workana, Contra) — контент для X без Upwork.
4. H7 (отложено): пассивный захват участниками сети — серая зона ToS, риск бана.
5. Запросить у Upwork письменное разрешение/партнёрство на исследование с публикацией агрегатов.
6. Если всё закрыто: не называть Upwork; говорить «международные фриланс-биржи панели openradar».

## Источники

- https://support.upwork.com/hc/en-us/articles/115015857647-How-to-request-an-API-key-from-Upwork (вживую 2026-11-18)
- https://www.upwork.com/developer (вживую через поиск 2026-11-18)
- https://github.com/tryAGI/Upwork (README, вживую 2026-11-18)
- https://rottenwifi.com/how-to-search-upwork-job-listings-with-the-official-api-without-unauthorized-scraping/
- https://www.upwork.com/robots.txt (вживую 2026-11-18)
