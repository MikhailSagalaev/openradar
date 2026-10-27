-- 001_init.sql: Инициализация базовой схемы Radar

-- Таблица источников данных
CREATE TABLE IF NOT EXISTS sources (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  config_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Таблица лидов и вакансий
CREATE TABLE IF NOT EXISTS leads (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  external_id TEXT,
  url TEXT,
  canonical_url TEXT,
  title TEXT NOT NULL,
  text TEXT NOT NULL,
  author TEXT,
  city TEXT,
  budget DOUBLE PRECISION,
  currency TEXT DEFAULT 'RUB',
  category TEXT,
  skills_json JSONB DEFAULT '[]'::jsonb,
  is_remote BOOLEAN DEFAULT TRUE,
  metadata_json JSONB DEFAULT '{}'::jsonb,
  published_at TIMESTAMPTZ,
  fingerprint TEXT NOT NULL UNIQUE,
  title_key TEXT NOT NULL,
  status TEXT NOT NULL,
  score INTEGER NOT NULL DEFAULT 0,
  reasons_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  delivered_at TIMESTAMPTZ
);

-- Индексы для фильтрации и дедупликации
CREATE INDEX IF NOT EXISTS idx_leads_source_created ON leads(source_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_status_created ON leads(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_title_key ON leads(title_key, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_source_external ON leads(source_id, external_id) WHERE external_id IS NOT NULL;

-- Полнотекстовый поиск (GIN на tsvector)
CREATE INDEX IF NOT EXISTS idx_leads_fts_ru ON leads USING GIN (to_tsvector('russian', title || ' ' || text));

-- История доставок
CREATE TABLE IF NOT EXISTS deliveries (
  id TEXT PRIMARY KEY,
  lead_id TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  sink TEXT NOT NULL,
  status TEXT NOT NULL,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Поканальная доставка лидов для Outbox воркера
CREATE TABLE IF NOT EXISTS lead_deliveries (
  lead_id TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  sink TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, sent, failed
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (lead_id, sink)
);
CREATE INDEX IF NOT EXISTS idx_lead_deliveries_pending ON lead_deliveries(status, next_attempt_at ASC) WHERE status != 'sent';

-- Логи обходов источников
CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  finished_at TIMESTAMPTZ,
  found INTEGER NOT NULL DEFAULT 0,
  inserted INTEGER NOT NULL DEFAULT 0,
  duplicates INTEGER NOT NULL DEFAULT 0,
  rejected INTEGER NOT NULL DEFAULT 0,
  delivered INTEGER NOT NULL DEFAULT 0,
  error TEXT
);
CREATE INDEX IF NOT EXISTS idx_runs_source_started ON runs(source_id, started_at DESC);

-- Outbox события
CREATE TABLE IF NOT EXISTS outbox_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_outbox_pending ON outbox_events(status, created_at ASC) WHERE status = 'PENDING';

-- Сессии администратора (защищенные cookie)
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
