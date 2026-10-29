# Changelog

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
