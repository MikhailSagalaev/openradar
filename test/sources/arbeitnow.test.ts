import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createSourceRegistry } from '../../src/sources/index.ts';
import { makeSource, pollContext } from '../helpers.ts';

function fixture(name: string): string {
  return readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8');
}

describe('Arbeitnow Source Adapter', () => {
  const registry = createSourceRegistry();

  it('is registered in the source registry', () => {
    const adapter = registry.get('arbeitnow');
    expect(adapter).toBeDefined();
    expect(adapter?.kind).toBe('arbeitnow');
    expect(adapter?.access).toBe('official');
    expect(adapter?.poll).toBeTypeOf('function');
  });

  it('parses jobs, keeps remote flag and converts unix dates', async () => {
    const adapter = registry.get('arbeitnow');
    expect(adapter?.poll).toBeDefined();

    let capturedUrl = '';
    const ctx = {
      ...pollContext(fixture('arbeitnow.json')),
      fetchImpl: async (input: RequestInfo | URL) => {
        capturedUrl = input.toString();
        return new Response(fixture('arbeitnow.json'), { status: 200 });
      },
    };

    const source = makeSource({
      kind: 'arbeitnow',
      config: { url: 'https://www.arbeitnow.com/api/job-board-api', limit: 10 },
    });

    const leads = await adapter!.poll!(source, ctx);

    expect(capturedUrl).toContain('limit=10');
    // 3 items in the fixture, one without a title
    expect(leads).toHaveLength(2);

    const office = leads.find((lead) => lead.externalId === 'arbeitnow:senior-backend-engineer-berlin-1001')!;
    expect(office.title).toBe('Senior Backend Engineer (m/w/d)');
    expect(office.author).toBe('Amperecloud GmbH');
    expect(office.isRemote).toBe(false);
    expect(office.city).toBe('Berlin');
    expect(office.skills).toEqual(['backend', 'python', 'django']);
    expect(office.publishedAt).toBe(new Date(1793210441 * 1000).toISOString());
    expect(office.text).toContain('Build the OS for renewable energy');

    const remote = leads.find((lead) => lead.externalId === 'arbeitnow:remote-frontend-developer-1002')!;
    expect(remote.isRemote).toBe(true);
    expect(remote.city).toBe('Онлайн');
  });

  it('returns no leads and does not throw on broken JSON', async () => {
    const adapter = registry.get('arbeitnow');
    const ctx = {
      ...pollContext('not json'),
      fetchImpl: async () => new Response('not json', { status: 200 }),
    };
    const source = makeSource({ kind: 'arbeitnow', config: {} });
    const leads = await adapter!.poll!(source, ctx);
    expect(leads).toEqual([]);
  });
});
