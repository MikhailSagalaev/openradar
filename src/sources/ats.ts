import type { PollContext, RawLead, SourceAdapter, SourceRecord } from '../core/types.ts';
import { decodeHtmlEntities, stripHtml } from '../core/text.ts';
import { fetchText } from './http.ts';

/**
 * Company career boards through the public job-board APIs of applicant tracking systems:
 * Greenhouse, Lever and Ashby publish them for anyone to read, without a key. One source
 * holds a list of companies of one system; each poll reads a few of them in turn.
 */
export type AtsProvider = 'greenhouse' | 'lever' | 'ashby';

const PROVIDERS: AtsProvider[] = ['greenhouse', 'lever', 'ashby'];
const MAX_TEXT = 8000;

/** "gitlab" or "gitlab=GitLab": the board slug and, optionally, the name to show. */
export function companiesOf(source: SourceRecord): Array<{ slug: string; name?: string }> {
  const raw = source.config.companies;
  const list = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(/[\s,]+/) : [];
  return list
    .map((entry) => String(entry).trim())
    .filter((entry) => /^[a-z0-9][a-z0-9_.-]{0,80}(=.{1,80})?$/i.test(entry))
    .map((entry) => {
      const [slug, name] = entry.split('=', 2) as [string, string | undefined];
      return { slug: slug.toLowerCase(), name: name?.trim() || undefined };
    });
}

/** Where the next poll of each source starts in its company list. */
const cursors = new Map<string, number>();

export function nextBatch<T>(sourceId: string, items: T[], size: number): T[] {
  if (!items.length) return [];
  const start = (cursors.get(sourceId) ?? 0) % items.length;
  const batch = Array.from({ length: Math.min(size, items.length) }, (_, i) => items[(start + i) % items.length]!);
  cursors.set(sourceId, start + batch.length);
  return batch;
}

function text(title: string, sections: Array<string | undefined>, body: string): string {
  const head = sections.filter(Boolean).join('\n');
  return `${title}\n\n${head}${head ? '\n\n' : ''}${body}`.slice(0, MAX_TEXT);
}

const REMOTE = /\bremote\b|удал[её]нн/i;

interface GreenhouseJob {
  id?: number;
  title?: string;
  absolute_url?: string;
  company_name?: string;
  location?: { name?: string };
  first_published?: string;
  updated_at?: string;
  content?: string;
  departments?: Array<{ name?: string }>;
}

function fromGreenhouse(source: SourceRecord, slug: string, name: string | undefined, json: string): RawLead[] {
  const jobs = (JSON.parse(json) as { jobs?: GreenhouseJob[] }).jobs ?? [];
  return jobs.filter((j) => j.id && j.title?.trim()).map((j) => {
    const title = j.title!.trim();
    const company = name ?? j.company_name?.trim();
    const location = j.location?.name?.trim() ?? '';
    // The content field is HTML escaped once more.
    const body = stripHtml(decodeHtmlEntities(j.content ?? '')).trim();
    return {
      sourceId: source.id,
      type: 'job',
      externalId: `greenhouse:${slug}:${j.id}`,
      url: j.absolute_url,
      title,
      text: text(title, [company && `Company: ${company}`, location && `Location: ${location}`, j.departments?.[0]?.name && `Department: ${j.departments[0].name}`], body),
      author: company,
      city: REMOTE.test(location) ? 'Онлайн' : location || undefined,
      isRemote: REMOTE.test(location),
      publishedAt: j.first_published ?? j.updated_at,
      raw: { ats: 'greenhouse', board: slug },
    } satisfies RawLead;
  });
}

interface LeverPosting {
  id?: string;
  text?: string;
  hostedUrl?: string;
  createdAt?: number;
  workplaceType?: string;
  categories?: { location?: string; team?: string; commitment?: string };
  descriptionPlain?: string;
  lists?: Array<{ text?: string; content?: string }>;
  additionalPlain?: string;
  salaryRange?: { min?: number; max?: number; currency?: string; interval?: string };
}

function fromLever(source: SourceRecord, slug: string, name: string | undefined, json: string): RawLead[] {
  const postings = JSON.parse(json) as LeverPosting[];
  if (!Array.isArray(postings)) return [];
  return postings.filter((p) => p.id && p.text?.trim()).map((p) => {
    const title = p.text!.trim();
    const company = name ?? slug;
    const location = p.categories?.location?.trim() ?? '';
    const remote = p.workplaceType === 'remote' || REMOTE.test(location);
    const lists = (p.lists ?? []).map((l) => `${l.text ?? ''}\n${stripHtml(l.content ?? '')}`.trim());
    const body = [p.descriptionPlain, ...lists, p.additionalPlain].filter(Boolean).join('\n\n').trim();
    const salary = p.salaryRange;
    const yearly = salary?.interval?.includes('year');
    const monthly = salary?.interval?.includes('month');
    const hourly = salary?.interval?.includes('hour');
    const withPay = salary && (salary.min || salary.max) && salary.currency && (yearly || monthly || hourly);
    return {
      sourceId: source.id,
      type: 'job',
      externalId: `lever:${slug}:${p.id}`,
      url: p.hostedUrl,
      title,
      text: text(title, [`Company: ${company}`, location && `Location: ${location}`, p.categories?.team && `Team: ${p.categories.team}`, p.categories?.commitment && `Type: ${p.categories.commitment}`], body),
      author: company,
      city: remote ? 'Онлайн' : location || undefined,
      isRemote: remote,
      rawSalary: withPay ? `${salary.min ?? ''}–${salary.max ?? ''} ${salary.currency} ${yearly ? 'per year' : monthly ? 'per month' : 'per hour'}` : undefined,
      publishedAt: p.createdAt ? new Date(p.createdAt).toISOString() : undefined,
      raw: { ats: 'lever', board: slug },
    } satisfies RawLead;
  });
}

