import { describe, expect, it } from 'vitest';
import {
  detectCurrency,
  detectPaymentPeriod,
  extractAnchoredSalary,
  normalizeSalary,
  parseSalaryRange,
} from '../src/core/salary.ts';

describe('salary & currency normalization', () => {
  it('detects period correctly from job/gig context and keywords', () => {
    expect(detectPaymentPeriod('Ставка 2 500 руб/час на разработку')).toBe('hourly');
    expect(detectPaymentPeriod('Фиксированная оплата за проект 100 000 руб')).toBe('fixed');
    expect(detectPaymentPeriod('Оклад 250 000 в месяц')).toBe('monthly');
    expect(detectPaymentPeriod('Разработка сайта', 'gig')).toBe('fixed');
    expect(detectPaymentPeriod('Senior Java Developer', 'job')).toBe('monthly');
  });

  it('detects currencies accurately', () => {
    expect(detectCurrency('Зарплата $3500')).toBe('USD');
    expect(detectCurrency('Оплата 2500 EUR')).toBe('EUR');
    expect(detectCurrency('Вилка 800 000 тенге')).toBe('KZT');
    expect(detectCurrency('5000 BYN')).toBe('BYN');
    expect(detectCurrency('150 000 рублей')).toBe('RUB');
  });

  it('parses salary ranges', () => {
    expect(parseSalaryRange('от 150 000 до 250 000 руб.')).toEqual({ min: 150000, max: 250000 });
    expect(parseSalaryRange('3000 - 5000 USD')).toEqual({ min: 3000, max: 5000 });
    expect(parseSalaryRange('от 200 000 руб')).toEqual({ min: 200000 });
  });

  it('normalizes salary to canonical USD amounts', () => {
    const res = normalizeSalary({
      rawSalary: 'от 184 000 до 276 000 руб.',
      currency: 'RUB',
      type: 'job',
    });
    expect(res.paymentPeriod).toBe('monthly');
    expect(res.normalizedUsdMin).toBe(2000); // 184000 / 92
    expect(res.normalizedUsdMax).toBe(3000); // 276000 / 92
  });

  it('handles foreign currencies in USD calculation', () => {
    const res = normalizeSalary({
      rawSalary: '$3000 - $4000',
      type: 'job',
    });
    expect(res.currency).toBe('USD');
    expect(res.normalizedUsdMin).toBe(3000);
    expect(res.normalizedUsdMax).toBe(4000);
  });

  it('reads yearly pay of international boards as a monthly figure', () => {
    expect(normalizeSalary({ rawSalary: '$120,000 - $180,000', type: 'job' }).normalizedUsdMax).toBe(15000);
    expect(normalizeSalary({ budget: 90000, currency: 'USD', text: 'Salary: 90000 USD per year', type: 'job' }).normalizedUsdMax).toBe(7500);
    // A gig budget is a total, never a yearly salary.
    expect(normalizeSalary({ budget: 30000, currency: 'USD', type: 'gig' }).normalizedUsdMax).toBe(30000);
  });
});

describe('anchored salary extraction from free text', () => {
  it('ignores unanchored numbers like experience or team sizes', () => {
    expect(extractAnchoredSalary('Опыт 3 - 5 лет, команда 5 - 10 человек')).toEqual({});
    expect(extractAnchoredSalary('Звоните по номеру 8 999 123 45 67')).toEqual({});
  });

  it('extracts currency-anchored ranges and singles', () => {
    expect(extractAnchoredSalary('Вилка 150 000 - 250 000 руб')).toEqual({ min: 150000, max: 250000 });
    expect(extractAnchoredSalary('Бюджет проекта 80 000 ₽')).toEqual({ min: 80000, max: 80000 });
    expect(extractAnchoredSalary('от 200 000 руб. в месяц')).toEqual({ min: 200000, max: 200000 });
    expect(extractAnchoredSalary('Rate is $3000 - $5000 per month')).toEqual({ min: 3000, max: 5000 });
    expect(extractAnchoredSalary('Ставка 2500 ₸/час')).toEqual({ min: 2500, max: 2500 });
  });

  it('extracts marker-anchored amounts without a currency unit', () => {
    expect(extractAnchoredSalary('Оклад 180 000, оформление по ТК')).toEqual({ min: 180000, max: 180000 });
    expect(extractAnchoredSalary('вилка от 120 000 и выше')).toEqual({ min: 120000, max: 120000 });
  });

  it('does not turn free text into a salary in normalizeSalary', () => {
    const garbage = normalizeSalary({
      text: 'Требуется опыт 3 - 5 лет, команда из 5 - 10 человек',
      type: 'gig',
    });
    expect(garbage.normalizedUsdMin).toBeUndefined();
    expect(garbage.normalizedUsdMax).toBeUndefined();
  });

  it('prefers anchored text salary over nothing and keeps explicit budget otherwise', () => {
    const anchored = normalizeSalary({ text: 'Оплата 90 000 руб за этап', type: 'gig' });
    expect(anchored.normalizedUsdMin).toBe(Math.round(90000 / 92));

    const budgetOnly = normalizeSalary({ text: 'Опыт 3 - 5 лет', budget: 120000, type: 'gig' });
    expect(budgetOnly.normalizedUsdMin).toBe(Math.round(120000 / 92));
  });
});
