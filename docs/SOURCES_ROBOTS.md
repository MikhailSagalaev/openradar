# Источники и robots.txt

Проверено 2026-11-04 командой `radar robots --markdown` с User-Agent `RadarBot/0.12.0 (+https://github.com/MikhailSagalaev/openradar)` (RFC 9309).

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
| Arbeitnow — Вакансии Германии и ЕС | arbeitnow | official | да | `https://www.arbeitnow.com/api/job-board-api` | разрешено |
| Hacker News — Who is hiring | hn | official | да | `https://hn.algolia.com/api/v1` | разрешено — robots.txt: HTTP 404 |
| Himalayas — Все вакансии | rss | official | да | `https://himalayas.app/jobs/rss` | разрешено (`Allow: /`) |
| Jobspresso — Отобранные вакансии | rss | official | да | `https://jobspresso.co/feed/` | разрешено |
| CryptoJobsList — Web3 вакансии | rss | official | да | `https://api.cryptojobslist.com/jobs.rss` | разрешено (`Allow: /`) |
| RemoteWorker UK — Все вакансии | rss | official | да | `https://remoteworker.co.uk/feeds/all.xml` | разрешено (`Allow: /`) |
| Карьерные страницы компаний — Greenhouse | ats | official | да | публичный API карьерных страниц компаний (Greenhouse) | не применяется |
| Карьерные страницы компаний — Ashby | ats | official | да | публичный API карьерных страниц компаний (Ashby) | не применяется |
| Карьерные страницы компаний — Lever | ats | official | да | публичный API карьерных страниц компаний (Lever) | не применяется |
| Telegram — Хабр Карьера | telegram | public | да | `https://t.me/s/habr_career` | разрешено — robots.txt: HTTP 404 |
| Telegram — Game Development Jobs | telegram | public | да | `https://t.me/s/devjobs` | разрешено — robots.txt: HTTP 404 |
| Telegram — Job for Frontend | telegram | public | да | `https://t.me/s/forfrontend` | разрешено — robots.txt: HTTP 404 |
| Telegram — СЕТИ — IT и Digital вакансии | telegram | public | да | `https://t.me/s/it_vakansii_jobs` | разрешено — robots.txt: HTTP 404 |
| Telegram — Data Science Jobs | telegram | public | да | `https://t.me/s/datasciencejobs` | разрешено — robots.txt: HTTP 404 |
| Telegram — Вакансии для продактов и проджектов | telegram | public | да | `https://t.me/s/product_jobs` | разрешено — robots.txt: HTTP 404 |
| Telegram — Gamedev Jobs (Inflow) | telegram | public | да | `https://t.me/s/gamedevjobs` | разрешено — robots.txt: HTTP 404 |
| Telegram — Marketing jobs | telegram | public | да | `https://t.me/s/marketing_jobs` | разрешено — robots.txt: HTTP 404 |
| Telegram — careerspace | telegram | public | да | `https://t.me/s/careerspace` | разрешено — robots.txt: HTTP 404 |
| Telegram — IT Job Hub (Proglib) | telegram | public | да | `https://t.me/s/proglib_jobs` | разрешено — robots.txt: HTTP 404 |
| Telegram — Job for Python | telegram | public | да | `https://t.me/s/forpython` | разрешено — robots.txt: HTTP 404 |
| Telegram — Job for Sysadmin и DevOps | telegram | public | да | `https://t.me/s/fordevops` | разрешено — robots.txt: HTTP 404 |
| Telegram — Job for Analysts и Data Scientists | telegram | public | да | `https://t.me/s/foranalysts` | разрешено — robots.txt: HTTP 404 |
| Telegram — Job for C#, .NET | telegram | public | да | `https://t.me/s/forcsharp` | разрешено — robots.txt: HTTP 404 |
| Telegram — Job for Gamedev | telegram | public | да | `https://t.me/s/forgamedev` | разрешено — robots.txt: HTTP 404 |
| Telegram — Job for C, C++ | telegram | public | да | `https://t.me/s/forcpp` | разрешено — robots.txt: HTTP 404 |
| Telegram — Job for HR (IT и Digital) | telegram | public | да | `https://t.me/s/forhr` | разрешено — robots.txt: HTTP 404 |
| Telegram — Job for Junior | telegram | public | да | `https://t.me/s/jobforjunior` | разрешено — robots.txt: HTTP 404 |
| Telegram — Remocate: релокация и удалёнка | telegram | public | да | `https://t.me/s/remocate` | разрешено — robots.txt: HTTP 404 |
| Telegram — Design Hunters | telegram | public | да | `https://t.me/s/designhunters` | разрешено — robots.txt: HTTP 404 |
| Telegram — Вакансии айти IT | telegram | public | да | `https://t.me/s/vakansii_it` | разрешено — robots.txt: HTTP 404 |
| getmatch — IT-вакансии | sitemap | public | да | `https://getmatch.ru/sitemap.xml` | разрешено |
| Telegram — папка openradar | telegram-account | user-provided | да | Telegram-аккаунт (MTProto): не HTTP, robots.txt не применяется | не применяется |
| Workspace — Вакансии IT и Digital | rss | official | да | `https://workspace.ru/vacancies/rss/` | разрешено |
| Freelancer.com — Все проекты и заказы | rss | official | да | `https://www.freelancer.com/rss/all.xml` | разрешено |
| NoDesk — Remote IT Jobs | rss | official | да | `https://nodesk.co/remote-jobs/index.xml` | разрешено (`Allow: /`) |
| Хабр Карьера — Frontend разработка | rss | official | да | `https://career.habr.com/vacancies/rss?s[]=2` | разрешено |
| Хабр Карьера — Backend разработка | rss | official | да | `https://career.habr.com/vacancies/rss?s[]=3` | разрешено |
| Хабр Карьера — Mobile (iOS, Android, Flutter) | rss | official | да | `https://career.habr.com/vacancies/rss?s[]=4` | разрешено |
| Хабр Карьера — DevOps и инфраструктура | rss | official | да | `https://career.habr.com/vacancies/rss?s[]=5` | разрешено |
| Хабр Карьера — QA и тестирование | rss | official | да | `https://career.habr.com/vacancies/rss?s[]=6` | разрешено |
| Хабр Карьера — Дизайн и UX/UI | rss | official | да | `https://career.habr.com/vacancies/rss?s[]=7` | разрешено |
| Хабр Карьера — Product и Project Management | rss | official | да | `https://career.habr.com/vacancies/rss?s[]=8` | разрешено |
| Хабр Карьера — Data Science, AI и ML | rss | official | да | `https://career.habr.com/vacancies/rss?s[]=82` | разрешено |
| HeadHunter — Mobile (iOS, Android, Flutter) | rss | official | да | `https://hh.ru/search/vacancy/rss?text=iOS+OR+Android+OR+Flutter&order_by=publication_time` | **запрещено** (`Disallow: *?*`) |
| HeadHunter — QA и автотестирование | rss | official | да | `https://hh.ru/search/vacancy/rss?text=QA+OR+%D1%82%D0%B5%D1%81%D1%82%D0%B8%D1%80%D0%BE%D0%B2%D1%89%D0%B8%D0%BA&order_by=publication_time` | **запрещено** (`Disallow: *?*`) |
| HeadHunter — DevOps, SRE и K8s | rss | official | да | `https://hh.ru/search/vacancy/rss?text=DevOps+OR+SRE+OR+Kubernetes&order_by=publication_time` | **запрещено** (`Disallow: *?*`) |
| HeadHunter — Data Science, ML и AI | rss | official | да | `https://hh.ru/search/vacancy/rss?text=Data+Science+OR+Machine+Learning+OR+Python&order_by=publication_time` | **запрещено** (`Disallow: *?*`) |
| HeadHunter — Дизайн, UI/UX и графика | rss | official | да | `https://hh.ru/search/vacancy/rss?text=%D0%B4%D0%B8%D0%B7%D0%B0%D0%B9%D0%BD%D0%B5%D1%80&order_by=publication_time` | **запрещено** (`Disallow: *?*`) |
| GeekJob — IT-вакансии | rss | official | да | `https://geekjob.ru/vacancies/rss` | разрешено (`Allow: /`) |
| Landing.jobs — Вакансии Европы | rss | official | да | `https://landing.jobs/feed` | разрешено |
| Python.org — Python Job Board | rss | official | да | `https://www.python.org/jobs/feed/rss/` | разрешено |
| Golang Projects — Go-вакансии | rss | official | да | `https://www.golangprojects.com/rss.xml` | разрешено |
| LaraJobs — Laravel и PHP | rss | official | да | `https://larajobs.com/feed` | разрешено |
| Ruby on Rails Jobs | rss | official | да | `https://jobs.rubyonrails.org/jobs.rss` | разрешено |
| Elixir Jobs | rss | official | да | `https://elixirjobs.net/rss` | разрешено |
| Hacker News — Вакансии стартапов YC | rss | official | да | `https://hnrss.org/jobs` | разрешено |
| Dribbble — Вакансии дизайнеров | rss | official | да | `https://dribbble.com/jobs.rss` | разрешено |
| Cryptocurrency Jobs — Web3 вакансии | rss | official | да | `https://cryptocurrencyjobs.co/index.xml` | разрешено (`Allow: /`) |
| Real Work From Anywhere — Удалённо из любой страны | rss | official | да | `https://www.realworkfromanywhere.com/rss.xml` | разрешено (`Allow: /`) |
| Working Nomads — Удалённые вакансии | workingnomads | official | да | `https://www.workingnomads.com/api/exposed_jobs/` | разрешено |
| Карьерные страницы компаний — Workable | ats | official | да | публичный API карьерных страниц компаний (Workable) | не применяется |
| Карьерные страницы компаний — Recruitee | ats | official | да | публичный API карьерных страниц компаний (Recruitee) | не применяется |
| Telegram — Remote Jobs RU | telegram | public | да | `https://t.me/s/remote_jobs_ru` | разрешено — robots.txt: HTTP 404 |
| Telegram — Freelance Таверна | telegram | public | да | `https://t.me/s/freelancetaverna` | разрешено — robots.txt: HTTP 404 |
| Telegram — WorkASAP: удалённая работа | telegram | public | да | `https://t.me/s/workasap` | разрешено — robots.txt: HTTP 404 |

