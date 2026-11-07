-- The direction of a post (the research role): the field readers pick and correct. The board's
-- own category exists for one post in a hundred, so this is what the review page lists.
ALTER TABLE leads ADD COLUMN IF NOT EXISTS direction TEXT;
CREATE INDEX IF NOT EXISTS leads_direction_idx ON leads (direction) WHERE direction IS NOT NULL;

-- A reader's answer in full: what they were shown, what they corrected, what was wrong.
ALTER TABLE lead_reviews ADD COLUMN IF NOT EXISTS type_fix TEXT;
ALTER TABLE lead_reviews ADD COLUMN IF NOT EXISTS direction_fix TEXT;
ALTER TABLE lead_reviews ADD COLUMN IF NOT EXISTS issues TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE lead_reviews ADD COLUMN IF NOT EXISTS note TEXT;
ALTER TABLE lead_reviews ADD COLUMN IF NOT EXISTS shown_type TEXT;
ALTER TABLE lead_reviews ADD COLUMN IF NOT EXISTS shown_direction TEXT;
ALTER TABLE lead_reviews ADD COLUMN IF NOT EXISTS bucket TEXT;
ALTER TABLE lead_labels ADD COLUMN IF NOT EXISTS note TEXT;
