-- What a decision model said about a post. Nothing reads this for the feed yet: answers are
-- compared with posts checked by hand first (docs/DECISIONS.md).
CREATE TABLE IF NOT EXISTS model_decisions (
  lead_id TEXT PRIMARY KEY REFERENCES leads(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  model TEXT NOT NULL,
  kind TEXT NOT NULL,
  kind_confidence REAL NOT NULL,
  closed REAL NOT NULL,
  scam REAL NOT NULL,
  fullness REAL NOT NULL,
  tokens INTEGER NOT NULL DEFAULT 0,
  decided_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS model_decisions_decided_idx ON model_decisions (decided_at DESC);
CREATE INDEX IF NOT EXISTS model_decisions_kind_idx ON model_decisions (kind);
