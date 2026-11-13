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

## Импорт каталога борд groundtruth (план 018, 2026-11-13)

План: `plans/018-ats-catalog-import.md`.

**Источник данных**: [groundtruthtools/ats-jobs-mcp](https://github.com/groundtruthtools/ats-jobs-mcp), файл `directory.json` — **MIT License, Copyright (c) 2026 Ground Truth**. Снапшот 2026-08-24: 7 479 борд (4 168 Greenhouse + 3 311 Ashby), каждый «confirmed against the ATS public API on the date shown». Импортируем только факты (провайдер + slug + имя), код groundtruth не используется. Атрибуция: эта запись + `docs/SOURCES_ROBOTS.md` (отдельного NOTICE-файла в репозитории нет).

**Метод**: каждый кандидат повторно проверен живым последовательным чтением публичного API тем же эндпоинтом, что и адаптер (`scripts/verify-ats-boards.mjs`, задержка 1.2 с, полный body, Retry-After на 429, один повтор на сетевую ошибку). Колонка `jobs` снапшота — только приоритизация очереди, не живые данные. Slug нормализованы в нижний регистр (Ashby API регистронезависим — проверено на openai/OpenAI), дедуп против каталога регистронезависимый.

**Батч 1 (Ashby, топ-300 по снапшоту)**: live **295**, empty 2 (`jobs-page-4dc2685b-…` — мусорный slug, `confluent` — 0 вакансий), dead 3 (`mach`, `beaconsoftware`, `sana-roles` — HTTP 404), blocked 0, error 0. Live-rate 98.3% — порог стопа (50%) не достигнут. Каталог Ashby: 314 → **609** компаний. Имена: брендовая карта для известных компаний, иначе title-case slug; 5 борд оставлены с title-case (`applied`, `10xteam`, `barnes`, `cowboyspace`, `amplify`).

**robots перед импортом (2026-11-13)**: `boards-api.greenhouse.io/robots.txt` → 200, `Disallow: /embed/` (путь `/v1/boards/` разрешён); `api.ashbyhq.com/robots.txt` → 401 (файла нет, ограничений нет). Обходов не применялось.

**Следующие батчи**: оставшиеся ~2 400 Ashby-кандидатов и ~3 800 Greenhouse (у greenhouse в снапшоте нет живых счётчиков — проверять меньшими лимитами). Хелпер: `node scripts/verify-ats-boards.mjs --provider ashby --limit 300 --out .research/verify-ashby-batch2.json`. Артефакты проверки (`.research/`) в git не коммитятся.

## MIT-фиды Dreamwork и Jobbie (план 019, 2026-11-13)

План: `plans/019-mit-job-feeds.md`.

**Dreamwork** — [dreamworkhq](https://github.com/dreamworkhq), 13 репозиториев-фидов, все **MIT License, Copyright (c) 2026 Dreamwork (dreamworkhq.com)**, ветка `main`, файл `data/listings.json`, коммитятся ежедневно. Форма: `{generatedAt, source, list, count, listings[]}`, поля `id, title, company, companyDomain, location, remoteType, salaryMin/Max, salaryPeriod, aiRoleKind, postedAt, firstIndexedAt, url`.

- **Подключены (пилот 3)**: `dreamwork-remote-tech` (Remote-Tech-Jobs, 600), `dreamwork-ai-ml` (AI-ML-Jobs, 600), `dreamwork-senior-swe` (Senior-Software-Engineer-Jobs, 923). URL проверены живым GET 2026-11-13. Остальные 10 репо той же формы (Cybersecurity-Jobs, Data-Engineering-Jobs, Data-Science-Jobs, DevOps-SRE-Cloud-Jobs, Frontend-React-Jobs, New-Grad-Software-Engineer-Jobs, Open-Tech-Internships-2027, Python-Developer-Jobs, Tech-Internships-2027) — добавлять по мере надобности; фиды сильно пересекаются, дедуп (MinHash + externalId) справляется, но включать стоит 3–4 комплементарных.
- **Оговорка о ссылке (важно)**: все 600/600 `url` — трекинг-карточка `https://www.dreamworkhq.com/job/{id}?utm_…`, НЕ оригинал работодателя. Пресет хранит её как есть и честно говорит об этом в description; utm-параметры срезаются канонизатором при инжесте. Follow-up (отдельный план): резолвить оригинал через `companyDomain` → наш ATS-каталог.
- **Зарплаты**: `salaryPeriod: annual`, USD (306/600 строк Remote-Tech). Адаптер `json-board` расширен: per-row поле `salaryPeriod` (annual/hour → «per year»/«per hour») и прокидывание `currency` на лид. Годовые USD нормализуются делением на 12, никогда не «в месяц». Строки без зарплаты не получают выдуманной оплаты. Фикстура: `test/fixtures/dreamwork-listings.json` (5 строк из живого фида, включая не-US строку Mainsoft LTDA — валюта заявлена фидом как USD).

**Jobbie** — [jobbie-bot/Summer-2027-Tech-Internships](https://github.com/jobbie-bot/Summer-2027-Tech-Internships), **MIT License, Copyright (c) 2026 Jobbie**. Решение шага 3: у Jobbie есть **публичный машинный фид** `https://api.jobbie.bot/public/internships.json` (JSON, кэш 10 мин, ETag/If-None-Match, 30 req/min на IP, описательный UA — заявлено в README и `scripts/update_readme.py`). Markdown-парсер не нужен: подключён json-пресет `jobbie-internships`.

- Живой замер 2026-11-13: 379 строк, свежий `generated_at`, **у всех 379 есть `apply_url` — прямая ссылка на ATS работодателя** (greenhouse 140, ashby 46, workday ~120, lever 18, workable 30, smartrecruiters 3). Ссылка лида = `apply_url` (оригинал, этика «keep the original link»); `url` (карточка jobbie.bot) — только fallback, если apply_url пуст. Фид смешанный (tech + не-tech): пресет сужает tech-срез через `includeKeywords` (как README Jobbie).
- Зарплаты — строка вида `$20 – $30/hr` (145/379): новое поле `salary` json-адаптера хранит опубликованную строку дословно в `rawSalary` (почасовые ставки < $100 числовой парсер диапазонов отбрасывал бы), `currency: USD` на лиде. Нормализация: hourly USD 20–30, не monthly RUB.
- Фикстура: `test/fixtures/jobbie-internships.json` (6 строк: ashby/greenhouse/workday, hourly, fallback без apply_url). Тесты: `test/sources.test.ts` (оба фида, zero-network), `test/source-quality.test.ts` (период зарплаты).
- robots: `api.jobbie.bot/robots.txt` → 401 (файла нет); фид публично приглашает к чтению. `raw.githubusercontent.com` — статический хост, ограничений нет.

## Визовое обогащение: UK Register of Licensed Sponsors (план 021D, 2026-11-13)

План: `plans/021-competitive-parity.md` (саб-проект D). Это не источник лидов, а **обогащение**: вакансии, чей работодатель есть в публичном реестре лицензированных спонсоров Великобритании, получают заметку `metadata.visaSponsor`.

**Источник**: [Register of licensed sponsors: workers](https://www.gov.uk/government/publications/register-of-licensed-sponsors-workers) (Home Office, обновляется ежедневно). CSV-вложение на `assets.publishing.service.gov.uk`. Лицензия **Open Government Licence v3.0** — атрибуция в `docs/SOURCES_ROBOTS.md` и в UI-дисклеймере. Живой замер 2026-11-13: редакция 2026-11-12, **142 998 строк → 142 249 индексированных имён** (торговые имена «t/a» индексируются отдельно: Roofoods Ltd t/a Deliveroo находится и по «Deliveroo», и по «Roofoods»).

**Дисциплина чтения** (`src/research/visa-sponsors.ts`): кэш 12 ч (реестр ежедневный), backoff 1 ч при ошибке, потоковое чтение с лимитом 60 МБ (`readTextLimited`), sanity-floor 1000 имён (обрезанный/подменённый файл не становится индексом), заголовок CSV читается по именам колонок. robots проверен фактически: `www.gov.uk` для `*` запрещает только `/*/print$` и `/search/all*`; assets-хост — 404 (файла нет).

**Матчинг**: точный по `normalizeCompany` (легальные формы и пунктуация снимаются), без substring-удачи («Heaven Revolution CIC» ≠ Revolut). Работодатель берётся из `lead.company`, иначе из названия борда-владельца фида (`matched: 'board'`). Только вакансии, только последние 14 дней, только ещё не помеченные. **Отсутствие в реестре не порождает пометки** — негативных выводов нет. Заметка — факт о лицензии компании, не обещание спонсорства роли; дисклеймер в UI (ru/en) и ссылка на реестр.

**Проекция**: `toPublicLead` отдаёт `visaSponsor` только с валидными полями реестра; гостевая редакция (`redactLead`) сохраняет эту публичную заметку, остальной metadata по-прежнему скрыт. UI — строка «Визовое спонсорство / Visa sponsorship» на странице вакансии. Фоновый раунд в runner (флаг `RADAR_VISA_SPONSORS`, по умолчанию включён).

**Живая валидация**: `scripts/check-visa-sponsors.mjs` — 15/21 пробных работодателей сматчились (Monzo, Deliveroo/Roofoods, Revolut, Google UK, Amazon UK, Wise, Starling, Checkout, Spotify, Goldman Sachs, Jane Street, Anthropic, Cursor, ElevenLabs); OpenAI/Mistral/Cohere/Bolt в реестре под этими именами не нашлись — заметки нет, как и задумано. Тесты: `test/visa-sponsors.test.ts` (13, zero-network: парсинг CSV, t/a-варианты, кэш/backoff, матчинг, проекция, XSS-escape).

## ATS board-diff: ghost-jobs и soft-close (план 021B, 2026-11-13)

План: `plans/021-competitor-architecture.md` (саб-проект B). Это не источник, а **дисциплина свежести** для существующего ATS-адаптера (`src/sources/ats.ts`): борд сам сообщает, какие вакансии ещё открыты, и узел сверяет это с тем, что уже хранит.

**Идея (clean-room, доноры — только идеи)**: OpenPostings `pruneExpiredPostings` (soft-hide вместо удаления), groundtruth `job_changes` (posted/removed/reopened), Four-Leaf `active:false`. Код доноров не использовался (OpenPostings — без лицензии, groundtruth — MIT данные, Four-Leaf — MIT клиент).

**Механика**: снапшот борда — это **сам store** (лиды с `externalId` вида `ashby:acme:{id}`), отдельной истории нет → рост ограничен тривиально (STOP-условие плана выполнено), состояние переживает рестарт. При каждом полном чтении борда (`parsed.length < perCompany`, т.е. список не обрезан cap'ом) `diffBoard` сравнивает живой набор id с хранимым:
- вакансия исчезла с борда и была `active` → `state='closed'` + decision `{decidedBy:'source', reason:'removed from the board'}`. Лид **не удаляется**: дедуп-история (fingerprint/externalId) сохраняется, из публичной ленты исключается (оба стора фильтруют `state='active'`).
- вакансия вернулась и была `closed` **именно бордом** (`decidedBy==='source'`) → reopen (`state='active'`, decision снят). Решения модератора/модели никогда не отменяются.
- окно diff — `2×maxAgeDays` (шире ленты): вакансия, состарившаяся из потока, закрывается здесь, а не висит active.

**Гейты**: env `RADAR_ATS_GHOST_CHECK` (по умолчанию включён) + per-source `config.ghostCheck=false`. Обрезанный cap'ом борд не диффится (ложные «удаления»). Сетевая ошибка борда не трогает состояния (diff только после успешного чтения).

**Store**: новый опциональный метод `listBoardLeads({sourceId, externalIdPrefix, createdAfter, limit})` (memory + postgres, без миграции — читает существующие колонки). `PollContext` получил опциональные `store` и `ghostCheck` (прокидываются из `poll.ts`).

**Тесты**: `test/ats-ghost.test.ts` (6, zero-network): soft-close + сохранение для дедупа + reopen, защита moderator/model решений, возрастное окно и чужой борд, отказ diff при cap, env/per-source гейты, полный путь через `pollSource`.

## Public listing feed (план 021F, 2026-11-13)

План: `plans/021-competitor-architecture.md` (саб-проект F). Это не источник, а **publishing tool**: OpenRadar сам становится фидом, который ингестят другие (обратная сторона плана 019). Доноры — только идеи (Simplify age-based inactive thresholds, Jobbie/Dreamwork daily JSON+MD); код не использовался.

**Механика**: `scripts/publish-listing-feed.mjs` читает **публичный guest-API узла** (`/v2/feed`, курсорная пагинация) — сервер уже применяет `toPublicLead(projectContacts(...))`, поэтому контакты скрыты до того, как скрипт их увидит. Чистый модуль `src/publish/listing-feed.ts` (zero-network, тестируемый) строит JSON + Markdown: каждая строка ссылается на **оригинальный пост работодателя** (`canonicalUrl || url`, без tracking-редиректов), age-based stale-флаг (`maxAgeDays=30`) и hard-drop (`dropAfterDays=60`).

**STOP-условие (не публиковать guest-redacted контакты)** выполнено в два слоя: (1) источник — guest-проекция без контактов; (2) `hasContactLeak` дополнительно дропает строку с любым contact-полем, email/телефоном/личным TG-handle в title или URL. Личный handle (`t.me/user`) = контакт → дроп; пост канала (`t.me/channel/123`) = оригинальная ссылка → сохраняется (этика keep-the-original-link).

**Гейты**: workflow `.github/workflows/listing-feed.yml` — ежедневный cron, **opt-in**: запускается только если оператор задал repo variable `RADAR_FEED_URL` (узел с `RADAR_PUBLIC_READ=true`); без неё job skipped, ничего не публикуется случайно. Коммитит `docs/listing-feed/{listings.json,README.md}`.

**Живая валидация**: smoke против openradar.fun — 200 листингов (170 jobs, 30 gigs), 0 реальных утечек контактов, оригинальные хосты (himalayas, greenhouse, hh.ru, careers.hellofresh, …), TG-пост канала сохранён как ссылка. Тесты: `test/listing-feed.test.ts` (8, zero-network: оригинальные ссылки, STOP-дроп контактов, stale/drop по возрасту, типы/сортировка/cap, remote-детект, JSON+MD, контакт-vs-оригинал TG, полный guest-прогон через `createApp`).

## Идемпотентность дорогих вызовов (план 021E, 2026-11-13)

План: `plans/021-competitor-architecture.md` (саб-проект E). Донор — Firecrawl Alexandria (AGPL core ideas, clean-room): идемпотентность дорогих вызовов. Код не использовался; кредитного биллинга нет (хаб бесплатный).

**Source-quality уже существует**: операционное качество источника (`src/core/source-quality.ts`, `scoreSource`: access/flow/filter/alive/complete/trust, grade A–D, `getSourceQuality` в обоих сторах, admin-таблица) появилось в релизе 0.55.0 и **уже включает** обратную связь сообщества (часть `trust` из useful/junk/scam). Отдельный модуль не нужен — план 021E в этой части закрыт существующей системой. (Первая попытка сессии случайно перезаписала `test/source-quality.test.ts` и добавила дублирующий `src/hub/source-quality.ts`; это откачено, оригинальные тесты восстановлены из main.)

**Идемпотентность платного LLM-вызова** (`src/core/replay.ts` + `src/pipeline/decide.ts`) — новая, уникальная часть: `ReplayCache<T>` ключуется `sha256(actor + payload)`; повтор в окне (10 мин) возвращает кэш без вызова, **параллельный** повтор ждёт тот же in-flight promise (два раунда не платят дважды до сохранения ответа). Ошибки не кэшируются (следующий раунд retry). Кэш bounded (cap 5000, вытеснение старых). DI через `DecideDeps.replay` — runner шарит один кэш между раундами (`newDecisionReplay()`), без module-level утечки между runtime. `DecideSummary.replayed` считает replay'и. Store уже хранит durable-ответ (`listLeadsToDecide` исключает решённые) — кэш закрывает in-flight окно.

**Тесты**: `test/replay.test.ts` (6, zero-network): replay-окно/повтор, in-flight дедупликация, ошибки не кэшируются + bounded, ключ по actor+payload; общий кэш платит один раз на пересекающихся раундах, свежий кэш платит снова (нет утечки). Оригинальный `test/source-quality.test.ts` (14 тестов `scoreSource`) восстановлен без изменений.

## Объяснимый скоринг: checks + gates + verdict (план 021A, 2026-11-13)

План: `plans/021-competitor-architecture.md` (саб-проект A). Доноры — только идеи (SuperImpress именованные проверки, pathpipe essential-criteria gate, JobOps letter verdict); код не использовался.

**Механика** (`src/core/explain.ts`, чистая функция): числовая оценка 0–100 **не тронута** (downstream/UI зависят), объяснение аддитивно и вычисляется из того, что лид уже несёт (score, qualityFlags, state, оплата, навыки, направление, длина текста) — без LLM-вызова и без новой колонки store, работает для каждого лида.
- **gates** (бинарные, ДО вердикта): `live` (state==='active') и `real-offer` (нет channel_ad/mlm/digest/mystery_shopper). Провал любого гейта ⇒ вердикт всегда `skip`, независимо от баллов (pathpipe essential-criteria).
- **checks** (именованные, мягкие): score, pay, requirements, direction, detail — каждый `{name, pass, note}` с пояснением.
- **verdict**: `strong` (score≥70, гейты пройдены) / `stretch` (45–69) / `skip` (<45 или гейт провален).

**Проекция**: `toPublicLead` добавляет `checks`/`gates`/`verdict` (по прецеденту qualityFlags/visaSponsor). `publicLeadMetadata` теперь сохраняет и `qualityFlags` для гостей (публичные ярлыки, не контакты) — объяснение и видимые флаги согласованы; ранее гости флаги не видели. OpenAPI Lead-схема описывает три новых поля (тест `openapi.test.ts` требует описания каждого публичного поля). UI: страница лида показывает verdict-бейдж (ok/warn/bad) и именованные checks/gates с пояснением по наведению; i18n ru/en.

**MCP-проекция `get_lead_details` отложена** вместе с 021C (тот же файл `src/mcp/server.ts`, зона плана 011 другой сессии) — чтобы не конфликтовать.

**Тесты**: `test/explain.test.ts` (8, zero-network): strong для активного лида с оплатой/навыками, гейт никогда не strong (closed/hidden/mlm/digest/channel_ad/mystery_shopper), outstaff не гейт, полосы вердикта, checks при отсутствии оплаты/навыков/направления, clamp оценки, API-проекция (score цел, verdict аддитивен), UI-рендер verdict+checks.
