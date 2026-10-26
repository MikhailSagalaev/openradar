/**
 * OpenRadar Relay Subscriber and Ingestion Indexer.
 * Subscribes to decentralized Nostr relays, verifies cryptographic signatures,
 * applies rate limits, and ingests leads with 12-hour Tit-for-Tat lag.
 */

import { randomUUID } from 'node:crypto';
import type { Store } from '../core/store.ts';
import type { Lead } from '../core/types.ts';
import { RelayPool } from '../net/relay-pool.ts';
import {
  verifyRadarEvent,
  RadarEventKinds,
  type NostrEvent,
} from '../net/protocol.ts';

import { handleCanaryAttestation } from '../pipeline/canary.ts';

export interface RelaySubscriberOptions {
  store: Store;
  relayPool: RelayPool;
  lagHours?: number; // default 12 hours
}

export class RelaySubscriber {
  private store: Store;
  private relayPool: RelayPool;
  private lagHours: number;
  private unsubscribeFn: (() => void) | null = null;
  private pubkeyRateLimits = new Map<string, number[]>();

  constructor(options: RelaySubscriberOptions) {
    this.store = options.store;
    this.relayPool = options.relayPool;
    this.lagHours = options.lagHours ?? 12;
  }

  /**
   * Starts listening to Nostr relays for radar/1 protocol events.
   */
  start(): void {
    const filter = {
      kinds: [
        RadarEventKinds.RadarLead,
        RadarEventKinds.LeadSignal,
        RadarEventKinds.LeadAttestation,
      ],
      limit: 100,
    };

    this.unsubscribeFn = this.relayPool.subscribe(
      'openradar-indexer-sub',
      filter,
      async (event, relayUrl) => {
        await this.handleEvent(event, relayUrl);
      },
    );
  }

  /**
   * Stops listening to relays.
   */
  stop(): void {
    if (this.unsubscribeFn) {
      this.unsubscribeFn();
      this.unsubscribeFn = null;
    }
  }

  /**
   * Processes a single verified Nostr event.
   */
  async handleEvent(event: NostrEvent, _relayUrl: string): Promise<boolean> {
    const verification = verifyRadarEvent(event);
    if (!verification.valid) {
      return false;
    }

    if (event.kind === RadarEventKinds.RadarLead) {
      return this.handleRadarLead(event);
    }
    if (event.kind === RadarEventKinds.LeadSignal) {
      return this.handleLeadSignal(event);
    }
    if (event.kind === RadarEventKinds.LeadAttestation) {
      return this.handleLeadAttestation(event);
    }

    return false;
  }

  private checkRateLimit(pubkey: string, isVerified: boolean): boolean {
    const now = Date.now();
    const oneHourAgo = now - 3600 * 1000;
    const maxPerHour = isVerified ? 60 : 10;

    let timestamps = this.pubkeyRateLimits.get(pubkey) || [];
    timestamps = timestamps.filter((t) => t >= oneHourAgo);

    if (timestamps.length >= maxPerHour) {
      return false;
    }

    timestamps.push(now);
    this.pubkeyRateLimits.set(pubkey, timestamps);
    return true;
  }

