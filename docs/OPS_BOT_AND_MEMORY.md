# Ops runbook: bot traffic and database memory on the production hub

Living document for the openradar.fun VPS (5.8 GiB RAM, `radar_app` 2 GiB,
`radar_postgres` 3 GiB cgroup limits). Every number here was measured on the box,
and every knob has a source. Written 2026-11-15 after a day of PostgreSQL OOM
kills (83 cumulative `oom_kill` events) driven by AI-crawler waves.

## 1. What actually happens under load

Measured on 2026-11-15 (nginx access log, one day):

| Class | Requests/day | Notes |
| --- | --- | --- |
| Browsers (people) | ~17 200 | must never be throttled below comfort |
| ClaudeBot | ~7 600 | bursty: up to ~950/h |
| PerplexityBot | ~7 200 | waves: 5 624 in one hour (~1.6 r/s) |
| ElevenlabsCrawler | ~6 200 | no published IP list |
| SemrushBot + MJ12bot | ~4 900 | SEO tools, zero user value |
| GPTBot | ~2 700 | |
| Reflectionbot, Amazonbot, Applebot, CCBot… | ~3 100 | |
| Googlebot / bingbot / YandexBot | ~330 | **never throttle these** |

~60% of all requests are bots. On `/leads/*` and feed/search URLs the AI share is
16 285 of ~30 600 hits. Each uncached page costs a BM25/TopK query; several in
parallel pushed the postgres cgroup over 3 GiB and the kernel OOM-killer shot a
random backend — `pg_dump` included.

Two distinct memory problems, both real:

1. **Per-query spikes.** ParadeDB TopK collects up to `max_topk_chunk_size` rows
   per chunk (default 100 000; lowered to 10 000 on 2026-11-15). Parallel waves
   multiply this.
2. **The idle-backend ratchet.** A pg_search backend that ran one heavy search
   keeps its Tantivy reader caches and allocator high-water mark for the life of
   the connection. Measured: one *idle* backend holding **1.2 GiB RSS**, siblings
   150–220 MiB each. The pool never recycled connections, so the ratchet only
   grew. This is the same effect documented for catalog caches and allocators
   (see sources) — the fix is connection recycling, not a bigger limit.

## 2. The defense, layer by layer

