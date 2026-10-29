import { describe, expect, it } from 'vitest';
import type { Lead } from '../src/core/types.ts';
import { checkLeadsLiveness } from '../src/pipeline/liveness.ts';
import {
  classifyRole,
  deriveRecord,
  detectCompany,
  detectGrade,
  detectLanguage,
  normalizePay,
  parsePayText,
  scopeOf,
  type ResearchRecord,
} from '../src/research/derive.ts';
import { extractPageFacts } from '../src/research/facts.ts';
import { resetGigachatToken } from '../src/research/gigachat.ts';
import { parseModelAnswer, runModelExtraction } from '../src/research/model.ts';
import { modelQuality } from '../src/research/quality.ts';
import { MIN_MEDIAN, buildReport, dist, monthPeriod } from '../src/research/report.ts';
import { buildMonthReport, datasetCsv, ensureMonthlySnapshot, resetResearchCache } from '../src/research/service.ts';
import { createApp } from '../src/server/app.ts';
import { makeTestRuntime } from './helpers.ts';

function lead(id: string, overrides: Partial<Lead> = {}): Lead {
  const now = new Date().toISOString();
  return {
    id,
    sourceId: 'source-1',
    externalId: `external-${id}`,
    title: `Вакансия ${id}`,
    text: '',
    publishedAt: now,
    fingerprint: `fingerprint-${id}`,
    titleKey: `вакансия ${id}`,
    status: 'new',
    score: 60,
    reasons: [],
    createdAt: now,
    type: 'job',
    ...overrides,
  };
}

describe('pay in the text', () => {
  it('keeps what «от» and «до» mean', () => {
    expect(parsePayText('Предполагаемый уровень месячного дохода: от 180 000 до 240 000 ₽', 'job')).toMatchObject({ min: 180000, max: 240000, currency: 'RUB', period: 'month' });
    const from = parsePayText('Москва (Россия). От 290 000 ₽. Полный рабочий день.', 'job')!;
    expect([from.min, from.max]).toEqual([290000, undefined]);
    const upTo = parsePayText('Москва (Россия). До 188 000 ₽.', 'job')!;
    expect([upTo.min, upTo.max]).toEqual([undefined, 188000]);
    expect(parsePayText('Зарплата 150-200 тыс. руб', 'job')).toMatchObject({ min: 150000, max: 200000 });
  });

  it('needs a currency next to the number', () => {
    expect(parsePayText('Опыт 3–5 лет, команда из 10 человек, офис на 2 этаже', 'job')).toBeUndefined();
  });

  it('reads dollars, hourly and yearly pay', () => {
    expect(parsePayText('$4000 - $6000 per month', 'job')).toMatchObject({ min: 4000, max: 6000, currency: 'USD' });
    expect(parsePayText('Ставка 1 500 ₽ в час', 'gig')).toMatchObject({ min: 1500, period: 'hour' });
    expect(parsePayText('Обновить магазин - 1000UAH', 'gig')).toMatchObject({ min: 1000, currency: 'UAH', period: 'project' });

    // Yearly dollars become roubles per month at the reference rate.
    expect(normalizePay({ min: 120000, max: 120000, currency: 'USD', period: 'year', origin: 'page' }, 'job')).toMatchObject({ point: 920000, period: 'month' });
    // A typo or a phone number is not a salary.
    expect(normalizePay({ min: 500, max: 500, currency: 'RUB', period: 'month', origin: 'text' }, 'job')).toBeUndefined();
  });
});

