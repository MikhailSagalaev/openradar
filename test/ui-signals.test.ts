import { describe, expect, it } from 'vitest';
import { KIND_ACCESS, isDirectEmployerSource, layout, scoreBand } from '../src/server/ui.ts';
import { createSourceRegistry } from '../src/sources/index.ts';
import type { SourceRecord } from '../src/core/types.ts';

function source(kind: string, config: Record<string, unknown> = {}): SourceRecord {
  return { id: `s-${kind}`, kind, title: kind, enabled: true, config, createdAt: '', updatedAt: '' } as SourceRecord;
}

describe('scoreBand', () => {
  it.each([
    [100, 'strong'],
    [80, 'strong'],
    [79, 'good'],
    [60, 'good'],
    [59, 'weak'],
    [40, 'weak'],
    [39, 'noise'],
    [0, 'noise'],
  ])('%i is %s', (score, band) => {
    expect(scoreBand(score)).toBe(band);
  });
});

describe('isDirectEmployerSource', () => {
  it.each([
    ['hh', {}, true],
    ['trudvsem', {}, true],
    ['remoteok', {}, true],
    ['ats', {}, true],
    ['rss', {}, true],
    ['imap', {}, true],
    ['telegram-account', {}, true],
    ['telegram', {}, false],
    ['kwork', {}, false],
    ['sitemap', {}, false],
    ['webhook', {}, false],
    ['webhook', { trust: 7 }, false],
    ['webhook', { trust: 8 }, true],
    ['webhook', { trust: '10' }, true],
    ['unknown-kind', {}, false],
  ])('%s %j → %s', (kind, config, expected) => {
    expect(isDirectEmployerSource(source(kind, config))).toBe(expected);
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
    expect(body.startsWith('<a class="skip-link" href="#main">Skip to feed</a>')).toBe(true);
    expect(html).toContain('id="main"');
  });
});
