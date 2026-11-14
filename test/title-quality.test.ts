import { describe, expect, it } from 'vitest';
import { cleanTitle } from '../src/core/extract.ts';

describe('channel-post titles: hashtag rows are tags, not titles', () => {
  it('a hashtag-only first line gives way to the first content line', () => {
    const title = cleanTitle('#ищу', '#ищу\nИщем менеджера по продажам / диагноста\nНиша: нейросети');
    expect(title).toContain('Ищем менеджера по продажам');
    expect(title).not.toContain('#ищу');
    expect(title).not.toContain('\n');
  });

  it('leading hashtags are stripped, the real title stays', () => {
    const title = cleanTitle('#ищу # ассистент #smm-специалист ИЩЕМ АССИСТЕНТА В ПРОДЮСЕРСКИЙ ЦЕНТР');
    expect(title).not.toMatch(/^#/);
    expect(title).toContain('ИЩЕМ АССИСТЕНТА В ПРОДЮСЕРСКИЙ ЦЕНТР');
  });

  it('a trailing channel tag is stripped, tags between words stay', () => {
    expect(cleanTitle('Вакансия: Руководитель направления #смм')).toBe('Вакансия: Руководитель направления');
    expect(cleanTitle('Нужен #смм специалист на канал')).toBe('Нужен #смм специалист на канал');
  });

  it('a normal title passes untouched', () => {
    expect(cleanTitle('Разработчик на Python в команду аналитики')).toBe(
      'Разработчик на Python в команду аналитики',
    );
  });

  it('skips a pure location or city first line to find the actual title', () => {
    const title = cleanTitle('Санкт-Петербург', 'Санкт-Петербург\nТребуется веб-дизайнер для редизайна сайта');
    expect(title).toBe('Требуется веб-дизайнер для редизайна сайта');
  });

  it('joins multiline titles with delimiters and cleans Braille / leading dashes', () => {
    const raw = ' ⠀ — ⠀ В проект врача диетолога\nтребуется технический специалист ';
    const title = cleanTitle(raw);
    expect(title).toBe('В проект врача диетолога · требуется технический специалист');
  });

  it('keeps the last letter when a metadata label is glued to the title', () => {
    expect(cleanTitle('РазработчикКомпания: Acme')).toContain('Разработчик');
    expect(cleanTitle('РазработчикКомпания: Acme')).not.toContain('Разработчи ');
    expect(cleanTitle('Python DeveloperCompany: Acme')).toContain('Developer');
    expect(cleanTitle('Python Developer Company: Acme')).toContain('Developer');
    expect(cleanTitle('Дизайнер Формат: удалённо')).toContain('Дизайнер');
    expect(cleanTitle('Разработчик Компания: Acme')).toBe('Разработчик');
  });
});
