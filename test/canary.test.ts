import { describe, expect, it } from 'vitest';
import { MemoryStore } from '../src/store/memory.ts';
import {
  createCanaryLead,
  isCanaryLead,
  handleCanaryAttestation,
  slashCheatingNode,
} from '../src/pipeline/canary.ts';
import { generateKeyPair } from '../src/net/keys.ts';
import { buildLeadAttestationEvent } from '../src/net/protocol.ts';
import { determineAccessTier } from '../src/core/access-tier.ts';

describe('Tit-for-Tat Canary Traps & Cheater Slashing', () => {
  it('identifies canary leads deterministically', () => {
    const canary = createCanaryLead();
    expect(isCanaryLead(canary)).toBe(true);
    expect(canary.url).toContain('canary.openradar.fun');
    expect(canary.metadata?.is_canary).toBe(true);

    const regularLead = {
      id: 'lead-real-123',
      url: 'https://hh.ru/vacancy/123456',
      canonicalUrl: 'https://hh.ru/vacancy/123456',
    };
    expect(isCanaryLead(regularLead)).toBe(false);
  });

  it('catches blind validator signing "verified" on canary and executes cheater slashing', async () => {
    const store = new MemoryStore();

    // 1. Bot registers node with initial reputation
    const botKeys = generateKeyPair();
    await store.upsertMeshNode({
      pubkey: botKeys.pubKey,
      npub: botKeys.npub,
      trust_score: 0.50,
    });

    // 2. System injects canary trap into store
    const canary = createCanaryLead();
    await store.insertLead(canary);

    // 3. Blind bot sends Kind 30405 with status: "verified" without actually fetching URL
    const fakeAttestation = buildLeadAttestationEvent({
      leadEventId: canary.id,
      recomputedHash: canary.fingerprint,
      status: 'verified',
      confidence: 0.99,
      pubkey: botKeys.pubKey,
      privKey: botKeys.privKey,
    });

    const result = await handleCanaryAttestation(fakeAttestation, store);
    expect(result.caught).toBe(true);
    expect(result.slashedPubkey).toBe(botKeys.pubKey.toLowerCase());

    // 4. Verify node is banned and trust_score is 0.0
    const node = await store.getMeshNode(botKeys.pubKey);
    expect(node).not.toBeNull();
    expect(node!.trust_score).toBe(0.0);
    expect(node!.is_banned).toBe(true);
    expect(node!.false_reports_count).toBeGreaterThanOrEqual(999);

    // 5. Verify access tier for banned node is demoted to free_rider with 0 trust
    const tier = determineAccessTier({ meshNode: node });
    expect(tier.tier).toBe('free_rider');
    expect(tier.isRealtime).toBe(false);
    expect(tier.reason).toContain('banned');
  });

  it('ignores attestations on non-canary leads or honest closure reports', async () => {
    const store = new MemoryStore();
    const honestKeys = generateKeyPair();
    await store.upsertMeshNode({
      pubkey: honestKeys.pubKey,
      npub: honestKeys.npub,
      trust_score: 0.60,
    });

    const canary = createCanaryLead();
    await store.insertLead(canary);

    // Honest node checks URL, sees 404, and signs "closed"
    const honestAttestation = buildLeadAttestationEvent({
      leadEventId: canary.id,
      recomputedHash: canary.fingerprint,
      status: 'closed',
      confidence: 1.0,
      pubkey: honestKeys.pubKey,
      privKey: honestKeys.privKey,
    });

    const result = await handleCanaryAttestation(honestAttestation, store);
    expect(result.caught).toBe(false);

    // Node is not banned
    const node = await store.getMeshNode(honestKeys.pubKey);
    expect(node!.is_banned).toBeFalsy();
    expect(node!.trust_score).toBe(0.60);
  });
});
