import Parser from 'rss-parser';
import { firstLine, stripBudgetTitleSuffix, toPlainText } from '../core/text.ts';
import type { RawLead, SourceAdapter } from '../core/types.ts';
import { fetchText } from './http.ts';

const parser = new Parser();

export const rssSource: SourceAdapter = {
  kind: 'rss',
  access: 'official',
  description: 'RSS/Atom feed. The safest source: no scraping and no authentication.',
  risks: [],
  async poll(source, ctx): Promise<RawLead[]> {
    const url = typeof source.config.url === 'string' ? source.config.url.trim() : '';
    if (!url) throw new Error('RSS source requires config.url');

    const xml = await fetchText(ctx, url);
    const feed = await parser.parseString(xml);
    const limit = Math.max(1, Math.min(Number(source.config.limit ?? 30), 100));

    return (feed.items ?? []).slice(0, limit).map((item) => {
      const text = toPlainText(
        item.contentSnippet || item.content || item.summary || item.title || '',
      );
      const title = firstLine(stripBudgetTitleSuffix(item.title || text), 140);
      return {
        sourceId: source.id,
        externalId: item.guid || item.id || item.link || undefined,
        url: item.link || undefined,
        title,
        text: text || title,
        author: item.creator || item.author || undefined,
        publishedAt: item.isoDate || item.pubDate || undefined,
        raw: { feedTitle: feed.title, feedUrl: url },
      } satisfies RawLead;
    });
  },
};