interface AshbyComponent {
  compensationType?: string;
  interval?: string;
  currencyCode?: string | null;
  minValue?: number | null;
  maxValue?: number | null;
}

interface AshbyJob {
  id?: string;
  title?: string;
  jobUrl?: string;
  location?: string;
  department?: string;
  isRemote?: boolean;
  isListed?: boolean;
  workplaceType?: string;
  employmentType?: string;
  publishedAt?: string;
  descriptionPlain?: string;
  compensation?: { compensationTiers?: Array<{ components?: AshbyComponent[] }> };
}

function fromAshby(source: SourceRecord, slug: string, name: string | undefined, json: string): RawLead[] {
  const jobs = (JSON.parse(json) as { jobs?: AshbyJob[] }).jobs ?? [];
  return jobs.filter((j) => j.id && j.title?.trim() && j.isListed !== false).map((j) => {
    const title = j.title!.trim();
    const company = name ?? slug;
    const location = j.location?.trim() ?? '';
    const remote = Boolean(j.isRemote) || j.workplaceType === 'Remote';
    const salary = j.compensation?.compensationTiers?.flatMap((t) => t.components ?? [])
      .find((c) => c.compensationType === 'Salary' && c.currencyCode && (c.minValue || c.maxValue));
    const per = salary?.interval?.includes('YEAR') ? 'per year' : salary?.interval?.includes('MONTH') ? 'per month' : salary?.interval?.includes('HOUR') ? 'per hour' : undefined;
    return {
      sourceId: source.id,
      type: 'job',
      externalId: `ashby:${slug}:${j.id}`,
      url: j.jobUrl,
      title,
      text: text(title, [`Company: ${company}`, location && `Location: ${location}`, j.department && `Department: ${j.department}`, j.employmentType && `Type: ${j.employmentType}`], j.descriptionPlain?.trim() ?? ''),
      author: company,
      city: remote ? 'Онлайн' : location || undefined,
      isRemote: remote,
      rawSalary: salary && per ? `${salary.minValue ?? ''}–${salary.maxValue ?? ''} ${salary.currencyCode} ${per}` : undefined,
      publishedAt: j.publishedAt,
      raw: { ats: 'ashby', board: slug },
    } satisfies RawLead;
  });
}

const ENDPOINTS: Record<AtsProvider, (slug: string) => string> = {
  greenhouse: (slug) => `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(slug)}/jobs?content=true`,
  lever: (slug) => `https://api.lever.co/v0/postings/${encodeURIComponent(slug)}?mode=json`,
  ashby: (slug) => `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(slug)}?includeCompensation=true`,
};

const PARSERS: Record<AtsProvider, (source: SourceRecord, slug: string, name: string | undefined, json: string) => RawLead[]> = {
  greenhouse: fromGreenhouse,
  lever: fromLever,
  ashby: fromAshby,
};

export const atsSource: SourceAdapter = {
  kind: 'ats',
  access: 'official',
  description:
    'Карьерные страницы компаний через публичные API систем найма (Greenhouse, Lever, Ashby): компании публикуют их для всех, без ключа.',
  risks: [
    'Список компаний ведётся вручную: компания, сменившая систему найма, перестаёт отдавать вакансии',
    'На доске компании все открытые вакансии, в том числе не IT и давно опубликованные',
  ],

  async poll(source: SourceRecord, ctx: PollContext): Promise<RawLead[]> {
    const provider = String(source.config.provider ?? '') as AtsProvider;
    if (!PROVIDERS.includes(provider)) throw new Error(`ATS source requires config.provider: ${PROVIDERS.join(', ')}`);
    const companies = companiesOf(source);
    if (!companies.length) throw new Error('ATS source requires config.companies');
    const perPoll = Math.max(1, Math.min(Number(source.config.perPoll ?? 5), 20));
    const perCompany = Math.max(1, Math.min(Number(source.config.perCompany ?? 100), 500));
    // Boards list every open job, years-old ones too: only fresh postings make the flow.
    const maxAgeDays = Math.max(1, Number(source.config.maxAgeDays ?? 30));
    const since = new Date(ctx.now().getTime() - maxAgeDays * 86_400_000).toISOString();

    const leads: RawLead[] = [];
    for (const { slug, name } of nextBatch(source.id, companies, perPoll)) {
      try {
        const json = await fetchText(ctx, ENDPOINTS[provider](slug), { Accept: 'application/json' });
        const found = PARSERS[provider](source, slug, name, json)
          .filter((lead) => !lead.publishedAt || new Date(lead.publishedAt).toISOString() >= since)
          .sort((a, b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''))
          .slice(0, perCompany);
        leads.push(...found);
      } catch (error) {
        // One company that left the system must not stop the others.
        ctx.logger.warn('ATS board failed', { provider, slug, error: error instanceof Error ? error.message : String(error) });
      }
    }
    return leads;
  },
};
