import { describe, expect, it } from 'vitest';
import { prepareRawLead } from '../src/core/prepare.ts';
import { makeSource, TEST_NOW } from './helpers.ts';

const source = makeSource();

describe('prepareRawLead', () => {
  it('detects job type from adapter hints and URL/title heuristics', () => {
    const explicit = prepareRawLead(
      { sourceId: source.id, type: 'job', title: 'Курьер на полдня', text: 'Доставка документов' },
      source,
      TEST_NOW,
    );
    expect(explicit.type).toBe('job');

    const habrVacancy = prepareRawLead(
      { sourceId: source.id, title: 'Backend-разработчик', text: 'Разработка API', url: 'https://career.habr.com/vacancies/1000' },
      source,
      TEST_NOW,
    );
    expect(habrVacancy.type).toBe('job');

    const flProject = prepareRawLead(
      { sourceId: source.id, title: 'Нужен парсер на Python', text: 'Собрать данные с маркетплейса', url: 'https://www.fl.ru/projects/123/' },
      source,
      TEST_NOW,
    );
    expect(flProject.type).toBe('gig');
  });

  it('caps stored text at 20 000 characters (radar/2 observation limit)', () => {
    const prepared = prepareRawLead(
      { sourceId: source.id, title: 'Большой заказ', text: 'Описание '.repeat(3000) },
      source,
      TEST_NOW,
    );
    expect(prepared.text.length).toBeLessThanOrEqual(20_000);
    expect(prepared.text.endsWith('…')).toBe(true);
  });

  it('preserves direct personal contacts in raw lead text without censorship', () => {
    const prepared = prepareRawLead(
      {
        sourceId: source.id,
        title: 'Нужен лендинг',
        text: 'Пишите: ivanov@example.com или +7 999 123-45-67, срочно',
      },
      source,
      TEST_NOW,
    );
    expect(prepared.contacts.length).toBeGreaterThanOrEqual(1);
    expect(prepared.text).toContain('ivanov@example.com');
    expect(prepared.text).toContain('+7 999 123-45-67');
  });

  it('correctly attributes USD currency for international posts even if raw.currency defaults to RUB', () => {
    const groqJob = prepareRawLead(
      {
        sourceId: source.id,
        title: 'Director, Revenue Operations',
        text: 'Groq is hiring. Compensation: $259,300 - $350,800 USD per year. Location: San Francisco Bay Area.',
        url: 'https://jobs.gem.com/groq/am9icG9zdDrP39BVN-uB851o61lWhY_o',
        currency: 'RUB', // default sent by client
      },
      source,
      TEST_NOW,
    );
    expect(groqJob.type).toBe('job');
    expect(groqJob.currency).toBe('USD');
    expect(groqJob.budget).toBe(350800);
    expect(groqJob.normalizedUsdMin).toBe(21608);
    expect(groqJob.normalizedUsdMax).toBe(29233);
  });
});
