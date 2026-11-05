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
import { renderEmbedPage, renderReportPage } from '../src/research/pages.ts';
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

    // Yearly dollars become roubles per month at the rate given, the reference one by default.
    expect(normalizePay({ min: 120000, max: 120000, currency: 'USD', period: 'year', origin: 'page' }, 'job', { USD: 90 })).toMatchObject({ point: 900000, period: 'month' });
    expect(normalizePay({ min: 120000, max: 120000, currency: 'USD', period: 'year', origin: 'page' }, 'job')).toMatchObject({ point: 805600, period: 'month' });
    // An order paid by the month is not a project budget.
    expect(normalizePay({ min: 60000, max: 60000, currency: 'RUB', period: 'month', origin: 'text' }, 'gig')).toMatchObject({ period: 'month' });
    expect(parsePayText('Ведение соцсетей, 60 000 ₽ в месяц', 'gig')).toMatchObject({ period: 'month' });
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

function gig(i: number, overrides: Partial<ResearchRecord> = {}): ResearchRecord {
  return record(i, { type: 'gig', payPeriod: 'project', pay: 10000, company: undefined, ...overrides });
}

describe('report', () => {
  it('gives the median an interval that narrows with the sample', () => {
    const values = (n: number): number[] => Array.from({ length: n }, (_, i) => 100000 + i * 1000);
    const small = dist(values(20));
    const large = dist(values(400));
    expect(small.ciLow).toBeLessThan(small.median!);
    expect(small.ciHigh).toBeGreaterThan(small.median!);
    // The share of the sample the interval spans halves as the sample quadruples.
    expect((large.ciHigh! - large.ciLow!) / 400).toBeLessThan((small.ciHigh! - small.ciLow!) / 20);
  });

  it('keeps English-language orders out of the order figures', () => {
    const records = [
      ...Array.from({ length: 20 }, (_, i) => gig(i, { pay: 3000 })),
      ...Array.from({ length: 20 }, (_, i) => gig(100 + i, { pay: 90000, scope: 'intl' })),
    ];
    const report = buildReport(records, monthPeriod('2026-10'), 'month');
    expect(report.gigs.budget).toMatchObject({ n: 20, median: 3000 });
    expect(report.totals).toMatchObject({ gigs: 20, intlGigs: 20 });
  });

  it('compares remote and office at the same role and grade', () => {
    // Remote vacancies are senior here: the plain gap is large, the matched one small.
    const records = [
      ...Array.from({ length: 30 }, (_, i) => record(i, { remote: true, grade: 'senior', pay: 310000 })),
      ...Array.from({ length: 30 }, (_, i) => record(100 + i, { remote: false, grade: 'senior', pay: 300000 })),
      ...Array.from({ length: 90 }, (_, i) => record(200 + i, { remote: false, grade: 'junior', pay: 100000 })),
    ];
    const report = buildReport(records, monthPeriod('2026-10'), 'month');
    expect(report.jobs.remote.remote.median! / report.jobs.remote.office.median!).toBeGreaterThan(2);
    expect(report.jobs.remote.adjusted).toMatchObject({ pct: 3, n: 30 });
    expect(report.findings.find((f) => f.text.startsWith('Удалённую'))!.quote).toContain('при той же роли и уровне разница +3%');
  });

  it('claims the top role only when its interval stands clear', () => {
    const roles = (slug: string, base: number, from: number): ResearchRecord[] =>
      Array.from({ length: 40 }, (_, i) => record(from + i, { role: slug, pay: base + i * 1000 }));
    const close = buildReport([...roles('ml', 300000, 0), ...roles('devops', 298000, 100), ...roles('qa', 100000, 200)], monthPeriod('2026-10'), 'month');
    expect(close.findings.some((f) => f.text.startsWith('Среди самых высоких'))).toBe(true);
    const clear = buildReport([...roles('ml', 500000, 0), ...roles('devops', 200000, 100), ...roles('qa', 100000, 200)], monthPeriod('2026-10'), 'month');
    expect(clear.findings.some((f) => f.text.startsWith('Больше всего'))).toBe(true);
  });

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
    expect(quote).toMatch(/^По данным openradar, медианная зарплата/);
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
    expect(html).toContain('data-quote="По данным openradar');
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

    const index = await (await app.request('/research/index')).text();
    expect(index).toContain('<h1>Индекс openradar</h1>');
    expect(index).toContain('hh.ru, career.habr.com');
    const indexJson = await (await app.request('/research/index.json')).json() as { version: number; base: { provisional: boolean } };
    expect(indexJson.version).toBe(2);
    expect((await app.request('/research/index.csv')).headers.get('content-type')).toContain('text/csv');
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
    const stored = (facts: Record<string, unknown>) => ({ model: { v: 2, model: 'test', at: '2026-10-28T00:00:00Z', facts } });
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
    const stored = (facts: Record<string, unknown>) => ({ model: { v: 2, model: 'test', at: '2026-10-28T00:00:00Z', facts } });
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

  it('stops the batch on a GigaChat 429 and asks for no token until the pause is over', async () => {
    resetGigachatToken();
    const runtime = makeTestRuntime({ RADAR_EXTRACT_ENABLED: true, RADAR_EXTRACT_PROVIDER: 'gigachat', GIGACHAT_AUTH_KEY: 'auth-key' });
    const source = await runtime.store.createSource({ kind: 'telegram', title: 'tg', config: { channel: 'jobs' } });
    for (const id of ['b1', 'b2', 'b3', 'b4']) await runtime.store.insertLead(lead(id, { sourceId: source.id, type: 'gig', title: 'Нужен бот', text: 'Бот для записи' }));
    let oauthCalls = 0;
    const fetchImpl = (async (input: RequestInfo | URL) => {
      if (input.toString().endsWith('/oauth')) {
        oauthCalls++;
        return new Response('{}', { status: 429, headers: { 'retry-after': '30' } });
      }
      throw new Error('no chat call expected');
    }) as typeof fetch;

    const summary = await runModelExtraction({ ...runtime, fetchImpl }, { limit: 10, concurrency: 3 });
    expect(oauthCalls).toBe(1);
    expect(summary.saved).toBe(0);
    expect(summary.asked).toBeLessThanOrEqual(3);
    expect(summary.pausedMs).toBe(30_000);

    const again = await runModelExtraction({ ...runtime, fetchImpl }, { limit: 10 });
    expect(oauthCalls).toBe(1);
    expect(again.pausedMs).toBeGreaterThan(0);
    resetGigachatToken();
  });
});

