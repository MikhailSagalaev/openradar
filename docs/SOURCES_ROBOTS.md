# Источники и robots.txt

Проверено 2026-11-04 командой `radar robots --markdown` с User-Agent `RadarBot/0.12.0 (+https://github.com/MikhailSagalaev/openradar)` (RFC 9309).

Правило: защиту сайтов не обходим. Если robots.txt запрещает адрес, который опрашивает источник,
источник откладывают или переводят на разрешённый адрес (официальный API, RSS). Решение по каждому
такому источнику записывается ниже.

| Источник | Тип | Доступ | Включён | Адрес | robots.txt |
| --- | --- | --- | --- | --- | --- |
| FL.ru — Все заказы | rss | official | да | `https://www.fl.ru/rss/all.xml` | **запрещено** (`Disallow: */rss/*`) |
| Хабр Карьера — Вакансии и заказы | rss | official | да | `https://career.habr.com/vacancies/rss` | разрешено |
| Kwork — Все заказы | kwork | public | да | `https://kwork.ru/projects` | разрешено |
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
| Карьерные страницы компаний — Ashby | ats | official | да | публичный API карьерных страниц компаний (Ashby) | не применяется |
| Карьерные страницы компаний — Greenhouse | ats | official | да | публичный API карьерных страниц компаний (Greenhouse) | не применяется |
| Dreamwork — MIT-фиды вакансий (GitHub raw) | json | public | opt-in | `https://raw.githubusercontent.com/dreamworkhq/<Repo>/main/data/listings.json` | разрешено — статический хост файлов, robots не ограничивает |
| Jobbie — US Tech Internships | json | public | opt-in | `https://api.jobbie.bot/public/internships.json` | robots.txt: HTTP 401 (нет файла); фид публично приглашает к чтению (ETag, 30 req/min, описательный UA) |
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
| HeadHunter — Продакт-менеджеры | rss | official | да | `https://hh.ru/search/vacancy/rss?professional_role=73&order_by=publication_time` | **запрещено** (`Disallow: *?*`) |
| HeadHunter — Проджект-менеджеры | rss | official | да | `https://hh.ru/search/vacancy/rss?professional_role=107&order_by=publication_time` | **запрещено** (`Disallow: *?*`) |
| HeadHunter — Аналитики | rss | official | да | `https://hh.ru/search/vacancy/rss?professional_role=10&professional_role=148&professional_role=150&professional_role=156&professional_role=164&order_by=publication_time` | **запрещено** (`Disallow: *?*`) |
| HeadHunter — Дизайнеры | rss | official | да | `https://hh.ru/search/vacancy/rss?professional_role=34&professional_role=25&professional_role=12&order_by=publication_time` | **запрещено** (`Disallow: *?*`) |
| HeadHunter — Тестировщики (QA) | rss | official | да | `https://hh.ru/search/vacancy/rss?professional_role=124&order_by=publication_time` | **запрещено** (`Disallow: *?*`) |
| HeadHunter — DevOps и администрирование | rss | official | да | `https://hh.ru/search/vacancy/rss?professional_role=160&professional_role=113&professional_role=112&professional_role=114&order_by=publication_time` | **запрещено** (`Disallow: *?*`) |
| HeadHunter — Маркетинг и реклама | rss | official | да | `https://hh.ru/search/vacancy/rss?professional_role=68&professional_role=3&professional_role=163&professional_role=170&professional_role=182&order_by=publication_time` | **запрещено** (`Disallow: *?*`) |
| HeadHunter — Техподдержка | rss | official | да | `https://hh.ru/search/vacancy/rss?professional_role=121&order_by=publication_time` | **запрещено** (`Disallow: *?*`) |
| HeadHunter — Продажи | rss | official | да | `https://hh.ru/search/vacancy/rss?professional_role=70&professional_role=106&professional_role=54&order_by=publication_time` | **запрещено** (`Disallow: *?*`) |
| HeadHunter — Информационная безопасность | rss | official | да | `https://hh.ru/search/vacancy/rss?professional_role=116&professional_role=120&order_by=publication_time` | **запрещено** (`Disallow: *?*`) |
| HeadHunter — 1С | rss | official | да | `https://hh.ru/search/vacancy/rss?text=1%D0%A1&order_by=publication_time` | **запрещено** (`Disallow: *?*`) |
| Pawetta — Digital-вакансии | rss | official | да | `https://pawetta.ru/feed/` | **запрещено** (`Disallow: */feed`) |
| Telegram — @forproducts: вакансии продукта | telegram | public | да | `https://t.me/s/forproducts` | разрешено — robots.txt: HTTP 404 |
| Telegram — @hireproproduct: продукт | telegram | public | да | `https://t.me/s/hireproproduct` | разрешено — robots.txt: HTTP 404 |
| Telegram — @product_design_jobs: продуктовый дизайн | telegram | public | да | `https://t.me/s/product_design_jobs` | разрешено — robots.txt: HTTP 404 |
| Telegram — @motion_design_jobs: motion-дизайн | telegram | public | да | `https://t.me/s/motion_design_jobs` | разрешено — robots.txt: HTTP 404 |
| Telegram — @juno_jobs: джуны и стажировки | telegram | public | да | `https://t.me/s/juno_jobs` | разрешено — robots.txt: HTTP 404 |
| Telegram — @jobs_juniors_remote: удалёнка для джунов | telegram | public | да | `https://t.me/s/jobs_juniors_remote` | разрешено — robots.txt: HTTP 404 |
| Telegram — @job4analyst_junior: аналитики без опыта | telegram | public | да | `https://t.me/s/job4analyst_junior` | разрешено — robots.txt: HTTP 404 |
| Telegram — @stagirovky: стажировки | telegram | public | да | `https://t.me/s/stagirovky` | разрешено — robots.txt: HTTP 404 |
| Telegram — @startup_job_russia: стартапы | telegram | public | да | `https://t.me/s/startup_job_russia` | разрешено — robots.txt: HTTP 404 |
| Telegram — @vacancysmm: SMM и маркетинг | telegram | public | да | `https://t.me/s/vacancysmm` | разрешено — robots.txt: HTTP 404 |
| Telegram — @ai_machinelearning_big_data: AI/ML и Big Data | telegram | public | да | `https://t.me/s/ai_machinelearning_big_data` | разрешено — robots.txt: HTTP 404 (проверено 2026-11-13: 20 постов) |
| Djinni — IT-вакансии Украины | rss | official | да | `https://djinni.co/jobs/rss/` | разрешено (проверено 2026-11-13: запрещены `/jobs2`, `/q`, `/developers`, `/free-jobs`, `/set_lang` — фид не покрыт) |
| DOU Jobs — IT-вакансии Украины | rss | official | да | `https://jobs.dou.ua/vacancies/feeds/` | разрешено (проверено 2026-11-13: запрещён `/vacancies/*search=*` — фид без query не покрыт) |
| HeadHunter Казахстан — Все вакансии | rss | official | да | `https://hh.kz/search/vacancy/rss` | разрешено (проверено 2026-11-13: `Disallow: /rss/*` не покрывает `/search/vacancy/rss`; правила `*?*` нет — в отличие от hh.ru) |
| HeadHunter Грузия — Все вакансии | rss | official | да | `https://headhunter.ge/search/vacancy/rss` | разрешено (проверено 2026-11-13: тот же движок, `Disallow: /rss/*` не покрывает поисковый RSS) |
| Zarplata.ru — Вакансии России | rss | official | да | `https://www.zarplata.ru/search/vacancy/rss` | разрешено (проверено 2026-11-13 на zarplata.ru: `Disallow: /rss/*`, `/*?page=` — фид без query не покрыт) |
| Jobindex — Вакансии Дании | rss | official | да | `https://www.jobindex.dk/jobsoegning.rss` | разрешено (проверено 2026-11-13: запрещены конкретные `/jobsoegning*q=ofir`-адреса — чистый `.rss` не покрыт) |
| JSJobbs — JavaScript-вакансии | rss | official | да | `https://jsjobbs.com/rss` | разрешено (проверено 2026-11-13: пустой `Disallow:`) |
| Virtual Vocations — Удалённые вакансии США | rss | official | да | `https://www.virtualvocations.com/rss` | разрешено (проверено 2026-11-13: запрещены `/jobs/*/c-*` и `/advanced_search/index/` — фид не покрыт) |
| SwissDevJobs — IT-вакансии Швейцарии | rss | official | да | `https://swissdevjobs.ch/rss` | разрешено (проверено 2026-11-13: запрещены `/*.txt$`, `/wp-content/`, служебные пути — `/rss` не покрыт) |
| TradingView — Вакансии (Teamtailor) | ats | official | да | `https://tradingview.teamtailor.com/jobs.json` | разрешено (проверено 2026-11-13: запрещены `/app/`, `/messages/`, `/messenger/`, `/jobs/internal/`; `Content-Signal: search=yes`; переходный RSS-пресет заменён провайдером ats-teamtailor) |
| Abbott — Вакансии (Workday) | sitemap | public | да | `https://abbott.wd5.myworkdayjobs.com/abbottcareers/siteMap.xml` | разрешено (проверено 2026-11-13: `Allow: /abbottcareers/`, sitemap объявлен в robots) |
| Elevance Health — Вакансии (Workday) | sitemap | public | да | `https://elevancehealth.wd1.myworkdayjobs.com/ANT/siteMap.xml` | разрешено (проверено 2026-11-13: `Allow: /ANT/`, sitemap объявлен в robots) |
| ATS — SmartRecruiters API (существующие 9 компаний) | ats | official | да | `https://api.smartrecruiters.com/v1/companies/{slug}/postings` | **запрещено для RadarBot** (проверено 2026-11-13: `User-agent: LinkedInBot / Allow: /v1/companies/`, `User-agent: * / Disallow: /`) |

