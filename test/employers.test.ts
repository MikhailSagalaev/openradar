import { describe, expect, it } from 'vitest';
import { employerOf } from '../src/core/company.ts';
import { fillEmployers } from '../src/pipeline/reemployers.ts';
import { createApp } from '../src/server/app.ts';
import type { Lead } from '../src/core/types.ts';
import { makeTestRuntime } from './helpers.ts';

function lead(id: string, sourceId: string, over: Partial<Lead> = {}): Lead {
  return {
    id,
    sourceId,
    type: 'job',
    title: `Инженер ${id}`,
    text: 'Описание вакансии',
    fingerprint: `fp-${id}`,
    titleKey: `key-${id}`,
    status: 'new',
    score: 70,
    reasons: [],
    skills: ['Go'],
    city: 'Москва',
    createdAt: '2026-10-01T00:00:00.000Z',
    ...over,
  } as Lead;
}

describe('employerOf', () => {
  it('takes the employer of a vacancy from a board', () => {
    expect(employerOf({ type: 'job', author: 'Riot Games, Inc.' }, 'ats')).toEqual({ key: 'riotgames', name: 'Riot Games, Inc.' });
  });

  it('never names the client of an order', () => {
    expect(employerOf({ type: 'gig', author: 'Иван Петров' }, 'rss')).toBeUndefined();
  });

  it('does not take a channel, a person or a participant for an employer', () => {
    expect(employerOf({ type: 'job', author: 'Анна Рекрутер' }, 'telegram')).toBeUndefined();
    expect(employerOf({ type: 'job', author: 'mona' }, 'webhook')).toBeUndefined();
    expect(employerOf({ type: 'job', author: 'Вакансии в IT' }, 'rss')).toBeUndefined();
    expect(employerOf({ type: 'job', author: '@hr_anna' }, 'rss')).toBeUndefined();
  });

  it('reads a company a post names in its text', () => {
    expect(employerOf({ type: 'job', author: 'Анна', text: 'Компания: Сбер\nИщем инженера' }, 'telegram')?.name).toBe('Сбер');
  });
});

describe('employer pages', () => {
  async function setup() {
    const runtime = makeTestRuntime({ RADAR_PUBLIC_READ: true });
    const source = await runtime.store.createSource({ kind: 'ats', title: 'Board', config: {}, enabled: true });
    for (const id of ['a', 'b', 'c']) {
      await runtime.store.insertLead(lead(id, source.id, { author: 'Riot Games', contacts: [{ type: 'email', value: 'hr@riot.test' }] as never }));
    }
    await runtime.store.insertLead(lead('d', source.id, { author: 'Tiny <script>' }));
    await runtime.store.insertLead(lead('e', source.id, { type: 'gig', author: 'Иван Петров' }));
    await fillEmployers(runtime.store);
    return { runtime, app: createApp(runtime) };
  }

  it('fills stored leads once', async () => {
    const { runtime } = await setup();
    expect((await runtime.store.getLead('a'))?.companyKey).toBe('riotgames');
    expect((await runtime.store.getLead('e'))?.companyKey).toBeUndefined();
    expect((await fillEmployers(runtime.store)).updated).toBe(0);
  });

  it('lists employers and opens one without contacts', async () => {
    const { app } = await setup();
    const list = await (await app.request('/employers')).text();
    expect(list).toContain('href="/employers/riotgames"');
    const page = await app.request('/employers/RiotGames');
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain('Вакансии Riot Games');
    expect(html).toContain('rel="canonical"');
    expect(html).toContain('"ItemList"');
    expect(html).not.toContain('hr@riot.test');
  });

  it('finds an employer by name and escapes what it shows', async () => {
    const { app } = await setup();
    const found = await (await app.request('/employers?q=tiny')).text();
    expect(found).toContain('Tiny &lt;script&gt;');
    expect(found).not.toContain('Tiny <script>');
    expect(found).toContain('noindex');
  });

  it('answers 404 for an unknown employer and keeps clients out', async () => {
    const { app } = await setup();
    expect((await app.request('/employers/nobody')).status).toBe(404);
    expect(await (await app.request('/employers')).text()).not.toContain('Иван Петров');
  });

  it('puts employers with several vacancies into the sitemap', async () => {
    const { app } = await setup();
    const xml = await (await app.request('/sitemap.xml')).text();
    expect(xml).toContain('/employers/riotgames');
    expect(xml).not.toContain('/employers/tiny');
  });

  it('opens a company whose vacancies are all fresh or closed', async () => {
    const { runtime, app } = await setup();
    const source = (await runtime.store.listSources()).find((s) => s.title === 'Board')!;
    for (const id of ['f1', 'f2']) await runtime.store.insertLead(lead(id, source.id, { author: 'Freshly', createdAt: new Date().toISOString() }));
    await runtime.store.insertLead(lead('x', source.id, { author: 'Gonely', state: 'closed' }));
    await fillEmployers(runtime.store);
    const fresh = await app.request('/employers/freshly');
    expect(fresh.status).toBe(200);
    expect(await fresh.text()).toContain('Вакансии Freshly');
    const gone = await app.request('/employers/gonely');
    expect(gone.status).toBe(200);
    const html = await gone.text();
    expect(html).toContain('открытых вакансий нет');
    expect(html).toContain('noindex');
  });

  it('links a vacancy to its employer and keeps the header short', async () => {
    const { app } = await setup();
    const html = await (await app.request('/leads/a')).text();
    expect(html).toContain('<p class="lead-company"><a href="/employers/riotgames">Riot Games</a></p>');
    const header = html.slice(html.indexOf('<header'), html.indexOf('</header>'));
    expect(header).not.toContain('/employers');
    expect(html.slice(html.indexOf('<footer'))).toContain('href="/employers"');
  });

  it('stays closed on a private node', async () => {
    const app = createApp(makeTestRuntime({ RADAR_PUBLIC_READ: false }));
    expect((await app.request('/employers')).status).toBe(302);
  });
});
