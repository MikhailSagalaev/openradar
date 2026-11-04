import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { normalizeSalary } from '../../src/core/salary.ts';
import { companyKeyOf } from '../../src/core/company.ts';
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

  it('reads a board above the general 10 MB ceiling (OpenAI on Ashby is about 14 MB)', async () => {
    const board = JSON.parse(fixture('ats-ashby.json')) as { jobs: Array<Record<string, unknown>> };
    const padding = 'x'.repeat(12 * 1024 * 1024);
    board.jobs[0]!.descriptionPlain = `${String(board.jobs[0]!.descriptionPlain ?? '')} ${padding}`;
    const source = makeSource({ kind: 'ats', config: { provider: 'ashby', companies: ['openai=OpenAI'], maxAgeDays: 730 } });
    const leads = await adapter.poll!(source, served({ 'api.ashbyhq.com/posting-api/job-board/openai': JSON.stringify(board) }));
    expect(leads).toHaveLength(2);
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

  it('reads a board again when its answer stalls, and leaves an HTTP error alone', async () => {
    const source = makeSource({ id: 'ats-stall', kind: 'ats', config: { provider: 'greenhouse', companies: ['gitlab', 'gone'], perPoll: 2, maxAgeDays: 365 } });
    const urls: string[] = [];
    let stalls = 2;
    const ctx = {
      ...served({}),
      fetchImpl: async (input: RequestInfo | URL) => {
        const url = input.toString();
        urls.push(url);
        if (url.includes('/gone/')) return new Response('not found', { status: 404 });
        if (stalls-- > 0) throw new DOMException('This operation was aborted', 'AbortError');
        return new Response(fixture('ats-greenhouse.json'), { status: 200 });
      },
    };
    expect(await adapter.poll!(source, ctx)).toHaveLength(2);
    expect(urls.filter((u) => u.includes('/gitlab/'))).toHaveLength(3);
    expect(urls.filter((u) => u.includes('/gone/'))).toHaveLength(1);
  });

  it('gives a source its own longer timeout, within a ceiling', async () => {
    const seen: number[] = [];
    const ctx = { ...served({}), timeoutMs: 15_000 };
    const spy = (timeoutMs: unknown) => makeSource({ id: `ats-t${String(timeoutMs)}`, kind: 'ats', config: { provider: 'greenhouse', companies: ['gitlab'], timeoutMs } });
    const realSetTimeout = globalThis.setTimeout;
    globalThis.setTimeout = ((fn: () => void, ms?: number) => { seen.push(ms ?? 0); return realSetTimeout(fn, 0); }) as typeof setTimeout;
    try {
      await adapter.poll!(spy(60_000), { ...ctx, fetchImpl: async () => new Response('{"jobs":[]}', { status: 200 }) });
      await adapter.poll!(spy(900_000), { ...ctx, fetchImpl: async () => new Response('{"jobs":[]}', { status: 200 }) });
    } finally {
      globalThis.setTimeout = realSetTimeout;
    }
    expect(seen).toEqual(expect.arrayContaining([60_000, 120_000]));
  });

  it('gives a board up after three stalled answers and goes on', async () => {
    const source = makeSource({ id: 'ats-stuck', kind: 'ats', config: { provider: 'greenhouse', companies: ['gitlab'], maxAgeDays: 365 } });
    let calls = 0;
    const ctx = { ...served({}), fetchImpl: async () => { calls++; throw new DOMException('This operation was aborted', 'AbortError'); } };
    expect(await adapter.poll!(source, ctx)).toEqual([]);
    expect(calls).toBe(3);
  });

  it('keeps only postings of the last maxAgeDays', async () => {
    const source = makeSource({ id: 'ats-age', kind: 'ats', config: { provider: 'greenhouse', companies: ['gitlab'], maxAgeDays: 1 } });
    const ctx = { ...served({ 'boards-api.greenhouse.io': fixture('ats-greenhouse.json') }), now: () => new Date('2026-08-20T12:00:00Z') };
    const leads = await adapter.poll!(source, ctx);
    expect(leads.map((l) => l.publishedAt)).toEqual(['2026-08-19T16:52:27-04:00']);
  });

  it('reads Workable accounts with descriptions and a company address for dedup', async () => {
    const source = makeSource({ kind: 'ats', config: { provider: 'workable', companies: ['huggingface'], maxAgeDays: 365 } });
    const urls: string[] = [];
    const leads = await adapter.poll!(source, served({ 'apply.workable.com/api/v1/widget/accounts/huggingface': fixture('ats-workable.json') }, urls));
    expect(urls[0]).toBe('https://apply.workable.com/api/v1/widget/accounts/huggingface?details=true');
    expect(leads).toHaveLength(2);
    expect(leads[0]).toMatchObject({ type: 'job', author: 'Hugging Face', city: 'Онлайн', isRemote: true });
    expect(leads[0]!.url).toMatch(/^https:\/\/apply\.workable\.com\/huggingface\/j\/[0-9A-F]+\/$/);
    expect(companyKeyOf(leads[0]!)).toBe('huggingface');
    expect(leads[0]!.text).not.toMatch(/<p>/);
  });

  it('reads Recruitee offers with their UTC dates', async () => {
    const source = makeSource({ kind: 'ats', config: { provider: 'recruitee', companies: ['bunq'], maxAgeDays: 365 } });
    const leads = await adapter.poll!(source, served({ 'bunq.recruitee.com/api/offers': fixture('ats-recruitee.json') }));
    expect(leads).toHaveLength(2);
    expect(leads[0]).toMatchObject({ author: 'bunq', city: 'Vienna', isRemote: false, publishedAt: '2026-10-30T16:32:58Z' });
    expect(leads[0]!.url).toBe('https://bunq.recruitee.com/o/aml-manager-austria');
    expect(leads[0]!.externalId).toMatch(/^recruitee:bunq:\d+$/);
  });

  it('reads SmartRecruiters listings, which carry no description', async () => {
    const source = makeSource({ kind: 'ats', config: { provider: 'smartrecruiters', companies: ['ubisoft2=Ubisoft'], maxAgeDays: 365 } });
    const leads = await adapter.poll!(source, served({ 'api.smartrecruiters.com/v1/companies/ubisoft2/postings': fixture('ats-smartrecruiters.json') }));
    expect(leads).toHaveLength(2);
    expect(leads[0]).toMatchObject({ author: 'Ubisoft', city: 'Saguenay', isRemote: false });
    expect(leads[0]!.url).toMatch(/^https:\/\/jobs\.smartrecruiters\.com\/Ubisoft2\/\d+$/);
    expect(leads[0]!.text).toContain('Location: Saguenay, QC, Canada');
  });

  it('asks for a provider and companies', async () => {
    await expect(adapter.poll!(makeSource({ kind: 'ats', config: { companies: ['x'] } }), served({}))).rejects.toThrow(/provider/);
    await expect(adapter.poll!(makeSource({ kind: 'ats', config: { provider: 'lever' } }), served({}))).rejects.toThrow(/companies/);
  });
});
