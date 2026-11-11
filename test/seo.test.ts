import { describe, expect, it } from 'vitest';
import {
  SEO_CATALOG,
  findCatalogEntry,
  renderAboutPage,
  renderCatalogIndex,
  renderCatalogPage,
  renderFaqPage,
  renderLlmsTxt,
  renderNetworkPage,
  renderReviewPage,
  renderRobotsTxt,
  isCatalogLeadRelevant,
  localizeCatalogEntry,
  renderSitemapXml,
} from '../src/server/seo.ts';
import { translateCity, translateSkill, translateSourceTitle } from '../src/server/i18n.ts';
import { renderLeadPage, renderLeadsPage } from '../src/server/ui.ts';
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
    expect(about).toContain('<h1>О проекте openradar</h1>');
    expect(about).toContain('"@type": "SearchAction"');
    expect(about).toContain('<a href="/sources">странице источников</a>');
    expect(about).not.toContain('/sources/new');
    expect(about).not.toContain('/sources/catalog');

    const aboutEn = renderAboutPage({ baseUrl: 'https://openradar.fun', version: 'test', lang: 'en' });
    expect(aboutEn).toContain('<a href="/sources">sources page</a>');
    expect(aboutEn).not.toContain('/sources/new');
    expect(aboutEn).not.toContain('/sources/catalog');

    const faq = renderFaqPage({ baseUrl: 'https://openradar.fun', version: 'test' });
    expect(faq).toContain('"@type": "FAQPage"');
    expect(faq).toContain('Это бесплатно?');
    expect(faq).toContain('<a href="/sources">странице источников</a>');
    expect(faq).not.toContain('/sources/new');

    const faqEn = renderFaqPage({ baseUrl: 'https://openradar.fun', version: 'test', lang: 'en' });
    expect(faqEn).toContain('<a href="/sources">sources page</a>');
    expect(faqEn).not.toContain('/sources/catalog');

    const indexEn = renderCatalogIndex({ baseUrl: 'https://openradar.fun', version: 'test', lang: 'en' });
    expect(indexEn).toContain('Categories of orders and vacancies');
    expect(indexEn).toContain('Freelance gigs');
    expect(indexEn).toContain('Vacancies');

    const catalogPageEn = renderCatalogPage({
      entry,
      leads: [],
      baseUrl: 'https://openradar.fun',
      version: 'test',
      lang: 'en',
    });
    expect(catalogPageEn).toContain('No posts yet');
    expect(catalogPageEn).toContain('RSS feed');
    expect(catalogPageEn).toContain('Overview');
    expect(catalogPageEn).toContain('Where do gigs on this page come from?');

    const llms = renderLlmsTxt('https://openradar.fun');
    expect(llms).toMatch(/^# openradar/);
    expect(llms).toContain('https://openradar.fun/catalog/vakansii-python');
    expect(llms).toContain('https://openradar.fun/sources');
    expect(llms).not.toContain('/sources/new');
    expect(llms).not.toContain('/sources/catalog');
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
    expect(sitemap).toContain('<loc>https://openradar.fun/sources</loc>');
    expect(sitemap).toMatch(/<loc>https:\/\/openradar\.fun\/sources<\/loc><lastmod>\d{4}-\d{2}-\d{2}<\/lastmod><changefreq>daily<\/changefreq>/);
    expect(sitemap).not.toContain('/sources/new');
    expect(sitemap).not.toContain('/sources/catalog');
    expect(sitemap).not.toContain('/sources/');
    expect(sitemap).not.toContain('<loc>https://openradar.fun/review</loc>');
    expect(robots).toContain('Disallow: /sources/new');
    expect(robots).toContain('Disallow: /sources/catalog');
    expect(robots).toContain('Disallow: /sources/*/edit');
    expect(robots).not.toMatch(/^Disallow: \/sources$/m);

    const withLeads = renderSitemapXml('https://openradar.fun', [{ id: 'abc', createdAt: '2026-10-26T06:48:19.000Z' }]);
    expect(withLeads).toContain('<loc>https://openradar.fun/leads/abc</loc><lastmod>2026-10-26</lastmod>');
    expect(withLeads).toContain('<loc>https://openradar.fun/sources</loc>');
    expect(withLeads).not.toContain('/sources/new');
  });

  it('keeps the review page out of the index', () => {
    const html = renderReviewPage({ version: 'test', directions: [], direction: '', mine: 0 });
    expect(html).toContain('<meta name="robots" content="noindex">');
  });

  it('renders og metadata and WebSite SearchAction schema on the main page', () => {
    const html = renderLeadsPage({
      stats: { leads: 10, newLeads: 5, deliveredLeads: 5, rejectedLeads: 0, enabledSources: 2, sources: 2, last24h: 5 },
      health: [],
      leads: [],
      query: '',
      status: '',
      version: 'test',
    });
    expect(html).toContain('property="og:description"');
    expect(html).toContain('property="og:url"');
    expect(html).toContain('name="twitter:description"');
    expect(html).toContain('"@type": "WebSite"');
    expect(html).toContain('"@type": "SearchAction"');
    expect(html).toContain('https://openradar.fun/?q={search_term_string}');
  });

  it('renders JobPosting schema for gigs with CONTRACTOR and extracted company name', () => {
    const lead = {
      id: 'lead-test-123',
      sourceId: 'src-1',
      title: 'Разработчик frontend',
      text: '#вакансия #frontend Компания: Яндекс Лавка\nИщем фронтенд разработчика на проект.',
      type: 'gig' as const,
      status: 'new' as const,
      score: 75,
      budget: 80000,
      currency: 'RUB',
      createdAt: '2026-11-01T10:00:00.000Z',
      fingerprint: 'fp-123',
      titleKey: 'разработчик frontend',
      reasons: [],
    };
    const html = renderLeadPage({
      lead,
      source: undefined,
      version: 'test',
      auth: undefined,
    });
    expect(html).toContain('"@type": "JobPosting"');
    expect(html).toContain('"employmentType": "CONTRACTOR"');
    expect(html).toContain('"name": "Яндекс Лавка"');
    // Leading hashtags are stripped from meta description
    expect(html).not.toMatch(/content="#вакансия/);
    expect(html).toContain('content="Компания: Яндекс Лавка');
  });
});

