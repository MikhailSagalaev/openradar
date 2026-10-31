import { describe, expect, it } from 'vitest';
import type { SourceRecord } from '../src/core/types.ts';
import { clearRobotsCache } from '../src/net/robots.ts';
import { auditSourceRobots, pollUrlOf, robotsMarkdown } from '../src/pipeline/robots-audit.ts';
import { createSourceRegistry } from '../src/sources/index.ts';

const source = (kind: string, config: Record<string, unknown>, title = kind): SourceRecord =>
  ({ id: `${kind}-${title}`, kind, title, enabled: true, config, createdAt: '', updatedAt: '' }) as SourceRecord;

describe('robots audit of sources', () => {
  it('finds the address each kind polls, or says why there is none', () => {
    expect(pollUrlOf(source('rss', { url: 'https://www.fl.ru/rss/all.xml' }))).toEqual({ url: 'https://www.fl.ru/rss/all.xml' });
    expect(pollUrlOf(source('telegram', { channel: '@proglib_jobs' }))).toEqual({ url: 'https://t.me/s/proglib_jobs' });
    expect(pollUrlOf(source('kwork', {}))).toEqual({ url: 'https://kwork.ru/projects' });
    expect(pollUrlOf(source('telegram-account', { folder: 'openradar' })).note).toContain('MTProto');
    expect(pollUrlOf(source('webhook', {})).note).toContain('вебхук');
  });

  it('logs a disallowed source as waiting for the operator\'s decision', async () => {
    clearRobotsCache();
    const fetchImpl = (async (url: string) =>
      new Response(String(url).includes('fl.ru') ? 'User-agent: *\nDisallow: */rss/*\n' : 'User-agent: *\nAllow: /\n', { status: 200 })) as unknown as typeof fetch;
    const items = await auditSourceRobots(
      [source('rss', { url: 'https://www.fl.ru/rss/all.xml' }, 'FL.ru'), source('rss', { url: 'https://himalayas.app/jobs/rss' }, 'Himalayas'), source('webhook', {}, 'Ручное')],
      createSourceRegistry(),
      'RadarBot/1.0',
      fetchImpl,
    );
    expect(items.map((i) => i.robots?.verdict)).toEqual(['disallowed', 'allowed', undefined]);
    const md = robotsMarkdown(items, new Date('2026-10-31T00:00:00Z'), 'RadarBot/1.0');
    expect(md).toContain('| FL.ru | rss | official | да | `https://www.fl.ru/rss/all.xml` | **запрещено** (`Disallow: */rss/*`) |');
    expect(md).toContain('- **FL.ru** — robots.txt запрещает `Disallow: */rss/*`. Решение: _ждёт решения оператора_.');
    expect(md).toContain('| Ручное | webhook |');
  });
});
