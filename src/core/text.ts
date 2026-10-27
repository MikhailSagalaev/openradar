const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  mdash: '—',
  ndash: '–',
  laquo: '«',
  raquo: '»',
  rsquo: '’',
  lsquo: '‘',
  hellip: '…',
  copy: '©',
  reg: '®',
  trade: '™',
};

export function decodeHtmlEntities(input: string): string {
  if (!input) return '';
  return input
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex: string) => {
      const code = Number.parseInt(hex, 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : '';
    })
    .replace(/&#(\d+);/g, (_match, dec: string) => {
      const code = Number.parseInt(dec, 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : '';
    })
    .replace(/&([a-z][a-z0-9]+);/gi, (match, name: string) => {
      const value = NAMED_ENTITIES[name.toLowerCase()];
      return value ?? match;
    });
}

export function stripHtml(input: string): string {
  if (!input) return '';
  return decodeHtmlEntities(
    input
      .replace(/<\s*(br|br\/)\s*>/gi, '\n')
      .replace(/<\s*\/\s*(p|div|li|h[1-6])\s*>/gi, '\n')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' '),
  );
}

export function stripEmoji(input: string): string {
  return input.replace(/\p{Extended_Pictographic}/gu, '').replace(/\uFE0F/g, '');
}

export function normalizeWhitespace(input: string): string {
  return input
    .replace(/\u00a0/g, ' ')
    .replace(/[\u200b-\u200d\ufeff]/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Plain text from an arbitrary feed/HTML fragment. */
export function toPlainText(input: string): string {
  return normalizeWhitespace(stripEmoji(stripHtml(input)));
}

export function normalizeForMatch(input: string): string {
  return input
    .toLocaleLowerCase('ru-RU')
    .replace(/\u0451/g, '\u0435')
    .replace(/\s+/g, ' ')
    .trim();
}

export function truncate(input: string, max: number): string {
  if (input.length <= max) return input;
  const sliced = input.slice(0, max - 1);
  const lastSpace = sliced.lastIndexOf(' ');
  const base = (lastSpace > max * 0.6 ? sliced.slice(0, lastSpace) : sliced).trimEnd();
  // A truncation cut mid-parenthesis («Разработка… (Draft») leaves unbalanced
  // brackets: drop the incomplete trailing group instead.
  const balanced = base.replace(/\s*\([^()]*$/, '').trimEnd();
  return `${balanced}…`;
}

/** FL.ru and friends append « (Бюджет: 30 000 ₽)» to the RSS title; it is stored separately. */
export function stripBudgetTitleSuffix(input: string): string {
  return input.replace(/\s*\(\s*(?:Бюджет|Budget)\s*:[^)]*\)\s*$/i, '').trim();
}

/** Remote work mentioned in a title or text. Kept in sync with the SQL filter in the Postgres store. */
export const REMOTE_TEXT_RE = /удал[её]нн|удал[её]нк|можно\s+удал|remote/i;

/** A lead can be done remotely: no city, an «Онлайн»/«Удалённо» city, or remote work in the text. */
export function isRemoteLead(lead: { city?: string; title: string; text: string }): boolean {
  if (!lead.city || /^(онлайн|удал)/i.test(lead.city)) return true;
  return REMOTE_TEXT_RE.test(`${lead.title}\n${lead.text}`);
}


/** Lightweight tech-tag extractor: canonical skill names found in title+text. */
const TECH_SKILL_PATTERNS: Array<[RegExp, string]> = [
  [/(^|[^a-zа-яё0-9])1\s?[сc]([^a-zа-яё0-9]|$)/i, '1С'],
  [/\bclaude\b/i, 'Claude'],
  [/\bgpt\b|chatgpt/i, 'GPT'],
  [/\bmidjourney\b/i, 'Midjourney'],
  [/\bpython\b/i, 'Python'],
  [/\bjavascript\b|\bjs\b/i, 'JavaScript'],
  [/\btypescript\b|\bts\b/i, 'TypeScript'],
  [/\breact\b|react native/i, 'React'],
  [/\bvue\b/i, 'Vue'],
  [/\bnode(?:\.?js)?\b/i, 'Node.js'],
  [/\bphp\b/i, 'PHP'],
  [/\bgolang\b|\bgo\b(?![a-z])/i, 'Golang'],
  [/\bjava\b(?!script)/i, 'Java'],
  [/\bkotlin\b/i, 'Kotlin'],
  [/\bswift\b/i, 'Swift'],
  [/\bc\+\+/i, 'C++'],
  [/\bc#/i, 'C#'],
  [/\.net|dotnet/i, '.NET'],
  [/\bdjango\b/i, 'Django'],
  [/\blaravel\b/i, 'Laravel'],
  [/\bwordpress\b/i, 'WordPress'],
  [/\bwoocommerce\b/i, 'WooCommerce'],
  [/\bbitrix\b|битрикс/i, 'Битрикс'],
  [/\bopencart\b/i, 'OpenCart'],
  [/\btilda\b|тильда/i, 'Tilda'],
  [/\bfigma\b|фигм/i, 'Figma'],
  [/\bphotoshop\b|\bps\b(?![a-z])/i, 'Photoshop'],
  [/\billustrator\b/i, 'Illustrator'],
  [/after effects/i, 'After Effects'],
  [/\bautocad\b|автокад/i, 'AutoCAD'],
  [/\brevit\b/i, 'Revit'],
  [/\bblender\b/i, 'Blender'],
  [/\bcorel\s?draw\b/i, 'CorelDRAW'],
  [/\bsql\b/i, 'SQL'],
  [/\bpostgres\w*\b|постгрес/i, 'PostgreSQL'],
  [/\bmysql\b/i, 'MySQL'],
  [/\bmongo\w*\b/i, 'MongoDB'],
  [/\bdocker\b/i, 'Docker'],
  [/\bflutter\b/i, 'Flutter'],
  [/\bunity\b/i, 'Unity'],
  [/\bseo\b/i, 'SEO'],
  [/\bsmm\b/i, 'SMM'],
  [/\bexcel\b|экзел|эксель/i, 'Excel'],
  [/телеграм\w*\s*\(?бот|telegram\s*bot/i, 'Telegram Bot'],
  [/нейросет\w*/i, 'Нейросети'],
  [/видеомонтаж|монтаж\S*\s+(?:видео|ролик|reels|клип)|premiere|davinci|reels-?мейкер/i, 'Видеомонтаж'],
  [/моушн|motion\s*design/i, 'Моушн-дизайн'],
  [/логотип|брендбук|фирменн\S*\s+стил|брендинг/i, 'Брендинг'],
  [/иллюстрац|illustration/i, 'Иллюстрация'],
  [/(?:^|[^a-zа-яё0-9])3[dд](?:[^a-zа-яё0-9]|$)|3d-|моделировани/i, '3D'],
  [/копирайт|рерайт|написать\s+(?:текст|стат)|статьи\s+для|сценари/i, 'Тексты'],
  [/перевод(?:чик|\s+(?:текст|с\s|на\s))|translat/i, 'Переводы'],
  [/таргет|targeting/i, 'Таргет'],
  [/директолог|яндекс\.?\s?директ|google\s+ads|контекстн\S*\s+реклам|(?:^|[^а-яё])директ(?![а-яё])/i, 'Контекстная реклама'],
  [/авито|avito/i, 'Авито'],
  [/wildberries|(?:^|[^a-z])wb(?:[^a-z]|$)|ozon|озон|маркетплейс/i, 'Маркетплейсы'],
  [/бухгалт|accountant/i, 'Бухгалтерия'],
  [/юрист|юридическ|lawyer/i, 'Юриспруденция'],
  [/репетитор|преподава|tutor|teacher/i, 'Обучение'],
  [/фотограф|ретуш|фотосесси/i, 'Фото'],
  [/менеджер\S*\s+по\s+продаж|холодн\S*\s+звон|sales\s+(?:manager|representative)/i, 'Продажи'],
  [/поддержк\S*\s+(?:клиент|пользоват)|customer\s+support|оператор\S*\s+(?:чата|колл)/i, 'Поддержка'],
];

export function extractTechSkills(input: string, max = 8): string[] {
  if (!input) return [];
  const found: string[] = [];
  for (const [pattern, name] of TECH_SKILL_PATTERNS) {
    if (pattern.test(input)) {
      found.push(name);
      if (found.length >= max) break;
    }
  }
  return found;
}

export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * JSON for an inline <script> block (e.g. JSON-LD). JSON.stringify alone does not
 * escape `</script>`: every `<`, `>`, `&` and line separator becomes a \\u escape,
 * which is still valid JSON and can never close the script element.
 */
export function jsonForScript(value: unknown): string {
  return JSON.stringify(value, null, 2)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

/** One-line plain text for short fields (author, city, category): no markup, no control chars. */
export function cleanShortField(input: string | undefined, max = 200): string | undefined {
  if (typeof input !== 'string') return undefined;
  const text = toPlainText(input).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
  return text ? truncate(text, max) : undefined;
}

export function firstLine(input: string, max = 120): string {
  const line = input.split('\n').map((part) => part.trim()).find(Boolean) ?? '';
  return truncate(line, max);
}

export function sanitizeUrl(input: string | undefined): string | undefined {
  if (!input) return undefined;
  const trimmed = input.trim();
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.toString();
    }
  } catch {
    return undefined;
  }
  return undefined;
}

export function slugify(input: string): string {
  const map: Record<string, string> = {
    а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z',
    и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r',
    с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch',
    ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
  };
  return input
    .toLowerCase()
    .split('')
    .map((char) => map[char] ?? char)
    .join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

/**
 * Normalizes IT tech tokens with special characters (C++, C#, .NET, 1C, etc.)
 * so that full-text search tokenizers (to_tsvector) and morphology stemmers
 * do not strip punctuation or discard them as single letters.
 */
export function normalizeTechTokens(input: string): string {
  if (!input) return '';
  return input
    .replace(/(^|[^a-zA-Z0-9_])c\+\+(?=[^a-zA-Z0-9_]|$)/gi, '$1cpp_tech')
    .replace(/(^|[^a-zA-Z0-9_])c#(?=[^a-zA-Z0-9_]|$)/gi, '$1csharp_tech')
    .replace(/(^|[^a-zA-Z0-9_])f#(?=[^a-zA-Z0-9_]|$)/gi, '$1fsharp_tech')
    .replace(/(^|[^a-zA-Z0-9_])\.net(?=[^a-zA-Z0-9_]|$)/gi, '$1dotnet_tech')
    .replace(/(^|[^a-zA-Z0-9_])dot\s*net(?=[^a-zA-Z0-9_]|$)/gi, '$1dotnet_tech')
    .replace(/(^|[^a-zA-Z0-9_])1[сc](?=[^a-zA-Z0-9_]|$)/gi, '$1onec_tech')
    .replace(/(^|[^a-zA-Z0-9_])node(?:\.js|js)(?=[^a-zA-Z0-9_]|$)/gi, '$1nodejs_tech')
    .replace(/(^|[^a-zA-Z0-9_])next(?:\.js|js)(?=[^a-zA-Z0-9_]|$)/gi, '$1nextjs_tech')
    .replace(/(^|[^a-zA-Z0-9_])nuxt(?:\.js|js)(?=[^a-zA-Z0-9_]|$)/gi, '$1nuxtjs_tech')
    .replace(/(^|[^a-zA-Z0-9_])vue(?:\.js|js)(?=[^a-zA-Z0-9_]|$)/gi, '$1vuejs_tech')
    .replace(/(^|[^a-zA-Z0-9_])nest(?:\.js|js)(?=[^a-zA-Z0-9_]|$)/gi, '$1nestjs_tech')
    .replace(/(^|[^a-zA-Z0-9_])golang(?=[^a-zA-Z0-9_]|$)/gi, '$1golang_tech');
}