  private async handleRadarLead(event: NostrEvent): Promise<boolean> {
    const pubkey = event.pubkey;
    const node = this.store.getMeshNode ? await this.store.getMeshNode(pubkey) : null;
    const isVerified = (node?.trust_score ?? 0) >= 0.20;

    // 1. Enforce rate limit (60/hr verified, 10/hr new)
    if (!this.checkRateLimit(pubkey, isVerified)) {
      return false;
    }

    // 2. Parse tags
    let contentHash = '';
    let canonicalUrl = '';
    let leadType: 'job' | 'gig' = 'gig';
    let minHashSketch = '';
    const stack: string[] = [];
    let budgetMin: number | undefined;
    let budgetMax: number | undefined;
    let currency = 'USD';

    for (const tag of event.tags) {
      if (tag[0] === 'd' && tag[1]) contentHash = tag[1];
      else if (tag[0] === 'u' && tag[1]) canonicalUrl = tag[1];
      else if (tag[0] === 't' && (tag[1] === 'job' || tag[1] === 'gig')) leadType = tag[1];
      else if (tag[0] === 'mh' && tag[1]) minHashSketch = tag[1];
      else if (tag[0] === 'stack') stack.push(...tag.slice(1));
      else if (tag[0] === 'budget') {
        if (tag[1]) budgetMin = Number(tag[1]);
        if (tag[2]) budgetMax = Number(tag[2]);
        if (tag[3]) currency = tag[3];
      }
    }

    if (!contentHash) return false;

    // 3. Check for duplicate lead by content hash / fingerprint
    const existingLead = await this.store.findLeadByFingerprint(contentHash);
    if (existingLead) {
      // Record as cross-node peer attestation
      await this.store.recordAttestation({
        nostr_event_id: event.id,
        lead_id: existingLead.id,
        signer_pubkey: pubkey,
        kind: RadarEventKinds.LeadAttestation,
        signal_or_status: 'verified',
        confidence: 0.95,
        raw_event: event as any,
      });

      if (this.store.upsertMeshNode) {
        const isIndependentPeer = existingLead.publisher_pubkey && existingLead.publisher_pubkey !== pubkey;
        const trustBonus = isIndependentPeer ? 0.01 : 0;
        await this.store.upsertMeshNode({
          pubkey: node?.pubkey ?? pubkey,
          npub: node?.npub ?? pubkey,
          trust_score: Math.min(1.0, (node?.trust_score ?? 0.05) + trustBonus),
          valid_leads_7d: (node?.valid_leads_7d ?? 0) + (isIndependentPeer ? 1 : 0),
        });
      }
      return true;
    }

    // 4. Parse content JSON
    let title = 'Untitled Opportunity';
    let summary = '';
    try {
      const parsedContent = JSON.parse(event.content);
      title = parsedContent.title || title;
      summary = parsedContent.summary || event.content;
    } catch {
      summary = event.content;
    }

    // 5. Ingest new lead with Tit-for-Tat 12h lag
    const now = new Date();
    const unlockTime = new Date(now.getTime() + this.lagHours * 3600 * 1000);

    const newLead: Lead = {
      id: randomUUID(),
      sourceId: 'mesh',
      type: leadType,
      title,
      text: summary,
      url: canonicalUrl,
      canonicalUrl,
      fingerprint: contentHash,
      titleKey: title.toLowerCase().slice(0, 100),
      status: 'new',
      score: 75,
      reasons: ['Ingested from OpenRadar mesh node'],
      createdAt: now.toISOString(),
      skills: stack,
      budget: budgetMax ?? budgetMin,
      currency,
      publisher_pubkey: pubkey,
      nostr_event_id: event.id,
      minhash_sketch: minHashSketch,
      verification_state: 'unverified',
      is_mesh_exclusive: true,
      unlocked_at: unlockTime.toISOString(),
      votes_up: 0,
      votes_down: 0,
      votes_scam: 0,
      votes_closed: 0,
    };

    await this.store.insertLead(newLead);

    // Ingest lead, but do not artificially inflate trust score solely based on event volume.
    // Trust score must remain Sybil-resistant (< 0.20) unless cross-verified by peers or GitHub.
    if (this.store.upsertMeshNode) {
      await this.store.upsertMeshNode({
        pubkey,
        npub: node?.npub ?? pubkey,
        trust_score: node?.trust_score ?? 0.05,
        valid_leads_7d: (node?.valid_leads_7d ?? 0) + 1,
      });
    }

    return true;
  }

  private async handleLeadSignal(event: NostrEvent): Promise<boolean> {
    let leadEventId = '';
    let signal = '';

    for (const tag of event.tags) {
      if (tag[0] === 'e' && tag[1]) leadEventId = tag[1];
      else if (tag[0] === 'signal' && tag[1]) signal = tag[1];
    }

    if (!leadEventId || !signal) return false;

    // Find lead by nostr_event_id or fingerprint
    const leads = await this.store.listLeads({ limit: 100 });
    const targetLead = leads.find((l) => l.nostr_event_id === leadEventId || l.fingerprint === leadEventId);

    if (!targetLead) return false;

    if (signal === 'useful' || signal === 'junk' || signal === 'scam' || signal === 'closed') {
      const voteResult = await this.store.recordVote(targetLead.id, signal as any, 1.0);
      if ((signal === 'scam' && voteResult.votes_scam >= 2) || (signal === 'closed' && voteResult.votes_closed >= 2)) {
        await this.store.enqueueArbiterCheck(targetLead.id, signal === 'scam' ? 'scam_threshold' : 'closed_report');
      }
    }

    return true;
  }

  private async handleLeadAttestation(event: NostrEvent): Promise<boolean> {
    // Canary Trap check against blind automated attestations
    const canaryCheck = await handleCanaryAttestation(event, this.store);
    if (canaryCheck.caught) {
      return false;
    }

    let leadEventId = '';
    let status = '';

    for (const tag of event.tags) {
      if (tag[0] === 'e' && tag[1]) leadEventId = tag[1];
      else if (tag[0] === 'status' && tag[1]) status = tag[1];
    }

    if (!leadEventId || !status) return false;

    const leads = await this.store.listLeads({ limit: 100 });
    const targetLead = leads.find((l) => l.nostr_event_id === leadEventId || l.fingerprint === leadEventId);
    if (!targetLead) return false;

    await this.store.recordAttestation({
      nostr_event_id: event.id,
      lead_id: targetLead.id,
      signer_pubkey: event.pubkey,
      kind: RadarEventKinds.LeadAttestation,
      signal_or_status: status,
      raw_event: event as any,
    });

    return true;
  }
}
