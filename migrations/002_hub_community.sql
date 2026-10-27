-- 002_hub_community.sql: Модель сообщества, голосов и типов лидов (job / gig)

-- 1. Добавляем тип лида (job/gig) и поля расширенной вакансии/заказа в существующую таблицу leads
ALTER TABLE leads ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'gig' CHECK (type IN ('job', 'gig'));
ALTER TABLE leads ADD COLUMN IF NOT EXISTS company TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS location TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS remote_type TEXT DEFAULT 'remote';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS money_min NUMERIC;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS money_max NUMERIC;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS money_period TEXT DEFAULT 'fixed';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS deadline DATE;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS lang CHAR(2) DEFAULT 'ru';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS quality_score REAL DEFAULT 0;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS votes_up INTEGER DEFAULT 0;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS votes_down INTEGER DEFAULT 0;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS votes_scam INTEGER DEFAULT 0;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS votes_closed INTEGER DEFAULT 0;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS first_seen TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_seen TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE leads ADD COLUMN IF NOT EXISTS checked_at TIMESTAMPTZ;

-- 2. Пользователи платформы (вход Telegram / GitHub)
CREATE TABLE IF NOT EXISTS app_users (
  id BIGSERIAL PRIMARY KEY,
  tg_id BIGINT UNIQUE,
  github_id BIGINT UNIQUE,
  handle TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'participant', -- visitor | participant | source_author | moderator | admin
  reputation REAL NOT NULL DEFAULT 1.0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  banned_at TIMESTAMPTZ
);

-- 3. Голоса сообщества за лиды (useful / junk / scam / closed)
CREATE TABLE IF NOT EXISTS lead_votes (
  user_id BIGINT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  lead_id TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  signal TEXT NOT NULL CHECK (signal IN ('useful', 'junk', 'scam', 'closed')),
  weight REAL NOT NULL DEFAULT 1.0,
  counted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, lead_id, signal)
);

-- 4. Склейка кросс-платформенных дубликатов (hh + habr + telegram)
CREATE TABLE IF NOT EXISTS lead_duplicates (
  lead_id TEXT PRIMARY KEY REFERENCES leads(id) ON DELETE CASCADE,
  canonical_id TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  method TEXT NOT NULL, -- exact_hash | vector_cosine | title_company
  similarity REAL NOT NULL DEFAULT 1.0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Жалобы и модерация (scam, pii, phishing)
CREATE TABLE IF NOT EXISTS lead_reports (
  id BIGSERIAL PRIMARY KEY,
  lead_id TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  user_id BIGINT REFERENCES app_users(id) ON DELETE SET NULL,
  reason TEXT NOT NULL CHECK (reason IN ('scam', 'pii', 'phishing', 'expired', 'other')),
  status TEXT NOT NULL DEFAULT 'open', -- open | resolved | dismissed
  moderator_id BIGINT REFERENCES app_users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

-- 6. События изменения репутации участников
CREATE TABLE IF NOT EXISTS reputation_events (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  delta REAL NOT NULL,
  reason TEXT NOT NULL,
  ref_lead_id TEXT REFERENCES leads(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Индексы для выборки ленты по типу, голосам и свежести
CREATE INDEX IF NOT EXISTS idx_leads_type_created ON leads(type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_community_score ON leads(score DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_votes_lead ON lead_votes(lead_id);
