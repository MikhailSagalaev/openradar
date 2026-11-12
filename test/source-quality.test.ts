import { describe, expect, it } from 'vitest';
import { scoreSource, type SourceQualityInput } from '../src/core/source-quality.ts';
import { fillTemplate, jsonBoardSource, leadFromItem, valueAt } from '../src/sources/json-board.ts';
import { SOURCE_PRESETS } from '../src/sources/presets.ts';
import { createApp } from '../src/server/app.ts';
import { collectedVacancyToRaw } from '../src/server/collector.ts';
import { makeSource, makeTestRuntime } from './helpers.ts';

const good: SourceQualityInput = {
  runs: 40, failedRuns: 0, inserted: 60, rejected: 2, closed: 3, jobs: 60,
  withEmployer: 60, withPay: 40, fullText: 58, useful: 6, junk: 0, scam: 0,
};

describe('source score', () => {
  it('waits for enough polls', () => {
    expect(scoreSource({ ...good, runs: 2 })).toMatchObject({ score: null, grade: 'new' });
  });

  it('rates a healthy source high', () => {
    expect(scoreSource(good).grade).toBe('A');
  });

  it('sinks a source of closed vacancies although it answers well', () => {
    const closed = scoreSource({ ...good, closed: 57, withPay: 0, useful: 0, junk: 3 });
    expect(closed.score!).toBeLessThan(scoreSource(good).score! - 25);
    expect(closed.parts.alive).toBeCloseTo(0.05);
  });

  it('sinks a source that keeps failing', () => {
    expect(scoreSource({ ...good, failedRuns: 40, inserted: 0, closed: 0, jobs: 0, withEmployer: 0, withPay: 0, fullText: 0, useful: 0 }).grade).toBe('D');
  });

  it('does not punish what it has no data for', () => {
    const quiet = scoreSource({ ...good, inserted: 2, rejected: 0, closed: 0, jobs: 2, withEmployer: 0, withPay: 0, fullText: 0, useful: 0 });
    expect(quiet.parts.alive).toBeUndefined();
    expect(quiet.parts.trust).toBeUndefined();
  });

  it('weighs a scam report above a useful vote', () => {
    expect(scoreSource({ ...good, useful: 3, scam: 1 }).parts.trust).toBe(0.5);
  });
});

describe('json boards', () => {
  const config = {
    url: 'https://x.test/api?skip={offset}', list: 'data.items', pageSize: 2, pagesPerPoll: 1, id: 'id', title: 'name',
    text: ['intro', 'skills'], link: 'https://x.test/v/{id}', company: 'Acme', city: 'city', format: 'modes',
    salaryMin: 'min', published: 'date',
  };
  const source = makeSource({ kind: 'json', title: 'Acme', config });
  const item = { id: 7, name: 'Инженер', intro: '<p>Работа</p>', skills: [{ name: 'Go' }, 'SQL'], city: 'г Москва', modes: [{ title: 'Офис' }], min: 200000, date: '2026-11-01T00:00:00Z' };

  it('reads paths and templates', () => {
    expect(valueAt({ a: { b: [1, 2] } }, 'a.b.1')).toBe(2);
    expect(fillTemplate('https://x.test{path}/{id}', { path: '/v', id: 3 })).toBe('https://x.test/v/3');
  });

  it('turns an item into a post', () => {
    const lead = leadFromItem(source, config, item, 'x.test');
    expect(lead).toMatchObject({ title: 'Инженер', url: 'https://x.test/v/7', author: 'Acme', city: 'Москва', externalId: 'json:x.test:7', isRemote: false });
    expect(lead?.text).toContain('Go, SQL');
    expect(lead?.rawSalary).toContain('200000');
  });

  it('marks a remote vacancy', () => {
    expect(leadFromItem(source, config, { ...item, modes: [{ title: 'Удаленно' }] }, 'x.test')).toMatchObject({ city: 'Онлайн', isRemote: true });
  });

  it('names the pay period the board states instead of calling everything monthly', () => {
    const annual = leadFromItem(source, { ...config, salaryMax: 'max', salaryPeriod: 'period', currency: 'USD' }, { ...item, min: 121980, max: 130525, period: 'annual' }, 'x.test');
    expect(annual?.rawSalary).toBe('121980–130525 USD per year');
    const hourly = leadFromItem(source, { ...config, salaryPeriod: 'period', currency: 'USD' }, { ...item, min: 25, period: 'hour' }, 'x.test');
    expect(hourly?.rawSalary).toBe('от 25 USD per hour');
    // Without a period field the board keeps the monthly wording Russian sites publish.
    expect(leadFromItem(source, config, item, 'x.test')?.rawSalary).toContain('в месяц');
  });

  it('polls the list, goes on through pages and reads no old posts', async () => {
    const asked: string[] = [];
    const ctx = {
      fetchImpl: (async (url: string) => {
        asked.push(String(url));
        return new Response(JSON.stringify({ data: { items: [item, { ...item, id: 8, date: '2020-01-01T00:00:00Z' }] } }), { status: 200 });
      }) as unknown as typeof fetch,
      userAgent: 'test', timeoutMs: 1000, now: () => new Date('2026-11-06'),
      logger: { info() {}, warn() {}, error() {}, debug() {} },
    } as never;
    const leads = await jsonBoardSource.poll!({ ...source, id: 'poll-test' }, ctx);
    expect(leads.map((l) => l.externalId)).toEqual(['json:x.test:7']);
    expect(asked.map((u) => u.split('skip=')[1])).toEqual(['0', '2']);
  });

  it('are presets the site list knows', () => {
    expect(SOURCE_PRESETS.filter((p) => p.kind === 'json').length).toBeGreaterThanOrEqual(4);
  });
});

