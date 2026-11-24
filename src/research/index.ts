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
import { TECH_ROLES } from './report.ts';
import { researchRecords } from './service.ts';

export const INDEX_VERSION = 2;
/** The first day all panel feeds were polled in full. */
export const PANEL_START = '2026-10-30';
/** Four whole weeks after the rules of 0.44 settled make 100; until they are over, the base is provisional. */
export const BASE = { from: '2026-11-09', to: '2026-12-07' };
/** The boards of the Russian-language panel, for the pages. */
export const PANEL: Record<'job' | 'gig', string[]> = {
  job: ['hh.ru', 'career.habr.com', 'getmatch.ru', 'trudvsem.ru'],
  gig: ['kwork.ru', 'fl.ru', 'freelancehunt.com'],
};
/** The boards of the international (English-language & global remote) panel. */
export const INTL_PANEL: Record<'job' | 'gig', string[]> = {
  job: [
    'himalayas.app',
    'arbeitnow.com',
    'justjoin.it',
    'jobicy.com',
    'weworkremotely.com',
    'remoteworker.co.uk',
    'cryptojobslist.com',
    'jobs.ashbyhq.com',
    'job-boards.greenhouse.io',
    'jobs.lever.co',
  ],
  gig: ['freelancer.com'],
};
const RU_PANEL_BOARDS = new Set<string>([...PANEL.job, ...PANEL.gig]);
const INTL_PANEL_BOARDS = new Set<string>([
  ...INTL_PANEL.job,
  ...INTL_PANEL.gig,
  'boards.greenhouse.io',
  'job-boards.eu.greenhouse.io',
]);
/** The feeds of both panels. Other feeds of the same boards do not belong to them. */
const PANEL_PRESETS = [
  'hh-it',
  'hh-remote-project',
  'habr-career',
  'getmatch',
  'trudvsem-remote',
  'kwork-all',
  'fl-all',
  'freelancehunt',
  'himalayas',
  'arbeitnow',
  'jobicy',
  'weworkremotely',
  'remoteworker-uk',
  'cryptojobslist',
  'ats-ashby',
  'ats-greenhouse',
  'ats-lever',
  'freelancer',
];
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
  sharePct?: number;
  latest?: IndexPoint;
  weekChange?: number;
  recentCounts?: number[];
}

export interface PlatformIndex {
  platform: string;
  type: 'job' | 'gig';
  base: number;
  latest?: IndexPoint;
  weekChange?: number;
}

export interface WeekdayPoint {
  /** 1 = Mon ... 7 = Sun */
  isoDay: number;
  label: string;
  labelEn: string;
  jobAvg: number;
  gigAvg: number;
  jobPctOfMean: number;
  gigPctOfMean: number;
}

export interface MarketSubIndex {
  panel: typeof PANEL;
  jobs: IndexSeries;
  itJobs?: IndexSeries;
  gigs: IndexSeries;
  roles: RoleIndex[];
  byPlatform: PlatformIndex[];
  weekdayProfile: WeekdayPoint[];
}

export interface OpenradarIndex {
  version: number;
  updatedAt: string;
  base: { from: string; to: string; provisional: boolean; days: number };
  panel: typeof PANEL;
  jobs: IndexSeries;
  itJobs?: IndexSeries;
  gigs: IndexSeries;
  roles: RoleIndex[];
  byPlatform?: PlatformIndex[];
  weekdayProfile?: WeekdayPoint[];
  /** International (global & remote English-language) market index. */
  intl?: MarketSubIndex;
}

const round1 = (v: number): number => Math.round(v * 10) / 10;

/**
 * Computes 7-day rolling averages and index series.
 * Single-day pre-base feed onboarding spikes (> 2.5x the series median before BASE.from)
 * are Winsorized in the rolling mean so initial feed backfill bursts do not create artificial
 * -70% crashes seven days later when exiting the window, while raw daily counts stay untouched.
 */
function series(days: string[], counts: Map<string, number>, baseDays: string[]): IndexSeries {
  const rawValues = days.map((d) => counts.get(d) ?? 0);
  const pos = [...rawValues].filter((v) => v > 0).sort((a, b) => a - b);
  const med = pos.length >= MIN_BASE_DAYS ? pos[Math.floor(pos.length / 2)]! : undefined;
  const spikeThreshold = med !== undefined ? med * 2.2 : Infinity;
  const smoothedInput = days.map((d, i) => (d < BASE.from && rawValues[i]! > spikeThreshold ? med! : rawValues[i]!));
  const baseIndexByDay = new Map(days.map((d, i) => [d, smoothedInput[i]!]));
  const baseValues = baseDays.map((d) => baseIndexByDay.get(d) ?? counts.get(d) ?? 0);
  const base = baseValues.length >= MIN_BASE_DAYS ? baseValues.reduce((a, b) => a + b, 0) / baseValues.length : undefined;
  const points: IndexPoint[] = days.map((date, i) => {
    const point: IndexPoint = { date, count: rawValues[i]! };
    if (i >= 6) {
      point.avg7 = round1(smoothedInput.slice(i - 6, i + 1).reduce((a, b) => a + b, 0) / 7);
      if (base) point.index = round1((point.avg7 / base) * 100);
    }
    return point;
  });
  const latest = points.at(-1);
  const weekAgo = points.at(-8);
  const weekChange = latest?.avg7 && weekAgo?.avg7 ? round1(((latest.avg7 - weekAgo.avg7) / weekAgo.avg7) * 100) : undefined;
  return { points, base: base === undefined ? undefined : round1(base), latest, weekChange };
}