describe('role, grade, language and employer', () => {
  it('classifies vacancies by title', () => {
    expect(classifyRole('job', 'Senior Python Backend Developer')).toBe('backend');
    expect(classifyRole('job', 'Системный аналитик ML')).toBe('analyst-system');
    expect(classifyRole('job', 'Вайб-кодер на Cursor')).toBe('ai');
    expect(classifyRole('job', 'Team Lead Go')).toBe('backend');
    expect(classifyRole('job', 'Middle/Middle+ iOS разработчик')).toBe('mobile');
    expect(classifyRole('job', 'Бухгалтер')).toBe('other');
    // A vague title falls back to the board's specialization.
    expect(classifyRole('job', 'Специалист', 'Бэкенд разработчик')).toBe('backend');
  });

  it('classifies orders by title, then by text', () => {
    expect(classifyRole('gig', 'Доработать телеграм бота')).toBe('bots');
    expect(classifyRole('gig', 'Сайт для продажи таунхаусов', 'Нужен дизайн и вёрстка')).toBe('web');
    expect(classifyRole('gig', 'Нужна помощь', 'Спарсить каталог в Excel')).toBe('parsing');
  });

  it('takes the highest grade named and Хабр tags', () => {
    expect(detectGrade('Middle+/Senior .NET Developer', '')).toBe('senior');
    expect(detectGrade('Team Lead Go', '')).toBe('lead');
    expect(detectGrade('Java разработчик', 'Требуемые навыки: #middle, #Java')).toBe('middle');
    expect(detectGrade('Java разработчик', '', 'Junior')).toBe('junior');
    expect(detectGrade('Менеджер по лидогенерации', '')).toBeUndefined();
  });

  it('finds the language and the employer', () => {
    expect(detectLanguage('Senior Java разработчик', [])).toBe('Java');
    expect(detectLanguage('Backend-разработчик', ['PostgreSQL', 'Python'])).toBe('Python');
    expect(detectCompany(lead('a', { text: 'Компания «ИТ-компания «Лоция»» ищет хорошего специалиста' }))).toBe('ИТ-компания «Лоция»');
    expect(detectCompany(lead('b', { text: 'Вакансия компании: Techno Diasoft\nСоздана: 27.10.2026' }))).toBe('Techno Diasoft');
  });

  it('derives a record from an hh.ru post', () => {
    const record = deriveRecord(lead('hh', {
      url: 'https://hh.ru/vacancy/1',
      title: 'Middle+ Backend (PHP) Разработчик',
      text: 'Вакансия компании: РЦНИ\nРегион: Москва\nПредполагаемый уровень месячного дохода: от 180 000 до 240 000 ₽',
      budget: 240000,
    }));
    expect(record).toMatchObject({
      role: 'backend', grade: 'middle', language: 'PHP', company: 'РЦНИ', region: 'Москва', platform: 'hh.ru',
      payMin: 180000, payMax: 240000, pay: 210000, payPeriod: 'month', market: 'ru', payOrigin: 'text',
    });
  });
});

