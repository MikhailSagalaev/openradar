import { describe, expect, it } from 'vitest';
import { extractBudgetAndCurrency } from '../src/core/extract.ts';
import { normalizeMoneyText, normalizeSalary, parseSalaryRange } from '../src/core/salary.ts';

describe('shorthand amounts', () => {
  it('expands к, k, тыс and млн', () => {
    expect(normalizeMoneyText('Зп: от 150к')).toBe('Зп: от 150 000');
    expect(normalizeMoneyText('$170k-$300k + equity')).toBe('$170 000-$300 000 + equity');
    expect(normalizeMoneyText('ЗП от 70 до 150 тыс рублей')).toBe('ЗП от 70 000 до 150 000 рублей');
    expect(normalizeMoneyText('один заказ 25-30к')).toBe('один заказ 25 000-30 000');
    expect(normalizeMoneyText('бюджет 1,5 млн ₽')).toBe('бюджет 1 500 000 ₽');
    expect(normalizeMoneyText('300-500к гросс')).toBe('300 000-500 000 гросс');
  });

  it('reads dotted thousands and drops kopecks', () => {
    expect(normalizeMoneyText('Оклад 45.000,00 ₽')).toBe('Оклад 45 000 ₽');
    expect(normalizeMoneyText('€ 1.500 per month')).toBe('€ 1 500 per month');
    expect(normalizeMoneyText('150 000,50 руб')).toBe('150 000 руб');
    expect(normalizeMoneyText('$3,500.00')).toBe('$3,500');
  });

  it('leaves 401k, 4k screens and versions alone', () => {
    expect(normalizeMoneyText('Generous 401k match')).toBe('Generous 401-plan match');
    expect(normalizeMoneyText('Python 3.12, 2 монитора')).toBe('Python 3.12, 2 монитора');
    expect(extractBudgetAndCurrency('4k display and MacBook Pro')).toEqual({});
  });

  it('does not take turnover, an average check or a deal size for pay', () => {
    expect(extractBudgetAndCurrency('за 4 месяца она принесла 6.5 млн рублей оборота')).toEqual({});
    expect(extractBudgetAndCurrency('средний чек 100–150 тыс. ₽, с одной продажи тебе 10–15 тыс. ₽')).toEqual({ budget: 15_000, currency: 'RUB' });
    expect(extractBudgetAndCurrency('average deal size of $100k+, base salary $150k')).toEqual({ budget: 150_000, currency: 'USD' });
    expect(extractBudgetAndCurrency('Sales Manager, $5000 per month')).toEqual({ budget: 5000, currency: 'USD' });
    expect(extractBudgetAndCurrency('Менеджер по продажам, оклад 80 000 ₽')).toEqual({ budget: 80_000, currency: 'RUB' });
  });

  it('feeds the budget and the salary range', () => {
    expect(extractBudgetAndCurrency('Зарплата от 150к руб')).toEqual({ budget: 150_000, currency: 'RUB' });
    expect(extractBudgetAndCurrency('Salary: £100k–£120k')).toEqual({ budget: 120_000, currency: 'GBP' });
    expect(parseSalaryRange('от 70 до 150 тыс. руб.')).toEqual({ min: 70_000, max: 150_000 });
  });
});

describe('payment period bounds', () => {
  it('compares a shift rate with monthly pay', () => {
    const shift = normalizeSalary({ text: 'Оплата 3 000 ₽ за смену', type: 'job', currency: 'RUB' });
    expect(shift.paymentPeriod).toBe('monthly');
    expect(shift.normalizedUsdMax).toBe(Math.round((3000 / 92) * 21));
  });

  it('does not take a day mentioned elsewhere for a day rate', () => {
    const job = normalizeSalary({ text: 'Оклад 90 000 ₽. Отвечать клиентам 20 раз в день', type: 'job', currency: 'RUB' });
    expect(job.normalizedUsdMax).toBe(Math.round(90_000 / 92));
  });

  it('does not keep an «hourly» rate of thousands of dollars hourly', () => {
    const wrong = normalizeSalary({ text: 'Pay: 6000 USD per hour', budget: 6000, type: 'job', currency: 'USD' });
    expect(wrong.paymentPeriod).toBe('monthly');
    expect(normalizeSalary({ text: 'Pay: 40 USD per hour', budget: 40, type: 'job', currency: 'USD' }).paymentPeriod).toBe('hourly');
  });
});
