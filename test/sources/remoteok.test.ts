import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createSourceRegistry } from '../../src/sources/index.ts';
import { makeSource, pollContext } from '../helpers.ts';

function fixture(name: string): string {
  return readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8');
}

describe('RemoteOK Source Adapter', () => {
  const registry = createSourceRegistry();

  it('is registered in the source registry', () => {
    const adapter = registry.get('remoteok');
    expect(adapter).toBeDefined();
    expect(adapter?.kind).toBe('remoteok');
    expect(adapter?.access).toBe('official');
    expect(adapter?.poll).toBeTypeOf('function');
  });

  it('parses RemoteOK API jobs and skips legal notice', async () => {
    const adapter = registry.get('remoteok');
    expect(adapter?.poll).toBeDefined();

    let capturedUrl: string | undefined;
    const baseCtx = pollContext(fixture('remoteok.json'));
    const ctx = {
      ...baseCtx,
      fetchImpl: async (input: RequestInfo | URL) => {
        capturedUrl = input.toString();
        return new Response(fixture('remoteok.json'), { status: 200 });
      },
    };

    const source = makeSource({
      kind: 'remoteok',
      config: {
        url: 'https://remoteok.com/api',
        tag: 'golang',
        limit: 10,
      },
    });

    const leads = await adapter!.poll!(source, ctx);

    // Verify tag parameter in URL
    expect(capturedUrl).toContain('tag=golang');

    // 4 items in fixture, but first is legal notice -> 3 jobs parsed
    expect(leads).toHaveLength(3);

    const first = leads[0]!;
    expect(first.type).toBe('job');
    expect(first.isRemote).toBe(true);
    expect(first.currency).toBe('USD');
    expect(first.title).toBe('Senior Backend Engineer (Go)');
    expect(first.author).toBe('Supabase');
    expect(first.externalId).toBe('remoteok:1049283');
    expect(first.url).toBe('https://remoteok.com/remote-jobs/1049283-senior-backend-engineer-go');
    expect(first.city).toBe('Онлайн');
    expect(first.budget).toBe(130000);
    expect(first.normalizedUsdMin).toBe(130000);
    expect(first.normalizedUsdMax).toBe(180000);
    expect(first.rawSalary).toBe('$130000 - $180000 / year');
    expect(first.skills).toEqual(['golang', 'backend', 'postgresql', 'api', 'docker']);

    // Direct contacts are preserved as raw text for community outreach
    expect(first.text).toContain('jobs@supabase.com');

    const second = leads[1]!;
    expect(second.title).toBe('Staff Fullstack Engineer (React & Node.js)');
    expect(second.author).toBe('Vercel');
    expect(second.budget).toBe(160000);
    expect(second.normalizedUsdMax).toBe(220000);
    expect(second.skills).toContain('react');
    expect(second.skills).toContain('nextjs');

    const third = leads[2]!;
    expect(third.title).toBe('DevOps / Platform Engineer (Kubernetes, AWS)');
    expect(third.author).toBe('GitLab');
    expect(third.budget).toBe(140000);
    expect(third.normalizedUsdMax).toBeUndefined();
    expect(third.skills).toContain('kubernetes');
    expect(third.skills).toContain('aws');
  });
});
