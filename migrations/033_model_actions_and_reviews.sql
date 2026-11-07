-- What the node did on a model's answer, and whether a person took it back.
ALTER TABLE model_decisions ADD COLUMN IF NOT EXISTS applied TEXT;
ALTER TABLE model_decisions ADD COLUMN IF NOT EXISTS overruled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE lead_decisions DROP CONSTRAINT IF EXISTS lead_decisions_decided_by_check;
ALTER TABLE lead_decisions ADD CONSTRAINT lead_decisions_decided_by_check
  CHECK (decided_by IN ('moderator', 'author', 'source', 'model'));

-- What signed-in readers said about a post, one answer each. lead_labels stays the set a
-- person of the project checked: readers are compared with it, not mixed into it.
CREATE TABLE IF NOT EXISTS lead_reviews (
  lead_id TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL,
  verdict TEXT NOT NULL,
  reviewed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (lead_id, user_id)
);
CREATE INDEX IF NOT EXISTS lead_reviews_user_idx ON lead_reviews (user_id, reviewed_at DESC);
