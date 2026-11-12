# Журнал решений по источникам · Source Indexing Log

Журнал проверок площадок вакансий и фриланс-заказов: какие источники подключены в каталог пресетов (`src/sources/presets.ts`), какие отклонены или сняты (`retired` / `blocked`) и по какой причине.

Политика сети (`docs/SOURCES_ROBOTS.md`): мы соблюдаем `robots.txt`, не обходим капчи, Cloudflare-блокировки, гео-блокировки и формы входа. Если источник закрыт от автоматического чтения — фиксируем статус здесь и не используем обходные лазейки.

---

## 1. Подключённые площадки (`indexed`)

| Площадка | Тип адаптера | Статус | Примечание |
| --- | --- | --- | --- |
| **FL.ru, Хабр Фриланс, Freelancehunt, Workspace** | `rss` | `indexed` | Официальные RSS-ленты заказов |
| **Kwork** | `kwork` | `indexed` | Официальная открытая витрина проектов |
| **hh.ru (HeadHunter)** | `hh` / `rss` | `indexed` | Публичное API `api.hh.ru` + RSS-пресеты и фиды работодателей |
| **Работа России (Trudvsem)** | `trudvsem` | `indexed` | Открытое государственное API `opendata.trudvsem.ru` |
| **Хабр Карьера, getmatch.ru** | `rss` / `json-board` | `indexed` | Вакансии IT и смежных направлений |
| **We Work Remotely, Jobicy, RemoteOK, Remotive, Arbeitnow** | `rss` / `remoteok` / `remotive` / `arbeitnow` | `indexed` | Международные удалённые вакансии (Arbeitnow и Himalayas — через `config.proxy` на узлах из РФ) |
| **Himalayas, Jobspresso, CryptoJobsList, CryptocurrencyJobs, RemoteWorker UK, Landing.jobs** | `rss` | `indexed` | Проверенные RSS-фиды (`https://cryptocurrencyjobs.co/index.xml` → `200 OK`, `application/xml`) |
| **Hacker News Who is hiring** | `hn` | `indexed` | Ежемесячный тред вакансий через официальное Algolia HN API |
| **ATS-доски компаний (Greenhouse, Ashby, Lever, Workable, Recruitee, SmartRecruiters, Pinpoint, BambooHR)** | `ats` / `json-board` | `indexed` | Публичные JSON-фиды карьерных страниц более 1 000 компаний |
| **Карьерные сайты компаний (Sitemap + JSON-LD JobPosting / HTML fallback)** | `sitemap` | `indexed` | Яндекс, Авито, VK, Т-Банк, Сбер, Ozon, Kaspersky, Фоксфорд, Ростелеком-Солар, ЦРПТ, Wise и др. |
| **Публичные Telegram-каналы** | `telegram` | `indexed` | Публичные веб-страницы `t.me/s/<channel>` |

---

## 2. Проверенные кандидаты: закрыты, заблокированы или сняты (`blocked` / `retired`)

Проверка выполнена как с RU-узла, так и из европейского дата-центра (`europe-west1`, 9 ноября 2026):

