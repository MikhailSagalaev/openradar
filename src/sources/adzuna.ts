import type { RawLead, SourceAdapter, SourceRecord, PollContext } from '../core/types.ts';
import { fetchText } from './http.ts';
import { stripHtml } from '../core/text.ts';

/**
 * Adzuna (https://developer.adzuna.com) — официальный API агрегатора вакансий
 * с покрытием ~20 стран. Ключи задаются переменными окружения
 * RADAR_ADZUNA_APP_ID / RADAR_ADZUNA_APP_KEY и никогда не попадают в конфиг
 * источника (прецедент: IMAP passwordEnv).
 *
 * Бесплатный тариф: 250 вызовов в сутки; одна страница = один вызов.
 */

const CURRENCY_BY_COUNTRY: Record<string, string> = {
  us: 'USD', gb: 'GBP', de: 'EUR', fr: 'EUR', nl: 'EUR', es: 'EUR', it: 'EUR', ie: 'EUR',
  at: 'EUR', be: 'EUR', pt: 'EUR', fi: 'EUR', gr: 'EUR', lu: 'EUR', no: 'EUR', se: 'SEK',
  pl: 'PLN', ru: 'RUB', in: 'INR', br: 'BRL', za: 'ZAR', au: 'AUD', ca: 'CAD', ch: 'CHF',
  mx: 'MXN', sg: 'SGD', nz: 'NZD', jp: 'JPY',
};

interface AdzunaJob {
  id?: string;
  title?: string;
  description?: string;
  redirect_url?: string;
  created?: string;
  company?: { display_name?: string };
  location?: { display_name?: string };
  salary_min?: number | null;
  salary_max?: number | null;
  salary_is_predicted?: string | number;
  contract_time?: string | null;
  category?: { label?: string };
}

export const adzunaSource: SourceAdapter = {
  kind: 'adzuna',
  access: 'official',
  description:
    'Официальный API Adzuna: вакансии ~20 стран одним источником. Нужны ключи RADAR_ADZUNA_APP_ID и RADAR_ADZUNA_APP_KEY в переменных окружения.',
  risks: [
    'Бесплатный тариф ограничен 250 вызовами в сутки: один тик — одна страница',
    'Зарплаты приходят в валюте страны: конвертируются общим USD-нормализатором',
  ],

  async poll(source: SourceRecord, ctx: PollContext): Promise<RawLead[]> {
    const appId = process.env.RADAR_ADZUNA_APP_ID?.trim();
    const appKey = process.env.RADAR_ADZUNA_APP_KEY?.trim();
    if (!appId || !appKey) {
      throw new Error('Adzuna: set RADAR_ADZUNA_APP_ID and RADAR_ADZUNA_APP_KEY in the environment');
    }

    const country = (typeof source.config.country === 'string' ? source.config.country : 'us').trim().toLowerCase() || 'us';
    const what = typeof source.config.what === 'string' ? source.config.what.trim() : '';
    const limit = Math.max(1, Math.min(Number(source.config.limit ?? 50), 50));
    const page = Math.max(1, Number(source.config.page ?? 1) || 1);
    const maxDaysOld = Math.max(1, Math.min(Number(source.config.maxDaysOld ?? 7), 30));

    const url = new URL(`https://api.adzuna.com/v1/api/jobs/${encodeURIComponent(country)}/search/${page}`);
    url.searchParams.set('app_id', appId);
    url.searchParams.set('app_key', appKey);
    url.searchParams.set('results_per_page', String(limit));
    url.searchParams.set('max_days_old', String(maxDaysOld));
    url.searchParams.set('content-type', 'application/json');
    if (what) url.searchParams.set('what', what);

    const jsonText = await fetchText(ctx, url.toString(), { Accept: 'application/json' });

    let jobs: AdzunaJob[] = [];
    try {
      const parsed = JSON.parse(jsonText) as { results?: AdzunaJob[] };
      jobs = Array.isArray(parsed.results) ? parsed.results : [];
    } catch (error) {
      ctx.logger.warn('Adzuna: failed to parse JSON response', {
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }

    const currency = CURRENCY_BY_COUNTRY[country] ?? 'USD';
    const leads: RawLead[] = [];
    for (const job of jobs) {
      if (!job || !job.id || !job.title) continue;
      const title = String(job.title).trim();
      if (!title) continue;

      const company = job.company?.display_name?.trim();
      const location = job.location?.display_name?.trim() ?? '';
      const isRemote = /remote|work from home|anywhere/i.test(`${location} ${title}`);
      const predicted = String(job.salary_is_predicted ?? '1') !== '0';
      const min = typeof job.salary_min === 'number' && job.salary_min > 0 ? Math.round(job.salary_min) : undefined;
      const max = typeof job.salary_max === 'number' && job.salary_max > 0 ? Math.round(job.salary_max) : undefined;
      // "1" means Adzuna guessed the number; only real ranges go into the budget.
      const budget = !predicted && (min ?? max) !== undefined ? (min ?? max) : undefined;
      const annual = job.contract_time === 'full_time';
      const rawSalary = min !== undefined || max !== undefined
        ? `${min !== undefined ? min : ''}${min !== undefined && max !== undefined ? ' - ' : ''}${max ?? ''} ${currency}${annual ? ' per year' : ''}`.trim()
        : undefined;

      const sections: string[] = [];
      if (company) sections.push(`Company: ${company}`);
      if (location) sections.push(`Location: ${location}`);
      if (job.category?.label) sections.push(`Category: ${job.category.label}`);
      if (rawSalary) sections.push(`Salary: ${rawSalary}`);
      if (job.description) sections.push(stripHtml(job.description).trim());

      leads.push({
        sourceId: source.id,
        type: 'job',
        externalId: `adzuna:${job.id}`,
        url: job.redirect_url || undefined,
        title,
        text: sections.length ? `${title}\n\n${sections.join('\n\n')}` : title,
        author: company,
        city: location || undefined,
        budget,
        currency,
        rawSalary,
        category: job.category?.label || undefined,
        isRemote,
        publishedAt: job.created,
        raw: { adzunaId: job.id, country, contractTime: job.contract_time ?? undefined },
      });
    }
    return leads;
  },
};
