-- 036_workplace_type.sql
-- Add workplace_type (onsite, hybrid, remote) to leads for accurate workplace classification.

ALTER TABLE leads ADD COLUMN IF NOT EXISTS workplace_type varchar(16) DEFAULT 'onsite';
CREATE INDEX IF NOT EXISTS idx_leads_workplace_type ON leads (workplace_type);

-- Backfill existing leads based on is_remote
UPDATE leads SET workplace_type = 'remote' WHERE is_remote = true AND (workplace_type IS NULL OR workplace_type = 'onsite');

-- Correct physical on-site roles where is_remote was incorrectly defaulted to true
UPDATE leads SET is_remote = false, workplace_type = 'onsite'
WHERE is_remote = true 
  AND (
    title ILIKE '%водитель%' OR title ILIKE '%шофер%' OR title ILIKE '%курьер%' OR
    title ILIKE '%погрузчик%' OR title ILIKE '%грузчик%' OR title ILIKE '%экспедитор%' OR
    title ILIKE '%повар%' OR title ILIKE '%бариста%' OR title ILIKE '%официант%' OR
    title ILIKE '%бармен%' OR title ILIKE '%монтажн%' OR title ILIKE '%сантехник%' OR
    title ILIKE '%электрик%' OR title ILIKE '%сварщик%' OR title ILIKE '%охранник%' OR
    title ILIKE '%сторож%' OR title ILIKE '%уборщиц%' OR title ILIKE '%клинер%' OR
    title ILIKE '%автослесар%' OR title ILIKE '%маляр%' OR title ILIKE '%кассир%' OR
    title ILIKE '%кладовщик%' OR title ILIKE '%комплектовщик%' OR title ILIKE '%фасовщик%'
  )
  AND NOT (
    title ILIKE '%диспетчер%' OR title ILIKE '%координатор%' OR
    title ILIKE '%логист%' OR title ILIKE '%менеджер%' OR title ILIKE '%оператор%'
  );