const WEEKDAYS_RU = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const WEEKDAYS_EN = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function buildWeekdayProfile(days: string[], jobCounts: Map<string, number>, gigCounts: Map<string, number>): WeekdayPoint[] {
  if (days.length < MIN_BASE_DAYS) return [];
  const buckets = Array.from({ length: 7 }, (_, i) => ({
    isoDay: i + 1,
    label: WEEKDAYS_RU[i]!,
    labelEn: WEEKDAYS_EN[i]!,
    jobs: [] as number[],
    gigs: [] as number[],
  }));
  for (const d of days) {
    const utcDay = new Date(`${d}T12:00:00Z`).getUTCDay();
    const idx = (utcDay + 6) % 7;
    buckets[idx]!.jobs.push(jobCounts.get(d) ?? 0);
    buckets[idx]!.gigs.push(gigCounts.get(d) ?? 0);
  }
  const avg = (arr: number[]): number => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
  const overallJobMean = avg(days.map((d) => jobCounts.get(d) ?? 0));
  const overallGigMean = avg(days.map((d) => gigCounts.get(d) ?? 0));
  return buckets.map((b) => {
    const jobAvg = round1(avg(b.jobs));
    const gigAvg = round1(avg(b.gigs));
    return {
      isoDay: b.isoDay,
      label: b.label,
      labelEn: b.labelEn,
      jobAvg,
      gigAvg,
      jobPctOfMean: overallJobMean > 0 ? Math.round((jobAvg / overallJobMean) * 100) : 0,
      gigPctOfMean: overallGigMean > 0 ? Math.round((gigAvg / overallGigMean) * 100) : 0,
    };
  });
}

