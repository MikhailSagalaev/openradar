import type { Lead } from './types.ts';

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
