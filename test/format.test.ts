import { describe, expect, it } from 'vitest';
import { formatLeadText } from '../src/server/format.ts';
import { stripFormBoilerplate } from '../src/core/text.ts';

describe('lead text formatting', () => {
  it('strips application form boilerplate and telephone code chains', () => {
    const raw = 'Ищем опытного учителя математики.\n\nОтклик на вакансию: Ваше имя Фамилия Телефон +1 +7 +20 +27 +30 +31 +32 +33 +34 +36 Адрес эл. почты Я даю согласие на обработку перс. данных';
    const cleaned = stripFormBoilerplate(raw);
    expect(cleaned).toBe('Ищем опытного учителя математики.');
  });

  it('lifts skill hashtags into tags and keeps the sentence', () => {
    const out = formatLeadText('Компания ищет аналитика. Можно удалённо. Требуемые навыки: #senior, #DWH, #OraclePL/SQL.');
    expect(out.tags).toEqual(['senior', 'DWH', 'OraclePL/SQL']);
    expect(out.html).toBe('<p>Компания ищет аналитика. Можно удалённо.</p>');
  });

  it('renders lists, paragraphs, line breaks and headings', () => {
    const out = formatLeadText('Задачи:\n- вёрстка\n- интеграция с 1С\n\nСрок неделя\nбюджет обсуждаем');
    expect(out.html).toBe('<p class="lead-heading">Задачи:</p><ul><li>вёрстка</li><li>интеграция с 1С</li></ul><p>Срок неделя<br>бюджет обсуждаем</p>');
  });

  it('links URLs, escapes HTML and marks hidden contacts', () => {
    const out = formatLeadText('Пример: https://example.com/a?b=1&c=2. <b>x</b> Пишите [контакт скрыт]');
    expect(out.html).toContain('<a href="https://example.com/a?b=1&amp;c=2" target="_blank" rel="noopener noreferrer nofollow ugc">');
    expect(out.html).toContain('&lt;b&gt;x&lt;/b&gt;');
    expect(out.html).toContain('<button type="button" class="redacted-btn" onclick="openLoginModal()" title="Войдите, чтобы увидеть контакты">[контакт скрыт]</button>');
  });

  it('splits a long wall of text into paragraphs', () => {
    const wall = Array.from({ length: 12 }, (_, i) => `Предложение номер ${i} про задачу и детали проекта.`).join(' ');
    expect(formatLeadText(wall).html.match(/<p>/g)?.length).toBeGreaterThan(1);
  });
});
