# Changelog

## 0.51.0

- **Participants.** `/network` opens from the menu and names people: the rating links to a public page `/u/<handle>` with their posts, points and tier. Anyone can leave the rating in the profile.
- Extension 0.20.0: a link on how filters work; a time offset no longer lands in a Profi.ru city.
- [docs/GIG_SOURCES.md](docs/GIG_SOURCES.md): how to add a board, and an issue template for proposing one.

## 0.50.3

- A walk reads Yandex and Profi.ru first, and YouDo has one budget of 200 tasks for the whole walk. The YouDo lists of eleven cities held the other boards back for half an hour.
- Extension 0.19.0: pay shows as the page states it, «184 800–302 500 $ в год», and a yearly range is compared with the market by its month. A page that is clearly a vacancy or an order locks the choice. «Сбор заказов» folds.
- Profile: board and channel names open their orders, «Откуда приходят заказы» moved below the settings, «ждёт подтверждения» became «очки позже» with an explanation, and a new agent token appears in place, without a reload.

## 0.50.2

- Extension 0.18.0 reads about one page a second, up to 200 tasks per list, and shows the count as it goes. It took 25 seconds per eight orders.
- Filters fold under one line per board, with «Все» first and «свернуть» on long lists. A picked field opens its parts: 194 on YouDo, 810 on Yandex.

## 0.50.1

- **The collector works.** A browser stopped the extension's worker during a long read, so nothing reached the hub and the walk stayed «Идёт сбор…». Extension 0.17.0 reads and sends eight orders at a time and keeps the worker awake.
- Cities, fields and sections come from the boards themselves, not from a list in the code: 11 cities and 16 fields on YouDo, 19 sections on Yandex.
- The popup checks the sign-in on each board and offers it. Access to the boards is granted at install, so a switch no longer asks for permission and closes the popup. The section shows at once from the saved answer.
- X-Ray has no emoji and is folded.

## 0.50.0

- **Collector settings without addresses.** Extension 0.16.0 lists the boards with a switch each and filters as chips: cities, fields, rubrics, remote only. A board is one entry in `extension/boards.js`. Each board shows its last walk and asks for a sign-in when its session ended. Only the hub's owner sees the section.
- **Sign-in in one tab.** One press on «Разрешить», and the tab closes by itself. The separate auth window opened a second tab in some browsers.
- **Profile:** «Откуда приходят заказы» shows posts by board and Telegram channel for a day, a week and in all.
- Popup layout: switches and chips in place of stretched checkboxes.

## 0.49.0

- **Profi.ru and Yandex Uslugi in the collector, checked under real accounts.** Extension 0.15.0 reads the Profi.ru board and new orders of Yandex lists by rubric, with their date, budget, category and place. It never presses «Показать номер» and takes neither the client's name nor the street. Coverage follows the account: Yandex ignores a region in the address and Profi shows the account's specialties.

## 0.48.0

- **YouDo in the collector.** Extension 0.14.0 reads the task list with filters by place, category and remote work, and each new task's page for its text, date, budget and subcategory. Checked on the live site: about 7 000 open tasks, no sign-in needed. Clients and street addresses are not kept.
- `POST /api/ext/orders` takes the publication date and remote work.

## 0.47.0

- **Order collector.** Extension 0.13.0 reads Profi.ru, Yandex Uslugi and YouDo in a browser where the owner is signed in, from one page or over a saved list of cities and specialties. The hub takes them at `POST /api/ext/orders`, from admins only, and cuts phones, addresses and handles first. The page markup comes from public repositories and is not yet checked on live accounts.
- The official MCP registry follows every release through GitHub OIDC.
- Personal Telegram sources read 100 posts a chat each round, not 30: a busy group lost the rest.

## 0.46.1

- MCP directories get a server card at `/.well-known/mcp/server-card.json`.
- [docs/MCP.md](docs/MCP.md): connecting Claude, Cursor, Gemini CLI, VS Code and Codex. [docs/GIG_SOURCES.md](docs/GIG_SOURCES.md): how to read Profi.ru, Yandex Uslugi and YouDo. [docs/STATE_2026-11.md](docs/STATE_2026-11.md): users, agents, what is broken.
- «Юридическое лицо» in an order no longer tags it as legal work.

## 0.46.0

- Orders and vacancies in Telegram: a post that calls itself a vacancy is one, as is a position at a named company, and hours or monthly pay count as terms of employment. Remocate and WorkASAP post vacancies, Pawetta is a job board. #ищузаказы and «ищу проекты» are offers of work, not orders.
- The model reads orders and Russian posts first: about 60% of its answers went to Himalayas, which needs it least. It now says whether a post is a vacancy or an order, without being told what the rules think. Version 2 of its answers.

## 0.45.6

- A day rate multiplies only the sum named per day: «5/2 – 119 600 ₽, в день – 5200 ₽» stood at the top of the orders at $31 000.
- A share of profit in the title («50% Profit Sharing») shows no sum.
- Skills: trades count when a post names no tool («Тестировщик», «Маркетолог», «Recruiter»), and sales and support match more wordings. The IT filter knows the new technical ones.
- «Похожие» on a card stay in its language.
- `requality --money` decodes entities in stored titles.

## 0.45.5

- The revenue of past launches is not pay: «опыт запусков от 5 млн рублей» and «с нуля до 500 000 €» topped the orders by budget.

## 0.45.4

- Freelancer.com: a budget above $10 000 shows no sum. Clients pick a tier from a list, and a promo design at $50 000–100 000 topped «Сначала дорогие».

## 0.45.3

- Research: an order's sum read from free text stops at 1 000 000 ₽, as a month's pay does. One Telegram post with 5 000 000 ₽ made «Видео и анимация» the leader by the sum of budgets.
- `requality --money` reads every channel post again: they have no budget field, so all their figures came from the text.

## 0.45.2

- A job board's posts are vacancies whatever the adapter says: the RSS adapter called them orders, so about 3 000 Himalayas posts a week and their yearly pay stood among the orders, on top of «Сначала дорогие».
- «Заработная плата» marks a vacancy; a client's «чек $2000–4000» is not pay.

## 0.45.1

- `radar requality` and `rescore` walk a long window by date. The stores cap an offset at 10 000, so past about 15 000 leads the command went over the same pages again and reported them as checked.

## 0.45.0

Three outside audits of the feed, /research and the subsystems, each claim checked against the code and live data first.

**Pay**
- Sums that are not pay stay out: ad budgets and every figure of their sentence, net profit, market statistics, subscription prices, signing bonuses, stipends, travel and learning budgets, «$781M», «25 миллионов долларов». Research reads amounts through the same code, it had none of these masks.
- A ceiling: monthly pay above $35,000 or an order above $250,000 shows no sum. A huge rouble figure is no longer read as yearly pay. A year counts only next to an amount, so «annual leave» no longer divides a salary by 12.
- Ads, a channel's articles and roundups carry no sum, in the feed or in research.
- **One table of rates** in `src/core/fx.ts`. The feed used 92 ₽ per dollar and research 80.56. The feed and /api/market now use the Bank of Russia rate of 1 November.
- Yearly pay from page markup says «per year»; a day or week rate in schema.org becomes a month of it (×21, ×4.33), it was stored as a monthly sum.

**Posts**
- #услуги, #предлагаю and an agency's price list are rejected; stored ones sink.
- «#реклама», «бесплатный вебинар» and «О рекламодателе» count even when the post says «без опыта». A roundup announced on its second line is a roundup. A job channel's article without a position is flagged.
- Vacancy or order: «зарплата —», «официальное оформление», «испытательный», «что предстоит делать», yearly pay. 31 channels post vacancies only. Exchanges post orders only, even one to write a vacancy. More boards are job boards.
- Skills: Ozon, Avito and a passing GPT no longer tag a post unless the trade is meant. 25 more tools in the dictionary, Cursor, LoRA and ComfyUI among them.
- Telegram blocks no longer glue together («рублейПредстоит»); accented letters decode (&ntilde;).
- A vacancy under 300 characters loses points: getmatch snippets scored like full posts.

**Research**
- Channels, boards and «Компания скрыта» are no longer employers, here and in X-Ray.
- A marketer who knows neural networks is a marketer: the AI role needs an engineer's words. Any profession beats a bare «Engineer». Sales, HR and customer success roles are named. «Opportunity» no longer reads as Unity.
- Exchanges: the budget field beats the description, and a sum from a description counts up to 150 000 ₽. Pay from text stops at 1 000 000 ₽ a month, and a range above it gives its lower sum.
- Empty rows left the task block, and its header no longer shows a drop in the colour of a rise.
- On the 300 labelled posts: type 85 → 96%, role 61 → 76%, sums 79 → 92%. The rules were tuned on this set, so these figures are high.

**Elsewhere**
- /api/market says `none` with too few similar posts; it gave the median of 40 unrelated ones. It compares within a language and skips pay that looks wrong.
- Digests show the period of pay and skip pay that looks wrong. MCP `search_leads` skips it under a budget filter.
- `GET /api/leads/{id}` exists: it was documented only.
- /catalog: the bot page follows the Telegram Bot skill («бот» is inside «работа»), sums keep their currency, pages show Russian posts.
- The closed-post check reaches Himalayas, Arbeitnow, Freelancehunt, getmatch, GeekJob and Greenhouse.
- `radar requality --money` reads pay and skills of stored leads again.

## 0.44.7

- **undici is held at 7.30.1.** undici 8.12 hangs on HTTPS answers of several megabytes, on any Node version, and later requests to the host can hang with it; 7.30.1 reads the same boards in half a second. The app reads sources through this package, so the large Greenhouse boards (Databricks, Stripe, Anthropic) stayed empty. This corrects 0.44.4: going back to Node 24 fixed only the built-in fetch, whose Node 26 version bundles undici 8; the boards that came through after it were the smaller ones.

## 0.44.6

- ATS sources take `config.timeoutMs` (up to 120 s). From the hub's network answers of api.ashbyhq.com now freeze at about 20 KB, curl included, while Tor delivers them slowly: a 5 MB board takes over 20 s, past the general 15 s limit. The hub's Ashby source runs with `proxy: true`, `timeoutMs: 60000` and `perPoll: 3`.

## 0.44.5

- Profile. Accounts and sources are lists with line icons; the form for a new source opens from «Добавить источник», and the explanation folds away once an account is linked. The two Telegram buttons no longer read the same: «Получать подписки в Telegram» names the bot, «Подключить аккаунт Telegram» links an account for reading.
- A dialog asks before unlinking an account, deleting a source or a subscription, and reissuing or revoking the agent token. Cancel has the focus. Subscriptions and the token had no question at all; the others used the browser's plain box.
- Extension 0.12.4: X-Ray uses line icons instead of emoji.

