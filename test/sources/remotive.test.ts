import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createSourceRegistry } from '../../src/sources/index.ts';
import { makeSource, pollContext } from '../helpers.ts';

function fixture(name: string): string {
  return readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8');
}

describe('Remotive Source Adapter', () => {
  const registry = createSourceRegistry();

  it('is registered in the source registry', () => {
    const adapter = registry.get('remotive');
    expect(adapter).toBeDefined();
    expect(adapter?.kind).toBe('remotive');
    expect(adapter?.access).toBe('official');
    expect(adapter?.poll).toBeTypeOf('function');
  });

  it('parses jobs, list-encoded tags and skips items without a title', async () => {
    const adapter = registry.get('remotive');
    expect(adapter?.poll).toBeDefined();

    let capturedUrl = '';
    const ctx = {
      ...pollContext(fixture('remotive.json')),
      fetchImpl: async (input: RequestInfo | URL) => {
        capturedUrl = input.toString();
        return new Response(fixture('remotive.json'), { status: 200 });
      },
    };

    const source = makeSource({
      kind: 'remotive',
      config: { url: 'https://remotive.com/api/remote-jobs', limit: 10 },
    });

    const leads = await adapter!.poll!(source, ctx);

    expect(capturedUrl).toContain('limit=10');
    // 3 items in the fixture, one without a title
    expect(leads).toHaveLength(2);

    const first = leads[0]!;
    expect(first.externalId).toBe('remotive:2091134');
    expect(first.title).toBe('Head of Engineering');
    expect(first.author).toBe('Lemon.io');
    expect(first.isRemote).toBe(true);
    expect(first.city).toBe('Онлайн');
    expect(first.skills).toEqual(['AI/ML', 'startup', 'marketplace']);
    expect(first.rawSalary).toBe('$100k - $130k');
    expect(first.publishedAt).toBe('2026-10-26T12:20:09Z');
    expect(first.text).toContain('Lead the');
    expect(first.text).toContain('engineering');
    expect(first.text).toContain('across timezones');
    expect(first.text).not.toContain('<b>');

    const second = leads[1]!;
    // Not worldwide: the location string is kept as the city
    expect(second.city).toBe('Europe');
  });

  it('returns no leads and does not throw on broken JSON', async () => {
    const adapter = registry.get('remotive');
    const ctx = {
      ...pollContext('not json'),
      fetchImpl: async () => new Response('not json', { status: 200 }),
    };
    const source = makeSource({ kind: 'remotive', config: {} });
    const leads = await adapter!.poll!(source, ctx);
    expect(leads).toEqual([]);
  });
});
