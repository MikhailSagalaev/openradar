-- 038_paradedb_search.sql: Optional ParadeDB pg_search BM25 index on leads
-- If ParadeDB (pg_search) is available in the PostgreSQL environment,
-- enable the extension and build the Tantivy BM25 search index.
DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_search') THEN
    EXECUTE 'CREATE EXTENSION IF NOT EXISTS pg_search CASCADE';
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_leads_paradedb') THEN
      EXECUTE 'CREATE INDEX idx_leads_paradedb ON leads USING paradedb (id, title, skills_json, category, direction, text)';
    END IF;
  END IF;
END $do$;
