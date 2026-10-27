-- 017_fix_byn_currency.sql
-- Before 6ef742f «мебель», «белье» and the like were read as Belarusian roubles. The
-- detector is fixed; move those leads back to RUB unless the text names BYN explicitly
-- (same rule as detectCurrency in src/core/salary.ts).
UPDATE leads
SET currency = 'RUB',
    normalized_usd_min = CASE WHEN budget > 0 THEN ROUND((budget / 92.0)::numeric) END,
    normalized_usd_max = CASE WHEN budget > 0 THEN ROUND((budget / 92.0)::numeric) END
WHERE currency = 'BYN'
  AND (title || ' ' || text) !~* '(бел\.?\s*руб|белорусск|\mbyn\M)';
