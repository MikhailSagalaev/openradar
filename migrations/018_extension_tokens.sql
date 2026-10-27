-- 018_extension_tokens.sql
-- Browser extension sign-in: a GitHub user connects the extension once and it submits
-- leads with a personal token. Only the SHA-256 of the token is stored.
CREATE TABLE IF NOT EXISTS extension_tokens (
    token_hash TEXT PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_used_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_extension_tokens_user ON extension_tokens(user_id);
