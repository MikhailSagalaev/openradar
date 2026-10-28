import type { RawLead, SourceAdapter, SourceRecord, PollContext } from '../core/types.ts';
import { fetchText } from './http.ts';
import { firstLine, stripHtml } from '../core/text.ts';

interface AlgoliaHit {
  objectID?: string;
  title?: string;
  author?: string;
  comment_text?: string | null;
  story_text?: string | null;
  created_at?: string;
  parent_id?: number;
  story_id?: number;
}

interface AlgoliaSearch {
  hits?: AlgoliaHit[];
}

export const hnSource: SourceAdapter = {
  kind: 'hn',
  access: 'official',
  description:
    'Официальный Algolia API Hacker News: комментарии треда «Ask HN: Who is hiring?» — вакансии стартапов, в основном удалённые.',
  risks: [
    'Тред выходит раз в месяц: при первом опросе читаются только последние N комментариев',
    'Ответы-реплаи в треде не читаются: только комментарии верхнего уровня',
    'Текст — свободная разметка HN: нормализуется в текст',
  ],

  async poll(source: SourceRecord, ctx: PollContext): Promise<RawLead[]> {
    const base =
      typeof source.config.url === 'string' && source.config.url.trim()
        ? source.config.url.trim().replace(/\/+$/, '')
        : 'https://hn.algolia.com/api/v1';
    const limit = Math.max(1, Math.min(Number(source.config.limit ?? 50), 200));

    // 1. The latest monthly hiring thread by the whoishiring account.
    const storiesUrl = `${base}/search_by_date?tags=story,author_whoishiring&hitsPerPage=12`;
    const storiesText = await fetchText(ctx, storiesUrl, { Accept: 'application/json' });
    let story: AlgoliaHit | undefined;
    try {
      const parsed = JSON.parse(storiesText) as AlgoliaSearch;
      story = (parsed.hits ?? []).find((hit) => hit.objectID && /who is hiring/i.test(hit.title ?? ''));
    } catch (error) {
      ctx.logger.warn('HN: failed to parse stories response', {
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
    if (!story?.objectID) {
      ctx.logger.warn('HN: no "Who is hiring?" thread found');
      return [];
    }

    // 2. Top-level comments of that thread only (parent_id equals the story id).
    const commentsUrl = `${base}/search_by_date?tags=comment,story_${story.objectID}&hitsPerPage=${limit}`;
    const commentsText = await fetchText(ctx, commentsUrl, { Accept: 'application/json' });
    let hits: AlgoliaHit[] = [];
    try {
      const parsed = JSON.parse(commentsText) as AlgoliaSearch;
      hits = parsed.hits ?? [];
    } catch (error) {
      ctx.logger.warn('HN: failed to parse comments response', {
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }

    const leads: RawLead[] = [];
    for (const hit of hits) {
      if (!hit.objectID) continue;
      if (hit.parent_id !== Number(story.objectID)) continue;
      const text = hit.comment_text ? stripHtml(hit.comment_text).trim() : '';
      if (text.length < 40) continue;

      const isRemote = /remote|anywhere|worldwide/i.test(text) ? true : undefined;
      leads.push({
        sourceId: source.id,
        type: 'job',
        externalId: `hn:${hit.objectID}`,
        url: `https://news.ycombinator.com/item?id=${hit.objectID}`,
        title: firstLine(text, 140),
        text,
        author: hit.author ? `HN: ${hit.author}` : undefined,
        city: isRemote ? 'Онлайн' : undefined,
        isRemote,
        publishedAt: hit.created_at,
        raw: { storyId: story.objectID },
      });
    }
    return leads;
  },
};
