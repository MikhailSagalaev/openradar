-- 026_user_source_status.sql: what the last read of a personal Telegram source found,
-- and no phone numbers: the account link does not need them (0.41.3 stopped storing them).

ALTER TABLE user_sources
  ADD COLUMN IF NOT EXISTS last_error text,
  ADD COLUMN IF NOT EXISTS last_count integer NOT NULL DEFAULT 0;

UPDATE user_telegram_accounts SET phone = NULL WHERE phone IS NOT NULL;
