-- 021_research_daily.sql
-- Daily counts of published posts by type, platform, role and market scope: the openradar
-- index reads these small rows instead of deriving every post of months on each request.
CREATE TABLE IF NOT EXISTS research_daily (
  day DATE NOT NULL,
  type TEXT NOT NULL,
  platform TEXT NOT NULL,
  role TEXT NOT NULL,
  scope TEXT NOT NULL,
  n INTEGER NOT NULL,
  PRIMARY KEY (day, type, platform, role, scope)
);