describe('page facts', () => {
  it('reads schema.org JobPosting with yearly pay', () => {
    const html = `<script type="application/ld+json">{"@context":"http://schema.org/","@type":"JobPosting","title":"Security Engineer",
      "hiringOrganization":{"@type":"Organization","name":"OpenAI"},"jobLocationType":"TELECOMMUTE",
      "baseSalary":{"@type":"MonetaryAmount","currency":"USD","value":{"@type":"QuantitativeValue","unitText":"YEAR","minValue":234400,"maxValue":385000}}}</script>`;
    expect(extractPageFacts(html)).toEqual({
      salary: { min: 234400, max: 385000, currency: 'USD', period: 'year' },
      company: 'OpenAI',
      remote: true,
    });
  });

  it('reads Хабр Карьера grade and specialization', () => {
    const html = `<script type="application/ld+json">{"@type":"JobPosting","title":"Java разработчик",
      "description":"<p>Навыки: Java, Spring Boot, Docker. Квалификация: Middle. Специализации: Бэкенд разработчик.</p>",
      "hiringOrganization":{"@type":"Organization","name":"ЛАНИТ"}}</script>`;
    expect(extractPageFacts(html)).toMatchObject({ grade: 'Middle', specialization: 'Бэкенд разработчик', company: 'ЛАНИТ', skills: ['Java', 'Spring Boot', 'Docker'] });
    expect(extractPageFacts('<html>no markup</html>')).toEqual({});
  });

  it('fills pay from the page during the closed-post check', async () => {
    const runtime = makeTestRuntime();
    const source = await runtime.store.createSource({ kind: 'rss', title: 'hh', config: { url: 'https://example.com/rss' } });
    await runtime.store.insertLead(lead('hh-1', { sourceId: source.id, url: 'https://hh.ru/vacancy/1', canonicalUrl: 'https://hh.ru/vacancy/1' }));
    const fetchImpl = (async () => new Response(
      `"archived":false <script type="application/ld+json">{"@type":"JobPosting","hiringOrganization":{"name":"Сбер"},
        "baseSalary":{"currency":"RUR","value":{"minValue":200000,"maxValue":300000,"unitText":"MONTH"}}}</script>`,
      { status: 200 },
    )) as typeof fetch;
    const summary = await checkLeadsLiveness({ ...runtime, fetchImpl }, { perHostDelayMs: 0 });
    expect(summary).toMatchObject({ checked: 1, open: 1, enriched: 1 });
    const stored = (await runtime.store.getLead('hh-1'))!;
    expect(stored.author).toBe('Сбер');
    expect(stored.normalizedUsdMin).toBeGreaterThan(2000);
    expect(deriveRecord(stored)).toMatchObject({ pay: 250000, payOrigin: 'page', company: 'Сбер' });
  });
});

function record(i: number, overrides: Partial<ResearchRecord> = {}): ResearchRecord {
  return {
    id: `r${i}`, date: '2026-10-20', type: 'job', platform: 'hh.ru', role: 'backend', region: 'Москва',
    remote: false, skills: [], ai: false, market: 'ru', pay: 100000 + i * 1000, payPeriod: 'month', company: `Company ${i}`, scope: 'ru',
    ...overrides,
  };
}

describe('report', () => {
  it('hides figures below the sample threshold', () => {
    expect(dist([1, 2, 3])).toEqual({ n: 3 });
    expect(dist(Array.from({ length: MIN_MEDIAN }, (_, i) => 100000 + i * 1000)).median).toBeDefined();
    expect(dist(Array.from({ length: MIN_MEDIAN }, () => 100000)).p25).toBeUndefined();
  });

  it('counts one employer posting the same vacancy once', () => {
    const many = Array.from({ length: 30 }, (_, i) => record(i, { company: 'Яндекс', pay: 188000, date: '2026-10-21' }));
    const others = Array.from({ length: 12 }, (_, i) => record(100 + i, { pay: 100000 }));
    const report = buildReport([...many, ...others], monthPeriod('2026-10'), 'month');
    expect(report.jobs.pay).toMatchObject({ n: 13, median: 100000 });
    expect(report.totals.jobs).toBe(42);
  });

  it('writes quotable findings with the period and the sample', () => {
    const records = [
      ...Array.from({ length: 25 }, (_, i) => record(i, { grade: 'junior', pay: 80000 + i * 1000 })),
      ...Array.from({ length: 25 }, (_, i) => record(50 + i, { grade: 'senior', pay: 250000 + i * 1000, remote: i % 2 === 0 })),
    ];
    const report = buildReport(records, monthPeriod('2026-10'), 'month');
    const quote = report.findings[0]!.quote;
    expect(quote).toMatch(/^По данным OpenRadar, медианная зарплата/);
    expect(quote).toContain('в октябре 2026 года');
    expect(quote).toContain('выборка: 50 вакансий');
    expect(report.findings.some((f) => /Senior .* раза больше, чем Junior/.test(f.text))).toBe(true);
  });

  it('exports derived fields only, holding back the last day', () => {
    const now = new Date('2026-10-28T12:00:00Z');
    const csv = datasetCsv([record(1, { date: '2026-10-20', skills: ['Go', 'SQL'] }), record(2, { date: '2026-10-28' })], now);
    const lines = csv.trim().split('\n');
    expect(lines[0]).toMatch(/^id,date,type,platform,role/);
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain('Go;SQL');
  });
});

