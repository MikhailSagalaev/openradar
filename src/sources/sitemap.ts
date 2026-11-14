import type { PollContext, RawLead, SourceAdapter, SourceRecord } from '../core/types.ts';
import { asText, companyOf, extractPageFacts, isType, jsonLdObjects, salaryOf } from '../research/facts.ts';
import { normalizeWhitespace, stripHtml } from '../core/text.ts';
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

/** Vacancy links of a career page, as full addresses. */
export function pageLinks(html: string, base: string): string[] {
  const links = [...html.matchAll(/href\s*=\s*["']([^"'#]+)["']/gi)].flatMap((m) => {
    try {
      return [new URL(m[1]!.trim().replace(/&amp;/g, '&'), base).href];
    } catch {
      return [];
    }
  });
  return [...new Set(links)];
}

/** Whose vacancy it is, for a company's own site: its pages rarely say so in the markup. */
function ownerOf(source: SourceRecord): string | undefined {
  const name = source.config.company;
  return typeof name === 'string' && name.trim() ? name.trim() : undefined;
}

/** One vacancy page to a lead, or nothing when the page holds no vacancy. */
export function leadFromPage(source: SourceRecord, url: string, key: string, html: string): RawLead | undefined {
  const posting = jsonLdObjects(html).find((node) => isType(node, 'JobPosting'));
  if (posting && asText(posting.title, 200)) return leadFromPosting(source, url, key, html, posting);
  return leadFromPlainPage(source, url, key, html);
}

function leadFromPosting(source: SourceRecord, url: string, key: string, html: string, posting: Record<string, unknown>): RawLead {
  const title = asText(posting.title, 200)!;
  const facts = extractPageFacts(html);
  const company = ownerOf(source) ?? companyOf(posting);
  const salary = salaryOf(posting);
  const remote = posting.jobLocationType === 'TELECOMMUTE';
  const city = locationOf(posting);
  // Some boards keep only a line in the markup and the pay in the page description.
  const meta = asText(html.match(/<meta\s+(?:name="description"|property="og:description")\s+content="([^"]*)"/i)?.[1], 1000) ?? '';
  // Lines stay: the post reads as the board wrote it.
  const markup = typeof posting.description === 'string' ? normalizeWhitespace(stripHtml(stripHtml(posting.description))).slice(0, MAX_TEXT) : '';
  // A line in the markup: the vacancy itself is on the page.
  const page = markup.length < 400 ? visibleText(html) : '';
  const description = [meta.length > markup.length ? meta : '', markup, page].filter(Boolean).join('\n\n');
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
    city: city || (remote ? 'Онлайн' : undefined),
    isRemote: remote,
    currency: salary?.currency,
    rawSalary: salary ? `${salary.min ?? ''}–${salary.max ?? ''} ${salary.currency} ${per}` : undefined,
    publishedAt: typeof posting.datePosted === 'string' ? posting.datePosted : undefined,
    metadata: { facts },
    raw: { sitemap: true },
  };
}

const DEAD_PAGE = /\b40[43]\b|not[\s-]?found|страница не найдена|доступ ограничен|access denied/i;
/** A heading the site puts on every page, or on the list: it names no vacancy. */
const NO_NAME = /^(?:детальная страница вакансии|(?:все )?вакансии|работа|карьера|(?:all )?jobs|careers?|open positions)(?:\s*[|—–-].*)?$/i;
/** A greeting is the site's hello, not the job («Привет! Это Фоксфорд»). */
const GREETING = /^\s*(?:привет[!,.]?|здравствуйте|hello[!,.]?|welcome|добро пожаловать)\b/i;
const CLOSED_PAGE = /вакансия (?:закрыта|в архиве|неактуальна|больше не актуальна)|(?:job|position|vacancy) (?:is|has been) (?:closed|filled)|no longer (?:available|accepting)/i;

/**
 * Pages without JobPosting markup: most company career sites render the vacancy into plain
 * HTML. The h1 (else the <title>) is the vacancy, the meta description and the body text
 * carry the rest; the money and quality stages downstream parse pay and reject junk.
 */
