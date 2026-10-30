import { firstLine, normalizeWhitespace, stripEmoji, toPlainText, truncate } from './text.ts';

const CITY_PATTERNS: Array<{ city: string; pattern: RegExp }> = [
  { city: 'Москва', pattern: /(?:^|[^\p{L}])(?:москв[а-я]*|мск|зеленоград[а-я]*|химк[а-я]*|мытищ[а-я]*|подольск[а-я]*|люберц[а-я]*|балаших[а-я]*|одинцов[а-я]*)(?:[^\p{L}]|$)/iu },
  { city: 'Санкт-Петербург', pattern: /(?:^|[^\p{L}])(?:санкт-петербург[а-я]*|спб|петербург[а-я]*|пушкин[а-я]*|колпин[а-я]*)(?:[^\p{L}]|$)/iu },
  { city: 'Ставрополь', pattern: /(?:^|[^\p{L}])(?:ставропол[а-я]*|михайловск[а-я]*|пятигорск[а-я]*|кисловодск[а-я]*|ессентук[а-я]*|невинномысск[а-я]*|минеральн[а-я]*\s+вод[а-я]*)(?:[^\p{L}]|$)/iu },
  { city: 'Краснодар', pattern: /(?:^|[^\p{L}])(?:краснодар[а-я]*|крд|юмр|фмр|гмр|чмр|пашковск[а-я]*)(?:[^\p{L}]|$)/iu },
  { city: 'Сочи', pattern: /(?:^|[^\p{L}])(?:сочи|адлер[а-я]*|лазаревск[а-я]*|хост[а-я]*|красн[а-я]*\s+полян[а-я]*|сириус[а-я]*|кудепст[а-я]*|мацест[а-я]*)(?:[^\p{L}]|$)/iu },
  { city: 'Ростов-на-Дону', pattern: /(?:^|[^\p{L}])(?:ростов-на-дону|ростов[а-я]*)(?:[^\p{L}]|$)/iu },
  { city: 'Новосибирск', pattern: /(?:^|[^\p{L}])(?:новосибирск[а-я]*|нск)(?:[^\p{L}]|$)/iu },
  { city: 'Екатеринбург', pattern: /(?:^|[^\p{L}])(?:екатеринбург[а-я]*|екб)(?:[^\p{L}]|$)/iu },
  { city: 'Казань', pattern: /(?:^|[^\p{L}])(?:казан[а-я]*|кзн)(?:[^\p{L}]|$)/iu },
  { city: 'Нижний Новгород', pattern: /(?:^|[^\p{L}])(?:нижн[а-я]*\s+новгород[а-я]*|ннов)(?:[^\p{L}]|$)/iu },
];

const REMOTE_PATTERN = /(?:удаленн[а-я]*|дистанционн[а-я]*|онлайн|по\s+всей\s+россии|из\s+любой\s+точки)/iu;
const OFFLINE_PATTERN = /(?:выезд[а-я]*|очно|на\s+объект[а-я]*|на\s+месте|личн[а-я]*\s+встреч[а-я]*|в\s+офис[а-я]*|в\s+магазин[а-я]*|в\s+салон[а-я]*)/iu;

export function extractCity(text: string): string | undefined {
  for (const { city, pattern } of CITY_PATTERNS) {
    if (pattern.test(text)) return city;
  }
  if (REMOTE_PATTERN.test(text) && !OFFLINE_PATTERN.test(text)) return 'Онлайн';
  return undefined;
}

const CURRENCY_MARKERS: Array<{ re: RegExp; currency: string }> = [
  { re: /(?:byn|бел\.?\s*руб[а-я]*)/i, currency: 'BYN' },
  { re: /(?:₽|руб(?:\.|лей|ля|ль)?|р\.|rur)/i, currency: 'RUB' },
  { re: /(?:\$|usd|usdt|usdc|долл[а-я]*)/i, currency: 'USD' },
  { re: /(?:€|eur|евро)/i, currency: 'EUR' },
  { re: /(?:pln|zł|zl|злот[а-я]*)/i, currency: 'PLN' },
  { re: /(?:₸|kzt|тенге)/i, currency: 'KZT' },
  { re: /(?:₴|uah|грн[а-я]*)/i, currency: 'UAH' },
  { re: /(?:£|gbp|фунт[а-я]*)/i, currency: 'GBP' },
  { re: /(?:chf|франк[а-я]*)/i, currency: 'CHF' },
  { re: /(?:ca\$|c\$|cad)/i, currency: 'CAD' },
  { re: /(?:a\$|aud)/i, currency: 'AUD' },
];

