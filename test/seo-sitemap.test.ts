import { describe, expect, it } from 'vitest';
import type { Lead } from '../src/core/types.ts';
import {
  DEFAULT_TTL_ENV,
  isExpired,
  isIndexable,
  isoWeekKey,
  NODE_INDEX_POLICY,
  w3cDateTime,
  type TtlEnv,
} from '../src/core/indexable.ts';
import {
  assembleSitemaps,
  buildLeadSitemaps,
  SITEMAP_MAX_BYTES,
  SITEMAP_MAX_URLS,
  sitemapIndexIssues,
  W3C_LASTMOD,
} from '../src/server/seo.ts';
import { explainJobPosting, type JobPostingSkipReason } from '../src/server/jobposting.ts';
import { renderLeadPage } from '../src/server/ui.ts';
import { createApp } from '../src/server/app.ts';
import { makeSource, makeTestRuntime } from './helpers.ts';

const env: TtlEnv = { ...DEFAULT_TTL_ENV };
/** JobPosting cases that name no employer still have to be indexable, or the skip reason collapses into the quality gate. */
const postingEnv: TtlEnv = { ...DEFAULT_TTL_ENV, RADAR_INDEXABLE_MIN_QUALITY: 0 };
const NOW = Date.parse('2026-11-16T12:00:00.000Z');

function lead(id: string, over: Partial<Lead> = {}): Lead {
  return {
    id,
    sourceId: 'source-1',
    title: `Заказ ${id}`,
    text: `Текст ${id}`,
    fingerprint: `fp-${id}`,
    titleKey: `key-${id}`,
    status: 'new',
    score: 50,
    reasons: [],
    createdAt: '2026-11-10T08:00:00.000Z',
    type: 'job',
    company: 'Acme',
    city: 'Берлин',
    ...over,
  };
}