describe('research pages', () => {
  async function seeded(env: Record<string, unknown> = { RADAR_PUBLIC_READ: true }) {
    resetResearchCache();
    const runtime = makeTestRuntime(env);
    const source = await runtime.store.createSource({ kind: 'rss', title: 'hh', config: { url: 'https://example.com/rss' } });
    for (let i = 0; i < 24; i++) {
      await runtime.store.insertLead(lead(`job-${i}`, {
        sourceId: source.id,
        url: `https://hh.ru/vacancy/${i}`,
        title: i % 2 ? 'Senior Python разработчик' : 'Junior Python разработчик',
        text: `Вакансия компании: Компания ${i}\nРегион: Москва\nПредполагаемый уровень месячного дохода: от ${100 + i * 5} 000 ₽`,
      }));
    }
    return runtime;
  }

  it('serves the live report, role pages, methodology and data', async () => {
    const runtime = await seeded();
    const app = createApp(runtime);
    const html = await (await app.request('/research')).text();
    expect(html).toContain('<h1>Рынок труда в IT и фрилансе</h1>');
    expect(html).toContain('data-quote="По данным OpenRadar');
    expect(html).toContain('"@type": "Dataset"');
    expect(html).toContain('href="/research/roles/backend"');

    expect((await app.request('/research/roles/backend')).status).toBe(200);
    expect((await app.request('/research/roles/nope')).status).toBe(404);
    expect((await app.request('/research/methodology')).status).toBe(200);
    const json = await (await app.request('/research/report.json')).json() as { jobs: { pay: { n: number } } };
    expect(json.jobs.pay.n).toBe(24);
    const csv = await app.request('/research/dataset.csv');
    expect(csv.headers.get('content-type')).toContain('text/csv');
    expect(await csv.text()).not.toContain('Предполагаемый');
  });

  it('freezes a month and serves it by its slug', async () => {
    const runtime = await seeded();
    expect(await ensureMonthlySnapshot(runtime.store, new Date('2026-11-02T00:00:00Z'))).toBeUndefined(); // too few vacancies
    const report = buildReport(Array.from({ length: 20 }, (_, i) => record(i)), monthPeriod('2026-09'), 'month');
    await runtime.store.saveResearchSnapshot!('2026-09', report);
    const app = createApp(runtime);
    const page = await (await app.request('/research/2026-09')).text();
    expect(page).toContain('Рынок труда в IT и фрилансе: сентябрь 2026');
    expect(page).toContain('Цифры зафиксированы');
    expect((await app.request('/research/2026-09.json')).status).toBe(200);
    expect((await app.request('/research/2026-08')).status).toBe(404);
  });

  it('labels a month the base covers only in part', async () => {
    resetResearchCache();
    const runtime = makeTestRuntime();
    const source = await runtime.store.createSource({ kind: 'rss', title: 'hh', config: { url: 'https://example.com/rss' } });
    await runtime.store.insertLead(lead('late', { sourceId: source.id, publishedAt: '2026-10-22T10:00:00.000Z', createdAt: '2026-10-22T10:00:00.000Z' }));
    const report = await buildMonthReport(runtime.store, '2026-10', new Date('2026-11-01T01:00:00Z'));
    expect(report.period.label).toBe('Октябрь 2026 (с 22 октября)');
    expect(report.period.phrase).toBe('с 22 по 31 октября 2026 года');
  });

  it('stays closed on a private node', async () => {
    const runtime = await seeded({ RADAR_PUBLIC_READ: false });
    const response = await createApp(runtime).request('/research');
    expect(response.status).toBe(302);
  });
});

