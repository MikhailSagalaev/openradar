import { describe, expect, it } from 'vitest';
import { jsonForScript } from '../src/core/text.ts';
import { prepareRawLead } from '../src/core/prepare.ts';
import { renderLeadPage } from '../src/server/ui.ts';
import { renderCatalogPage, SEO_CATALOG } from '../src/server/seo.ts';
import { renderRssFeed } from '../src/server/feed.ts';
import { imapSource } from '../src/sources/imap.ts';
import type { Lead } from '../src/core/types.ts';
import { makeSource, pollContext, TEST_NOW } from './helpers.ts';

const PAYLOAD = '</script><script>fetch(`/api/sources`,{method:`POST`})</script>';

function lead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: 'lead-x',
    sourceId: 'source-1',
    type: 'job',
    title: 'Go developer',
    text: 'Нужен Go разработчик',
    fingerprint: 'fp-x',
    titleKey: 'go developer',
    status: 'new',
    score: 50,
    reasons: [],
    createdAt: TEST_NOW.toISOString(),
    ...overrides,
  };
}

describe('stored XSS hardening', () => {
  it('jsonForScript output can never close a script element', () => {
    const json = jsonForScript({ name: PAYLOAD });
    expect(json).not.toContain('</script');
    expect(json).not.toContain('<');
    expect(JSON.parse(json).name).toBe(PAYLOAD);
  });

  it('the lead page JSON-LD keeps hostile author and city inert', () => {
    const html = renderLeadPage({ lead: lead({ author: PAYLOAD, city: PAYLOAD }), version: 'test', lang: 'ru' });
    const start = html.indexOf('<script type="application/ld+json">');
    const end = html.indexOf('</script>', start);
    const block = html.slice(start, end);
    expect(block).not.toContain('<script>fetch');
    expect(html.match(/<script>fetch/g)).toBeNull();
  });

  it('prepareRawLead strips markup from author, city and category', () => {
    const prepared = prepareRawLead(
      { sourceId: 'source-1', title: 'Go', text: 'Нужен Go разработчик', author: PAYLOAD, city: `<b>Москва</b>`, category: '<i>Dev</i>' },
      makeSource(),
      TEST_NOW,
    );
    expect(prepared.author ?? '').not.toContain('<');
    expect(prepared.city).toBe('Москва');
    expect(prepared.category).toBe('Dev');
  });

  it('catalog and RSS links never use non-http schemes', () => {
    const hostile = lead({ url: 'javascript:alert(document.domain)' });
    const page = renderCatalogPage({ entry: SEO_CATALOG[0]!, leads: [hostile], baseUrl: 'https://hub.example', version: 'test' });
    expect(page).not.toContain('javascript:');
    expect(page).toContain('https://hub.example/leads/lead-x');
    const rss = renderRssFeed({ leads: [hostile], title: 'T', baseUrl: 'https://hub.example', feedUrl: 'https://hub.example/feed.rss' });
    expect(rss).not.toContain('javascript:');
  });
});

describe('IMAP secrets', () => {
  it('refuses to read any variable outside RADAR_IMAP_*', async () => {
    process.env.DATABASE_URL_FOR_TEST = 'postgres://secret';
    const source = makeSource({ kind: 'imap', config: { host: 'imap.example.com', user: 'u', passwordEnv: 'DATABASE_URL_FOR_TEST' } });
    await expect(imapSource.poll!(source, pollContext(''))).rejects.toThrow(/RADAR_IMAP_/);
    delete process.env.DATABASE_URL_FOR_TEST;
  });
});
