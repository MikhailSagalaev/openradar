import { createHash } from 'node:crypto';
import type { PollContext, RawLead, SourceAdapter, SourceRecord } from '../core/types.ts';
import { assertSafeUrl, safeFetchImpl } from '../core/ssrf.ts';
import { readJsonLimited } from '../net/body.ts';

/**
 * Firecrawl Alexandria (https://firecrawl.dev) — маркетплейс данных: один POST
 * /v2/scrape с блоком alexandria возвращает структурированные записи провайдера
 * (здесь BlitzAPI jobs/search, ~33k живых международных вакансий).
 *
 * Ключ задаётся переменной окружения FIRECRAWL_API_KEY и никогда не попадает
 * в конфиг источника (прецедент: Adzuna). Оплата за запись: кредиты Firecrawl
 * тратит сам оператор; пустые ответы бесплатны. Источник выключен, пока ключ
 * не задан, — принцип «без пейволлов по умолчанию» не меняется.
 */

const API_URL = 'https://api.firecrawl.dev/v2/scrape';
const MAX_BODY_BYTES = 2 * 1024 * 1024;

interface AlexandriaRecord {
  title?: string;
  url?: string;
  company_name?: string;
  ai_summary?: string;
  date_posted?: string;
  location?: { city?: string | null; country_code?: string | null } | null;
}

interface AlexandriaResponse {
  success?: boolean;
  data?: {
    alexandria?: Array<{
      provider?: string;
      capability?: string;
      creditsCost?: number;
      error?: string;
      data?: { total_results?: number; results?: AlexandriaRecord[] };
    }>;
    creditsCost?: number;
  };
}

/** "2026-11-11 11:34:25.004+01" → ISO; malformed input yields undefined, never a throw. */
function parsePosted(value: string | undefined): string | undefined {
  if (!value) return undefined;
  // The provider format is "YYYY-MM-DD HH:mm:ss.SSS±HH"; Date understands the
  // ISO variant with "T" and a ±HH:MM offset.
  const iso = value.trim().replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00');
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return undefined;
  return new Date(time).toISOString();
}

function listFrom(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);
  if (typeof value === 'string') return value.split(',').map((v) => v.trim()).filter(Boolean);
  return [];
}

export const alexandriaSource: SourceAdapter = {
  kind: 'alexandria',
  access: 'auth-required',
  defaultPollIntervalSec: 1800, // credit-costly: the board barely changes faster
  description:
    'Официальный API Firecrawl Alexandria: международные вакансии BlitzAPI одним источником. Нужен FIRECRAWL_API_KEY в переменных окружения; кредиты Firecrawl списываются за запись.',
  risks: [
    'Платно за запись: кредиты Firecrawl тратит оператор (пустые ответы бесплатны); maxResults ограничен 100 за опрос',
    'Одна страница за опрос, без пагинации по cursor: расход кредитов предсказуем',
    'ai_summary — краткая выжимка, не полный текст вакансии; ссылка ведёт на каноническую страницу (часто LinkedIn)',
    'Покрытие международное: hh.ru, SuperJob, Avito и Telegram в каталоге Jobs нет',
  ],

  async poll(source: SourceRecord, ctx: PollContext): Promise<RawLead[]> {
    const apiKey = process.env.FIRECRAWL_API_KEY?.trim();
    if (!apiKey) throw new Error('Alexandria: set FIRECRAWL_API_KEY in the environment');

    const titles = listFrom(source.config.titles ?? source.config.query);
    const countries = listFrom(source.config.countries).map((c) => c.toUpperCase());
    const lastDays = Math.max(1, Math.min(Number(source.config.lastDays ?? 30), 90));
    const maxResults = Math.max(1, Math.min(Number(source.config.maxResults ?? 20), 100));

    const job: Record<string, unknown> = { date_posted: { last_days: lastDays } };
    if (titles.length) job.title = { include: titles };
    if (countries.length) job.location = { country_code: { include: countries } };

    await assertSafeUrl(API_URL);
    const response = await safeFetchImpl(ctx.fetchImpl)(API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
        Accept: 'application/json',
        'User-Agent': ctx.userAgent,
      },
      body: JSON.stringify({ alexandria: { provider: 'blitzapi', capability: 'jobs/search', options: { job, max_results: maxResults } } }),
      signal: AbortSignal.timeout(ctx.timeoutMs),
    });
    if (!response.ok) throw new Error(`Alexandria: HTTP ${response.status}`);
    const parsed = await readJsonLimited<AlexandriaResponse>(response, MAX_BODY_BYTES);
    if (parsed.success !== true) throw new Error(`Alexandria: HTTP ${response.status} (success=false)`);

    const block = parsed.data?.alexandria?.[0];
    const results = block?.data?.results;
    if (!Array.isArray(results)) {
      ctx.logger.warn('Alexandria: no results block', { error: block?.error });
      return [];
    }
    const creditsCost = block?.creditsCost ?? parsed.data?.creditsCost;
    const totalResults = block?.data?.total_results;
    ctx.logger.info('alexandria poll', { records: results.length, creditsCost, totalResults });

    const leads: RawLead[] = [];
    for (const record of results) {
      if (!record) continue;
      const title = String(record.title ?? '').trim();
      const url = typeof record.url === 'string' && record.url.trim() ? record.url.trim() : undefined;
      if (!title && !url) continue;
      const company = typeof record.company_name === 'string' ? record.company_name.trim() || undefined : undefined;
      const summary = typeof record.ai_summary === 'string' ? record.ai_summary.trim() : '';
      const city = typeof record.location?.city === 'string' ? record.location.city.trim() || undefined : undefined;
      const countryCode = typeof record.location?.country_code === 'string' ? record.location.country_code.toUpperCase() : undefined;
      const isRemote = /remote|work from home/i.test(`${title} ${summary}`);

      const sections: string[] = [];
      if (company) sections.push(`Company: ${company}`);
      const locationLine = [city, countryCode].filter(Boolean).join(', ');
      if (locationLine) sections.push(`Location: ${locationLine}`);
      if (summary) sections.push(summary);

      const fallbackId = createHash('sha256').update(`${title}|${company ?? ''}|${record.date_posted ?? ''}`).digest('hex').slice(0, 24);
      leads.push({
        sourceId: source.id,
        type: 'job',
        externalId: `alexandria:${url ?? fallbackId}`,
        url,
        title: title || (company ? `${company} — vacancy` : 'Vacancy'),
        text: sections.length ? `${title}\n\n${sections.join('\n\n')}` : title,
        author: company,
        city: isRemote ? 'Онлайн' : city,
        isRemote,
        publishedAt: parsePosted(record.date_posted),
        raw: { provider: block?.provider ?? 'blitzapi', capability: block?.capability ?? 'jobs/search', country_code: countryCode, totalResults },
      });
    }
    return leads;
  },
};
