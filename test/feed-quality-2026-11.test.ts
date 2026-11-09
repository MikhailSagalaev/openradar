import { describe, expect, it } from 'vitest';
import { extractBudgetAndCurrency } from '../src/core/extract.ts';
import { detectPaymentPeriod } from '../src/core/salary.ts';
import { extractSkills, titleForLanguage } from '../src/core/text.ts';

describe('pay that is not compensation', () => {
  it('keeps the salary when the same post names an ads budget', () => {
    const text = 'Ищем таргетолога. Запускаем ежемесячно $100,000+ на Facebook Ads. Оклад $3,000/месяц.';
    expect(extractBudgetAndCurrency(text).budget).toBe(3000);
  });

  it('does not read a client project budget as the fee', () => {
    expect(extractBudgetAndCurrency('Проекты с бюджетом до 1,5 млн. Оплата 80 000 ₽ за проект.').budget).toBe(80_000);
  });

  it('reads PLN/h as hourly', () => {
    expect(detectPaymentPeriod('80–105 PLN/h', 'job')).toBe('hourly');
  });
});

describe('skills and language', () => {
  it('does not tag ordinary English words as tools', () => {
    expect(extractSkills('Merchant', 'take swift, strategic actions in ps and illustration')).not.toEqual(
      expect.arrayContaining(['Swift', 'Photoshop', 'Иллюстрация']),
    );
  });

  it('keeps a real tool and drops a partner mention', () => {
    expect(extractSkills('iOS разработчик', 'Swift и Xcode')).toContain('Swift');
    expect(extractSkills('Менеджер', 'наши партнеры БИТРИКС 24')).not.toContain('Битрикс');
    expect(extractSkills('Разработчик Битрикс', 'нужен программист на битрикс')).toContain('Битрикс');
  });

  it('ignores adapter labels when deciding the language', () => {
    const title = 'Fabletics Merchant | Компания: Fabletics | Город: Remote';
    expect(titleForLanguage(title)).not.toMatch(/[А-Яа-яЁё]/);
  });
});
