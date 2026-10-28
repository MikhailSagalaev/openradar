import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createSourceRegistry } from '../../src/sources/index.ts';
import { makeSource, pollContext } from '../helpers.ts';

function fixture(name: string): string {
  return readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8');
}

describe('Hacker News Who-is-hiring Source Adapter', () => {
  const registry = createSourceRegistry();

  it('is registered in the source registry', () => {
    const adapter = registry.get('hn');
    expect(adapter).toBeDefined();
    expect(adapter?.kind).toBe('hn');
    expect(adapter?.access).toBe('official');
    expect(adapter?.poll).toBeTypeOf('function');
  });

  it('finds the hiring thread and keeps only top-level comments', async () => {
    const adapter = registry.get('hn');
    expect(adapter?.poll).toBeDefined();

    const urls: string[] = [];
    const ctx = {
      ...pollContext(''),
      fetchImpl: async (input: RequestInfo | URL) => {
        const url = input.toString();
        urls.push(url);
        if (url.includes('tags=story')) {
          return new Response(fixture('hn-stories.json'), { status: 200 });
        }
        return new Response(fixture('hn-comments.json'), { status: 200 });
      },
    };

    const source = makeSource({
      kind: 'hn',
      config: { url: 'https://hn.algolia.com/api/v1', limit: 50 },
    });

    const leads = await adapter!.poll!(source, ctx);

    expect(urls[0]).toContain('tags=story,author_whoishiring');
    expect(urls[1]).toContain('tags=comment,story_49922569');
    expect(urls[1]).toContain('hitsPerPage=50');

    // Top-level comments only: the reply and the short one are skipped,
    // the deleted comment (no text) is skipped too.
    expect(leads).toHaveLength(1);
    const lead = leads[0]!;
    expect(lead.externalId).toBe('hn:50010001');
    expect(lead.url).toBe('https://news.ycombinator.com/item?id=50010001');
    expect(lead.isRemote).toBe(true);
    expect(lead.city).toBe('Онлайн');
    expect(lead.title).toContain('Senior Golang Engineer');
    expect(lead.text).not.toContain('<b>');
    expect(lead.publishedAt).toBe('2026-10-02T10:00:00Z');
  });

  it('returns no leads when no hiring thread is found', async () => {
    const adapter = registry.get('hn');
    const noThreads = JSON.stringify({ hits: [{ objectID: '1', title: 'Ask HN: Who wants to be hired?' }] });
    const ctx = {
      ...pollContext(noThreads),
      fetchImpl: async () => new Response(noThreads, { status: 200 }),
    };
    const source = makeSource({ kind: 'hn', config: {} });
    const leads = await adapter!.poll!(source, ctx);
    expect(leads).toEqual([]);
  });
});
