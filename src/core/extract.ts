import { normalizeMoneyText } from './salary.ts';
import { decodeHtmlEntities, firstLine, normalizeWhitespace, stripEmoji, toPlainText, truncate } from './text.ts';

const CITY_PATTERNS: Array<{ city: string; pattern: RegExp }> = [
  { city: 'Москва', pattern: /(?:^|[^\p{L}])(?:москв[а-я]*|мск|зеленоград[а-я]*|химк[а-я]*|мытищ[а-я]*|подольск[а-я]*|люберц[а-я]*|балаших[а-я]*|одинцов[а-я]*|красногорск[а-я]*|долгопрудн[а-я]*|реутов[а-я]*|королев[а-я]*|королёв[а-я]*|домодедов[а-я]*)(?:[^\p{L}]|$)/iu },
  { city: 'Санкт-Петербург', pattern: /(?:^|[^\p{L}])(?:санкт-петербург[а-я]*|спб|петербург[а-я]*|пушкин[а-я]*|колпин[а-я]*|мурин[а-я]*|кудров[а-я]*|сестрорецк[а-я]*|петергоф[а-я]*)(?:[^\p{L}]|$)/iu },
  { city: 'Ставрополь', pattern: /(?:^|[^\p{L}])(?:ставропол[а-я]*|михайловск[а-я]*|пятигорск[а-я]*|кисловодск[а-я]*|ессентук[а-я]*|невинномысск[а-я]*|минеральн[а-я]*\s+вод[а-я]*)(?:[^\p{L}]|$)/iu },
  { city: 'Краснодар', pattern: /(?:^|[^\p{L}])(?:краснодар[а-я]*|крд|юмр|фмр|гмр|чмр|пашковск[а-я]*)(?:[^\p{L}]|$)/iu },
  { city: 'Сочи', pattern: /(?:^|[^\p{L}])(?:сочи|адлер[а-я]*|лазаревск[а-я]*|хост[а-я]*|красн[а-я]*\s+полян[а-я]*|сириус[а-я]*|кудепст[а-я]*|мацест[а-я]*)(?:[^\p{L}]|$)/iu },
  { city: 'Ростов-на-Дону', pattern: /(?:^|[^\p{L}])(?:ростов-на-дону|ростов[а-я]*)(?:[^\p{L}]|$)/iu },
  { city: 'Новосибирск', pattern: /(?:^|[^\p{L}])(?:новосибирск[а-я]*|нск)(?:[^\p{L}]|$)/iu },
  { city: 'Екатеринбург', pattern: /(?:^|[^\p{L}])(?:екатеринбург[а-я]*|екб)(?:[^\p{L}]|$)/iu },
  { city: 'Казань', pattern: /(?:^|[^\p{L}])(?:казан[а-я]*|кзн)(?:[^\p{L}]|$)/iu },
  { city: 'Нижний Новгород', pattern: /(?:^|[^\p{L}])(?:нижн[а-я]*\s+новгород[а-я]*|ннов)(?:[^\p{L}]|$)/iu },
  { city: 'Самара', pattern: /(?:^|[^\p{L}])самар[а-я]*(?:[^\p{L}]|$)/iu },
  { city: 'Омск', pattern: /(?:^|[^\p{L}])омск[а-я]*(?:[^\p{L}]|$)/iu },
  { city: 'Челябинск', pattern: /(?:^|[^\p{L}])челябинск[а-я]*(?:[^\p{L}]|$)/iu },
  { city: 'Уфа', pattern: /(?:^|[^\p{L}])(?:уфа|уфе|уфу|уфой)(?:[^\p{L}]|$)/iu },
  { city: 'Волгоград', pattern: /(?:^|[^\p{L}])волгоград[а-я]*(?:[^\p{L}]|$)/iu },
  { city: 'Пермь', pattern: /(?:^|[^\p{L}])перм[ьиюя][а-я]*(?:[^\p{L}]|$)/iu },
  { city: 'Воронеж', pattern: /(?:^|[^\p{L}])воронеж[а-я]*(?:[^\p{L}]|$)/iu },
  { city: 'Саратов', pattern: /(?:^|[^\p{L}])саратов[а-я]*(?:[^\p{L}]|$)/iu },
  { city: 'Красноярск', pattern: /(?:^|[^\p{L}])красноярск[а-я]*(?:[^\p{L}]|$)/iu },
  { city: 'Тюмень', pattern: /(?:^|[^\p{L}])тюмен[ьиюя][а-я]*(?:[^\p{L}]|$)/iu },
  { city: 'Тольятти', pattern: /(?:^|[^\p{L}])тольятти(?:[^\p{L}]|$)/iu },
  { city: 'Ижевск', pattern: /(?:^|[^\p{L}])ижевск[а-я]*(?:[^\p{L}]|$)/iu },
  { city: 'Барнаул', pattern: /(?:^|[^\p{L}])барнаул[а-я]*(?:[^\p{L}]|$)/iu },
  { city: 'Ульяновск', pattern: /(?:^|[^\p{L}])ульяновск[а-я]*(?:[^\p{L}]|$)/iu },
  { city: 'Иркутск', pattern: /(?:^|[^\p{L}])иркутск[а-я]*(?:[^\p{L}]|$)/iu },
  { city: 'Хабаровск', pattern: /(?:^|[^\p{L}])хабаровск[а-я]*(?:[^\p{L}]|$)/iu },
  { city: 'Ярославль', pattern: /(?:^|[^\p{L}])ярославл[ьяею][а-я]*(?:[^\p{L}]|$)/iu },
  { city: 'Владивосток', pattern: /(?:^|[^\p{L}])владивосток[а-я]*(?:[^\p{L}]|$)/iu },
  { city: 'Махачкала', pattern: /(?:^|[^\p{L}])махачкал[а-я]*(?:[^\p{L}]|$)/iu },
  { city: 'Томск', pattern: /(?:^|[^\p{L}])томск[а-я]*(?:[^\p{L}]|$)/iu },
  { city: 'Оренбург', pattern: /(?:^|[^\p{L}])оренбург[а-я]*(?:[^\p{L}]|$)/iu },
  { city: 'Кемерово', pattern: /(?:^|[^\p{L}])кемеров[а-я]*(?:[^\p{L}]|$)/iu },
  { city: 'Новокузнецк', pattern: /(?:^|[^\p{L}])новокузнецк[а-я]*(?:[^\p{L}]|$)/iu },
  { city: 'Рязань', pattern: /(?:^|[^\p{L}])рязан[ьиюя][а-я]*(?:[^\p{L}]|$)/iu },
  { city: 'Астрахань', pattern: /(?:^|[^\p{L}])астрахан[ьиюя][а-я]*(?:[^\p{L}]|$)/iu },
  { city: 'Набережные Челны', pattern: /(?:^|[^\p{L}])набережн[а-я]*\s+челн[а-я]*(?:[^\p{L}]|$)/iu },
  { city: 'Пенза', pattern: /(?:^|[^\p{L}])пенз[а-я]*(?:[^\p{L}]|$)/iu },
  { city: 'Липецк', pattern: /(?:^|[^\p{L}])липецк[а-я]*(?:[^\p{L}]|$)/iu },
  { city: 'Киров', pattern: /(?:^|[^\p{L}])киров[а-я]*(?:[^\p{L}]|$)/iu },
  { city: 'Чебоксары', pattern: /(?:^|[^\p{L}])чебоксар[а-я]*(?:[^\p{L}]|$)/iu },
  { city: 'Тула', pattern: /(?:^|[^\p{L}])тул[аеуой](?:[^\p{L}]|$)/iu },
  { city: 'Калининград', pattern: /(?:^|[^\p{L}])калининград[а-я]*(?:[^\p{L}]|$)/iu },
  { city: 'Курск', pattern: /(?:^|[^\p{L}])курск[а-я]*(?:[^\p{L}]|$)/iu },
  { city: 'Севастополь', pattern: /(?:^|[^\p{L}])севастопол[ьяею][а-я]*(?:[^\p{L}]|$)/iu },
  { city: 'Симферополь', pattern: /(?:^|[^\p{L}])симферопол[ьяею][а-я]*(?:[^\p{L}]|$)/iu },
  { city: 'Улан-Удэ', pattern: /(?:^|[^\p{L}])улан-удэ(?:[^\p{L}]|$)/iu },
  { city: 'Тверь', pattern: /(?:^|[^\p{L}])твер[ьиюя][а-я]*(?:[^\p{L}]|$)/iu },
  { city: 'Магнитогорск', pattern: /(?:^|[^\p{L}])магнитогорск[а-я]*(?:[^\p{L}]|$)/iu },
  { city: 'Иваново', pattern: /(?:^|[^\p{L}])иванов[оеа](?:[^\p{L}]|$)/iu },
  { city: 'Брянск', pattern: /(?:^|[^\p{L}])брянск[а-я]*(?:[^\p{L}]|$)/iu },
  { city: 'Белгород', pattern: /(?:^|[^\p{L}])белгород[а-я]*(?:[^\p{L}]|$)/iu },
  { city: 'Сургут', pattern: /(?:^|[^\p{L}])сургут[а-я]*(?:[^\p{L}]|$)/iu },
  { city: 'Владимир', pattern: /(?:^|[^\p{L}])владимир[а-я]*(?:[^\p{L}]|$)/iu },
  { city: 'Чита', pattern: /(?:^|[^\p{L}])чит[аеуой](?:[^\p{L}]|$)/iu },
  { city: 'Архангельск', pattern: /(?:^|[^\p{L}])архангельск[а-я]*(?:[^\p{L}]|$)/iu },
  { city: 'Калуга', pattern: /(?:^|[^\p{L}])калуг[а-я]*(?:[^\p{L}]|$)/iu },
  { city: 'Смоленск', pattern: /(?:^|[^\p{L}])смоленск[а-я]*(?:[^\p{L}]|$)/iu },
  { city: 'Якутск', pattern: /(?:^|[^\p{L}])якутск[а-я]*(?:[^\p{L}]|$)/iu },
  { city: 'Мурманск', pattern: /(?:^|[^\p{L}])мурманск[а-я]*(?:[^\p{L}]|$)/iu },
  { city: 'Петрозаводск', pattern: /(?:^|[^\p{L}])петрозаводск[а-я]*(?:[^\p{L}]|$)/iu },
  { city: 'Новороссийск', pattern: /(?:^|[^\p{L}])новороссийск[а-я]*(?:[^\p{L}]|$)/iu },
  { city: 'Минск', pattern: /(?:^|[^\p{L}])минск[а-я]*(?:[^\p{L}]|$)/iu },
  { city: 'Алматы', pattern: /(?:^|[^\p{L}])алмат[ыае](?:[^\p{L}]|$)/iu },
  { city: 'Астана', pattern: /(?:^|[^\p{L}])астан[а-я]*(?:[^\p{L}]|$)/iu },
];

