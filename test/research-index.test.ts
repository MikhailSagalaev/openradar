import { describe, expect, it } from 'vitest';
import type { ResearchDailyRow } from '../src/core/store.ts';
import type { Lead } from '../src/core/types.ts';
import { aggregateDay, addDays, buildIndex, ensureDailyCounts, indexCsv, PANEL_START } from '../src/research/index.ts';
import { makeTestRuntime } from './helpers.ts';

function rows(day: string, hh: number, extra: Partial<ResearchDailyRow> = {}): ResearchDailyRow[] {
  return [
    { day, type: 'job', platform: 'hh.ru', role: 'backend', scope: 'ru', n: hh + 30, panelN: hh, ...extra },
    // Not seen by the panel, or not Russian-language: never counted.
    { day, type: 'job', platform: 'telegram', role: 'backend', scope: 'ru', n: 50 },
    { day, type: 'job', platform: 'hh.ru', role: 'backend', scope: 'intl', n: 50, panelN: 50 },
    { day, type: 'gig', platform: 'kwork.ru', role: 'bots', scope: 'ru', n: 10, panelN: 10 },
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
    expect(index.itJobs?.latest?.index).toBe(109.1);
    expect(index.byPlatform?.length).toBe(2);
    expect(index.weekdayProfile?.length).toBe(7);
  });

  it('damps single-day pre-base feed onboarding spikes in the 7-day rolling mean', () => {
    const data = Array.from({ length: 16 }, (_, i) => rows(addDays(PANEL_START, i), i === 7 ? 1400 : 350)).flat();
    const index = buildIndex(data, new Date(`${addDays(PANEL_START, 16)}T12:00:00Z`));
    expect(index.jobs.points[7]!.count).toBe(1400);
    expect(index.jobs.weekChange).toBe(0);
  });

  it('fixes the base once its four weeks are over', () => {
    const data: ResearchDailyRow[] = [];
    for (let d = PANEL_START; d < '2026-12-15'; d = addDays(d, 1)) data.push(...rows(d, d >= '2026-12-07' ? 150 : 100));
    const index = buildIndex(data, new Date('2026-12-15T12:00:00Z'));
    expect(index.base).toMatchObject({ provisional: false, days: 28, from: '2026-11-09' });
    expect(index.jobs.latest?.index).toBe(150);
  });

  it('saves the days that are over and redoes the last ones', async () => {
    const runtime = makeTestRuntime();
    const source = await runtime.store.createSource({ kind: 'rss', title: 'HeadHunter — IT-вакансии', config: { url: 'https://example.com/rss' } });
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

  it('counts what the panel feeds saw, and only new vacancies', async () => {
    const runtime = makeTestRuntime();
    const panel = await runtime.store.createSource({ kind: 'rss', title: 'HeadHunter — IT-вакансии', config: { url: 'https://example.com/hh' } });
    const later = await runtime.store.createSource({ kind: 'rss', title: 'HeadHunter — QA', config: { url: 'https://example.com/qa' } });
    const post = (id: number, sourceId: string): Lead => ({
      id: `v${id}`, sourceId, externalId: `v${id}`, url: `https://hh.ru/vacancy/${id}`, title: 'Backend-разработчик', text: 'Компания ищет разработчика в команду',
      publishedAt: `${PANEL_START}T10:00:00.000Z`, fingerprint: `v${id}`, titleKey: `v${id}`, status: 'new', score: 50, reasons: [], createdAt: `${PANEL_START}T10:00:00.000Z`,
      type: 'job', skills: [],
    } as unknown as Lead);
    await runtime.store.insertLead(post(139_000_000, panel.id)); // new, from the panel
    await runtime.store.insertLead(post(138_000_000, panel.id)); // raised in search: months old
    await runtime.store.insertLead(post(139_000_001, later.id)); // a later feed only
    await runtime.store.insertLead(post(139_000_002, later.id)); // met through a later feed, seen by the panel too
    await runtime.store.addLeadSighting!({ leadId: 'v139000002', url: 'https://hh.ru/vacancy/139000002', sourceId: panel.id, method: 'url', similarity: 1 });

    await ensureDailyCounts(runtime.store, new Date(`${addDays(PANEL_START, 1)}T05:00:00Z`));
    const stored = await runtime.store.listResearchDaily!(PANEL_START, addDays(PANEL_START, 1));
    expect(stored.reduce((sum, r) => sum + r.n, 0)).toBe(4);
    expect(stored.reduce((sum, r) => sum + (r.panelN ?? 0), 0)).toBe(2);
  });

  it('builds the international (Global & Remote) sub-index alongside the Russian panel', () => {
    const rows: ResearchDailyRow[] = [];
    for (let i = 0; i < 14; i++) {
      const day = addDays(PANEL_START, i);
      const scale = i >= 7 ? 1.25 : 1;
      rows.push(
        { day, type: 'job', platform: 'hh.ru', role: 'backend', scope: 'ru', n: 20, panelN: 20 },
        { day, type: 'job', platform: 'himalayas.app', role: 'backend', scope: 'intl', n: Math.round(40 * scale), panelN: 0 },
        { day, type: 'job', platform: 'boards.greenhouse.io', role: 'ml', scope: 'intl', n: Math.round(10 * scale), panelN: Math.round(10 * scale) },
        { day, type: 'gig', platform: 'freelancer.com', role: 'web', scope: 'intl', n: Math.round(30 * scale), panelN: 0 },
      );
    }
    const index = buildIndex(rows, new Date(`${addDays(PANEL_START, 14)}T12:00:00Z`));
    expect(index.intl).toBeDefined();
    expect(index.intl!.jobs.base).toBe(56.5);
    expect(index.intl!.jobs.latest?.avg7).toBe(63);
    expect(index.intl!.jobs.weekChange).toBe(26);
    expect(index.intl!.gigs.base).toBe(34);
    expect(index.intl!.roles.map((r) => r.slug)).toEqual(['backend', 'ml']);
    expect(index.intl!.byPlatform.map((p) => p.platform)).toContain('job-boards.greenhouse.io');
    expect(indexCsv(index)).toContain(`,intl-job,`);
    expect(indexCsv(index)).toContain(`,intl-gig,`);
  });
  it("excludes international boards from RU panel byPlatform even if scope is ru", () => {
    const days = ["2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13", "2026-11-14", "2026-11-15", "2026-11-16"];
    const rows = days.flatMap((day) => [
      { day, type: "job" as const, platform: "hh.ru", role: "backend", scope: "ru" as const, n: 20, panelN: 18 },
      { day, type: "job" as const, platform: "himalayas.app", role: "backend", scope: "ru" as const, n: 10, panelN: 10 },
    ]);
    const built = buildIndex(rows, new Date("2026-11-17T12:00:00Z"));
    expect((built.byPlatform ?? []).map((p) => p.platform)).toEqual(["hh.ru"]);
  });
});
