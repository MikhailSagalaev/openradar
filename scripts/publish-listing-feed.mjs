#!/usr/bin/env node
/**
 * Publishes the daily OpenRadar listing feed (plan 021F): JSON + Markdown of fresh vacancies
 * and orders, every row linking to the ORIGINAL employer post. Reads the node's public guest
 * API (`/v2/feed`), so contacts are already redacted server-side; the builder additionally
 * drops any contact-looking row. No core pipeline changes — this is a publishing tool.
 *
 * Run: node --experimental-transform-types scripts/publish-listing-feed.mjs
 * Env:
 *   RADAR_FEED_URL   node base URL (default https://openradar.fun)
 *   RADAR_FEED_OUT   output directory (default docs/listing-feed)
 *   RADAR_FEED_LIMIT max listings (default 1000)
 *   RADAR_FEED_PAGES max feed pages to walk (default 20, 200 rows each)
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { buildListings, buildFeedJson, buildFeedMarkdown } from '../src/publish/listing-feed.ts';

const BASE = (process.env.RADAR_FEED_URL ?? 'https://openradar.fun').replace(/\/$/, '');
const OUT = process.env.RADAR_FEED_OUT ?? 'docs/listing-feed';
const LIMIT = Math.max(1, Math.min(Number(process.env.RADAR_FEED_LIMIT) || 1000, 5000));
const PAGES = Math.max(1, Math.min(Number(process.env.RADAR_FEED_PAGES) || 20, 100));
const UA = 'openradar-listing-feed/1.0 (+https://openradar.fun)';

/** Walks the public guest feed forward with its cursor; contacts are redacted by the server. */
async function fetchRows() {
  const rows = [];
  let cursor;
  for (let page = 0; page < PAGES; page++) {
    const url = new URL('/v2/feed', BASE);
    url.searchParams.set('limit', '200');
    url.searchParams.set('sort', 'new');
    if (cursor) url.searchParams.set('cursor', cursor);
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new Error(`feed ${url.pathname}: HTTP ${res.status}`);
    const body = await res.json();
    const leads = Array.isArray(body.leads) ? body.leads : [];
    rows.push(...leads);
    cursor = body.cursor;
    if (!cursor || leads.length === 0) break;
  }
  return rows;
}

const rows = await fetchRows();
const now = new Date();
const listings = buildListings(rows, { now, limit: LIMIT });
const feed = buildFeedJson(listings, now, BASE);
mkdirSync(OUT, { recursive: true });
writeFileSync(`${OUT}/listings.json`, `${JSON.stringify(feed, null, 2)}\n`, 'utf8');
writeFileSync(`${OUT}/README.md`, buildFeedMarkdown(feed), 'utf8');
console.log(`${OUT}: ${feed.count} listings (${feed.jobs} jobs, ${feed.gigs} gigs, ${feed.stale} stale) from ${rows.length} rows`);
