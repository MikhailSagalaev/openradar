-- 020_research.sql
-- Monthly market reports are frozen once published, so a cited figure never moves.
CREATE TABLE IF NOT EXISTS research_snapshots (
  period TEXT PRIMARY KEY,
  report JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_leads_published ON leads (COALESCE(published_at, created_at));

-- Jobicy, We Work Remotely and RemoteOK publish only vacancies; titles without
-- «vacancy» words made some of their posts orders.
UPDATE leads SET type = 'job', payment_period = 'monthly'
WHERE type = 'gig' AND url ~* '^https?://(www\.)?(jobicy\.com|weworkremotely\.com|remoteok\.com)/';
