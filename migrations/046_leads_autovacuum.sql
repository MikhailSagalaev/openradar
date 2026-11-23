-- 046_leads_autovacuum.sql
-- Tune PostgreSQL autovacuum thresholds for the leads table.
-- Tantivy BM25 (ParadeDB pg_search) relies on prompt cleanup of dead rows
-- to keep term frequency statistics (IDF) accurate and LSM segments compact.
SET statement_timeout = 0;
SET lock_timeout = '4s';

ALTER TABLE leads SET (
  autovacuum_vacuum_scale_factor = 0.05,
  autovacuum_vacuum_threshold = 1000,
  autovacuum_analyze_scale_factor = 0.02,
  autovacuum_analyze_threshold = 500
);