function leadFromPlainPage(source: SourceRecord, url: string, key: string, html: string): RawLead | undefined {
  const h1 = asText(html.match(/<h1[^>]*>([\s\S]{1,300}?)<\/h1>/i)?.[1]?.replace(/<[^>]+>/g, ' '), 200);
  const title = asText(html.match(/<title[^>]*>([\s\S]{1,300}?)<\/title>/i)?.[1], 200);
  const ogTitle = asText(html.match(/<meta\s+property="og:title"\s+content="([^"]*)"/i)?.[1], 200);
  const usable = (name: string | undefined): string => (name && !DEAD_PAGE.test(name) && !NO_NAME.test(name) && !GREETING.test(name) ? name.trim() : '');
  // The first heading may be the site's greeting («Привет! Это Фоксфорд»): the og:title names the job then.
  const heading = usable(h1) || usable(ogTitle);
  const pageTitle = usable(title);
  if (!heading && !pageTitle) return undefined;
  const meta = asText(html.match(/<meta\s+(?:name="description"|property="og:description")\s+content="([^"]*)"/i)?.[1], 800) ?? '';
  const body = visibleText(html);
  if (body.length < 200 || CLOSED_PAGE.test(body)) return undefined;
  const facts = extractPageFacts(html);
  const name = heading || pageTitle;
  return {
    sourceId: source.id,
    type: 'job',
    externalId: `sitemap:${new URL(url).host}:${key}`,
    url,
    title: name,
    text: [name, meta, body.slice(0, MAX_TEXT)].filter(Boolean).join('\n\n').slice(0, MAX_TEXT),
    author: ownerOf(source),
    // On a career page the date is the page's, often years old; the list says it is open.
    publishedAt: source.config.listUrl ? undefined : html.match(/<meta\s+property="article:published_time"\s+content="([^"]+)"/i)?.[1],
    metadata: { facts },
    raw: { sitemap: true, plain: true },
  };
}

/** The text a visitor sees: dialogs and blocks the page keeps hidden stay out. */
function visibleText(html: string): string {
  return normalizeWhitespace(stripHtml(html
    .replace(/<(script|style|nav|footer|header|svg|dialog)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<div[^>]*w-condition-invisible[^>]*>[\s\S]*?<\/div>/gi, ' ')
    .replace(/<h1[^>]*>([\s\S]*?)<\/h1>/i, ' ')));
}

/** Pages already read, per source: each poll goes on to newer ones. */
const seen = new Map<string, Set<string>>();
const SEEN_MAX = 20_000;

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
    const listUrl = typeof source.config.listUrl === 'string' ? source.config.listUrl.trim() : '';
    const pattern = typeof source.config.pattern === 'string' ? source.config.pattern : '';
    if ((!url && !listUrl) || !pattern) throw new Error('Sitemap source requires config.pattern and config.url or config.listUrl');
    const re = new RegExp(pattern);
    const perPoll = Math.max(1, Math.min(Number(source.config.perPoll ?? 10), 50));
    const delayMs = Math.max(0, Number(source.config.delayMs ?? 1000));
    const maxAgeDays = Math.max(1, Number(source.config.maxAgeDays ?? 30));
    const since = new Date(ctx.now().getTime() - maxAgeDays * 86_400_000).toISOString();

    let pages: string[] = [];
    if (listUrl) {
      pages = pageLinks(await fetchText(ctx, listUrl), listUrl);
    } else {
      const index = sitemapLocs(await fetchText(ctx, url, { Accept: 'application/xml,text/xml' }));
      pages = index.pages;
      for (const child of index.children.slice(0, 10)) pages = pages.concat(sitemapLocs(await fetchText(ctx, child, { Accept: 'application/xml,text/xml' })).pages);
    }

    const done = seen.get(source.id) ?? new Set<string>();
    seen.set(source.id, done);
    // A sitemap may keep years of closed vacancies: config.maxPages stops at the newest.
    const newest = newestPages(pages, re).slice(0, Math.max(1, Number(source.config.maxPages ?? 100_000)));
    const queue = newest.filter((p) => !done.has(p.url)).slice(0, perPoll);
    const leads: RawLead[] = [];
    for (const [i, page] of queue.entries()) {
      if (i > 0 && delayMs) await sleep(delayMs);
      done.add(page.url);
      // Old pages fall out of the newest-first queue anyway: keep the set from growing forever.
      if (done.size > SEEN_MAX) done.delete(done.values().next().value!);
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
