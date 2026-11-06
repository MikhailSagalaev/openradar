import { describe, expect, it } from 'vitest';
import { extractSkills } from '../src/core/text.ts';
import { assessQuality } from '../src/core/quality.ts';
import { prepareRawLead } from '../src/core/prepare.ts';
import { MemoryStore } from '../src/store/memory.ts';
import { makeSource } from './helpers.ts';

describe('audit 2026-11-06 fixes', () => {
  it('tags trades from the title and the requirements, not from the benefits', () => {
    // «Разработка» hung on a sales post through «developer platform» in the blurb.
    const sales = extractSkills(
      'Commercial Account Executive - Australia',
      'We are a developer platform. Our HR team will help you relocate. Sales experience required.',
    );
    expect(sales).not.toContain('Разработка');
    expect(sales).not.toContain('Рекрутинг');
    const real = extractSkills('Разработчик Python', 'Бэкенд на Python и PostgreSQL. Требования: опыт от 3 лет.');
    expect(real).toContain('Разработка');
    expect(real).toContain('Python');
    // «тестирование гипотез» in the benefits does not make a PM a QA.
    const pm = extractSkills('Продакт-менеджер', 'Требования: опыт в продукте. Условия: тестирование гипотек каждый спринт.');
    expect(pm).not.toContain('Тестирование');
  });

  it('marks a date the source never gave as estimated', () => {
    const source = makeSource({ kind: 'rss', title: 'Feed' });
    const withDate = prepareRawLead({ sourceId: source.id, type: 'job', title: 'A', text: 'Text', fingerprint: 'f1', titleKey: 'a', publishedAt: '2026-11-01T10:00:00Z' } as never, source, new Date('2026-11-06T10:00:00Z'));
    expect((withDate.metadata as Record<string, unknown>).publishedAtEstimated).toBeUndefined();
    const withoutDate = prepareRawLead({ sourceId: source.id, type: 'job', title: 'B', text: 'Text', fingerprint: 'f2', titleKey: 'b' } as never, source, new Date('2026-11-06T10:00:00Z'));
    expect((withoutDate.metadata as Record<string, unknown>).publishedAtEstimated).toBe(true);
  });

  it('flags mystery-shopper tasks on gig boards', () => {
    const source = makeSource({ kind: 'rss', title: 'Freelancer' });
    const lead = { id: 'ms1', type: 'gig' as const, title: 'Тайный покупатель. Только звонки', text: 'Посетите офис и оцените сервис. Оплата за визит.', budget: 1500 };
    const { flags } = assessQuality(lead as never, source);
    expect(flags).toContain('mystery_shopper');
    const job = { id: 'ms2', type: 'job' as const, title: 'Менеджер по качеству', text: 'Работа с тайными покупателями сети магазинов.' };
    expect(assessQuality(job as never, source).flags).not.toContain('mystery_shopper');
  });

  it('keeps a lead collected today but published a month ago out of a 7-day window', async () => {
    const store = new MemoryStore();
    const source = await store.createSource({ kind: 'ats', title: 'Board', config: { provider: 'greenhouse' } });
    await store.insertLead({
      id: 'old-post', sourceId: source.id, type: 'job', title: 'Old via re-list', text: 'Text', fingerprint: 'fp-old',
      titleKey: 'old-via-re-list', status: 'new', createdAt: new Date().toISOString(), publishedAt: new Date(Date.now() - 29 * 86_400_000).toISOString(),
    } as never);
    const fresh = await store.listLeads({ publishedAfter: new Date(Date.now() - 7 * 86_400_000).toISOString() });
    expect(fresh).toHaveLength(0);
    const all = await store.listLeads({ createdAfter: new Date(Date.now() - 7 * 86_400_000).toISOString() });
    expect(all).toHaveLength(1);
  });
});
