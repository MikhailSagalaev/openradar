import { describe, expect, it } from 'vitest';
import {
  decryptPrivateKey,
  encryptPrivateKey,
  generateKeyPair,
  importPrivateKey,
  schnorrSign,
  schnorrVerify,
} from '../src/net/keys.ts';
import {
  buildLeadAttestationEvent,
  buildLeadSignalEvent,
  buildRadarLeadEvent,
  computeEventId,
  RadarEventKinds,
  signAndFinalizeEvent,
  verifyRadarEvent,
} from '../src/net/protocol.ts';

describe('Nostr secp256k1 keys & Schnorr BIP-340', () => {
  it('generates valid keypair with npub and nsec encoding', () => {
    const keys = generateKeyPair();
    expect(keys.privKey).toMatch(/^[0-9a-f]{64}$/);
    expect(keys.pubKey).toMatch(/^[0-9a-f]{64}$/);
    expect(keys.nsec).toMatch(/^nsec1[0-9a-z]+$/);
    expect(keys.npub).toMatch(/^npub1[0-9a-z]+$/);

    const reimportedFromNsec = importPrivateKey(keys.nsec);
    expect(reimportedFromNsec.privKey).toBe(keys.privKey);
    expect(reimportedFromNsec.pubKey).toBe(keys.pubKey);

    const reimportedFromHex = importPrivateKey(keys.privKey);
    expect(reimportedFromHex.pubKey).toBe(keys.pubKey);
  });

  it('signs and verifies 32-byte message hashes with BIP-340 Schnorr', () => {
    const keys = generateKeyPair();
    const msgHash = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
    const sig = schnorrSign(msgHash, keys.privKey);

    expect(sig).toMatch(/^[0-9a-f]{128}$/);
    expect(schnorrVerify(sig, msgHash, keys.pubKey)).toBe(true);

    // Tampered message should fail
    const tamperedMsg = 'ffffffff98fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
    expect(schnorrVerify(sig, tamperedMsg, keys.pubKey)).toBe(false);

    // Wrong pubkey should fail
    const otherKeys = generateKeyPair();
    expect(schnorrVerify(sig, msgHash, otherKeys.pubKey)).toBe(false);
  });

  it('encrypts and decrypts private key with AES-256-GCM and scrypt', () => {
    const keys = generateKeyPair();
    const passphrase = 'SuperSecretPassphrase123!';

    const encrypted = encryptPrivateKey(keys.privKey, passphrase);
    expect(encrypted.version).toBe(1);
    expect(encrypted.kdf).toBe('scrypt');
    expect(encrypted.ciphertext.length).toBeGreaterThan(0);

    const decrypted = decryptPrivateKey(encrypted, passphrase);
    expect(decrypted).toBe(keys.privKey);

    // Wrong passphrase fails with authentication error
    expect(() => decryptPrivateKey(encrypted, 'WrongPassword!')).toThrow();
  });
});

describe('radar/1 protocol events & verification', () => {
  it('builds, signs, and verifies a valid RadarLead event (Kind 30402)', () => {
    const keys = generateKeyPair();
    const now = Math.floor(Date.now() / 1000);

    const event = buildRadarLeadEvent({
      contentHash: 'a1b2c3d4e5f6',
      canonicalUrl: 'https://company.com/careers/backend-lead',
      leadType: 'job',
      title: 'Senior Go Developer',
      summary: 'High load systems, microservices, Kafka, ClickHouse',
      platform: 'tg',
      channel: 'golang_jobs',
      extId: '4821',
      minHashSketch: 'test-sketch-b64',
      budgetMin: 400000,
      budgetMax: 500000,
      currency: 'RUB',
      stack: ['golang', 'kafka', 'clickhouse'],
      pubkey: keys.pubKey,
      privKey: keys.privKey,
      createdAt: now,
    });

    expect(event.kind).toBe(RadarEventKinds.RadarLead);
    expect(event.pubkey).toBe(keys.pubKey);
    expect(event.tags).toContainEqual(['d', 'a1b2c3d4e5f6']);
    expect(event.tags).toContainEqual(['t', 'job']);
    expect(event.tags).toContainEqual(['v', 'radar/1']);
    expect(event.tags).toContainEqual(['stack', 'golang', 'kafka', 'clickhouse']);

    const result = verifyRadarEvent(event);
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('detects tampering when content or tags are modified', () => {
    const keys = generateKeyPair();
    const event = buildRadarLeadEvent({
      contentHash: 'hash-123',
      canonicalUrl: 'https://example.com/job/1',
      leadType: 'gig',
      title: 'Landing page',
      summary: 'Clean design',
      pubkey: keys.pubKey,
      privKey: keys.privKey,
    });

    // Valid originally
    expect(verifyRadarEvent(event).valid).toBe(true);

    // Tampered content (1 byte modified)
    const tampered = { ...event, content: event.content + ' ' };
    const res = verifyRadarEvent(tampered);
    expect(res.valid).toBe(false);
    expect(res.error).toContain('Event ID mismatch');
  });

  it('detects tampering when signature is altered', () => {
    const keys = generateKeyPair();
    const event = buildLeadSignalEvent({
      leadEventId: '0'.repeat(64),
      contentHash: 'hash-abc',
      signal: 'scam',
      reason: 'Asks for crypto deposit',
      pubkey: keys.pubKey,
      privKey: keys.privKey,
    });

    // Alter last hex char of signature
    const alteredSig =
      event.sig.slice(0, 127) + (event.sig.charAt(127) === '0' ? '1' : '0');
    const tampered = { ...event, sig: alteredSig };
    const res = verifyRadarEvent(tampered);
    expect(res.valid).toBe(false);
    expect(res.error).toContain('Invalid BIP-340 Schnorr signature');
  });

  it('rejects events with timestamp drift exceeding ±15 minutes', () => {
    const keys = generateKeyPair();
    const nowSec = 1700000000;
    const now = new Date(nowSec * 1000);

    // Event 20 minutes in the past
    const pastEvent = buildLeadAttestationEvent({
      leadEventId: '1'.repeat(64),
      recomputedHash: 'hash-xyz',
      status: 'verified',
      confidence: 0.99,
      pubkey: keys.pubKey,
      privKey: keys.privKey,
      createdAt: nowSec - 1200, // -20 min
    });

    const resPast = verifyRadarEvent(pastEvent, { now });
    expect(resPast.valid).toBe(false);
    expect(resPast.error).toContain('Event timestamp drift exceeds');

    // Event 20 minutes in the future
    const futureEvent = buildLeadAttestationEvent({
      leadEventId: '1'.repeat(64),
      recomputedHash: 'hash-xyz',
      status: 'verified',
      confidence: 0.99,
      pubkey: keys.pubKey,
      privKey: keys.privKey,
      createdAt: nowSec + 1200, // +20 min
    });

    const resFuture = verifyRadarEvent(futureEvent, { now });
    expect(resFuture.valid).toBe(false);
    expect(resFuture.error).toContain('Event timestamp drift exceeds');

    // Event 5 minutes in the past -> valid
    const validEvent = buildLeadAttestationEvent({
      leadEventId: '1'.repeat(64),
      recomputedHash: 'hash-xyz',
      status: 'verified',
      confidence: 0.99,
      pubkey: keys.pubKey,
      privKey: keys.privKey,
      createdAt: nowSec - 300, // -5 min
    });

    const resValid = verifyRadarEvent(validEvent, { now });
    expect(resValid.valid).toBe(true);
  });
});
