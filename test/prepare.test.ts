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
        text: 'Пишите: ivanov@gmail.com или +7 999 123-45-67, срочно',
      },
      source,
      TEST_NOW,
    );
    expect(prepared.text).toContain('ivanov@gmail.com');
    expect(prepared.text).toContain('+7 999 123-45-67');
  });
});
