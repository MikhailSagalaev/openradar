-- What the decide model says about the direction, remoteness and grade of a post (v2
-- questions). The direction may be copied onto an empty lead: the research role the
-- catalog pages and filters collect.
ALTER TABLE model_decisions ADD COLUMN IF NOT EXISTS direction TEXT;
ALTER TABLE model_decisions ADD COLUMN IF NOT EXISTS direction_confidence REAL;
ALTER TABLE model_decisions ADD COLUMN IF NOT EXISTS remote REAL;
ALTER TABLE model_decisions ADD COLUMN IF NOT EXISTS grade TEXT;
CREATE INDEX IF NOT EXISTS model_decisions_direction_idx ON model_decisions (direction);

ALTER TABLE leads ADD COLUMN IF NOT EXISTS role TEXT;
CREATE INDEX IF NOT EXISTS leads_role_idx ON leads (role, created_at DESC) WHERE role IS NOT NULL;
