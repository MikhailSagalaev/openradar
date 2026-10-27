-- 016_yearly_salaries.sql
-- Jobicy and RemoteOK publish yearly pay; 015 stored it as if it were monthly. Salaries
-- are normalised per month (YEARLY_SALARY_FLOOR_USD in src/core/salary.ts).
UPDATE leads
SET normalized_usd_min = ROUND((normalized_usd_min / 12)::numeric),
    normalized_usd_max = ROUND((normalized_usd_max / 12)::numeric)
WHERE type = 'job'
  AND payment_period <> 'hourly'
  AND COALESCE(normalized_usd_max, normalized_usd_min) > 25000;
