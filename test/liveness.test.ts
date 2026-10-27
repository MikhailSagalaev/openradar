import { describe, expect, it } from 'vitest';
import type { Lead } from '../src/core/types.ts';
import { checkLeadsLiveness, feedMaxAge, ruleFor } from '../src/pipeline/liveness.ts';
import { createApp } from '../src/server/app.ts';
import { makeTestRuntime } from './helpers.ts';

const page = (status: number, body = '') => ({ status, body });

describe('board rules', () => {
  it('reads Kwork project status', () => {
    const rule = ruleFor('https://kwork.ru/projects/3268879')!;
    expect(rule.check(page(200, '..."wantData":{"id":3268879,"status":"active","wantDates":{}'))).toBe('open');
    expect(rule.check(page(200, '..."wantData":{"id":3268879,"status":"user_stop","wantDates":{}'))).toBe('closed');
    expect(rule.check(page(200, '..."wantData":{"id":3268879,"status":"archived","wantDates":{}'))).toBe('closed');
    expect(rule.check(page(200, '<html>captcha</html>'))).toBe('unknown');
  });

  it('reads FL.ru closed and deleted projects', () => {
    const rule = ruleFor('https://www.fl.ru/projects/5526374/x.html')!;
    expect(rule.check(page(404))).toBe('closed');
    expect(rule.check(page(200, '<img title="Проект снят с публикации" src="https://st.fl.ru/images/ico_closed.gif">'))).toBe('closed');
    expect(rule.check(page(200, '<h1 id="prj_name_5526361">SEO сайт</h1>'))).toBe('open');
  });

  it('reads the archived flag on Habr Career and hh.ru', () => {
    expect(ruleFor('https://career.habr.com/vacancies/1')!.check(page(200, '{"archived":true,"hidden":false}'))).toBe('closed');
    expect(ruleFor('https://career.habr.com/vacancies/1')!.check(page(200, '{"archived":false}'))).toBe('open');
    expect(ruleFor('https://hh.ru/vacancy/1')!.check(page(200, '&#34;archived&#34;:true'))).toBe('closed');
    expect(ruleFor('https://hh.ru/vacancy/1')!.check(page(200, '&#34;archived&#34;:false'))).toBe('open');
  });

  it('closes other boards only on 404 or 410', () => {
    const rule = ruleFor('https://weworkremotely.com/remote-jobs/x')!;
    expect(rule.check(page(410))).toBe('closed');
    expect(rule.check(page(200, 'anything'))).toBe('unknown');
    expect(ruleFor('https://t.me/s/channel/1')).toBeUndefined();
  });
});

function lead(id: string, url: string, overrides: Partial<Lead> = {}): Lead {
  const now = new Date().toISOString();
  return {
    id,
    sourceId: 'source-1',
    externalId: `external-${id}`,
    url,
    canonicalUrl: url,
    title: `Заказ ${id}`,
    text: 'Нужно сделать лендинг по макету, бюджет 20 000 ₽',
    publishedAt: now,
    fingerprint: `fingerprint-${id}`,
    titleKey: `заказ ${id}`,
    status: 'new',
    score: 60,
    reasons: [],
    createdAt: now,
    type: 'gig',
    ...overrides,
  };
}

