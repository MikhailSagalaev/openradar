-- The employer of a vacancy: `company` is the name to show (the column dates from 002 and was
-- never filled), `company_key` the comparable form the employer pages group by.
ALTER TABLE leads ADD COLUMN IF NOT EXISTS company_key TEXT;
CREATE INDEX IF NOT EXISTS leads_company_key_idx ON leads (company_key, created_at DESC) WHERE company_key IS NOT NULL;
