import { describe, expect, it } from 'vitest';
import { mkdtempSync, existsSync, readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeTestRuntime } from './helpers.ts';

const NOW = new Date('2026-11-13T12:00:00.000Z');
const logger = { info() {}, warn() {}, error() {}, debug() {}, child() { return logger; } } as never;

describe('leads soft archive (hot/warm/cold)', () => {
  it('hides old leads from feed and listing, keeps single lookups, exports the month', async () => {
    const runtime = makeTestRuntime();
    const src = await runtime.store.createSource({ kind: 'rss', title: 'S' });
    const lead = async (id: string, days: number) =>
      runtime.store.insertLead({
        id, sourceId: src.id, type: 'job', title: `R ${id}`, text: 'Build things.',
        url: `https://example.com/${id}`, externalId: `x-${id}`, fingerprint: `f-${id}`, titleKey: `k-${id}`,
        status: 'new', score: 50, reasons: [], skills: [],
        createdAt: new Date(NOW.getTime() - days * 86_400_000).toISOString(),
      } as never);
    await lead('old', 100); // outside the 60-day hot window
    await lead('new', 2);

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
    const raw = gunzipSync(readFileSync(files[0]!)).toString();
    expect(raw).toContain('"old"');
    // A second export does not duplicate the month file.
    expect(await runtime.store.exportArchivedLeads!(dir, 60)).toHaveLength(0);
  });
});