## Решения

- **ATS — SmartRecruiters (9 компаний, включая Wise и ServiceNow)** — robots.txt разрешает API только LinkedInBot (`User-agent: * / Disallow: /`, подтверждено 2026-11-11 и 2026-11-13). Решение: _ждёт решения оператора_ (варианты: отключить провайдер; читать публичные HTML-страницы jobs.smartrecruiters.com, если их robots позволит — проверить отдельно; запросить разрешение у SmartRecruiters). Новые компании (Alten 1242, Experian 390, Joom 2 — борды проверены, ответы 200) НЕ добавлять до решения.

- **hh-семейство (hh.kz, headhunter.ge, zarplata.ru), добавлено 2026-11-13** — robots запрещает `/rss/*`, но поисковый RSS `/search/vacancy/rss` этим правилом НЕ покрыт (RFC 9309: префиксное совпадение пути), а запрета `*?*` (как на hh.ru) у этих сайтов нет. Вердикт: разрешено. Не «чинить» в запрет без свежего robots.txt.

- **Происхождение каталога ATS-борд (импорт 2026-11-13)** — список компаний Ashby расширен данными `directory.json` проекта [groundtruthtools/ats-jobs-mcp](https://github.com/groundtruthtools/ats-jobs-mcp) (MIT, Copyright 2026 Ground Truth; снапшот 2026-08-24, 7 479 борд). Импортируются только факты «провайдер + slug», не код. Каждый импортированный борд повторно проверен живым чтением того же публичного API (`scripts/verify-ats-boards.mjs`): батч 1 — 295 live из 300. robots API-хостов перепроверен перед импортом: `boards-api.greenhouse.io` — `Disallow: /embed/` (наш путь `/v1/boards/` разрешён); `api.ashbyhq.com/robots.txt` — HTTP 401 (файла нет, ограничений нет). Колонка jobs снапшота использовалась только для приоритизации проверки, не как живые данные.

- **FL.ru — Все заказы** — robots.txt запрещает `Disallow: */rss/*`. Решение: _ждёт решения оператора_.
- **Работа России — Удалённая работа** — robots.txt запрещает `Disallow: /`. Решение: _ждёт решения оператора_.
- **HeadHunter — IT-вакансии** — robots.txt запрещает `Disallow: *?*`. Решение: _ждёт решения оператора_.
- **HeadHunter — Удалённая проектная работа** — robots.txt запрещает `Disallow: *?*`. Решение: _ждёт решения оператора_.
- **HeadHunter — Mobile (iOS, Android, Flutter)** — robots.txt запрещает `Disallow: *?*`. Решение: _ждёт решения оператора_.
- **HeadHunter — QA и автотестирование** — robots.txt запрещает `Disallow: *?*`. Решение: _ждёт решения оператора_.
- **HeadHunter — DevOps, SRE и K8s** — robots.txt запрещает `Disallow: *?*`. Решение: _ждёт решения оператора_.
- **HeadHunter — Data Science, ML и AI** — robots.txt запрещает `Disallow: *?*`. Решение: _ждёт решения оператора_.
- **HeadHunter — Дизайн, UI/UX и графика** — robots.txt запрещает `Disallow: *?*`. Решение: _ждёт решения оператора_.
- **HeadHunter — Продакт-менеджеры** — robots.txt запрещает `Disallow: *?*`. Решение: _ждёт решения оператора_.
- **HeadHunter — Проджект-менеджеры** — robots.txt запрещает `Disallow: *?*`. Решение: _ждёт решения оператора_.
- **HeadHunter — Аналитики** — robots.txt запрещает `Disallow: *?*`. Решение: _ждёт решения оператора_.
- **HeadHunter — Дизайнеры** — robots.txt запрещает `Disallow: *?*`. Решение: _ждёт решения оператора_.
- **HeadHunter — Тестировщики (QA)** — robots.txt запрещает `Disallow: *?*`. Решение: _ждёт решения оператора_.
- **HeadHunter — DevOps и администрирование** — robots.txt запрещает `Disallow: *?*`. Решение: _ждёт решения оператора_.
- **HeadHunter — Маркетинг и реклама** — robots.txt запрещает `Disallow: *?*`. Решение: _ждёт решения оператора_.
- **HeadHunter — Техподдержка** — robots.txt запрещает `Disallow: *?*`. Решение: _ждёт решения оператора_.
- **HeadHunter — Продажи** — robots.txt запрещает `Disallow: *?*`. Решение: _ждёт решения оператора_.
- **HeadHunter — Информационная безопасность** — robots.txt запрещает `Disallow: *?*`. Решение: _ждёт решения оператора_.
- **HeadHunter — 1С** — robots.txt запрещает `Disallow: *?*`. Решение: _ждёт решения оператора_.
- **Pawetta — Digital-вакансии** — robots.txt запрещает `Disallow: */feed`. Решение: _ждёт решения оператора_.

