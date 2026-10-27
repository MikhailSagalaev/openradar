-- 007_refresh_text_and_type.sql: cap stored descriptions at 3000 chars
-- and backfill the job/gig type that earlier inserts left as 'gig'.

UPDATE leads SET text = left(text, 3000) WHERE length(text) > 3000;

-- Adapters that always emit vacancies
UPDATE leads l SET type = 'job'
FROM sources s
WHERE l.source_id = s.id AND s.kind IN ('trudvsem', 'hh', 'remoteok') AND l.type = 'gig';

-- URL/title based backfill for RSS leads (Habr Career, We Work Remotely)
UPDATE leads SET type = 'job'
WHERE type = 'gig'
  AND (
    url ILIKE '%vacanc%'
    OR url ILIKE '%remote-jobs%'
    OR title ~* 'ваканс'
  );
