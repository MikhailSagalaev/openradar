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

/**
 * Returns a ruble amount only when the text has a clear money marker.
 * A bare number is not enough: prices, phone numbers and years collide.
 */
export function extractBudget(text: string): number | undefined {
  const source = normalizeWhitespace(text);
  const money = /(\d{1,3}(?:[ \u00a0]\d{3})+|\d{3,7})(?:\s*)(?:₽|руб(?:\.|лей|ля|ль)?|р\.)/giu;
  const matches = [...source.matchAll(money)];
  const values: number[] = [];
  for (const match of matches) {
    const raw = match[1];
    if (!raw) continue;
    const value = Number.parseInt(raw.replace(/[ \u00a0]/g, ''), 10);
    if (!Number.isFinite(value)) continue;
    if (value >= 1900 && value <= 2100) continue;
    if (value < 100) continue;
    values.push(value);
  }
  if (!values.length) return undefined;
  return Math.max(...values);
}

export function cleanTitle(rawTitle: string, fallbackText = ''): string {
  const candidate = rawTitle || firstLine(fallbackText, 140);
  let title = stripEmoji(toPlainText(candidate))
    .replace(/^[\s«"„“]+|[\s»"”\.…]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (title.length < 6 && fallbackText) {
    title = truncate(firstLine(fallbackText, 140), 120);
  }
  if (!title) title = 'Новый заказ';
  return truncate(title, 120).replace(/[\s.,;:!?-]+$/u, '');
}
