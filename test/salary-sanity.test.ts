import { describe, expect, it } from 'vitest';
import { computeSalaryMedians, salaryLooksWrong } from '../src/core/salary-sanity.ts';
import { rubToUsd } from '../src/core/salary.ts';

const job = (rub: number, extra: Record<string, unknown> = {}) => ({
  type: 'job' as const,
  paymentPeriod: 'monthly' as const,
  budget: rub,
  currency: 'RUB',
  normalizedUsdMax: rubToUsd(rub),
  ...extra,
});

describe('salary sanity', () => {
  it('flags a vacancy below the floor and leaves orders, hourly and per-project pay alone', () => {
    const none = new Map<string, number>();
    expect(salaryLooksWrong(job(700), none)).toBe(true);
    expect(salaryLooksWrong(job(90_000), none)).toBe(false);
    expect(salaryLooksWrong({ ...job(500), type: 'gig' }, none)).toBe(false);
    expect(salaryLooksWrong({ ...job(1500), paymentPeriod: 'hourly' }, none)).toBe(false);
    expect(salaryLooksWrong({ ...job(5000), paymentPeriod: 'fixed' }, none)).toBe(false);
    expect(salaryLooksWrong({ type: 'job', paymentPeriod: 'monthly' }, none)).toBe(false);
  });

  it('flags pay far below the median for the role, once there are enough vacancies to trust it', () => {
    const market = Array.from({ length: 30 }, (_, i) => job(80_000 + i * 2_000));
    const hr = Array.from({ length: 25 }, () => job(150_000, { category: 'HR' }));
    const medians = computeSalaryMedians([...market, ...hr, job(700)]);
    // An HR director at 20 000 ₽: above the floor, far below everyone else.
    expect(salaryLooksWrong(job(20_000), medians)).toBe(true);
    expect(salaryLooksWrong(job(60_000), medians)).toBe(false);
    // The role's own median decides when it has one: 40 000 ₽ is too little for this HR group.
    expect(salaryLooksWrong(job(40_000, { category: 'HR' }), medians)).toBe(true);
    expect(salaryLooksWrong(job(60_000, { category: 'HR' }), medians)).toBe(false);
    // A thin sample gives no median.
    expect(computeSalaryMedians(market.slice(0, 5)).size).toBe(0);
  });
});
