import { describe, expect, it } from 'vitest';
import {
  SEO_CATALOG,
  findCatalogEntry,
  renderAboutPage,
  renderCatalogIndex,
  renderCatalogPage,
  renderFaqPage,
  renderLlmsTxt,
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
    // Rows open the lead page on the hub, and the page carries text, FAQ and structured data.
    expect(html).toContain('href="https://openradar.fun/leads/lead-1"');
    expect(html).toContain('"@type": "FAQPage"');
    expect(html).toContain('"@type": "BreadcrumbList"');
    expect(html).toContain('"@type": "ItemList"');
    expect(html).toContain(entry.about.slice(0, 40));
    expect(html).toContain('href="/catalog/');
    expect(html).toContain('120 000');
  });

  it('keeps every catalog page unique', () => {
    const slugs = new Set(SEO_CATALOG.map((item) => item.slug));
    const titles = new Set(SEO_CATALOG.map((item) => item.title));
    expect(slugs.size).toBe(SEO_CATALOG.length);
    expect(titles.size).toBe(SEO_CATALOG.length);
    for (const item of SEO_CATALOG) {
      expect(item.slug).toMatch(/^[a-z0-9-]+$/);
      expect(item.description.length).toBeLessThanOrEqual(170);
      expect(item.about.length).toBeGreaterThan(80);
    }
  });

  it('renders the catalog index, about, FAQ and llms.txt', () => {
    const index = renderCatalogIndex({ baseUrl: 'https://openradar.fun', version: 'test' });
    for (const item of SEO_CATALOG) expect(index).toContain(`/catalog/${item.slug}`);
    expect(index).toContain('rel="canonical" href="https://openradar.fun/catalog"');

    const about = renderAboutPage({ baseUrl: 'https://openradar.fun', version: 'test' });
    expect(about).toContain('<h1>О проекте OpenRadar</h1>');
    expect(about).toContain('"@type": "SearchAction"');

    const faq = renderFaqPage({ baseUrl: 'https://openradar.fun', version: 'test' });
    expect(faq).toContain('"@type": "FAQPage"');
    expect(faq).toContain('Это бесплатно?');

    const llms = renderLlmsTxt('https://openradar.fun');
    expect(llms).toMatch(/^# OpenRadar/);
    expect(llms).toContain('https://openradar.fun/catalog/vakansii-python');
  });

  it('renders robots.txt and sitemap.xml for the catalog', () => {
    const robots = renderRobotsTxt('https://openradar.fun');
    expect(robots).toContain('Sitemap: https://openradar.fun/sitemap.xml');
    expect(robots).toContain('Disallow: /api');

    const sitemap = renderSitemapXml('https://openradar.fun');
    expect(sitemap).toContain('<loc>https://openradar.fun/</loc>');
    expect(sitemap).toContain('<loc>https://openradar.fun/catalog/zakazy-na-razrabotku</loc>');
    expect(robots).not.toContain('Disallow: /leads/');
    expect(robots).toContain('Disallow: /admin');
    expect(sitemap).toContain('<loc>https://openradar.fun/about</loc>');
    expect(sitemap).toContain('<loc>https://openradar.fun/faq</loc>');
    expect(sitemap).toContain('<loc>https://openradar.fun/catalog</loc>');

    const withLeads = renderSitemapXml('https://openradar.fun', [{ id: 'abc', createdAt: '2026-10-26T06:48:19.000Z' }]);
    expect(withLeads).toContain('<loc>https://openradar.fun/leads/abc</loc><lastmod>2026-10-26</lastmod>');
  });
});