## 0.44.4

- **Back to Node 24 LTS** in the image and CI. On Node 26.13 an HTTPS answer above about 6.5 MB hangs and later requests to the host hang with it, with any TLS settings; Node 24 with the same OpenSSL and network reads those boards in a second. This is why large Greenhouse boards (Anthropic, Databricks, Stripe) gave nothing since 0.43.0. The cause given in 0.44.1 covered only the rarer stalls that curl sees too; its retries stay for them.
- Extension 0.12.3: X-Ray links and the outreach pitch follow the interface language, they were always in Russian. Browsers in other languages get English, not Russian.

## 0.44.3

- Sources: 22 new RU ones. HeadHunter joins the report's roles through its RSS search — product, project, analytics, design, QA, DevOps, marketing, support, sales, information security and 1С — because the API preset stays behind the WAF and the RSS does not. Multi-role searches take several professional_role codes in one feed.
- Pawetta's digital feed and ten public Telegram channels: product managers, product and motion design, juniors, internships, startups, SMM. Channels without a public t.me preview (QA, Go, Java, .NET, mobile, 1С among them) wait for the account folder.

## 0.44.2

- Profile: an administrator who signed in with GitHub lost the Telegram, saved searches and agent token sections, because the admin viewer carried no user id. They are back.
- Remote work. «Remote until the office opens» is office work even when the markup says TELECOMMUTE; `applicantLocationRequirements` alone no longer means remote. The extension trusts the work mode the page prints («In office», «Hybrid», «Remote»). A link preview and a vacancy without a word about it are no longer assumed remote.
- Pay. Overlapping levels of one vacancy make one range: «Engineer: $184,800 - $250,000, Sr. Engineer: $223,600 - $302,500» is 184 800–302 500 $ a year, shown with its period. Research reads thousands written with a comma, which turned «$184,800» into $184.
- Skills. Kubernetes, Terraform, Ansible, Kafka, Redis, Rust, AWS, GCP, Azure and Linux join the dictionary. «Node management» is not Node.js, the English word «go» is not Golang, and «translate» is not a translation order.
- Extension 0.12.2: boards without JobPosting markup, such as Gem, are read from the page (title, employer, place, work mode, pay), and pay printed on the page fills what the markup leaves out, so the market estimate shows in the vacancy's currency.

## 0.44.1

- ATS boards are read up to three times when an answer stalls. From Russian networks a foreign answer may freeze after its first 16 KB on some requests, curl included, which left whole hourly runs of Greenhouse and Ashby empty. An HTTP error is the board's real answer and is not retried.

## 0.44.0

An audit of the research on live data found figures that were wrong or misleading. Report and index are now version 2; the October 2026 report stays frozen under version 1 and says so.

- **The openradar index.** The panel is a set of feeds, not of platforms: five hh.ru feeds added on 3 November had joined it and tripled the hh count for that day. A post counts when a panel feed saw it, so a new source changes nothing even when it meets the post first. Old vacancies raised in search no longer count as new: on hh.ru and Habr Career the vacancy number tells them apart (about 45% of the «new» hh vacancies of the first week were over a week old). The panel starts on 30 October and the base moves to 9 November – 6 December, four whole weeks after these rules. Migration 028 empties `research_daily`; the app rebuilds it.
- **Orders** cover the Russian-language market only, like vacancies: Freelancer.com and other English-language orders inflated the median budget from about 3 500 ₽ to 4 950 ₽. An order paid by the month is no longer a project budget.
- **«Money mass» and the AI premium** added monthly salaries to project budgets across markets; two thirds of the sum was foreign salaries. Both now use Russian-language project budgets alone, and the wording no longer claims a market budget or a premium for a skill.
- **Bank of Russia rates.** Pay converts at the official rate on the first day of the month of publication (`research_fx`), not at a fixed USD = 92 ₽. The fallback table is the rate of 1 November 2026. The feed and `/api/market` keep their own constants for now.
- **Intervals and fair comparisons.** Medians carry a 95% interval from order statistics, shown on the charts. Gaps for remote work, AI mentions and Moscow are measured at the same role and seniority (remote: +60% plainly, about +8% matched). «Pays the most» is claimed only when the leader's interval stands clear of the next one. Reports add a median for IT roles, medians by board, and how sums were written.
- **Duplicates.** A vacancy joins by title only at the same employer, and the employer is read from the post text too: the hh.ru feed has no author field, so different employers' «Программист 1С» could merge. Another feed reading the same page is recorded in `lead_sightings`, whose key gains `source_id`.
- **Role rules.** «Финансовый директор» no longer lands in marketing, nor occupational safety in information security. `t.me` and `telegram`, and the national Arbeitnow sites, each count as one platform.
- **Checking accuracy.** `radar research sample --n 300 --out gold.csv` writes posts to label by hand and `radar research gold gold.csv` scores the rules and the model against them. This decides `RADAR_EXTRACT_APPLY`; `research check` stays a rough comparison.
- `docs/RESEARCH_METHODOLOGY.md` is rewritten to what the code does: it described a quality index, daily exchange rates and other things that were never built. Their unused code in `src/research/methodology.ts` is gone. The public methodology pages are updated.

## 0.43.4

- RSS feeds with a bare «&» (`R&D`, `?a=1&b=2` in a link) are read: the strict XML parser dropped the whole feed, so GeekJob and Real Work From Anywhere gave nothing. Entities and CDATA are left as they are.
- The openradar index is served stale while it rebuilds, like the live report, and the background loop keeps both built.

## 0.43.3

- The live research report no longer makes a visitor wait: deriving a month of posts takes about 3 s of CPU, so a stale report is served at once while the next one is built behind it, and the background loop keeps it built from the start.
- The robots.txt log names each ATS source's own system (Workable, Recruitee, …) instead of «Greenhouse, Ashby, Lever» for all. docs/SOURCES_ROBOTS.md is regenerated with the sources added in 0.43.

## 0.43.2

- Research pages follow the primary key: a page takes 30 ms instead of 370, because an order by date sorted the whole period again for every page; the live report built in 6 s after a restart. The records still come out newest day first.
- `radar source presets --add --only geekjob,ats-workable` adds just the named presets; `--add` alone still adds every missing one.

## 0.43.1

- The image builds again: Node 25 and later ship without corepack, so `corepack enable` failed and 0.43.0 never deployed. pnpm 12.16.1 now comes from npm.

## 0.43.0

