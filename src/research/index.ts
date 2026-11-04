/**
 * The openradar index: how many new vacancies and orders appear each day, against a base
 * period of 100, on a fixed panel of feeds. A post counts when a panel feed saw it, so a feed
 * added later changes nothing, and a post first met through another feed still counts. On
 * boards that number vacancies, an old vacancy raised in search is not a new one.
 *
 * The raw material is the daily table (research_daily): counts by type, platform, role and
 * market scope, saved once a day is over and redone for the last few days, since posts can
 * arrive a little late.
 */
import type { ResearchDailyRow, Store } from '../core/store.ts';
import { SOURCE_PRESETS, presetSource } from '../sources/presets.ts';
import { OTHER_ROLE, roleDef, type DeriveOptions, type ResearchRecord } from './derive.ts';
import { researchRecords } from './service.ts';

export const INDEX_VERSION = 2;
/** The first day all panel feeds were polled in full. */
export const PANEL_START = '2026-10-30';
/** Four whole weeks after the rules of 0.44 settled make 100; until they are over, the base is provisional. */
export const BASE = { from: '2026-11-09', to: '2026-12-07' };
/** The boards of the panel, for the pages. */
export const PANEL: Record<'job' | 'gig', string[]> = {
  job: ['hh.ru', 'career.habr.com', 'getmatch.ru', 'trudvsem.ru'],
  gig: ['kwork.ru', 'fl.ru', 'freelancehunt.com'],
};
/** The feeds of the panel. Other feeds of the same boards do not belong to it. */
const PANEL_PRESETS = ['hh-it', 'hh-remote-project', 'habr-career', 'getmatch', 'trudvsem-remote', 'kwork-all', 'fl-all', 'freelancehunt'];
/**
 * How far behind the newest number a vacancy may be and still be new: about seven days of
 * numbers (hh.ru hands out some 32 000 a day to all its vacancies, Habr Career about 13).
 */
const FRESH_NUMBERS: Record<string, number> = { hh: 230_000, habr: 100 };
/** Days read before the first redone one, for the newest number so far. */
const NUMBER_LOOKBACK_DAYS = 2;
const MIN_BASE_DAYS = 7;
/** A role gets an index of its own from three vacancies a day in the base. */
const ROLE_MIN_BASE = 3;
/** Days redone on each run: late posts of the last days still arrive. */
const REDO_DAYS = 2;

const DAY_MS = 86_400_000;