function identifyCurrency(token: string): string | undefined {
  for (const { re, currency } of CURRENCY_MARKERS) {
    if (re.test(token)) return currency;
  }
  return undefined;
}

export interface ExtractedBudget {
  budget?: number;
  currency?: string;
}

/**
 * Multi-currency budget and salary extraction supporting ISO 4217 currencies
 * (RUB, USD, EUR, PLN, KZT, BYN, UAH, GBP, CHF, CAD, AUD).
 */
export function extractBudgetAndCurrency(text: string): ExtractedBudget {
  const source = normalizeWhitespace(text);
  const candidates: Array<{ amount: number; currency: string; priority: number }> = [];

  // 1. Symbol before amount, e.g. "$3500", "€ 2,500", "£1000", "zł 1500"
  const prefixRe = /([$€£₸₴])\s*(\d{1,3}(?:[ \u00a0,]\d{3})+|\d{2,7})(?!\d)/gu;
  for (const m of source.matchAll(prefixRe)) {
    const curr = identifyCurrency(m[1] ?? '');
    const num = Number.parseInt((m[2] ?? '').replace(/[ \u00a0,]/g, ''), 10);
    if (curr && Number.isFinite(num) && num >= 10) {
      candidates.push({ amount: num, currency: curr, priority: 2 });
    }
  }

  // 2. Amount followed by currency marker or symbol, e.g. "1500PLN", "1500 zł", "5000 руб", "150 000 ₽", "3000 USD"
  const suffixRe = /(\d{1,3}(?:[ \u00a0,]\d{3})+|\d{2,7})\s*(₽|руб(?:\.|лей|ля|ль)?|р\.|rur|\$|usd|usdt|usdc|долл[а-я]*|€|eur|евро|pln|zł|zl|злот[а-я]*|₸|kzt|тенге|byn|бел\.?\s*руб[а-я]*|₴|uah|грн[а-я]*|£|gbp|chf|cad|aud)(?!\p{L})/giu;
  for (const m of source.matchAll(suffixRe)) {
    const rawMarker = m[2] ?? '';
    const num = Number.parseInt((m[1] ?? '').replace(/[ \u00a0,]/g, ''), 10);
    const curr = identifyCurrency(rawMarker);
    // Disambiguate Ukrainian year abbreviations (e.g. "2024 р." = 2024 рік)
    const isYearAbbrev = /^(?:р\.?)$/i.test(rawMarker) && num >= 1900 && num <= 2100;
    if (curr && Number.isFinite(num) && num >= 10 && !isYearAbbrev) {
      const idx = m.index ?? 0;
      const before = source.slice(Math.max(0, idx - 20), idx).toLowerCase();
      const isExplicit = /бюджет|цена|оплата|стоимость|budget|price|rate|salary/i.test(before);
      candidates.push({ amount: num, currency: curr, priority: isExplicit ? 3 : 1 });
    }
  }

  if (!candidates.length) return {};

  candidates.sort((a, b) => b.priority - a.priority || b.amount - a.amount);
  const best = candidates[0];
  return { budget: best?.amount, currency: best?.currency };
}

/**
 * Returns a budget amount only when the text has a clear money marker.
 * Backward-compatible helper for code expecting just the numeric amount.
 */
export function extractBudget(text: string): number | undefined {
  return extractBudgetAndCurrency(text).budget;
}

/**
 * Strips budget and board-specific noise from a title string
 * (e.g. "(Бюджет: 30 000 ₽)", "- 1500PLN", "[$5000]", "(для всех)").
 */
