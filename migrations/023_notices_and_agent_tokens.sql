-- 023_notices_and_agent_tokens.sql: Telegram notices of rating credits, and personal agent tokens.
-- The ledger is recomputed every hour, so it keeps no «credited at»; this table is the memory
-- that makes each «+10: your lead was confirmed» message arrive once.

CREATE TABLE IF NOT EXISTS ledger_notices (
  user_id BIGINT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  lead_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  notified_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, lead_id, kind)
);

-- A personal token an AI agent uses on /mcp to act as this user (saved searches, the user's
-- tier). One per user: issuing a new one revokes the old. Only the SHA-256 is stored.
CREATE TABLE IF NOT EXISTS agent_tokens (
  user_id BIGINT PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ
);