describe('market scope', () => {
  it('keeps English-language vacancies out of the main figures', () => {
    expect(scopeOf('Backend-разработчик', 'Ищем разработчика на Go в команду платежей')).toBe('ru');
    expect(scopeOf('Senior Backend Engineer', 'We are hiring a Go engineer, remote in EU')).toBe('intl');
    expect(scopeOf('Go developer', 'Компания ищет Go developer в команду, удалённо')).toBe('ru');
    const intl = Array.from({ length: 5 }, (_, i) => record(100 + i, { scope: 'intl', market: 'intl', remote: true, company: 'Stripe' }));
    const report = buildReport([...Array.from({ length: 12 }, (_, i) => record(i)), ...intl], monthPeriod('2026-10'), 'month');
    expect(report.totals).toMatchObject({ jobs: 12, intlJobs: 5 });
    expect(report.jobs.remote.share).toBe(0);
    expect(report.jobs.companies.map((c) => c.name)).not.toContain('Stripe');
    expect(report.jobs.intl.n).toBe(5);
  });
});

describe('model extraction', () => {
  it('keeps only answers of the expected shape', () => {
    expect(parseModelAnswer('{"isPost":true,"confidence":0.9,"role":"bots","payMin":50000,"payMax":50000,"currency":"rub","period":"project","skills":["Python"]}'))
      .toEqual({ isPost: true, confidence: 0.9, role: 'bots', payMin: 50000, payMax: 50000, currency: 'RUB', period: 'project', skills: ['Python'] });
    // An unknown role, a made-up grade and pay without a currency are dropped.
    expect(parseModelAnswer('{"isPost":true,"confidence":2,"role":"astronaut","grade":"guru","payMin":1000}')).toEqual({ isPost: true, confidence: 1 });
    expect(parseModelAnswer('not json')).toBeUndefined();
    expect(parseModelAnswer('{"confidence":0.9}')).toBeUndefined();
    // Without a JSON mode the object may come wrapped in prose or fences.
    expect(parseModelAnswer('Вот ответ:\n```json\n{"isPost":false,"confidence":0.8}\n```')).toEqual({ isPost: false, confidence: 0.8 });
  });

  it('fills gaps the rules left and leaves out ads', () => {
    const stored = (facts: Record<string, unknown>) => ({ model: { v: 1, model: 'test', at: '2026-10-28T00:00:00Z', facts } });
    const order = lead('tg', { type: 'gig', title: 'Нужна помощь', text: 'Сделайте бота для записи, оплата 50к', metadata: stored({ isPost: true, confidence: 0.9, role: 'bots', payMin: 50000, payMax: 50000, currency: 'RUB', period: 'project' }) });
    expect(deriveRecord(order)).toMatchObject({ role: 'bots', pay: 50000, payPeriod: 'project', payOrigin: 'model' });

    // The text's own figure wins over the model's.
    const written = lead('fl', { type: 'gig', title: 'Лендинг', text: 'Бюджет 20 000 ₽', metadata: stored({ isPost: true, confidence: 0.9, payMin: 90000, payMax: 90000, currency: 'RUB', period: 'project' }) });
    expect(deriveRecord(written)).toMatchObject({ pay: 20000, payOrigin: 'text' });

    // An unsure answer is ignored; a sure «not a post» is left out of the report.
    expect(deriveRecord(lead('unsure', { type: 'gig', title: 'Нужна помощь', metadata: stored({ isPost: true, confidence: 0.4, role: 'bots' }) })).role).toBe('other');
    const ad = deriveRecord(lead('ad', { type: 'gig', title: 'Делаю сайты недорого', metadata: stored({ isPost: false, confidence: 0.95 }) }));
    expect(ad.excluded).toBe(true);
    const report = buildReport([ad, record(1)], monthPeriod('2026-10'), 'month');
    expect(report.totals).toMatchObject({ posts: 1, excluded: 1 });
  });

  it('asks the model for posts without an answer, once', async () => {
    const runtime = makeTestRuntime({ RADAR_EXTRACT_ENABLED: true, OPENAI_API_KEY: 'test-key', OPENAI_BASE_URL: 'https://llm.example/v1' });
    const source = await runtime.store.createSource({ kind: 'telegram', title: 'tg', config: { channel: 'jobs' } });
    await runtime.store.insertLead(lead('m1', { sourceId: source.id, type: 'gig', title: 'Нужен бот', text: 'Бот для записи клиентов, плачу 15 тысяч' }));
    const requests: Array<{ url: string; body: { model: string; messages: Array<{ role: string; content: string }> } }> = [];
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ url: input.toString(), body: JSON.parse(String(init?.body)) });
      const content = JSON.stringify({ isPost: true, confidence: 0.85, role: 'bots', payMin: 15000, payMax: 15000, currency: 'RUB', period: 'project' });
      return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
    }) as typeof fetch;

    const summary = await runModelExtraction({ ...runtime, fetchImpl }, { limit: 10 });
    expect(summary).toEqual({ asked: 1, saved: 1, failed: 0, ids: ['m1'] });
    expect(requests[0]!.url).toBe('https://llm.example/v1/chat/completions');
    expect(requests[0]!.body.messages[0]!.content).toContain('untrusted data');
    expect(deriveRecord((await runtime.store.getLead('m1'))!)).toMatchObject({ pay: 15000, payOrigin: 'model', role: 'bots' });

    expect((await runModelExtraction({ ...runtime, fetchImpl }, { limit: 10 })).asked).toBe(0);
    // Off unless enabled with a key.
    expect((await runModelExtraction({ ...makeTestRuntime(), fetchImpl }, { limit: 10 })).asked).toBe(0);
  });

  it('uses its own TLS client for GigaChat when handed the global fetch', async () => {
    resetGigachatToken();
    const runtime = makeTestRuntime({ RADAR_EXTRACT_ENABLED: true, RADAR_EXTRACT_PROVIDER: 'gigachat', GIGACHAT_AUTH_KEY: 'k', GIGACHAT_OAUTH_URL: 'https://127.0.0.1:1/oauth' });
    const source = await runtime.store.createSource({ kind: 'telegram', title: 'tg', config: { channel: 'jobs' } });
    await runtime.store.insertLead(lead('n1', { sourceId: source.id, type: 'gig', title: 'Нужен бот' }));
    const global = globalThis.fetch;
    let called = false;
    globalThis.fetch = (async () => { called = true; return new Response('{}'); }) as typeof fetch;
    try {
      const summary = await runModelExtraction({ ...runtime, fetchImpl: globalThis.fetch }, { limit: 1 });
      expect(summary.failed).toBe(1); // the unreachable host, through node:https
      expect(called).toBe(false);
    } finally {
      globalThis.fetch = global;
    }
  });

  it('stays out of the figures in shadow mode', () => {
    const metadata = { model: { v: 1, model: 'test', at: '2026-10-28T00:00:00Z', facts: { isPost: true, confidence: 0.9, role: 'bots', payMin: 50000, payMax: 50000, currency: 'RUB', period: 'project' } } };
    const order = lead('shadow', { type: 'gig', title: 'Нужна помощь', metadata });
    expect(deriveRecord(order, { useModel: false })).toMatchObject({ role: 'other', pay: undefined });
    expect(deriveRecord(order)).toMatchObject({ role: 'bots', payOrigin: 'model' });
  });

  it('measures agreement with the rules before the model is trusted', () => {
    const stored = (facts: Record<string, unknown>) => ({ model: { v: 1, model: 'test', at: '2026-10-28T00:00:00Z', facts } });
    const leads = [
      // Agrees on role and pay.
      ...Array.from({ length: 30 }, (_, i) => lead(`a${i}`, { type: 'gig', title: 'Telegram-бот для записи', text: 'Бюджет 20 000 ₽', metadata: stored({ isPost: true, confidence: 0.9, role: 'bots', payMin: 20000, payMax: 20000, currency: 'RUB', period: 'project' }) })),
      // Disagrees on pay.
      lead('b', { type: 'gig', title: 'Telegram-бот для записи', text: 'Бюджет 20 000 ₽', metadata: stored({ isPost: true, confidence: 0.9, role: 'bots', payMin: 90000, payMax: 90000, currency: 'RUB', period: 'project' }) }),
      // Adds what the rules miss; an ad; an unsure answer.
      lead('c', { type: 'gig', title: 'Нужна помощь', metadata: stored({ isPost: true, confidence: 0.9, role: 'bots', payMin: 5000, payMax: 5000, currency: 'RUB', period: 'project' }) }),
      lead('d', { type: 'gig', title: 'Делаю сайты', metadata: stored({ isPost: false, confidence: 0.9 }) }),
      lead('e', { type: 'gig', title: 'Что-то', metadata: stored({ isPost: true, confidence: 0.3, role: 'bots' }) }),
      lead('f', { type: 'gig', title: 'Без ответа' }),
    ];
    const q = modelQuality(leads);
    expect(q).toMatchObject({ answered: 34, confident: 33, notPost: 1, gain: { role: 1, pay: 1 } });
    expect(q.role).toEqual({ n: 31, agree: 31 });
    expect(q.pay).toEqual({ n: 31, agree: 30 });
    expect(q.disagreements[0]).toMatchObject({ id: 'b', field: 'pay' });
    expect(q.ready).toBe(true);
    expect(modelQuality(leads.slice(30)).ready).toBe(false); // too few comparisons
  });

  it('talks to GigaChat with a cached token and no JSON mode', async () => {
    resetGigachatToken();
    const runtime = makeTestRuntime({ RADAR_EXTRACT_ENABLED: true, RADAR_EXTRACT_PROVIDER: 'gigachat', GIGACHAT_AUTH_KEY: 'auth-key' });
    const source = await runtime.store.createSource({ kind: 'telegram', title: 'tg', config: { channel: 'jobs' } });
    for (const id of ['g1', 'g2']) await runtime.store.insertLead(lead(id, { sourceId: source.id, type: 'gig', title: 'Нужен бот', text: 'Бот для записи' }));
    const calls: Array<{ url: string; headers: Record<string, string>; body: string }> = [];
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      calls.push({ url, headers: Object.fromEntries(new Headers(init?.headers).entries()), body: String(init?.body) });
      if (url.endsWith('/oauth')) return new Response(JSON.stringify({ access_token: 'tok', expires_at: Date.now() + 30 * 60_000 }), { status: 200 });
      const content = 'Ответ: {"isPost":true,"confidence":0.9,"role":"bots"}';
      return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
    }) as typeof fetch;

    const summary = await runModelExtraction({ ...runtime, fetchImpl }, { limit: 10 });
    expect(summary).toMatchObject({ asked: 2, saved: 2, failed: 0 });
    const oauth = calls.filter((c) => c.url.endsWith('/oauth'));
    expect(oauth).toHaveLength(1);
    expect(oauth[0]!.url).toBe('https://ngw.devices.sberbank.ru:9443/api/v2/oauth');
    expect(oauth[0]!.headers).toMatchObject({ authorization: 'Basic auth-key' });
    expect(oauth[0]!.headers.rquid).toMatch(/^[0-9a-f-]{36}$/);
    expect(oauth[0]!.body).toBe('scope=GIGACHAT_API_PERS');
    const chat = calls.find((c) => c.url.endsWith('/chat/completions'))!;
    expect(chat.url).toBe('https://gigachat.devices.sberbank.ru/api/v1/chat/completions');
    expect(chat.headers.authorization).toBe('Bearer tok');
    const body = JSON.parse(chat.body) as Record<string, unknown>;
    expect(body).toMatchObject({ model: 'GigaChat-2-Pro' });
    expect(body.response_format).toBeUndefined();
    expect(body.temperature).toBeGreaterThan(0);
    resetGigachatToken();
  });
});
