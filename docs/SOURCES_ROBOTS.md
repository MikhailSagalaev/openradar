# Источники и robots.txt

Проверено 2026-10-31 командой `radar robots --markdown` с User-Agent `RadarBot/0.12.0 (+https://github.com/MikhailSagalaev/openradar)` (RFC 9309).

Правило: защиту сайтов не обходим. Если robots.txt запрещает адрес, который опрашивает источник,
источник откладывают или переводят на разрешённый адрес (официальный API, RSS). Решение по каждому
такому источнику записывается ниже.

| Источник | Тип | Доступ | Включён | Адрес | robots.txt |
| --- | --- | --- | --- | --- | --- |
| FL.ru — Все заказы | rss | official | да | `https://www.fl.ru/rss/all.xml` | **запрещено** (`Disallow: */rss/*`) |
| Kwork — Все заказы | kwork | public | да | `https://kwork.ru/projects` | разрешено |
| Хабр Карьера — Вакансии и заказы | rss | official | да | `https://career.habr.com/vacancies/rss` | разрешено |
| We Work Remotely — Все вакансии | rss | official | да | `https://weworkremotely.com/remote-jobs.rss` | разрешено (`Allow: /`) |
| Работа России — Удалённая работа | trudvsem | official | да | `https://opendata.trudvsem.ru/api/v1/vacancies` | **запрещено** (`Disallow: /`) |
| HeadHunter — IT-вакансии | rss | official | да | `https://hh.ru/search/vacancy/rss?text=%D1%80%D0%B0%D0%B7%D1%80%D0%B0%D0%B1%D0%BE%D1%82%D1%87%D0%B8%D0%BA&professional_role=96&order_by=publication_time` | **запрещено** (`Disallow: *?*`) |
| RemoteOK — Все вакансии | remoteok | official | да | `https://remoteok.com/api` | разрешено (`Allow: /`) |
| Ручное добавление | webhook | user-provided | да | входящий вебхук: данные присылают нам | не применяется |
| Freelancehunt — Все проекты | rss | official | да | `https://freelancehunt.com/projects.rss` | разрешено |
| Jobicy — Все вакансии | rss | official | да | `https://jobicy.com/feed/job_feed` | разрешено |
| Сеть участников | webhook | user-provided | да | входящий вебхук: данные присылают нам | не применяется |
| HeadHunter — Удалённая проектная работа | rss | official | да | `https://hh.ru/search/vacancy/rss?schedule=remote&employment=project&order_by=publication_time` | **запрещено** (`Disallow: *?*`) |
| Arbeitnow — Вакансии Германии и ЕС | arbeitnow | official | да | `https://www.arbeitnow.com/api/job-board-api` | разрешено — robots.txt: HTTP 403 |
| Hacker News — Who is hiring | hn | official | да | `https://hn.algolia.com/api/v1` | разрешено — robots.txt: HTTP 404 |
| Himalayas — Все вакансии | rss | official | да | `https://himalayas.app/jobs/rss` | не удалось проверить — The operation was aborted due to timeout |
| Jobspresso — Отобранные вакансии | rss | official | да | `https://jobspresso.co/feed/` | разрешено |
| CryptoJobsList — Web3 вакансии | rss | official | да | `https://api.cryptojobslist.com/jobs.rss` | разрешено (`Allow: /`) |
| RemoteWorker UK — Все вакансии | rss | official | да | `https://remoteworker.co.uk/feeds/all.xml` | разрешено (`Allow: /`) |
| Карьерные страницы компаний — Greenhouse | ats | official | да | публичные API карьерных страниц компаний (Greenhouse, Ashby, Lever) | не применяется |
| Карьерные страницы компаний — Ashby | ats | official | да | публичные API карьерных страниц компаний (Greenhouse, Ashby, Lever) | не применяется |
| Карьерные страницы компаний — Lever | ats | official | да | публичные API карьерных страниц компаний (Greenhouse, Ashby, Lever) | не применяется |
| Telegram — Хабр Карьера | telegram | public | да | `https://t.me/s/habr_career` | не удалось проверить — fetch failed |
| Telegram — Game Development Jobs | telegram | public | да | `https://t.me/s/devjobs` | не удалось проверить — fetch failed |
| Telegram — Job for Frontend | telegram | public | да | `https://t.me/s/forfrontend` | не удалось проверить — fetch failed |
| Telegram — СЕТИ — IT и Digital вакансии | telegram | public | да | `https://t.me/s/it_vakansii_jobs` | не удалось проверить — fetch failed |
| Telegram — Data Science Jobs | telegram | public | да | `https://t.me/s/datasciencejobs` | не удалось проверить — fetch failed |
| Telegram — Вакансии для продактов и проджектов | telegram | public | да | `https://t.me/s/product_jobs` | не удалось проверить — fetch failed |
| Telegram — Gamedev Jobs (Inflow) | telegram | public | да | `https://t.me/s/gamedevjobs` | не удалось проверить — fetch failed |
| Telegram — Marketing jobs | telegram | public | да | `https://t.me/s/marketing_jobs` | не удалось проверить — fetch failed |
| Telegram — careerspace | telegram | public | да | `https://t.me/s/careerspace` | не удалось проверить — fetch failed |
| Telegram — IT Job Hub (Proglib) | telegram | public | да | `https://t.me/s/proglib_jobs` | не удалось проверить — fetch failed |
| Telegram — Job for Python | telegram | public | да | `https://t.me/s/forpython` | не удалось проверить — fetch failed |
| Telegram — Job for Sysadmin и DevOps | telegram | public | да | `https://t.me/s/fordevops` | не удалось проверить — fetch failed |
| Telegram — Job for Analysts и Data Scientists | telegram | public | да | `https://t.me/s/foranalysts` | не удалось проверить — fetch failed |
| Telegram — Job for C#, .NET | telegram | public | да | `https://t.me/s/forcsharp` | не удалось проверить — fetch failed |
| Telegram — Job for Gamedev | telegram | public | да | `https://t.me/s/forgamedev` | не удалось проверить — fetch failed |
| Telegram — Job for C, C++ | telegram | public | да | `https://t.me/s/forcpp` | не удалось проверить — fetch failed |
| Telegram — Job for HR (IT и Digital) | telegram | public | да | `https://t.me/s/forhr` | не удалось проверить — fetch failed |
| Telegram — Job for Junior | telegram | public | да | `https://t.me/s/jobforjunior` | не удалось проверить — fetch failed |
| Telegram — Remocate: релокация и удалёнка | telegram | public | да | `https://t.me/s/remocate` | не удалось проверить — fetch failed |
| Telegram — Design Hunters | telegram | public | да | `https://t.me/s/designhunters` | не удалось проверить — fetch failed |
| Telegram — Вакансии айти IT | telegram | public | да | `https://t.me/s/vakansii_it` | не удалось проверить — fetch failed |
| getmatch — IT-вакансии | sitemap | public | да | `https://getmatch.ru/sitemap.xml` | разрешено |
| Telegram — папка openradar | telegram-account | user-provided | да | Telegram-аккаунт (MTProto): не HTTP, robots.txt не применяется | не применяется |

## Решения

- **FL.ru — Все заказы** — robots.txt запрещает `Disallow: */rss/*`. Решение: _ждёт решения оператора_.
- **Работа России — Удалённая работа** — robots.txt запрещает `Disallow: /`. Решение: _ждёт решения оператора_.
- **HeadHunter — IT-вакансии** — robots.txt запрещает `Disallow: *?*`. Решение: _ждёт решения оператора_.
- **HeadHunter — Удалённая проектная работа** — robots.txt запрещает `Disallow: *?*`. Решение: _ждёт решения оператора_.

