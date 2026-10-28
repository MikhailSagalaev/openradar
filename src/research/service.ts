/**
 * Builds reports from the store: the live one over the last 30 days (cached for a while)
 * and frozen monthly snapshots, saved once the month is over.
 */
import type { Store } from '../core/store.ts';
import { deriveRecord, type ResearchRecord } from './derive.ts';
import { MONTHS_GEN, buildReport, livePeriod, monthPeriod, REPORT_VERSION, type Report } from './report.ts';

const MAX_LEADS = 100_000;
const LIVE_DAYS = 30;
const CACHE_MS = 15 * 60_000;
/** A month with fewer vacancies than this gets no report of its own. */
const MIN_MONTH_JOBS = 300;

export async function researchRecords(store: Store, from: string, to: string): Promise<ResearchRecord[]> {
  if (!store.listLeadsForResearch) return [];
  const leads = await store.listLeadsForResearch({ from, to, limit: MAX_LEADS });
  return leads.map(deriveRecord);
}

let cached: { at: number; report: Report; records: ResearchRecord[] } | undefined;

export function resetResearchCache(): void {
  cached = undefined;
}

export async function liveReport(store: Store, now: Date = new Date()): Promise<{ report: Report; records: ResearchRecord[] }> {
  if (cached && now.getTime() - cached.at < CACHE_MS) return cached;
  const period = livePeriod(now, LIVE_DAYS);
  const records = await researchRecords(store, period.from, period.to);
  // The base is younger than the window: say from when the data really starts.
  const first = records.reduce<string | undefined>((min, r) => (!min || r.date < min ? r.date : min), undefined);
  if (first && first > period.from.slice(0, 10)) {
    const clamped = livePeriod(now, Math.max(1, Math.ceil((now.getTime() - Date.parse(`${first}T00:00:00Z`)) / 86_400_000)));
    period.label = clamped.label;
    period.from = `${first}T00:00:00.000Z`;
  }
  const report = buildReport(records, period, 'live', now);
  cached = { at: now.getTime(), report, records };
  return cached;
}

export function previousMonth(now: Date): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export async function buildMonthReport(store: Store, slug: string, now: Date = new Date()): Promise<Report> {
  const period = monthPeriod(slug);
  const records = await researchRecords(store, period.from, period.to);
  // A month the base did not cover from its first day says which days it covers.
  const first = records.reduce<string | undefined>((min, r) => (!min || r.date < min ? r.date : min), undefined);
  if (first && first > period.from.slice(0, 10)) {
    const last = new Date(Date.parse(period.to) - 86_400_000);
    const day = (iso: string): number => Number(iso.slice(8, 10));
    const month = MONTHS_GEN[last.getUTCMonth()]!;
    period.from = `${first}T00:00:00.000Z`;
    period.label = `${period.label} (с ${day(first)} ${month})`;
    period.phrase = `с ${day(first)} по ${last.getUTCDate()} ${month} ${last.getUTCFullYear()} года`;
  }
  return buildReport(records, period, 'month', now);
}

/** Saves last month's report once; returns the period when a new snapshot was made. */
export async function ensureMonthlySnapshot(store: Store, now: Date = new Date()): Promise<string | undefined> {
  if (!store.getResearchSnapshot || !store.saveResearchSnapshot) return undefined;
  const slug = previousMonth(now);
  if (await store.getResearchSnapshot(slug)) return undefined;
  const report = await buildMonthReport(store, slug, now);
  if (report.totals.jobs < MIN_MONTH_JOBS) return undefined;
  await store.saveResearchSnapshot(slug, report);
  return slug;
}

export async function monthSnapshot(store: Store, slug: string): Promise<Report | undefined> {
  const saved = await store.getResearchSnapshot?.(slug);
  const report = saved?.report as Report | undefined;
  return report && report.version <= REPORT_VERSION ? report : undefined;
}

const CSV_COLUMNS = [
  'id', 'date', 'type', 'platform', 'role', 'grade', 'language', 'region', 'remote', 'company',
  'pay_min_rub', 'pay_max_rub', 'pay_rub', 'pay_period', 'currency', 'pay_origin', 'ai_mention', 'skills',
] as const;

function csvCell(value: unknown): string {
  if (value === undefined || value === null) return '';
  const text = Array.isArray(value) ? value.join(';') : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * Derived fields only: no post text and no contacts, so the dataset carries the
 * figures and not the boards' content. The newest day is held back like the guest feed.
 */
export function datasetCsv(records: ResearchRecord[], now: Date = new Date()): string {
  const cutoff = new Date(now.getTime() - 86_400_000).toISOString().slice(0, 10);
  const rows = records
    .filter((r) => r.date < cutoff)
    .map((r) => [
      r.id, r.date, r.type, r.platform, r.role, r.grade, r.language, r.region, r.remote ? 1 : 0, r.company,
      r.payMin, r.payMax, r.pay, r.payPeriod, r.currency, r.payOrigin, r.ai ? 1 : 0, r.skills,
    ].map(csvCell).join(','));
  return `${CSV_COLUMNS.join(',')}\n${rows.join('\n')}\n`;
}
