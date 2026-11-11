import Parser from 'rss-parser';
import { firstLine, stripBudgetTitleSuffix, toPlainText } from '../core/text.ts';
import type { RawLead, SourceAdapter } from '../core/types.ts';
import { fetchText } from './http.ts';

interface BoardFields {
  id?: string;
  author?: string;
  contentEncoded?: string;
  himalayasCompany?: string;
  jobCompany?: string;
  jobLocation?: string;
  jobType?: string;
  jobCategory?: string;
}

/** Job boards put the employer, place and type into their own feed tags. */
const parser = new Parser<Record<string, unknown>, BoardFields>({
  customFields: {
    item: [
      ['content:encoded', 'contentEncoded'],
      ['himalayasJobs:companyName', 'himalayasCompany'],
      ['job_listing:company', 'jobCompany'],
      ['job_listing:location', 'jobLocation'],
      ['job_listing:job_type', 'jobType'],
      ['job_listing:category', 'jobCategory'],
    ],
  },
});

const MAX_TEXT = 8000;

/**
 * A bare «&» («R&D», «?a=1&b=2» in a link) is not XML, and the strict parser drops the whole
 * feed on it (GeekJob, Real Work From Anywhere). Entities and CDATA stay as they are.
 */
export function escapeBareAmpersands(xml: string): string {
  return xml.replace(/(<!\[CDATA\[[\s\S]*?\]\]>)|&(?!(?:[a-zA-Z][a-zA-Z0-9]*|#\d+|#x[0-9a-fA-F]+);)/g, (_match, cdata: string | undefined) => cdata ?? '&amp;');
}

export const rssSource: SourceAdapter = {
  kind: 'rss',
  access: 'official',
  description: 'RSS/Atom feed. The safest source: no scraping and no authentication.',
  risks: [],
  async poll(source, ctx): Promise<RawLead[]> {
    let url = typeof source.config.url === 'string' ? source.config.url.trim() : '';
    if (!url) throw new Error('RSS source requires config.url');
    if (/^https?:\/\/(?:www\.)?hh\.ru\/search\/vacancy\/rss\?/i.test(url)) {
      // Role 120 on hh.ru is physical security guards (ТЦ, склады, транспорт), not InfoSec (116).
      url = url.replace(/([?&])professional_role=120&/gi, '$1').replace(/&professional_role=120(?=$|#)/gi, '');
      if (/[?&]text=/i.test(url) && !/[?&](?:search_field|professional_role)=/i.test(url)) {
        url += '&search_field=name';
      }
    }

    const xml = await fetchText(ctx, url);
    const feed = await parser.parseString(escapeBareAmpersands(xml));
    const limit = Math.max(1, Math.min(Number(source.config.limit ?? 30), 100));

    const seenEmployerTitle = new Set<string>();
    const results: RawLead[] = [];
    for (const item of feed.items ?? []) {
      if (results.length >= limit) break;
      // HTML first: a snippet has lost the paragraphs.
      const body = toPlainText(item.contentEncoded || item.content || item.contentSnippet || item.summary || item.title || '');
      const company = item.jobCompany || item.himalayasCompany || body.match(/Вакансия\s+компании:\s*([^\n]{2,80})/iu)?.[1]?.trim();
      const head = [
        (item.jobCompany || item.himalayasCompany) && `Company: ${item.jobCompany || item.himalayasCompany}`,
        item.jobLocation && `Location: ${item.jobLocation}`,
        item.jobType && `Type: ${item.jobType}`,
        item.jobCategory && `Category: ${item.jobCategory}`,
      ].filter(Boolean).join('\n');
      const text = `${head}${head ? '\n\n' : ''}${body}`.slice(0, MAX_TEXT);
      const title = firstLine(stripBudgetTitleSuffix(item.title || text), 140);
      if (company && title) {
        const cloneKey = `${company.toLowerCase()}::${title.toLowerCase()}`;
        if (seenEmployerTitle.has(cloneKey)) continue;
        seenEmployerTitle.add(cloneKey);
      }
      results.push({
        sourceId: source.id,
        externalId: item.guid || item.id || item.link || undefined,
        url: item.link || undefined,
        title,
        text: text || title,
        author: company || item.creator || item.author || undefined,
        publishedAt: item.isoDate || item.pubDate || undefined,
        raw: { feedTitle: feed.title, feedUrl: url },
      } satisfies RawLead);
    }
    return results;
  },
};
