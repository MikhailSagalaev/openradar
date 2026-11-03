import type { PollContext, RawLead, SourceAdapter, SourceRecord } from '../core/types.ts';
import { stripHtml } from '../core/text.ts';
import { fetchText } from './http.ts';

interface WorkingNomadsJob {
  url?: string;
  title?: string;
  description?: string;
  company_name?: string;
  category_name?: string;
  tags?: string;
  location?: string;
  pub_date?: string;
}

const API_URL = 'https://www.workingnomads.com/api/exposed_jobs/';
const MAX_TEXT = 8000;

export const workingNomadsSource: SourceAdapter = {
  kind: 'workingnomads',
  access: 'official',
  description:
    'Открытый API Working Nomads (workingnomads.com/api/exposed_jobs): свежие международные удалённые вакансии с компанией, категорией и тегами.',
  defaultPollIntervalSec: 3600, // the list holds the last few dozen jobs and changes a few times a day
  risks: [
    'Из сетей, где ответ обрывается на первых килобайтах, читается только через прокси (config.proxy: true)',
    'Часть объявлений — посредники найма (Lemon.io и подобные), а не сами работодатели',
  ],

  async poll(source: SourceRecord, ctx: PollContext): Promise<RawLead[]> {
    const url = typeof source.config.url === 'string' && source.config.url.trim() ? source.config.url.trim() : API_URL;
    const jobs = JSON.parse(await fetchText(ctx, url, { Accept: 'application/json' })) as WorkingNomadsJob[];
    if (!Array.isArray(jobs)) return [];
    return jobs
      .filter((j) => j.url && j.title?.trim())
      .map((j) => {
        const title = j.title!.trim();
        const company = j.company_name?.trim();
        const location = j.location?.trim() ?? '';
        const tags = (j.tags ?? '').split(',').map((t) => t.trim()).filter(Boolean);
        const head = [
          company && `Company: ${company}`,
          location && `Location: ${location}`,
          j.category_name && `Category: ${j.category_name}`,
          tags.length && `Tags: ${tags.join(', ')}`,
        ].filter(Boolean).join('\n');
        return {
          sourceId: source.id,
          type: 'job',
          externalId: `workingnomads:${j.url}`,
          url: j.url,
          title,
          text: `${title}\n\n${head}\n\n${stripHtml(j.description ?? '').trim()}`.slice(0, MAX_TEXT),
          author: company,
          city: 'Онлайн',
          isRemote: true,
          skills: tags.filter((t) => t.toLowerCase() !== 'english').slice(0, 10),
          publishedAt: j.pub_date,
          raw: { workingnomads: true },
        } satisfies RawLead;
      });
  },
};
