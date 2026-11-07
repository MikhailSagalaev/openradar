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
    const url = typeof source.config.url === 'string' ? source.config.url.trim() : '';
    if (!url) throw new Error('RSS source requires config.url');

    const xml = await fetchText(ctx, url);
    const feed = await parser.parseString(escapeBareAmpersands(xml));
    const limit = Math.max(1, Math.min(Number(source.config.limit ?? 30), 100));

    return (feed.items ?? []).slice(0, limit).map((item) => {
      // HTML first: a snippet has lost the paragraphs.
      const body = toPlainText(item.contentEncoded || item.content || item.contentSnippet || item.summary || item.title || '');
      const company = item.jobCompany || item.himalayasCompany;
      const head = [
        company && `Company: ${company}`,
        item.jobLocation && `Location: ${item.jobLocation}`,
        item.jobType && `Type: ${item.jobType}`,
        item.jobCategory && `Category: ${item.jobCategory}`,
      ].filter(Boolean).join('\n');
      const text = `${head}${head ? '\n\n' : ''}${body}`.slice(0, MAX_TEXT);
      const title = firstLine(stripBudgetTitleSuffix(item.title || text), 140);
      return {
        sourceId: source.id,
        externalId: item.guid || item.id || item.link || undefined,
        url: item.link || undefined,
        title,
        text: text || title,
        author: company || item.creator || item.author || undefined,
        publishedAt: item.isoDate || item.pubDate || undefined,
        raw: { feedTitle: feed.title, feedUrl: url },
      } satisfies RawLead;
    });
  },
};
