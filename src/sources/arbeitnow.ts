import type { RawLead, SourceAdapter, SourceRecord, PollContext } from '../core/types.ts';
import { fetchText } from './http.ts';
import { stripHtml } from '../core/text.ts';

/** Remotive and Arbeitnow encode lists as "['a', 'b']" strings; single quotes are not JSON. */
function parseQuotedList(value: string | string[] | undefined): string[] {
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);
  if (typeof value !== 'string') return [];
  return [...value.matchAll(/'([^']*)'/g)].map((m) => m[1]!.trim()).filter(Boolean);
}

interface ArbeitnowJob {
  slug?: string;
  company_name?: string;
  title?: string;
  description?: string;
  remote?: string | boolean;
  url?: string;
  tags?: string | string[];
  job_types?: string | string[];
  location?: string;
  created_at?: string | number;
}

export const arbeitnowSource: SourceAdapter = {
  kind: 'arbeitnow',
  access: 'official',
  description:
    'Официальный открытый API Arbeitnow (arbeitnow.com/api/job-board-api): вакансии Германии и ЕС, в основном на английском.',
  defaultPollIntervalSec: 1800, // the board barely changes in 5 minutes; dedup on 50 same offers each tick is pure cost
  risks: [
    'Ограничение частоты запросов со стороны сервиса',
    'Описание приходит HTML-блоком: нормализуется в текст',
  ],

  async poll(source: SourceRecord, ctx: PollContext): Promise<RawLead[]> {
    const base =
      typeof source.config.url === 'string' && source.config.url.trim()
        ? source.config.url.trim()
        : 'https://www.arbeitnow.com/api/job-board-api';
    const url = new URL(base);
    const limit = Math.max(1, Math.min(Number(source.config.limit ?? 50), 200));
    url.searchParams.set('limit', String(limit));
    const page = Math.max(1, Number(source.config.page ?? 1) || 1);
    if (page > 1) url.searchParams.set('page', String(page));

    const jsonText = await fetchText(ctx, url.toString(), {
      Accept: 'application/json',
    });

    let jobs: ArbeitnowJob[] = [];
    try {
      const parsed = JSON.parse(jsonText) as { data?: ArbeitnowJob[] };
      jobs = Array.isArray(parsed.data) ? parsed.data : [];
    } catch (error) {
      ctx.logger.warn('Arbeitnow: failed to parse JSON response', {
        error: error instanceof Error ? error.message : String(error),
        url: url.toString(),
      });
      return [];
    }

    const leads: RawLead[] = [];
    for (const job of jobs) {
      if (!job || !job.slug || !job.title) continue;
      const title = String(job.title).trim();
      if (!title) continue;

      const company = job.company_name ? String(job.company_name).trim() : undefined;
      // The API encodes the flag as the string "True"/"False".
      const isRemote = job.remote === true || String(job.remote).toLowerCase() === 'true';
      const location = job.location ? String(job.location).trim() : '';
      const tags = parseQuotedList(job.tags);
      const jobTypes = parseQuotedList(job.job_types);

      const sections: string[] = [];
      if (company) sections.push(`Company: ${company}`);
      if (location) sections.push(`Location: ${location}`);
      if (jobTypes.length) sections.push(`Type: ${jobTypes.join(', ')}`);
      if (tags.length) sections.push(`Tags: ${tags.join(', ')}`);
      if (job.description) sections.push(stripHtml(job.description).trim());

      const created = Number(job.created_at);
      const publishedAt = Number.isFinite(created) && created > 0 ? new Date(created * 1000).toISOString() : undefined;

      leads.push({
        sourceId: source.id,
        type: 'job',
        externalId: `arbeitnow:${job.slug}`,
        url: job.url ? String(job.url) : `https://www.arbeitnow.com/jobs/${job.slug}`,
        title,
        text: sections.length ? `${title}\n\n${sections.join('\n\n')}` : title,
        author: company,
        city: isRemote || !location ? 'Онлайн' : location,
        category: undefined,
        skills: tags.length ? tags.slice(0, 8) : undefined,
        isRemote,
        publishedAt,
        raw: { slug: job.slug, jobTypes },
      });
    }
    return leads;
  },
};
