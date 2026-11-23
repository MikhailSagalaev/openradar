-- 044_storage_optimization.sql
-- Storage optimization for high-throughput ingestion (30k+ leads/day):
-- Safe lock timeout protects live production traffic from lock convoys
SET lock_timeout = '4s';

-- 1. Drop redundant legacy GIN indexes on `leads` superseded by `idx_leads_search_vector` (037)
--    and ParadeDB BM25 (038), eliminating massive GIN pending list write amplification.
DROP INDEX IF EXISTS idx_leads_fts_ru;
DROP INDEX IF EXISTS idx_leads_fts_dual;
DROP INDEX IF EXISTS idx_leads_text_trgm;

-- 2. Add index on `runs.started_at` to avoid sequential scans during `cleanupRuns` and maintenance.
CREATE INDEX IF NOT EXISTS idx_runs_started ON runs(started_at);

-- 3. Add index on `observations.received_at` for efficient hub statistics and 7-day query windows.
CREATE INDEX IF NOT EXISTS idx_observations_received ON observations(received_at DESC);

-- 4. Tune autovacuum on high-churn tables to prevent MVCC table and index bloat.
ALTER TABLE leads SET (
  autovacuum_vacuum_scale_factor = 0.05,
  autovacuum_vacuum_cost_limit = 1000
);

ALTER TABLE lead_minhash_bands SET (
  autovacuum_vacuum_scale_factor = 0.05,
  autovacuum_vacuum_cost_limit = 1000
);

ALTER TABLE runs SET (
  autovacuum_vacuum_scale_factor = 0.05,
  autovacuum_vacuum_cost_limit = 1000
);

ALTER TABLE observations SET (
  autovacuum_vacuum_scale_factor = 0.05,
  autovacuum_vacuum_cost_limit = 1000
);
