-- 029_public_profile.sql
-- A participant's page and place in the public rating. Anyone can leave them in the profile.
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS public_profile BOOLEAN NOT NULL DEFAULT TRUE;
