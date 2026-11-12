#!/usr/bin/env node
// Maintainer tool: live-verify candidate ATS boards before adding them to src/sources/ats-companies.ts.
// NOT part of the poll loop and never run in tests — it makes real network calls by design.
//
// Candidates come from the MIT groundtruthtools/ats-jobs-mcp directory snapshot (see
// docs/SOURCE_INDEXING_LOG.md). Snapshot job counts only prioritize the queue; the live read decides.
//
// Usage:
//   node scripts/verify-ats-boards.mjs [--input .research/groundtruth-new-boards.json]
//     [--provider ashby] [--limit 300] [--delay-ms 1200] [--out .research/verify-ashby.json]
//     [--catalog src/sources/ats-companies.ts]
//
// Reads the FULL body (boards can be 30 MB+), walks boards sequentially with a delay
// (Ashby rate-limits bursts), honors Retry-After on 429, retries transient network errors once.
// Writes { live, empty, dead, blocked, error } buckets; only `live` may be imported.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const args = process.argv.slice(2);
function flag(name, fallback) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : fallback;
}

const input = resolve(flag('input', '.research/groundtruth-new-boards.json'));
const provider = flag('provider', 'ashby');
const limit = Math.max(1, Number(flag('limit', '300')));
const delayMs = Math.max(0, Number(flag('delay-ms', '1200')));
const out = resolve(flag('out', `.research/verify-${provider}.json`));
const catalogPath = resolve(flag('catalog', 'src/sources/ats-companies.ts'));
const timeoutMs = Math.max(5_000, Number(flag('timeout-ms', '90000')));

// Exact public endpoints from src/sources/ats.ts ENDPOINTS (keep in sync).
const ENDPOINTS = {
  ashby: (slug) => `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(slug)}?includeCompensation=true`,
  greenhouse: (slug) => `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(slug)}/jobs?content=true`,
};
if (!ENDPOINTS[provider]) {
  console.error(`Unknown provider "${provider}". Supported: ${Object.keys(ENDPOINTS).join(', ')}`);
  process.exit(1);
}

// Same entry grammar the adapter accepts (companiesOf): letters/digits/_.- then optional =Name.
const SLUG_RE = /^[a-z0-9][a-z0-9_.-]{0,80}$/i;

function titleCase(slug) {
  return slug
    .split(/[-_]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ');
}

function loadCandidates() {
  const data = JSON.parse(readFileSync(input, 'utf8'));
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.new_live_boards)) return data.new_live_boards;
  if (Array.isArray(data.boards)) return data.boards;
  throw new Error(`Unrecognized input shape in ${input}: expected an array, new_live_boards or boards`);
}

function existingSlugs() {
  const text = readFileSync(catalogPath, 'utf8');
  const block = text.match(new RegExp(`${provider}:\\s*\\[([\\s\\S]*?)\\]`));
  const set = new Set();
  if (!block) return set;
  for (const m of block[1].matchAll(/'([^'=]+)=/g)) set.add(m[1].toLowerCase());
  return set;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const UA = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0',
  Accept: 'application/json',
};

async function probe(slug) {
  const url = ENDPOINTS[provider](slug);
  let response;
  try {
    response = await fetch(url, { headers: UA, signal: AbortSignal.timeout(timeoutMs) });
  } catch (error) {
    return { bucket: 'error', reason: String(error?.message ?? error) };
  }
  if (response.status === 429) {
    const ra = Number(response.headers.get('retry-after'));
    return { bucket: 'rate-limited', retryAfterMs: (Number.isFinite(ra) && ra > 0 ? ra : 30) * 1000 };
  }
  if (response.status === 403) return { bucket: 'blocked', reason: 'HTTP 403' };
  if (response.status === 404 || response.status === 410) return { bucket: 'dead', reason: `HTTP ${response.status}` };
  if (!response.ok) return { bucket: 'error', reason: `HTTP ${response.status}` };
  let text;
  try {
    text = await response.text(); // full body: huge boards must not be truncated
  } catch (error) {
    return { bucket: 'error', reason: String(error?.message ?? error) };
  }
  if (/^\s*<(!doctype|html)/i.test(text) && /cloudflare|cf-chl|challenge/i.test(text)) {
    return { bucket: 'blocked', reason: 'Cloudflare challenge page' };
  }
  let jobs;
  try {
    jobs = JSON.parse(text).jobs;
  } catch {
    return { bucket: 'error', reason: 'invalid JSON' };
  }
  if (!Array.isArray(jobs)) return { bucket: 'error', reason: 'no jobs array' };
  const listed = provider === 'ashby' ? jobs.filter((j) => j && j.isListed !== false) : jobs;
  return listed.length > 0
    ? { bucket: 'live', jobs: listed.length }
    : { bucket: 'empty', jobs: 0 };
}

const candidates = loadCandidates().filter((b) => (b.ats ?? provider) === provider);
const have = existingSlugs();
const seen = new Set();
const queue = [];
const skipped = { alreadyInCatalog: 0, duplicate: 0, invalidSlug: 0 };
for (const b of [...candidates].sort((a, b) => (b.jobs ?? 0) - (a.jobs ?? 0))) {
  const slug = String(b.slug ?? b.board ?? '').trim();
  const key = slug.toLowerCase();
  if (!SLUG_RE.test(slug)) { skipped.invalidSlug++; continue; }
  if (have.has(key)) { skipped.alreadyInCatalog++; continue; }
  if (seen.has(key)) { skipped.duplicate++; continue; }
  seen.add(key);
  queue.push({ slug: key, name: (typeof b.company === 'string' && b.company.trim()) || titleCase(key), snapshotJobs: b.jobs ?? 0 });
  if (queue.length >= limit) break;
}

const result = { provider, input, checkedAt: new Date().toISOString(), requested: limit, skipped, live: [], empty: [], dead: [], blocked: [], error: [] };
console.log(`Verifying ${queue.length} ${provider} boards sequentially (delay ${delayMs}ms)…`);

for (let i = 0; i < queue.length; i++) {
  const board = queue[i];
  let verdict = await probe(board.slug);
  if (verdict.bucket === 'rate-limited') {
    console.log(`  429 on ${board.slug}: cooling down ${Math.round(verdict.retryAfterMs / 1000)}s`);
    await sleep(verdict.retryAfterMs);
    verdict = await probe(board.slug);
  }
  if (verdict.bucket === 'error') {
    await sleep(2000);
    const retry = await probe(board.slug);
    if (retry.bucket !== 'error') verdict = retry;
  }
  const record = { slug: board.slug, name: board.name, snapshotJobs: board.snapshotJobs, jobs: verdict.jobs ?? 0, ...(verdict.reason ? { reason: verdict.reason } : {}) };
  const bucket = verdict.bucket === 'rate-limited' ? 'error' : verdict.bucket;
  result[bucket].push(record);
  const label = bucket === 'live' ? `live (${record.jobs} jobs)` : `${bucket}${verdict.reason ? `: ${verdict.reason}` : ''}`;
  console.log(`  [${i + 1}/${queue.length}] ${board.slug} — ${label}`);
  if (i + 1 < queue.length) await sleep(delayMs);
}

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(result, null, 2) + '\n', 'utf8');
const n = (b) => result[b].length;
console.log(`\nDone: live ${n('live')} · empty ${n('empty')} · dead ${n('dead')} · blocked ${n('blocked')} · error ${n('error')}`);
console.log(`Skipped: already in catalog ${skipped.alreadyInCatalog}, duplicate ${skipped.duplicate}, invalid slug ${skipped.invalidSlug}`);
console.log(`Written: ${out}`);