The principle (Nerdulator's crawler-load write-up, BOA's AI crawler policy,
Google's own guidance): **give each crawler family a budget at the edge, answer
429 + Retry-After, keep people and search engines untouched, and make every
request that does get through cheap.** Blocking (403) removes you from AI search
results; a polite 429 slows the crawler down and keeps the content indexed.

### Layer 1 — nginx: per-vendor budgets (`/etc/nginx/conf.d/openradar-bots.conf`)

* Classification by **UA token**, not vendor name: `GPTBot` (training) and
  `OAI-SearchBot` (search) and `ChatGPT-User` (user-triggered) are different
  classes with different budgets. Same for Claude and Perplexity.
* Zones are keyed by **vendor constant**, not IP: a crawler fans out over many
  IPs (Perplexity uses the whole `18.97.9.x` range), so per-IP limits never bite
  the aggregate. One bucket per vendor caps its total rate; an empty key is not
  counted, so people are not touched by these zones.
* Budgets (from measured traffic, with headroom):
  * AI search crawlers (OAI-SearchBot, Claude-SearchBot, PerplexityBot): 2 r/s,
    burst 20 — a wave is slowed, indexing continues.
  * Training crawlers (GPTBot, ClaudeBot, CCBot, Bytespider, meta-externalagent,
    Amazonbot, ElevenlabsCrawler, Reflectionbot…): 30 r/m, burst 10.
  * SEO tools (SemrushBot, AhrefsBot, MJ12bot, DotBot, BLEXBot…): 6 r/m, burst 3.
  * User-triggered fetchers (ChatGPT-User, Claude-User, Perplexity-User): 5 r/s —
    a real person is waiting on the other side.
  * Googlebot/bingbot/YandexBot: **no zone at all**. Google documents 429 as an
    emergency valve only; steady-state throttling of Googlebot costs indexing.
* Over budget → `429` with `Retry-After: 60` (RFC 6585/9110), never 503 (that
  reads as "site down" and, on robots.txt, as "disallow everything" per RFC 9309).
* `/robots.txt`, `/health`, static assets and ACME are exempt.
* The existing per-IP zone (`openradar_pages`, 10 r/s burst 60) stays as the
  backstop for spoofed/unknown UAs; humans sit far below it.
* `limit_req_dry_run on` is the safe rollout switch: nginx logs what *would* be
  limited without limiting. We ran dry-run first, checked the log, then enabled.

### Layer 2 — nginx: make crawler hits cheap (microcache)

Crawlers re-fetch the same lead cards and the same feed pages; the app renders
them per viewer tier, but **anonymous** content is identical for everyone
without a session. So:

* `proxy_cache` (500 MB, `/var/cache/nginx/openradar`) for **anonymous GETs** on
  HTML pages (feed + lead cards), `/sitemap.xml` and public JSON that the app
  marks `Cache-Control: public`: 60 s TTL, `proxy_cache_lock` (one upstream fetch
  per cold URL — kills the thundering herd), `proxy_cache_background_update` +
  `use_stale updating error timeout` (a crawler wave during a DB hiccup gets
  stale pages, not 500s). `robots.txt` is deliberately **not** cached (RFC 9309:
  a stale/4xx robots reads as "no rules" / "disallow all").
* **Read and write are different decisions.** `proxy_cache_bypass` (read) is
  evaluated *before* the upstream answers, so it may only use request-side facts
  (method + no session/Authorization/x-radar-token). `proxy_no_cache` (write) is
  evaluated *after* and additionally requires the app to say `public`. Putting
  `$upstream_http_cache_control` into the bypass map makes the cache fill up and
  **never hit** — that bug was caught in review, not in production.
* The cache key is `$scheme$host$request_uri:$radar_lang`: the language bucket
  mirrors `resolveLang` (the `openradar_lang` cookie, else Accept-Language →
  ru/en). On top, nginx honours the app's `Vary: Accept-Language, Cookie,
  Accept-Encoding` and stores per-header variants, so gzip/identity and cookie
  states can never mix. Session/Authorization/token requests bypass entirely —
  no logged-in page is ever stored, no cross-user leakage, no cloaking (bots and
  anonymous people share one cache; content never varies by user-agent).
* Only 200/301/302/404 are cached (404 briefly, 30 s); 5xx never. Responses with
  `Set-Cookie` (e.g. `?lang=` switches, login) are never stored by nginx itself.
* `X-Cache-Status` header + a dedicated log line make hit rate measurable.
* `limit_req_status 429` is set at **server** level, not http: a shared box may
  already define it (ours does, in `security.conf`); a duplicate http-level
  directive fails `nginx -t`.

Honest limit (measured by Nerdulator on their site): crawlers that walk *unique*
URLs get little from a cache. That is why Layer 1 (budgets) is the primary
defense and the cache is the multiplier for the repeat traffic we do see
(lead cards are fetched by several vendors each).

### Layer 3 — the app: bounded, recycled database work (v0.69.0)

* **Connection recycling** (`src/store/postgres.ts`): every pooled connection is
  retired after `RADAR_PG_CONN_MAX_AGE_SEC` (default 1800 s) or
  `RADAR_PG_CONN_MAX_USES` (default 500) queries, whichever comes first. This is
  the only reliable way to hand the Tantivy/allocator high-water memory back to
  the OS (DBExplore, Tantivy #2481). Cost: one fork per connection per half hour.
* **Web statement timeout**: requests get `SET LOCAL statement_timeout` (default
  15 s) inside their transaction; a runaway BM25 query dies alone instead of
  eating memory until the OOM-killer picks a victim. Background jobs keep the
  role-level timeout. `SET LOCAL` never leaks to the next borrower of a pooled
  connection (ZeroExp pattern).
* **Lead-card cache**: anonymous `/leads/:id` HTML is cached in-process for 60 s
  (same content the nginx cache serves; this protects the origin when nginx is
  bypassed, e.g. the nip.io test host). Logged-in views are never cached.
* Existing app rate limits (`RADAR_FEED_RATE_PER_MIN` etc.) stay as the last
  in-process backstop.

### Layer 4 — PostgreSQL/ParadeDB: budgets that fail one query, not the server

Applied via `ALTER DATABASE radar SET` (persistent, survives restarts; no
restart needed — new sessions pick them up):

| Setting | Was | Now | Why |
| --- | --- | --- | --- |
| `paradedb.max_topk_chunk_size` | 100 000 | **10 000** | 10× smaller TopK chunks; identical results, more chunks (ParadeDB docs) |
| `work_mem` | 2 MB | **16 MB** | fewer 2 MB-sort spills (6.9 GB temp files/day measured); still bounded: 40 conns × a few ops × 16 MB ≪ 3 GiB |
| `hash_mem_multiplier` | 2 | **2** (kept) | standard |
| `paradedb.spill_to_disk` | off | **on** | eligible join/aggregate scans spill through PG BufFile instead of erroring; respects `temp_file_limit` (ParadeDB 0.26 memory.rs) |
| `temp_file_limit` | unlimited | **2 GB** | a spilling query can fill the disk; cap it per session |
| `statement_timeout` (role `radar`) | 0 | **120 s** | backstop for background jobs; web requests use the tighter SET LOCAL |
| `idle_in_transaction_session_timeout` | 0 | **60 s** | a stuck transaction holds locks and memory |
| `idle_session_timeout` | 0 | **10 min** | server-side belt to the pool's recycling suspenders |
| `max_parallel_workers_per_gather` | 2 | **1** | halves the parallel memory multiplier on a 2-vCPU box |
| `log_temp_files` | -1 | **0** | every spill is logged: the early-warning signal for memory pressure |

Deliberately **not** raised: `shared_buffers` (128 MB) and the 3 GiB cgroup limit.
The Field Guide rule: derive config from the cgroup limit and leave headroom;
raising the limit without fixing the unbounded consumer just moves the crash.
With recycling + budgets the working set fits; revisit only with measurements.

## 3. Rollout order (what was done, in order)

1. Measure (logs, GUCs, RSS, `memory.events`) — this file's numbers.
2. App release with recycling + timeouts + card cache (tests green, CI, deploy).
3. `ALTER DATABASE` budgets (instant, no restart; pool recycling picks them up).
4. nginx dry-run → verify `limit_req` dry-run log → enable + microcache.
5. Watch: `memory.events oom_kill` must stay flat; `X-Cache-Status` hit rate;
   429 share per vendor; Googlebot still 200; p95 page latency.

## 4. Monitoring commands

```bash
# OOM kills (must not grow)
CID=$(docker inspect radar_postgres --format '{{.Id}}')
cat /sys/fs/cgroup/system.slice/docker-$CID.scope/memory.events

# Backend RSS ratchet (idle backends should stay small now)
ps -eo rss,pid,args --sort=-rss | grep 'postgres: radar' | head

# What the limiter would do / does (dry-run logs "limiting requests ... dry run")
tail -f /var/log/nginx/error.log | grep limit_req

# Cache hit rate
awk '{print $NF}' /var/log/nginx/openradar-cache.log | sort | uniq -c

# Per-vendor status codes (are search bots still getting 200?)
awk -F'"' '{ua=$6; split($1,a," "); if (ua ~ /PerplexityBot/) print a[9]}' /var/log/nginx/access.log | sort | uniq -c

# Spills (early warning)
docker exec radar_postgres psql -U radar -d radar -c \
  "SELECT datname, temp_files, pg_size_pretty(temp_bytes) FROM pg_stat_database WHERE datname='radar';"
```

## 5. Sources (checked 2026-11-15)

* nginx `limit_req` / `proxy_cache` official docs (empty key not counted;
  `use_stale updating`, `proxy_cache_lock`, dry-run since 1.17.1).
* [Crawlito: Rate limit AI crawlers without locking out AI search](https://crawlito.com/blog/rate-limiting-ai-crawlers) — per-class budgets, 429 vs 403/503 semantics, robots.txt exemption (RFC 9309).
* [agenticwebscore: Retry-After and 429 for AI crawlers](https://agenticwebscore.com/learn/retry-after-429-ai-crawlers) — measured crawler behaviour on 429; Google's 1–2-day emergency-valve guidance.
* [BOA AI crawler policy](https://docs.boa.io/operating/nginx-internals/ai-crawler-policy) — per-vendor (not per-IP) keys; UA-token classification.
* [Nerdulator: What Happened When Crawlers Found Nerdulator](https://nerdulator.com/engineering/crawler-load) — Sept 2026 incident; cache hit-rate reality on unique-URL crawls; boundary-first fix.
* [jalvo.eu: Rate Limit Bots in nginx Without Slowing Googlebot](https://jalvo.eu/rate-limit-bots-without-slowing-googlebot/) and [Reverse Proxy Caching SEO](https://jalvo.eu/reverse-proxy-caching-seo/) — verified-IP exemption, no cloaking, per-status cache TTLs.
* Official crawler IP lists (for future verified-IP exemption): Google `common-crawlers.json`, Bing `bingbot.json`, OpenAI `gptbot.json`/`searchbot.json`/`chatgpt-user.json`, Perplexity `perplexitybot.json`, Anthropic `claude.com/crawling/bots.json`.
* [ParadeDB configuration reference](https://www.paradedb.com/docs/reference/configuration) + pg_search 0.26.x source (`gucs.rs`, `datafusion/memory.rs`, `top_k.rs`): TopK chunking, work_mem clamping (15 MB…1 GB Tantivy), spill_to_disk via BufFile.
* [paradedb#5334](https://github.com/paradedb/paradedb/issues/5334) — MPP aggregate OOM panic history; why bounded budgets + spill matter on 0.26.5.
* [PostgreSQL 18 docs, Resource Consumption](https://www.postgresql.org/docs/current/runtime-config-resource.html) — work_mem is per operation; hash multiplier; temp_file_limit.
* [PostgreSQL Field Guide: container memory & OOM](https://pg.edu.rich/en/docs/operations/container-memory-oom) — derive config from cgroup limit; don't just raise the limit.
* [PlanetScale database-skills: memory management ops](https://raw.githubusercontent.com/planetscale/database-skills/main/skills/postgres/references/memory-management-ops.md) — multiplication math, recycle connections, monitor temp_blks.
* [DBExplore: Do idle connections use memory?](https://www.dbexplore.com/faq/do-idle-connections-use-memory/) + [Eight Kilobytes: backend memory](https://www.flagon.io/books/eight-kilobytes/buffers) + [tantivy#2481](https://github.com/quickwit-oss/tantivy/issues/2481) — the idle-backend ratchet; recycling as the fix.
* [ZeroExp: statement_timeout per role and per request](https://zeroexp.dev/library/postgres-statement-timeout-role) — SET LOCAL on pooled connections.
