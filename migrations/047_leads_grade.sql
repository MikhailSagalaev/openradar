-- Leads seniority grade (intern, junior, middle, senior, lead).
-- Enables filtering and display of seniority across active leads.
-- Note: Index is created concurrently outside of the migration transaction
-- to avoid holding a SHARE lock on the 4.5GB leads table.

ALTER TABLE leads ADD COLUMN IF NOT EXISTS grade TEXT;
