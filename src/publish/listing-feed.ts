/**
 * Public listing feed (plan 021F): OpenRadar becomes the feed others ingest — the reverse of
 * plan 019. A daily JSON + Markdown artifact of fresh vacancies and orders, every row linking
 * to the ORIGINAL employer post (ethic-aligned, unlike a tracking redirect).
 *
 * The rows come from the node's own public guest projection (`/v2/feed`), so contacts are
 * already redacted by the server. This module never sees raw contacts; it additionally drops
 * any row that still carries a contact-looking field, so a misconfigured node cannot leak
 * guest-redacted data into a public artifact (the plan's STOP condition).
 *
 * Pure functions only: no network, no store, no clock of their own — the caller passes `now`.
 */

/** One row of the public feed, as the guest projection gives it (contacts already removed). */
export interface PublicLeadRow {
  id?: string;
  type?: string;
  title?: string;
  url?: string;
  canonicalUrl?: string;
  author?: string;
  city?: string;
  isRemote?: boolean;
  workplaceType?: string;
  rawSalary?: string;
  budget?: number;
  currency?: string;
  skills?: string[];
  publishedAt?: string;
  createdAt?: string;
  direction?: string;
  visaSponsor?: { name?: string; route?: string; register?: string };
  [key: string]: unknown;
}

/** A listing as published: original link, pay, place, freshness — no contacts, no internals. */
export interface Listing {
  id: string;
  type: 'job' | 'gig';
  title: string;
  /** The ORIGINAL employer post. Never a tracking redirect. */
  url: string;
  company?: string;
  city?: string;
  remote: boolean;
  salary?: string;
  skills: string[];
  direction?: string;
  publishedAt?: string;
  /** Days since the source published it (or since first seen when the source gave no date). */
  ageDays: number;
  /** Age-based inactive threshold (Simplify/Jobbie idea): past it, the row is marked stale. */
  stale: boolean;
  visaSponsor?: string;
}

export interface ListingFeedOptions {
  now: Date;
  /** Rows older than this are marked stale (still listed, flagged). Default 30 days. */
  maxAgeDays?: number;
  /** Hard drop rows older than this. Default 60 days. */
  dropAfterDays?: number;
  /** Cap the published rows. Default 1000. */
  limit?: number;
  /** Only these types (default both). */
  types?: Array<'job' | 'gig'>;
}

const DAY_MS = 86_400_000;

/** Contact-looking fields that must never reach a public artifact. */
const CONTACT_KEYS = ['contacts', 'contact', 'email', 'phone', 'telegram', 'whatsapp'];
// An email, a WhatsApp link, a phone number, or a personal Telegram handle (t.me/user with no
// post id). A channel post link (t.me/channel/123) is the ORIGINAL source, not a contact.
const CONTACT_IN_TEXT = /(?:[\w.+-]+@[\w-]+\.[\w.]{2,}|wa\.me\/|\+\d[\d\s()-]{7,}|t\.me\/(?!s\/)[A-Za-z0-9_]+(?![\w/]))/i;

/** True when a row still carries contact data: such a row is dropped, never published. */
export function hasContactLeak(row: PublicLeadRow): boolean {
  for (const key of CONTACT_KEYS) {
    const value = row[key];
    if (Array.isArray(value) && value.length > 0) return true;
    if (typeof value === 'string' && value.trim()) return true;
  }
  // The projection redacts contacts from text, but a stray handle in the title is still a leak.
  if (typeof row.title === 'string' && CONTACT_IN_TEXT.test(row.title)) return true;
  // A personal handle offered as the "original" link is a contact, not a source post.
  const url = originalUrl(row);
  if (url && CONTACT_IN_TEXT.test(url)) return true;
  return false;
}

