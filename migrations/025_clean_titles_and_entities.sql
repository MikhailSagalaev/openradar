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

-- 4. Strip leading markdown, bullets, pipes, colons, dashes
UPDATE leads
SET title = trim(regexp_replace(title, '^[\s*#•|:—–-]+', ''))
WHERE title ~ '^[\s*#•|:—–-]';

-- 5. Strip trailing punctuation, markdown and noise
UPDATE leads
SET title = trim(regexp_replace(title, '[\s*•|:—–-]+$', ''))
WHERE title ~ '[\s*•|:—–-]+$';

-- title_key is rebuilt by `radar rekey` with the same rule as the app (titleKeyOf):
-- SQL cannot reproduce its NFC, ё→е and \p{L} handling.
