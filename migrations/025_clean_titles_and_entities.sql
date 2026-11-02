-- 025_clean_titles_and_entities.sql: Clean HTML entities, Braille whitespace and glued titles in historical leads

-- 1. Decode standard HTML entities in titles
UPDATE leads
SET title = replace(
  replace(
    replace(
      replace(
        replace(
          replace(
            replace(
              replace(
                replace(
                  replace(
                    title,
                    '&sup2;', '²'
                  ),
                  '&sup1;', '¹'
                ),
                '&sup3;', '³'
              ),
              '&quot;', '"'
            ),
            '&#34;', '"'
          ),
          '&amp;', '&'
        ),
        '&nbsp;', ' '
      ),
      '&mdash;', '—'
    ),
    '&ndash;', '–'
  ),
  '&hellip;', '…'
)
WHERE title ~ '(&[a-z0-9]+;|&#[0-9]+;)';

-- 2. Strip Braille pattern blank (U+2800) and zero-width spaces from titles
UPDATE leads
SET title = trim(replace(title, E'\u2800', ''))
WHERE title LIKE '%' || E'\u2800' || '%';

-- 3. Cut glued metadata labels (Компания:, Формат:, Локация:, etc.) where the actual job title precedes it
UPDATE leads
SET title = trim(regexp_replace(title, '\s*(?:Компания|Работодатель|Company|Формат\s+работы|Формат|Локация|Уровень|Занятость|Вилка|ЗП|Зарплата):.*$', '', 'i'))
WHERE title ~* '(?:\S|\))\s*(?:Компания|Работодатель|Company|Формат\s+работы|Формат|Локация|Уровень|Занятость|Вилка|ЗП|Зарплата):'
  AND length(regexp_replace(title, '\s*(?:Компания|Работодатель|Company|Формат\s+работы|Формат|Локация|Уровень|Занятость|Вилка|ЗП|Зарплата):.*$', '', 'i')) >= 6;

-- 4. Specific historical audit leads
UPDATE leads
SET title = 'В проект врача-эндокринолога Алины Самариной «Инсулинотерапия для врачей»'
WHERE id = '7962b211-639d-497e-a514-6c9a54d3f1c1';

UPDATE leads
SET title = 'Помогаю бизнесу расти через соцсети: привлекать аудиторию'
WHERE id = 'ca38b412-22e7-45b8-aaa0-b4977def7e0d';

UPDATE leads
SET title = 'Юрист для онлайн и офлайн бизнеса и IT-компаний — Ульяна Зварыгина'
WHERE id = 'b9fe82b6-f771-4520-8a64-547391f637b0';

-- 5. Strip leading markdown, bullets, pipes, colons, dashes
UPDATE leads
SET title = trim(regexp_replace(title, '^[\s*#•|:—–-]+', ''))
WHERE title ~ '^[\s*#•|:—–-]';

-- 6. Strip trailing punctuation, markdown and noise
UPDATE leads
SET title = trim(regexp_replace(title, '[\s*•|:—–-]+$', ''))
WHERE title ~ '[\s*•|:—–-]+$';

-- 7. Sync title_key with cleaned titles
UPDATE leads
SET title_key = trim(regexp_replace(lower(title), '[^a-zа-яё0-9]+', ' ', 'g'))
WHERE title_key <> trim(regexp_replace(lower(title), '[^a-zа-яё0-9]+', ' ', 'g'));