describe('research data consistency & honest visual metrics', () => {
  it('builds order shares from Russian-language project budgets alone', () => {
    const rolesList = ['backend', 'frontend', 'ai', 'design', 'qa', '1c', 'marketing', 'devops'];
    const records: ResearchRecord[] = [];
    let id = 1;
    for (const r of rolesList) {
      for (let i = 0; i < 15; i++) {
        records.push(gig(id++, { role: r, pay: 100000 + (id % 5) * 20000 }));
      }
    }
    // Salaries and English-language orders are other streams: they must not enter the sums.
    const report = buildReport([...records, record(9000, { pay: 9_000_000 }), gig(9001, { scope: 'intl', pay: 9_000_000 })], monthPeriod('2026-10'), 'month');
    const carta = report.cartaCapital!;
    expect(carta).toBeDefined();
    expect(carta.length).toBeLessThanOrEqual(6);

    // Sum of shares must be strictly 100.0%
    const totalNShare = Math.round(carta.reduce((s, r) => s + r.nShare, 0) * 10) / 10;
    const totalCapShare = Math.round(carta.reduce((s, r) => s + r.capitalShare, 0) * 10) / 10;
    expect(totalNShare).toBe(100.0);
    expect(totalCapShare).toBe(100.0);

    // Sum of posts across rows must strictly equal sample size
    const totalN = carta.reduce((s, r) => s + r.n, 0);
    expect(totalN).toBe(records.length);

    // Last row is "Другие направления" if more than 5 roles exist
    expect(carta[carta.length - 1]!.label).toBe('Другие направления');
  });

  it('computes taskTransformation from live records with real premiums and no dollars', () => {
    const records: ResearchRecord[] = [
      ...Array.from({ length: 12 }, (_, i) => gig(100 + i, { role: 'content', skills: ['копирайтинг'], pay: 60000 })),
      ...Array.from({ length: 12 }, (_, i) => gig(200 + i, { role: 'ai', skills: ['RAG', 'n8n'], pay: 180000 })),
    ];
    const report = buildReport(records, monthPeriod('2026-10'), 'month');
    const tt = report.taskTransformation!;
    expect(tt).toBeDefined();
    expect(tt.routine.find((r) => r.label.includes('копирайтинг'))?.n).toBe(12);
    expect(tt.emerging.find((r) => r.label.includes('AI-агентов'))?.n).toBe(12);
    expect(tt.netShiftPct).toBeGreaterThan(0); // AI premium > 0%
  });

  it('keeps the sign of a negative premium and shows no percent without enough paid posts', () => {
    const cheaper: ResearchRecord[] = [
      ...Array.from({ length: 12 }, (_, i) => gig(700 + i, { role: 'content', skills: ['копирайтинг'], pay: 100000 })),
      ...Array.from({ length: 12 }, (_, i) => gig(800 + i, { role: 'ai', skills: ['n8n'], pay: 80000 })),
    ];
    const tt = buildReport(cheaper, monthPeriod('2026-10'), 'month').taskTransformation!;
    expect(tt.netShiftPct).toBe(-20);
    expect(tt.emerging.find((r) => r.label.includes('AI-агентов'))?.changePct).toBe(-20);

    const thin: ResearchRecord[] = [
      ...Array.from({ length: 3 }, (_, i) => gig(900 + i, { role: 'content', skills: ['копирайтинг'], pay: 60000 })),
      ...Array.from({ length: 3 }, (_, i) => gig(950 + i, { role: 'ai', skills: ['n8n'], pay: 180000 })),
    ];
    const few = buildReport(thin, monthPeriod('2026-10'), 'month').taskTransformation!;
    expect(few.netShiftPct).toBeUndefined();
    expect(few.emerging.every((r) => r.changePct === undefined)).toBe(true);
  });

  it('counts influx and floral as neither image models nor template coding', () => {
    const records: ResearchRecord[] = [
      gig(1000, { role: 'backend', skills: ['InfluxDB'] }),
      gig(1001, { role: 'web', skills: ['React', 'HTML', 'CSS'] }),
    ];
    const tt = buildReport(records, monthPeriod('2026-10'), 'month').taskTransformation!;
    // A row with no orders is not shown at all.
    expect(tt.emerging.find((r) => r.label.includes('LoRA'))).toBeUndefined();
    expect(tt.routine.find((r) => r.label.includes('вёрстка'))).toBeUndefined();
  });

  it('computes bumpChart with real week and day snapshots and no fake 2025 quarters', () => {
    const records: ResearchRecord[] = [
      ...Array.from({ length: 10 }, (_, i) => record(300 + i, { date: '2026-10-12', role: 'backend' })),
      ...Array.from({ length: 10 }, (_, i) => record(400 + i, { date: '2026-10-19', role: 'frontend' })),
      ...Array.from({ length: 10 }, (_, i) => record(500 + i, { date: '2026-10-26', role: 'ai' })),
      ...Array.from({ length: 10 }, (_, i) => record(600 + i, { date: '2026-11-02', role: 'design' })),
    ];
    const report = buildReport(records, monthPeriod('2026-10'), 'month');
    const bump = report.bumpChart!;
    expect(bump).toBeDefined();
    expect(bump.quarters).toHaveLength(4);
    expect(bump.months).toHaveLength(4);

    // No fictional historical quarters
    for (const q of bump.quarters) {
      expect(q.period).not.toContain('Q1 2025');
      expect(q.ranks).toHaveLength(5);
      expect(q.ranks.map((r) => r.rank).sort()).toEqual([1, 2, 3, 4, 5]);
    }
  });

  it('warns that weeks differ in sample and renders the embeds', () => {
    const records: ResearchRecord[] = [
      ...Array.from({ length: 15 }, (_, i) => record(700 + i, { date: '2026-10-12', pay: 150000 })),
      ...Array.from({ length: 15 }, (_, i) => record(750 + i, { date: '2026-10-26', pay: 150000 })),
      ...Array.from({ length: 40 }, (_, i) => gig(790 + i, { role: i % 2 ? 'web' : 'design', pay: 20000 + i * 1000 })),
    ];
    const report = buildReport(records, monthPeriod('2026-10'), 'month');
    const html = renderReportPage({ report, baseUrl: 'https://openradar.fun', version: '0.41.2', snapshots: [] });

    expect(html).toContain('Состав выборки менялся');
    expect(html).not.toContain('капитал');

    // No fake retrospective marketing claims
    expect(html).not.toContain('за последние 12 месяцев: чистый индекс трансформации +18.4%');
    expect(html).not.toContain('Q1 2025');

    // Embed pages render properly
    const cartaEmbed = renderEmbedPage({ chartId: 'carta', report, baseUrl: 'https://openradar.fun' });
    expect(cartaEmbed).toContain('число против суммы бюджетов');
    expect(cartaEmbed).toContain('заказов с бюджетом');

    const bumpEmbed = renderEmbedPage({ chartId: 'bump', report, baseUrl: 'https://openradar.fun' });
    expect(bumpEmbed).toContain('bump-chart-svg');
    expect(bumpEmbed).toContain('btn-bump-w');
  });
});