describe('sitemap index', () => {
  it('lists only indexable leads and leaves out closed, expired and /review', () => {
    const bundle = assembleSitemaps({
      baseUrl: 'https://openradar.fun',
      env,
      now: new Date(NOW),
      leads: [
        lead('ok'),
        lead('shut', { state: 'closed' }),
        lead('old-gig', { type: 'gig', createdAt: '2026-10-01T00:00:00.000Z' }),
        lead('old-job', { type: 'job', createdAt: '2026-10-01T00:00:00.000Z' }),
      ],
    });
    expect(sitemapIndexIssues(bundle.indexXml)).toEqual([]);
    expect(bundle.indexXml).not.toContain('/review');
    expect(bundle.staticXml).not.toContain('/review');
    expect(bundle.staticXml).toContain('https://openradar.fun/catalog');
    expect(bundle.staticXml).toContain('https://openradar.fun/sources');
    expect(bundle.staticXml).not.toContain('/leads/');
    const week = [...bundle.files.entries()].filter(([name]) => name.startsWith('leads-'));
    expect(week).toHaveLength(1);
    const xml = week[0]?.[1] ?? '';
    expect(xml).toContain('/leads/ok');
    expect(xml).not.toContain('/leads/shut');
    expect(xml).not.toContain('/leads/old-gig');
    expect(xml).not.toContain('/leads/old-job');
    expect(xml).not.toContain('/review');
    expect(isIndexable(lead('ok'), env, NODE_INDEX_POLICY, NOW)).toBe(true);
    expect(isIndexable(lead('shut', { state: 'closed' }), env, NODE_INDEX_POLICY, NOW)).toBe(false);
    expect(isIndexable(lead('old-gig', { type: 'gig', createdAt: '2026-10-01T00:00:00.000Z' }), env, NODE_INDEX_POLICY, NOW)).toBe(false);
  });

  it('dates every lead URL from createdAt, and the index file from the newest of those', () => {
    expect(isoWeekKey('2026-11-05T12:00:00.000Z')).toBe('2026-W45');
    const files = buildLeadSitemaps('https://openradar.fun', [
      { id: 'early', createdAt: '2026-11-05T01:00:00.000Z' },
      { id: 'later', createdAt: '2026-11-06T08:30:00.000Z' },
    ]);
    expect(files.map((file) => file.file)).toEqual(['leads-2026-W45.xml']);
    expect(files[0]?.lastmod).toBe('2026-11-06T08:30:00Z');
    expect(files[0]?.xml).toContain('<loc>https://openradar.fun/leads/early</loc><lastmod>2026-11-05T01:00:00Z</lastmod>');
    expect(files[0]?.xml).toContain('<loc>https://openradar.fun/leads/later</loc><lastmod>2026-11-06T08:30:00Z</lastmod>');
    expect(files[0]?.lastmod).toMatch(W3C_LASTMOD);
    const bundle = assembleSitemaps({
      baseUrl: 'https://openradar.fun',
      env,
      now: new Date(NOW),
      leads: [
        lead('early', { createdAt: '2026-11-05T01:00:00.000Z' }),
        lead('later', { createdAt: '2026-11-06T08:30:00.000Z' }),
      ],
    });
    expect(bundle.indexXml).toContain('<loc>https://openradar.fun/sitemaps/leads-2026-W45.xml</loc><lastmod>2026-11-06T08:30:00Z</lastmod>');
    expect(sitemapIndexIssues(bundle.indexXml)).toEqual([]);
  });

  it('splits a week past 50 000 URLs and past the byte cap', () => {
    expect(SITEMAP_MAX_URLS).toBe(50_000);
    expect(SITEMAP_MAX_BYTES).toBe(50 * 1024 * 1024);
    const many = Array.from({ length: SITEMAP_MAX_URLS + 1 }, (_, i) => ({
      id: `n${i}`,
      createdAt: '2026-11-05T12:00:00.000Z',
    }));
    const files = buildLeadSitemaps('https://openradar.fun', many);
    expect(files.map((file) => file.file)).toEqual(['leads-2026-W45.xml', 'leads-2026-W45-2.xml']);
    expect(files[0]?.xml.match(/<url>/g)).toHaveLength(SITEMAP_MAX_URLS);
    expect(files[1]?.xml.match(/<url>/g)).toHaveLength(1);
    expect(Buffer.byteLength(files[0]?.xml ?? '', 'utf8')).toBeLessThanOrEqual(SITEMAP_MAX_BYTES);

    const tiny = buildLeadSitemaps('https://openradar.fun', [
      { id: 'a', createdAt: '2026-11-05T12:00:00.000Z' },
      { id: 'b', createdAt: '2026-11-05T13:00:00.000Z' },
    ], { maxBytes: 300 });
    expect(tiny.length).toBeGreaterThan(1);
    for (const file of tiny) expect(Buffer.byteLength(file.xml, 'utf8')).toBeLessThanOrEqual(300);
  });

  it('serves the index and the week file over HTTP, with a shared cache', async () => {
    const runtime = makeTestRuntime({ RADAR_PUBLIC_READ: true, RADAR_TIER_DELAYS: 'guest=0' });
    const source = await runtime.store.createSource({ kind: 'rss', title: 'Feed', config: {} });
    const created = new Date(NOW).toISOString();
    await runtime.store.insertLead(lead('keep', {
      sourceId: source.id,
      createdAt: created,
      company: 'Acme',
    }));
    await runtime.store.insertLead(lead('shut', { sourceId: source.id, state: 'closed', createdAt: created, company: 'Acme' }));
    await runtime.store.insertLead(lead('stale', {
      sourceId: source.id,
      type: 'gig',
      createdAt: new Date(NOW - 20 * 86_400_000).toISOString(),
      company: 'Acme',
    }));
    const app = createApp(runtime);
    const indexRes = await app.request('/sitemap.xml');
    expect(indexRes.status).toBe(200);
    expect(indexRes.headers.get('content-type')).toContain('application/xml');
    expect(indexRes.headers.get('cache-control')).toContain('s-maxage=300');
    const index = await indexRes.text();
    expect(sitemapIndexIssues(index)).toEqual([]);
    expect(index).not.toContain('/review');
    expect(index).not.toContain('/leads/');
    const week = isoWeekKey(created)!;
    expect(index).toContain(`/sitemaps/leads-${week}.xml`);
    const fileRes = await app.request(`/sitemaps/leads-${week}.xml`);
    expect(fileRes.status).toBe(200);
    const xml = await fileRes.text();
    expect(xml).toContain('/leads/keep');
    const lastmod = xml.match(/<loc>[^<]*\/leads\/keep<\/loc><lastmod>([^<]+)<\/lastmod>/)?.[1];
    expect(lastmod).toBe(w3cDateTime(Date.parse(created)));
    expect(xml).not.toContain('/leads/shut');
    expect(xml).not.toContain('/leads/stale');
    expect(xml).not.toContain('/review');
    const staticXml = await (await app.request('/sitemaps/static.xml')).text();
    expect(staticXml).toContain('/catalog');
    expect(staticXml).not.toContain('/review');
    expect(staticXml).not.toContain('/leads/');
    expect((await app.request('/sitemaps/leads-1999-W01.xml')).status).toBe(404);
    await runtime.store.close();
  });

  it('lists only URLs a guest can open, including the hub delay, on this store', async () => {
    const runtime = makeTestRuntime({ RADAR_PUBLIC_READ: true, RADAR_MODE: 'hub' });
    expect(runtime.access.mode).toBe('hub');
    expect(runtime.access.delays.guest).toBe(720);
    const source = await runtime.store.createSource({ kind: 'rss', title: 'Feed', config: {} });
    const old = new Date(Date.now() - 3 * 86_400_000).toISOString();
    const fresh = new Date().toISOString();
    const hidden = ['suspect', 'hidden_junk', 'hidden_scam'] as const;
    for (const state of hidden) {
      await runtime.store.insertLead(lead(state, { sourceId: source.id, state, createdAt: old, company: 'Acme' }));
    }
    await runtime.store.insertLead(lead('rejected', { sourceId: source.id, status: 'rejected', createdAt: old, company: 'Acme' }));
    await runtime.store.insertLead(lead('too-fresh', { sourceId: source.id, createdAt: fresh, company: 'Acme' }));
    await runtime.store.insertLead(lead('visible', { sourceId: source.id, createdAt: old, company: 'Acme' }));
    const app = createApp(runtime);
    const index = await (await app.request('/sitemap.xml')).text();
    const files = [...index.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => new URL(match[1]!).pathname);
    const pages: string[] = [];
    for (const file of files) {
      const xml = await (await app.request(file)).text();
      for (const loc of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) pages.push(new URL(loc[1]!).pathname);
    }
    expect(pages.some((path) => path.endsWith('/leads/visible'))).toBe(true);
    for (const id of [...hidden, 'rejected', 'too-fresh']) {
      expect(pages.some((path) => path.endsWith(`/leads/${id}`))).toBe(false);
    }
    for (const path of pages) {
      const res = await app.request(path);
      const html = await res.text();
      expect(res.status, path).toBe(200);
      expect(html, path).not.toContain('noindex');
    }
    await runtime.store.close();
  });

  it('treats an employer written only in the text or in facts the same on the page, the sitemap, and JSON-LD', async () => {
    const runtime = makeTestRuntime({ RADAR_PUBLIC_READ: true, RADAR_TIER_DELAYS: 'guest=0', RADAR_ADMIN_TOKEN: 'secret' });
    const source = await runtime.store.createSource({ kind: 'rss', title: 'Лента', config: {} });
    const old = new Date(Date.now() - 2 * 86_400_000).toISOString();
    const bare = {
      sourceId: source.id,
      company: undefined,
      author: undefined,
      skills: ['Python'],
      city: undefined,
      isRemote: false,
      budget: undefined,
      createdAt: old,
      type: 'job' as const,
    };
    await runtime.store.insertLead(lead('from-text', { ...bare, text: 'Компания: Яндекс\nНужен разработчик.' }));
    await runtime.store.insertLead(lead('from-facts', { ...bare, text: 'Нужен разработчик.', metadata: { facts: { company: 'Яндекс' } } }));
    await runtime.store.insertLead(lead('stored-name', { ...bare, company: 'Яндекс', city: 'Москва', text: 'Нужен разработчик.' }));
    const app = createApp(runtime);
    const admin = { headers: { authorization: 'Bearer secret' } };
    for (const id of ['from-text', 'from-facts']) {
      for (const headers of [undefined, admin]) {
        const html = await (await app.request(`/leads/${id}`, headers ? { headers: admin.headers } : undefined)).text();
        expect(html, id).toContain('<meta name="robots" content="noindex">');
        expect(html, id).not.toContain('JobPosting');
      }
    }
    const storedHtml = await (await app.request('/leads/stored-name')).text();
    expect(storedHtml).not.toContain('noindex');
    expect(storedHtml).toContain('JobPosting');
    expect(storedHtml).toContain('"name": "Яндекс"');
    const index = await (await app.request('/sitemap.xml')).text();
    const files = [...index.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => new URL(match[1]!).pathname);
    const pages: string[] = [];
    for (const file of files) {
      const xml = await (await app.request(file)).text();
      for (const loc of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) pages.push(new URL(loc[1]!).pathname);
    }
    expect(pages.some((path) => path.endsWith('/leads/stored-name'))).toBe(true);
    expect(pages.some((path) => path.endsWith('/leads/from-text'))).toBe(false);
    expect(pages.some((path) => path.endsWith('/leads/from-facts'))).toBe(false);
    await runtime.store.close();
  });

  it('shows a lead inside the guest delay to an admin and hides it from a guest, including after the admin request', async () => {
    const runtime = makeTestRuntime({
      RADAR_PUBLIC_READ: true,
      RADAR_MODE: 'hub',
      RADAR_ADMIN_TOKEN: 'secret',
    });
    const source = await runtime.store.createSource({ kind: 'rss', title: 'Лента', config: {} });
    await runtime.store.insertLead(lead('young', {
      sourceId: source.id,
      title: 'Свежая вакансия для своих',
      company: 'Acme',
      skills: ['Python'],
      city: 'Москва',
      createdAt: new Date().toISOString(),
    }));
    await runtime.store.insertLead(lead('thin-old', {
      sourceId: source.id,
      title: 'Старый пост без сигналов',
      company: undefined,
      author: undefined,
      skills: ['Python'],
      city: undefined,
      isRemote: false,
      budget: undefined,
      createdAt: new Date(Date.now() - 3 * 86_400_000).toISOString(),
    }));
    const app = createApp(runtime);
    const adminHtml = await (await app.request('/catalog', { headers: { authorization: 'Bearer secret' } })).text();
    expect(adminHtml).toContain('Свежая вакансия для своих');
    expect(adminHtml).toContain('Старый пост без сигналов');
    const guestHtml = await (await app.request('/catalog')).text();
    expect(guestHtml).not.toContain('Свежая вакансия для своих');
    expect(guestHtml).not.toContain('Старый пост без сигналов');
    await runtime.store.close();
  });

  it('builds one sitemap for parallel requests and ignores Host when the public URL is unset', async () => {
    const runtime = makeTestRuntime({ RADAR_PUBLIC_READ: true, RADAR_TIER_DELAYS: 'guest=0' });
    const source = await runtime.store.createSource({ kind: 'rss', title: 'Feed', config: {} });
    await runtime.store.insertLead(lead('keep', { sourceId: source.id, createdAt: new Date(NOW).toISOString(), company: 'Acme' }));
    const original = runtime.store.listLeadsForSitemap!.bind(runtime.store);
    let calls = 0;
    runtime.store.listLeadsForSitemap = async (options) => {
      calls += 1;
      await new Promise((resolve) => setTimeout(resolve, 40));
      return original(options);
    };
    const app = createApp(runtime);
    const [first, second] = await Promise.all([
      app.request('/sitemap.xml', { headers: { host: 'a.example' } }),
      app.request('/sitemap.xml', { headers: { host: 'b.example' } }),
    ]);
    expect(calls).toBe(1);
    const a = await first.text();
    const b = await second.text();
    expect(a).toContain('http://a.example/');
    expect(b).toContain('http://b.example/');
    expect(a).not.toContain('b.example');
    expect(b).not.toContain('a.example');
    await runtime.store.close();
  });
});

