import { describe, expect, it } from 'vitest';
import {
  findCatalogEntry,
  renderCatalogPage,
  renderRobotsTxt,
  renderSitemapXml,
} from '../src/server/seo.ts';
import { makeSource } from './helpers.ts';

const entry = findCatalogEntry('zakazy-na-razrabotku')!;

describe('SEO catalog pages', () => {
  it('has a catalog with the key landing slugs', () => {
    const all = ['zakazy-na-razrabotku', 'vakansii-razrabotchikov', 'udalennye-vakansii'];
    for (const slug of all) expect(findCatalogEntry(slug)).toBeDefined();
  });

  it('renders an indexable landing with canonical, description and feed discovery', () => {
    const lead = {
      id: 'lead-1',
      sourceId: makeSource().id,
      title: 'Разработка интернет-магазина',
      text: 'Нужен магазин на WordPress',
      url: 'https://example.com/order/1',
      type: 'gig' as const,
      status: 'new' as const,
      score: 80,
      city: 'Москва',
      budget: 120000,
      createdAt: new Date().toISOString(),
      fingerprint: 'fp-1',
      titleKey: 'разработка интернет-магазина',
      reasons: [],
    };
    const html = renderCatalogPage({
      entry,
      leads: [lead],
      baseUrl: 'https://openradar.fun',
      version: 'test',
    });
    expect(html).toContain('Заказы на разработку');
    expect(html).toContain('rel="canonical" href="https://openradar.fun/catalog/zakazy-na-razrabotku"');
    expect(html).toContain('name="description"');
    expect(html).toContain('rel="alternate" type="application/rss+xml"');
    expect(html).toContain('Разработка интернет-магазина');
    expect(html).toContain('120 000');
  });

  it('renders robots.txt and sitemap.xml for the catalog', () => {
    const robots = renderRobotsTxt('https://openradar.fun');
    expect(robots).toContain('Sitemap: https://openradar.fun/sitemap.xml');
    expect(robots).toContain('Disallow: /api');

    const sitemap = renderSitemapXml('https://openradar.fun');
    expect(sitemap).toContain('<loc>https://openradar.fun/</loc>');
    expect(sitemap).toContain('<loc>https://openradar.fun/catalog/zakazy-na-razrabotku</loc>');
  });
});
