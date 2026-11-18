-- Soft archive (hot/warm/cold): старые лиды прячутся из фида/API (archived_at), но
-- остаются в этой же таблице — десять таблиц ссылаются на leads каскадами, удаление
-- стёрло бы рейтинговый гроссбух и историю доставок. Текст вакансии сжимается zstd
-- на уровне TOAST (~4x); существующие строки перепишутся при архивном UPDATE.
ALTER TABLE leads ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE leads ALTER COLUMN text SET COMPRESSION zstd;
CREATE INDEX IF NOT EXISTS idx_leads_archived ON leads(archived_at) WHERE archived_at IS NOT NULL;