describe('quality page', () => {
  it('shows sources and keeps personal ones out', async () => {
    const runtime = makeTestRuntime({ RADAR_PUBLIC_READ: true });
    await runtime.store.createSource({ kind: 'rss', title: 'Лента', config: { url: 'https://x.test/f' }, enabled: true });
    await runtime.store.createSource({ kind: 'telegram', title: 'Личный канал', config: { userTelegram: true }, enabled: true });
    const app = createApp(runtime);
    const page = await app.request('/sources/quality');
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain('Лента');
    expect(html).not.toContain('Личный канал');
  });
});

describe('career collector', () => {
  const page = { url: 'https://wise.jobs/job/analyst-jid-1', title: 'Analyst', text: 'We need an analyst. '.repeat(20) };

  it('takes a vacancy page of a known site', () => {
    const lead = collectedVacancyToRaw('wise', 's', page);
    expect(lead).toMatchObject({ type: 'job', author: 'Wise', externalId: 'career:wise:/job/analyst-jid-1' });
    expect(lead?.text.startsWith('Компания: Wise')).toBe(true);
  });

  it('refuses another host, a closed vacancy and a thin page', () => {
    expect(collectedVacancyToRaw('wise', 's', { ...page, url: 'https://evil.test/job/1' })).toBeUndefined();
    expect(collectedVacancyToRaw('wise', 's', { ...page, text: `${page.text} This position has been closed.` })).toBeUndefined();
    expect(collectedVacancyToRaw('wise', 's', { ...page, text: 'short' })).toBeUndefined();
  });

  it('scrubs contacts from the page', () => {
    expect(collectedVacancyToRaw('wise', 's', { ...page, text: `${page.text} write hr@wise.test` })?.text).not.toContain('hr@wise.test');
  });
});

describe('hand labels', () => {
  it('are for admins only', async () => {
    const app = createApp(makeTestRuntime({ RADAR_PUBLIC_READ: true }));
    expect((await app.request('/admin/labels')).status).toBe(302);
    expect((await app.request('/admin/labels', { method: 'POST', body: new URLSearchParams({ id: 'a', verdict: 'good' }) })).status).toBe(403);
  });

  it('store a verdict and move on', async () => {
    const runtime = makeTestRuntime({ RADAR_ADMIN_TOKEN: 'secret' });
    const store = runtime.store;
    const source = await store.createSource({ kind: 'rss', title: 'Лента', config: {}, enabled: true });
    await store.insertLead({ id: 'a', sourceId: source.id, type: 'job', title: 'Пост', text: 'Текст', fingerprint: 'f', titleKey: 'k', status: 'new', score: 50, reasons: [], skills: [], createdAt: new Date().toISOString() } as never);
    expect((await store.nextLeadToLabel!())?.id).toBe('a');
    await store.saveLeadLabel!('a', 'good');
    expect(await store.nextLeadToLabel!()).toBeNull();
    expect(await store.labelStats!()).toEqual({ good: 1 });
  });
});