const REMOTE_PATTERN = /(?:удаленн[а-я]*|дистанционн[а-я]*|онлайн|по\s+всей\s+россии|из\s+любой\s+точки)/iu;
const OFFLINE_PATTERN = /(?:выезд[а-я]*|очно|на\s+объект[а-я]*|на\s+месте|личн[а-я]*\s+встреч[а-я]*|в\s+офис[а-я]*|в\s+магазин[а-я]*|в\s+салон[а-я]*)/iu;
const EXPLICIT_CITY_LINE_RE = /(?:^|\n)\s*(?:Регион|Город|Локация|Location|City)\s*:\s*([^\n|•]+)/iu;
const NON_CITY_VALUE_RE = /^(?:не\s+указан[а-я]*|удаленн[а-я]*|удалённ[а-я]*|дистанционн[а-я]*|онлайн|remote|worldwide|anywhere|global|любой|россия|рф|снг|eu|europe|european\s+union|us|usa|united\s+states|uk|аутсорсинг)$/iu;

export function extractCity(text: string): string | undefined {
  const explicitMatch = EXPLICIT_CITY_LINE_RE.exec(text);
  if (explicitMatch?.[1]) {
    const rawRegion = explicitMatch[1].trim();
    for (const { city, pattern } of CITY_PATTERNS) {
      if (pattern.test(rawRegion)) return city;
    }
    const cleaned = rawRegion
      .replace(/^(?:г\.|город)\s*/iu, '')
      .replace(/^[^,]+(?:область|край|республика|округ)\s*,\s*/iu, '')
      .replace(/\s*\([^)]*\)\s*$/u, '')
      .split(/s*[,;/]s*/)[0]!
      .trim();
    if (cleaned.length >= 2 && cleaned.length <= 35 && !NON_CITY_VALUE_RE.test(cleaned)) {
      return cleaned;
    }
  }
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
  { re: /(?:₹|inr|рупи[а-я]*)/i, currency: 'INR' },
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
export function extractBudgetAndCurrency(text: string, options: { keepNotPay?: boolean } = {}): ExtractedBudget {
  const source = normalizeMoneyText(normalizeWhitespace(text), options);
  const candidates: Array<{ amount: number; currency: string; priority: number }> = [];

  // 1. Symbol before amount, e.g. "$3500", "€ 2,500", "£1000", "zł 1500"
  const prefixRe = /([$€£₸₴₹])\s*(\d{1,3}(?:[ \u00a0,]\d{3})+|\d{2,7})(?!\d)/gu;
  for (const m of source.matchAll(prefixRe)) {
    const curr = identifyCurrency(m[1] ?? '');
    const num = Number.parseInt((m[2] ?? '').replace(/[ \u00a0,]/g, ''), 10);
    if (curr && Number.isFinite(num) && num >= 10) {
      candidates.push({ amount: num, currency: curr, priority: 2 });
    }
  }

  // 2. Amount followed by currency marker or symbol, e.g. "1500PLN", "1500 zł", "5000 руб", "150 000 ₽", "3000 USD"
  const suffixRe = /(\d{1,3}(?:[ \u00a0,]\d{3})+|\d{2,7})\s*(₽|руб(?:\.|лей|ля|ль)?|р\.|rur|\$|usd|usdt|usdc|долл[а-я]*|€|eur|евро|pln|zł|zl|злот[а-я]*|₸|kzt|тенге|byn|бел\.?\s*руб[а-я]*|₴|uah|грн[а-я]*|£|gbp|chf|cad|aud|₹|inr|рупи[а-я]*)(?!\p{L})/giu;
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
    .split(/\r?\n+/)
    .map((line) => line.trim())
    .filter((line) => line && !isTagOnlyLine(line) && !isLocationOrMetadataLine(line))
    .flatMap((line) => line.split(/(?<=[.!?])\s+/))
    .map((s) => s.trim().replace(/^[\s«"„“]+|[\s»"”\.…]+$/g, ''))
    .filter((s) => {
      if (s.length < 8) return false;
      if (s.toLowerCase() === title.trim().toLowerCase()) return false;
      if (/^(?:кратко|всем привет|привет|здравствуйте|добрый день|добрый вечер|описание|суть|внимание|тз|требования|обязанности|условия)\b/i.test(s)) {
        return false;
      }
      return true;
    });

  const bestSentence = sentences[0];
  if (!bestSentence) return title;

  const trimmedSentence = truncate(bestSentence, 75);
  return `${title} — ${trimmedSentence}`;
}


