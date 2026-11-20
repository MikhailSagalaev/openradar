import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createTestStore, makeTestRuntime } from './helpers.ts';
import { RESEARCH_TEXT_HEAD, type Store } from '../src/core/store.ts';
import type { Lead } from '../src/core/types.ts';
import { deriveRecord } from '../src/research/derive.ts';
import { utcMonthBounds, utcMonthOf } from '../src/store/archive-file.ts';

// Everything is relative to the real clock: the stores compute their cutoffs from Date.now(),
// so a pinned date would expire (an old fixed "now" eventually archives the "new" lead).
const DAY = 86_400_000;
const daysAgo = (days: number): string => new Date(Date.now() - days * DAY).toISOString();

// CI runs in Europe/Moscow: month keys must stay UTC whatever the process time zone is.
const savedTz = process.env.TZ;
beforeAll(() => { process.env.TZ = 'Europe/Moscow'; });
afterAll(() => { if (savedTz === undefined) delete process.env.TZ; else process.env.TZ = savedTz; });

function makeLead(store: Store, sourceId: string, id: string, createdAt: string, extra: Partial<Lead> = {}): Promise<unknown> {
  return store.insertLead({
    id, sourceId, type: 'job', title: `R ${id}`, text: 'Build things.',
    url: `https://example.com/${id}`, externalId: `x-${id}`, fingerprint: `f-${id}`, titleKey: `k-${id}`,
    status: 'new', score: 50, reasons: [], skills: [],
    createdAt,
    ...extra,
  } as never);
}

function readArchive(file: string): Lead[] {
  return gunzipSync(readFileSync(file)).toString().split('\n').map((line) => JSON.parse(line) as Lead);
}

