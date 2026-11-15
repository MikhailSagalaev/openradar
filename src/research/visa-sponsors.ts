import { normalizeCompany } from '../core/company.ts';
import type { Store } from '../core/store.ts';
import type { Env, Lead, Logger } from '../core/types.ts';
import { readTextLimited } from '../net/body.ts';

/**
 * Visa sponsorship from the UK government's public register (plan 021D).
 *
 * The Home Office publishes every organisation holding a Worker / Temporary Worker
 * sponsor licence, refreshed daily under the Open Government Licence v3.0:
 * https://www.gov.uk/government/publications/register-of-licensed-sponsors-workers
 *
 * A vacancy whose employer is on the register gets a `visaSponsor` note — a fact about
 * the licence, NOT a promise that this particular role is sponsored. Employers absent
 * from the register get no note at all: absence proves nothing (a sponsor may hold its
 * licence under another legal name), and openradar never guesses a negative.
 */

export const UK_SPONSOR_PAGE = 'https://www.gov.uk/government/publications/register-of-licensed-sponsors-workers';
/** The register ships tens of megabytes; the reader streams it and never buffers the rest. */
const MAX_CSV_BYTES = 60 * 1024 * 1024;
/** The publisher updates the file daily; twice a day is polite and fresh enough. */
export const SPONSOR_REFRESH_MS = 12 * 60 * 60 * 1000;
/** A fetch that failed is retried no sooner than this. */
const RETRY_AFTER_MS = 60 * 60 * 1000;
/** The register lists ~140k organisations; a larger file is not the register. */
const MAX_ROWS = 400_000;

/** One employer of the register, as the note stores it. */
export interface VisaSponsorInfo {
  /** Which register matched: today only the UK worker register. */
  register: 'uk';
  /** The organisation's name exactly as the register spells it. */
  name: string;
  /** The licence route, e.g. "Skilled Worker". */
  route?: string;
  /** The town/city the register gives, when it gives one. */
  city?: string;
  /** The register edition (the date inside the CSV file name), when readable. */
  registerDate?: string;
  /** When this note was matched. */
  checkedAt: string;
}

/** The note stored in `lead.metadata.visaSponsor`. */
export interface VisaSponsorNote extends VisaSponsorInfo {
  /** Where the employer name came from: the post itself or the board that owns the feed. */
  matched: 'employer' | 'board';
}

export interface SponsorIndex {
  /** Normalised organisation name → the first register row of that name. */
  byKey: Map<string, VisaSponsorInfo>;
  rows: number;
  /** YYYY-MM-DD read from the attachment file name, when present. */
  registerDate?: string;
  fetchedAt: string;
}

/**
 * "Roofoods Ltd t/a Deliveroo" is one licence holder trading under two names: the
 * register's own readers look for "Deliveroo", so the trading name, the legal name
 * and the full row all index to the same licence.
 */
export function registerNameVariants(raw: string): string[] {
  const name = raw.trim();
  const variants = [name];
  const trading = /\bt\/a\s+(.+)$/i.exec(name) ?? /\btrading\s+as\s+(.+)$/i.exec(name);
  if (trading?.[1]) {
    variants.push(trading[1]);
    const base = name.slice(0, trading.index).trim();
    if (base) variants.push(base);
  }
  return variants;
}

/** One CSV record split on commas outside quotes; doubled quotes become one. */
export function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
      } else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { cells.push(cell); cell = ''; }
    else cell += ch;
  }
  cells.push(cell);
  return cells;
}

/**
 * Builds the index from the register's CSV text. The header names the columns, so a
 * reordered register still parses; the first row of a name wins (same licence, several
 * routes) and every "t/a" trading name gets its own key.
 */
export function buildSponsorIndex(csv: string, meta: { registerDate?: string; fetchedAt: string }): SponsorIndex {
  const byKey = new Map<string, VisaSponsorInfo>();
  let rows = 0;
  let header: string[] | null = null;
  let nameAt = 0;
  let cityAt = 1;
  let routeAt = 4;
  for (const line of csv.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const cells = parseCsvLine(line);
    if (!header) {
      header = cells.map((c) => c.trim().toLowerCase());
      nameAt = Math.max(0, header.indexOf('organisation name'));
      cityAt = header.findIndex((c) => c.startsWith('town'));
      routeAt = header.indexOf('route');
      continue;
    }
    if (++rows > MAX_ROWS) break;
    const rawName = cells[nameAt]?.trim();
    if (!rawName) continue;
    const route = routeAt >= 0 ? cells[routeAt]?.trim() : undefined;
    const city = cityAt >= 0 ? cells[cityAt]?.trim() : undefined;
    const info: VisaSponsorInfo = {
      register: 'uk',
      name: rawName,
      ...(route ? { route } : {}),
      ...(city ? { city } : {}),
      ...(meta.registerDate ? { registerDate: meta.registerDate } : {}),
      checkedAt: meta.fetchedAt,
    };
    for (const variant of registerNameVariants(rawName)) {
      const key = normalizeCompany(variant);
      if (key && !byKey.has(key)) byKey.set(key, info);
    }
  }
  return { byKey, rows, ...(meta.registerDate ? { registerDate: meta.registerDate } : {}), fetchedAt: meta.fetchedAt };
}

/** Looks one employer name up in the index, trading names included. */
export function lookupSponsor(index: SponsorIndex, employer: string): VisaSponsorInfo | undefined {
  for (const variant of registerNameVariants(employer)) {
    const key = normalizeCompany(variant);
    if (key) {
      const hit = index.byKey.get(key);
      if (hit) return hit;
    }
  }
  return undefined;
}

