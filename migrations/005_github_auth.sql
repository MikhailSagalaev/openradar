-- 005_github_auth.sql: GitHub OAuth users attached to dashboard sessions

-- Sessions created by the admin token login keep user_id = NULL and stay admin-only.
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS user_id BIGINT REFERENCES app_users(id) ON DELETE CASCADE;