export function stripTitleNoiseAndBudget(title: string): string {
  let cleaned = title.trim();

  // Pattern 1: (Бюджет: 150 000 ₽), (Бюджет 60 ₽, для всех), (Budget: $500)
  cleaned = cleaned.replace(/\s*\(\s*(?:Бюджет|Budget)\s*:[^)]*\)\s*$/iu, '');
  cleaned = cleaned.replace(/\s*\(\s*(?:Бюджет|Budget)\s+[^)]*\)\s*$/iu, '');

  // Pattern 2: - 1500PLN, — 3000 USD, - $500, - $6000, — 50 000 руб
  cleaned = cleaned.replace(
    /\s*[-–—|•]\s*(?:до\s+|от\s+)?(?:[$€£₽₸₴]\s*\d[\d\s\u00a0,]*(?:pln|zł|zl|usd|eur|rub|kzt|byn|uah|chf|gbp|[$€£₽₸₴]|руб(?:[а-я]+|\.)?)?|\d[\d\s\u00a0,]*(?:pln|zł|zl|usd|eur|rub|kzt|byn|uah|chf|gbp|[$€£₽₸₴]|руб(?:[а-я]+|\.)?))\s*$/iu,
    '',
  );

  // Pattern 3: [до 50 000 руб], [$6000], [1500 PLN], [3000$]
  cleaned = cleaned.replace(
    /\s*\[\s*(?:до\s+|от\s+)?(?:[$€£₽₸₴]\s*\d[\d\s\u00a0,]*(?:pln|zł|zl|usd|eur|rub|kzt|byn|uah|chf|gbp|[$€£₽₸₴]|руб(?:[а-я]+|\.)?)?|\d[\d\s\u00a0,]*(?:pln|zł|zl|usd|eur|rub|kzt|byn|uah|chf|gbp|[$€£₽₸₴]|руб(?:[а-я]+|\.)?)?)\s*\]\s*$/iu,
    '',
  );

  // Pattern 4: (для всех), (безопасная сделка), (срочно), (архив)
  cleaned = cleaned.replace(/\s*\(\s*(?:для всех|безопасная сделка|срочно|архив|удаленн[оеа-я]*)\s*\)\s*$/iu, '');

  // Leading tags like [FL.ru], [Kwork], [Freelancehunt]
  cleaned = cleaned.replace(/^\[(?:fl\.ru|fl|kwork|freelancehunt|хабр|вакансия|заказ|удаленно|удалённо|срочно)\]\s*/iu, '');

  return cleaned.trim();
}

/**
 * Expands degenerate one-word or too-short titles (e.g. "Радуга", "Сайт")
 * using the first actionable sentence from the description.
 */
function augmentShortTitle(title: string, fallbackText: string): string {
  const words = title.trim().split(/\s+/).filter(Boolean);
  if (title.length >= 10 && words.length >= 2) return title;
  if (!fallbackText) return title;

  const sentences = fallbackText
    .split(/(?<=[.!?\n])\s+/)
    .map((s) => s.trim().replace(/^[\s«"„“]+|[\s»"”\.…]+$/g, ''))
    .filter((s) => {
      if (s.length < 8) return false;
      if (/^(?:кратко|всем привет|привет|здравствуйте|добрый день|добрый вечер|описание|суть|внимание|тз)\b/i.test(s)) {
        return false;
      }
      return true;
    });

  const bestSentence = sentences[0];
  if (!bestSentence) return title;

  const trimmedSentence = truncate(bestSentence, 75);
  return `${title} — ${trimmedSentence}`;
}

export function cleanTitle(rawTitle: string, fallbackText = ''): string {
  const candidate = rawTitle || firstLine(fallbackText, 140);
  let title = stripEmoji(toPlainText(candidate))
    .replace(/^[\s«"„“]+|[\s»"”\.…]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  // Strip trailing budget suffixes and platform tags
  title = stripTitleNoiseAndBudget(title);

  // If title was empty or too small, fall back to first line
  if (title.length < 6 && fallbackText) {
    title = stripTitleNoiseAndBudget(truncate(firstLine(fallbackText, 140), 120));
  }

  // Augment single-word / degenerate titles with context from description
  if (fallbackText && title.length < 10) {
    title = augmentShortTitle(title, fallbackText);
  }

  if (!title) title = 'Новый заказ';
  return truncate(title, 120).replace(/[\s.,;:!?-]+$/u, '');
}