/** A line of nothing but hashtags («#ищу #смм») or dividers carries no title. */
function isTagOnlyLine(line: string): boolean {
  const cleaned = line.replace(/[\u2800\u200B-\u200D\uFEFF]/g, ' ').trim();
  if (!cleaned) return true;
  const tokens = cleaned.split(/\s+/).filter(Boolean);
  return tokens.length === 0 || tokens.every((t) => /^#[\wа-яё_-]+$/iu.test(t) || /^[—–·•|=*:-]+$/.test(t));
}

function isLocationOrMetadataLine(line: string): boolean {
  const trimmed = line.trim().toLowerCase().replace(/^[\s«"„“—–·•|*=*-]+|[\s»"”\.…—–·•|*=*-]+$/g, '');
  if (!trimmed) return true;
  if (/^(?:локация|город|регион|формат|занятость|тип занятости|вакансия компании|компания|работодатель|создана|опубликовано|предполагаемый уровень месячного дохода|зп|зарплата|вилка|location|city|format|company|department|team|type|category)\s*:/iu.test(trimmed)) {
    return true;
  }
  const pureMarkers = /^(?:санкт-петербург|петербург|спб|москва|мск|краснодар|крд|ростов-на-дону|новосибирск|екатеринбург|казань|нижний новгород|сочи|ставрополь|минск|киев|алматы|астана|удаленка|удалёнка|удаленно|удалённо|remote|онлайн|офис|гибрид|полная занятость|частичная занятость|парт-тайм|full-time|part-time)(?:[,\s/·|—–-]+(?:санкт-петербург|петербург|спб|москва|мск|краснодар|крд|ростов-на-дону|новосибирск|екатеринбург|казань|нижний новгород|сочи|ставрополь|минск|киев|алматы|астана|удаленка|удалёнка|удаленно|удалённо|remote|онлайн|офис|гибрид|полная занятость|частичная занятость|парт-тайм|full-time|part-time))*$/iu;
  return pureMarkers.test(trimmed);
}

/** Leading and trailing hashtags are channel tags, not title words («#ищу — #ищу»). */
function stripEdgeHashtags(title: string): string {
  return title
    // A bare «#» before a space (a broken tag) is consumed too, but never the word after it.
    .replace(/^(?:\s*(?:#[\wа-яё_-]+|#(?=\s)|[—–-]))+/giu, '')
    .replace(/(?:\s*#[\wа-яё_-]+)+$/giu, '')
    .replace(/^[\s—–-]+/, '')
    .trim();
}

/** The first line of the text that is not a hashtag row or pure city/location marker — the real title of channel posts. */
function firstContentLine(text: string): string {
  const parts = text.split('\n').map((part) => part.trim()).filter((part) => part && !isTagOnlyLine(part));
  if (!parts.length) return '';
  const meaningful = parts.find((part) => !isLocationOrMetadataLine(part));
  return meaningful ?? parts[0] ?? '';
}

export function cleanTitle(rawTitle: string, fallbackText = ''): string {
  let candidate = rawTitle || firstContentLine(fallbackText) || firstLine(fallbackText, 140);
  if (candidate.includes('\n')) {
    candidate = candidate.replace(/\r?\n+/g, ' · ');
  }
  // Decode HTML entities
  candidate = decodeHtmlEntities(candidate);

  // A hashtag-only or location-only first line is not a descriptive title: take the next content line instead.
  if ((isTagOnlyLine(candidate) || isLocationOrMetadataLine(candidate)) && fallbackText) {
    const next = firstContentLine(fallbackText);
    if (next && !isTagOnlyLine(next) && !isLocationOrMetadataLine(next)) {
      candidate = decodeHtmlEntities(next);
    }
  }

  // Strip glued metadata labels like "Компания: ...", "Формат: ...", "Локация: ..." if they follow the job title
  candidate = candidate.replace(/(?:\s*[-–—|·]\s*)?Вакансия\s+компании\s*:[\s\S]*$/iu, '').replace(/(?:\s+|[a-zа-яё0-9\)])(?:Компания|Город|Регион|Работодатель|Создана|Company|City|Location|Формат\s+работы|Формат|Локация|Уровень|Занятость|Вилка|ЗП|Зарплата)\s*:[^·\n]*/iu, '');

  let title = stripEmoji(toPlainText(candidate))
    .replace(/^[\s«"„“—–·•|*:-]+|[\s»"”\.…—–·•|*:-]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  // Leading and trailing hashtag tokens are channel tags, not title words.
  title = stripEdgeHashtags(title);

  // Strip trailing budget suffixes and platform tags
  title = stripTitleNoiseAndBudget(title);

  // If title was empty or too small, fall back to the first content line
  if (title.length < 6 && fallbackText) {
    title = stripTitleNoiseAndBudget(truncate(firstContentLine(fallbackText) || firstLine(fallbackText, 140), 120));
  }

  // Augment single-word / degenerate titles with context from description
  if (fallbackText && title.length < 10) {
    title = augmentShortTitle(title, fallbackText);
  }

  if (!title) title = 'Новый заказ';
  return truncate(title, 120).replace(/[\s.,;:!?-]+$/u, '');
}

const FULLY_REMOTE = /fully\s+remote|100%\s+remote|remote[- ]first|полностью\s+удал/i;
/** Says where the work happens, whatever the page's markup claims. */
const OFFICE_BOUND = /transition\s+to\s+on-?site|in[- ]office|hybrid|гибрид|no\s+remote|not\s+remote/i;
const REMOTE_WORD = /удал[её]нн|remote|telecommute/i;

/**
 * What a post's text says about remote work; undefined when it says nothing. An explicit
 * fully remote wins over a passing «no onsite visits», and «remote until the office opens»
 * is office work.
 */
export function remoteFromText(text: string): boolean | undefined {
  if (FULLY_REMOTE.test(text)) return true;
  if (OFFICE_BOUND.test(text) || /on-?site/i.test(text)) return false;
  return REMOTE_WORD.test(text) ? true : undefined;
}

/** schema.org marks remote jobs TELECOMMUTE; a post tied to an office overrules the mark. */
export function remoteOfPosting(jobLocationType: unknown, text: string): boolean {
  if (FULLY_REMOTE.test(text)) return true;
  if (OFFICE_BOUND.test(text)) return false;
  const types = Array.isArray(jobLocationType) ? jobLocationType : [jobLocationType];
  return types.includes('TELECOMMUTE') || remoteFromText(text) === true;
}
