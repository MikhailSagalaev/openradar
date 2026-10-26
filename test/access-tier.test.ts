import { describe, expect, it } from 'vitest';
import { determineAccessTier, filterLeadsForViewer } from '../src/core/access-tier.ts';
import { RelaySubscriber } from '../src/index/relay-subscriber.ts';
import { RelayPool } from '../src/net/relay-pool.ts';
import { MemoryStore } from '../src/store/memory.ts';
import { generateKeyPair } from '../src/net/keys.ts';
import { buildRadarLeadEvent } from '../src/net/protocol.ts';
import type { Lead } from '../src/core/types.ts';

describe('Tit-for-Tat access tier & 12h lag (radar/1)', () => {
  it('identifies active contributors and guests correctly', () => {
    const adminTier = determineAccessTier({ isAdmin: true });
    expect(adminTier.tier).toBe('active_contributor');
    expect(adminTier.isRealtime).toBe(true);

    const contributorByLeads = determineAccessTier({
      meshNode: {
        pubkey: 'node1',
        npub: 'npub1',
        trust_score: 0.1,
        valid_leads_7d: 3,
        valid_attestations_24h: 0,
        false_reports_count: 0,
        created_at: new Date().toISOString(),
        last_seen_at: new Date().toISOString(),
      },
    });
    expect(contributorByLeads.tier).toBe('active_contributor');
    expect(contributorByLeads.isRealtime).toBe(true);

    const contributorByAttestations = determineAccessTier({
      meshNode: {
        pubkey: 'node2',
        npub: 'npub2',
        trust_score: 0.1,
        valid_leads_7d: 0,
        valid_attestations_24h: 10,
        false_reports_count: 0,
        created_at: new Date().toISOString(),
        last_seen_at: new Date().toISOString(),
      },
    });
    expect(contributorByAttestations.tier).toBe('active_contributor');

    const contributorByGithubTrust = determineAccessTier({
      meshNode: {
        pubkey: 'node3',
        npub: 'npub3',
        trust_score: 0.40, // verified github
        valid_leads_7d: 0,
        valid_attestations_24h: 0,
        false_reports_count: 0,
        created_at: new Date().toISOString(),
        last_seen_at: new Date().toISOString(),
      },
    });
    expect(contributorByGithubTrust.tier).toBe('active_contributor');

    // Expired GitHub trial (> 7 days ago) with no active contribution must be downgraded to free_rider
    const eightDaysAgo = new Date(Date.now() - 8 * 86400 * 1000).toISOString();
    const expiredGithubTrial = determineAccessTier({
      meshNode: {
        pubkey: 'node-expired',
        npub: 'npub-expired',
        trust_score: 0.40,
        github_verified_at: eightDaysAgo,
        created_at: eightDaysAgo,
        valid_leads_7d: 0,
        valid_attestations_24h: 0,
        false_reports_count: 0,
        last_seen_at: new Date().toISOString(),
      },
    });
    expect(expiredGithubTrial.tier).toBe('free_rider');
    expect(expiredGithubTrial.isRealtime).toBe(false);

    // Expired GitHub trial but node submitted >= 3 leads: promoted back to active_contributor
    const expiredTrialWithLeads = determineAccessTier({
      meshNode: {
        pubkey: 'node-recovered',
        npub: 'npub-recovered',
        trust_score: 0.40,
        github_verified_at: eightDaysAgo,
        created_at: eightDaysAgo,
        valid_leads_7d: 3,
        valid_attestations_24h: 0,
        false_reports_count: 0,
        last_seen_at: new Date().toISOString(),
      },
    });
    expect(expiredTrialWithLeads.tier).toBe('active_contributor');
    expect(expiredTrialWithLeads.isRealtime).toBe(true);

    const guestTier = determineAccessTier({
      meshNode: null,
      user: null,
    });
    expect(guestTier.tier).toBe('free_rider');
    expect(guestTier.isRealtime).toBe(false);
  });

  it('filters mesh-exclusive leads for free-riders while showing them to contributors', () => {
    const now = new Date();
    const future = new Date(now.getTime() + 12 * 3600 * 1000).toISOString();
    const past = new Date(now.getTime() - 3600 * 1000).toISOString();

    const publicLead: Lead = {
      id: 'lead-pub-1',
      sourceId: 'rss',
      title: 'Public RSS Lead',
      text: 'Public job',
      fingerprint: 'fp-pub',
      titleKey: 'public rss lead',
      status: 'new',
      score: 50,
      reasons: [],
      createdAt: past,
      is_mesh_exclusive: false,
      unlocked_at: past,
    };

    const meshExclusiveLead: Lead = {
      id: 'lead-mesh-1',
      sourceId: 'mesh',
      title: 'Exclusive High Paying Lead',
      text: 'Mesh lead with 12h lag',
      fingerprint: 'fp-mesh',
      titleKey: 'exclusive high paying lead',
      status: 'new',
      score: 90,
      reasons: [],
      createdAt: now.toISOString(),
      is_mesh_exclusive: true,
      unlocked_at: future,
    };

    const allLeads = [publicLead, meshExclusiveLead];

    const contributorTier = determineAccessTier({ isAdmin: true });
    const guestTier = determineAccessTier({});

    // Active contributor sees both immediately
    const resContributor = filterLeadsForViewer(allLeads, contributorTier, now);
    expect(resContributor.visibleLeads).toHaveLength(2);
    expect(resContributor.lockedCount).toBe(0);

    // Free rider sees only the public lead; the mesh lead is locked
    const resGuest = filterLeadsForViewer(allLeads, guestTier, now);
    expect(resGuest.visibleLeads).toHaveLength(1);
    expect(resGuest.visibleLeads[0]!.id).toBe('lead-pub-1');
    expect(resGuest.lockedCount).toBe(1);
  });

  it('RelaySubscriber ingests mesh lead with 12h lag and records attestation on duplicate', async () => {
    const store = new MemoryStore();
    const relayPool = new RelayPool({ relays: [] });
    const subscriber = new RelaySubscriber({ store, relayPool, lagHours: 12 });

    const keys1 = generateKeyPair();
    const event1 = buildRadarLeadEvent({
      contentHash: 'hash-unique-1',
      canonicalUrl: 'https://example.com/job/unique',
      leadType: 'job',
      title: 'Staff Platform Engineer',
      summary: 'Kubernetes, Go, ArgoCD',
      pubkey: keys1.pubKey,
      privKey: keys1.privKey,
    });

    // 1. Ingest brand new lead from node 1
    const handled1 = await subscriber.handleEvent(event1, 'wss://relay.mock');
    expect(handled1).toBe(true);

    const leads = await store.listLeads();
    expect(leads).toHaveLength(1);
    const ingested = leads[0]!;
    expect(ingested.title).toBe('Staff Platform Engineer');
    expect(ingested.is_mesh_exclusive).toBe(true);
    expect(ingested.unlocked_at).toBeDefined();

    // Verify 12h lag
    const unlockTime = new Date(ingested.unlocked_at!).getTime();
    const diffHours = (unlockTime - Date.now()) / (3600 * 1000);
    expect(diffHours).toBeGreaterThan(11.9);
    expect(diffHours).toBeLessThanOrEqual(12.1);

    // 2. Second node discovers and submits the exact same lead (content_hash)
    const keys2 = generateKeyPair();
    const event2 = buildRadarLeadEvent({
      contentHash: 'hash-unique-1',
      canonicalUrl: 'https://example.com/job/unique',
      leadType: 'job',
      title: 'Staff Platform Engineer',
      summary: 'Kubernetes, Go, ArgoCD',
      pubkey: keys2.pubKey,
      privKey: keys2.privKey,
    });

    const handled2 = await subscriber.handleEvent(event2, 'wss://relay.mock');
    expect(handled2).toBe(true);

    // Duplicate is not inserted again, but counted as peer attestation
    const leadsAfter = await store.listLeads();
    expect(leadsAfter).toHaveLength(1);
    const updatedLead = await store.getLead(ingested.id);
    expect(updatedLead?.attestation_count).toBeGreaterThanOrEqual(1);
  });

  it('does not inflate trust score based purely on event volume (Sybil resistance)', async () => {
    const store = new MemoryStore();
    const relayPool = new RelayPool({ relays: [] });
    const subscriber = new RelaySubscriber({ store, relayPool, lagHours: 12 });

    const spammerKeys = generateKeyPair();

    for (let i = 0; i < 20; i++) {
      const event = buildRadarLeadEvent({
        contentHash: `spam-lead-${i}`,
        canonicalUrl: `https://example.com/job/spam-${i}`,
        leadType: 'job',
        title: `Spam Job ${i}`,
        summary: `Job description ${i}`,
        pubkey: spammerKeys.pubKey,
        privKey: spammerKeys.privKey,
      });
      await subscriber.handleEvent(event, 'wss://relay.mock');
    }

    const node = await store.getMeshNode(spammerKeys.pubKey);
    expect(node).toBeDefined();
    expect(node!.trust_score).toBeLessThan(0.20);
    expect(node!.trust_score).toBe(0.05);
  });
});
