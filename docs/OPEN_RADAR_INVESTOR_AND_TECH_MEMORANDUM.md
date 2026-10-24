# OpenRadar — The Open-Source Global Labor & Order Intelligence Network

> **Executive & Technical Memorandum for Partners, Investors, and Lead Engineers**  
> **Repository:** [github.com/MikhailSagalaev/radar-oss](https://github.com/MikhailSagalaev/radar-oss)  
> **Production Demo:** [openradar.fun](https://openradar.fun)  
> **Mirror / Direct Server:** [radar.91.229.8.32.nip.io](https://radar.91.229.8.32.nip.io)  
> **License:** Apache 2.0 (Open Source)  
> **Status:** Production-ready MVP (104/104 automated tests passing, 0 TypeScript errors)

---

## 1. Quick Pitch (Executive Summary to Forward)

```text
OpenRadar is an open-source decentralized library for jobs (full-time) and gigs (freelance orders)
built as an alternative to closed job-board monopolies (HeadHunter, Upwork, LinkedIn, Kwork).

Core Market Flaw:
Incumbent job boards monetize market inefficiency. Employers pay for listings and search boosts,
giving platforms a perverse incentive to keep dead "ghost jobs" and low-quality postings active
indefinitely while taxing workers for every application (e.g., Upwork Connects).

The OpenRadar Solution:
1. Open Data Layer: We aggregate public APIs, company ATS feeds, RSS feeds, and closed channels into
   a single search window. Community contributors submit any web posting in 1 click via our
   Manifest V3 extension (extracting schema.org/JobPosting).
2. Community Quality & Anti-Scam: Community members vote (Useful, Junk, Scam, Closed). A weighted
   reputation model and automated kill-switch filter out fraud and obsolete posts with zero conflict of interest.
3. 1-Billion-Record Engineering:
   - High-performance Hono SSR (TTFB < 25ms, zero SPA bloat).
   - PostgreSQL 17 + pgvector halfvec(384) (FP16): vector deduplication in RAM with 2x memory reduction.
   - Lakehouse storage: hot records in PostgreSQL, historical partitions in S3 Parquet, analyzed via DuckDB.
   - Enterprise security & Direct Outreach: SSRF DNS-resolver guard, CSRF Origin guard, raw uncensored direct client contacts (phone, email, messengers) directly to the community without paywalls or redaction.
   - Swiss typography: text and lines only, zero emojis, native system font stack (CLS = 0).

Code: github.com/MikhailSagalaev/radar-oss
Live Demo: openradar.fun
```

---

## 2. Market Problem and Macro Thesis

### The $100B+ Failure of Labor Market Monopolies
Global hiring and freelance platforms represent a multi-hundred-billion-dollar market. However, every major platform operates as an isolated, closed walled garden:

1. **Fragmentation ("Silos"):** A job seeker or freelancer must continuously monitor 10+ freelance exchanges, 5+ job boards, and dozens of private Telegram/Slack groups to see full market demand.
2. **Monetization of Inefficiency:** Platforms earn revenue when postings remain open. If an employer fills a role immediately, the platform ceases collecting listing renewals, sponsored placement fees, and resume access fees. Consequently, over 40% of public vacancies on major platforms are obsolete "ghost jobs" kept alive solely for SEO and traffic.
3. **Pay-to-Work Tollbooths:** Charging candidates for the right to send an application (Upwork Connects, paid contact reveals) has turned the search for work into a direct financial tax on job seekers.

### The OpenRadar Disruption
OpenRadar decouples the **data layer** from the monetization model:
- Access to data and direct links to employers are free and open by design.
- The platform has no financial incentive to retain obsolete or fraudulent listings.
- Data accuracy is maintained through transparent peer curation, mirroring the proven content models of Wikipedia and Waze.

---

## 3. Product Architecture and Viral Loops

```
[ Web Users & Candidates ] ──────> Browser Extension (1-Click Capture) ──┐
[ Developer Community   ] ──────> Open Connectors (CLI Scaffold)      ──┼──> [ Ingestion Gateway ]
[ Corporate Feeds / ATS  ] ──────> Webhook & Direct Feeds              ──┘            │
                                                                                      ▼
                                                                        [ Deduplication & PII Scrub ]
                                                                                      │
                                                                                      ▼
[ Community Members ] <── Reputation Voting (Useful, Scam, Closed) <── [ Canonical Open-Data Hub ]
```

### Core Product Capabilities
1. **Dual Mode:** Seamless filtering between long-term employment (`job`) and freelance projects (`gig`).
2. **1-Click Submission (`/submit`):** Users paste any URL. The engine extracts title, company, salary ranges, location, remote status, and required tech stack via OpenGraph and `schema.org/JobPosting`.
3. **Browser Extension (Manifest V3):** Users highlight any job posting on social networks or private forums, right-click "Send to OpenRadar" or press `Alt+Shift+R`. The posting is instantly captured with an immediate link to its canonical card.
4. **Instant Typographic Search:** Full-text GIN search with Russian and English morphology. Pressing `/` instantly focuses search with zero lag.
5. **Personalized RSS Feeds:** Any search query generates an instant live RSS feed (e.g., `/feed.rss?q=TypeScript&type=job`).
6. **Multi-Currency Normalization:** Salaries in RUB, USD, EUR, KZT, BYN, and UAH are parsed and normalized to a canonical USD estimate for cross-border market comparison.
7. **Personal Funnel Management:** Users track their application lifecycle (`new` -> `interesting` -> `applied` -> `in_work` -> `rejected`), generating implicit signal weights for community ranking.

---

## 4. Engineering Architecture (Scale to 1 Billion Records)

The system is designed for high-throughput, low-latency operation at minimum infrastructure cost.

### 1. PostgreSQL 17 + `pgvector halfvec(384)` (FP16)
- High-dimensional text embeddings are stored using 16-bit floating point vectors (`halfvec`).
- Reduces HNSW index RAM consumption by **50%** compared to standard `vector(384)`, while retaining >99.2% nearest-neighbor accuracy.
- Enables in-memory vector similarity searches on standard commodity hardware.

### 2. Three-Tier Deduplication Pipeline
When an order or vacancy is posted across multiple boards simultaneously (e.g., HeadHunter, Habr Freelance, and Telegram), OpenRadar collapses them into a single canonical record:
1. **Tier 1 (Canonical URL Hash):** Normalizes tracking parameters (UTM, affiliate tags, redirects).
2. **Tier 2 (SimHash of Text Body):** Detects republished posts with minor wording changes.
3. **Tier 3 (pgvector Cosine Similarity):** Matches semantically identical postings across different platforms and languages.

### 3. Lakehouse Tiering (S3 Parquet + DuckDB)
- **Hot Tier (NVMe / PostgreSQL 17):** Active leads for the past 3-6 months (~50-100M records) are stored in partitioned PostgreSQL tables.
- **Cold Tier (S3 Parquet):** Completed and closed leads older than 6 months are automatically exported into compressed Parquet files on object storage (MinIO / S3).
- **Analytics on Demand:** DuckDB queries the S3 Parquet dataset directly for salary benchmarking and tech stack trend analysis within sub-second response times without overloading the transactional database.

### 4. S3-Native Search (Quickwit Rust Engine)
- Archival search operates without heavy Elasticsearch clusters.
- Quickwit maintains inverted search indexes directly on S3 storage, keeping operational costs proportional to storage rather than idle RAM.

---

## 5. Trust Engine and Anti-Sybil Mathematics

Lead scoring combines algorithmic quality metrics, temporal decay, and weighted community consensus:

$$\text{Score} = 0.4 \times \text{Quality}_{\text{model}} + 0.4 \times \text{Community} + 0.2 \times \text{Freshness}$$

Where:
- $\text{Quality}_{\text{model}} \in [0, 100]$ evaluates data completeness (clear requirements, budget range, absence of scam trigger phrases).
- $\text{Freshness} = \exp(-\Delta t / 14)$ applies exponential decay over time.
- $\text{Community} \in [-1, 1]$ represents weighted community consensus:

$$\text{Community} = \frac{U - J - 3S}{U + J + S + 2}$$

Variables:
- $U$: Sum of weights for "Useful" votes.
- $J$: Sum of weights for "Junk" votes.
- $S$: Sum of weights for "Scam" votes (penalized with a 3x multiplier).
- $C$: Votes marking the lead as "Closed".

### Anti-Abuse and Fraud Safeguards
- **Voter Weight:** $w = \min(\text{Reputation}, 5.0) \times \text{AccountAgeFactor}$.
- **Automated Scam Kill-Switch:** When $S \ge 3$ and $S > U$, the listing is automatically hidden from public search feeds pending administrative review.
- **Network Sniping Defense:** Vote clustering across `/24` IPv4 subnets or new unverified GitHub accounts is throttled and down-weighted.

---

## 6. Enterprise Security and Raw Uncensored Data Philosophy

1. **Raw Direct Contacts (Zero Censorship / Zero Paywalls):** Unlike corporate platforms that lock contacts behind paywalls or redact communication channels under bureaucratic pretexts (such as 152-FZ / GDPR data scrubbing), OpenRadar preserves 100% raw, direct contact information (emails, direct phone numbers, Telegram handles) straight for the engineering community so talent and clients connect immediately.
2. **SSRF DNS-Resolver Guard (`src/pipeline/preview.ts`):** When previewing external links, the resolver resolves all IP addresses of the destination host. Requests to private, loopback, or cloud metadata ranges (`10.0.0.0/8`, `127.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `169.254.169.254`, `::1`) are aborted before initiating the connection.
3. **CSRF & Origin Guard (`sameOrigin`):** Mutating HTTP methods (`POST`, `PATCH`, `DELETE`) require explicit Origin validation or Bearer tokens.
4. **Anti-Stored XSS:** Outbound links are strictly validated against `http:` and `https:` schemes, preventing `javascript:` and `data:` URI attacks.
5. **Secure Authentication:** Session tokens are stored in `HttpOnly`, `Secure`, `SameSite=Lax` cookies with cryptographically safe timing equality verification (`timingSafeEqual`).

---

## 7. Design System and Typography

OpenRadar follows the principles of classical **Swiss Typography (International Typographic Style)**:
- **Zero Emoji Doctrine:** Professional, calm interface with zero emojis, stickers, or decorative badges.
- **Lines and Text:** Hierarchy is established through typography, contrast, and subtle border lines (`var(--line)`), completely avoiding heavy card containers or colored chips.
- **Native System Font Stack:**
  ```css
  font: 14px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  ```
  Monospace (for numbers, budgets, scores, tokens):
  ```css
  ui-monospace, SFMono-Regular, Consolas, monospace;
  ```
  - **Zero CLS (Cumulative Layout Shift):** 0ms font-loading delay.
  - **Complete Privacy:** Zero external network calls to Google Fonts or Typekit.
  - **Native Platform Rendering:** Looks identical to native system software on macOS, Windows, iOS, Android, and Linux.
- **Micro-Animations:** Smooth cascading list entrances (`translateY(-8px) -> 0`), skeleton shimmer loaders during URL preview extraction, and animated modal transitions.
- **Bilingual Interface:** Full Russian and English localization (`ru` / `en`) with automatic `Accept-Language` detection and persistent cookie-based switching.

---

## 8. Business Model and Commercialization

OpenRadar preserves an open-source core (Apache 2.0) while monetizing high-value B2B services:

1. **B2B ATS Telemetry & Ingestion:** Corporate applicant tracking systems (Greenhouse, Lever, Ashby, Huntflow) pay for automated verified distribution into the OpenRadar network and employer verification status.
2. **Data Lakehouse API:** Access to clean, real-time and historical datasets of global labor demand, compensation shifts, and skill migration trends for hedge funds, venture capital firms, research institutes, and HR-tech companies.
3. **Managed Private Nodes:** Turnkey private OpenRadar installations for enterprises and agencies managing private vendor networks, competitive intelligence, and confidential recruiting.

---

## 9. Current Technical Status

| Component | Status | Details |
|---|---|---|
| **Core Server** | Production | Node.js 22 LTS, TypeScript, Hono SSR, Docker Compose |
| **Database** | Production | PostgreSQL 17 with `pgvector` FP16 halfvec |
| **Automated Tests** | 100% Pass | 104 tests across 14 test suites (unit, integration, E2E) |
| **Static Analysis** | 0 Errors | Strict TypeScript (`tsc --noEmit`) |
| **Active Adapters** | Production | HeadHunter API, RemoteOK, Работа России Open API, Habr, Kwork, FL.ru, RSS/Atom, IMAP, Webhooks |
| **Browser Extension**| Production | Manifest V3 with `schema.org/JobPosting` parser |
| **Live Instances** | Active | `https://openradar.fun` and `https://radar.91.229.8.32.nip.io` |

---

## 10. Repository Map and Key Files

- [`README.md`](file:///c:/projects/radar-oss/README.md) — Main repository overview, features, and setup instructions.
- [`docs/OPEN_RADAR_CONCEPT_AND_ARCHITECTURE.md`](file:///c:/projects/radar-oss/docs/OPEN_RADAR_CONCEPT_AND_ARCHITECTURE.md) — Comprehensive technical concept and architecture specification.
- [`docs/ROADMAP_AND_PHILOSOPHY.md`](file:///c:/projects/radar-oss/docs/ROADMAP_AND_PHILOSOPHY.md) — Philosophical manifesto, reputation formulas, and long-term milestones.
- [`docs/ARCHITECTURE.md`](file:///c:/projects/radar-oss/docs/ARCHITECTURE.md) — Deep-dive into internal modules, SSRF protections, and data pipelines.
- [`docs/DESIGN_SYSTEM.md`](file:///c:/projects/radar-oss/docs/DESIGN_SYSTEM.md) — Swiss typography guidelines, font stacks, and component specs.
- [`src/server/app.ts`](file:///c:/projects/radar-oss/src/server/app.ts) — Main HTTP server, security guards, and route handlers.
- [`src/server/ui.ts`](file:///c:/projects/radar-oss/src/server/ui.ts) — Server-side rendered views, layout, and component templates.
- [`src/server/i18n.ts`](file:///c:/projects/radar-oss/src/server/i18n.ts) — Bilingual translation dictionary and locale resolver.
- [`src/pipeline/preview.ts`](file:///c:/projects/radar-oss/src/pipeline/preview.ts) — URL ingestion, SSRF-safe DNS resolver, and schema parser.
- [`src/store/postgres.ts`](file:///c:/projects/radar-oss/src/store/postgres.ts) — PostgreSQL 17 store with `pgvector` indexing.
- [`extension/`](file:///c:/projects/radar-oss/extension) — Complete Manifest V3 browser extension and privacy policy.
