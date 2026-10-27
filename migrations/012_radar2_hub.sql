-- 012_radar2_hub.sql
-- radar/2 hub: participants (secp256k1 keys), signed events, observations of leads,
-- signals and the HTTP-auth replay cache. See docs/PROTOCOL.md.

CREATE TABLE IF NOT EXISTS participants (
    pubkey TEXT PRIMARY KEY CHECK (pubkey ~ '^[0-9a-f]{64}$'),
    github_user_id BIGINT REFERENCES app_users(id) ON DELETE SET NULL,
    profile_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    banned_at TIMESTAMPTZ,
    banned_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_participants_github ON participants (github_user_id) WHERE github_user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY CHECK (id ~ '^[0-9a-f]{64}$'),
    pubkey TEXT NOT NULL,
    kind INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    tags_json JSONB NOT NULL,
    content TEXT NOT NULL,
    sig TEXT NOT NULL,
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_events_pubkey ON events (pubkey, received_at DESC);

CREATE TABLE IF NOT EXISTS observations (
    event_id TEXT PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
    lead_id TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    pubkey TEXT NOT NULL,
    platform TEXT NOT NULL,
    channel TEXT NOT NULL,
    channel_title TEXT,
    visibility TEXT NOT NULL DEFAULT 'public',
    message_id TEXT,
    is_first BOOLEAN NOT NULL DEFAULT FALSE,
    archived BOOLEAN NOT NULL DEFAULT FALSE,
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_observations_lead ON observations (lead_id, received_at);
CREATE INDEX IF NOT EXISTS idx_observations_pubkey ON observations (pubkey, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_observations_post ON observations (platform, channel, message_id);

CREATE TABLE IF NOT EXISTS signals (
    lead_id TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    pubkey TEXT NOT NULL,
    signal TEXT NOT NULL CHECK (signal IN ('useful', 'junk', 'scam', 'closed')),
    comment TEXT NOT NULL DEFAULT '',
    event_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (lead_id, pubkey)
);

CREATE TABLE IF NOT EXISTS auth_replay (
    id TEXT PRIMARY KEY,
    expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_auth_replay_expires ON auth_replay (expires_at);

CREATE INDEX IF NOT EXISTS idx_leads_canonical_url ON leads (canonical_url) WHERE canonical_url IS NOT NULL;
