-- 019_lead_liveness.sql
-- Closed-post checks: when the source page of a lead was last checked, and a third kind of
-- decision, 'source', for leads the board itself marks as closed or removed.
ALTER TABLE leads ADD COLUMN IF NOT EXISTS checked_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_leads_liveness ON leads (checked_at NULLS FIRST, created_at DESC) WHERE state = 'active';

ALTER TABLE lead_decisions DROP CONSTRAINT IF EXISTS lead_decisions_decided_by_check;
ALTER TABLE lead_decisions ADD CONSTRAINT lead_decisions_decided_by_check
    CHECK (decided_by IN ('moderator', 'author', 'source'));
