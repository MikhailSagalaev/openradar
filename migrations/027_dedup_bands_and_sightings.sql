-- 027_dedup_bands_and_sightings.sql
-- Near-duplicate search moves from the process into the database: the MinHash LSH bands of
-- the last week's posts, so every worker sees the same index and a restart loses nothing.
-- The app fills the table for new posts and, on first use, for the last seven days.
CREATE TABLE IF NOT EXISTS lead_minhash_bands (
  band TEXT NOT NULL,
  lead_id TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (band, lead_id)
);
CREATE INDEX IF NOT EXISTS idx_minhash_bands_created ON lead_minhash_bands (created_at);
CREATE INDEX IF NOT EXISTS idx_minhash_bands_lead ON lead_minhash_bands (lead_id);

-- A copy of a stored post seen on another board or source: kept instead of dropped, so a post
-- can say where else it was published and research can see how much the boards overlap.
CREATE TABLE IF NOT EXISTS lead_sightings (
  lead_id TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  source_id TEXT NOT NULL,
  method TEXT NOT NULL,
  similarity REAL NOT NULL DEFAULT 1,
  seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (lead_id, url)
);
CREATE INDEX IF NOT EXISTS idx_lead_sightings_seen ON lead_sightings (seen_at);

-- lead_duplicates (002) was never written: copies were dropped before they became leads.
DROP TABLE IF EXISTS lead_duplicates;
