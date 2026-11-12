import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { PollContext } from '../src/core/types.ts';
import { createSourceRegistry } from '../src/sources/index.ts';
import { makeSource, pollContext, TEST_NOW } from './helpers.ts';

function fixture(name: string): string {
  return readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
}

describe('source adapters', () => {
  const registry = createSourceRegistry();

  it('parses an RSS feed', async () => {
    const adapter = registry.get('rss');
    expect(adapter?.poll).toBeTypeOf('function');
    const leads = await adapter!.poll!(
      makeSource({ config: { url: 'https://example.com/rss' } }),
      pollContext(fixture('rss.xml')),
    );
    expect(leads).toHaveLength(1);
    expect(leads[0]?.title).toContain('сантехник');
    expect(leads[0]?.url).toContain('utm_source=rss');
    expect(leads[0]?.externalId).toBe('order-1');
  });

  it('parses a public Telegram channel preview', async () => {
    const adapter = registry.get('telegram');
    const leads = await adapter!.poll!(
      makeSource({ kind: 'telegram', config: { channel: '@test' } }),
      pollContext(fixture('telegram.html')),
    );
    expect(leads).toHaveLength(2);
    expect(leads[0]?.externalId).toBe('tg:test:1');
    expect(leads[0]?.url).toBe('https://t.me/test/1');
    expect(leads[0]?.publishedAt).toBe('2026-10-21T10:00:00+00:00');
  });

  it('parses Kwork page state', async () => {
    const adapter = registry.get('kwork');
    const leads = await adapter!.poll!(
      makeSource({ kind: 'kwork' }),
      pollContext(fixture('kwork.html')),
    );
    expect(leads).toHaveLength(1);
    expect(leads[0]?.title).toBe('Сделать лендинг для кофейни');
    expect(leads[0]?.budget).toBe(15000);
    expect(leads[0]?.externalId).toBe('kwork:123');
  });

  it('uses the Kwork mobile API when RADAR_KWORK_* credentials are set', async () => {
    const adapter = registry.get('kwork');
    const fixtureApi = fixture('kwork-api.json');
    const calls: string[] = [];
    const ctx: PollContext = {
      ...pollContext(''),
      fetchImpl: (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        calls.push(url);
        if (url.endsWith('/signIn')) {
          return new Response(JSON.stringify({ success: true, response: { token: 'tok-123' } }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        return new Response(fixtureApi, { status: 200, headers: { 'content-type': 'application/json' } });
      }) as typeof fetch,
    };

    process.env.RADAR_KWORK_LOGIN = 'kwork-user';
    process.env.RADAR_KWORK_PASSWORD = 'kwork-pass';
    try {
      const leads = await adapter!.poll!(makeSource({ kind: 'kwork', config: { categoryId: '11' } }), ctx);
      expect(calls.some((url) => url.endsWith('/signIn'))).toBe(true);
      expect(calls.some((url) => url.endsWith('/projects'))).toBe(true);
      expect(leads).toHaveLength(2);
      expect(leads[0]?.externalId).toBe('kwork:301');
      expect(leads[0]?.budget).toBe(12000);
      expect(leads[0]?.author).toBe('shop_owner');
      expect(leads[1]?.budget).toBe(25000);
    } finally {
      delete process.env.RADAR_KWORK_LOGIN;
      delete process.env.RADAR_KWORK_PASSWORD;
    }
  });

  it('parses Trudvsem (Работа России) vacancies and keeps contacts in the text', async () => {
    const adapter = registry.get('trudvsem');
    expect(adapter).toBeDefined();
    expect(adapter?.poll).toBeTypeOf('function');
    const leads = await adapter!.poll!(
      makeSource({ kind: 'trudvsem', config: { url: 'https://opendata.trudvsem.ru/api/v1/vacancies' } }),
      pollContext(fixture('trudvsem.json')),
    );
    expect(leads).toHaveLength(5);

    const first = leads[0]!;
    expect(first.title).toBe('Разработчик');
    expect(first.budget).toBe(60000);
    expect(first.url).toContain('trudvsem.ru');
    expect(first.externalId).toBe('trudvsem:ec3ede23-f806-11ef-9741-e7d0d2cf29b1');
    expect(first.author).toBe('ООО "ЭМ СИ АРТ РУС"');
    expect(first.city).toBe('Санкт-Петербург');
    expect(first.isRemote).toBe(true);
    expect(first.skills).toContain('PHP');
    expect(first.skills).toContain('1С');
    expect(first.skills).toContain('Git');

    const second = leads[1]!;
    expect(second.title).toBe('программист-разработчик');
    expect(second.budget).toBe(40000);
    expect(second.city).toBe('Екатеринбург');
    expect(second.skills).toContain('Java');

    const fifth = leads[4]!;
    expect(fifth.title).toBe('Java-разработчик');
    expect(fifth.budget).toBe(200000);
    expect(fifth.city).toBe('Белгород');
    expect(fifth.skills).toContain('Java');
    expect(fifth.skills).toContain('Kafka');
    expect(fifth.skills).toContain('Spring');
    expect(fifth.skills).toContain('PostgreSQL');
    expect(fifth.skills).toContain('Git');

    // Direct contacts are preserved as-is for community reach
    expect(leads[1]?.text).toMatch(/\+7\(900\) 000-00-\d{2}/);
  });

  it('does not expose a poll function for webhook sources', () => {
    const adapter = registry.get('webhook');
    expect(adapter).toBeDefined();
    expect(adapter?.poll).toBeUndefined();
    expect(adapter?.access).toBe('user-provided');
  });

  describe('Alexandria (Firecrawl) adapter', () => {
    const adapter = registry.get('alexandria')!;
    // The verified live smoke shape (2026-11-11, blitzapi/jobs/search), inlined: no network.
    const smoke = {
      success: true,
      data: {
        alexandria: [{
          provider: 'blitzapi',
          capability: 'jobs/search',
          creditsCost: 4,
          data: {
            total_results: 33737,
            results: [
              {
                date_posted: '2026-11-11 11:34:25.004+01',
                title: 'Finance Manager - Product Costing',
                url: 'https://pl.linkedin.com/jobs/view/1234567890',
                company_name: 'ABB',
                ai_summary: 'Own and govern global product costing.',
                location: { city: null, country_code: 'PL' },
              },
              {
                date_posted: '2026-11-10 09:00:00.000+00',
                title: 'Senior Product Manager (Remote)',
                url: 'https://example.com/jobs/2',
                company_name: 'Acme',
                ai_summary: 'Lead the roadmap. Work from home anywhere in the EU.',
                location: { city: 'Berlin', country_code: 'DE' },
              },
            ],
            results_length: 2,
            cursor: 'next-page',
          },
        }],
        creditsCost: 4,
      },
    };

    function alexandriaCtx(body: unknown, status = 200) {
      const requests: Array<{ url: string; init?: RequestInit }> = [];
      const ctx: PollContext = {
        ...pollContext(''),
        fetchImpl: (async (input: RequestInfo | URL, init?: RequestInit) => {
          requests.push({ url: String(input), init });
          return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
        }) as typeof fetch,
      };
      return { ctx, requests };
    }

    it('fails fast without FIRECRAWL_API_KEY', async () => {
      const saved = process.env.FIRECRAWL_API_KEY;
      delete process.env.FIRECRAWL_API_KEY;
      try {
        await expect(adapter.poll!(makeSource({ kind: 'alexandria' }), pollContext(''))).rejects.toThrow(/FIRECRAWL_API_KEY/);
      } finally {
        if (saved !== undefined) process.env.FIRECRAWL_API_KEY = saved;
      }
    });

    it('maps the verified smoke response and sends the documented request', async () => {
      process.env.FIRECRAWL_API_KEY = 'fc-test-key';
      try {
        const { ctx, requests } = alexandriaCtx(smoke);
        const leads = await adapter.poll!(makeSource({ kind: 'alexandria', config: { titles: ['Product Manager'], countries: ['pl', 'de'] } }), ctx);
        expect(requests).toHaveLength(1);
        expect(requests[0]!.url).toBe('https://api.firecrawl.dev/v2/scrape');
        expect((requests[0]!.init!.headers as Record<string, string>).Authorization).toBe('Bearer fc-test-key');
        const body = JSON.parse(String(requests[0]!.init!.body));
        expect(body.alexandria.provider).toBe('blitzapi');
        expect(body.alexandria.capability).toBe('jobs/search');
        expect(body.alexandria.options.job.date_posted.last_days).toBe(30);
        expect(body.alexandria.options.job.title.include).toEqual(['Product Manager']);
        expect(body.alexandria.options.job.location.country_code.include).toEqual(['PL', 'DE']);
        expect(leads).toHaveLength(2);
        const first = leads[0]!;
        expect(first).toMatchObject({ type: 'job', title: 'Finance Manager - Product Costing', author: 'ABB', url: 'https://pl.linkedin.com/jobs/view/1234567890' });
        expect(first.externalId).toBe('alexandria:https://pl.linkedin.com/jobs/view/1234567890');
        expect(first.city).toBeUndefined();
        expect(first.publishedAt).toBe('2026-11-11T10:34:25.004Z');
        expect(first.text).toContain('Location: PL');
        const remote = leads[1]!;
        expect(remote.isRemote).toBe(true);
        expect(remote.city).toBe('Онлайн');
      } finally {
        delete process.env.FIRECRAWL_API_KEY;
      }
    });

    it('returns an empty list for an empty (free) page', async () => {
      process.env.FIRECRAWL_API_KEY = 'fc-test-key';
      try {
        const empty = { success: true, data: { alexandria: [{ provider: 'blitzapi', capability: 'jobs/search', creditsCost: 0, data: { total_results: 0, results: [] } }] } };
        const { ctx } = alexandriaCtx(empty);
        expect(await adapter.poll!(makeSource({ kind: 'alexandria' }), ctx)).toEqual([]);
      } finally {
        delete process.env.FIRECRAWL_API_KEY;
      }
    });

    it('surfaces an HTTP error to source health', async () => {
      process.env.FIRECRAWL_API_KEY = 'fc-test-key';
      try {
        const { ctx } = alexandriaCtx({ success: false }, 402);
        await expect(adapter.poll!(makeSource({ kind: 'alexandria' }), ctx)).rejects.toThrow('Alexandria: HTTP 402');
      } finally {
        delete process.env.FIRECRAWL_API_KEY;
      }
    });

    it('clamps maxResults to 100 and lastDays to 1 (credit guard)', async () => {
      process.env.FIRECRAWL_API_KEY = 'fc-test-key';
      try {
        const { ctx, requests } = alexandriaCtx(smoke);
        await adapter.poll!(makeSource({ kind: 'alexandria', config: { maxResults: 5000, lastDays: 0 } }), ctx);
        const body = JSON.parse(String(requests[0]!.init!.body));
        expect(body.alexandria.options.max_results).toBe(100);
        expect(body.alexandria.options.job.date_posted.last_days).toBe(1);
      } finally {
        delete process.env.FIRECRAWL_API_KEY;
      }
    });

    it('maps malformed records defensively', async () => {
      process.env.FIRECRAWL_API_KEY = 'fc-test-key';
      try {
        const odd = {
          success: true,
          data: { alexandria: [{ provider: 'blitzapi', capability: 'jobs/search', data: { results: [
            { title: 'Odd job', date_posted: 'not a date', location: { city: null } },
            { url: 'https://example.com/jobs/no-title' },
            { title: '   ' },
          ] } }] },
        };
        const { ctx } = alexandriaCtx(odd);
        const leads = await adapter.poll!(makeSource({ kind: 'alexandria' }), ctx);
        expect(leads).toHaveLength(2);
        expect(leads[0]!.publishedAt).toBeUndefined();
        expect(leads[0]!.externalId).toMatch(/^alexandria:[0-9a-f]{24}$/);
        expect(leads[1]!.url).toBe('https://example.com/jobs/no-title');
      } finally {
        delete process.env.FIRECRAWL_API_KEY;
      }
    });
  });

  it('blocks private, loopback, and metadata IPs via SSRF protection', async () => {
    const { isPrivateOrBlockedIp, assertSafeUrl } = await import('../src/core/ssrf.ts');

    expect(isPrivateOrBlockedIp('127.0.0.1')).toBe(true);
    expect(isPrivateOrBlockedIp('10.0.0.1')).toBe(true);
    expect(isPrivateOrBlockedIp('172.16.0.1')).toBe(true);
    expect(isPrivateOrBlockedIp('192.168.1.1')).toBe(true);
    expect(isPrivateOrBlockedIp('169.254.169.254')).toBe(true);
    expect(isPrivateOrBlockedIp('::1')).toBe(true);
    expect(isPrivateOrBlockedIp('fc00::1')).toBe(true);
    expect(isPrivateOrBlockedIp('fe80::1')).toBe(true);
    expect(isPrivateOrBlockedIp('8.8.8.8')).toBe(false);
    expect(isPrivateOrBlockedIp('1.1.1.1')).toBe(false);
    // IPv4 written as IPv6: WHATWG URL turns [::ffff:169.254.169.254] into [::ffff:a9fe:a9fe].
    for (const ip of ['::ffff:a9fe:a9fe', '::ffff:169.254.169.254', '::ffff:7f00:1', '::a9fe:a9fe', '::',
      '64:ff9b::a9fe:a9fe', '2002:a9fe:a9fe::1', '2001:0:4136:e378::1', 'fec0::1', 'ff02::1', '[::1]', '169.254.169.254.']) {
      expect(isPrivateOrBlockedIp(ip), ip).toBe(true);
    }
    for (const ip of ['::ffff:808:808', '2a00:1450:4010:c05::64', '64:ff9b::808:808', 'example.com']) {
      expect(isPrivateOrBlockedIp(ip), ip).toBe(false);
    }
    await expect(assertSafeUrl('http://[::ffff:169.254.169.254]/latest/user-data')).rejects.toThrow(/private\/internal IP/);
    await expect(assertSafeUrl('http://[::ffff:127.0.0.1]:3000/')).rejects.toThrow(/private\/internal IP/);

    await expect(assertSafeUrl('http://169.254.169.254/latest/meta-data')).rejects.toThrow(
      /private\/internal IP/,
    );
    await expect(assertSafeUrl('http://127.0.0.1:8080/admin')).rejects.toThrow(
      /private\/internal IP/,
    );
    await expect(assertSafeUrl('ftp://example.com/rss')).rejects.toThrow(
      /Only http: and https:/i,
    );
  });
});