/** The original post URL: the canonical employer address, never an aggregator redirect. */
export function originalUrl(row: PublicLeadRow): string | undefined {
  const url = (row.canonicalUrl || row.url || '').trim();
  if (!/^https?:\/\//i.test(url)) return undefined;
  return url;
}

function ageDaysOf(row: PublicLeadRow, now: Date): number {
  const at = Date.parse(row.publishedAt || row.createdAt || '');
  if (Number.isNaN(at)) return 0;
  return Math.max(0, Math.floor((now.getTime() - at) / DAY_MS));
}

/** Builds the published listings from public rows: fresh first, originals only, no contacts. */
export function buildListings(rows: PublicLeadRow[], options: ListingFeedOptions): Listing[] {
  const maxAge = options.maxAgeDays ?? 30;
  const dropAfter = options.dropAfterDays ?? 60;
  const limit = options.limit ?? 1000;
  const types = new Set(options.types ?? ['job', 'gig']);
  const listings: Listing[] = [];
  for (const row of rows) {
    const type = row.type === 'job' ? 'job' : row.type === 'gig' ? 'gig' : undefined;
    if (!type || !types.has(type)) continue;
    const url = originalUrl(row);
    const title = typeof row.title === 'string' ? row.title.trim() : '';
    if (!url || !title || hasContactLeak(row)) continue;
    const ageDays = ageDaysOf(row, options.now);
    if (ageDays > dropAfter) continue;
    const remote = row.isRemote === true || row.workplaceType === 'remote' || /^(?:онлайн|удал|remote)/i.test(row.city ?? '');
    listings.push({
      id: String(row.id ?? url),
      type,
      title,
      url,
      ...(row.author?.trim() ? { company: row.author.trim() } : {}),
      ...(row.city?.trim() ? { city: row.city.trim() } : {}),
      remote,
      ...(row.rawSalary?.trim() ? { salary: row.rawSalary.trim() } : {}),
      skills: Array.isArray(row.skills) ? row.skills.filter((s): s is string => typeof s === 'string').slice(0, 12) : [],
      ...(row.direction ? { direction: row.direction } : {}),
      ...(row.publishedAt ? { publishedAt: row.publishedAt } : {}),
      ageDays,
      stale: ageDays > maxAge,
      ...(row.visaSponsor?.name ? { visaSponsor: row.visaSponsor.name } : {}),
    });
  }
  // Freshest first, then stable by id so the artifact does not churn on equal dates.
  listings.sort((a, b) => a.ageDays - b.ageDays || a.id.localeCompare(b.id));
  return listings.slice(0, limit);
}

export interface ListingFeed {
  generatedAt: string;
  source: string;
  license: string;
  count: number;
  jobs: number;
  gigs: number;
  stale: number;
  listings: Listing[];
}

/** The JSON artifact: provenance, license and the listings. */
export function buildFeedJson(listings: Listing[], now: Date, sourceUrl: string): ListingFeed {
  return {
    generatedAt: now.toISOString(),
    source: sourceUrl,
    license: 'AGPL-3.0-only (data: original posts belong to their employers; links point to the source)',
    count: listings.length,
    jobs: listings.filter((l) => l.type === 'job').length,
    gigs: listings.filter((l) => l.type === 'gig').length,
    stale: listings.filter((l) => l.stale).length,
    listings,
  };
}

function mdCell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim();
}

/** The Markdown artifact: a readable table, every title linked to the original post. */
export function buildFeedMarkdown(feed: ListingFeed): string {
  const lines = [
    '# OpenRadar — fresh vacancies & orders',
    '',
    `Generated ${feed.generatedAt} · ${feed.count} listings (${feed.jobs} jobs, ${feed.gigs} gigs, ${feed.stale} stale).`,
    `Source: ${feed.source}. Every link points to the ORIGINAL employer post.`,
    'Contacts are not published here — open the original post to apply.',
    '',
    '| Role | Company | Place | Pay | Age | Link |',
    '| --- | --- | --- | --- | --- | --- |',
  ];
  for (const l of feed.listings) {
    const place = l.remote ? 'Remote' : l.city ?? '—';
    const age = l.stale ? `${l.ageDays}d (stale)` : `${l.ageDays}d`;
    const sponsor = l.visaSponsor ? ` 🛂` : '';
    lines.push(`| ${mdCell(l.title)}${sponsor} | ${mdCell(l.company ?? '—')} | ${mdCell(place)} | ${mdCell(l.salary ?? '—')} | ${age} | [original](${l.url}) |`);
  }
  lines.push('', '_🛂 = employer holds a UK visa-sponsor licence (a fact about the company, not a promise for this role)._', '');
  return lines.join('\n');
}
