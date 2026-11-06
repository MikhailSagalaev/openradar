import { describe, expect, it } from 'vitest';
import { atsSource, companiesOf, nextBatch } from '../src/sources/ats.ts';
import { SOURCE_PRESETS } from '../src/sources/presets.ts';
import { leadFromPage, pageLinks } from '../src/sources/sitemap.ts';
import { makeSource } from './helpers.ts';

const source = makeSource({ kind: 'sitemap', title: 'Test — Вакансии' });

describe('sitemap lead extraction', () => {
  it('reads a JobPosting page with its markup', () => {
    const html = `<!doctype html><html><head><title>Job - Co</title></head><body>
      <script type="application/ld+json">{"@context":"https://schema.org","@type":"JobPosting","title":"Backend Engineer","datePosted":"2026-11-01","hiringOrganization":{"name":"Co"},"jobLocation":{"address":{"addressLocality":"Москва"}},"description":"<p>Build APIs</p>"}</script>
      </body></html>`;
    const lead = leadFromPage(source, 'https://x.test/v/1', '1', html);
    expect(lead?.title).toBe('Backend Engineer');
    expect(lead?.author).toBe('Co');
    expect(lead?.city).toBe('Москва');
    expect(lead?.publishedAt).toBe('2026-11-01');
  });

  it('falls back to a plain page: h1 is the vacancy, body and meta carry the text', () => {
    const html = `<!doctype html><html><head><title>Аналитик 1С - Сбер2Б</title>
      <meta name="description" content="Занимаетесь аналитикой процессов 1С"></head>
      <body><nav>меню меню</nav><h1>Аналитик 1С</h1>
      <p>Обязанности: развивать механизмы 1С, сопровождать конфигурации, оптимизировать запросы. Зарплата от 200 000 до 260 000 рублей в месяц, оформление по ТК, удалённая работа, гибкое начало дня, ДМС после испытательного срока, обучение за счёт компании.</p>
      <footer>контакты</footer></body></html>`;
    const lead = leadFromPage(source, 'https://x.test/v/2', '2', html);
    expect(lead?.title).toBe('Аналитик 1С');
    expect(lead?.text).toContain('аналитикой процессов 1С');
    expect(lead?.text).toContain('от 200 000 до 260 000');
    expect(lead?.externalId).toBe('sitemap:x.test:2');
  });

  it('rejects a dead page and a thin page', () => {
    const dead = '<html><head><title>404 - Страница не найдена</title></head><body><h1>404</h1></body></html>';
    expect(leadFromPage(source, 'https://x.test/v/3', '3', dead)).toBeUndefined();
    const thin = '<html><head><title>Job</title></head><body><h1>Job</h1><p>Коротко.</p></body></html>';
    expect(leadFromPage(source, 'https://x.test/v/4', '4', thin)).toBeUndefined();
  });
});

describe('career pages', () => {
  const owned = makeSource({ kind: 'sitemap', title: 'Co — Вакансии', config: { company: 'Co' } });
  const long = 'Обязанности: сопровождать сервисы, писать код, разбирать инциденты и помогать коллегам. '.repeat(4);

  it('names the owner of a career site', () => {
    const lead = leadFromPage(owned, 'https://x.test/v/3', '3', `<html><body><h1>Инженер</h1><p>${long}</p></body></html>`);
    expect(lead?.author).toBe('Co');
  });

  it('skips a closed vacancy but not a hidden notice', () => {
    const closed = `<html><body><h1>Инженер</h1><h4>Вакансия закрыта</h4><p>${long}</p></body></html>`;
    expect(leadFromPage(owned, 'https://x.test/v/4', '4', closed)).toBeUndefined();
    const hidden = `<html><body><h1>Инженер</h1><dialog><p>Вакансия в архиве</p></dialog><div class="note w-condition-invisible"><div>This position has been closed.</div></div><p>${long}</p></body></html>`;
    expect(leadFromPage(owned, 'https://x.test/v/5', '5', hidden)?.title).toBe('Инженер');
  });

  it('takes the page title when the heading names no vacancy', () => {
    const html = `<html><head><title data-rh="true">Менеджер в Саратов</title></head><body><h1>Детальная страница вакансии</h1><p>${long}</p></body></html>`;
    expect(leadFromPage(owned, 'https://x.test/v/6', '6', html)?.title).toBe('Менеджер в Саратов');
    const list = `<html><head><title>Вакансии</title></head><body><p>${long}</p></body></html>`;
    expect(leadFromPage(owned, 'https://x.test/v/7', '7', list)).toBeUndefined();
  });

  it('adds the page text to a one-line JobPosting', () => {
    const html = `<html><body><script type="application/ld+json">{"@type":"JobPosting","title":"Инженер","description":"Ищем инженера"}</script><p>${long}</p></body></html>`;
    expect(leadFromPage(owned, 'https://x.test/v/8', '8', html)?.text).toContain('разбирать инциденты');
  });

  it('reads vacancy links from a career page', () => {
    const links = pageLinks('<a href="/v/1 ">a</a><a href="https://x.test/v/2">b</a><a href="/v/1">c</a>', 'https://x.test/jobs/');
    expect(links).toEqual(['https://x.test/v/1', 'https://x.test/v/2']);
  });
});

describe('ats boards without a description API', () => {
  const ctx = (body: unknown) => ({
    fetchImpl: (async () => new Response(JSON.stringify(body), { status: 200 })) as typeof fetch,
    userAgent: 'test', timeoutMs: 1000, now: () => new Date('2026-11-06'),
    logger: { info() {}, warn() {}, error() {}, debug() {} },
  }) as never;

  it('reads a Pinpoint board', async () => {
    const source = makeSource({ kind: 'ats', title: 'P', config: { provider: 'pinpoint', companies: ['acme=Acme'] } });
    const leads = await atsSource.poll!(source, ctx({ data: [{ id: '1', title: 'Analyst', url: 'https://acme.pinpointhq.com/en/postings/1', description: '<p>Work</p>', location: { city: 'Limassol', name: 'Cyprus' } }] }));
    expect(leads[0]).toMatchObject({ title: 'Analyst', author: 'Acme', city: 'Limassol', externalId: 'pinpoint:acme:1' });
  });

  it('reads a BambooHR board', async () => {
    const source = makeSource({ kind: 'ats', title: 'B', config: { provider: 'bamboohr', companies: ['acme=Acme'] } });
    const leads = await atsSource.poll!(source, ctx({ result: [{ id: '7', jobOpeningName: 'Manager', departmentLabel: 'Ops', location: { city: 'Paphos' } }] }));
    expect(leads[0]).toMatchObject({ title: 'Manager', url: 'https://acme.bamboohr.com/careers/7', city: 'Paphos' });
  });
});

describe('ats rotation', () => {
  it('starts a long list where the hour says after a restart, then goes on', () => {
    const items = ['a', 'b', 'c', 'd', 'e'];
    expect(nextBatch('rotation-test', items, 2, 3)).toEqual(['d', 'e']);
    expect(nextBatch('rotation-test', items, 2, 3)).toEqual(['a', 'b']);
  });
});

describe('ats presets', () => {
  it('list each board once, in a form the adapter accepts', () => {
    for (const preset of SOURCE_PRESETS.filter((p) => p.kind === 'ats')) {
      const raw = preset.config.companies as string[];
      const companies = companiesOf(makeSource({ kind: 'ats', title: preset.title, config: preset.config }));
      expect(companies).toHaveLength(raw.length);
      expect(new Set(companies.map((c) => c.slug)).size).toBe(companies.length);
    }
  });
});
