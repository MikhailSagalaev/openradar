/**
 * Salaries and budgets: currency, payment period (monthly, hourly, fixed) and a
 * USD-normalised value for filtering and sorting across currencies.
 */

import { RUB_PER, usdPer } from './fx.ts';

export type PaymentPeriod = 'monthly' | 'hourly' | 'fixed';

export interface SalaryInfo {
  paymentPeriod: PaymentPeriod;
  rawSalary?: string;
  normalizedUsdMin?: number;
  normalizedUsdMax?: number;
  currency: string;
  /** No pay reaches this figure: the number is something else, so the lead shows none. */
  implausible?: boolean;
}

const FX_TO_USD: Record<string, number> = Object.fromEntries(Object.keys(RUB_PER).map((code) => [code, usdPer(code)!]));

/** «150 000», with thin spaces, so every parser reads it as one amount. */
function groupThousands(value: number): string {
  return String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

function scaled(raw: string, factor: number): number {
  return Number.parseFloat(raw.replace(',', '.')) * factor;
}

function multiplierOf(word: string): number {
  return /^(?:млн|миллион|mln)/i.test(word) ? 1_000_000 : 1000;
}

const NUM = String.raw`\d+(?:[.,]\d+)?`;
/** «150к» and «150k» stand glued to the number; «тыс» and «млн» may follow a space. */
const MULT = String.raw`(?:(?<=\d)[кk]|\s?(?:тыс(?:яч[а-я]*|\.)?|млн\.?|миллион[а-я]*|mln))(?![\p{L}])`;
const CURRENCY_NEAR = String.raw`\s*(?:[₽$€£₸₴]|руб|р\.|eur|usd|pln|zł|kzt|uah|byn|грн|тенге|евро|долл)`;

const NOT_PAY_WORDS = String.raw`оборот[а-я]*|выручк[а-я]*|капитализац[а-я]*|инвестици[а-я]*|(?:средн[а-я]*\s+)?чек[а-я]*|подписк[а-я]*|revenue|turnover|arr|deal\s+sizes?|valuation|raised|funding|subscription|stipend|(?:signing|sign-on|joining|relocation|referral)\s+bonus|(?:travel|learning|training|education|equipment|wellness|home\s+office|conference)\s+(?:budget|allowance)`;
const NOT_PAY_BEFORE = new RegExp(`(?:^|[^\\p{L}])(?:${NOT_PAY_WORDS})(?![\\p{L}])[^.\\n\\d]{0,25}[$€£₽]?\\s?\\d[\\d\\s.,]*(?:[кk]|\\s?(?:тыс|млн|mln))?(?:\\s*(?:[-–—]|до|to)\\s*[$€£₽]?\\s?\\d[\\d\\s.,]*(?:[кk]|\\s?(?:тыс|млн|mln))?)?`, 'giu');
const NOT_PAY_AFTER = new RegExp(`\\d(?:[\\d\\s.,]*\\d)?(?:[кk]|\\s?(?:тыс\\.?|млн\\.?|mln))?\\s*(?:[₽$€£]|руб[а-я.]*|usd|eur)?\\s{0,3}(?:(?:annual|yearly|monthly|ежегодн[а-я]*)\\s+)?(?:${NOT_PAY_WORDS})(?![\\p{L}])`, 'giu');

/** «$781M», «$1.2 billion», «25 миллионов долларов»: a company's or a film's money, never pay. */
const BIG_FOREIGN_MONEY = /[$€£]\s?\d+(?:[.,]\d+)?\s?(?:m|mn|mln|b|bn|million|billion|млн\.?|млрд\.?|миллион[а-я]*|миллиард[а-я]*)(?![\p{L}])|\d+(?:[.,]\d+)?\s*(?:млн\.?|млрд\.?|миллион[а-я]*|миллиард[а-я]*|million|billion)\s*(?:\$|€|£|usd|eur|долл[а-я]*|евро)/giu;

/**
 * A sentence about money that is not the reader's: the ad budget a marketer has handled, the
 * profit of a launch, a market statistic. Every figure in it is out: «бюджетах от $20 тыс.,
 * желательно от $50 тыс.» names two.
 */
const NOT_PAY_SENTENCE = /реклам[а-я]*\s+бюджет|бюджет[а-я]*\s+(?:на\s+)?(?:реклам|трафик|маркетинг|продвижен)|ad\s*spend|(?:ad|ads|media|marketing|paid)\s+budgets?|открут|(?:управлени[а-я]*|управлял[а-я]*|вед[её]т[а-я]*|вел[а-я]*)\s+бюджет|manag[a-z]*\s+(?:[a-z$]+\s+){0,2}budgets?|чист[а-я]*\s+прибыл|net\s+profit|запуск[а-я]*\s+(?:на|от)\s+\d|опыт[а-я]*\s+(?:[а-я]+\s+)?запуск|\d\s*(?:млн|тыс)?[\s.]*(?:₽|руб[а-я.]*)?\s*[-–—]\s*запуск|средн[а-я]*\s+зарплат[а-я]*\s+(?:в|по|на\s+рынке)|average\s+salary\s+(?:in|for)/iu;

function maskNotPaySentences(text: string): string {
  if (!NOT_PAY_SENTENCE.test(text)) return text;
  return text
    .split(/(\n|;|!|\?|•|\.(?=\s+\p{Lu}))/u)
    .map((part) => (NOT_PAY_SENTENCE.test(part) ? part.replace(/\d/g, '#') : part))
    .join('');
}

/** Figures that are not pay turn to #, so no parser reads them. */
export function maskNotPay(text: string): string {
  return maskNotPaySentences(text.replace(BIG_FOREIGN_MONEY, (m) => m.replace(/\d/g, '#')))
    .replace(NOT_PAY_BEFORE, (m) => m.replace(/\d/g, '#'))
    .replace(NOT_PAY_AFTER, (m) => m.replace(/\d/g, '#'));
}

/**
 * Rewrites shorthand amounts into plain ones before parsing: «150к» → «150 000»,
 * «300-500к» → «300 000-500 000», «1,5 млн» → «1 500 000», «45.000,00 ₽» → «45 000 ₽»,
 * «150 000,50» → «150 000». «401k» is a US retirement plan, not pay.
 */
export function normalizeMoneyText(text: string, options: { keepNotPay?: boolean } = {}): string {
  const plain = text.replace(/401\s?\(?k\)?/gi, '401-plan');
  // Money that is not pay: a CV's «6.5 млн рублей оборота», «средний чек 100–150 тыс», «deal size of $100k».
  return (options.keepNotPay ? plain : maskNotPay(plain))
    // A range with one multiplier at the end: «300-500к», «от 70 до 150 тыс».
    .replace(new RegExp(`(${NUM})(\\s*(?:[-–—]|до)\\s*)(${NUM})(${MULT})`, 'giu'), (_m, a: string, sep: string, b: string, word: string) => {
      const factor = multiplierOf(word.trim());
      const first = scaled(a, 1);
      return `${groupThousands(first < 1000 ? first * factor : first)}${sep}${groupThousands(scaled(b, factor))}`;
    })
    .replace(new RegExp(`(${NUM})(${MULT})`, 'giu'), (_m, a: string, word: string) => groupThousands(scaled(a, multiplierOf(word.trim()))))
    // «45.000,00 ₽», «€ 1.500»: dots group thousands only next to a currency.
    .replace(new RegExp(`(\\d{1,3}(?:\\.\\d{3})+)(?:,\\d{1,2})?(?=${CURRENCY_NEAR})`, 'giu'), (m) => groupThousands(Number(m.split(',')[0]!.replace(/\./g, ''))))
    .replace(/([$€£₸₴]\s*)(\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?(?![\d.,])/gu, (_m, sign: string, n: string) => `${sign}${groupThousands(Number(n.replace(/\./g, '')))}`)
    // Kopecks and cents after grouped thousands: «150 000,50», «3,500.00».
    .replace(/(\d{1,3}(?:[  ]\d{3})+),\d{2}(?!\d)/g, '$1')
    .replace(/(\d{1,3}(?:,\d{3})+)\.\d{2}(?!\d)/g, '$1');
}

/** Pay per day or per shift: the amount is followed by «в день», «за смену», «/day». */
const DAILY_RATE = /(?:[₽$€£₸₴]|руб[а-я.]*|р\.|usd|eur|\d)\s*(?:\/|в|за|per|a)\s*(?:день|смену|сутки|day|shift)(?![\p{L}])/iu;

/** The amounts a post names per day: a day mentioned next to one sum says nothing of another. */
function dayAmounts(text: string): number[] {
  const found = normalizeMoneyText(text).matchAll(/(\d{1,3}(?:[\s,]\d{3})+|\d+)\s*(?:[₽$€£₸₴]|руб[а-я.]*|р\.?|usd|eur)?\s*(?:\/|в|за|per|a)\s*(?:день|смену|сутки|day|shift)(?![\p{L}])/giu);
  const before = normalizeMoneyText(text).matchAll(/(?:в|за|per)\s*(?:день|смену|сутки|day|shift)\s*[-–—:]\s*(\d{1,3}(?:[\s,]\d{3})+|\d+)/giu);
  return [...found, ...before].map((m) => Number(m[1]!.replace(/[\s,]/g, '')));
}

/** Working days in a month, to compare a day rate with monthly pay. */
const WORKING_DAYS_PER_MONTH = 21;

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

/**
 * Currency markers, checked in order. Letters must stand alone: as substrings «евро» is in
 * «Европа», «cad» in «academy», «aud» in «audit», «франк» in «Франкфурт», and an order for
 * a target audience in Europe came out in euros. Roubles come first after Belarusian ones: a
 * post that names roubles pays in roubles whatever else it mentions.
 */
const CURRENCY_MARKERS: Array<[string, RegExp]> = [
  // «белый», «Белгород» и пр. не валюты: только явные «бел. руб» / «белорусск» / BYN.
  ['BYN', /бел\.?\s*руб|белорусск\S*\s+руб|(?<![a-z])byn(?![a-z])/i],
  ['RUB', /₽|(?<![а-яё])руб(?:л|\.|(?![а-яё]))|(?<![a-z])rub(?![a-z])/i],
  ['USD', /\$|(?<![a-z])usdt?(?![a-z])|(?<![а-яё])долл/i],
  ['EUR', /€|(?<![a-z])eur(?![a-z])|(?<![а-яё])евро(?![а-яё])/i],
  ['GBP', /£|(?<![a-z])gbp(?![a-z])|(?<![а-яё])фунт(?:а|ов)?\s+стерлинг/i],
  ['KZT', /₸|(?<![a-z])kzt(?![a-z])|(?<![а-яё])тенге(?![а-яё])/i],
  ['UAH', /₴|(?<![a-z])uah(?![a-z])|(?<![а-яё])(?:грн|гривен|гривн)/i],
  ['PLN', /zł|(?<![a-z])pln(?![a-z])|(?<![а-яё])злот/i],
  ['CHF', /(?<![a-z])chf(?![a-z])|швейцарск\S*\s+франк/i],
  ['AUD', /a\$|(?<![a-z])aud(?![a-z])|australian\s+dollar/i],
  ['CAD', /c\$|(?<![a-z])cad(?![a-z])|canadian\s+dollar/i],
];

export function detectCurrency(text: string): string {
  // A$ and C$ are checked before the bare dollar sign.
  if (/(?<![a-z])au?\$/i.test(text)) return 'AUD';
  if (/(?<![a-z])ca?\$/i.test(text)) return 'CAD';
  for (const [code, marker] of CURRENCY_MARKERS) if (marker.test(text)) return code;
  return 'RUB';
}

export function parseSalaryRange(text: string): { min?: number; max?: number } {
  // Strip currency symbols in front of digits, e.g. $3000 -> 3000
  const clean = normalizeMoneyText(text).replace(/zł|[$€₽£₸₴]/gi, ' ').replace(/\s+/g, ' ');

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

  // Single number with currency sign or marker or standalone amount in salary field
  const singleMatch = clean.match(/(\d[\d\s.,]*\d|\d+)/);
  if (singleMatch && singleMatch[1]) {
    const val = parseFloat(singleMatch[1].replace(/[\s,]+/g, ''));
    if (!Number.isNaN(val) && val >= 100 && val <= 50_000_000) return { min: val, max: val };
  }

  return {};
}

const CURRENCY_UNIT = String.raw`₽|руб(?:лей|ля|ль|\.|,)?|р\.|usd|\$|eur|€|kzt|₸|byn|uah|₴|тенге|грн|pln|zł|gbp|£|chf|cad|aud`;
// A comma or a space separates thousands only before exactly three digits: "350,800 USD",
// "150 000 руб". Otherwise it is a list, and "Команда 5, 120 000 ₽" must not read as 5 120 000.
const AMOUNT_PATTERN = String.raw`\d{1,3}(?:[ ,]\d{3})+(?!\d)|\d+`;

function parseAmount(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const cleaned = raw.trim().replace(/^[,.\s]+|[,.\s]+$/g, '');
  const value = Number.parseFloat(cleaned.replace(/[\s,]+/g, ''));
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
  const source = normalizeMoneyText(text.replace(/\u00a0/g, ' '));

  // "от 150 000 до 250 000 руб", "150 000 - 250 000 руб"
  const range = new RegExp(`(${AMOUNT_PATTERN})\\s*(?:-|—|–|до)\\s*(${AMOUNT_PATTERN})\\s*(?:${CURRENCY_UNIT})(?![a-z])`, 'i').exec(source);
  if (range?.[1] && range[2]) {
    const min = parseAmount(range[1]);
    const max = parseAmount(range[2]);
    if (min !== undefined && max !== undefined) return { min, max };
  }

  // "$3000 - $5000", "$259,300 - $350,800". Levels of one vacancy overlap and make one range:
  // "Engineer: $184,800 - $250,000, Sr. Engineer: $223,600 - $302,500"; a bonus does not join.
  let tiers: { min: number; max: number } | undefined;
  for (const m of source.matchAll(new RegExp(`([$€₸₴])\\s*(${AMOUNT_PATTERN})\\s*(?:-|—|–)\\s*[$€₸₴]?\\s*(${AMOUNT_PATTERN})`, 'gi'))) {
    const min = parseAmount(m[2]);
    const max = parseAmount(m[3]);
    if (min === undefined || max === undefined) continue;
    if (!tiers) tiers = { min, max };
    else if (min <= tiers.max && max >= tiers.min) tiers = { min: Math.min(tiers.min, min), max: Math.max(tiers.max, max) };
  }
  if (tiers) return tiers;

  // Marker word anchors the amount even without a currency unit: "оклад 150 000"
  const marked = new RegExp(`(?:оклад|зарплат[а-я]*|вилка|ставка)\\s*(?:от\\s*)?(${AMOUNT_PATTERN})`, 'i').exec(source);
  if (marked?.[1]) {
    const value = parseAmount(marked[1]);
    if (value !== undefined) return { min: value, max: value };
  }

  // Currency unit anchors the amount: "150 000 руб", "от 200 000 руб", "350,800 USD"
  const unitAfter = new RegExp(`(${AMOUNT_PATTERN})\\s*(?:${CURRENCY_UNIT})(?![a-z])`, 'i').exec(source);
  if (unitAfter?.[1]) {
    const value = parseAmount(unitAfter[1]);
    if (value !== undefined) return { min: value, max: value };
  }

  // Symbol before the amount: "$5000", "€3000", "$350,800"
  const unitBefore = new RegExp(`([$€₸₴])\\s*(${AMOUNT_PATTERN})`, 'i').exec(source);
  if (unitBefore?.[2]) {
    const value = parseAmount(unitBefore[2]);
    if (value !== undefined) return { min: value, max: value };
  }

  return {};
}

/** A "monthly" salary above this many USD is a yearly figure (see normalizeSalary). */
export const YEARLY_SALARY_FLOOR_USD = 25_000;

/** Monthly pay above this is not pay: the top of the market, not an estimate of it. */
export const MONTHLY_PAY_CEILING_USD = 35_000;
/** The largest budget of one order: research takes 20 million roubles as its bound too. */
const PROJECT_CEILING_USD = 250_000;

/** A year marker next to an amount; «annual leave» elsewhere in the text says nothing about pay. */
const YEARLY_MARKER = /(?:\d|[kкКK]|[₽$€£]|usd|eur|руб[а-я.]*)\s*(?:\/|per|в|a|за)\s*(?:year|yr|год)(?![\p{L}])|(?:^|[^\p{L}])annual(?:ly)?\s+(?:salary|pay|compensation|base)|(?:salary|compensation|pay)[^.\n]{0,60}(?:per\s+year|annual|\/\s*(?:yr|year))|годов[а-я]*\s+(?:оклад|доход)/iu;

export function normalizeSalary(input: {
  text?: string;
  rawSalary?: string;
  budget?: number;
  currency?: string;
  type?: 'job' | 'gig';
}): SalaryInfo {
  const combinedText = `${input.rawSalary ?? ''} ${input.text ?? ''}`.trim();
  let period = detectPaymentPeriod(combinedText, input.type ?? 'gig');
  const daily = period !== 'hourly' && DAILY_RATE.test(combinedText);
  const currency = (input.currency?.toUpperCase() || detectCurrency(combinedText)).trim();
  const rate = FX_TO_USD[currency] ?? FX_TO_USD.RUB!;

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
    if (anchored.min !== undefined && (input.budget === undefined || (anchored.max !== undefined && anchored.min !== anchored.max))) {
      min = anchored.min;
      max = anchored.max ?? anchored.min;
    }
  }

  // Salaries are normalised per month. International boards (Jobicy, RemoteOK) publish
  // yearly pay: an explicit year marker, or a monthly figure no job here reaches.
  const yearlyMarker = YEARLY_MARKER.test(combinedText) || /per\s+year/i.test(input.rawSalary ?? '');
  const toUsd = (value: number | undefined): number | undefined =>
    typeof value === 'number' && Number.isFinite(value) && value > 0 ? value * rate : undefined;
  let usdMin = toUsd(min);
  let usdMax = toUsd(max);
  const top = usdMax ?? usdMin ?? 0;
  // Bounds by period (the JobSpy rule): an «hourly» rate of $500+ is a monthly or yearly figure
  // under a wrong label, and a day rate over $1500 is not one.
  if (period === 'hourly' && top > 500) period = input.type === 'job' ? 'monthly' : 'fixed';
  // «5/2 – 119 600 ₽, в день – 5200 ₽»: the sum read is the month's, only the other one is per day.
  const perDay = daily && top > 0 && top <= 1500 && dayAmounts(combinedText).some((amount) => amount === max || amount === min);
  if (perDay) {
    // «3 000 ₽ за смену» is about 63 000 ₽ a month: compared with salaries, not with them as is.
    usdMin = usdMin === undefined ? undefined : usdMin * WORKING_DAYS_PER_MONTH;
    usdMax = usdMax === undefined ? undefined : usdMax * WORKING_DAYS_PER_MONTH;
    period = 'monthly';
  }
  const roubles = currency === 'RUB' || currency === 'RUR';
  const over = (usdMax ?? usdMin ?? 0) > YEARLY_SALARY_FLOOR_USD;
  // Russian boards state pay by the month, so a huge rouble figure is not a yearly one.
  const yearly =
    period !== 'hourly' &&
    !perDay &&
    (input.type === 'job' || period === 'monthly') &&
    (yearlyMarker || (over && !roubles));
  if (yearly) {
    usdMin = usdMin === undefined ? undefined : usdMin / 12;
    usdMax = usdMax === undefined ? undefined : usdMax / 12;
  }
  const normalizedUsdMin = usdMin === undefined ? undefined : Math.round(usdMin);
  const normalizedUsdMax = usdMax === undefined ? undefined : Math.round(usdMax);
  const salaried = input.type === 'job' || period === 'monthly';
  const implausible = period !== 'hourly' && (normalizedUsdMax ?? normalizedUsdMin ?? 0) > (salaried ? MONTHLY_PAY_CEILING_USD : PROJECT_CEILING_USD);

  // A bare «170000–200000 USD» that the floor heuristic read as annual must say so:
  // without the marker it displays as a monthly figure.
  const range = min !== undefined && max !== undefined && min !== max ? `${min}–${max} ${currency}` : undefined;
  let rawSalary = input.rawSalary || range || (input.budget ? `${input.budget} ${currency}` : undefined);
  if (yearly && rawSalary && !/per\s+year|\/\s*(?:yr|year)|annual|в\s+год/i.test(rawSalary)) {
    rawSalary = `${rawSalary} per year`;
  }

  return {
    paymentPeriod: period,
    rawSalary,
    normalizedUsdMin,
    normalizedUsdMax,
    currency,
    ...(implausible ? { implausible } : {}),
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
