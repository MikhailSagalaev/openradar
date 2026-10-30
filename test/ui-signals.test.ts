import { describe, expect, it } from 'vitest';
import { KIND_ACCESS, isDirectEmployerSource, layout } from '../src/server/ui.ts';
import { createSourceRegistry } from '../src/sources/index.ts';
import type { SourceRecord } from '../src/core/types.ts';

function source(kind: string, config: Record<string, unknown> = {}): SourceRecord {
  return { id: `s-${kind}`, kind, title: kind, enabled: true, config, createdAt: '', updatedAt: '' } as SourceRecord;
}

describe('isDirectEmployerSource', () => {
  it.each([
    ['hh', {}, true],
    ['trudvsem', {}, true],
    ['ats', {}, true],
    ['kwork', {}, true],
    ['rss', { url: 'https://www.fl.ru/rss/all.xml' }, true],
    ['rss', { url: 'https://career.habr.com/vacancies/rss' }, true],
    ['rss', { url: 'https://himalayas.app/jobs/rss' }, false],
    ['rss', {}, false],
    ['remoteok', {}, false],
    ['imap', {}, false],
    ['telegram-account', {}, false],
    ['telegram', {}, false],
    ['sitemap', {}, false],
    ['webhook', {}, false],
    ['webhook', { trust: 7 }, false],
    ['webhook', { trust: 8 }, true],
    ['telegram', { direct: true }, true],
    ['hh', { direct: false }, false],
    ['unknown-kind', {}, false],
  ])('%s %j → %s', (kind, config, expected) => {
    expect(isDirectEmployerSource(source(kind, config))).toBe(expected);
  });

  it('never marks an agency as the direct client', () => {
    expect(isDirectEmployerSource(source('hh'), 'Кадровое агентство «Старт»')).toBe(false);
    expect(isDirectEmployerSource(source('hh'), 'Acme Recruiting')).toBe(false);
    expect(isDirectEmployerSource(source('hh'), 'Яндекс')).toBe(true);
  });

  it('makes no claim without a source', () => {
    expect(isDirectEmployerSource(undefined)).toBe(false);
  });

  it('KIND_ACCESS matches what the adapters declare', () => {
    const declared = Object.fromEntries(createSourceRegistry().list().map((adapter) => [adapter.kind, adapter.access]));
    expect(KIND_ACCESS).toEqual(declared);
  });
});

describe('layout accessibility', () => {
  it('opens the body with a skip link to the main content', () => {
    const html = layout({ title: 'x', version: 'test', body: '<p>feed</p>', lang: 'en' });
    const body = html.slice(html.indexOf('<body>') + '<body>'.length).trimStart();
    expect(body.startsWith('<a class="skip-link" href="#main">Skip to content</a>')).toBe(true);
    expect(html).toContain('id="main"');
  });
});
