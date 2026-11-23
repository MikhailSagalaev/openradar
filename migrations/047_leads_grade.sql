-- Leads seniority grade (intern, junior, middle, senior, lead).
-- Enables filtering and display of seniority across active leads.

ALTER TABLE leads ADD COLUMN IF NOT EXISTS grade TEXT;
CREATE INDEX IF NOT EXISTS idx_leads_grade ON leads (grade) WHERE state = 'active' AND status <> 'rejected';
