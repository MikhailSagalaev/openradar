-- 004_mesh_and_arbiter.sql / 008_mesh_and_arbiter.sql: Mesh Network & AI Arbiter Schema

-- Узлы сети и их Web-of-Trust репутация
CREATE TABLE IF NOT EXISTS mesh_nodes (
    pubkey TEXT PRIMARY KEY,
    npub TEXT NOT NULL UNIQUE,
    github_username TEXT,
    github_gist_url TEXT,
    nip05_domain TEXT,
    trust_score REAL NOT NULL DEFAULT 0.05 CHECK (trust_score >= 0.0 AND trust_score <= 1.0),
    valid_leads_7d INTEGER NOT NULL DEFAULT 0,
    valid_attestations_24h INTEGER NOT NULL DEFAULT 0,
    false_reports_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Расширение таблицы leads полями Mesh-сети и ИИ-арбитра
ALTER TABLE leads
    ADD COLUMN IF NOT EXISTS publisher_pubkey TEXT REFERENCES mesh_nodes(pubkey),
    ADD COLUMN IF NOT EXISTS nostr_event_id TEXT UNIQUE,
    ADD COLUMN IF NOT EXISTS minhash_sketch BYTEA,
    ADD COLUMN IF NOT EXISTS verification_state TEXT NOT NULL DEFAULT 'unverified'
        CHECK (verification_state IN ('unverified', 'attested', 'under_review', 'verified_active', 'killed_scam', 'killed_closed')),
    ADD COLUMN IF NOT EXISTS attestation_count INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS is_mesh_exclusive BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS unlocked_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Индекс для фильтрации Tit-for-Tat доступа и векторного поиска
CREATE INDEX IF NOT EXISTS idx_leads_visibility
    ON leads (verification_state, unlocked_at DESC);

-- Таблица криптографических подтверждений и сигналов (NIP-01 события 30404 и 30405)
CREATE TABLE IF NOT EXISTS lead_attestations (
    id BIGSERIAL PRIMARY KEY,
    nostr_event_id TEXT NOT NULL UNIQUE,
    lead_id TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    signer_pubkey TEXT NOT NULL REFERENCES mesh_nodes(pubkey),
    kind INTEGER NOT NULL CHECK (kind IN (30404, 30405)),
    signal_or_status TEXT NOT NULL,
    recomputed_hash TEXT,
    confidence REAL DEFAULT 1.0,
    raw_event JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (lead_id, signer_pubkey, kind)
);

-- Очередь задач для фонового ИИ-арбитра (Grokipedia Gatekeeper)
CREATE TABLE IF NOT EXISTS arbiter_queue (
    lead_id TEXT PRIMARY KEY REFERENCES leads(id) ON DELETE CASCADE,
    trigger_reason TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    next_run_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
