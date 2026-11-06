-- Posts a person checked by hand: the only fair measure of the source scores and of any model.
CREATE TABLE IF NOT EXISTS lead_labels (
  lead_id TEXT PRIMARY KEY REFERENCES leads(id) ON DELETE CASCADE,
  verdict TEXT NOT NULL,
  labelled_by BIGINT,
  labelled_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lead_labels_verdict_idx ON lead_labels (verdict);
