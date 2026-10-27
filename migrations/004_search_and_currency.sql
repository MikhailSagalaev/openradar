-- 004_search_and_currency.sql: Normalization of salary currencies and dual FTS vector index

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS raw_salary TEXT,
  ADD COLUMN IF NOT EXISTS payment_period TEXT DEFAULT 'fixed',
  ADD COLUMN IF NOT EXISTS normalized_usd_min DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS normalized_usd_max DOUBLE PRECISION;

-- Dual FTS index on Russian + English configurations
CREATE INDEX IF NOT EXISTS idx_leads_fts_dual
  ON leads USING GIN ((to_tsvector('russian', title || ' ' || text) || to_tsvector('english', title || ' ' || text)));

-- Index for normalized USD salary range queries
CREATE INDEX IF NOT EXISTS idx_leads_salary_usd
  ON leads (normalized_usd_min, normalized_usd_max);
