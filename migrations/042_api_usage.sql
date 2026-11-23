-- Agent analytics (план A, 2026-11-19): агрегаты вызовов по измерениям — ни строки на вызов,
-- ни IP, ни PII. Один upsert-счётчик на комбинацию (день × поверхность × маршрут/инструмент ×
-- уровень зрителя × класс клиента × метка источника). Активность токенов — отдельная таблица
-- «токен был активен в день», одна строка на токен-день, даёт COUNT(DISTINCT) по любому окну.
CREATE TABLE IF NOT EXISTS api_usage_daily (
    day DATE NOT NULL,
    surface TEXT NOT NULL,
    detail TEXT NOT NULL,
    tier TEXT NOT NULL,
    client TEXT NOT NULL,
    via TEXT NOT NULL DEFAULT '',
    calls INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (day, surface, detail, tier, client, via)
);
CREATE TABLE IF NOT EXISTS api_token_days (
    day DATE NOT NULL,
    user_id BIGINT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    PRIMARY KEY (day, user_id)
);
