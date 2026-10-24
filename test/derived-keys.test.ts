import { describe, expect, it } from 'vitest';
import { deriveChildKeyPair, computeWeekEpoch, isSameWeekEpoch } from '../src/net/derived-keys.ts';
import { generateKeyPair } from '../src/net/keys.ts';
import { buildRadarLeadEvent, verifyRadarEvent } from '../src/net/protocol.ts';

describe('Blinded Relaying & Ephemeral Child Keys (radar/1)', () => {
  it('computes week epochs and matches timestamps in same 7-day period', () => {
    const epoch0 = 2800;
    const t0 = epoch0 * 7 * 86400; // aligned to epoch start
    const tSameWeek = t0 + 3 * 86400; // +3 days
    const tNextWeek = t0 + 8 * 86400; // +8 days

    expect(isSameWeekEpoch(t0, tSameWeek)).toBe(true);
    expect(isSameWeekEpoch(t0, tNextWeek)).toBe(false);
    expect(computeWeekEpoch(tNextWeek)).toBe(epoch0 + 1);
  });

  it('derives identical child keys for same master key, source, and epoch', () => {
    const master = generateKeyPair();
    const ts = 1700000000;

    const child1 = deriveChildKeyPair(master.privKey, 'tg:closed_dev_chat', ts);
    const child2 = deriveChildKeyPair(master.privKey, 'tg:closed_dev_chat', ts);

    expect(child1.pubKey).toBe(child2.pubKey);
    expect(child1.privKey).toBe(child2.privKey);
    expect(child1.pubKey).toHaveLength(64);
  });

  it('guarantees channel unlinkability: distinct sources yield distinct pubkeys', () => {
    const master = generateKeyPair();
    const ts = 1700000000;

    const childChannelA = deriveChildKeyPair(master.privKey, 'tg:private_vip_jobs', ts);
    const childChannelB = deriveChildKeyPair(master.privKey, 'tg:public_board_feed', ts);

    expect(childChannelA.pubKey).not.toBe(childChannelB.pubKey);
    expect(childChannelA.pubKey).not.toBe(master.pubKey);
    expect(childChannelB.pubKey).not.toBe(master.pubKey);
  });

  it('rotates child keys across week epochs for forward privacy', () => {
    const master = generateKeyPair();
    const week1 = 1700000000;
    const week2 = 1700000000 + 8 * 86400;

    const childWeek1 = deriveChildKeyPair(master.privKey, 'tg:channel_1', week1);
    const childWeek2 = deriveChildKeyPair(master.privKey, 'tg:channel_1', week2);

    expect(childWeek1.pubKey).not.toBe(childWeek2.pubKey);
  });

  it('signs valid radar/1 events that pass BIP-340 verification', () => {
    const master = generateKeyPair();
    const child = deriveChildKeyPair(master.privKey, 'tg:confidential_leads');

    const event = buildRadarLeadEvent({
      contentHash: 'a'.repeat(64),
      canonicalUrl: 'https://example.com/jobs/blinded-lead',
      leadType: 'job',
      title: 'Senior Cryptographer',
      summary: 'Building zero-knowledge proofs and mesh protocols',
      pubkey: child.pubKey,
      privKey: child.privKey,
    });

    const verification = verifyRadarEvent(event);
    expect(verification.valid).toBe(true);
    expect(event.pubkey).toBe(child.pubKey);
  });
});
