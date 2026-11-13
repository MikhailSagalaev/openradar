import { describe, expect, it } from 'vitest';
import { buildListings, buildFeedJson, buildFeedMarkdown, hasContactLeak, originalUrl } from '../src/publish/listing-feed.ts';
import { createApp } from '../src/server/app.ts';
import type { Lead } from '../src/core/types.ts';
import { makeTestRuntime } from './helpers.ts';

const NOW = new Date('2026-11-13T12:00:00.000Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

function row(over: Record<string, unknown> = {}) {
  return {
    id: 'l1', type: 'job', title: 'Backend engineer', url: 'https://jobs.ashbyhq.com/acme/1',
    author: 'Acme', city: 'London', isRemote: false, rawSalary: '£80k–£100k per year',
    skills: ['Go', 'Postgres'], publishedAt: daysAgo(2), createdAt: daysAgo(2), ...over,
  };
}

describe('listing feed builder (plan 021F)', () => {
  it('links to the original employer post, never a redirect', () => {
    expect(originalUrl(row({ canonicalUrl: 'https://jobs.ashbyhq.com/acme/1?utm=x', url: 'https://agg.test/redirect' }))).toBe('https://jobs.ashbyhq.com/acme/1?utm=x');
    expect(originalUrl(row({ canonicalUrl: undefined, url: 'https://jobs.ashbyhq.com/acme/1' }))).toBe('https://jobs.ashbyhq.com/acme/1');
    expect(originalUrl(row({ url: 'ftp://x.test/a', canonicalUrl: undefined }))).toBeUndefined();
    expect(originalUrl(row({ url: '', canonicalUrl: undefined }))).toBeUndefined();
  });

  it('drops rows that still carry contact data (STOP condition)', () => {
    expect(hasContactLeak(row({ contacts: [{ type: 'email', value: 'hr@acme.io' }] }))).toBe(true);
    expect(hasContactLeak(row({ email: 'hr@acme.io' }))).toBe(true);
    expect(hasContactLeak(row({ title: 'Engineer — write hr@acme.io' }))).toBe(true);
    expect(hasContactLeak(row({ title: 'Engineer — DM t.me/acme_hr' }))).toBe(true);
    expect(hasContactLeak(row())).toBe(false);
    const listings = buildListings([row(), row({ id: 'leak', contacts: [{ type: 'telegram', value: '@hr' }] })], { now: NOW });
    expect(listings.map((l) => l.id)).toEqual(['l1']);
  });

  it('keeps a Telegram channel post as the original link, not a contact', () => {
    // t.me/channel/123 is the source post (ethic: keep the original link); t.me/user is a handle.
    const post = row({ id: 'tg', url: 'https://t.me/stagirovky/13233', canonicalUrl: undefined, title: 'Стажировка в Венгрии' });
    expect(hasContactLeak(post)).toBe(false);
    expect(buildListings([post], { now: NOW })[0]!.url).toBe('https://t.me/stagirovky/13233');
    const handle = row({ id: 'h', url: 'https://t.me/acme_hr', canonicalUrl: undefined });
    expect(hasContactLeak(handle)).toBe(true);
    expect(buildListings([handle], { now: NOW })).toHaveLength(0);
  });

  it('marks stale rows by age and drops the very old', () => {
    const listings = buildListings([
      row({ id: 'fresh', publishedAt: daysAgo(3) }),
      row({ id: 'stale', publishedAt: daysAgo(40) }),
      row({ id: 'ancient', publishedAt: daysAgo(90) }),
    ], { now: NOW, maxAgeDays: 30, dropAfterDays: 60 });
    expect(listings.map((l) => l.id)).toEqual(['fresh', 'stale']);
    expect(listings[0]!.stale).toBe(false);
    expect(listings[1]!.stale).toBe(true);
  });

  it('keeps both types, filters by type, caps and sorts freshest first', () => {
    const rows = [
      row({ id: 'old', publishedAt: daysAgo(10) }),
      row({ id: 'new', publishedAt: daysAgo(1) }),
      row({ id: 'gig', type: 'gig', publishedAt: daysAgo(2) }),
    ];
    expect(buildListings(rows, { now: NOW }).map((l) => l.id)).toEqual(['new', 'gig', 'old']);
    expect(buildListings(rows, { now: NOW, types: ['job'] }).map((l) => l.id)).toEqual(['new', 'old']);
    expect(buildListings(rows, { now: NOW, limit: 2 })).toHaveLength(2);
  });

  it('detects remote from the flag, workplace type or city', () => {
    expect(buildListings([row({ isRemote: true, city: undefined })], { now: NOW })[0]!.remote).toBe(true);
    expect(buildListings([row({ isRemote: false, workplaceType: 'remote' })], { now: NOW })[0]!.remote).toBe(true);
    expect(buildListings([row({ isRemote: false, city: 'Онлайн' })], { now: NOW })[0]!.remote).toBe(true);
    expect(buildListings([row({ isRemote: false, city: 'London' })], { now: NOW })[0]!.remote).toBe(false);
  });

  it('builds JSON provenance and a Markdown table with original links', () => {
    const listings = buildListings([row(), row({ id: 'gig', type: 'gig', title: 'Bot | Telegram', visaSponsor: { name: 'Acme Ltd', register: 'uk' } })], { now: NOW });
    const feed = buildFeedJson(listings, NOW, 'https://openradar.fun');
    expect(feed).toMatchObject({ count: 2, jobs: 1, gigs: 1, source: 'https://openradar.fun' });
    expect(feed.license).toContain('AGPL');
    const md = buildFeedMarkdown(feed);
    expect(md).toContain('[original](https://jobs.ashbyhq.com/acme/1)');
    expect(md).toContain('Bot \\| Telegram'); // pipe escaped in the table
    expect(md).toContain('🛂');
    expect(md).not.toContain('hr@');
  });
});

describe('listing feed from the live guest projection', () => {
  it('publishes only what a guest may see: no contacts, original links', async () => {
    const runtime = makeTestRuntime({ RADAR_PUBLIC_READ: true });
    const app = createApp(runtime);
    await runtime.store.createSource({ kind: 'ats', title: 'Acme', config: {} });
    const insert = (id: string, over: Partial<Lead>) => runtime.store.insertLead({
      id, sourceId: 's1', type: 'job', title: `Role ${id}`, text: 'Build things. Contact hr@acme.io or @acme_hr.',
      url: `https://jobs.ashbyhq.com/acme/${id}`, fingerprint: `fp-${id}`, titleKey: `role-${id}`,
      status: 'new', score: 50, reasons: [], skills: ['Go'], createdAt: daysAgo(3),
      contacts: [{ type: 'email', value: 'hr@acme.io' }, { type: 'telegram', value: '@acme_hr' }], ...over,
    } as Lead);
    await insert('a', { author: 'Acme' });
    await insert('b', { author: 'Acme', type: 'gig' } as Partial<Lead>);

    // Walk the guest feed exactly as the publishing script does.
    const res = await app.request('/v2/feed?limit=200&sort=new');
    expect(res.status).toBe(200);
    const body = await res.json() as { leads: Array<Record<string, unknown>> };
    expect(body.leads.length).toBeGreaterThan(0);
    // The guest projection already removed contacts.
    for (const lead of body.leads) expect(lead.contacts).toEqual([]);

    const listings = buildListings(body.leads, { now: NOW });
    expect(listings.length).toBeGreaterThan(0);
    for (const l of listings) {
      expect(l.url).toMatch(/^https:\/\/jobs\.ashbyhq\.com\/acme\//);
      expect(JSON.stringify(l)).not.toContain('hr@acme.io');
      expect(JSON.stringify(l)).not.toContain('@acme_hr');
    }
    const feed = buildFeedJson(listings, NOW, 'https://openradar.fun');
    expect(buildFeedMarkdown(feed)).not.toContain('hr@acme.io');
    await runtime.store.close();
  });
});
