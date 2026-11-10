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
