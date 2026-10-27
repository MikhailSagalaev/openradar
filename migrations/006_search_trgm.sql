-- 006_search_trgm.sql: trigram indexes so the ILIKE fallback of the search
-- (title/text) stops scanning the whole table.

DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_trgm;
  CREATE INDEX IF NOT EXISTS idx_leads_title_trgm ON leads USING gin (title gin_trgm_ops);
  CREATE INDEX IF NOT EXISTS idx_leads_text_trgm ON leads USING gin (text gin_trgm_ops);
EXCEPTION WHEN undefined_file OR feature_not_supported THEN
  RAISE NOTICE 'pg_trgm extension is not available in this environment; skipping trigram indexes';
END $$;