describe('participants table', () => {
  it('keeps every row under its header', () => {
    const html = renderNetworkPage({
      baseUrl: 'https://example.test',
      version: '0',
      participants: [{ shortPubkey: 'abcd', handle: 'mona', posts: 12, points: 3.5, tier: 'member' }],
      sources: [],
      windowDays: 30,
    });
    const table = html.slice(html.indexOf('<table class="profile-table">'));
    const head = table.slice(0, table.indexOf('</thead>'));
    const row = table.slice(table.indexOf('<tbody>'), table.indexOf('</tbody>'));
    expect(row.match(/<td/g)?.length).toBe(head.match(/<th>/g)?.length);
    expect(row).toContain('<td class="num">12</td>');
    expect(row).toContain('<td class="num">35</td>');
    expect(row).toContain('href="/u/mona"');
  });
});

describe('English localization parity (lang = en)', () => {
  it('translates all 28 SEO catalog entries without Cyrillic', () => {
    for (const entry of SEO_CATALOG) {
      const en = localizeCatalogEntry(entry, 'en');
      expect(en.slug).toBe(entry.slug);
      expect(en.title).not.toMatch(/[а-яё]/i);
      expect(en.h1).not.toMatch(/[а-яё]/i);
      expect(en.description).not.toMatch(/[а-яё]/i);
      expect(en.intro).not.toMatch(/[а-яё]/i);
    }
    const indexHtml = renderCatalogIndex({ baseUrl: 'https://openradar.fun', version: 'test', lang: 'en' });
    expect(indexHtml).toContain('Categories of orders and vacancies');
    expect(indexHtml).not.toMatch(/[а-яё]/i);

    const catHtml = renderCatalogPage({ entry: SEO_CATALOG[0]!, baseUrl: 'https://openradar.fun', version: 'test', leads: [], lang: 'en' });
    expect(catHtml).toContain('Development gigs');
    expect(catHtml).not.toMatch(/[а-яё]/i);
  });

  it('renders English /about, /faq, /network, and /llms.txt without Cyrillic', () => {
    const aboutEn = renderAboutPage({ baseUrl: 'https://openradar.fun', version: 'test', lang: 'en' });
    expect(aboutEn).not.toMatch(/[а-яё]/i);
    const faqEn = renderFaqPage({ baseUrl: 'https://openradar.fun', version: 'test', lang: 'en' });
    expect(faqEn).not.toMatch(/[а-яё]/i);
    const netEn = renderNetworkPage({
      baseUrl: 'https://openradar.fun',
      version: 'test',
      participants: [{ shortPubkey: 'abcd', handle: 'mona', posts: 5, points: 2.0, tier: 'member' }],
      sources: [{ title: 'Хабр Карьера — Вакансии и заказы', leads: 10 }],
      windowDays: 30,
      lang: 'en',
    });
    expect(netEn).toContain('Habr Career — Jobs and gigs');
    expect(netEn).not.toMatch(/[а-яё]/i);

    const llmsEn = renderLlmsTxt('https://openradar.fun', 'en');
    expect(llmsEn).toContain('# openradar');
    expect(llmsEn).not.toMatch(/[а-яё]/i);
  });

  it('translates skills, cities, and source titles into English', () => {
    expect(translateSkill('Продажи', 'en')).toBe('Sales');
    expect(translateSkill('Разработка', 'en')).toBe('Development');
    expect(translateCity('Москва', 'en')).toBe('Moscow');
    expect(translateCity('Санкт-Петербург', 'en')).toBe('Saint Petersburg');
    expect(translateSourceTitle('Работа России — Государственная база вакансий (IT)', 'en')).toBe('Rabota Rossii — National Job Bank (IT)');
  });
});

describe('SEO catalog filtering quality', () => {
  it('excludes physical construction, furniture, and HVAC blueprints from IT development catalog', () => {
    const devEntry = findCatalogEntry('zakazy-na-razrabotku')!;
    const furnitureLead = {
      id: 'f1',
      sourceId: 's1',
      title: 'Разработка планировочного решения Мебели коттедж 320 м2',
      text: 'Нужна разработка планировочного решения мебели для коттеджа.',
      type: 'gig' as const,
      direction: 'dev-other',
      status: 'new' as const,
      score: 60,
      createdAt: '2026-11-11T00:00:00Z',
      fingerprint: 'fp1',
      titleKey: 'f1',
      reasons: [],
    };
    const hvacLead = {
      ...furnitureLead,
      id: 'f2',
      title: 'Ведущий инженер-проектировщик ОВ',
      text: 'Разработка проектной документации раздела ОВ и ВК.',
    };
    const realPhpLead = {
      ...furnitureLead,
      id: 'f3',
      title: 'Внести правки сайта на PHP и доработать API',
      text: 'Нужна разработка модуля оплаты на PHP Laravel.',
    };
    expect(isCatalogLeadRelevant(furnitureLead, devEntry)).toBe(false);
    expect(isCatalogLeadRelevant(hvacLead, devEntry)).toBe(false);
    expect(isCatalogLeadRelevant(realPhpLead, devEntry)).toBe(true);
  });
});
