import type { RawLead, SourceAdapter, SourceRecord, PollContext } from '../core/types.ts';
import { fetchText } from './http.ts';
import { firstLine, stripHtml } from '../core/text.ts';

/** Remotive and Arbeitnow encode lists as "['a', 'b']" strings; single quotes are not JSON. */
function parseQuotedList(value: string | string[] | undefined): string[] {
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);
  if (typeof value !== 'string') return [];
  return [...value.matchAll(/'([^']*)'/g)].map((m) => m[1]!.trim()).filter(Boolean);
}

interface RemotiveJob {
  id?: string | number;
  url?: string;
  title?: string;
  company_name?: string;
  category?: string;
  tags?: string | string[];
  job_type?: string;
  publication_date?: string;
  candidate_required_location?: string;
  salary?: string;
  description?: string;
}

export const remotiveSource: SourceAdapter = {
  kind: 'remotive',
  access: 'official',
  description:
    'Официальный открытый API Remotive (remotive.com/api/remote-jobs): международные удалённые вакансии всех направлений.',
  risks: [
    'Ограничение частоты запросов со стороны сервиса',
    'Зарплата приходит свободной строкой: нормализуется общим детектором валют',
  ],

  async poll(source: SourceRecord, ctx: PollContext): Promise<RawLead[]> {
    const base =
      typeof source.config.url === 'string' && source.config.url.trim()
        ? source.config.url.trim()
        : 'https://remotive.com/api/remote-jobs';
    const url = new URL(base);
    const limit = Math.max(1, Math.min(Number(source.config.limit ?? 50), 200));
    url.searchParams.set('limit', String(limit));
    const category = typeof source.config.category === 'string' ? source.config.category.trim() : '';
    if (category) url.searchParams.set('category', category);

    const jsonText = await fetchText(ctx, url.toString(), {
      Accept: 'application/json',
    });

    let jobs: RemotiveJob[] = [];
    try {
      const parsed = JSON.parse(jsonText) as { jobs?: RemotiveJob[] };
      jobs = Array.isArray(parsed.jobs) ? parsed.jobs : [];
    } catch (error) {
      ctx.logger.warn('Remotive: failed to parse JSON response', {
        error: error instanceof Error ? error.message : String(error),
        url: url.toString(),
      });
      return [];
    }

    const leads: RawLead[] = [];
    for (const job of jobs) {
      if (!job || !job.id || !job.title) continue;
      const title = String(job.title).trim();
      if (!title) continue;

      const company = job.company_name ? String(job.company_name).trim() : undefined;
      const location = job.candidate_required_location ? String(job.candidate_required_location).trim() : '';
      const worldwide = /worldwide|anywhere|remote/i.test(location);
      const salary = job.salary ? String(job.salary).trim() : '';

      const sections: string[] = [];
      if (company) sections.push(`Company: ${company}`);
      if (location) sections.push(`Location: ${location}`);
      if (job.job_type) sections.push(`Type: ${String(job.job_type).replace(/_/g, ' ')}`);
      if (salary) sections.push(`Salary: ${salary}`);
      const skills = parseQuotedList(job.tags);
      if (skills.length) sections.push(`Tags: ${skills.join(', ')}`);
      if (job.description) sections.push(stripHtml(job.description).trim());

      // The API returns local time without a zone marker; treat it as UTC.
      const publishedRaw = job.publication_date ? String(job.publication_date) : '';
      const publishedAt =
        publishedRaw && !/[z+]|-\d{2}:?\d{2}$/.test(publishedRaw.slice(-6))
          ? `${publishedRaw}Z`
          : publishedRaw || undefined;

      leads.push({
        sourceId: source.id,
        type: 'job',
        externalId: `remotive:${job.id}`,
        url: job.url ? String(job.url) : undefined,
        title,
        text: sections.length ? `${title}\n\n${sections.join('\n\n')}` : title,
        author: company,
        city: worldwide || !location ? 'Онлайн' : location,
        rawSalary: salary || undefined,
        category: job.category ? String(job.category) : undefined,
        skills: skills.length ? skills.slice(0, 8) : undefined,
        isRemote: true,
        publishedAt,
        raw: { remotiveId: job.id, jobType: job.job_type },
      });
    }
    return leads;
  },
};
