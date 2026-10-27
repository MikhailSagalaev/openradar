-- 015_backfill_salary_usd.sql
-- Ingest used to drop the USD-normalised budget and the payment period, so every lead
-- had NULL normalized_usd_* and payment_period 'fixed'. Fill them from budget and
-- currency at the reference rates of src/core/salary.ts; vacancies are paid monthly.
UPDATE leads
SET normalized_usd_min = ROUND((budget * CASE upper(currency)
      WHEN 'USD' THEN 1.0 WHEN 'USDT' THEN 1.0 WHEN 'USDC' THEN 1.0
      WHEN 'EUR' THEN 1.08 WHEN 'GBP' THEN 1.28
      WHEN 'KZT' THEN 1 / 480.0 WHEN 'BYN' THEN 1 / 3.25 WHEN 'UAH' THEN 1 / 41.5
      ELSE 1 / 92.0 END)::numeric),
    normalized_usd_max = ROUND((budget * CASE upper(currency)
      WHEN 'USD' THEN 1.0 WHEN 'USDT' THEN 1.0 WHEN 'USDC' THEN 1.0
      WHEN 'EUR' THEN 1.08 WHEN 'GBP' THEN 1.28
      WHEN 'KZT' THEN 1 / 480.0 WHEN 'BYN' THEN 1 / 3.25 WHEN 'UAH' THEN 1 / 41.5
      ELSE 1 / 92.0 END)::numeric)
WHERE budget > 0 AND normalized_usd_min IS NULL AND normalized_usd_max IS NULL;

UPDATE leads SET payment_period = 'monthly' WHERE type = 'job' AND payment_period = 'fixed';
