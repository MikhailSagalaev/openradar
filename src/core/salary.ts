/**
 * Salaries and budgets: currency, payment period (monthly, hourly, fixed) and a
 * USD-normalised value for filtering and sorting across currencies.
 */

export type PaymentPeriod = 'monthly' | 'hourly' | 'fixed';

export interface SalaryInfo {
  paymentPeriod: PaymentPeriod;
  rawSalary?: string;
  normalizedUsdMin?: number;
  normalizedUsdMax?: number;
  currency: string;
}

// Baseline exchange rates against 1 USD (updated reference)
const FX_TO_USD: Record<string, number> = {
  USD: 1.0,
  EUR: 1.08,
  GBP: 1.28,
  RUB: 1 / 92.0,
  RUR: 1 / 92.0,
  KZT: 1 / 480.0,
  BYN: 1 / 3.25,
  UAH: 1 / 41.5,
  PLN: 1 / 4.05,
  CHF: 1 / 0.88,
  AUD: 1 / 1.52,
  CAD: 1 / 1.36,
  USDT: 1.0,
  USDC: 1.0,
};

export function detectPaymentPeriod(text: string, defaultType: 'job' | 'gig' = 'gig'): PaymentPeriod {
  const lower = text.toLowerCase();

  if (
    lower.includes('/час') ||
    lower.includes('в час') ||
    lower.includes('за час') ||
    lower.includes('per hour') ||
    lower.includes('/hr') ||
    lower.includes('$/h') ||
    lower.includes('hourly')
  ) {
    return 'hourly';
  }

  if (
    lower.includes('за проект') ||
    lower.includes('за заказ') ||
    lower.includes('за весь проект') ||
    lower.includes('под ключ') ||
    lower.includes('fixed') ||
    lower.includes('фикс')
  ) {
    return 'fixed';
  }

  if (
    lower.includes('/мес') ||
    lower.includes('в месяц') ||
    lower.includes('за месяц') ||
    lower.includes('monthly') ||
    lower.includes('оклад') ||
    lower.includes('/mo')
  ) {
    return 'monthly';
  }

  return defaultType === 'job' ? 'monthly' : 'fixed';
}

export function detectCurrency(text: string): string {
  const lower = text.toLowerCase();
  if (lower.includes('$') || lower.includes('usd') || lower.includes('долл') || lower.includes('usdt')) {
    return 'USD';
  }
  if (lower.includes('€') || lower.includes('eur') || lower.includes('евро')) {
    return 'EUR';
  }
  if (lower.includes('£') || lower.includes('gbp')) {
    return 'GBP';
  }
  if (lower.includes('тенге') || lower.includes('kzt') || lower.includes('₸')) {
    return 'KZT';
  }
  // «белый», «Белгород» и пр. не валюты: только явные «бел. руб» / «белорусск» / BYN.
  if (/(?:бел\.?\s*руб|белорусск)/i.test(lower) || /\bbyn\b/i.test(lower)) {
    return 'BYN';
  }
  if (lower.includes('грн') || lower.includes('uah') || lower.includes('₴')) {
    return 'UAH';
  }
  if (lower.includes('zł') || lower.includes('zlot') || /pln/.test(lower)) {
    return 'PLN';
  }
  if (lower.includes('chf') || lower.includes('франк')) {
    return 'CHF';
  }
  if (lower.includes('a$') || lower.includes('aud') || lower.includes('australian')) {
    return 'AUD';
  }
  if (lower.includes('c$') || lower.includes('cad') || lower.includes('canadian')) {
    return 'CAD';
  }
  return 'RUB';
}