## Решения

- **FL.ru — Все заказы** — robots.txt запрещает `Disallow: */rss/*`. Решение: _ждёт решения оператора_.
- **Работа России — Удалённая работа** — robots.txt запрещает `Disallow: /`. Решение: _ждёт решения оператора_.
- **HeadHunter — IT-вакансии** — robots.txt запрещает `Disallow: *?*`. Решение: _ждёт решения оператора_.
- **HeadHunter — Удалённая проектная работа** — robots.txt запрещает `Disallow: *?*`. Решение: _ждёт решения оператора_.
- **HeadHunter — Mobile (iOS, Android, Flutter)** — robots.txt запрещает `Disallow: *?*`. Решение: _ждёт решения оператора_.
- **HeadHunter — QA и автотестирование** — robots.txt запрещает `Disallow: *?*`. Решение: _ждёт решения оператора_.
- **HeadHunter — DevOps, SRE и K8s** — robots.txt запрещает `Disallow: *?*`. Решение: _ждёт решения оператора_.
- **HeadHunter — Data Science, ML и AI** — robots.txt запрещает `Disallow: *?*`. Решение: _ждёт решения оператора_.
- **HeadHunter — Дизайн, UI/UX и графика** — robots.txt запрещает `Disallow: *?*`. Решение: _ждёт решения оператора_.