export function addDays(day: string, n: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

/** One day's records to its rows of counts; posts the model left out are not counted. */
export function aggregateDay(day: string, records: ResearchRecord[], inPanel: (r: ResearchRecord) => boolean = () => false): ResearchDailyRow[] {
  const counts = new Map<string, ResearchDailyRow>();
  for (const r of records) {
    if (r.excluded) continue;
    const key = `${r.type}|${r.platform}|${r.role}|${r.scope}`;
    const row = counts.get(key) ?? { day, type: r.type, platform: r.platform, role: r.role, scope: r.scope, n: 0, panelN: 0 };
    row.n++;
    if (inPanel(r)) row.panelN!++;
    counts.set(key, row);
  }
  return [...counts.values()];
}

async function panelSourceIds(store: Store): Promise<Set<string>> {
  const sources = await store.listSources();
  const ids = PANEL_PRESETS.flatMap((id) => {
    const preset = SOURCE_PRESETS.find((p) => p.id === id);
    const source = preset ? presetSource(preset, sources) : undefined;
    return source ? [source.id] : [];
  });
  return new Set(ids);
}

/** A panel feed saw the post, and it is not an old vacancy raised in search. */
export function isPanelPost(r: ResearchRecord, panel: Set<string>, newest: Map<string, number>): boolean {
  const seen = (r.sourceId !== undefined && panel.has(r.sourceId)) || (r.seenBy ?? []).some((id) => panel.has(id));
  if (!seen) return false;
  if (!r.number) return true;
  return (newest.get(r.number.board) ?? r.number.id) - r.number.id <= (FRESH_NUMBERS[r.number.board] ?? Infinity);
}

function noteNewest(records: ResearchRecord[], newest: Map<string, number>): void {
  for (const r of records) {
    if (r.number && r.number.id > (newest.get(r.number.board) ?? 0)) newest.set(r.number.board, r.number.id);
  }
}

/** Saves the days that are over and not saved yet, and redoes the last few. Returns the days saved. */
export async function ensureDailyCounts(store: Store, now: Date = new Date(), options: DeriveOptions = {}): Promise<string[]> {
  if (!store.saveResearchDaily || !store.lastResearchDay) return [];
  const today = now.toISOString().slice(0, 10);
  const last = await store.lastResearchDay();
  let day = last && last >= PANEL_START ? addDays(last, -REDO_DAYS) : PANEL_START;
  if (day < PANEL_START) day = PANEL_START;
  const saved: string[] = [];
  if (day >= today) return saved;
  const panel = await panelSourceIds(store);
  const newest = new Map<string, number>();
  noteNewest(await researchRecords(store, `${addDays(day, -NUMBER_LOOKBACK_DAYS)}T00:00:00.000Z`, `${day}T00:00:00.000Z`, options), newest);
  for (; day < today && saved.length < 60; day = addDays(day, 1)) {
    const records = await researchRecords(store, `${day}T00:00:00.000Z`, `${addDays(day, 1)}T00:00:00.000Z`, options);
    noteNewest(records, newest);
    await store.saveResearchDaily(day, aggregateDay(day, records.filter((r) => r.date === day), (r) => isPanelPost(r, panel, newest)));
    saved.push(day);
  }
  return saved;
}

export interface IndexPoint {
  date: string;
  count: number;
  /** Mean of the last seven days. */
  avg7?: number;
  /** avg7 against the base, base = 100. */
  index?: number;
}

export interface IndexSeries {
  points: IndexPoint[];
  base?: number;
  latest?: IndexPoint;
  /** Change of the seven-day mean against a week before, in percent. */
  weekChange?: number;
}

export interface RoleIndex {
  slug: string;
  label: string;
  base: number;
  latest?: IndexPoint;
  weekChange?: number;
}

export interface OpenradarIndex {
  version: number;
  updatedAt: string;
  base: { from: string; to: string; provisional: boolean; days: number };
  panel: typeof PANEL;
  jobs: IndexSeries;
  gigs: IndexSeries;
  roles: RoleIndex[];
}

const round1 = (v: number): number => Math.round(v * 10) / 10;

function series(days: string[], counts: Map<string, number>, baseDays: string[]): IndexSeries {
  const values = days.map((d) => counts.get(d) ?? 0);
  const baseValues = baseDays.map((d) => counts.get(d) ?? 0);
  const base = baseValues.length >= MIN_BASE_DAYS ? baseValues.reduce((a, b) => a + b, 0) / baseValues.length : undefined;
  const points: IndexPoint[] = days.map((date, i) => {
    const point: IndexPoint = { date, count: values[i]! };
    if (i >= 6) {
      point.avg7 = round1(values.slice(i - 6, i + 1).reduce((a, b) => a + b, 0) / 7);
      if (base) point.index = round1((point.avg7 / base) * 100);
    }
    return point;
  });
  const latest = points.at(-1);
  const weekAgo = points.at(-8);
  const weekChange = latest?.avg7 && weekAgo?.avg7 ? round1(((latest.avg7 - weekAgo.avg7) / weekAgo.avg7) * 100) : undefined;
  return { points, base: base === undefined ? undefined : round1(base), latest, weekChange };
}

export function buildIndex(rows: ResearchDailyRow[], now: Date = new Date()): OpenradarIndex {
  const today = now.toISOString().slice(0, 10);
  const days: string[] = [];
  for (let d = PANEL_START; d < today; d = addDays(d, 1)) days.push(d);
  // The base is final once November is over; before that, every day so far stands in for it.
  const provisional = today < BASE.to;
  const baseDays = provisional ? days : days.filter((d) => d >= BASE.from && d < BASE.to);

  const panelRows = rows.filter((r) => r.scope === 'ru' && (r.type === 'job' || r.type === 'gig') && (r.panelN ?? 0) > 0);
  const countsOf = (filter: (r: ResearchDailyRow) => boolean): Map<string, number> => {
    const counts = new Map<string, number>();
    for (const r of panelRows) if (filter(r)) counts.set(r.day, (counts.get(r.day) ?? 0) + r.panelN!);
    return counts;
  };

  const roleSlugs = [...new Set(panelRows.filter((r) => r.type === 'job' && r.role !== OTHER_ROLE.slug).map((r) => r.role))];
  const roles: RoleIndex[] = roleSlugs
    .map((slug) => ({ slug, s: series(days, countsOf((r) => r.type === 'job' && r.role === slug), baseDays) }))
    .filter(({ s }) => s.base !== undefined && s.base >= ROLE_MIN_BASE)
    .map(({ slug, s }) => ({ slug, label: roleDef(slug)?.label ?? slug, base: s.base!, latest: s.latest, weekChange: s.weekChange }))
    .sort((a, b) => b.base - a.base);

  return {
    version: INDEX_VERSION,
    updatedAt: now.toISOString(),
    base: { ...BASE, provisional, days: baseDays.length },
    panel: PANEL,
    jobs: series(days, countsOf((r) => r.type === 'job'), baseDays),
    gigs: series(days, countsOf((r) => r.type === 'gig'), baseDays),
    roles,
  };
}

let cached: { at: number; index: OpenradarIndex } | undefined;
const CACHE_MS = 60 * 60_000;

let building: Promise<OpenradarIndex> | undefined;

export function resetIndexCache(): void {
  cached = undefined;
  building = undefined;
}

/** Like the live report: a stale index is served at once while the next one is built. */
export async function openradarIndex(store: Store, now: Date = new Date(), options: DeriveOptions = {}): Promise<OpenradarIndex> {
  if (cached && now.getTime() - cached.at < CACHE_MS) return cached.index;
  building ??= buildOpenradarIndex(store, now, options).finally(() => {
    building = undefined;
  });
  if (cached) {
    building.catch(() => {});
    return cached.index;
  }
  return building;
}

async function buildOpenradarIndex(store: Store, now: Date, options: DeriveOptions): Promise<OpenradarIndex> {
  await ensureDailyCounts(store, now, options);
  const rows = (await store.listResearchDaily?.(PANEL_START, now.toISOString().slice(0, 10))) ?? [];
  const index = buildIndex(rows, now);
  cached = { at: now.getTime(), index };
  return index;
}

export function indexCsv(index: OpenradarIndex): string {
  const lines = ['date,type,count,avg7,index'];
  for (const [type, s] of [['job', index.jobs], ['gig', index.gigs]] as const) {
    for (const p of s.points) lines.push([p.date, type, p.count, p.avg7 ?? '', p.index ?? ''].join(','));
  }
  return `${lines.join('\n')}\n`;
}