export function parseSalaryRange(text: string): { min?: number; max?: number } {
  // Strip currency symbols in front of digits, e.g. $3000 -> 3000
  const clean = text.replace(/[$€₽£₸₴]/g, ' ').replace(/\s+/g, ' ');

  // Match pattern "от X до Y" or "X - Y"
  const rangeMatch = clean.match(/(?:от\s+)?(\d[\d\s.,]*\d|\d+)\s*(?:-|до|—|–)\s*(\d[\d\s.,]*\d|\d+)/i);
  if (rangeMatch && rangeMatch[1] && rangeMatch[2]) {
    const rawMin = rangeMatch[1].replace(/[\s,]+/g, '');
    const rawMax = rangeMatch[2].replace(/[\s,]+/g, '');
    const min = parseFloat(rawMin);
    const max = parseFloat(rawMax);
    if (!Number.isNaN(min) && !Number.isNaN(max)) {
      return { min, max };
    }
  }

  // Single number preceded by "от"
  const fromMatch = clean.match(/(?:от\s+)(\d[\d\s.,]*\d|\d+)/i);
  if (fromMatch && fromMatch[1]) {
    const min = parseFloat(fromMatch[1].replace(/[\s,]+/g, ''));
    if (!Number.isNaN(min)) return { min };
  }

  // Single number preceded by "до"
  const toMatch = clean.match(/(?:до\s+)(\d[\d\s.,]*\d|\d+)/i);
  if (toMatch && toMatch[1]) {
    const max = parseFloat(toMatch[1].replace(/[\s,]+/g, ''));
    if (!Number.isNaN(max)) return { max };
  }

  // Single number with currency sign or marker
  const singleMatch = clean.match(/(\d[\d\s.,]*\d|\d+)\s*(?:₽|руб|usd|\$|eur|€|kzt|byn|uah)/i);
  if (singleMatch && singleMatch[1]) {
    const val = parseFloat(singleMatch[1].replace(/[\s,]+/g, ''));
    if (!Number.isNaN(val)) return { min: val, max: val };
  }

  return {};
}

const CURRENCY_UNIT = String.raw`₽|руб(?:лей|ля|ль|\.|,)?|р\.|usd|\$|eur|€|kzt|₸|byn|uah|₴|тенге|грн`;

function parseAmount(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const value = Number.parseFloat(raw.replace(/[\s,]+/g, ''));
  if (!Number.isFinite(value)) return undefined;
  // Filter out years, small counts and absurd numbers
  if (value < 100 || value > 50_000_000) return undefined;
  return Math.round(value);
}

/**
 * Salary extraction from free text, anchored to a currency unit or an explicit
 * marker word ("оклад", "вилка"). Without an anchor, numbers like "3 - 5 лет
 * опыта" must not become a salary, so nothing is returned.
 */
export function extractAnchoredSalary(text: string): { min?: number; max?: number } {
  const source = text.replace(/\u00a0/g, ' ');

  // "от 150 000 до 250 000 руб", "150 000 - 250 000 руб"
  const range = new RegExp(`(\\d[\\d ]{0,11})\\s*(?:-|—|–|до)\\s*(\\d[\\d ]{0,11})\\s*(?:${CURRENCY_UNIT})`, 'i').exec(source);
  if (range?.[1] && range[2]) {
    const min = parseAmount(range[1]);
    const max = parseAmount(range[2]);
    if (min !== undefined && max !== undefined) return { min, max };
  }

  // "$3000 - $5000"
  const symbolRange = /[$€₸₴]\s*(\d[\d ]{0,11})\s*(?:-|—|–)\s*[$€₸₴]?\s*(\d[\d ]{0,11})/i.exec(source);
  if (symbolRange?.[1] && symbolRange[2]) {
    const min = parseAmount(symbolRange[1]);
    const max = parseAmount(symbolRange[2]);
    if (min !== undefined && max !== undefined) return { min, max };
  }

  // Marker word anchors the amount even without a currency unit: "оклад 150 000"
  const marked = /(?:оклад|зарплат[а-я]*|вилка|ставка)\s*(?:от\s*)?(\d[\d ]{0,11})/i.exec(source);
  if (marked?.[1]) {
    const value = parseAmount(marked[1]);
    if (value !== undefined) return { min: value, max: value };
  }

  // Currency unit anchors the amount: "150 000 руб", "от 200 000 руб"
  const unitAfter = new RegExp(`(\\d[\\d ]{0,11})\\s*(?:${CURRENCY_UNIT})`, 'i').exec(source);
  if (unitAfter?.[1]) {
    const value = parseAmount(unitAfter[1]);
    if (value !== undefined) return { min: value, max: value };
  }

  // Symbol before the amount: "$5000", "€3000"
  const unitBefore = /[$€₸₴]\s*(\d[\d ]{0,11})/i.exec(source);
  if (unitBefore?.[1]) {
    const value = parseAmount(unitBefore[1]);
    if (value !== undefined) return { min: value, max: value };
  }

  return {};
}

