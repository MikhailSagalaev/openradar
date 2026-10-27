import { describe, expect, it } from 'vitest';
import type { Lead } from '../src/core/types.ts';
import { MemoryStore } from '../src/store/memory.ts';
import { TEST_NOW } from './helpers.ts';

function makeLead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: 'lead-1',
    sourceId: 'source-1',
    externalId: 'external-1',
    url: 'https://example.com/1',
    canonicalUrl: 'https://example.com/1',
    title: 'Нужен сантехник в Ставрополе',
    text: 'Прорвало трубу, бюджет 5000 ₽',
    city: 'Ставрополь',
    budget: 5000,
    publishedAt: TEST_NOW.toISOString(),
    fingerprint: 'fingerprint-1',
    titleKey: 'нужен сантехник в ставрополе',
    status: 'new',
    score: 75,
    reasons: [],
    createdAt: TEST_NOW.toISOString(),
    ...overrides,
  };
}

describe('store', () => {
  it('creates, updates and deletes sources', async () => {
    const store = new MemoryStore();
    const source = await store.createSource({
      kind: 'rss',
      title: 'Feed',
      config: { url: 'https://example.com/rss' },
    });
    expect(source.id).toMatch(/^rss_/);
    expect(await store.listSources()).toHaveLength(1);

    const updated = await store.updateSource(source.id, { enabled: false, title: 'Renamed' });
    expect(updated?.enabled).toBe(false);
    expect(updated?.title).toBe('Renamed');

    expect(await store.deleteSource(source.id)).toBe(true);
    expect(await store.listSources()).toHaveLength(0);
    await store.close();
  });

  it('deduplicates by fingerprint and title key', async () => {
    const store = new MemoryStore();
    const source = await store.createSource({ kind: 'rss', title: 'Feed' });
    const lead = makeLead({ sourceId: source.id });

    expect(await store.insertLead(lead)).toBe(true);
    expect(await store.insertLead({ ...lead, id: 'lead-2' })).toBe(false);
    expect((await store.findLeadByFingerprint(lead.fingerprint))?.id).toBe(lead.id);

    const recent = await store.findRecentByTitleKey(
      lead.titleKey,
      lead.city,
      new Date(TEST_NOW.getTime() - 24 * 3600 * 1000).toISOString(),
    );
    expect(recent?.id).toBe(lead.id);

    await store.close();
  });

  it('lists leads and computes stats', async () => {
    const store = new MemoryStore();
    const source = await store.createSource({ kind: 'rss', title: 'Feed' });
    await store.insertLead(makeLead({ sourceId: source.id, id: 'lead-new' }));
    await store.insertLead(
      makeLead({
        sourceId: source.id,
        id: 'lead-rejected',
        externalId: 'external-2',
        fingerprint: 'fingerprint-2',
        titleKey: 'накрутка отзывов',
        status: 'rejected',
      }),
    );

    expect(await store.listLeads({ status: 'new' })).toHaveLength(1);
    expect(await store.listLeads({ status: 'rejected' })).toHaveLength(1);
    const stats = await store.getStats();
    expect(stats.sources).toBe(1);
    expect(stats.leads).toBe(2);
    expect(stats.newLeads).toBe(1);
    expect(stats.rejectedLeads).toBe(1);

    await store.close();
  });

  it('records runs', async () => {
    const store = new MemoryStore();
    await store.recordRun({
      id: 'run-1',
      sourceId: 'source-1',
      startedAt: TEST_NOW.toISOString(),
      finishedAt: TEST_NOW.toISOString(),
      found: 3,
      inserted: 2,
      duplicates: 1,
      rejected: 0,
      delivered: 2,
    });
    expect(await store.listRuns()).toHaveLength(1);
    expect((await store.listRuns())[0]?.found).toBe(3);
    await store.close();
  });

  it('filters leads by a normalized query', async () => {
    const store = new MemoryStore();
    const source = await store.createSource({ kind: 'rss', title: 'Feed' });
    await store.insertLead(makeLead({ sourceId: source.id, id: 'lead-1', title: 'Нужен сантехник' }));
    await store.insertLead(
      makeLead({
        sourceId: source.id,
        id: 'lead-2',
        externalId: 'external-2',
        fingerprint: 'fingerprint-2',
        titleKey: 'нужен электрик',
        title: 'Нужен электрик',
      }),
    );

    expect(await store.listLeads({ query: 'САНТЕХНИК' })).toHaveLength(1);
    expect((await store.listLeads({ query: 'электрик' }))[0]?.title).toBe('Нужен электрик');
    await store.close();
  });

  it('aggregates source health', async () => {
    const store = new MemoryStore();
    const source = await store.createSource({ kind: 'rss', title: 'Health feed' });
    const base = {
      sourceId: source.id,
      startedAt: new Date(Date.now() - 60_000).toISOString(),
      finishedAt: new Date(Date.now() - 60_000).toISOString(),
      found: 3,
      inserted: 2,
      duplicates: 1,
      rejected: 0,
      delivered: 2,
    };
    await store.recordRun({ ...base, id: 'run-ok' });
    await store.recordRun({
      ...base,
      id: 'run-fail',
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      found: 0,
      inserted: 0,
      delivered: 0,
      error: 'timeout',
    });

    const health = await store.getSourceHealth();
    expect(health).toHaveLength(1);
    expect(health[0]?.last24h.runs).toBe(2);
    expect(health[0]?.last24h.errors).toBe(1);
    expect(health[0]?.last24h.found).toBe(3);
    expect(health[0]?.successRate).toBe(50);
    expect(health[0]?.lastRun?.error).toBe('timeout');
    expect(await store.listRuns(10, source.id)).toHaveLength(2);
    await store.close();
  });

  it('handles sessions and retention cleanup', async () => {
    const store = new MemoryStore();
    const source = await store.createSource({ kind: 'rss', title: 'Feed' });

    // Session testing
    await store.createSession('session-1', new Date(Date.now() + 10_000).toISOString());
    expect(await store.validateSession('session-1')).toBe(true);
    expect(await store.validateSession('unknown-session')).toBe(false);

    await store.deleteSession('session-1');
    expect(await store.validateSession('session-1')).toBe(false);

    // Retention cleanup testing
    const oldDate = new Date(Date.now() - 40 * 24 * 3600 * 1000).toISOString();
    const recentDate = new Date(Date.now() - 5 * 24 * 3600 * 1000).toISOString();

    await store.insertLead(makeLead({ sourceId: source.id, id: 'lead-old', createdAt: oldDate }));
    await store.insertLead(
      makeLead({
        sourceId: source.id,
        id: 'lead-recent',
        fingerprint: 'fp-recent',
        externalId: 'ext-recent',
        createdAt: recentDate,
      }),
    );

    const deletedCount = await store.cleanupOldLeads(30);
    expect(deletedCount).toBe(1);
    expect(await store.getLead('lead-old')).toBeNull();
    expect(await store.getLead('lead-recent')).not.toBeNull();

    // Runs cleanup: old run rows go, recent ones stay
    await store.recordRun({
      id: 'run-old',
      sourceId: source.id,
      startedAt: oldDate,
      finishedAt: oldDate,
      found: 0,
      inserted: 0,
      duplicates: 0,
      rejected: 0,
      delivered: 0,
    });
    await store.recordRun({
      id: 'run-new',
      sourceId: source.id,
      startedAt: recentDate,
      finishedAt: recentDate,
      found: 1,
      inserted: 1,
      duplicates: 0,
      rejected: 0,
      delivered: 1,
    });
    const removedRuns = await store.cleanupRuns(30);
    expect(removedRuns).toBe(1);
    const runs = await store.listRuns(10, source.id);
    expect(runs.map((r) => r.id)).toEqual(['run-new']);

    await store.close();
  });

  it('records votes, recalculates score based on community sentiment, and returns voting fields', async () => {
    const store = new MemoryStore();
    const source = await store.createSource({ kind: 'rss', title: 'Feed' });
    const lead = makeLead({ sourceId: source.id, id: 'lead-vote', score: 75 });
    await store.insertLead(lead);

    // Initial check
    const initial = await store.getLead(lead.id);
    expect(initial?.votes_up).toBe(0);
    expect(initial?.votes_down).toBe(0);
    expect(initial?.votes_scam).toBe(0);
    expect(initial?.votes_closed).toBe(0);
    expect(initial?.score).toBe(75);

    // 1. Useful vote: U=1, J=0, S=0. community = 1/3, adjustment = +8
    const vote1 = await store.recordVote(lead.id, 'useful', 1);
    expect(vote1.votes_up).toBe(1);
    expect(vote1.votes_down).toBe(0);
    expect(vote1.score).toBe(83);

    // 2. Second useful vote: U=2, J=0, S=0. community = 2/4 = 0.5, adjustment = +13
    const vote2 = await store.recordVote(lead.id, 'useful', 1);
    expect(vote2.votes_up).toBe(2);
    expect(vote2.score).toBe(88);

    // 3. Junk vote: U=2, J=1, S=0. community = (2-1)/(2+1+2) = 1/5 = 0.2, adjustment = +5
    const vote3 = await store.recordVote(lead.id, 'junk', 1);
    expect(vote3.votes_down).toBe(1);
    expect(vote3.score).toBe(80);

    // Verify getLead and listLeads return the updated fields
    const updated = await store.getLead(lead.id);
    expect(updated?.votes_up).toBe(2);
    expect(updated?.votes_down).toBe(1);
    expect(updated?.votes_scam).toBe(0);
    expect(updated?.votes_closed).toBe(0);
    expect(updated?.score).toBe(80);

    const listed = await store.listLeads({ limit: 10 });
    const listedLead = listed.find((l) => l.id === lead.id);
    expect(listedLead?.votes_up).toBe(2);
    expect(listedLead?.votes_down).toBe(1);

    await store.close();
  });

  it('counts raw votes and adjusts the score but never hides a lead by itself (radar/2: weighted signals decide)', async () => {
    const store = new MemoryStore();
    const source = await store.createSource({ kind: 'rss', title: 'Feed' });
    const lead = makeLead({ sourceId: source.id, id: 'lead-scam', status: 'new', score: 60 });
    await store.insertLead(lead);

    await store.recordVote(lead.id, 'useful', 1);
    await store.recordVote(lead.id, 'scam', 3);
    const res = await store.recordVote(lead.id, 'closed', 2);
    expect(res.votes_scam).toBe(3);
    expect(res.votes_closed).toBe(2);
    const finalLead = await store.getLead(lead.id);
    expect(finalLead?.status).toBe('new');
    expect(finalLead?.state).toBe('active');
    expect(finalLead!.score).toBeLessThan(60);

    await store.close();
  });

  it('prevents single-subnet scam sniping (anti-snipe /24)', async () => {
    const store = new MemoryStore();
    const source = await store.createSource({ kind: 'rss', title: 'Feed' });
    const lead = makeLead({ sourceId: source.id, id: 'lead-snipe', status: 'new', score: 80 });
    await store.insertLead(lead);

    // Vote scam from 203.0.113.10 (subnet 203.0.113.0/24)
    const vote1 = await store.recordVote(lead.id, 'scam', 1, '203.0.113.0/24');
    expect(vote1.votes_scam).toBe(1);

    // Same subnet tries to vote scam again -> ignored!
    const vote2 = await store.recordVote(lead.id, 'scam', 1, '203.0.113.0/24');
    expect(vote2.votes_scam).toBe(1);

    // Different subnet votes scam -> counted!
    const vote3 = await store.recordVote(lead.id, 'scam', 1, '185.12.34.0/24');
    expect(vote3.votes_scam).toBe(2);

    await store.close();
  });

  it('searches tech tokens like C++, C#, .NET and 1C accurately', async () => {
    const store = new MemoryStore();
    const source = await store.createSource({ kind: 'rss', title: 'Feed' });
    await store.insertLead(
      makeLead({
        sourceId: source.id,
        id: 'lead-cpp',
        title: 'Senior C++ Developer',
        text: 'Highload network programming in C++20 and Qt',
        fingerprint: 'fp-cpp',
        externalId: 'ext-cpp',
      }),
    );
    await store.insertLead(
      makeLead({
        sourceId: source.id,
        id: 'lead-csharp',
        title: 'Backend C# Engineer',
        text: 'Enterprise API in .NET 8 and C#',
        fingerprint: 'fp-csharp',
        externalId: 'ext-csharp',
      }),
    );

    const cppResults = await store.listLeads({ query: 'C++' });
    expect(cppResults.map((l) => l.id)).toContain('lead-cpp');
    expect(cppResults.map((l) => l.id)).not.toContain('lead-csharp');

    const dotnetResults = await store.listLeads({ query: '.NET' });
    expect(dotnetResults.map((l) => l.id)).toContain('lead-csharp');

    await store.close();
  });
});
