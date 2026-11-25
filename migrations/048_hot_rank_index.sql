-- 048_hot_rank_index.sql
-- Partial B-tree expression indexes for default ranked feed (`sort=score`).
-- Because (score + epoch(created_at_utc) / 21600.0) differs from (score - (now() - created_at) / 3600 * (1/6))
-- only by a per-query constant (-epoch(now()) / 21600.0), ordering by this immutable expression
-- produces the identical ranking order via an Index Scan (~0.4ms, ~50 buffers) instead of
-- a Parallel Seq Scan over 300k+ leads (~670MB read).
--
-- Note: On production (4.5GB leads table), create these indexes with CONCURRENTLY
-- before running migrations so the table is never write-locked.

CREATE INDEX IF NOT EXISTS idx_leads_feed_active_hot_rank
  ON leads ((score::double precision + EXTRACT(EPOCH FROM (created_at AT TIME ZONE 'UTC')) / 21600.0) DESC, created_at DESC, id DESC)
  WHERE archived_at IS NULL AND state = 'active' AND status <> 'rejected';

CREATE INDEX IF NOT EXISTS idx_leads_feed_active_lang_hot_rank
  ON leads (lang, (score::double precision + EXTRACT(EPOCH FROM (created_at AT TIME ZONE 'UTC')) / 21600.0) DESC, created_at DESC, id DESC)
  WHERE archived_at IS NULL AND state = 'active' AND status <> 'rejected';