/** A "monthly" salary above this many USD is a yearly figure (see normalizeSalary). */
export const YEARLY_SALARY_FLOOR_USD = 25_000;

export function normalizeSalary(input: {
  text?: string;
  rawSalary?: string;
  budget?: number;
  currency?: string;
  type?: 'job' | 'gig';
}): SalaryInfo {
  const combinedText = `${input.rawSalary ?? ''} ${input.text ?? ''}`.trim();
  const period = detectPaymentPeriod(combinedText, input.type ?? 'gig');
  const currency = (input.currency?.toUpperCase() || detectCurrency(combinedText)).trim();
  const rate = FX_TO_USD[currency] ?? (1 / 92.0);

  let min = input.budget;
  let max = input.budget;

  if (input.rawSalary) {
    const parsed = parseSalaryRange(input.rawSalary);
    if (parsed.min !== undefined) min = parsed.min;
    if (parsed.max !== undefined) max = parsed.max;
  } else {
    // Free text is only mined for salaries anchored to a currency/marker;
    // otherwise "3 - 5 лет опыта" would become a salary range.
    const anchored = extractAnchoredSalary(input.text ?? '');
    if (anchored.min !== undefined) min = anchored.min;
    if (anchored.max !== undefined) max = anchored.max;
  }

  // Salaries are normalised per month. International boards (Jobicy, RemoteOK) publish
  // yearly pay: an explicit year marker, or a monthly figure no job here reaches.
  const yearlyMarker = /(?:per\s+year|\/\s*(?:yr|year)|annual|в\s+год|\/\s*год)/i.test(combinedText);
  const toUsd = (value: number | undefined): number | undefined =>
    typeof value === 'number' && Number.isFinite(value) && value > 0 ? value * rate : undefined;
  let usdMin = toUsd(min);
  let usdMax = toUsd(max);
  const yearly =
    period !== 'hourly' &&
    (input.type === 'job' || period === 'monthly') &&
    (yearlyMarker || (usdMax ?? usdMin ?? 0) > YEARLY_SALARY_FLOOR_USD);
  if (yearly) {
    usdMin = usdMin === undefined ? undefined : usdMin / 12;
    usdMax = usdMax === undefined ? undefined : usdMax / 12;
  }
  const normalizedUsdMin = usdMin === undefined ? undefined : Math.round(usdMin);
  const normalizedUsdMax = usdMax === undefined ? undefined : Math.round(usdMax);

  return {
    paymentPeriod: period,
    rawSalary: input.rawSalary || (input.budget ? `${input.budget} ${currency}` : undefined),
    normalizedUsdMin,
    normalizedUsdMax,
    currency,
  };
}

/** USD value of a lead's budget: the normalised range when known, else budget × rate. */
export function budgetUsd(lead: {
  budget?: number;
  currency?: string;
  normalizedUsdMin?: number;
  normalizedUsdMax?: number;
}): number | undefined {
  const normalized = lead.normalizedUsdMax ?? lead.normalizedUsdMin;
  if (typeof normalized === 'number' && normalized > 0) return normalized;
  if (typeof lead.budget !== 'number' || !(lead.budget > 0)) return undefined;
  const rate = FX_TO_USD[(lead.currency ?? 'RUB').toUpperCase()] ?? FX_TO_USD.RUB!;
  return Math.round(lead.budget * rate);
}

/** Roubles to USD at the reference rate, for filters expressed in roubles. */
export function rubToUsd(rub: number): number {
  return Math.round(rub * FX_TO_USD.RUB!);
}
