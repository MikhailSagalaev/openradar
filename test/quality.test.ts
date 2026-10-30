import { describe, expect, it } from 'vitest';
import { assessQuality, detectPostType, qualityFlagsOf, qualityPenaltyOf } from '../src/core/quality.ts';
import { ingestRawLead } from '../src/pipeline/ingest.ts';
import { rescoreLeads } from '../src/pipeline/rescore.ts';
import { makeTestRuntime, TEST_NOW } from './helpers.ts';

const telegram = { kind: 'telegram' };

function assess(title: string, text: string, type: 'job' | 'gig' = 'gig', kind = 'telegram') {
  return assessQuality({ type, title, text }, { kind });
}

describe('quality stage', () => {
  it('turns a channel vacancy typed as a gig into a job', () => {
    const title = 'Fullstack-разработчик';
    const text = 'Зарплата: 120 000 руб. Без опыта Удаленно. Требования: Next.js. Полная занятость, оформление по ТК.';
    expect(detectPostType({ type: 'gig', title, text }, telegram)).toBe('job');
  });

  it('turns «Role в Company — компания…» into a job', () => {
    const title = 'Системный аналитикв БСБ Банк — коммерческий банк в Беларуси со 100% швейцарским капиталом.';
    expect(detectPostType({ type: 'gig', title, text: 'Офис (Минск).' }, telegram)).toBe('job');
  });

  it('keeps a one-off order a gig', () => {
    const title = 'Нужно сделать лендинг на Tilda';
    const text = 'Бюджет: 30 000 ₽. ТЗ пришлю. Senior не нужен, срок выполнения неделя.';
    expect(detectPostType({ type: 'gig', title, text }, telegram)).toBe('gig');
  });

  it('leaves the type of a board with its own types alone', () => {
    const text = 'Зарплата: 120 000 руб. Полная занятость. Испытательный срок.';
    expect(detectPostType({ type: 'gig', title: 'Разработчик', text }, { kind: 'kwork' })).toBe('gig');
  });

  it('flags course sales, events and articles as channel promo', () => {
    expect(assess('Выбираешь один курс, второй получаешь бесплатно', 'Акция до 31 октября в Academy.').flags).toEqual(['channel_ad']);
    expect(assess('Идёт набор в XI поток Hello New Job!', 'За 7 недель обучения ты разберёшься в найме.').flags).toEqual(['channel_ad']);
    expect(assess('Уже сегодня встречаемся на практическом вебинаре', 'Начало в 19:00 мск, регистрация по ссылке.').flags).toEqual(['channel_ad']);
    expect(assess('Как перестать бояться говорить на английском?', 'Именно с этим запросом приходят IT-специалисты.').flags).toEqual(['channel_ad']);
  });

  it('does not flag a vacancy with a promo footer or ad marking', () => {
    const text = 'О НАС: рекламная сеть. ЗАДАЧИ: продажи. Полная занятость. Подписывайтесь на Marketing jobs.';
    expect(assess('Head of Sales в mybid. Удаленка.', text).flags).toEqual([]);
    const marked = 'Ищем менеджера продукта. Опыт работы: 3 года. Реклама, ООО "Облачные Технологии", erid: 2W5z';
    expect(assess('Менеджер продукта в Cloud', marked).flags).toEqual([]);
    expect(assess('#ищу #вакансия', 'Менеджер по продажам, 60 000 ₽. Промокод на курс в конце поста.').flags).toEqual([]);
  });

  it('flags vacancy roundups', () => {
    const text = 'Разработчик C/C++ в Vital Partners. До 320 000 ₽. Python-разработчик в IT_One. Можно удаленно.';
    expect(assess('Вакансии для бэкендеров на Хабр Карьере.', text, 'job').flags).toEqual(['digest']);
    const more = 'Юрист / Дикси. Подробнее. Проектный юрист. Подробнее. Юрисконсульт. Подробнее.';
    expect(assess('Свежее', more, 'job').flags).toEqual(['digest']);
  });

  it('flags recruiting into schemes', () => {
    const text = 'Требуются парни и девушки в возрасте 19–40 лет. С нас обучение, практика и помощь с выходом на фриланс.';
    const quality = assess('Работа в IT', text);
    expect(quality.flags).toEqual(['mlm']);
    expect(quality.penalty).toBe(40);
  });

  it('reads stored flags from metadata and ignores unknown ones', () => {
    const lead = { metadata: { qualityFlags: ['digest', 'bogus', 7] } };
    expect(qualityFlagsOf(lead)).toEqual(['digest']);
    expect(qualityPenaltyOf(lead)).toBe(20);
    expect(qualityFlagsOf({ metadata: {} })).toEqual([]);
  });

  it('stores the corrected type and flags at ingest, sinks the post, and requality keeps them', async () => {
    const runtime = makeTestRuntime();
    const source = await runtime.store.createSource({ kind: 'telegram', title: 'Курсы', config: { channel: 'courses' } });
    const deps = { store: runtime.store, sinks: runtime.sinks, logger: runtime.logger, env: runtime.env, now: () => TEST_NOW };

    const ad = await ingestRawLead(
      { sourceId: source.id, externalId: '1', title: 'Выбираешь один курс, второй получаешь бесплатно', text: 'Акция до 31 октября: два курса по цене одного, Python и SQL.' },
      source,
      deps,
    );
    const vacancy = await ingestRawLead(
      { sourceId: source.id, externalId: '2', title: 'Fullstack-разработчик', text: 'Зарплата: 120 000 руб. Удаленно. Полная занятость, испытательный срок 2 месяца.' },
      source,
      deps,
    );

    const adLead = (await runtime.store.getLead(ad.lead!.id))!;
    expect(qualityFlagsOf(adLead)).toEqual(['channel_ad']);
    expect(ad.reasons).toContain('quality:channel_ad');
    expect((await runtime.store.getLead(vacancy.lead!.id))!.type).toBe('job');

    // Requality on a lead stored before the stage existed: the type and flags arrive, the penalty lands.
    await runtime.store.updateLeadQuality!(adLead.id, 'gig', []);
    await runtime.store.updateLeadScore!(adLead.id, 70);
    const summary = await rescoreLeads(runtime.store, { days: 3650, now: TEST_NOW });
    expect(summary.requalified).toBe(1);
    const requalified = (await runtime.store.getLead(adLead.id))!;
    expect(qualityFlagsOf(requalified)).toEqual(['channel_ad']);
    expect(requalified.score).toBeLessThan(70 - 40);
    await runtime.store.close();
  });
});
