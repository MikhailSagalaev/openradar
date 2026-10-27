-- 003_pgvector_halfvec.sql: Оптимизация векторного индекса HNSW с переходом на halfvec(384)

-- 1. Подключение расширения pgvector и создание столбца embedding halfvec(384)
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS vector;
  ALTER TABLE leads ADD COLUMN IF NOT EXISTS embedding halfvec(384);
  CREATE INDEX IF NOT EXISTS idx_leads_embedding_hnsw 
    ON leads USING hnsw (embedding halfvec_cosine_ops)
    WITH (m = 16, ef_construction = 64);
EXCEPTION WHEN undefined_file OR feature_not_supported THEN
  RAISE NOTICE 'pgvector extension is not available in this environment; skipping halfvec index';
END $$;

-- 2. Обновление колонок голосов на REAL для поддержки дробных весов участников
ALTER TABLE leads ALTER COLUMN votes_up TYPE REAL USING votes_up::REAL;
ALTER TABLE leads ALTER COLUMN votes_down TYPE REAL USING votes_down::REAL;
ALTER TABLE leads ALTER COLUMN votes_scam TYPE REAL USING votes_scam::REAL;
ALTER TABLE leads ALTER COLUMN votes_closed TYPE REAL USING votes_closed::REAL;
