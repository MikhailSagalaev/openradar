import { describe, expect, it } from 'vitest';
import { cleanTitle, extractBudget, extractCity } from '../src/core/extract.ts';
import { prepareRawLead } from '../src/core/prepare.ts';
import { applyRules, scoreLead } from '../src/core/rules.ts';
import { normalizeTechTokens } from '../src/core/text.ts';
import { canonicalizeUrl } from '../src/core/url.ts';
import { makeSource, TEST_NOW } from './helpers.ts';

describe('url canonicalization', () => {
  it('removes tracking parameters, fragments and trailing slash', () => {
    expect(
      canonicalizeUrl('https://Example.com/orders/1/?utm_source=rss&b=2#frag'),
    ).toBe('https://example.com/orders/1?b=2');
  });

  it('rejects non-http urls', () => {
    expect(canonicalizeUrl('javascript:alert(1)')).toBeUndefined();
  });
});

describe('extraction', () => {
  it('extracts a ruble budget only with a money marker', () => {
    expect(extractBudget('Бюджет 5 000 ₽, срочно')).toBe(5000);
    expect(extractBudget('Нужен ремонт в 2026 году')).toBeUndefined();
    expect(extractBudget('Позвоните 8 999 123 45 67')).toBeUndefined();
  });

  it('extracts a city from inflected forms', () => {
    expect(extractCity('Нужен сантехник в Ставрополе')).toBe('Ставрополь');
    expect(extractCity('Работа в Москве, оплата 5000')).toBe('Москва');
    expect(extractCity('Можно удаленно, по всей России')).toBe('Онлайн');
  });

  it('cleans emoji and trailing punctuation', () => {
    expect(cleanTitle('🔥 Срочно нужен сантехник...')).toBe('Срочно нужен сантехник');
  });
});

describe('prepare', () => {
  it('normalizes a raw lead and keeps a stable fingerprint', () => {
    const source = makeSource();
    const raw = {
      sourceId: source.id,
      title: 'Нужен сантехник',
      text: 'Прорвало трубу, бюджет 5000 ₽, Ставрополь',
      url: 'https://example.com/1?utm_source=x',
    };
    const lead = prepareRawLead(raw, source, TEST_NOW);
    expect(lead.city).toBe('Ставрополь');
    expect(lead.budget).toBe(5000);
    expect(lead.canonicalUrl).toBe('https://example.com/1');
    expect(lead.fingerprint).toBe(
      prepareRawLead({ ...raw, url: 'https://example.com/1' }, source, TEST_NOW).fingerprint,
    );
  });
});

describe('rules', () => {
  const source = makeSource({ config: { includeKeywords: ['сантехник'], minBudget: 1000 } });

  it('accepts a relevant lead', () => {
    const lead = prepareRawLead(
      {
        sourceId: source.id,
        title: 'Нужен сантехник',
        text: 'Прорвало трубу под раковиной, Ставрополь, бюджет 5000 ₽',
      },
      source,
      TEST_NOW,
    );
    const result = applyRules(lead, source, TEST_NOW);
    expect(result.accepted).toBe(true);
    expect(result.score).toBeGreaterThan(50);
  });

  it('rejects fake review spam', () => {
    const lead = prepareRawLead(
      {
        sourceId: source.id,
        title: 'Накрутка отзывов',
        text: 'Нужна накрутка отзывов на Авито, напишем 5 звезд за деньги',
      },
      source,
      TEST_NOW,
    );
    expect(applyRules(lead, source, TEST_NOW).reasons).toContain('spam:FAKE_REVIEWS');
  });

  it('rejects a resale listing', () => {
    const lead = prepareRawLead(
      {
        sourceId: source.id,
        title: 'Продам детскую кроватку',
        text: 'Продам детскую кроватку в хорошем состоянии, самовывоз.',
      },
      makeSource(),
      TEST_NOW,
    );
    expect(applyRules(lead, makeSource(), TEST_NOW).reasons).toContain(
      'spam:RESALE_OR_RENTAL',
    );
  });

  it('rejects job seekers but keeps vacancies and orders that mention a CV', () => {
    const reasons = (title: string, text: string): string[] =>
      applyRules(prepareRawLead({ sourceId: source.id, title, text }, makeSource(), TEST_NOW), makeSource(), TEST_NOW)
        .reasons;

    expect(reasons('Ищу работу', 'Ищу работу frontend-разработчиком, моё резюме по ссылке')).toContain('spam:JOB_SEEKER');
    for (const [title, text] of [
      ['Junior Java Developer', 'Вакансия в продуктовой команде. Присылайте резюме на почту.'],
      ['Сделать сайт визитку/резюме', 'Нужен адаптивный сайт-резюме на Tilda'],
      ['Собрать данные', 'Нужно собрать данные по вакансиям в сфере айти: ссылка на вакансию, название'],
    ]) {
      expect(reasons(title!, text!)).not.toContain('spam:JOB_SEEKER');
    }
  });

  it('rejects remote data entry for foreign-currency pay, keeps rouble data entry', () => {
    const reasons = (title: string, text: string): string[] =>
      applyRules(prepareRawLead({ sourceId: source.id, title, text }, makeSource(), TEST_NOW), makeSource(), TEST_NOW)
        .reasons;
    expect(reasons('Специалист по удаленному вводу данных - 2000EUR', 'Удаленная работа, без опыта')).toContain('spam:DATA_ENTRY_SCAM');
    expect(reasons('Ввод данных в 1С', 'Нужно внести 300 накладных в 1С, бюджет 3 000 ₽')).not.toContain('spam:DATA_ENTRY_SCAM');
  });

  it('rejects a lead without a required keyword', () => {
    const lead = prepareRawLead(
      {
        sourceId: source.id,
        title: 'Нужен электрик',
        text: 'Заменить розетку в квартире, Ставрополь',
      },
      source,
      TEST_NOW,
    );
    expect(applyRules(lead, source, TEST_NOW).reasons).toContain('missing_keyword');
  });

  it('rejects a budget below the configured minimum', () => {
    const lead = prepareRawLead(
      {
        sourceId: source.id,
        title: 'Нужен сантехник',
        text: 'Починить кран, бюджет 500 ₽',
      },
      source,
      TEST_NOW,
    );
    expect(applyRules(lead, source, TEST_NOW).reasons).toContain('budget_below:1000');
  });
});

