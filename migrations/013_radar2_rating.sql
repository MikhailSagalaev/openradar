-- 013_radar2_rating.sql
-- radar/2 hub: rating ledger (30-day window), cached participant rating, GitHub account
-- age for the base signal weight, lead decisions (moderator or post author) and
-- contacts flagged as scam by moderators. See docs/PROTOCOL.md.

-- Confirmation is sticky, so a confirmer's later rating drop does not undo the credit.
ALTER TABLE leads ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ;

ALTER TABLE app_users ADD COLUMN IF NOT EXISTS github_created_at TIMESTAMPTZ;

ALTER TABLE participants
    ADD COLUMN IF NOT EXISTS rating REAL NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS rating_updated_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS rating_ledger (
    pubkey TEXT NOT NULL,
    lead_id TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    points REAL NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (pubkey, lead_id, kind)
);

CREATE INDEX IF NOT EXISTS idx_rating_ledger_pubkey ON rating_ledger (pubkey, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rating_ledger_created ON rating_ledger (created_at);

CREATE TABLE IF NOT EXISTS lead_decisions (
    lead_id TEXT PRIMARY KEY REFERENCES leads(id) ON DELETE CASCADE,
    state TEXT NOT NULL CHECK (state IN ('active', 'hidden_junk', 'hidden_scam', 'closed')),
    decided_by TEXT NOT NULL CHECK (decided_by IN ('moderator', 'author')),
    pubkey TEXT,
    reason TEXT NOT NULL DEFAULT '',
    decided_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS contact_flags (
    type TEXT NOT NULL,
    value TEXT NOT NULL,
    flag TEXT NOT NULL CHECK (flag IN ('scam')),
    pubkey TEXT,
    reason TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (type, value)
);
