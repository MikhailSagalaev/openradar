import { describe, expect, it } from 'vitest';
import type { Lead } from '../src/core/types.ts';
import { salaryLooksWrong } from '../src/core/salary-sanity.ts';
import { SEO_STRINGS } from '../src/server/i18n.ts';
import { findCatalogEntry, renderCatalogPage, renderParticipantPage } from '../src/server/seo.ts';
import { leadMetaLine } from '../src/server/ui.ts';

function lead(overrides: Partial<Lead>): Lead {
  return {
    id: 'lead-1', sourceId: 'src-1', title: 'Senior Python developer', text: 'Python', url: 'https://example.com/1',
    type: 'job', status: 'new', score: 80, city: 'Москва', budget: 250_000, currency: 'RUB',
    createdAt: new Date().toISOString(), fingerprint: 'fp-1', titleKey: 'senior python developer', reasons: [],
    ...overrides,
  } as Lead;
}

const rowMetas = (html: string): string[] => [...html.matchAll(/<div class="row-meta">([^<]*)<\/div>/g)].map((m) => m[1]!);

describe('SEO lead rows', () => {
  const entry = findCatalogEntry('vakansii-razrabotchikov')!;

  it('show the same meta line as the feed, in the page language', () => {
    const ok = lead({});
    for (const lang of ['ru', 'en'] as const) {
      const html = renderCatalogPage({ entry, leads: [ok], baseUrl: 'https://openradar.fun', version: 'test', lang });
      expect(rowMetas(html)).toEqual([leadMetaLine(ok, lang).replace(/&/g, '&amp;')]);
    }
    expect(leadMetaLine(ok, 'ru')).toContain('250');
    expect(leadMetaLine(ok, 'en')).toMatch(/^Job · /);
  });

  it('hide a salary the feed would hide', () => {
    const absurd = lead({ id: 'lead-2', budget: 124_000, currency: 'USD' });
    expect(salaryLooksWrong(absurd)).toBe(true);
    const catalog = renderCatalogPage({ entry, leads: [absurd], baseUrl: 'https://openradar.fun', version: 'test' });
    const participant = renderParticipantPage({ baseUrl: 'https://openradar.fun', version: 'test', lang: 'en', handle: 'alice', since: '2026-11-01', points: 1, total: 1, tier: 'new', posts: [absurd] });
    for (const html of [catalog, participant]) {
      const [meta] = rowMetas(html);
      expect(meta).toBeDefined();
      expect(meta).not.toMatch(/124|USD/);
    }
    // The participant page follows the page language now.
    expect(rowMetas(participant)[0]).toMatch(/^Job · /);
  });

  it('keeps the RU and EN SEO dictionaries in step', () => {
    expect(Object.keys(SEO_STRINGS.en).sort()).toEqual(Object.keys(SEO_STRINGS.ru).sort());
    for (const key of Object.keys(SEO_STRINGS.ru) as Array<keyof typeof SEO_STRINGS.ru>) {
      expect(typeof SEO_STRINGS.en[key]).toBe(typeof SEO_STRINGS.ru[key]);
    }
  });
});
