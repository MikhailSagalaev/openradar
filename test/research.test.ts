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
  type ResearchRecord,
} from '../src/research/derive.ts';
import { extractPageFacts } from '../src/research/facts.ts';
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
    remote: false, skills: [], ai: false, market: 'ru', pay: 100000 + i * 1000, payPeriod: 'month', company: `Company ${i}`,
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