describe('leads soft archive (hot/warm/cold)', () => {
  it('hides old leads from feed and listing, keeps single lookups, exports the month', async () => {
    const runtime = makeTestRuntime();
    const src = await runtime.store.createSource({ kind: 'rss', title: 'S' });
    await makeLead(runtime.store, src.id, 'old', daysAgo(100)); // outside the 60-day hot window
    await makeLead(runtime.store, src.id, 'new', daysAgo(2));

    const dir = mkdtempSync(join(tmpdir(), 'arch-'));
    const archived = await runtime.store.archiveOldLeads!(60);
    expect(archived).toBe(1);

    // The public surface does not see the archived lead...
    const feed = await runtime.store.getLeadsForFeed({ limit: 100 });
    expect(feed.map((l) => l.id)).not.toContain('old');
    const listed = await runtime.store.listLeads({ limit: 100 });
    expect(listed.map((l) => l.id)).not.toContain('old');
    // ...but the row is alive: single lookups and statistics keep the data.
    expect((await runtime.store.getLead('old'))?.title).toBe('R old');
    expect((await runtime.store.getLead('new'))?.archivedAt).toBeUndefined();

    const files = await runtime.store.exportArchivedLeads!(dir, 60);
    expect(files).toHaveLength(1);
    expect(existsSync(files[0]!)).toBe(true);
    expect(files[0]).toMatch(new RegExp(`leads-${utcMonthOf(daysAgo(100))}\\.jsonl\\.gz$`));
    const raw = gunzipSync(readFileSync(files[0]!)).toString();
    expect(raw).toContain('"old"');
    // A second export does not duplicate the month file, and no temp file is left behind.
    expect(await runtime.store.exportArchivedLeads!(dir, 60)).toHaveLength(0);
    expect(readdirSync(dir).filter((f) => f.endsWith('.tmp'))).toHaveLength(0);
  });

  it('keys months in UTC: a lead at 22:00 UTC on a month\'s last day lands in that month', async () => {
    const store = createTestStore();
    const src = await store.createSource({ kind: 'rss', title: 'S' });
    // M = the month before the one holding the export horizon (now - hotDays - 1): M is
    // complete for export, M+1 is not. In Moscow the lead is already 01:00 of M+1.
    const hotEnd = daysAgo(61);
    const month = utcMonthOf(new Date(Date.parse(utcMonthBounds(utcMonthOf(hotEnd)).start) - 1).toISOString());
    const lastEvening = new Date(Date.parse(utcMonthBounds(month).end) - 2 * 3600 * 1000).toISOString();
    const id = `tz-${randomUUID().slice(0, 8)}`;
    await makeLead(store, src.id, id, lastEvening);

    await store.archiveOldLeads!(60);
    const dir = mkdtempSync(join(tmpdir(), 'arch-tz-'));
    const files = await store.exportArchivedLeads!(dir, 60);
    const file = join(dir, `leads-${month}.jsonl.gz`);
    expect(files).toContain(file);
    expect(readArchive(file).map((l) => l.id)).toContain(id);
    await store.close();
  });

  it('compacts exported cold leads in place; research reads them identically', async () => {
    const store = createTestStore();
    const rss = await store.createSource({ kind: 'rss', title: 'Feed' });
    const ats = await store.createSource({ kind: 'ats', title: 'Careers' });
    const tag = randomUUID().slice(0, 8);
    const body = (n: number) => `Компания «Ромашка» ищет backend разработчика. Python, PostgreSQL, Kafka. Зарплата от 250 000 ₽.\n${'Описание задач и условий. '.repeat(n)}`;
    const leads: Array<[string, string, string]> = [
      [`c-rss-${tag}`, rss.id, body(400)], // > 3000 chars
      [`c-ats-${tag}`, ats.id, body(100)], // > 600 chars
      [`c-short-${tag}`, rss.id, 'Нужен дизайнер логотипа, бюджет 15 000 руб.'],
    ];
    for (const [id, sourceId, text] of leads) {
      await makeLead(store, sourceId, id, daysAgo(400), {
        text,
        contacts: [{ type: 'telegram', value: '@hr_contact' }],
        metadata: { summary: 'A long LLM summary.', retitle_from: 'Old title', qualityFlags: ['job_board'] },
      } as Partial<Lead>);
    }
    const window = { from: daysAgo(500), to: new Date().toISOString(), limit: 100 };
    const research = async () => {
      const ours = new Set(leads.map(([id]) => id));
      return (await store.listLeadsForResearch!(window)).filter((l) => ours.has(l.id)).map((l) => deriveRecord(l));
    };

    await store.archiveOldLeads!(60);
    const before = await research();
    expect(before).toHaveLength(3);

    // Nothing is compacted (or deleted) before the month file exists.
    const dir = mkdtempSync(join(tmpdir(), 'arch-cold-'));
    expect(await store.compactOldLeads!(180, dir)).toBe(0);
    expect(await store.cleanupOldLeads!(180, dir)).toBe(0);
    expect((await store.getLead(`c-rss-${tag}`))?.text).toBe(body(400));

    await store.exportArchivedLeads!(dir, 60);
    expect(await store.compactOldLeads!(180, dir)).toBeGreaterThanOrEqual(3);

    const rssLead = (await store.getLead(`c-rss-${tag}`))!;
    expect(rssLead.text).toBe(body(400).slice(0, RESEARCH_TEXT_HEAD.other));
    expect(rssLead.contacts ?? []).toEqual([]);
    expect(rssLead.compactedAt).toBeTruthy();
    expect(rssLead.metadata?.summary).toBeUndefined();
    expect(rssLead.metadata?.qualityFlags).toEqual(['job_board']);
    expect(rssLead.title).toBe(`R c-rss-${tag}`);
    expect(rssLead.score).toBe(50);
    expect((await store.getLead(`c-ats-${tag}`))!.text).toBe(body(100).slice(0, RESEARCH_TEXT_HEAD.ats));
    expect((await store.getLead(`c-short-${tag}`))!.text).toBe('Нужен дизайнер логотипа, бюджет 15 000 руб.');

    // The research report gives the same records for the compacted rows.
    expect(await research()).toEqual(before);
    // The full copy is in the month file.
    const file = join(dir, `leads-${utcMonthOf(daysAgo(400))}.jsonl.gz`);
    const full = readArchive(file).find((l) => l.id === `c-rss-${tag}`)!;
    expect(full.text).toBe(body(400));
    expect(full.contacts).toEqual([{ type: 'telegram', value: '@hr_contact' }]);

    // Idempotent.
    expect(await store.compactOldLeads!(180, dir)).toBe(0);
    await store.close();
  });

  it('delete mode removes only leads of exported months', async () => {
    const store = createTestStore();
    const src = await store.createSource({ kind: 'rss', title: 'S' });
    const id = `d-${randomUUID().slice(0, 8)}`;
    await makeLead(store, src.id, id, daysAgo(400));
    await store.archiveOldLeads!(60);
    const dir = mkdtempSync(join(tmpdir(), 'arch-del-'));
    expect(await store.cleanupOldLeads!(180, dir)).toBe(0);
    expect(await store.getLead(id)).not.toBeNull();
    await store.exportArchivedLeads!(dir, 60);
    expect(await store.cleanupOldLeads!(180, dir)).toBeGreaterThanOrEqual(1);
    expect(await store.getLead(id)).toBeNull();
    await store.close();
  });
});

