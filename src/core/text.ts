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
  return `${(lastSpace > max * 0.6 ? sliced.slice(0, lastSpace) : sliced).trimEnd()}…`;
}

export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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

export { sanitizePrivacy, scrubPII, extractSubnet24 } from './privacy.ts';
export type { SourceMetadata, ScrubResult } from './privacy.ts';
