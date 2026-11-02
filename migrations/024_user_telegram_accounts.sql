-- 024_user_telegram_accounts.sql: User-connected Telegram accounts and personal sources

CREATE TABLE IF NOT EXISTS user_telegram_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id bigint NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  tg_user_id bigint NOT NULL,
  tg_username text,
  display_name text,
  phone text,
  session_encrypted text NOT NULL,
  iv text NOT NULL,
  tag text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'auth_error', 'revoked')),
  last_polled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_user_tg UNIQUE (user_id, tg_user_id)
);

CREATE TABLE IF NOT EXISTS user_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id bigint NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES user_telegram_accounts(id) ON DELETE CASCADE,
  title text NOT NULL,
  folder text,                        -- название папки в Telegram (если опрос по папке)
  chats jsonb NOT NULL DEFAULT '[]'::jsonb,   -- список конкретных chat_id / @username
  cursors jsonb NOT NULL DEFAULT '{}'::jsonb, -- {"chat_id": last_message_id} для чтения только дельты
  share_to_network boolean NOT NULL DEFAULT true, -- true: общая сеть (баллы), false: только для себя
  enabled boolean NOT NULL DEFAULT true,
  last_polled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS owner_user_id bigint REFERENCES app_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'private'));

-- Индексы для быстрой выборки общей/личной ленты и очереди поллера
CREATE INDEX IF NOT EXISTS idx_leads_visibility_owner
  ON leads (visibility, owner_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_sources_poll_queue
  ON user_sources (enabled, last_polled_at ASC NULLS FIRST);