export function buildIndex(rows: ResearchDailyRow[], now: Date = new Date()): OpenradarIndex {
  const today = now.toISOString().slice(0, 10);
  const days: string[] = [];
  for (let d = PANEL_START; d < today; d = addDays(d, 1)) days.push(d);
  // The base is final once November is over; before that, every day so far stands in for it.
  const provisional = today < BASE.to;
  const baseDays = provisional ? days : days.filter((d) => d >= BASE.from && d < BASE.to);

  const panelRows = rows.filter((r) => r.scope === 'ru' && (r.type === 'job' || r.type === 'gig') && RU_PANEL_BOARDS.has(r.platform) && (r.panelN ?? 0) > 0);
  const countsOf = (filter: (r: ResearchDailyRow) => boolean): Map<string, number> => {
    const counts = new Map<string, number>();
    for (const r of panelRows) if (filter(r)) counts.set(r.day, (counts.get(r.day) ?? 0) + r.panelN!);
    return counts;
  };

  const jobCounts = countsOf((r) => r.type === 'job');
  const gigCounts = countsOf((r) => r.type === 'gig');
  const jobsSeries = series(days, jobCounts, baseDays);
  const itJobsSeries = series(days, countsOf((r) => r.type === 'job' && TECH_ROLES.has(r.role)), baseDays);
  const gigsSeries = series(days, gigCounts, baseDays);
  const totalJobBase = jobsSeries.base ?? 0;

  const roleSlugs = [...new Set(panelRows.filter((r) => r.type === 'job' && r.role !== OTHER_ROLE.slug).map((r) => r.role))];
  const roles: RoleIndex[] = roleSlugs
    .map((slug) => ({ slug, s: series(days, countsOf((r) => r.type === 'job' && r.role === slug), baseDays) }))
    .filter(({ s }) => s.base !== undefined && s.base >= ROLE_MIN_BASE)
    .map(({ slug, s }) => ({
      slug,
      label: roleDef(slug)?.label ?? slug,
      base: s.base!,
      sharePct: totalJobBase > 0 ? round1((s.base! / totalJobBase) * 100) : undefined,
      latest: s.latest,
      weekChange: s.weekChange,
      recentCounts: s.points.slice(-7).map((p) => p.count),
    }))
    .sort((a, b) => b.base - a.base);

  const platformKeys = [...new Set(panelRows.map((r) => `${r.type}|${r.platform}`))];
  const byPlatform: PlatformIndex[] = platformKeys
    .map((key) => {
      const [type, platform] = key.split('|') as ['job' | 'gig', string];
      const s = series(days, countsOf((r) => r.type === type && r.platform === platform), baseDays);
      return { platform, type, s };
    })
    .filter(({ s }) => s.base !== undefined && s.base >= 0.5)
    .map(({ platform, type, s }) => ({
      platform,
      type,
      base: s.base!,
      latest: s.latest,
      weekChange: s.weekChange,
    }))
    .sort((a, b) => (a.type === b.type ? b.base - a.base : a.type === 'job' ? -1 : 1));

  // International panel: uses panelN when present, or n on dedicated international reference boards
  // so historical daily rows saved before international presets joined PANEL_PRESETS are preserved seamlessly.
  const intlRows = rows.filter(
    (r) =>
      r.scope === 'intl' &&
      (r.type === 'job' || r.type === 'gig') &&
      INTL_PANEL_BOARDS.has(r.platform) &&
      ((r.panelN ?? 0) > 0 || r.n > 0),
  );
  const intlVal = (r: ResearchDailyRow): number => ((r.panelN ?? 0) > 0 ? r.panelN! : r.n);
  const intlPlatformKey = (platform: string): string =>
    platform === 'boards.greenhouse.io' || platform === 'job-boards.eu.greenhouse.io'
      ? 'job-boards.greenhouse.io'
      : platform;
  const intlCountsOf = (filter: (r: ResearchDailyRow) => boolean): Map<string, number> => {
    const counts = new Map<string, number>();
    for (const r of intlRows) if (filter(r)) counts.set(r.day, (counts.get(r.day) ?? 0) + intlVal(r));
    return counts;
  };
  const intlJobCounts = intlCountsOf((r) => r.type === 'job');
  const intlGigCounts = intlCountsOf((r) => r.type === 'gig');
  const intlJobsSeries = series(days, intlJobCounts, baseDays);
  const intlItJobsSeries = series(days, intlCountsOf((r) => r.type === 'job' && TECH_ROLES.has(r.role)), baseDays);
  const intlGigsSeries = series(days, intlGigCounts, baseDays);
  const intlTotalJobBase = intlJobsSeries.base ?? 0;

  const intlRoleSlugs = [...new Set(intlRows.filter((r) => r.type === 'job' && r.role !== OTHER_ROLE.slug).map((r) => r.role))];
  const intlRoles: RoleIndex[] = intlRoleSlugs
    .map((slug) => ({ slug, s: series(days, intlCountsOf((r) => r.type === 'job' && r.role === slug), baseDays) }))
    .filter(({ s }) => s.base !== undefined && s.base >= ROLE_MIN_BASE)
    .map(({ slug, s }) => ({
      slug,
      label: roleDef(slug)?.label ?? slug,
      base: s.base!,
      sharePct: intlTotalJobBase > 0 ? round1((s.base! / intlTotalJobBase) * 100) : undefined,
      latest: s.latest,
      weekChange: s.weekChange,
      recentCounts: s.points.slice(-7).map((p) => p.count),
    }))
    .sort((a, b) => b.base - a.base);

  const intlPlatformKeys = [...new Set(intlRows.map((r) => `${r.type}|${intlPlatformKey(r.platform)}`))];
  const intlByPlatform: PlatformIndex[] = intlPlatformKeys
    .map((key) => {
      const [type, platform] = key.split('|') as ['job' | 'gig', string];
      const s = series(days, intlCountsOf((r) => r.type === type && intlPlatformKey(r.platform) === platform), baseDays);
      return { platform, type, s };
    })
    .filter(({ s }) => s.base !== undefined && s.base >= 0.5)
    .map(({ platform, type, s }) => ({
      platform,
      type,
      base: s.base!,
      latest: s.latest,
      weekChange: s.weekChange,
    }))
    .sort((a, b) => (a.type === b.type ? b.base - a.base : a.type === 'job' ? -1 : 1));

  return {
    version: INDEX_VERSION,
    updatedAt: now.toISOString(),
    base: { ...BASE, provisional, days: baseDays.length },
    panel: PANEL,
    jobs: jobsSeries,
    itJobs: itJobsSeries,
    gigs: gigsSeries,
    roles,
    byPlatform,
    weekdayProfile: buildWeekdayProfile(days, jobCounts, gigCounts),
    intl: {
      panel: INTL_PANEL,
      jobs: intlJobsSeries,
      itJobs: intlItJobsSeries,
      gigs: intlGigsSeries,
      roles: intlRoles,
      byPlatform: intlByPlatform,
      weekdayProfile: buildWeekdayProfile(days, intlJobCounts, intlGigCounts),
    },
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
  const streams: Array<[string, IndexSeries]> = [['job', index.jobs], ['gig', index.gigs]];
  if (index.intl?.jobs.points.some((p) => p.count > 0)) streams.push(['intl-job', index.intl.jobs]);
  if (index.intl?.gigs.points.some((p) => p.count > 0)) streams.push(['intl-gig', index.intl.gigs]);
  for (const [type, s] of streams) {
    for (const p of s.points) lines.push([p.date, type, p.count, p.avg7 ?? '', p.index ?? ''].join(','));
  }
  return `${lines.join('\n')}\n`;
}
