-- 022_subscriptions.sql: saved searches. A signed-in user follows a feed filter and gets the
-- new leads it matches in Telegram or on a webhook, with the same tier delay as the feed.

CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  -- The feed filter as SavedFilters (src/core/subscriptions.ts): q, type, it, remote, budgetRub, skill, language.
  filters JSONB NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('telegram', 'webhook')),
  -- Webhook URL and its HMAC secret; Telegram uses the user's linked chat.
  target TEXT,
  secret TEXT,
  paused BOOLEAN NOT NULL DEFAULT false,
  -- Leads the user could see up to this instant were already sent (or skipped at creation).
  cursor_at TIMESTAMPTZ NOT NULL,
  checked_at TIMESTAMPTZ,
  last_sent_at TIMESTAMPTZ,
  failures INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS subscriptions_user_idx ON subscriptions (user_id);
CREATE INDEX IF NOT EXISTS subscriptions_due_idx ON subscriptions (checked_at NULLS FIRST) WHERE NOT paused;

-- A user's Telegram chat, linked by a one-time code sent to the hub's bot.
CREATE TABLE IF NOT EXISTS telegram_links (
  user_id BIGINT PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
  chat_id TEXT,
  code TEXT UNIQUE,
  code_expires_at TIMESTAMPTZ,
  linked_at TIMESTAMPTZ
);