describe('closed-post check', () => {
  it('closes leads the board shows as closed and leaves the rest', async () => {
    const runtime = makeTestRuntime({ RADAR_PUBLIC_READ: true, RADAR_TIER_DELAYS: 'guest=0,member=0' });
    const source = await runtime.store.createSource({ kind: 'rss', title: 'Feed', config: { url: 'https://example.com/rss' } });
    await runtime.store.insertLead(lead('open', 'https://kwork.ru/projects/1', { sourceId: source.id }));
    await runtime.store.insertLead(lead('closed', 'https://kwork.ru/projects/2', { sourceId: source.id }));
    await runtime.store.insertLead(lead('gone', 'https://www.fl.ru/projects/3/x.html', { sourceId: source.id }));
    await runtime.store.insertLead(lead('telegram', 'https://t.me/s/jobs/4', { sourceId: source.id }));

    const fetched: string[] = [];
    const fetchImpl = (async (input: RequestInfo | URL) => {
      const url = input.toString();
      fetched.push(url);
      if (url.endsWith('/1')) return new Response('"wantData":{"id":1,"status":"active"}', { status: 200 });
      if (url.endsWith('/2')) return new Response('"wantData":{"id":2,"status":"stop"}', { status: 200 });
      return new Response('not found', { status: 404 });
    }) as typeof fetch;

    const summary = await checkLeadsLiveness({ ...runtime, fetchImpl }, { perHostDelayMs: 0 });
    expect(summary).toMatchObject({ checked: 3, closed: 2, open: 1, failed: 0 });
    expect(fetched).not.toContain('https://t.me/s/jobs/4');
    expect((await runtime.store.getLead('open'))?.state ?? 'active').toBe('active');
    expect((await runtime.store.getLead('closed'))?.state).toBe('closed');
    expect((await runtime.store.getLead('gone'))?.state).toBe('closed');
    expect((await runtime.store.getLeadDecision('closed'))?.decidedBy).toBe('source');

    // Checked leads wait for their next round.
    const again = await checkLeadsLiveness({ ...runtime, fetchImpl }, { perHostDelayMs: 0 });
    expect(again.checked).toBe(0);

    // A closed lead leaves the feed but its page stays readable, marked closed.
    const app = createApp(runtime);
    const feed = await runtime.store.getLeadsForFeed({ limit: 10 });
    expect(feed.map((l) => l.id)).not.toContain('closed');
    const html = await (await app.request('/leads/closed')).text();
    expect(html).toContain('площадка показывает этот заказ закрытым');
    await runtime.store.close();
  });

  it('keeps going when a board does not answer', async () => {
    const runtime = makeTestRuntime();
    const source = await runtime.store.createSource({ kind: 'rss', title: 'Feed', config: { url: 'https://example.com/rss' } });
    await runtime.store.insertLead(lead('down', 'https://career.habr.com/vacancies/9', { sourceId: source.id, type: 'job' }));
    const fetchImpl = (async () => {
      throw new Error('ECONNRESET');
    }) as typeof fetch;
    const summary = await checkLeadsLiveness({ ...runtime, fetchImpl }, { perHostDelayMs: 0 });
    expect(summary).toMatchObject({ checked: 1, failed: 1, closed: 0 });
    expect((await runtime.store.getLead('down'))?.state ?? 'active').toBe('active');
    await runtime.store.close();
  });
});

describe('feed age limits', () => {
  it('drops orders after the gig limit and vacancies after the job limit', async () => {
    const runtime = makeTestRuntime({ RADAR_GIG_TTL_DAYS: 14, RADAR_JOB_TTL_DAYS: 30 });
    const source = await runtime.store.createSource({ kind: 'rss', title: 'Feed', config: { url: 'https://example.com/rss' } });
    const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();
    await runtime.store.insertLead(lead('gig-fresh', 'https://example.com/a', { sourceId: source.id, createdAt: daysAgo(3) }));
    await runtime.store.insertLead(lead('gig-old', 'https://example.com/b', { sourceId: source.id, createdAt: daysAgo(20) }));
    await runtime.store.insertLead(lead('job-20', 'https://example.com/c', { sourceId: source.id, type: 'job', createdAt: daysAgo(20) }));
    await runtime.store.insertLead(lead('job-40', 'https://example.com/d', { sourceId: source.id, type: 'job', createdAt: daysAgo(40) }));

    const ids = (await runtime.store.getLeadsForFeed({ limit: 10, maxAgeDays: feedMaxAge(runtime.env) })).map((l) => l.id).sort();
    expect(ids).toEqual(['gig-fresh', 'job-20']);
    expect(feedMaxAge({ RADAR_GIG_TTL_DAYS: 0, RADAR_JOB_TTL_DAYS: 0 })).toBeUndefined();
    await runtime.store.close();
  });
});
