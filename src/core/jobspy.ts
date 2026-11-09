import type { Lead, LeadType } from './types.ts';

/**
 * JobSpy-compatible CSV export. Column names follow the JobSpy dataframe
 * (https://github.com/speedyapply/JobSpy) so existing pandas pipelines read
 * openradar data without changes; CURRENCY, POSTED_AT and PAYMENT_PERIOD are
 * extra columns JobSpy does not carry.
 *
 * The amounts stay in the lead's own currency (JobSpy semantics), not the
 * USD-normalised ones. Contacts are never exported.
 */
export const JOBSPY_COLUMNS = [
  'SITE', 'TITLE', 'COMPANY', 'DESCRIPTION', 'LOCATION', 'JOB_TYPE',
  'INTERVAL', 'MIN_AMOUNT', 'MAX_AMOUNT', 'CURRENCY', 'JOB_URL', 'POSTED_AT',
] as const;

const MAX_DESCRIPTION = 1_500;

export interface JobspyFilterOptions {
  /** Filter by SITE slug (e.g. "telegram", "kwork", "hh") or sourceId. */
  source?: string;
  /** Filter by lead type: "job" (vacancy) or "gig" (freelance order). */
  type?: LeadType | string;
  /** Relative window ("24h", "7d", "30d") or an ISO date string / Date. */
  since?: string | Date;
  /** Reference clock for relative `since` windows (defaults to now). */
  now?: Date;
}

/**
 * Parses a relative window ("24h", "7d", "30d") or an ISO date into a UTC
 * timestamp (ms). Returns undefined when empty, or NaN when malformed.
 */
export function parseExportSince(since?: string | Date, now: Date = new Date()): number | undefined {
  if (since === undefined || since === null) return undefined;
  if (since instanceof Date) return since.getTime();
  const raw = since.trim();
  if (!raw) return undefined;
  const rel = raw.match(/^(\d{1,4})\s*([hdw])$/i);
  if (rel) {
    const n = Number(rel[1]);
    const unit = rel[2]!.toLowerCase();
    const hours = unit === 'w' ? n * 24 * 7 : unit === 'd' ? n * 24 : n;
    return now.getTime() - hours * 3_600_000;
  }
  return Date.parse(raw);
}

/**
 * Filters leads before export by `--source` (SITE slug or sourceId),
 * `--type` (`job` | `gig`), and `--since` (against `publishedAt ?? createdAt`).
 */
export function filterJobspyLeads(
  leads: Lead[],
  siteOf: (lead: Lead) => string,
  options: JobspyFilterOptions = {},
): Lead[] {
  const wantedSource = options.source?.trim().toLowerCase();
  const wantedType = options.type?.trim().toLowerCase();
  const sinceMs = parseExportSince(options.since, options.now);

  return leads.filter((lead) => {
    if (wantedType) {
      const leadType = lead.type ?? 'gig';
      if (leadType !== wantedType) return false;
    }
    if (wantedSource) {
      const slug = siteOf(lead).toLowerCase();
      const sourceId = (lead.sourceId ?? '').toLowerCase();
      if (slug !== wantedSource && sourceId !== wantedSource) return false;
    }
    if (sinceMs !== undefined && Number.isFinite(sinceMs)) {
      const ts = Date.parse(lead.publishedAt || lead.createdAt || '');
      if (!Number.isFinite(ts) || ts < sinceMs) return false;
    }
    return true;
  });
}

function cell(value: unknown): string {
  const text = String(value ?? '');
  // A leading = + - @ (or a tab/CR) would run as a spreadsheet formula.
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`;
}

function intervalOf(lead: Lead): string {
  if (lead.paymentPeriod === 'monthly') return 'monthly';
  if (lead.paymentPeriod === 'hourly') return 'hourly';
  return '';
}

function jobTypeOf(lead: Lead): string {
  // openradar only knows the order/vacancy split; leave the rest to the reader.
  return lead.type === 'job' ? 'fulltime' : '';
}

/** One CSV row per lead, in the JobSpy column order. */
export function jobspyRow(lead: Lead, site: string): string {
  const amount = typeof lead.budget === 'number' && lead.budget > 0 ? String(Math.round(lead.budget)) : '';
  const location = lead.city ?? (lead.isRemote !== false ? 'Remote' : '');
  return [
    site,
    lead.title,
    lead.author ?? '',
    lead.text.slice(0, MAX_DESCRIPTION),
    location,
    jobTypeOf(lead),
    intervalOf(lead),
    amount,
    amount,
    lead.currency ?? '',
    lead.canonicalUrl || lead.url || '',
    lead.publishedAt || lead.createdAt || '',
  ].map(cell).join(',');
}

/** A whole CSV document, BOM included so Excel reads UTF-8 correctly. */
export function jobspyCsv(leads: Lead[], siteOf: (lead: Lead) => string): string {
  const rows = leads.map((lead) => jobspyRow(lead, siteOf(lead)));
  return '\uFEFF' + [JOBSPY_COLUMNS.join(','), ...rows].join('\r\n') + '\r\n';
}

/** SITE slug: the radar/2 platform when known, otherwise the source kind. */
export function siteSlugFor(lead: Lead, kindById: Map<string, string>): string {
  const platform = lead.sourceRef?.platform?.trim().toLowerCase();
  if (platform) return platform.replace(/[^a-z0-9_.-]/g, '_');
  const kind = kindById.get(lead.sourceId)?.toLowerCase();
  return kind ? kind.replace(/[^a-z0-9_.-]/g, '_') : 'openradar';
}
