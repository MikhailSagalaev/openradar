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

    // Live vacancy
    const lead = createMockLead({
      id: 'lead-live-target',
      status: 'rejected', // Was prematurely rejected by community votes
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
});
