-- Knowledge about a post outlives the lead row. Cleanup, dedup and source
-- hygiene delete lead rows, and until now the reader reviews, the model
-- decisions, the person labels and the votes were cascaded away with them —
-- the training data burned together with the deleted duplicates. The FK on
-- the five knowledge tables is dropped; a review keeps enough of a snapshot
-- (title_key, source_id, title_snapshot) to stay interpretable without the
-- lead row it labeled.
ALTER TABLE lead_reviews DROP CONSTRAINT IF EXISTS lead_reviews_lead_id_fkey;
ALTER TABLE model_decisions DROP CONSTRAINT IF EXISTS model_decisions_lead_id_fkey;
ALTER TABLE lead_decisions DROP CONSTRAINT IF EXISTS lead_decisions_lead_id_fkey;
ALTER TABLE lead_labels DROP CONSTRAINT IF EXISTS lead_labels_lead_id_fkey;
ALTER TABLE lead_votes DROP CONSTRAINT IF EXISTS lead_votes_lead_id_fkey;
ALTER TABLE lead_reviews ADD COLUMN IF NOT EXISTS title_key TEXT;
ALTER TABLE lead_reviews ADD COLUMN IF NOT EXISTS source_id TEXT;
ALTER TABLE lead_reviews ADD COLUMN IF NOT EXISTS title_snapshot TEXT;
UPDATE lead_reviews r SET title_key = l.title_key, source_id = l.source_id, title_snapshot = l.title
  FROM leads l WHERE r.lead_id = l.id
  AND (r.title_key IS NULL OR r.source_id IS NULL OR r.title_snapshot IS NULL);
