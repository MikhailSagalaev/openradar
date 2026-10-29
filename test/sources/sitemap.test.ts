import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createSourceRegistry } from '../../src/sources/index.ts';
import { leadFromPage, newestPages, sitemapLocs } from '../../src/sources/sitemap.ts';
import { makeSource, pollContext } from '../helpers.ts';

const page = readFileSync(new URL('../fixtures/sitemap-page.html', import.meta.url), 'utf8');

const sitemap = `<?xml version="1.0"?><urlset>
  <url><loc>https://getmatch.ru/vacancies</loc></url>
  <url><loc>https://getmatch.ru/vacancies/36321-bi-developer</loc></url>
  <url><loc>https://getmatch.ru/vacancies/36738-data-scientist-fast-track</loc></url>
  <url><loc>https://getmatch.ru/vacancies/34128-project-manager</loc></url>
</urlset>`;

describe('Sitemap source adapter', () => {
  const adapter = createSourceRegistry().get('sitemap')!;

  it('lists pages and child sitemaps, newest ids first', () => {
    expect(sitemapLocs('<sitemapindex><sitemap><loc>https://x.ru/a.xml</loc></sitemap></sitemapindex>')).toEqual({ pages: [], children: ['https://x.ru/a.xml'] });
    const pages = newestPages(sitemapLocs(sitemap).pages, /\/vacancies\/(\d+)-/);
    expect(pages.map((p) => p.key)).toEqual(['36738', '36321', '34128']);
  });

  it('turns a JobPosting page into a vacancy with the page facts', () => {
    const source = makeSource({ kind: 'sitemap' });
    const lead = leadFromPage(source, 'https://getmatch.ru/vacancies/36738-data-scientist-fast-track', '36738', page)!;
    expect(lead).toMatchObject({ type: 'job', title: 'Data Scientist Fast Track', author: 'Avito', externalId: 'sitemap:getmatch.ru:36738' });
    expect(lead.publishedAt).toBe('2026-10-19T08:35:13.045864');
    expect(lead.city).toMatch(/Москва/);
    expect(lead.metadata?.facts).toMatchObject({ company: 'Avito' });
    expect(leadFromPage(source, 'https://x.ru/1', '1', '<html>no markup</html>')).toBeUndefined();
    // The pay that only the page description gives reaches the text.
    const withMeta = page.replace('<head>', '<head><meta name="description" content="Вакансия Data Scientist в компании Avito. Зарплата: от 300 000 ₽/мес на руки. Дата публикации: 19.10.2026.">');
    expect(leadFromPage(source, 'https://getmatch.ru/vacancies/36738-x', '36738', withMeta)!.text).toContain('от 300 000 ₽/мес');
  });

  it('reads the newest pages a few per poll and goes on to newer ones next time', async () => {
    const source = makeSource({
      id: 'sitemap-getmatch',
      kind: 'sitemap',
      config: { url: 'https://getmatch.ru/sitemap.xml', pattern: '/vacancies/(\\d+)-', perPoll: 2, delayMs: 0, maxAgeDays: 3650 },
    });
    const urls: string[] = [];
    const ctx = {
      ...pollContext(''),
      now: () => new Date('2026-10-29T00:00:00Z'),
      fetchImpl: async (input: RequestInfo | URL) => {
        const url = input.toString();
        urls.push(url);
        return new Response(url.endsWith('sitemap.xml') ? sitemap : page, { status: 200 });
      },
    };
    expect(await adapter.poll!(source, ctx)).toHaveLength(2);
    expect(urls.slice(1)).toEqual(['https://getmatch.ru/vacancies/36738-data-scientist-fast-track', 'https://getmatch.ru/vacancies/36321-bi-developer']);
    await adapter.poll!(source, ctx);
    expect(urls.at(-1)).toBe('https://getmatch.ru/vacancies/34128-project-manager');
  });

  it('leaves out pages older than maxAgeDays', async () => {
    const source = makeSource({ id: 'sitemap-old', kind: 'sitemap', config: { url: 'https://getmatch.ru/sitemap.xml', pattern: '/vacancies/(\\d+)-', delayMs: 0, maxAgeDays: 1 } });
    const ctx = {
      ...pollContext(''),
      now: () => new Date('2026-12-01T00:00:00Z'),
      fetchImpl: async (input: RequestInfo | URL) => new Response(input.toString().endsWith('.xml') ? sitemap : page, { status: 200 }),
    };
    expect(await adapter.poll!(source, ctx)).toEqual([]);
  });
});
