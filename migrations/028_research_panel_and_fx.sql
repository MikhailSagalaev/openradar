-- 028_research_panel_and_fx.sql
-- The openradar index, version 2: panel_n counts the fresh posts its fixed feeds saw. The panel
-- used to be a list of platforms, so feeds added later joined it, and vacancies raised on hh.ru
-- and Habr Career counted as new. The table is rebuilt by the app from the panel start.
ALTER TABLE research_daily ADD COLUMN IF NOT EXISTS panel_n INTEGER NOT NULL DEFAULT 0;
TRUNCATE research_daily;

-- The same page may be seen by several feeds: the index needs to know each of them.
ALTER TABLE lead_sightings DROP CONSTRAINT IF EXISTS lead_sightings_pkey;
ALTER TABLE lead_sightings ADD PRIMARY KEY (lead_id, url, source_id);
CREATE INDEX IF NOT EXISTS idx_lead_sightings_lead ON lead_sightings (lead_id);

-- Bank of Russia rates on the first day of a month: pay published that month is converted at
-- them, so a frozen report and a rebuilt one agree.
CREATE TABLE IF NOT EXISTS research_fx (
  month TEXT PRIMARY KEY,
  rates JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
