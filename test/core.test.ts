import { describe, expect, it } from 'vitest';
import { cleanTitle, extractBudget, extractCity } from '../src/core/extract.ts';
import { prepareRawLead } from '../src/core/prepare.ts';
import { applyRules } from '../src/core/rules.ts';
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