| Площадка / URL | Дата проверки | Ответ сервера | Статус | Причина и решение |
| --- | --- | --- | --- | --- |
| **Remote.co** (`https://remote.co/feed/`) | 2026-11-09 | `curl 000` (Connection timeout) из RU и EU GCP | `blocked` | Сервер не отдаёт RSS-фид дата-центровым подсетям (Cloudflare / firewall drop). По политике обход не применяем ([#58](https://github.com/MikhailSagalaev/openradar/issues/58)). |
| **EuropeRemotely** (`https://europeremotely.com/feed`) | 2026-11-09 | `HTTP/2 405`, `server: Parking/1.0` | `retired` | Домен припаркован (`Parking/1.0`), живой доски и RSS-фида больше нет ([#58](https://github.com/MikhailSagalaev/openradar/issues/58)). |
| **Golang Cafe** (`https://golang.cafe/rss`) | 2026-11-09 | `HTTP/2 429`, `server: Vercel` (`text/html`) | `blocked` | Vercel Security Checkpoint блокирует автоматические запросы к RSS из облачных сетей ([#58](https://github.com/MikhailSagalaev/openradar/issues/58)). |
| **JustJoin.it** (`https://justjoin.it/api/offers`) | 2026-11-09 | `HTTP/2 404` | `retired` | Неофициальный публичный JSON-эндпоинт v1 `/api/offers` отключён площадкой; новый фронтенд использует внутренние защищённые маршруты ([#54](https://github.com/MikhailSagalaev/openradar/issues/54)). |
| **Adzuna** (`api.adzuna.com`) | 2026-11-09 | Требует `app_id` / `app_key` | `api-key` | Адаптер `src/sources/adzuna.ts` готов; включается оператором узла при наличии собственных ключей `RADAR_ADZUNA_APP_ID` и `RADAR_ADZUNA_APP_KEY`. |

## Ревизия и расширение источников (v0.66.0 — 2026-11-10)

| Источник / Провайдер | Формат | Статус | Замер из ЦОД (EU) |
| --- | --- | --- | --- |
| `ats-personio` (`tado`, `clark`, `orderbird`, `personio-gmbh`, `tonies`) | XML (`.jobs.personio.de/xml?language=en`) | **indexed** | HTTP 200, чистый `<workzag-jobs>` XML без ключей и капчи |
| `ats-smartrecruiters` (+ `Wise`, `ServiceNow`, `Devoteam`, `Ubisoft2`, `Endava`, `Wix2`, `CDPROJEKTRED`, `Equinox`, `BoschGroup`) | JSON API | **indexed** | HTTP 200, суммарно 8 500+ активных вакансий |
| `ats-workable` (+ `skroutz`, `epignosis`) и `ats-bamboohr` (+ `posthog`, `reddwarf`) | JSON API | **indexed** | HTTP 200, открытые виджеты вакансий |
| `hh-selectel`, `hh-pt` (Positive Technologies), `hh-cian`, `hh-tensor`, `hh-diasoft` | RSS (`hh.ru`) | **indexed** | HTTP 200, по 20 свежих вакансий на каждого работодателя |
| `vuejobs` (`vuejobs.com/feed`) | RSS 2.0 | **indexed** | HTTP 200 (859 КБ), вакансии Vue.js / Nuxt / Frontend |
| `djangojobs` (`djangojobs.net/jobs/feed/`) | RSS 2.0 | **indexed** | HTTP 200 (101 КБ), вакансии Python / Django |
| `berlinstartupjobs` (`berlinstartupjobs.com/engineering/feed/`) | RSS 2.0 | **indexed** | HTTP 200 (17 КБ), инженерные вакансии стартапов ЕС |
| `hasjob` (`hasjob.co/feed`) | Atom | **indexed** | HTTP 200 (72 КБ), вакансии и заказы HasGeek |

## Расширение по подборке @selflovefeels — волна RSS (2026-11-13)

Живая проверка каждого фида перед добавлением (items > 0), robots.txt каждого сайта прочитан. План: `plans/020-cis-eu-rss.md`.

| Источник | Формат | Статус | Замер 2026-11-13 |
| --- | --- | --- | --- |
| `djinni` (djinni.co/jobs/rss/) | RSS 2.0 | **indexed** | HTTP 200, 56 items; robots: фид разрешён |
| `dou-jobs` (jobs.dou.ua/vacancies/feeds/) | RSS 2.0 | **indexed** | HTTP 200, 46 items; robots: фид разрешён |
| `hh-kz` (hh.kz/search/vacancy/rss) | RSS 2.0 | **indexed** | HTTP 200, 20 items; robots: `/rss/*` не покрывает поисковый RSS |
| `hh-ge` (headhunter.ge/search/vacancy/rss) | RSS 2.0 | **indexed** | HTTP 200, 20 items; robots прочитан через http→https (прямой https таймаутит из RU-сети) |
| `zarplata-ru` (zarplata.ru/search/vacancy/rss) | RSS 2.0 | **indexed** | HTTP 200, 20 items; robots прочитан на zarplata.ru без www |
| `jobindex-dk` (jobindex.dk/jobsoegning.rss) | RSS 2.0 | **indexed** | HTTP 200, 20 items; robots: фид разрешён |
| `jsjobbs` (jsjobbs.com/rss) | RSS 2.0 | **indexed** | HTTP 200, 100 items; robots: пустой Disallow |
| `virtual-vocations` (virtualvocations.com/rss) | RSS 2.0 | **indexed** | HTTP 200, 50 items; публичный RSS, часть описаний может быть сокращена (регистрация для полного доступа) |

SwissDevJobs добавляется планом 016 (чтобы не было дубля пресета).

## Расширение по подборке @selflovefeels — компании и карьерные сайты (2026-11-13)

План: `plans/016-source-expansion.md`. Каждая доска прочитана вживую перед добавлением (счётчик вакансий > 0). Полные данные пробинга — в рабочем каталоге `.research/` (не коммитится).

### ATS-компании (16 добавлено, 2026-11-13)

| Провайдер | Компании (slug, вакансий на момент проверки) |
| --- | --- |
| Greenhouse | gensyn (2), innovecs (7), lokalise (6), pandadoc (10), tamara (37), zscaler (375) |
| Ashby | buffer (2), checkly (2), cointracker (3), haus (5), nousresearch (15), productwind (3), snyk (38), wonderful (125) |
| Lever | brevo (27), contentsquare (28) |

### Карьерные сайты и фиды

| Источник | Формат | Статус | Замер 2026-11-13 |
| --- | --- | --- | --- |
| `career-abbott` (Workday sitemap) | sitemap + JSON-LD | **indexed** | 99 job-URL, страница вакансии отдаёт JSON-LD JobPosting; robots `Allow: /abbottcareers/` |
| `career-elevance` (Workday sitemap) | sitemap + JSON-LD | **indexed** | 278 job-URL; robots `Allow: /ANT/` |
| `swissdevjobs` | RSS 2.0 | **indexed** | 42 items |
| `ats-teamtailor` (tradingview) | JSON Feed + JobPosting | **indexed** | 29 items (2026-11-13); новый провайдер teamtailor заменил переходный RSS-пресет `tradingview-teamtailor` из плана 016, чтобы не задваивать доску |

### SmartRecruiters — конфликт robots (ждёт решения оператора)

`api.smartrecruiters.com/robots.txt` (2026-11-11 и 2026-11-13): `User-agent: LinkedInBot / Allow: /v1/companies/` + `User-agent: * / Disallow: /`. Существующие 9 компаний провайдера (Wise, ServiceNow и др.) продолжают отвечать 200 (Wise 441, ServiceNow 788 на 2026-11-11), но robots запрещает чтение всем, кроме LinkedInBot. Список заморожен; новые проверенные борды (alten 1242, experian 390, joom 2) НЕ добавлены. Решение — за оператором (см. docs/SOURCES_ROBOTS.md).

### Отклонённые и мёртвые адреса подборки (проверено 2026-11-11..13)

- **gun.io/feed/** — robots `Disallow: /feed/`; к тому же фид блог-маркетинговый, не вакансии. locked.
- **Устаревшие URL подборки (редиректы)**: Hasura → promptql.io/careers; Grammarly → superhuman.com/company/careers; SGNL → crowdstrike.com (продукт поглощён). Не пробовать слепо исходные адреса.
- **404/мертвы**: salmon.ph/careers, endel.io/careers, ecwid.com/careers, indriver.com/careers, veeam.com/careers, fermah.com/careers, insightglobal.com/careers, pipercompanies.com/careers, commandcode.com (DNS), gameinsight.com (DNS), mufg.jp/english/career (DNS из RU-сети).
- **403/бот-защита (не обходим)**: revolut.com, klarna.com (202), paypal.com, usa.visa.com, epam.com, griddynamics.com (202), transunion.com, centene.com, startup.jobs, wantapply.com.
- **200, но публичного ATS-сигнала нет (нужен отдельный разбор или браузерный сборщик)**: Bolt, Postman, Doist (todoist.com/careers), Automattic, eToro, DataRobot, Gero, Nexters, Acronis, CGI, MixRank, Wander, Function Health, Zammad, Siemens, Medtronic, Boston Scientific, Verizon (mycareer.verizon.com), Lockheed Martin, U.S. Bank (careers.usbank.com), Cox Enterprises, BELAY, Transcom, Sargent & Lundy (iCIMS — план 017), NBCUniversal, Stride (Workday strideinc/wd1/SK — кандидат на будущую волну), Elevance (добавлен), Abbott (добавлен).
- **Пустые/ложные борды**: SmartRecruiters-слаги большинства корпораций из подборки существуют, но totalFound=0 (PayPal, Visa, Siemens и др. читаются через Workday/собственные системы) — не добавлять.

## Новые провайдеры и Telegram из подборки (2026-11-13)

План: `plans/017-new-providers.md`.

| Источник | Формат | Статус | Замер 2026-11-13 |
| --- | --- | --- | --- |
| Провайдер `teamtailor` (ATS) | JSON Feed (`/jobs.json`) + `_jobposting` schema.org | **indexed** | TradingView: 29 items; фикстура `test/fixtures/ats-teamtailor.json`; тест в `test/sources/ats.test.ts` |
| `tg-ai-ml-bigdata` (@ai_machinelearning_big_data) | Telegram web | **indexed** | HTTP 200, 20 постов; канал Machinelearning (AI/ML/Big Data) |
| @it_jobsfeed | Telegram web | etired | HTTP 200, но 0 постов и страница «Contact @…» — канала фактически нет |
| iCIMS (careers-sargentlundy.icims.com) | HTML-листинг `/jobs/search?ss=1&in_iframe=1` | deferred | HTTP 200, 20 ссылок `/jobs/<id>/<slug>/job` — контракт рабочий, но нужен отдельный HTML-адаптер; отложен как непроверенный провайдер без подтверждённого спроса (одна компания из подборки) |

Переходный RSS-пресет `tradingview-teamtailor` (план 016) удалён в этом же коммите — доска читается провайдером `ats-teamtailor`.

## Firecrawl Alexandria — opt-in источник (2026-11-13)

План: `plans/015-alexandria-source.md`. Контракт подтверждён живым смоуком 2026-11-11 (blitzapi/jobs/search: total_results 33737, 2 записи, 4 кредита).

| Источник | Формат | Статус | Примечание |
| --- | --- | --- | --- |
| `alexandria-jobs` (api.firecrawl.dev/v2/scrape) | JSON API, Bearer | **indexed (opt-in)** | Выключен без `FIRECRAWL_API_KEY`; кредиты за запись (пустые ответы бесплатны); maxResults ≤ 100, интервал 1800 с; одна страница за опрос без cursor-пагинации; покрытие международное (RU-досок в каталоге Jobs нет) |
