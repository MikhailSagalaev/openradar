-- 010_radar2_drop_mesh.sql
-- radar/2: the radar/1 mesh layer (relay attestations, AI arbiter queue, mesh node
-- reputation, 12h unlock windows) is removed. Lead visibility is a single `state`
-- column; access delays are computed from created_at by the viewer's tier.

DROP TABLE IF EXISTS lead_attestations CASCADE;
DROP TABLE IF EXISTS arbiter_queue CASCADE;

DROP INDEX IF EXISTS idx_leads_visibility;

ALTER TABLE leads
    DROP COLUMN IF EXISTS publisher_pubkey,
    DROP COLUMN IF EXISTS nostr_event_id,
    DROP COLUMN IF EXISTS verification_state,
    DROP COLUMN IF EXISTS attestation_count,
    DROP COLUMN IF EXISTS is_mesh_exclusive,
    DROP COLUMN IF EXISTS unlocked_at;

DROP TABLE IF EXISTS mesh_nodes CASCADE;

ALTER TABLE leads
    ADD COLUMN IF NOT EXISTS state TEXT NOT NULL DEFAULT 'active'
        CHECK (state IN ('active', 'suspect', 'hidden_junk', 'hidden_scam', 'closed'));

CREATE INDEX IF NOT EXISTS idx_leads_state_created ON leads (state, created_at DESC);