/** The attachment URL and its edition date from the publication page. */
export function sponsorCsvLink(html: string, pageUrl: string): { url: string; registerDate?: string } | undefined {
  const links = [...html.matchAll(/href="([^"]+\.csv)"/gi)].map((m) => m[1]!);
  const preferred = links.find((l) => /register/i.test(l) && !l.startsWith('/csv-preview')) ?? links.find((l) => !l.startsWith('/csv-preview')) ?? links[0];
  if (!preferred) return undefined;
  const url = new URL(preferred.replace(/&amp;/g, '&'), pageUrl).toString();
  const date = /(\d{4}-\d{2}-\d{2})/.exec(url)?.[1];
  return { url, ...(date ? { registerDate: date } : {}) };
}

export interface VisaSponsorDeps {
  store: Store;
  env: Env;
  logger: Logger;
  fetchImpl: typeof fetch;
}

interface CacheState {
  index?: SponsorIndex;
  /** The last download attempt, successful or not: failures back off an hour. */
  attemptedAt: number;
}

const caches = new WeakMap<Store, CacheState>();

/**
 * Reads the register at most once per refresh window. A failure keeps the previous
 * index (a stale licence list still beats none) and retries no sooner than an hour.
 */
export async function ensureSponsorIndex(deps: VisaSponsorDeps, now: Date = new Date()): Promise<SponsorIndex | undefined> {
  const state = caches.get(deps.store) ?? { attemptedAt: 0 };
  caches.set(deps.store, state);
  const fresh = state.index && now.getTime() - Date.parse(state.index.fetchedAt) < SPONSOR_REFRESH_MS;
  if (fresh) return state.index;
  if (now.getTime() - state.attemptedAt < RETRY_AFTER_MS) return state.index;
  state.attemptedAt = now.getTime();
  try {
    const headers = { 'User-Agent': deps.env.RADAR_USER_AGENT, Accept: 'text/html,text/csv;q=0.9,*/*;q=0.8' };
    const page = await deps.fetchImpl(UK_SPONSOR_PAGE, { headers, signal: AbortSignal.timeout(deps.env.RADAR_HTTP_TIMEOUT_MS) });
    if (!page.ok) throw new Error(`publication page answered ${page.status}`);
    const link = sponsorCsvLink(await page.text(), UK_SPONSOR_PAGE);
    if (!link) throw new Error('no CSV attachment on the publication page');
    const csv = await deps.fetchImpl(link.url, { headers, signal: AbortSignal.timeout(Math.max(deps.env.RADAR_HTTP_TIMEOUT_MS, 60_000)) });
    if (!csv.ok) throw new Error(`register answered ${csv.status}`);
    const text = await readTextLimited(csv, MAX_CSV_BYTES);
    const index = buildSponsorIndex(text, { fetchedAt: now.toISOString(), ...(link.registerDate ? { registerDate: link.registerDate } : {}) });
    if (index.byKey.size < 1000) throw new Error(`register too small: ${index.byKey.size} names`);
    state.index = index;
    deps.logger.info('UK sponsor register read', { names: index.byKey.size, rows: index.rows, registerDate: index.registerDate });
    return index;
  } catch (error) {
    deps.logger.warn('UK sponsor register not read', { error: error instanceof Error ? error.message : String(error) });
    return state.index;
  }
}

/** The employer a lead names: the post's own company, else the board that owns the feed. */
function employerOfLead(lead: Lead, sourceTitle?: string): { name: string; matched: 'employer' | 'board' } | undefined {
  const own = lead.company?.trim();
  if (own) return { name: own, matched: 'employer' };
  const board = sourceTitle?.trim();
  if (board) return { name: board, matched: 'board' };
  return undefined;
}

export interface VisaSponsorSummary {
  checked: number;
  matched: number;
}

/**
 * Matches the employers of recent vacancies against the register and stores the note
 * in `metadata.visaSponsor`. Jobs only, recent only, and only leads not matched yet —
 * the register changes daily, so a lead unmatched today is tried again tomorrow.
 */
export async function runVisaSponsors(
  deps: VisaSponsorDeps,
  options: { limit?: number; sinceDays?: number; now?: Date } = {},
): Promise<VisaSponsorSummary> {
  const summary: VisaSponsorSummary = { checked: 0, matched: 0 };
  if (!deps.store.saveLeadVisaSponsor) return summary;
  const index = await ensureSponsorIndex(deps, options.now);
  if (!index) return summary;
  const now = options.now ?? new Date();
  const since = new Date(now.getTime() - (options.sinceDays ?? 14) * 24 * 60 * 60 * 1000).toISOString();
  const leads = await deps.store.listLeads({ type: 'job', createdAfter: since, limit: options.limit ?? 500 });
  const sources = new Map((await deps.store.listSources()).map((s) => [s.id, s.title]));
  for (const lead of leads) {
    if ((lead.metadata as Record<string, unknown> | undefined)?.visaSponsor) continue;
    const employer = employerOfLead(lead, sources.get(lead.sourceId));
    if (!employer) continue;
    summary.checked++;
    const hit = lookupSponsor(index, employer.name);
    if (!hit) continue;
    await deps.store.saveLeadVisaSponsor(lead.id, { ...hit, matched: employer.matched });
    summary.matched++;
  }
  return summary;
}