describe('tech token normalization', () => {
  it('maps symbols in IT terms to searchable alphanumeric tokens', () => {
    expect(normalizeTechTokens('Ищем Senior C++ и C# разработчика')).toBe(
      'Ищем Senior cpp_tech и csharp_tech разработчика',
    );
    expect(normalizeTechTokens('Разработка на .NET и 1С:Предприятие')).toBe(
      'Разработка на dotnet_tech и onec_tech:Предприятие',
    );
    expect(normalizeTechTokens('Backend: Node.js, Next.js, Golang и F#')).toBe(
      'Backend: nodejs_tech, nextjs_tech, golang_tech и fsharp_tech',
    );
  });
});

describe('score', () => {
  const source = makeSource();
  const score = (raw: { title: string; text: string; type?: 'job' | 'gig'; publishedAt?: string }, now = TEST_NOW): number =>
    scoreLead(prepareRawLead({ sourceId: source.id, ...raw }, source, now), source, now);
  const detailedSpec =
    'Нужен интернет-магазин на Next.js и TypeScript с бэкендом на Node.js и PostgreSQL. ' +
    'Каталог на 5 000 товаров, фильтры, корзина, оплата через ЮKassa, личный кабинет, ' +
    'интеграция с 1С по CommerceML, админка для контент-менеджера. Дизайн в Figma готов. ' +
    'Срок 6 недель, оплата поэтапно. Бюджет 150 000 ₽. Пишите @shop_owner_dev';

  it('ranks a detailed, well-paid IT order high and a one-line post low', () => {
    expect(score({ title: 'Интернет-магазин на Next.js', text: detailedSpec })).toBeGreaterThanOrEqual(80);
    expect(score({ title: 'Ищу практика', text: 'Нужен человек' })).toBeLessThan(50);
  });

  it('scores orders of any trade alike: no penalty for non-IT work', () => {
    const logo = score({ title: 'Логотип и фирменный стиль для кофейни', text: 'Нужен логотип, брендбук и вывеска. Референсы пришлю, правки до трёх раз. Бюджет 30 000 ₽. Пишите @coffee_owner_spb' });
    const bot = score({ title: 'Telegram-бот для кофейни', text: 'Нужен бот на Python с меню и заказами. Референсы пришлю, правки до трёх раз. Бюджет 30 000 ₽. Пишите @coffee_owner_spb' });
    expect(Math.abs(logo - bot)).toBeLessThanOrEqual(6);
    expect(logo).toBeGreaterThanOrEqual(65);
  });

  it('values money on separate ladders for orders and salaries', () => {
    const gig = (budget: string) => score({ title: 'Доработать сайт на WordPress', text: `Поправить вёрстку и форму. Бюджет ${budget}` });
    expect(gig('500 ₽')).toBeLessThan(gig('5 000 ₽'));
    expect(gig('5 000 ₽')).toBeLessThan(gig('50 000 ₽'));

    const job = (salary: string) =>
      score({ title: 'Python-разработчик', text: `Вакансия в продуктовую команду, Django и PostgreSQL. Зарплата ${salary} в месяц`, type: 'job' });
    expect(job('60 000 ₽')).toBeLessThan(job('300 000 ₽'));
  });

  it('counts dictionary IT skills, not board tags', () => {
    const raw = { title: 'Director of Product', text: 'Lead the product organisation across three business units and own the roadmap.' };
    const tagged = scoreLead(
      prepareRawLead({ sourceId: source.id, ...raw, skills: ['senior', 'exec', 'customer support', 'technical'] }, source, TEST_NOW),
      source,
      TEST_NOW,
    );
    expect(tagged).toBe(score(raw));
  });

  it('does not depend on how fresh the post was at ingest', () => {
    const raw = { title: 'Telegram-бот на Python', text: 'Нужен бот на aiogram с оплатой, бюджет 20 000 ₽', publishedAt: TEST_NOW.toISOString() };
    const later = new Date(TEST_NOW.getTime() + 20 * 3600 * 1000);
    expect(score(raw, later)).toBe(score(raw, TEST_NOW));
  });
});
