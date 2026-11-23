-- 045_feed_index_and_cleanup.sql
-- Optimizations for feed queries, language filtering, remote jobs, and removal of dead indexes:
SET lock_timeout = '4s';

-- 1. Drop dead halfvec HNSW index (0 embeddings exist in table, BM25 + MinHash used instead).
DROP INDEX IF EXISTS idx_leads_embedding_hnsw;

-- 2. Partial index for default feed (active non-rejected leads sorted by created_at DESC, id DESC).
CREATE INDEX IF NOT EXISTS idx_leads_feed_active 
  ON leads (created_at DESC, id DESC) 
  WHERE archived_at IS NULL AND state = 'active' AND status <> 'rejected';

-- 3. Backfill is_remote for leads marked by text/city/workplace markers.
UPDATE leads SET is_remote = true 
WHERE is_remote = false 
  AND (
    workplace_type = 'remote' 
    OR city ~* '^(онлайн|удал)' 
    OR (title || ' ' || text) ~* 'удал[её]нн(?:ая|ое|ый|ую)\s+(?:работ|формат|график)|100%\s+remote|\btelecommute\b|работа\s+из\s+дома' 
    OR (COALESCE(type, 'gig') <> 'job' AND workplace_type IS NULL AND (city IS NULL OR btrim(city) = ''))
  );

-- 4. Partial index for remote feed.
CREATE INDEX IF NOT EXISTS idx_leads_feed_active_remote 
  ON leads (created_at DESC, id DESC) 
  WHERE archived_at IS NULL AND state = 'active' AND status <> 'rejected' AND is_remote = true;

-- 5. Backfill lang ('en' vs 'ru') so feed language queries do not run regexes across 300k rows.
UPDATE leads SET lang = 'en'
WHERE (lang IS NULL OR lang = 'ru') 
  AND NOT (regexp_replace(title, '(Компания|Город|Company|City)\s*:[^.|\n]*', '', 'g') ~ '[А-Яа-яЁё]');

-- 6. Partial index for language feed filtering.
CREATE INDEX IF NOT EXISTS idx_leads_feed_active_lang 
  ON leads (lang, created_at DESC, id DESC) 
  WHERE archived_at IS NULL AND state = 'active' AND status <> 'rejected';