- **PostgreSQL 18.** `docker-compose.yml` runs `pgvector/pgvector:pg18-trixie` on a new volume `radar_pgdata18`. `deploy-server.sh` moves the data over with `scripts/pg-upgrade.sh`: a dump of the running 17, a restore into 18, and the old volume `radar_pgdata` left untouched for a rollback. **Without deploy-server.sh, run once before `docker compose up`:** `bash scripts/pg-upgrade.sh` (while the old `radar_postgres` is still running). See docs/BACKUP_AND_RESTORE.md.
- **Node 26 LTS** in the image (`node:26-trixie-slim`) and in CI; pnpm 12.16.1; hono 4.13.16, @hono/node-server 2.1.6, imapflow 2.10.0, mailparser 3.14.1, pg 8.23.1, vitest 5.1.0. GitHub Actions: checkout v7, setup-node v7, docker/login-action v4.
- Duplicates across boards. A vacancy with the same title at the same company within 30 days is one vacancy: an aggregator's copy (Himalayas, Working Nomads) joins the company's ATS page. The employer comes from the address on boards that name it (Himalayas, Greenhouse, Ashby, Lever, Workable, Recruitee, SmartRecruiters) or from the author. The one-day title rule no longer merges the same title at two named companies («IT Support Engineer» at ElevenLabs and at Socure).
- Copies are kept, not dropped: migration 027 adds `lead_sightings`, the lead page shows «Также опубликовано» with the other boards, and `/v2/leads/:id` returns `sightings`. The never-written `lead_duplicates` table is dropped.
- The near-duplicate index (MinHash LSH, 16 bands) lives in Postgres (`lead_minhash_bands`, migration 027) instead of the process: every worker sees one index and a restart loses nothing. The first lookup after the upgrade fills it with the last seven days; bands older than seven days are pruned hourly.
- Research reads posts a page of 2 000 at a time instead of the whole period at once, so the live report no longer holds a month of full texts in memory (the hub's peak was 743 MB); the ceiling of 200 000 posts per report is now 500 000.
- Memory ceilings in `docker-compose.yml`: `mem_limit` 2 GB for the app (`RADAR_MEM_LIMIT`), heap 1.5 GB (`RADAR_NODE_OPTIONS`), 1 GB for Postgres (`RADAR_PG_MEM_LIMIT`).
- Model extraction from any OpenAI-compatible provider pauses the batch on HTTP 429 and honours `Retry-After`, as GigaChat did: Groq's free plan counts requests per day and tokens per minute. Groq refuses Russian addresses, so `deploy/model-relay` is a small Vercel relay for it (docs/LOCAL_LLM.md).
- Sources: Workable and Recruitee career boards in the ATS adapter (with SmartRecruiters, which has no preset: its API disallows robots), the Working Nomads API adapter, and presets for GeekJob, Landing.jobs, Python.org jobs, Golang Projects, LaraJobs, Ruby on Rails Jobs, Elixir Jobs, Hacker News jobs, Dribbble jobs, Cryptocurrency Jobs and Real Work From Anywhere. Every new address was checked against its robots.txt; hh.kz, rabota.by, hh.uz and zarplata.ru were left out, since they disallow every address with a query, as hh.ru does.
- The sitemap source's memory of read pages stops at 20 000 per source.

## 0.42.2

- Salaries: a comma or a space joins digits only as a thousands separator before exactly three digits. 0.42.1 read «Команда 5, 120 000 ₽» as 5 120 000 ₽ and dropped the pay in «Требования: 2026, 150 000 руб»; «$259,300 - $350,800» still reads right.
- Remote detection (site preview and extension): an explicit «fully remote», «100% remote», «remote-first» or «полностью удалённо» wins over a passing «no onsite visits».
- Versions: package.json, src/version.ts and server.json agree again (0.42.1 changed only package.json, so CI and the Release were red and /health said 0.42.0). `deploy-server.sh` now refuses a release tag whose three version files disagree.

## 0.42.1

- US/international salary parsing: comma thousands separators (`$259,300 - $350,800`) are parsed accurately instead of truncating at the comma.
- Currency detection: when jobs explicitly specify USD/EUR/GBP, the currency is preserved as USD/EUR rather than falling back to default RUB.
- Market pay estimate (`/api/market`): excludes corrupt sub-$300 monthly job salaries and normalizes hourly rates (168h), preventing contaminated median estimates.
- Browser extension (0.12.1): detects multi-location hubs (e.g. Dallas, San Francisco, New York), recognizes onsite/hybrid jobs with transition periods instead of blindly labeling them remote, and displays market estimates in USD for foreign jobs.

## 0.42.0

- Members read their own Telegram into the feed. On `/me`, «Telegram-источники»: link the account by QR (Telegram → Settings → Devices → Link Desktop Device; the cloud password when two-step verification is on), then name a Telegram folder or a list of chats. Every 15 minutes the hub reads them and adds the orders it finds to the shared feed, credited to the member for points. Behind `RADAR_USER_TELEGRAM=true`.
- Only public channels and groups (with an @username) are read. Dialogs with people, bots and chats without a public link are skipped and counted on the source; nothing is ever sent from the account. A session Telegram revoked marks the account «link again» and stops its sources.
- Migration 026: the last read's count and note per personal source; phone numbers left from 0.40.3–0.41.2 are cleared.
- GigaChat: one token request at a time (parallel posts used to ask for a token each and all got HTTP 429 after a restart); on a 429 for the token or a chat call the batch stops, honours `Retry-After` (a minute by default) and leaves the rest for the next run.
- ATS boards may be up to 40 MB: OpenAI's Ashby board is about 14 MB and was dropped by the general 10 MB ceiling.
- New dependency: `uqr` 0.1.3 (MIT, no dependencies) draws the login QR as SVG.

## 0.41.3

- Duplicate detection works again for older leads. Migration 025 (0.40.4) rewrote `title_key` in SQL with its own rule: it kept «ё», dropped letters outside Latin and Cyrillic and did not cut at 160 characters, so reposts of those leads stopped matching. The step is gone from the migration, and the new `radar rekey` rebuilds every key with the app's rule. **After upgrading from 0.40.4–0.41.2, run once:** `docker compose run --rm -T radar rekey`.
- Migration 025 no longer carries hand-picked lead ids and names.
- Research widgets can be embedded on other sites: `/embed/*` sends `frame-ancestors *` and no `X-Frame-Options` (the global policy blocked every frame, and `ALLOWALL` is not a valid value).
- X-Ray reads Russian job titles: «Тестировщик», «Дизайнер», «Аналитик», «Фронтенд-разработчик» get their personas instead of the generic engineering set (`\b` only knows ASCII letters).
- Research, AI skill premium: no invented 100 000 ₽ baseline, a negative premium keeps its sign instead of becoming 0 %, no percent where either side has fewer than 10 paid posts, and the terms match whole words (`flux` no longer catches «influx»; html/css skills no longer make any frontend post «template coding»).
- Linking a visitor's own Telegram account is off unless `RADAR_USER_TELEGRAM=true`: nothing reads these sessions yet, and each one is full access to an account. With the flag off, `/api/tg/*` and `/api/user-sources` answer 404, and the server starts without `RADAR_WEB_KEY_SECRET` again (0.41.1 refused to boot in production without it).
- When it is on: removing an account logs its session out at Telegram first; the phone number is neither stored nor returned; one QR login per person at a time; a finished login no longer turns into `expired`; errors reach the client as codes, details stay in the log; personal source titles, folders and chat lists are length-checked.
- Releases: the Release workflow checks versions, types and tests before building and runs only in the public repo; `publish-public.sh` waits for green private CI on the exact commit; `scripts/hooks/pre-push` refuses commits by other authors or with a Co-Authored-By trailer (`git config core.hooksPath scripts/hooks`).

## 0.41.2

- Research data consistency, strict mathematical integrity & visual synchronization:
  - **Carta capital & volume alignment (`computeCartaCapital`)**: Grouped by canonical role taxonomy (`roleDef`), outputting Top 5 directions by gross capital with exact remainder aggregated into «Другие направления». Enforced strict 100.0% constraint for both volume (`nShare`) and capital flow (`capitalShare`), guaranteeing that total sample counts $N$ and shares match the underlying database and page tables exactly.
  - **Dynamic Task Transformation Benchmark (`computeTaskTransformation`)**: Replaced fictional 12-month retrospective estimates with an honest synchronous market cross-section (cross-sectional benchmark) calculating the actual live AI skill premium ($\text{AI Skill Premium}$), real sample counts $n$, and median compensation in rubles (₽) across routine tasks and emerging AI competencies.
  - **Authentic Bump Chart (`computeBumpChart`)**: Eliminated fictional 2025 quarters and months. Replaced with real dynamic rankings computed directly from database records across the 4 active weeks (`[По неделям]`) and market rhythm intervals (`[По дням недели]`: Пн, Вт–Ср, Чт–Пт, Сб–Вс) using horizontally tangented cubic Bezier splines and live client toggling.
  - **Simpson's Paradox editorial note**: Added clear methodological disclaimer under the weekly dynamics chart explaining the sample expansion from October 26 (addition of national platforms `hh.ru` and `trudvsem.ru`), preventing misinterpretation of median salary adjustments.
  - **Dynamic editorial takeaways (`computeEditorialInsight`)**: Editorial lead cards now derive facts, contrasts, and media citation quotes dynamically from live Carta table calculations.

## 0.41.1

- Security hardening for user-connected Telegram accounts and session crypto:
  - **Sanitized status endpoint**: `TelegramAuthService.getAuthStatus` emits `PublicTelegramAccountRecord`, stripping `sessionEncrypted`, `iv` and `tag` so encrypted session ciphertexts never leak to the client or browser network logs.
  - **Production secret enforcement**: `deriveUserSessionKey` and `TelegramAuthService` reject the insecure fallback secret (`openradar-telegram-key-secret-fallback`) when `NODE_ENV === 'production'`, enforcing a real $\ge 16$-character `RADAR_WEB_KEY_SECRET`.
  - **Environment variable guard**: `telegram-account.ts clientFor` validates `sessionEnv` against `TELEGRAM_SESSION_ENV_RE` (`/^RADAR_TELEGRAM_SESSION(?:_[A-Z0-9]{1,32})?$/`), preventing unauthorized access to other server environment variables.

## 0.41.0

- X-Ray & Decision Maker Discovery engine (direct candidate-to-lead outreach):
  - **Core X-Ray module (`src/core/xray.ts`)**: Deterministic Google Dork generator with corporate entity normalization (`cleanCompanyName` stripping legal noise like ООО, АО, LLC, Inc., quotes and web prefixes), leadership persona categorization (Go, Python, JVM, Frontend, Mobile, DevOps/SRE, QA, Data/ML, Design, Product), and multi-platform Boolean queries.
  - **1-Click X-Ray Navigator in Browser Extension (`extension/`)**: Automatically detects company, role, and tech stack from active tab or `JobPosting` schema; renders 1-click search buttons for LinkedIn, Telegram (chats and channels), Habr tech articles, and GitHub contributors. Includes copyable value-focused outreach pitch template.
  - **MCP Tool `xray_generate_dorks`**: Exposed to AI agents (Claude Desktop, Cursor, Antigravity) via `src/mcp/server.ts` to programmatically generate targeted Boolean queries for any company and role.
  - **Zero-backend client execution**: All search queries execute directly from the candidate's browser, preventing server IP bans, CAPTCHAs, and eliminating personal data storage risks under 152-FZ/GDPR.

## 0.40.5

- Research benchmark & media engine:
  - **Task Transformation Benchmark («Трансформация контрактных задач: автоматизация рутины vs новые специализации»)**: Academic taxonomy (`TASK_TRANSFORMATION_TAXONOMY`) tracking shift from routine automated tasks to emerging high-value specializations, with $n \ge 30$ sample reliability badges.
  - **Dual Carta Capital & Volume Analysis**: Side-by-side volume ($N$) and gross capital flow ($\sum$) distribution table with median ($P_{50}$), IQR ($P_{75}-P_{25}$), and 10% trimmed mean.
  - **Bump Chart with Dual Tracking**: Dynamic skill demand trajectories with client-side toggle for both Quarterly (`[По кварталам]`) and Monthly (`[По месяцам]`) intervals using smooth SVG Bezier curves.
  - **Editorial Takeaways & 1-Click Media Citations**: Formatted key insights with single-click quotation copying for tech journalists and researchers.
  - **Public Embed Widgets & Research Attribution**: Route `GET /embed/:chartId` (`carta`, `bump`, `task-transformation`) with CORS and iframe modal generator with tracking tokens (`ref=embed`).
  - **Strict Monochrome Design**: Adheres to openradar monochrome palette (`#09090b`, `#ffffff`, `#71717a`, `#e4e4e7`), with colors reserved strictly for chart data marks.
  - **Enriched Dataset Metadata**: CC BY 4.0 license, `variableMeasured` schema attributes, and direct data download distribution links.

## 0.40.4

- Technical, SEO and UX/UI audit phase 2:
  - **Clean title parsing & HTML entity unwrap**: Two-pass HTML entity decoding for double-encoded entities (`&amp;quot;` -> `"`). Strips glued metadata labels (`Компания:`, `Формат:`, `Локация:`, etc.) following job titles and removes noise punctuation and Braille spaces (`\u2800`).
  - **Schema.org JobPosting hiringOrganization guard**: Non-greedy lookahead stops capturing employer company names before standard job section headers (`Формат`, `Локация`, `ЗП`, `График`, `Занятость`, `Вилка`, `Опыт`, `Стек`, `Требования`, `Обязанности`, `Условия`, `О нас`, `Всем привет`, `Мы`, `Контакты`), capping max length at 45 characters.
  - **Mobile viewport (390×844) fold fix**: Filter count logic fixed so visiting without filters does not treat language as active, keeping `<details id="feed-filters">` collapsed by default on mobile screens (< 640px). Reduced search bar padding to avoid clipping search placeholder.
  - **Database migration 025**: Cleans HTML entities, Braille blank spaces, glued metadata and trims noise punctuation from historical lead titles, keeping `title_key` synchronized.

## 0.40.3

- User Telegram account session encryption and QR login infrastructure (AES-256-GCM + HKDF with AAD).

## 0.40.2

- Technical, SEO and UX/UI audit improvements across the site:
  - **Multline and HTML entity parsing**: Cheerio `.tgme_widget_message_text` converts `<br>` tags to newlines before text extraction; `decodeHtmlEntities` supports unclosed entities (`&sup2` -> `²`, `&deg` -> `°`), and `stripInvisible` removes Braille blank spaces (`\u2800`).
  - **Clean title extraction**: `cleanTitle` ignores degenerate one-line city or format lines (e.g. `Санкт-Петербург`, `Москва`, `Удаленка`), searching for the actual vacancy title on subsequent lines; joins multiline titles with delimiter ` · ` and strips leading dashes and blank symbols.
  - **Accessibility (WCAG AA)**: Moved `<header class="top">` and `<footer>` outside `<main id="main">`; added semantic `aria-label` to feed filter selects (`sort`, `budget`, `skill`, `language`) and close dialog buttons (`aria-label="Закрыть окно"`).
  - **Mobile UX (390×844)**: Filters are collapsed by default on mobile viewports (< 640px) unless active filters are present in the URL, reducing initial fold height so orders appear on the first screen; updated select padding to `padding: 0 34px 0 12px`; shortened search placeholder to `Поиск по заказам и навыкам`.
  - **SEO & Schema.org**: Added `og:description`, `og:url`, `twitter:description`, and `WebSite` + `SearchAction` JSON-LD schema on the main page (`/`); updated `/leads/:id` to emit `JobPosting` schema with `employmentType: 'CONTRACTOR'` for gigs, parsed employer company from text (`(?:Компания|Работодатель|Company)\s*:\s*([^\n·]+)`), and cleaned leading hashtags from `meta description`.
  - **Interactive redacted contacts**: Replaced static `[контакт скрыт]` with interactive `<button type="button" class="redacted-btn" onclick="openLoginModal()">` and made sidebar «Контакты видны после входа» trigger the GitHub sign-in modal with graceful fallback.
  - **Non-blocking toast alerts**: Replaced blocking `window.alert()` in manual polling (`[data-poll]`) with toast notifications.

## 0.40.1

- Fix Telegram MTProto client leak: when MTProto handshake or connection times out or fails
  with a transport error (e.g. over a proxy), the failed `TelegramClient` is destroyed cleanly
  with `client.destroy()`, preventing zombie client instances from accumulating in memory.
  A 60-second cooldown prevents repeated connection attempts from spamming Telegram DCs on every poll tick.
- Dynamic feed skills filter: the `<select name="skill">` dropdown is dynamically populated
  from actual active leads in the current window (top 30 significant skills with count, filtered
  for count >= 2), with fallback to canonical tech skills. Current query skill is always retained.
- Proxy-aware robots.txt checks: `radar robots` and source audits route Telegram checks through
  the configured proxy (`undici` ProxyAgent), generating `docs/SOURCES_ROBOTS.md`.

## 0.40.0

- robots.txt discipline (#62): `src/net/robots.ts` reads robots.txt by RFC 9309 (the `RadarBot`
  group or `*`, the longest rule wins, `Allow` on a tie, `*` and `$`; no robots.txt allows all,
  a site that does not answer is «unknown», not a ban). `radar robots` checks the address every
  enabled source polls; `--markdown` prints the source log for `docs/SOURCES_ROBOTS.md`.
- The hub checks once a day and logs disallowed addresses; the admin source page shows the
  verdict. Nothing is switched off by the check: the operator decides per source. Adapter rule 6
  in docs/ARCHITECTURE.md: a site's protection is not worked round.

## 0.39.0

- Points in Telegram: after the hourly rating run, a user with a linked chat gets one message about
  what was credited or taken since the last one («+10 — вы нашли первым, заказ подтвердили: …»,
  «−10 — ваш заказ скрыли как мусор»). Each credit is reported once (`ledger_notices`); credits
  from before the chat was linked are not sent.
- Personal agent token: Profile → «Токен для ИИ-агента» issues an `mcp_…` token, shown once, one
  per user (a new one revokes the old, «Отозвать» removes it, only its SHA-256 is stored). With it
  `/mcp` acts as that user: their tier, delay and contacts.
- MCP `save_search` subscribes the user to a search (query, type, skill, IT, remote, budget,
  market) and `list_saved_searches` lists them. Without the token they say how to get one.
- Migration `023_notices_and_agent_tokens.sql`.

## 0.38.0

- `radar retitle` — a one-off pass over stored leads whose titles still open with channel
  hashtags: the title is recomputed from the post body with the v0.37.0 rules, the dedup
  key (`title_key`) is rebuilt, and the previous title is kept in `metadata.retitle_from`.
  The v0.37.0 pipeline fix only changed new leads; posts ingested before it kept their
  «#ищу #смм» titles.
## 0.37.0

- Lead quality: a hashtag-only first line of a channel post («#ищу #смм») is no longer
  the title — the first content line is taken instead, leading and trailing hashtag tokens
  are stripped (a hashtag between words stays). Jobs found by this: the feed's titles
  stopped opening with channel tags.
- Salary display: when a range is inferred to be annual (the floor heuristic), the raw
  salary now says «per year» — a bare «170000–200000 USD» read as monthly before.
- ATS locations are normalized: Greenhouse codes («US-CA-Menlo Park») and multi-part
  strings («London, United Kingdom») become plain cities.
- `score` is in the public API projection and the OpenAPI schema — agents can rank by it.
- Rate-limited routes answer with `x-ratelimit-limit/remaining/reset` headers.
- `radar setup` writes .env with fresh secrets (does not touch an existing one); the
  new-source form shows the poll pacing it always kept (intervalSec, perPoll, maxAgeDays).
- docs/SIGNALS.md: subscription payloads, HMAC verification, delivery and pause rules.
## 0.36.0

- Adapter-declared poll pacing: a source adapter may set `defaultPollIntervalSec`, and
  `pollAll` skips it until the interval passes (an explicit `config.intervalSec` still wins).
  Arbeitnow polls every 30 minutes instead of every tick — it was re-reading the same 50
  offers around the clock, 82 000 dedup checks a day for 633 inserts; the ATS company
  rotation, Hacker News and RemoteOK slow down to hourly or two-hourly. A restart polls
  everything once, then the intervals hold.
## 0.35.0

- SEO and discovery: the public sources index and source pages are indexable again
  (robots.txt only keeps operator routes out — /sources/new, /sources/catalog, edits);
  every page advertises the feed with `<link rel="alternate" type="application/rss+xml">`,
  so readers and crawlers find the RSS without the footer; /network sends
  `Cache-Control: public, max-age=600` to match its 10-minute cache.
- docs/ROADMAP.md — the directions, their epic issues and the v1.0 criteria;
  the README documentation table lists the newer guides (JobSpy export, local LLM,
  brand) and links the good first issues.
## 0.34.0

- Closure events: when a lead leaves the active feed — closed by participants, hidden as
  junk or scam — matching subscriptions are notified the moment it happens. The webhook
  payload (`event: "lead.closed"`) carries the reason and the lead's public projection, signed
  like the digests; Telegram sends a short «Закрыт» card. A subscriber is never told about a
  lead their tier could not see yet, paused subscriptions stay quiet, and ten failed pushes
  pause the subscription as with digests. Live transitions only: the hourly rating recompute
  does not wake subscribers over old closures. The feed-side filter matcher
  (`matchesSavedFilters`) mirrors the SQL semantics — type, skill, the IT set, remote,
  language, budget and query words.
- The wall of stories: an issue form «Я нашёл заказ через openradar» collects how the lead
  was found and what helped; a maintainer label (`on-the-record`) rebuilds `docs/stories.json`
  and the README badge counts the stories on the record. Linked from `/contribute`.
## 0.33.0

- OpenAPI 3.1 description of the public read API at `/openapi.json`, discovered through an
  RFC 9727 catalog at `/.well-known/api-catalog` and linked from `llms.txt`. A test keeps the
  schema honest: every field of a live `/api/leads` lead must be described by the `Lead` schema.
- JobSpy-compatible export: `radar export --jobspy` writes the columns pandas pipelines of
  JobSpy expect (SITE, TITLE, COMPANY, … with CURRENCY, POSTED_PERIOD extras), amounts in the
  posting currency, contacts never exported. See docs/JOBSPY_EXPORT.md.
- The network page `/network`: the 30-day participant leaderboard (names only from published
  profiles, keys abbreviated) and the sources of the week with their leads; private channels
  are never listed. Cached for 10 minutes.
- `/contribute` — the three ways to bring posts into the network (a Telegram account, a parser,
  a full node) on one page with real snippets, tier table and the /network attribution link;
  the footer's «Запустить свой узел» and «Предложить источник» now land there.
- Adzuna adapter (official API, ~20 countries): keys live in RADAR_ADZUNA_APP_ID/KEY
  environment variables, only real (not board-guessed) salaries become budgets, country
  decides the currency, annual full-time pay is marked so the normalizer reads it right.
  Preset «Adzuna — Вакансии США».
- `/trust` — what is collected (public postings only), what is never collected, security
  notes and the removal paths; linked from the footer.
- docs/LOCAL_LLM.md — running the classifier and research extraction on ollama/LM Studio
  with any OpenAI-compatible local endpoint. integrations/n8n — two ready workflows
  (Signal webhook → Slack, daily /api/delta → Google Sheets). .github/FUNDING.yml.
## 0.32.1

- The subscription bot reads its messages by long polling instead of a webhook, and Bot API calls
  go through `RADAR_PROXY_URL`: from the hub in Russia `api.telegram.org` does not answer directly,
  and Telegram cannot be counted on to reach the hub. The `/api/telegram/webhook` endpoint is gone.
  A failed start is retried every minute.

## 0.32.0

- Saved searches: «Следить» in the feed follows the filters on screen (query, type, IT, remote,
  budget, skill, language). New matching leads arrive in Telegram or on a webhook, at most every
  15 minutes and up to 10 a message, never before the user's tier delay would show them in the
  feed. Up to 20 subscriptions per user, managed in the profile: pause, delete, Telegram or
  webhook. Migration `022_subscriptions.sql`.
- Telegram: the hub's bot (`TELEGRAM_BOT_TOKEN`, `RADAR_SUBSCRIPTION_BOT=true`) links a private
  chat by a one-time code from the profile; `/stop` unlinks it.
- Webhooks: https only, public addresses only (the SSRF guard checks on save and on every send),
  signed with HMAC-SHA256 over «timestamp.body» (`X-OpenRadar-Signature`,
  `X-OpenRadar-Timestamp`). Ten failed sends in a row pause the subscription.
- One style for form controls: every text field, select and textarea takes the same height,
  pill corners like the buttons and the search bar, and a soft grey ring on focus instead of the
  black outline and double black border. Tokens `--control-h`, `--control-radius`, `--focus-ring`;
  inline field styles removed. Keyboard focus on links and buttons stays visible.

## 0.31.0

- Source health says what a source is doing (`src/core/source-health.ts`): works, empty (answers
  with nothing new), unstable (the last poll failed), broken (3 failed polls in a row), blocked
  (401, 403, 429, a captcha or a Telegram flood wait). «Broken» and «empty» are no longer one red
  dot, and one night outage of a foreign board no longer reads as a dead source. `/sources` and
  `/api/sources/health` (`state`) show it.
- The salary median behind «зарплату проверить» is computed by the database over every vacancy of
  the last 30 days. It was taken from the newest 5000 leads, about one day of the hub.
- «Только IT» in the feed filters (`it=1`, also for RSS and the API): development, data, DevOps,
  1C, site builders, bots and the engineering categories of company boards.

## 0.30.0

- Shorthand amounts are read: «от 150к», «25-30к», «от 70 до 150 тыс рублей», «$170k-$300k»,
  «£100k–£120k», «1,5 млн ₽», «45.000,00 ₽», «З/П: 4.500$» (it was 500 dollars before), kopecks
  and cents after grouped thousands are dropped. «401k» and «4k display» are not money.
- Money that is not pay is skipped: turnover, revenue, ARR, average check, deal size, valuation
  («6.5 млн рублей оборота» in a CV, «средний чек 100–150 тыс»).
- Bounds by period: «3 000 ₽ за смену» or «$100 per day» is compared with monthly pay as 21
  working days; an «hourly» rate above $500 is not hourly.
- Text hygiene for agents: bidi overrides, Unicode tag characters (hidden ASCII instructions),
  invisible joiners and control characters are removed at intake, and from titles and texts in
  the API and MCP for posts stored earlier. The MCP tool descriptions say that post text is data,
  not instructions.

On a week of hub posts from free-text sources the new parser reads pay in 2% more posts and
fixes several wrong amounts; stored posts keep their amounts.

## 0.29.1

- Job seekers and contractors advertising themselves are rejected on every source, not only where
  a folder excludes them: «Ищу позицию CMO», posts tagged `#резюме`, `#resume`, `#cv` or `#помогу`.
  On two weeks of delivered channel posts this caught five CVs and nothing else.

## 0.29.0

- Money in free text is read with its currency: `$3,500`, `€2000`, `1500PLN`, `150 000 ₸`,
  `500 бел. руб`, `£1,200` (RUB, USD, EUR, PLN, KZT, BYN, UAH, GBP, CHF, CAD, AUD). An amount next
  to «бюджет», «оплата», «budget», «rate» wins over other numbers in the post. Before, only roubles
  were read from text.
- Titles lose board noise: a trailing budget («(Бюджет: 150 000 ₽)», «- 1500PLN», «[$5000]»),
  «(для всех)», «(срочно)» and leading tags like «[Kwork]». A one-word title («Радуга») gets the
  first sentence of the description.
- More vacancy boards and `/jobs/`, `/vacancy/`, `/careers/` links make a post a vacancy.
- «Data entry» posts titled as data entry with pay in euros or dollars stay rejected after the
  title cleanup; company vacancies that list data entry among duties are kept.
- The «Добавить по ссылке» preview strips page navigation and footers and reads city, pay and
  currency from the text when the page has no JobPosting salary.
- Near-duplicate search uses 16-band LSH over the MinHash sketch instead of scanning a week of
  leads.
- `zł` and the new currency codes are not matched inside words («100 audits» is not Australian
  dollars).

## 0.28.2

- Channel vacancies with «Зарплата:» glued to the title («Fullstack-разработчикЗарплата: 120 000 руб.
  Без опыта») are vacancies; «без опыта» counts as a vacancy sign in channel posts.
- Promo posts with «акция действует», «возвращаем до 25%», «скидка 30%» are `channel_ad`.

## 0.28.1

- `radar rescore` and `radar requality` read long windows page by page: the store returns at most
  5000 leads a call, and `requality --days 60` stopped at the newest 5000.

## 0.28.0

- The quality stage (`src/core/quality.ts`): the feed no longer ranks channel promos, roundups and
  schemes as work. A post keeps its place in the database, but a flag with a reason sinks it in
  «Сначала лучшие» and shows on the row: `channel_ad` (a course sale, a new stream, a webinar,
  an article) −50, `mlm` −40, `digest` (several vacancies in one post) −20, `outstaff` −10.
  The API returns `qualityFlags`, MCP returns `flags`.
- Telegram and webhook posts get their real type: a channel vacancy with «Зарплата: … на руки»
  and «Полная занятость», or «Аналитик в X — IT-компания…», is a vacancy, not an order.
  On a week of hub posts a third of the channel «orders» were vacancies.
- `radar requality --days 60` runs the stage and the rating again on stored leads; votes are kept.

## 0.27.4

- The default ranked feed has no 7-day window: the rating already fades with age, and a node
  whose leads were all older than a week opened on an empty feed. An explicit «Сначала лучшие»
  or «Сначала дорогие» still looks at the last week.

## 0.27.3

- «За сутки найдено» says «5 000+» when the count reaches its cap instead of a flat 5 000.
- New README screenshots of the current feed, English and Russian.

## 0.27.2

- Currency detection matches whole words: «евро» in «Европа», `aud` in «Claude» or «audit»,
  `cad` in «academy» and «франк» in «Франкфурт» no longer turn roubles into euros, Australian
  or Canadian dollars. A post that names roubles is in roubles. Kwork leads are always in
  roubles. Stored leads of the last 60 days were recomputed on the hub.

## 0.27.1

- The home feed opens in the interface's market: a Russian page shows Russian-language leads,
  «Любой язык» (`language=all`) shows every market. Ranked by rating, the first screen of 0.27.0
  was all US company boards with yearly dollar salaries. RSS, the API and MCP keep every
  language by default; the RSS link on the page carries the language it shows.

## 0.27.0

- The home feed opens with «Сначала лучшие»: the lead rating, losing 4 points a day of age, over
  the last week. «Сначала новые» is one click away; RSS, the API and MCP stay newest first by
  default, and `sort=score` everywhere uses the same fading rating.
- A vacancy whose monthly pay is under 15 000 ₽, or under 30% of the median for its role
  (category, else first skill; 30 days, at least 20 vacancies), shows «зарплату проверить» in the
  feed instead of the number; the lead page keeps the number with a warning. hh.ru "project
  work" ads put lesson and task rates into the monthly income field, which made the feed look
  broken next to real salaries.
- «За сутки найдено N» links to /sources, where the number breaks down by platform.
- `pnpm init:env` (or `node scripts/init-env.mjs` on a server) writes `.env` with random secrets.
- README in Russian (`README.ru.md`), code of conduct, pull request template; the docs point to
  the platform catalog instead of the removed «Загрузить популярные биржи» button.

## 0.26.4

- `/api/preview` fetches a URL only for a signed-in person or an admin; it was open to anyone
  on a public node. It no longer skips the same-origin check, and its limit is 20 requests in
  10 minutes. A refused or failed fetch answers with a short code (`blocked_url`,
  `preview_failed`); the reason, which can name internal addresses, goes to the log with the
  URL and the client address.
- CI fails on known high-severity vulnerabilities in production dependencies (`pnpm audit`).

## 0.26.3

- Security: the SSRF guard missed IPv4 addresses written as IPv6. WHATWG URL turns
  `[::ffff:169.254.169.254]` into `[::ffff:a9fe:a9fe]`, which passed the check, so the link
  preview could read the cloud metadata service and other internal addresses. The guard now
  parses addresses to bytes and checks the IPv4 inside mapped, compatible, NAT64 and 6to4
  addresses; Teredo, site-local and multicast are refused. Requests to user-supplied URLs
  (preview, sources, liveness) also check the address at connect time, so DNS rebinding
  cannot swap in a private address after the check.

## 0.26.2

- Outgoing TLS offers the classic key exchange groups (X25519, P-256, P-384) instead of Node
  22's post-quantum share, whose two-packet handshake some networks drop: from a Russian
  server npm, Jobicy, Jobspresso and RemoteOK timed out while connecting. `RADAR_TLS_GROUPS`
  overrides the groups, `auto` restores Node's default. The Docker build installs packages
  over TLS 1.2 for the same reason; 0.26.1 never built for it.

## 0.26.1

- The score pills are gone: a lead shows its number only. In Russian the score is called
  «рейтинг» everywhere; a participant's standing is called «очки».
- A vote on the site counts for the voter's web key when it matches the outcome of a lead a
  network participant brought. It is not paid when the account brought the lead itself, and
  one person gets one vote: a site vote is dropped when a key of the same account signed too.
  The profile says when votes earn points.
- Phones: the filters open from a button with the number of set filters; RSS moves into the
  filters; the search pill keeps only «Найти»; a lead row keeps its rating on the right; the
  feed starts higher; buttons, nav links, the back link and the vote buttons (now two by two)
  are at least 40 px tall; fields use 16 px text so iOS does not zoom in; hover effects apply
  only where there is a pointer.

## 0.26.0

- A pill beside every score says what it means: strong (80+), good (60-79), weak (40-59),
  noise (below 40), on the feed and the lead page, in light and dark themes.
- «Прямой заказчик» is shown only for boards where the employer or client posts the lead
  (hh.ru, Работа России, company career pages, Kwork, FL.ru, Хабр Карьера, Freelancehunt),
  never for agencies or recruiters and never for aggregator feeds; `config.direct` overrides
  it per source. It used to be shown for every author without «агентство» in the name.
- Keyboard focus is visible everywhere, and a «К содержимому» link opens every page.
- The feed's «за сутки» counts a full day of what the visitor's tier can see, cached for ten
  minutes per tier; it used to count leads the visitor could not open yet.
- Limits per IP on public feeds, configurable: `RADAR_FEED_RATE_PER_MIN` (120, the feed and
  `/api/leads`), `RADAR_RSS_RATE_PER_MIN` (60, every RSS route), `RADAR_DELTA_RATE_PER_MIN`
  (30, `/api/delta`), `RADAR_SITEMAP_RATE_PER_MIN` (10, `/sitemap.xml`).
- Whoever brought a lead opens it at once, before the tier delay lets others see it; the
  profile's links used to lead to «not found». The not-found page shows the signed-in account.
- CI fails when package.json, src/version.ts and server.json disagree on the version.

## 0.25.4

- `radar telegram folder` gives a new folder an id above every existing folder, shared ones
  included. mtcute chose it over plain folders only, so the new folder took the id of a shared
  folder and Telegram replaced that folder.

## 0.25.3

- A Telegram folder is found by its title whether Telegram returns it as a plain folder or a
  shareable chat list; mtcute's lookup saw only plain folders, so a new folder was not found.

## 0.25.2

- The Telegram account source reads a folder from the folder's own chat list: listing dialogs
  by folder failed with INPUT_PEERS_EMPTY for a folder with no pinned chats.
  `radar telegram chats --folder` lists the same chats.

## 0.25.1

- `/mcp` answers GET and DELETE with 405, as Streamable HTTP asks of a server without a
  server-sent stream; the server reports its real version and a short instruction for agents.
- `server.json` describes the hub's MCP server for the MCP Registry; the guide says how to add
  `https://openradar.fun/mcp` as a connector in Claude and Claude Code.

## 0.25.0

- What a signed-in person adds on a hub, by link or with the extension, earns rating: every
  GitHub account gets a participant key the hub derives from `RADAR_WEB_KEY_SECRET` (the admin
  token when unset), and the post is recorded as that key's observation, first when it is new.
  The account's tier counts its own key and its web key together.
- The profile shows points (the rating ×10) over 30 days, how many are left to the next tier
  and what it gives, what each point was for, and the account's posts with their state:
  credited, awaiting confirmation or hidden.
- MCP `search_leads` filters in the database instead of over the latest 200 leads and takes
  `market` (ru, intl), `remote`, `since` ("24h", "7d" or a date), `sort`, `min_budget_rub`
  and `offset`; it answers with ten compact results and `next_offset`.

## 0.24.0

- The language follows the visitor across the site: a browser that prefers any language other
  than Russian, Belarusian, Ukrainian or Kazakh gets English, and the footer switch sticks.
  Research pages send English readers to their `/en/research` twins, and the switch lands on
  the twin of the page; About and FAQ have English versions. The «English» button and the
  «Русская версия» links are gone.
- The platform catalog (`/sources/catalog`) replaces «Загрузить биржи»: every ready-made
  platform with what it is, grouped into Russian boards, foreign boards and company career
  pages, connected one by one or all at once. The silent @freelance_orders preset is dropped.
- The new-source form shows every type again, as cards with a line on what each is for, and
  fills hh.ru, Работа России, RemoteOK, Remotive, company career pages and sitemaps too.
  Editing a source keeps the settings the form does not show (proxy, perPoll, maxAgeDays).
- The source page and the sources list put their buttons beside the title, not in the header.
- The extension page draws its install steps with a thin line and light numbers.
- `radar telegram scan` lists every channel and group of the account with its last post;
  `radar telegram folder <title> --add <chats>` creates a Telegram folder or adds chats to it;
  `radar telegram login --save <file>` writes the session to the file instead of the screen.

## 0.23.0

- Research in English: `/en/research` (live and monthly reports, findings written from the
  same figures), `/en/research/index` and `/en/research/methodology`, linked both ways with
  hreflang and listed in the sitemap.
- The research, catalog, about and FAQ pages show the signed-in account; they used to show
  «Войти» to everyone.
- The Telegram account source can read a Telegram folder (`config.folder`): every channel
  and group in it, refreshed every half hour; private dialogs are never read.
  `radar telegram chats --folder <title>` shows what the folder holds and lists the folders.
- The new-source form explains each type and offers only the types it can fill; career
  pages, sitemaps and international APIs come from the presets.

## 0.22.0

- The openradar index (`/research/index`, `.json`, `.csv`): new Russian-language
  vacancies and orders a day on a fixed panel of boards (vacancies: hh.ru, Хабр Карьера,
  getmatch, Работа России; orders: Kwork, FL.ru, Freelancehunt), as a seven-day mean against
  a base of 100. The base is 2-29 November 2026; until it is over it is provisional, every
  day since 27 October. Roles with three vacancies a day in the base get an index of their
  own. Sources added later never enter it.
- Daily counts by type, platform, role and scope are saved in `research_daily` once a day is
  over (the last two days are redone); `radar research daily --from <day>` redoes them.
- The live report reads only the head of company career-page posts and up to 200 000 posts,
  so a month of the wider flow fits.

## 0.21.2

- The getmatch preset lost the backslash of its URL pattern and matched nothing; it is a raw
  string now, with a test. Sources added from the old preset need the pattern fixed.

## 0.21.1

- The name is written openradar, in lowercase, across the site, the reports, the extension
  and the docs (docs/BRAND.md).

## 0.21.0

- A `sitemap` source: vacancy pages listed in a site's sitemap, read through their
  schema.org JobPosting markup, the newest first and a few per poll with a pause between
  pages. When the markup holds only a line, the page description (often with the pay) joins
  the text. For boards with no feed whose API is closed to robots.
- getmatch.ru preset on top of it.

## 0.20.0

- Company career pages: a new `ats` source reads the public job-board APIs of Greenhouse,
  Lever and Ashby (no key). One source holds a list of companies of one system and reads a
  few of them per poll in turn; only postings of the last `maxAgeDays` (30) enter. Ashby and
  Lever salary ranges come along. Three presets with 111 verified company boards.
- Research: the main figures describe the Russian-language market (posts written mostly in
  Cyrillic). English-language vacancies are counted apart in the international section, so
  thousands of foreign company jobs do not shift the shares, roles or employer lists. The
  dataset gains a `scope` column; the methodology explains the split and the model check.

## 0.19.0

- Sources can go through a proxy one by one: `config.proxy: true` sends every fetch of the
  poll through `RADAR_PROXY_URL` (an HTTP CONNECT proxy; Tor's HTTPTunnelPort works), or
  `config.proxyUrl` names a proxy of its own. Boards reachable directly stay direct.
- The Telegram account source connects through `RADAR_TELEGRAM_PROXY` (SOCKS5, HTTP, or an
  MTProxy link) on hosts where Telegram is blocked.

## 0.18.0

- Public feeds (`/`, `/api/leads`, `/feed.rss`, `/api/delta`) are limited to 120 requests a
  minute per client, so a scraper loop cannot pin the database on a node without a proxy
  limit.
- `/health` also reports `enabledSources` (the sources actually polled) and `last24h`.

## 0.17.1

- GigaChat requests from the hub and the CLI went through the global fetch, which does not
  trust the Russian root CA, and all failed with "fetch failed". They now use the GigaChat
  TLS client unless a test substitutes its own fetch.

## 0.17.0

- GigaChat for model extraction: `RADAR_EXTRACT_PROVIDER=gigachat` with `GIGACHAT_AUTH_KEY`.
  The 30-minute token is cached; the Russian Trusted Root CA is trusted only for GigaChat
  requests. Default model GigaChat-2-Pro, one request at a time.
- Shadow mode: model answers are saved but stay out of the figures until
  `RADAR_EXTRACT_APPLY=true`.
- `radar research check` compares the model with the rules where both answer (role, grade,
  pay) and says when agreement reaches 85% on 30+ comparisons; `research extract --calibrate`
  sends posts whose pay is known first.

## 0.16.0

- Foreign sources, queue one: Remotive (official keyless API), Arbeitnow (official
  keyless API, Germany/EU) and the monthly Hacker News "Who is hiring?" thread through
  the official Algolia API (top-level comments only), plus presets for the verified
  feeds of Himalayas, Jobspresso, CryptoJobsList and RemoteWorker UK. Every adapter
  declares access and risks and ships with a fixture and a test.
- Currency detection and USD-normalised rates for PLN, CHF, AUD and CAD, so
  international pay is detected, converted and filterable.
- `src/version.ts` tracks `package.json` again: the hub reported 0.12.0 while
  shipping 0.15.0.

## 0.15.0

- Model extraction for the research reports. With `RADAR_EXTRACT_ENABLED=true` and an
  OpenAI-compatible API key, a language model reads posts in batches (up to
  `RADAR_EXTRACT_PER_HOUR`, newest and those without pay first) and returns pay, role,
  grade, language, city and employer as strict JSON (`metadata.model`). The answer is
  checked field by field; page markup, the rules and the board's budget always win, and
  answers below 70% confidence are not used. Posts the model is sure are ads, resumes or
  spam are left out of every figure.
- The report shows where the pay came from (page, text, budget, model) and how many posts
  the model left out; the methodology describes the model step.
- `radar research extract --limit 20` runs a batch and prints what the model found;
  `radar research snapshot 2026-10` freezes a month by hand.

## 0.14.1

- A monthly report over a month the base covers only in part names its days:
  «Октябрь 2026 (с 22 октября)», and its quotes say «с 22 по 31 октября 2026 года».

## 0.14.0

- Market research at `/research`: pay in vacancies (roubles per month) and order budgets,
  with medians and quartiles by role, grade, language, city, remote work, skill and AI
  mentions; top employers; weekly dynamics; findings with ready quotes that carry the
  source, the period and the sample size. A figure needs 10 posts with pay, quartiles 20;
  an employer posting the same vacancy many times counts once.
- Role pages `/research/roles/<role>`, the methodology at `/research/methodology`, the live
  report as JSON (`/research/report.json`) and the data as CSV (`/research/dataset.csv`,
  derived fields only, CC BY 4.0). Last month's report is frozen early in the next month
  (`/research/2026-11`, `.json`) and never changes. Private nodes keep the section closed.
- Pay keeps what «от» and «до» mean: a range counts as its middle, one bound as itself.
  Roles, grades, languages and employers come from the title, Хабр tags and the post.
- The closed-post check reads schema.org JobPosting on the pages it already loads and
  stores pay, employer, grade and specialization (`metadata.facts`); leads without pay
  get it from the page.
- Jobicy, We Work Remotely and RemoteOK posts are vacancies; migration 020 fixes older ones.

## 0.13.0

- Search pages: 28 catalog pages instead of 14 (new: WordPress, Битрикс, парсинг,
  нейросети, SEO, PHP, игры, тестирование; vacancies for Python, frontend, DevOps,
  analysts, QA and designers). Each page has a paragraph on what it collects, questions
  and answers, links to related pages and breadcrumbs, with FAQPage, BreadcrumbList and
  ItemList markup. Rows open the lead page on the hub instead of leaving the site.
- New pages: `/catalog` (every category), `/about`, `/faq` and `/llms.txt`. The footer
  links them and shows the first 12 categories.
- Lead pages get a canonical link; closed and expired leads get `noindex`. Vacancy markup
  adds `validThrough` and remote work; orders use `name` and `datePublished`.
- The home page title names what the site is; `/extension` gets a description and a
  canonical link. Sitemap adds the new pages with `lastmod`; robots.txt also closes
  `/admin`, `/me`, `/login` and `/submit`.

## 0.12.0

- New source «Telegram (свой аккаунт)», kind `telegram-account`: reads the channels and
  chats your account is in, private ones included, through MTProto (mtcute). Sign in once
  with `radar telegram login`, keep the session in `RADAR_TELEGRAM_SESSION` (more accounts:
  `RADAR_TELEGRAM_SESSION_<NAME>`), list chats with `radar telegram chats`. Only new
  messages are read; the sender becomes the contact; private chats count as private on
  the hub.

## 0.11.0

- Extension 0.11.0 speaks Russian and English: the browser's language picks one
  (`_locales/`, Russian by default). Context menu items say OpenRadar instead of Radar.
- `/extension` redesigned: numbered install steps, what the extension does, sign-in with
  GitHub up front, your own node as an optional side panel. Long source IDs wrap instead of
  overflowing, and webhook sources are shown only to the operator, not to guests of a
  public hub.
- «Добавить по ссылке» uses the same rounded field as the feed search.

## 0.10.1

- The closed-post check runs on its own and takes up to 20 leads per board each round, so
  a long round no longer delays delivery and one busy board does not crowd out the others.

## 0.10.0

- Closed posts: the node revisits the source page of active leads (Kwork, FL.ru, Habr Career,
  hh.ru by their own closed and archived markers; We Work Remotely, Jobicy, RemoteOK and
  Работа России by 404/410) and closes the lead when the board shows it closed. A closed
  lead leaves the feed; its page stays and says so. `RADAR_CHECK_CLOSED` turns it off.
- Orders leave the feed after 14 days and vacancies after 30 (`RADAR_GIG_TTL_DAYS`,
  `RADAR_JOB_TTL_DAYS`); the market estimate still uses them.
- Response bodies from sources and `/api/preview` are read with a size limit; request bodies
  are limited to 1 MB, 10 MB on ingest and `/v2/events`.
- Kwork signs in once and reuses the token instead of signing in on every poll.
- Polling: 16 sources at once by default, the longest-waiting first, optional
  `config.intervalSec` per source, and a run that outgrows the interval stops starting new
  sources. Delivery, digests and maintenance run on their own loop.
- Rating: confirmations and the 24-hour survival count only for participants with weight
  (≥ 0.2), so a ring of fresh keys earns nothing by confirming itself.
- The outbox no longer overwrites a lead the operator moved along the funnel;
  `/api/delta` filters by time in the database.
- nginx example: `client_max_body_size 10m` and a per-IP request rate.

## 0.9.0

- The extension popup offers a newer version when the hub has one (`GET /api/ext/version`):
  a store install updates in place, an unpacked one gets a link to the download page.
- The `Release` workflow publishes the extension to the Chrome Web Store where the store
  secrets are set. The manifest description fits the store's 132-character limit.

## 0.8.1

- Extension 0.8.1: GitHub sign-in falls back to a regular tab where the browser has no
  `chrome.identity` window; the hub then returns to the extension's own `connected.html`.
- `/extension` shows the current extension version and how to update an unpacked
  install; the docs explain installing, signing in and updating.
- Dependencies: dotenv 18.0.9, imapflow 2.9.1, mailparser 3.12.4; CI and release actions
  on their current major versions.

## 0.8.0

- Releases go to production by pull: `scripts/autodeploy.sh` from cron deploys the newest
  `vX.Y.Z` tag (or a pinned one for rollback) with `deploy-server.sh` from that tag;
  `deploy-server.sh` takes `RADAR_REF`. The SSH deploy workflow is gone, so GitHub holds
  no key to the server. `nginx-radar.conf` became `docs/nginx.example.conf`.
- Dependabot for npm packages and GitHub Actions.
- `/admin` for operators: leads by day for two weeks, sources over the week with errors,
  users, votes, network participants and links to the analytics consoles. Admins sign in
  with GitHub when listed in `RADAR_ADMIN_GITHUB` (numeric ids or logins), or with the token.
- Browser extension 0.8.0: **Войти через GitHub** instead of a server URL, source id and
  token. The hub issues a personal token that can only add leads (stored as SHA-256,
  revoked by **Выйти**) through `/extension/connect` and `/api/ext/*`; leads are signed
  with the GitHub account. Your own node stays available under **Свой узел**.
- Security: the deploy workflow runs only after CI of a push to this repository (a
  fork's pull request from a branch named main could trigger it before), CI and deploy
  tokens are read-only, `deploy-server.sh` takes `RADAR_PUBLIC_URL` from the
  environment, and the docs describe restricting the deploy key to a forced command.
- Test fixtures no longer carry real names, phone numbers or e-mail addresses.
- Optional analytics and search console verification per deployment:
  `RADAR_YANDEX_METRIKA_ID`, `RADAR_GA_ID`, `RADAR_GOOGLE_SITE_VERIFICATION`,
  `RADAR_YANDEX_VERIFICATION` (`/yandex_<code>.html`). The CSP opens only the hosts of
  the counters that are set; without them the site loads nothing third-party.
- README and CONTRIBUTING rewritten.
- All categories: Kwork reads every section, We Work Remotely, Jobicy and RemoteOK
  every job category, Работа России remote work of any profession, and a new hh.ru
  source brings remote project work of any trade (about 500 a day). The score no longer
  penalises non-IT work: the skills dictionary covers design, video, writing,
  translation, ads, marketplaces, accounting, law, teaching and sales.
- Работа России remote source keeps only real remote work: its full-text search also
  matched «удалению» and «не удаленно». Keyword matching normalises Unicode first, so
  «ё» written as «е» + combining diaeresis matches.
- Deploy is skipped without secrets and the uptime check runs only where `UPTIME_URL`
  is set, so forks stay quiet.
- Lead page: copy and share are icon buttons (share uses the system share sheet where
  available), votes without the «Сообщество» label, text formatted into paragraphs,
  lists and links, skill hashtags shown as tags.
- Search: shorter placeholder, popular skills of the week and recent searches in the
  suggestions, «Удалённо» switches the remote filter, partial matches when the whole
  phrase finds nothing.
- «Показать ещё» appends the next page in place.
- Footer: no top rule, «Проект» and «Участвовать» columns, a bottom line with the
  licence and the language switch.
- Public sources page «Откуда заказы»: cards with the board, the part of it that is read,
  today's count and a link to the board; suggest a source or connect a node.
- Market pay estimate: `GET /api/market` returns the median and the 25th-75th
  percentile of pay for similar priced leads over 90 days (title stems and skills,
  wider basis when there are too few), over leads a guest may already see. The browser
  extension (0.7.1) shows it on «Оценить оплату на рынке», compares it with the pay on
  the page and sends only the title, type and skills, on the click.
- Feed: «Показать ещё» paging, a language filter (Russian / English titles), one quiet
  line with today's count and the viewer's delay instead of a banner, the score
  explained on demand, an honest title for delayed viewers; compact intro, one-row
  header and 40 px tap targets on phones.
- Lead page: «Похожие заказы», no duplicated votes row, «Добавлен» only when it differs.
- `/me` profile: tier, delay, linked key rating and how to move up.
- Social preview card (`/og.png`, `og:image`, absolute `og:url`) when `RADAR_PUBLIC_URL` is set.
- `DATA_ENTRY_SCAM` rule: remote data entry for foreign-currency pay.
- The hub's own source is called «Сеть участников» instead of «radar/2 hub».
- English UI strings that were still in Russian.
- Score recalibrated: freshness is no longer part of the stored score (every lead was
  fresh at ingest, so two thirds of the feed scored 65). It now counts USD-normalised
  money on separate ladders for orders and salaries, IT skills, how detailed the post is
  and a direct contact. Median ~58, 80+ for about one lead in twenty. `radar rescore`
  recomputes stored leads and keeps votes.
- Feed filters and sorting: newest, best or highest budget first (the last 7 days),
  budget from, skill, remote only. Same parameters on `/api/leads`, `/feed.rss` and
  `/v2/feed`.
- Ingest kept the budget but dropped the USD-normalised range and payment period;
  they are stored now, and migration 015 fills them for existing leads.
- The score counts dictionary IT skills only: board tags (RemoteOK «senior», «exec»)
  no longer push management and sales vacancies to the top. Budgets show their own
  currency instead of always ₽.
- Leads stored before the currency detector fix as Belarusian roubles («мебель»,
  «белье») are moved back to RUB (migration 017); one of them topped the budget sort.
- Yearly pay from international boards (Jobicy, RemoteOK) is normalised per month: an
  explicit year marker, or a job salary above $25,000 "a month" (migration 016).
- The `JOB_SEEKER` spam rule rejected any vacancy or order mentioning «вакансия» or
  «резюме» (all hh.ru vacancies, «сайт-резюме» orders); it now matches only phrases of
  people looking for work.
- `@font-face`, `@media` and similar code fragments are no longer taken for Telegram
  handles and hidden as contacts; handles are 5-32 characters as in Telegram.
- The logo is a cached `/assets/logo.<hash>.svg` painted through a CSS mask instead of a
  14 KB path inlined three times per page.
- `deploy-server.sh` defaults back to `/opt/radar` and port 8787; the deploy workflow
  passes the server directory from the `DEPLOY_DIR` repository variable.
- Hub for guests: no node-internal statuses or rejected leads outside the admin view, a
  "what is this and how to join" block, score explained, HTML 404, footer cleaned up,
  public sources page without raw errors and misleading counters.
- SEO: lead pages are allowed in robots.txt and listed in the sitemap (what a guest may
  open); www and http redirect to https://openradar.fun (nginx-radar.conf).
- The stylesheet is served from a content-hashed `/assets/app.<hash>.css` with a one-year
  cache instead of being inlined in every page.
- `outbox_events` dropped (migration 014): it was written on every change and never read.
- Presets: HeadHunter through its RSS (works from data-center IPs, unlike the Open API),
  Freelancehunt and Jobicy added.
- `Uptime` workflow checks https://openradar.fun/health every 15 minutes.
- `radar serve` without `RADAR_ADMIN_TOKEN` prints a one-off admin token instead of
  leaving the dashboard without a way to sign in; `/login` no longer redirects in a loop
  when sign-in is not configured.
- The server listens on `127.0.0.1` by default (`RADAR_BIND`); the Docker image sets
  `0.0.0.0`. Before, it listened on all interfaces while printing 127.0.0.1.
- Loading the preset sources polls them right away, so a fresh node shows leads in
  seconds instead of after the first scheduler tick.
- `deploy-server.sh` no longer lets `docker compose exec` swallow the rest of the script
  when piped over SSH.
- Docs: `docs/GETTING_STARTED.md` with user scenarios, README quick start fixed, stale
  screenshots, contributors and publishing notes replaced.

## 0.7.0: radar/2

### Phase 3: rating, moderation, sharing and SDKs

- Rating ledger (`rating_ledger`, migration 013): points per lead for the first observer
  (x1.5 private channel, x1.5 for a 6-hour exclusive, half when confirmed by age only),
  confirmers (+0.2, up to three), matching signals (+0.1) and penalties for hidden leads.
  Recomputed hourly in hub mode and on demand; idempotent, confirmation is sticky.
- Tiers from rating: a bare key is a guest; GitHub link or R >= 1 is member; R >= 10
  active; R >= 50 or moderator core.
- Signals weighted by w = min(1, w0 + R/30), w0 = 0.2 for GitHub accounts older than
  90 days. Web votes are mirrored into signals as `web:<user id>`; raw votes no longer
  hide leads. Order of decisions: moderator, scam contact flag, author status, signals.
- Moderation API: lead decisions, scam contact flags (hide current and future leads),
  key bans, manual recompute. `/v2/me` shows rating and ledger; `/v2/link/github`.
- Node -> hub: `hub` sink for sources with `share` (`radar source share <id>`, source
  form), signed with `RADAR_NODE_KEY` (`radar key`) and sent to `RADAR_HUB_URL`, retried
  by the outbox. Sinks can filter leads with `accepts(lead, source)`.
- SDKs: Python (`sdk/python`, standard library only, BIP-340 checked against the BIP
  vectors, Telethon / Pyrogram helpers) and TypeScript (`HubClient`, `NodeClient`,
  protocol builders exported from the package). CI runs the Python tests.
- Versions: package 0.7.0, extension 0.7.0 (`extension.zip` rebuilt without X-Ray).

### Phase 2: the hub

- `RADAR_MODE=hub`: signed radar/2 events (`src/net/protocol.ts`, kinds 4040 observation,
  4041 signal, 4042 post status, 30440 profile) at `POST /v2/events`, up to 500 per request.
  Observations go through the normal ingest under the built-in `radar2-hub` source; every
  observation is kept with its participant key, channel and first/archived flags.
- Merge rules 1-4 of the protocol: post key, canonical URL, shared contact + J >= 0.6 over
  14 days, J >= 0.85 over 7 days (in-process sketch index). Contacts of later
  observations are merged into the lead.
- HTTP auth after NIP-98 (`Authorization: Nostr <event>`): bound to URL, method and body
  hash, +-60 s, single use. Participants are members; `RADAR_MODERATORS` are core.
- Reading: `/v2/feed` (cursor, JSON or NDJSON), `/v2/stream` (SSE), `/v2/leads/:id`
  with observations and signal counts, `/v2/contacts/:value` (author history), `/v2/me`.
- Migration 012: `participants`, `events`, `observations`, `signals`, `auth_replay`.

### Phase 1: observations on a node

- `radar/2.observation` schema (`src/core/observation.ts`): any parser, including one
  reading private Telegram channels through its own account, sends posts with source
  (platform, channel, visibility, message id), author contacts, budget and skills.
- `POST /api/v2/ingest/:sourceId`: up to 500 observations per request as a JSON array,
  `{observations: [...]}` or NDJSON, with an outcome per item.
- `radar push --source <id> [--url <node> --token <t>]`: NDJSON from stdin into the
  local store or a remote node.
- Lead merging: the same post (platform + channel + message id) is one lead; a cross-post
  that shares a contact and has MinHash similarity >= 0.6 within 14 days is a duplicate.
- Migration 011: `leads.contacts_json`, `source_*` columns and the `lead_contacts` index.
- Lead pages show contacts (as safe links) and the channel; guests on the hub get a
  sign-in link instead of contacts. Stored text limit raised to 20 000 characters.

### Phase 0: cleanup and hardening

- Removed the commercial layer and the radar/1 mesh: B2B firehose, X-Ray, AI arbiter
  and slashing, canary traps, HRW sharding, per-week child keys, Nostr relay pool and
  subscriber, access-tier engine, reputation module, `radar node`.
  Migration 010 drops `mesh_nodes`, `lead_attestations`, `arbiter_queue` and the mesh
  columns of `leads`; lead visibility is one `state` column.
- Access model: the viewer tier (admin, member, guest; hub tiers follow) sets the feed
  delay (`RADAR_MODE=hub`, `RADAR_TIER_DELAYS`); a self-hosted node has no delay.
  Guests never see contacts (text, author, metadata) on pages, API, RSS, catalog or MCP.
  `/leads/:id` honours the delay and hidden states.
- Contacts are kept in the text (no scrubbing) and extracted into structured, normalised
  values (`src/core/contacts.ts`).
- Security: JSON-LD on lead pages is escaped (stored XSS); author, city and category are
  cleaned to plain text; catalog and RSS links are http(s) only; IMAP passwords come only
  from `RADAR_IMAP_*` variables over TLS; links and OAuth redirects use `RADAR_PUBLIC_URL`
  instead of the Host header; CSV export neutralises formulas; ILIKE wildcards in search
  are literal; the published example admin token is refused at startup.
- docker-compose requires real secrets; `backup.sh` no longer corrupts dumps (`-t`
  removed) and verifies them with `pg_restore --list`; nginx streams `/v2/stream`.
- MCP rewritten over the feed (same delay and contact rules), notifications are not
  answered, `verify_lead_url` removed.
- Tests are hermetic (DNS stubbed in `test/setup.ts`, local proxy target).
- Not yet fixed: SSRF filter hardening, to be replaced by a maintained library.

## 0.6.0

- Real BIP-340 Schnorr via @noble/curves (hand-rolled ECDSA-as-Schnorr removed);
  radar/1 events are verifiable by standard Nostr relays.
- Extension signing requires a NIP-07 signer (pseudo-signature fallback removed).
- `/mcp` authorization (admin token or mesh node key); arbiter never kills leads
  on network errors; GitHub users map to the realtime tier; mesh metadata is
  persisted in insertLead; `RADAR_MESH_ENABLED` wires the full mesh runtime.

## 0.5.0

- Mesh layer: radar/1 Nostr protocol events, MinHash sketches, Web-of-Trust with
  GitHub NIP-39 verification, relay pool and `radar node` CLI, relay subscriber
  with Tit-for-Tat 12h lag, canary traps, AI arbiter with slashing, HRW
  sharding, MCP server, B2B firehose (SSE), X-Ray salary analytics, extension
  crypto module. (Note: the BIP-340 implementation shipped here was ECDSA-based
  and fixed in 0.6.0.)

## 0.6.1

- `RADAR_PROXY_URL` (or per-source `config.proxyUrl`): outbound HTTP/SOCKS proxy
  via undici ProxyAgent with manual redirect revalidation — unblocks Telegram
  t.me preview sources on hosts where Telegram is network-blocked.

## 0.4.3

- Kwork adapter: closed-API mode. When `RADAR_KWORK_LOGIN` / `RADAR_KWORK_PASSWORD`
  are set, it signs in through the Kwork mobile API (signIn -> token -> POST /projects,
  the same protocol as pykwork/kwork-api) and reads stable JSON instead of page markup.
  Falls back to the anonymous page-state parser (and to the API on the next poll if
  a single API run fails).

## 0.4.2

- Growth layer: search-driven SEO landing pages (`/catalog/:slug`, 10 pages like
  "Заказы на разработку"), `robots.txt` and `sitemap.xml`; every landing doubles
  as an RSS subscription with feed auto-discovery.
- Telegram digest: top fresh leads sent to `RADAR_DIGEST_CHAT_ID` every
  `RADAR_DIGEST_INTERVAL_HOURS` (default 6) via the existing bot token.
- Stored lead text is capped at 3000 chars (new leads + migration 007 backfill),
  and `sanitizePrivacy` is applied centrally in `prepareRawLead` so phone/email
  from any source or submission never reach the public base (152-ФЗ).
- Lead type heuristics: URLs/titles like Habr Career vacancies are typed `job`;
  migration 007 backfills historical rows, so the "Вакансии" tab is no longer
  limited to RemoteOK.

## 0.4.1

- CI runs the suite twice: against the in-memory store and against a real PostgreSQL 17 + pgvector service (`RADAR_TEST_STORE=postgres`, per-test schema reset via `test/postgres-setup.ts`).
- Fixed in PostgresStore by that new coverage: `insertLead` did not store the lead `type` (the job/gig filter silently returned only gigs in production), and `getSourceHealth` returned `successRate` as a fraction while the UI and the memory store use percent.
- Salary extraction from free text is now anchored to a currency unit or a marker word ("оклад", "вилка"): "3 - 5 лет опыта" no longer becomes a salary range (`extractAnchoredSalary`).
- Added migration `006_search_trgm.sql`: pg_trgm GIN indexes on `title` and `text` so the ILIKE search fallback stops doing sequential scans.
- Rate limiting on sensitive endpoints (login, votes, submit, preview, ingest), a `Content-Security-Policy` header, and hourly purging of expired sessions alongside the other maintenance cleanups.

## 0.4.0

- GitHub OAuth login (`/auth/github`): voting and lead submission via `/submit` now require a registered user; anonymous visitors can browse.
- Votes are stored per user in `lead_votes` (one vote per signal, weight 1.0); client-supplied `weight`/`reputation` was removed from the vote API until the reputation engine ships.
- The lead funnel (statuses and `+10/-20` feedback) is admin-only again.
- Security fixes: `/api/preview` fetches through the SSRF-guarded client with DNS checks on every redirect hop; the RSS feed escapes `]]>` inside CDATA; a duplicate `external_id` no longer aborts the whole poll run.
- Added migration `005_github_auth.sql` (`sessions.user_id`).

## 0.3.0

- Product UI: separate Leads and Sources pages, a lead detail page, search and status filters.
- Source editing: title, filters and connection settings can be changed without recreating the source.
- Rejected leads are sorted below actionable ones.
- Cleaner first-run and empty states; monochrome layout with a consistent top navigation.
- Lead rows link to an internal detail view with full text, score and delivery status.
- Updated screenshots and README.

## 0.2.3

- The dashboard, source page, login and extension popup are fully monochrome.
- Status is conveyed by filled, ring and muted dots instead of colour.
- Updated screenshots.

## 0.2.2

- The admin session cookie is marked `Secure` when the request arrives over HTTPS.
- Test deployment behind nginx with `X-Forwarded-Proto`.

## 0.2.1

- Sources can be added, enabled, disabled and deleted from the dashboard.
- New source form covers RSS, Telegram, Kwork, IMAP and webhook; webhook tokens are shown once.
- Updated CI actions to checkout v7, setup-node v7 and pnpm/action-setup v6.
- Added tests for the dashboard source flow.

## 0.2.0

- Added an IMAP source for job-alert emails; credentials stay in an environment variable.
- Added per-source health: 24-hour counters, success rate, last run and a `/sources/:id` page.
- Added a Manifest V3 browser extension that sends a page or selection to a webhook source.
- Redesigned the dashboard and source page: fewer blocks, one accent, no cards or shadows.
- Added `--token` for webhook sources and automatic token generation.
- Added the `defineSource` / `defineSink` SDK helpers and `docs/PLUGINS.md`.
- Added CI, `SECURITY.md`, `PUBLISHING.md` and the extension guide.

## 0.1.0

- Initial MVP: RSS, Telegram public, Kwork and webhook sources.
- SQLite store, deduplication, spam rules, scoring.
- Console, Telegram and webhook sinks.
- CLI, HTTP API, server-rendered dashboard.
- 28 tests and a Dockerfile.
