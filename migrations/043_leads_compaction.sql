-- Lead lifecycle, cold step: старше RADAR_RETENTION_DAYS лид не удаляется, а сжимается на
-- месте — после того как его месяц выгружен в RADAR_ARCHIVE_DIR (полная копия на диске):
-- text обрезается до головы, которую читает /research (RESEARCH_TEXT_HEAD), embedding и
-- contacts_json очищаются. Строка, id, голоса, рейтинг, показы и доставки остаются.
--
-- Поправка к 041: архивный UPDATE (archived_at) не трогает text, поэтому TOAST-указатель
-- остаётся прежним и старые строки lz4 НЕ перепаковываются. Перепаковка в lz4 происходит
-- только при перезаписи text — то есть именно здесь, при компактизации.
ALTER TABLE leads ADD COLUMN IF NOT EXISTS compacted_at TIMESTAMPTZ;
