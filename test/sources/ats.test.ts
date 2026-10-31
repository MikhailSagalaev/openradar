import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { normalizeSalary } from '../../src/core/salary.ts';
import { companiesOf, nextBatch } from '../../src/sources/ats.ts';
import { createSourceRegistry } from '../../src/sources/index.ts';
import { makeSource, pollContext } from '../helpers.ts';

function fixture(name: string): string {
  return readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8');
}

function served(byHost: Record<string, string>, urls: string[] = []) {
  return {
    ...pollContext(''),
    // The fixtures were taken in October 2026; a year of age keeps them all fresh.
    now: () => new Date('2026-10-29T00:00:00Z'),
    fetchImpl: async (input: RequestInfo | URL) => {
      const url = input.toString();
      urls.push(url);
      const body = Object.entries(byHost).find(([part]) => url.includes(part))?.[1];
      return body ? new Response(body, { status: 200 }) : new Response('not found', { status: 404 });
    },
  };
}

describe('ATS source adapter', () => {
  const adapter = createSourceRegistry().get('ats')!;

  it('is registered as an official source', () => {
    expect(adapter.access).toBe('official');
    expect(adapter.poll).toBeTypeOf('function');
  });

  it('reads Greenhouse boards with the company name and remote location', async () => {
    const source = makeSource({ kind: 'ats', config: { provider: 'greenhouse', companies: ['gitlab'], maxAgeDays: 365 } });
    const urls: string[] = [];
    const leads = await adapter.poll!(source, served({ 'boards-api.greenhouse.io/v1/boards/gitlab/jobs': fixture('ats-greenhouse.json') }, urls));
    expect(urls[0]).toBe('https://boards-api.greenhouse.io/v1/boards/gitlab/jobs?content=true');
    expect(leads).toHaveLength(2);
    const newest = leads[0]!;
    expect(newest).toMatchObject({ type: 'job', author: 'GitLab', city: 'Онлайн', isRemote: true });
    expect(newest.externalId).toMatch(/^greenhouse:gitlab:\d+$/);
    expect(newest.url).toContain('job-boards.greenhouse.io/gitlab/jobs/');
    // Newest first, and the doubly escaped HTML is plain text.
    expect(newest.publishedAt! >= leads[1]!.publishedAt!).toBe(true);
    expect(newest.text).not.toMatch(/&lt;|<div/);
  });

  it('reads Lever postings with their salary range', async () => {
    const source = makeSource({ kind: 'ats', config: { provider: 'lever', companies: ['palantir=Palantir'], maxAgeDays: 365 } });
    const leads = await adapter.poll!(source, served({ 'api.lever.co/v0/postings/palantir': fixture('ats-lever.json') }));
    const paid = leads.find((l) => l.rawSalary)!;
    expect(paid).toMatchObject({ author: 'Palantir', rawSalary: '120000–150000 USD per year', city: 'Singapore', isRemote: false });
    expect(normalizeSalary({ rawSalary: paid.rawSalary, type: 'job' }).normalizedUsdMin).toBeGreaterThan(0);
    expect(leads.every((l) => l.externalId!.startsWith('lever:palantir:'))).toBe(true);
  });

  it('reads Ashby boards with the salary component of the compensation', async () => {
    const source = makeSource({ kind: 'ats', config: { provider: 'ashby', companies: ['ramp=Ramp'], maxAgeDays: 730 } });
    const leads = await adapter.poll!(source, served({ 'api.ashbyhq.com/posting-api/job-board/ramp': fixture('ats-ashby.json') }));
    expect(leads).toHaveLength(2);
    expect(leads.every((l) => /^\d+(\.\d+)?–\d+(\.\d+)? USD per year$/.test(l.rawSalary ?? ''))).toBe(true);
    expect(leads[0]!.title).not.toMatch(/^\s/);
  });

  it('goes round the company list a few at a time and survives a missing board', async () => {
    const source = makeSource({ id: 'ats-round-robin', kind: 'ats', config: { provider: 'greenhouse', companies: 'gitlab, gone, bad/slug, other', perPoll: 2, maxAgeDays: 365 } });
    expect(companiesOf(source).map((c) => c.slug)).toEqual(['gitlab', 'gone', 'other']);
    const urls: string[] = [];
    const leads = await adapter.poll!(source, served({ '/boards/gitlab/': fixture('ats-greenhouse.json') }, urls));
    expect(leads).toHaveLength(2); // "gone" answers 404 and is skipped
    await adapter.poll!(source, served({}, urls));
    expect(urls.map((u) => u.split('/boards/')[1]!.split('/')[0])).toEqual(['gitlab', 'gone', 'other', 'gitlab']);
    expect(nextBatch('empty', [], 3)).toEqual([]);
  });

  it('keeps only postings of the last maxAgeDays', async () => {
    const source = makeSource({ id: 'ats-age', kind: 'ats', config: { provider: 'greenhouse', companies: ['gitlab'], maxAgeDays: 1 } });
    const ctx = { ...served({ 'boards-api.greenhouse.io': fixture('ats-greenhouse.json') }), now: () => new Date('2026-08-20T12:00:00Z') };
    const leads = await adapter.poll!(source, ctx);
    expect(leads.map((l) => l.publishedAt)).toEqual(['2026-08-19T16:52:27-04:00']);
  });

  it('asks for a provider and companies', async () => {
    await expect(adapter.poll!(makeSource({ kind: 'ats', config: { companies: ['x'] } }), served({}))).rejects.toThrow(/provider/);
    await expect(adapter.poll!(makeSource({ kind: 'ats', config: { provider: 'lever' } }), served({}))).rejects.toThrow(/companies/);
  });
});
