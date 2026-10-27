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