describe('store parity: board leads and research text', () => {
  it('listBoardLeads returns the newest N and treats the prefix literally', async () => {
    const store = createTestStore();
    const src = await store.createSource({ kind: 'ats', title: 'Board' });
    const tag = randomUUID().slice(0, 8);
    await makeLead(store, src.id, `b1-${tag}`, daysAgo(5), { externalId: `gh_a:1-${tag}` } as Partial<Lead>);
    await makeLead(store, src.id, `b2-${tag}`, daysAgo(3), { externalId: `gh_a:2-${tag}` } as Partial<Lead>);
    await makeLead(store, src.id, `b3-${tag}`, daysAgo(1), { externalId: `gh_a:3-${tag}` } as Partial<Lead>);
    // `_` would match any character under LIKE: this one must not come back.
    await makeLead(store, src.id, `b4-${tag}`, daysAgo(1), { externalId: `ghXa:4-${tag}` } as Partial<Lead>);

    const rows = await store.listBoardLeads!({ sourceId: src.id, externalIdPrefix: 'gh_a:', createdAfter: daysAgo(30), limit: 2 });
    expect(rows.map((r) => r.id)).toEqual([`b3-${tag}`, `b2-${tag}`]);
    const all = await store.listBoardLeads!({ sourceId: src.id, externalIdPrefix: 'gh_a:', createdAfter: daysAgo(30), limit: 10 });
    expect(all.map((r) => r.id).sort()).toEqual([`b1-${tag}`, `b2-${tag}`, `b3-${tag}`]);
    await store.close();
  });

  it('listLeadsForResearch cuts ATS texts to the ATS head, others to the general head', async () => {
    const store = createTestStore();
    const ats = await store.createSource({ kind: 'ats', title: 'Careers' });
    const rss = await store.createSource({ kind: 'rss', title: 'Feed' });
    const tag = randomUUID().slice(0, 8);
    const long = 'x'.repeat(5000);
    await makeLead(store, ats.id, `r-ats-${tag}`, daysAgo(1), { text: long });
    await makeLead(store, rss.id, `r-rss-${tag}`, daysAgo(1), { text: long });
    const rows = await store.listLeadsForResearch!({ from: daysAgo(10), to: new Date().toISOString(), limit: 1000 });
    expect(rows.find((l) => l.id === `r-ats-${tag}`)?.text).toHaveLength(RESEARCH_TEXT_HEAD.ats);
    expect(rows.find((l) => l.id === `r-rss-${tag}`)?.text).toHaveLength(RESEARCH_TEXT_HEAD.other);
    await store.close();
  });
});
