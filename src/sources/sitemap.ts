import type { PollContext, RawLead, SourceAdapter, SourceRecord } from '../core/types.ts';
import { asText, companyOf, extractPageFacts, isType, jsonLdObjects, salaryOf } from '../research/facts.ts';
import { fetchText } from './http.ts';

/**
 * Vacancy pages listed in a site's sitemap, read through their schema.org JobPosting markup.
 * For boards that publish no feed and close their API to robots but list every vacancy in
 * the sitemap for search engines (getmatch.ru). Only the newest pages are read, a few per
 * poll, with a pause between them.
 */

const MAX_TEXT = 8000;

/** Page URLs in a sitemap, or the child sitemaps of a sitemap index. */
export function sitemapLocs(xml: string): { pages: string[]; children: string[] } {
  const locs = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1]!.replace(/&amp;/g, '&'));
  return /<sitemapindex/i.test(xml) ? { pages: [], children: locs } : { pages: locs, children: [] };
}

/**
 * The newest pages first: by the number the pattern captures (vacancy ids grow), else in
 * the sitemap's own order reversed.
 */
export function newestPages(urls: string[], pattern: RegExp): Array<{ url: string; key: string }> {
  const matched = urls.flatMap((url) => {
    const m = url.match(pattern);
    return m ? [{ url, key: m[1] ?? url }] : [];
  });
  const numeric = matched.every((p) => /^\d+$/.test(p.key));
  return numeric ? matched.sort((a, b) => Number(b.key) - Number(a.key)) : matched.reverse();
}

function locationOf(posting: Record<string, unknown>): string | undefined {
  const places = ([] as unknown[]).concat(posting.jobLocation ?? []);
  for (const place of places) {
    const address = (place as Record<string, unknown> | undefined)?.address as Record<string, unknown> | undefined;
    const city = asText(address?.addressLocality, 60);
    if (city) return city;
  }
  return undefined;
}

/** One vacancy page to a lead, or nothing when the page has no JobPosting. */
export function leadFromPage(source: SourceRecord, url: string, key: string, html: string): RawLead | undefined {
  const posting = jsonLdObjects(html).find((node) => isType(node, 'JobPosting'));
  const title = posting && asText(posting.title, 200);
  if (!posting || !title) return undefined;
  const facts = extractPageFacts(html);
  const company = companyOf(posting);
  const salary = salaryOf(posting);
  const remote = posting.jobLocationType === 'TELECOMMUTE';
  const city = locationOf(posting);
  // Some boards keep only a line in the markup and the pay in the page description.
  const meta = asText(html.match(/<meta\s+(?:name="description"|property="og:description")\s+content="([^"]*)"/i)?.[1], 1000) ?? '';
  const markup = asText(posting.description, MAX_TEXT) ?? '';
  const description = meta.length > markup.length ? `${meta}

${markup}` : markup;
  const head = [company && `Компания: ${company}`, city && `Город: ${city}`, remote && 'Удалённо'].filter(Boolean).join('\n');
  const per = salary && { month: 'в месяц', year: 'в год', hour: 'в час', project: 'за проект' }[salary.period];
  return {
    sourceId: source.id,
    type: 'job',
    externalId: `sitemap:${new URL(url).host}:${key}`,
    url,
    title,
    text: `${title}\n\n${head}${head ? '\n\n' : ''}${description}`.slice(0, MAX_TEXT),
    author: company,
    city: remote ? 'Онлайн' : city,
    isRemote: remote,
    rawSalary: salary ? `${salary.min ?? ''}–${salary.max ?? ''} ${salary.currency} ${per}` : undefined,
    publishedAt: typeof posting.datePosted === 'string' ? posting.datePosted : undefined,
    metadata: { facts },
    raw: { sitemap: true },
  };
}

/** Pages already read, per source: each poll goes on to newer ones. */
const seen = new Map<string, Set<string>>();

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export const sitemapSource: SourceAdapter = {
  kind: 'sitemap',
  access: 'public',
  description:
    'Страницы вакансий из карты сайта (sitemap.xml) с разметкой schema.org JobPosting: для площадок без ленты, которые открывают вакансии поисковикам.',
  risks: [
    'Читаются только страницы, разрешённые robots.txt площадки: проверяйте перед добавлением',
    'Каждая вакансия — отдельный запрос: держите perPoll небольшим, между страницами есть пауза',
  ],

  async poll(source: SourceRecord, ctx: PollContext): Promise<RawLead[]> {
    const url = typeof source.config.url === 'string' ? source.config.url.trim() : '';
    const pattern = typeof source.config.pattern === 'string' ? source.config.pattern : '';
    if (!url || !pattern) throw new Error('Sitemap source requires config.url and config.pattern');
    const re = new RegExp(pattern);
    const perPoll = Math.max(1, Math.min(Number(source.config.perPoll ?? 10), 50));
    const delayMs = Math.max(0, Number(source.config.delayMs ?? 1000));
    const maxAgeDays = Math.max(1, Number(source.config.maxAgeDays ?? 30));
    const since = new Date(ctx.now().getTime() - maxAgeDays * 86_400_000).toISOString();

    let { pages, children } = sitemapLocs(await fetchText(ctx, url, { Accept: 'application/xml,text/xml' }));
    for (const child of children.slice(0, 10)) pages = pages.concat(sitemapLocs(await fetchText(ctx, child, { Accept: 'application/xml,text/xml' })).pages);

    const done = seen.get(source.id) ?? new Set<string>();
    seen.set(source.id, done);
    const queue = newestPages(pages, re).filter((p) => !done.has(p.url)).slice(0, perPoll);
    const leads: RawLead[] = [];
    for (const [i, page] of queue.entries()) {
      if (i > 0 && delayMs) await sleep(delayMs);
      done.add(page.url);
      try {
        const lead = leadFromPage(source, page.url, page.key, await fetchText(ctx, page.url));
        const posted = lead?.publishedAt ? Date.parse(lead.publishedAt) : NaN;
        if (lead && (Number.isNaN(posted) || new Date(posted).toISOString() >= since)) leads.push(lead);
      } catch (error) {
        ctx.logger.warn('Sitemap page failed', { url: page.url, error: error instanceof Error ? error.message : String(error) });
      }
    }
    return leads;
  },
};
