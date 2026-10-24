import { describe, expect, it } from 'vitest';
import { MemoryStore } from '../src/store/memory.ts';
import { arbitrateLead, evaluateContentDeterministically } from '../src/pipeline/arbiter.ts';
import { generateKeyPair } from '../src/net/keys.ts';
import type { Lead } from '../src/core/types.ts';

function createMockLead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: overrides.id || 'lead-arbiter-1',
    sourceId: 'source-1',
    title: overrides.title || 'Senior Go Developer',
    text: overrides.text || 'High load backend development with Go, Kafka, PostgreSQL.',
    url: overrides.url || 'https://example.com/jobs/go-lead',
    canonicalUrl: overrides.canonicalUrl || 'https://example.com/jobs/go-lead',
    fingerprint: 'fp-' + (overrides.id || '1'),
    titleKey: 'senior go developer',
    status: overrides.status || 'new',
    score: 80,
    reasons: [],
    createdAt: new Date().toISOString(),
    votes_up: 5,
    votes_scam: 0,
    ...overrides,
  };
}

describe('AI Arbiter (Grokipedia Pattern & Slashing)', () => {
  it('detects 404 and closed stop-markers deterministically', () => {
    const res404 = evaluateContentDeterministically('Not found', 404);
    expect(res404.verdict).toBe('closed');
    expect(res404.confidence).toBe(1.0);

    const resArchived = evaluateContentDeterministically('К сожалению, данная вакансия в архиве.', 200);
    expect(resArchived.verdict).toBe('closed');
    expect(resArchived.confidence).toBeGreaterThanOrEqual(0.85);

    const resActive = evaluateContentDeterministically('Отличная работа в команде финтеха. Присылайте резюме!', 200);
    expect(resActive.verdict).toBe('active');
    expect(resActive.confidence).toBeGreaterThanOrEqual(0.85);
  });

  it('detects scam patterns (seed phrase, fee for testing)', () => {
    const resSeed = evaluateContentDeterministically('Для верификации укажите свою seed-фразу от кошелька.', 200);
    expect(resSeed.verdict).toBe('scam');
    expect(resSeed.confidence).toBeGreaterThanOrEqual(0.85);

    const resPrepay = evaluateContentDeterministically('Требуется предоплата за тестовое задание 500 рублей.', 200);
    expect(resPrepay.verdict).toBe('scam');
    expect(resPrepay.confidence).toBeGreaterThanOrEqual(0.85);
  });

  it('kills lead when truly closed (HTTP 404)', async () => {
    const store = new MemoryStore();
    const lead = createMockLead({ id: 'lead-closed-404' });
    await store.insertLead(lead);

    const mockFetch = async () => new Response('404 Not Found', { status: 404 });

    const evaluation = await arbitrateLead(lead.id, {
      store,
      fetchImpl: mockFetch as any,
    });

    expect(evaluation.verdict).toBe('closed');
    const updated = await store.getLead(lead.id);
    expect(updated?.verification_state).toBe('killed_closed');
    expect(updated?.status).toBe('rejected');
  });

  it('slashes reputation by 50% for false scam reports on live vacancy', async () => {
    const store = new MemoryStore();
    const serverKeys = generateKeyPair();

    // 5 attacker nodes that coordinate a scam downvote attack
    const attackerKeys: string[] = [];
    for (let i = 1; i <= 5; i++) {
      const keys = generateKeyPair();
      attackerKeys.push(keys.pubKey);
      await store.upsertMeshNode({
        pubkey: keys.pubKey,
        npub: keys.npub,
        trust_score: 0.60,
      });
    }

    // Live vacancy (mesh-exclusive: the arbiter owns its lifecycle)
    const lead = createMockLead({
      id: 'lead-live-target',
      status: 'rejected', // Was prematurely rejected by community votes
      is_mesh_exclusive: true,
    });
    await store.insertLead(lead);

    // Mock live target page
    const mockFetch = async () =>
      new Response('<html><body><h1>Senior Go Developer</h1><p>Active hiring, apply now!</p></body></html>', {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      });

    const evaluation = await arbitrateLead(
      lead.id,
      {
        store,
        serverKeys,
        fetchImpl: mockFetch as any,
      },
      attackerKeys,
    );

    expect(evaluation.verdict).toBe('active');

    // Lead is restored and marked as verified_active
    const updated = await store.getLead(lead.id);
    expect(updated?.verification_state).toBe('verified_active');
    expect(updated?.status).toBe('new');

    // Verify slashing on all 5 attacker nodes: trust_score 0.60 slashed to 0.30 (50%)
    for (const pubkey of attackerKeys) {
      const node = await store.getMeshNode(pubkey);
      expect(node).not.toBeNull();
      expect(node!.trust_score).toBeCloseTo(0.30, 2);
    }
  });

  it('never kills a lead on connection errors or bot-protection statuses', async () => {
    const store = new MemoryStore();

    const networkFailures: Array<typeof fetch> = [
      (async () => { throw new Error('ECONNRESET'); }) as any,
      (async () => { throw new Error('The operation was aborted'); }) as any,
      (async () => new Response('Blocked', { status: 403 })) as any,
      (async () => new Response('Slow down', { status: 429 })) as any,
      (async () => new Response('Boom', { status: 500 })) as any,
    ];

    for (let i = 0; i < networkFailures.length; i++) {
      const lead = createMockLead({ id: `lead-net-${i}` });
      await store.insertLead(lead);
      const evaluation = await arbitrateLead(lead.id, {
        store,
        fetchImpl: networkFailures[i]!,
      });
      expect(evaluation.verdict).toBe('inconclusive');
      const updated = await store.getLead(lead.id);
      expect(updated?.verification_state).not.toBe('killed_closed');
      expect(updated?.verification_state).not.toBe('killed_scam');
      expect(updated?.status).not.toBe('rejected');
    }
  });

  it('prevents false slashing on SPA / login-wall pages returning HTTP 200 (MinHash divergence)', async () => {
    const store = new MemoryStore();
    const serverKeys = generateKeyPair();

    const honestReporter = generateKeyPair();
    await store.upsertMeshNode({
      pubkey: honestReporter.pubKey,
      npub: honestReporter.npub,
      trust_score: 0.80,
    });

    const { computeMinHashSketch } = await import('../src/core/fingerprint.ts');
    const originalText = 'Architecting distributed consensus algorithms with Raft and Paxos in Rust.';
    const originalSketch = computeMinHashSketch(originalText);

    const lead = createMockLead({
      id: 'lead-spa-target',
      text: originalText,
      minhash_sketch: originalSketch,
      status: 'rejected',
    });
    await store.insertLead(lead);

    // Mock SPA empty shell / login wall returning HTTP 200 OK
    const mockSpaFetch = async () =>
      new Response(
        '<!DOCTYPE html><html><head><title>App Login</title></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>',
        {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        },
      );

    const evaluation = await arbitrateLead(
      lead.id,
      {
        store,
        serverKeys,
        fetchImpl: mockSpaFetch as any,
      },
      [honestReporter.pubKey],
    );

    // Must be inconclusive, NOT active
    expect(evaluation.verdict).toBe('inconclusive');
    expect(evaluation.reason).toContain('MinHash divergence');

    // Lead must be marked as under_review
    const updated = await store.getLead(lead.id);
    expect(updated?.verification_state).toBe('under_review');

    // Reporter MUST NOT be slashed (trust_score remains intact at 0.80)
    const node = await store.getMeshNode(honestReporter.pubKey);
    expect(node).not.toBeNull();
    expect(node!.trust_score).toBe(0.80);
    expect(node!.false_reports_count).toBe(0);
  });
});
