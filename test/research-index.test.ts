import { describe, expect, it } from 'vitest';
import type { ResearchDailyRow } from '../src/core/store.ts';
import type { Lead } from '../src/core/types.ts';
import { aggregateDay, addDays, buildIndex, ensureDailyCounts, indexCsv, PANEL_START } from '../src/research/index.ts';
import { makeTestRuntime } from './helpers.ts';

function rows(day: string, hh: number, extra: Partial<ResearchDailyRow> = {}): ResearchDailyRow[] {
  return [
    { day, type: 'job', platform: 'hh.ru', role: 'backend', scope: 'ru', n: hh, ...extra },
    // Not in the panel, or not Russian-language: never counted.
    { day, type: 'job', platform: 'telegram', role: 'backend', scope: 'ru', n: 50 },
    { day, type: 'job', platform: 'hh.ru', role: 'backend', scope: 'intl', n: 50 },
    { day, type: 'gig', platform: 'kwork.ru', role: 'bots', scope: 'ru', n: 10 },
  ];
}

describe('openradar index', () => {
  it('waits for seven days before an index value', () => {
    const data = [0, 1, 2].flatMap((i) => rows(addDays(PANEL_START, i), 100));
    const index = buildIndex(data, new Date(`${addDays(PANEL_START, 3)}T12:00:00Z`));
    expect(index.jobs.points.map((p) => p.count)).toEqual([100, 100, 100]);
    expect(index.jobs.latest?.index).toBeUndefined();
    expect(index.base.provisional).toBe(true);
  });

  it('counts the panel only and sets the provisional base to 100', () => {
    const data = Array.from({ length: 14 }, (_, i) => rows(addDays(PANEL_START, i), i < 7 ? 100 : 120)).flat();
    const index = buildIndex(data, new Date(`${addDays(PANEL_START, 14)}T12:00:00Z`));
    expect(index.jobs.points[0]!.count).toBe(100);
    expect(index.jobs.base).toBe(110);
    expect(index.jobs.latest).toMatchObject({ count: 120, avg7: 120, index: 109.1 });
    expect(index.jobs.weekChange).toBe(20);
    expect(index.gigs.latest?.index).toBe(100);
    expect(index.roles.map((r) => r.slug)).toEqual(['backend']);
    expect(indexCsv(index).split('\n')[0]).toBe('date,type,count,avg7,index');
  });

  it('fixes the base to November once it is over', () => {
    const data: ResearchDailyRow[] = [];
    for (let d = PANEL_START; d < '2026-12-08'; d = addDays(d, 1)) data.push(...rows(d, d >= '2026-12-01' ? 150 : 100));
    const index = buildIndex(data, new Date('2026-12-08T12:00:00Z'));
    expect(index.base).toMatchObject({ provisional: false, days: 28, from: '2026-11-02' });
    expect(index.jobs.latest?.index).toBe(150);
  });

  it('saves the days that are over and redoes the last ones', async () => {
    const runtime = makeTestRuntime();
    const source = await runtime.store.createSource({ kind: 'rss', title: 'hh', config: { url: 'https://example.com/rss' } });
    const post = (id: string, day: string, title: string): Lead => ({
      id, sourceId: source.id, externalId: id, url: `https://hh.ru/vacancy/${id}`, title, text: 'Компания ищет разработчика в команду',
      publishedAt: `${day}T10:00:00.000Z`, fingerprint: id, titleKey: id, status: 'new', score: 50, reasons: [], createdAt: `${day}T10:00:00.000Z`,
      type: 'job', skills: [],
    } as unknown as Lead);
    await runtime.store.insertLead(post('a', PANEL_START, 'Backend-разработчик на Go'));
    await runtime.store.insertLead(post('b', PANEL_START, 'Backend-разработчик на Java'));
    await runtime.store.insertLead(post('c', addDays(PANEL_START, 1), 'Frontend-разработчик React'));

    const saved = await ensureDailyCounts(runtime.store, new Date(`${addDays(PANEL_START, 2)}T05:00:00Z`));
    expect(saved).toEqual([PANEL_START, addDays(PANEL_START, 1)]);
    const stored = await runtime.store.listResearchDaily!(PANEL_START, addDays(PANEL_START, 2));
    expect(stored.find((r) => r.day === PANEL_START && r.platform === 'hh.ru')).toMatchObject({ type: 'job', role: 'backend', scope: 'ru', n: 2 });
    // The next run redoes the last saved days and adds the new one.
    expect(await ensureDailyCounts(runtime.store, new Date(`${addDays(PANEL_START, 3)}T05:00:00Z`))).toEqual([PANEL_START, addDays(PANEL_START, 1), addDays(PANEL_START, 2)]);
    expect(aggregateDay(PANEL_START, [])).toEqual([]);
  });
});
