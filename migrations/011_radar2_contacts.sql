-- 011_radar2_contacts.sql
-- radar/2: structured contacts and source reference of a lead.
-- contacts_json keeps the list for display; lead_contacts indexes it for cross-post matching.

ALTER TABLE leads
    ADD COLUMN IF NOT EXISTS contacts_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS source_platform TEXT,
    ADD COLUMN IF NOT EXISTS source_channel TEXT,
    ADD COLUMN IF NOT EXISTS source_channel_title TEXT,
    ADD COLUMN IF NOT EXISTS source_visibility TEXT
        CHECK (source_visibility IS NULL OR source_visibility IN ('public', 'private', 'invite')),
    ADD COLUMN IF NOT EXISTS source_message_id TEXT;

CREATE TABLE IF NOT EXISTS lead_contacts (
    lead_id TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    value TEXT NOT NULL,
    PRIMARY KEY (lead_id, type, value)
);

CREATE INDEX IF NOT EXISTS idx_lead_contacts_value ON lead_contacts (type, value);
