# OpenRadar: Decentralized Labor Liquidity Network

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/logo-white.png">
    <source media="(prefers-color-scheme: light)" srcset="assets/logo-black.png">
    <img alt="OpenRadar Logo" src="assets/logo-black.png" width="360">
  </picture>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-AGPLv3-blue.svg" alt="License: AGPL v3"></a>
  <a href="#"><img src="https://img.shields.io/badge/tests-171%20passed-green.svg" alt="Tests: 171 passed"></a>
  <a href="#"><img src="https://img.shields.io/badge/typescript-strict-blue.svg" alt="TypeScript: Strict"></a>
  <a href="https://openradar.fun"><img src="https://img.shields.io/badge/prod-online%20v0.5.0-success.svg" alt="Production: Online v0.5.0"></a>
  <a href="#"><img src="https://img.shields.io/badge/protocol-radar%2F1%20(Nostr)-purple.svg" alt="Protocol: radar/1 (Nostr)"></a>
</p>

**OpenRadar** is a decentralized, open-source labor liquidity protocol (`radar/1`) built on top of **Nostr (NIP-01)**. It provides a censorship-resistant, community-curated data mesh for job vacancies (`job`) and freelance contracts (`gig`).

No pay-to-apply paywalls. No sponsored zombie postings. No closed data silos.

---

## Manifesto: Why Modern Hiring Is Broken

The digital recruitment landscape (HeadHunter, Upwork, LinkedIn, Kwork) is structurally flawed at the economic layer:
1. **The Zombie Vacancy Incentive:** Centralized platforms monetize engagement metrics and applicant desperation. Keeping expired or fake postings active maximizes platform search traffic and resume collection.
2. **Artificial Scarcity & Application Fees:** Charging candidates and contractors for "connects" or responses creates an artificial barrier to labor liquidity.
3. **Walled Data Gardens:** Job seekers and automated AI agents are forced to query dozens of closed, fragmented platforms that intentionally degrade public feeds.

**OpenRadar separates the data curation mesh from the commercial layer:**
- **Zero-Fee Protocol:** Open and verifiable. Anyone can run an indexer, relay, or validator node.
- **Game-Theoretic Truth:** Hybrid AI Arbitration (Grokipedia Pattern) paired with Skin-in-the-Game slashing enforces truthful status reporting.
- **Privacy by Design:** Smart PII scrubbing on the user's node strips personal phone numbers and private messenger links before network broadcast.
- **Swiss Typography (Zero Emoji Doctrine):** Pure monochrome lines, high-density information, and zero visual noise.

---

## Protocol Architecture (`radar/1`)

```
   [ Local Web Scanners / CLI Nodes / Extensions ]
                         │
      (Smart PII Scrubbing + MinHash Sketch)
                         │
      (BIP-340 Schnorr Sign with HMAC Child Key)
                         ▼
        ┌───────────────────────────────────┐
        │   Nostr Relay Mesh (Kind 30402)   │
        └─────────────────┬─────────────────┘
                          │
         ┌────────────────┴────────────────┐
         ▼                                 ▼
┌──────────────────┐             ┌───────────────────┐
│ Active Node Pool │             │ Passive Readers   │
│  (0-sec Stream)  │             │   (12-hour Lag)   │
└────────┬─────────┘             └───────────────────┘
         │
         ▼
┌────────────────────────────────────────────────────┐
│ Hybrid AI Arbiter (Deterministic Regex + MinHash   │
│ Jaccard Guard + Grokipedia LLM Slashing Engine)    │
└────────────────────────────────────────────────────┘
```

### Core Cryptographic Invariants
- **BIP-340 Schnorr Signatures:** Even-parity Y-coordinate correction over `secp256k1`.
- **Blinded Relaying (HMAC Child Keys):** Nodes derive dynamic ephemeral keys per source and per 7-day epoch:
  $$\text{privkey}_{\text{child}} = \text{HMAC-SHA256}(\text{master\_privkey}, \text{source\_id} \parallel \text{week\_epoch})$$
  Surveillance observers cannot correlate posts across channels to deanonymize node operators.
- **MinHash Fingerprinting:** 64 x 16-bit buckets (128 bytes, base64url) in tag `["mh", "..."]` enable $O(1)$ Jaccard similarity estimation without LLM overhead.
- **Tit-for-Tat Access Engine:** Unlocks real-time streaming exclusively for nodes contributing $\ge 3$ leads/week or $\ge 10$ attestations/day. Passive consumers receive a 12-hour delayed stream.
- **Canary Traps & Cheater Slashing:** Automated synthetic honey-leads detect blind bots signing fake verifications, permanently zeroing their reputation (`trust_score = 0.0`).

---

## One-Command Deployment

Spin up a self-hosted node and database mesh instance:

```bash
# 1. Clone repository
git clone https://github.com/MikhailSagalaev/radar-oss.git
cd radar-oss

# 2. Launch full infrastructure
docker compose up -d
```

The node starts immediately on `http://127.0.0.1:8787` with PostgreSQL 17 + `pgvector halfvec(384)`.

---

## Autonomous AI Agent Infrastructure (B2D)

### 1. Model Context Protocol (MCP) Server
OpenRadar natively implements the Anthropic **Model Context Protocol (MCP)** JSON-RPC 2.0 interface for AI agents (Claude Desktop, Cursor, LangChain, AutoGPT).

- **Live Endpoint:** `https://openradar.fun/mcp`
- **Native Tools:**
  - `search_leads`: Semantic and parametric filtering by stack, type, budget, and verification state.
  - `get_lead_details`: Full scrubbed content and verification history.
  - `verify_lead_url`: Triggers immediate arbiter inspection through SSRF-guarded fetch.
  - `get_market_analytics`: 7-day rolling skill demand and median salary metrics.

### 2. Realtime B2B Firehose
Server-Sent Events (SSE) feed for enterprise workflows and recruiter automations:
```bash
curl -N -H "Authorization: Bearer <TOKEN>" "https://openradar.fun/api/v1/firehose?types=job&min_budget=3000"
```

### 3. Ghost Job & Salary X-Ray Extension
Manifest V3 browser extension for HeadHunter, LinkedIn, Habr Career, Kwork, and Upwork.
- Injects a Swiss-style metrics banner directly above vacancy titles:
  `[ OpenRadar X-Ray ] Market Range: $3500 ($2500–$4500) · Duplicates: 2 · Source Trust: 95%`
- Pack for Chrome / Firefox:
  ```bash
  pnpm pack:extension
  ```

---

## Contributing

We welcome community adapters, algorithm refinements, and bug fixes.
Review [CONTRIBUTING.md](CONTRIBUTING.md) for instructions on creating a new source adapter in 15 minutes using:
```bash
pnpm new:connector <source_name>
```

Requirements:
- Strictly 100% test pass rate (`pnpm test` — 170+ tests).
- Zero TypeScript errors (`pnpm typecheck`).
- Zero Emoji Doctrine enforced across all code and commit messages.

---

## Transparent Infrastructure Funding

OpenRadar is 100% non-commercial open-source software. All contributed funds are used exclusively to finance public Nostr relay bandwidth, NVMe storage, and validator node hosting:
- **GitHub Sponsors:** [github.com/sponsors/MikhailSagalaev](https://github.com/sponsors/MikhailSagalaev)
- **Open Collective:** [opencollective.com/openradar](https://opencollective.com/openradar)

---

## License

Distributed under the GNU Affero General Public License v3 (AGPL-3.0) to guarantee permanent open-source freedom against proprietary cloud enclosure. See [LICENSE](LICENSE) for details.