describe('JobPosting', () => {
  const created = '2026-11-01T10:00:00.000Z';

  it('sets validThrough to createdAt plus the same TTL isExpired uses', () => {
    const gig = lead('gig', { type: 'gig', createdAt: created });
    const job = lead('job', { type: 'job', createdAt: created });
    const gigPosting = explainJobPosting(gig, { env, now: Date.parse(created) }).posting;
    const jobPosting = explainJobPosting(job, { env, now: Date.parse(created) }).posting;
    expect(gigPosting?.validThrough).toBe('2026-11-15T10:00:00Z');
    expect(jobPosting?.validThrough).toBe('2026-12-01T10:00:00Z');
    expect(isExpired(gig, env, Date.parse(String(gigPosting?.validThrough)))).toBe(false);
    expect(isExpired(gig, env, Date.parse(String(gigPosting?.validThrough)) + 1)).toBe(true);
    expect(isExpired(job, env, Date.parse(String(jobPosting?.validThrough)))).toBe(false);
    expect(isExpired(job, env, Date.parse(String(jobPosting?.validThrough)) + 1)).toBe(true);
  });

  it('omits JobPosting and sets noindex when the lead is expired or closed', () => {
    const expired = lead('expired', { type: 'gig', createdAt: new Date(NOW - 15 * 86_400_000).toISOString() });
    const closed = lead('closed', { state: 'closed', createdAt: new Date(NOW).toISOString() });
    for (const item of [expired, closed]) {
      expect(explainJobPosting(item, { env, now: NOW }).skip).toBe('not-indexable');
      const html = renderLeadPage({ lead: item, version: 'test', indexEnv: env, expired: item.id === 'expired' });
      expect(html).toContain('<meta name="robots" content="noindex">');
      expect(html).not.toContain('JobPosting');
    }
  });

  it('does not emit TELECOMMUTE without a real location requirement', () => {
    const remote = lead('remote', {
      isRemote: true,
      city: undefined,
      createdAt: new Date(NOW).toISOString(),
    });
    expect(explainJobPosting(remote, { env, now: NOW }).skip).toBe('remote-without-location');
    const html = renderLeadPage({ lead: remote, version: 'test', indexEnv: env });
    expect(html).not.toContain('TELECOMMUTE');
    expect(html).not.toContain('JobPosting');

    const online = lead('online', {
      isRemote: true,
      city: 'Онлайн',
      createdAt: new Date(NOW).toISOString(),
    });
    expect(explainJobPosting(online, { env, now: NOW }).skip).toBe('remote-without-location');

    const located = lead('located', {
      isRemote: true,
      city: undefined,
      createdAt: new Date(NOW).toISOString(),
      metadata: { country: 'DE' },
    });
    const posting = explainJobPosting(located, { env, now: NOW }).posting;
    expect(posting?.jobLocationType).toBe('TELECOMMUTE');
    expect(posting?.applicantLocationRequirements).toEqual({ '@type': 'Country', name: 'DE' });
    const locatedHtml = renderLeadPage({ lead: located, version: 'test', indexEnv: env });
    expect(locatedHtml).toContain('"jobLocationType": "TELECOMMUTE"');
    expect(locatedHtml).toContain('"name": "DE"');
    expect(locatedHtml).not.toContain('Unknown');
  });

  it('does not take a Telegram channel title as the employer', () => {
    const channel = lead('tg', {
      company: undefined,
      author: 'Вакансии Frontend | Удалёнка',
      city: 'Берлин',
      createdAt: new Date(NOW).toISOString(),
      text: 'Ищем фронтенд без названия компании.',
    });
    expect(explainJobPosting(channel, { env: postingEnv, now: NOW, sourceKind: 'telegram' }).skip).toBe('no-organization');
    const named = makeSource({
      kind: 'ats',
      config: { companies: ['board=Вакансии Frontend | Удалёнка'] },
    });
    const ats = explainJobPosting(channel, { env: postingEnv, now: NOW, source: named }).posting;
    expect(ats?.hiringOrganization).toEqual({ '@type': 'Organization', name: 'Вакансии Frontend | Удалёнка' });
    const slugOnly = makeSource({ kind: 'ats', config: { companies: ['acme'] } });
    const slugLead = lead('slug', {
      company: undefined,
      author: 'acme',
      city: 'Берлин',
      createdAt: new Date(NOW).toISOString(),
      text: 'Company: acme\nИщем инженера.',
    });
    expect(explainJobPosting(slugLead, { env: postingEnv, now: NOW, source: slugOnly }).skip).toBe('no-organization');
    const stored = lead('stored-slug', {
      company: 'acme',
      author: 'acme',
      city: 'Берлин',
      createdAt: new Date(NOW).toISOString(),
      text: 'Ищем инженера.',
      metadata: { facts: { company: 'acme' } },
    });
    const decided = explainJobPosting(stored, { env: postingEnv, now: NOW, source: slugOnly });
    expect(decided.skip).toBe('no-organization');
    expect(JSON.stringify(decided.posting ?? {})).not.toContain('"acme"');
  });

  it('omits JobPosting when there is no place and the lead is not remote', () => {
    const bare = lead('noloc', {
      city: undefined,
      isRemote: false,
      createdAt: new Date(NOW).toISOString(),
    });
    expect(explainJobPosting(bare, { env: postingEnv, now: NOW }).skip).toBe('no-location');
    const html = renderLeadPage({ lead: bare, version: 'test', indexEnv: postingEnv });
    expect(html).not.toContain('JobPosting');
    expect(html).not.toContain('FULL_TIME');
  });

  it('counts fixture leads that lose JobPosting, by rule', () => {
    const fresh = new Date(NOW).toISOString();
    const fixtures: Array<{ id: string; skip?: JobPostingSkipReason; sourceKind?: string }> = [
      { id: 'job-city' },
      { id: 'gig-text' },
      { id: 'closed', skip: 'not-indexable' },
      { id: 'expired-gig', skip: 'not-indexable' },
      { id: 'expired-job', skip: 'not-indexable' },
      { id: 'no-org', skip: 'no-organization' },
      { id: 'placeholder-org', skip: 'no-organization' },
      { id: 'remote-bare', skip: 'remote-without-location' },
      { id: 'remote-online', skip: 'remote-without-location' },
      { id: 'remote-country' },
      { id: 'remote-city' },
      { id: 'author-ignored', skip: 'no-organization' },
      { id: 'telegram-channel', skip: 'no-organization', sourceKind: 'telegram' },
      { id: 'ats-author', sourceKind: 'ats' },
      { id: 'no-place', skip: 'no-location' },
    ];
    const cards: Lead[] = [
      lead('job-city', { createdAt: fresh }),
      lead('gig-text', {
        type: 'gig',
        company: undefined,
        city: 'Москва',
        createdAt: fresh,
        text: 'Компания: Яндекс Лавка\nНужен фронтенд.',
      }),
      lead('closed', { state: 'closed', createdAt: fresh }),
      lead('expired-gig', { type: 'gig', createdAt: new Date(NOW - 15 * 86_400_000).toISOString() }),
      lead('expired-job', { createdAt: new Date(NOW - 40 * 86_400_000).toISOString() }),
      lead('no-org', {
        company: undefined,
        author: undefined,
        city: 'Москва',
        text: 'Ищем человека, компания не названа.',
        createdAt: fresh,
      }),
      lead('placeholder-org', {
        company: 'Unknown',
        author: 'openradar',
        text: 'Вакансия без имени.',
        createdAt: fresh,
      }),
      lead('remote-bare', { isRemote: true, city: undefined, createdAt: fresh }),
      lead('remote-online', { isRemote: true, city: 'Онлайн', createdAt: fresh }),
      lead('remote-country', { isRemote: true, city: undefined, metadata: { country: 'DE' }, createdAt: fresh }),
      lead('remote-city', { isRemote: true, city: 'Берлин', createdAt: fresh }),
      lead('author-ignored', { company: undefined, author: 'Acme GmbH', city: 'Берлин', text: 'Ищем инженера.', createdAt: fresh }),
      lead('telegram-channel', { company: undefined, author: 'Вакансии Frontend | Удалёнка', city: 'Берлин', text: 'Ищем фронтенд.', createdAt: fresh }),
      lead('ats-author', { company: undefined, author: 'Acme GmbH', city: 'Берлин', text: 'Ищем инженера.', createdAt: fresh }),
      lead('no-place', { city: undefined, isRemote: false, createdAt: fresh }),
    ];
    const counts: Record<JobPostingSkipReason | 'kept', number> = {
      'not-indexable': 0,
      'no-organization': 0,
      'remote-without-location': 0,
      'no-location': 0,
      kept: 0,
    };
    const atsNamed = makeSource({ kind: 'ats', config: { companies: ['acme=Acme GmbH'] } });
    for (const card of cards) {
      const expected = fixtures.find((item) => item.id === card.id);
      const decision = explainJobPosting(card, {
        env: postingEnv,
        now: NOW,
        sourceKind: expected?.sourceKind,
        source: card.id === 'ats-author' ? atsNamed : undefined,
      });
      expect(decision.skip, card.id).toBe(expected?.skip);
      if (decision.skip) counts[decision.skip] += 1;
      else counts.kept += 1;
      if (decision.posting) {
        expect(JSON.stringify(decision.posting)).not.toMatch(/Unknown|openradar|"FULL_TIME"/);
      }
    }
    // Production database was not available. These cards are the fixture set.
    // Rule 3 (author is not an employer outside the allowlist): author-ignored + telegram-channel.
    // Rule 4 (no jobLocation and not TELECOMMUTE): no-place.
    expect(counts).toEqual({
      'not-indexable': 3,
      'no-organization': 4,
      'remote-without-location': 2,
      'no-location': 1,
      kept: 5,
    });
    expect(cards).toHaveLength(15);
  });
});
