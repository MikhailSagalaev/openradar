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
});
