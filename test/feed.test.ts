import { describe, expect, it } from 'vitest';
import { renderRssFeed } from '../src/server/feed.ts';
import type { Lead } from '../src/core/types.ts';

describe('RSS Feed generator', () => {
  it('renders valid RSS 2.0 XML with items', () => {
    const leads: Lead[] = [
      {
        id: 'test-1',
        sourceId: 'src-1',
        title: 'Разработка на C++',
        text: 'Требуется опытный разработчик C++ для Highload системы',
        fingerprint: 'fp1',
        titleKey: 'c-plus-plus',
        status: 'new',
        score: 85,
        reasons: [],
        createdAt: '2026-10-23T12:00:00Z',
      },
    ];

    const xml = renderRssFeed({
      leads,
      title: 'OpenRadar — Поиск C++',
      baseUrl: 'https://radar.example.com',
      feedUrl: 'https://radar.example.com/feed.rss?q=C%2B%2B',
    });

    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('<rss version="2.0"');
    expect(xml).toContain('<title>OpenRadar — Поиск C++</title>');
    expect(xml).toContain('<item>');
    expect(xml).toContain('<title>Разработка на C++</title>');
    expect(xml).toContain('<![CDATA[Требуется опытный разработчик C++ для Highload системы]]>');
    expect(xml).toContain('<guid isPermaLink="false">test-1</guid>');
  });
});
