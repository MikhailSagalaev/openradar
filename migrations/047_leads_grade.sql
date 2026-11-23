-- Leads seniority grade (intern, junior, middle, senior, lead).
-- Enables filtering and display of seniority across active leads.

ALTER TABLE leads ADD COLUMN IF NOT EXISTS grade TEXT;
CREATE INDEX IF NOT EXISTS idx_leads_grade ON leads (grade) WHERE state = 'active' AND status <> 'rejected';

-- Backfill from existing AI model decisions where grade was detected
UPDATE leads l
SET grade = m.grade
FROM model_decisions m
WHERE l.id = m.lead_id
  AND m.grade IS NOT NULL
  AND m.grade IN ('intern', 'junior', 'middle', 'senior', 'lead')
  AND (l.grade IS NULL OR l.grade = '')
  AND NOT COALESCE(m.overruled, false);
