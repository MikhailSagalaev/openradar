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
  buildHttpAuthHeader,
  buildObservationEvent,
  buildSignalEvent,
  computeEventId,
  eventTimeError,
  parseSrcTag,
  RadarKinds,
  signEvent,
  tagValue,
  verifyEvent,
  verifyHttpAuth,
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

describe('radar/2 events', () => {
  const keys = generateKeyPair();

  it('signs an observation with src/msg/vis tags and drops raw', () => {
    const event = buildObservationEvent(
      { source: { platform: 'telegram', channel: '-100,1', visibility: 'private', message_id: 5 }, text: 'hi', raw: { secret: 1 } },
      keys.privKey,
    );
    expect(event.kind).toBe(RadarKinds.Observation);
    expect(event.pubkey).toBe(keys.pubKey);
    expect(tagValue(event, 'msg')).toBe('5');
    expect(parseSrcTag(tagValue(event, 'src'))).toEqual({ platform: 'telegram', channel: '-100,1' });
    expect(JSON.parse(event.content).raw).toBeUndefined();
    expect(verifyEvent(event).ok).toBe(true);
  });

  it('detects tampering with content, tags, id and signature', () => {
    const event = buildSignalEvent({ leadId: 'lead-1', signal: 'useful' }, keys.privKey);
    expect(verifyEvent({ ...event, content: 'x' }).error).toBe('bad_id');
    const retagged = { ...event, tags: [['lead', 'lead-2']] };
    expect(verifyEvent(retagged).error).toBe('bad_id');
    const forged = { ...retagged, id: computeEventId(retagged) };
    expect(verifyEvent(forged).error).toBe('bad_signature');
    expect(verifyEvent({ ...event, sig: 'zz' }).error).toMatch(/^malformed/);
    const other = generateKeyPair();
    const swapped = { ...event, pubkey: other.pubKey };
    expect(verifyEvent({ ...swapped, id: computeEventId(swapped) }).error).toBe('bad_signature');
  });

  it('accepts created_at from 30 days back to 10 minutes ahead', () => {
    const now = new Date('2026-10-26T12:00:00Z');
    const sec = Math.floor(now.getTime() / 1000);
    expect(eventTimeError(sec, now)).toBeUndefined();
    expect(eventTimeError(sec + 601, now)).toBe('created_at_in_future');
    expect(eventTimeError(sec - 31 * 24 * 3600, now)).toBe('created_at_too_old');
  });

  it('builds and verifies HTTP auth bound to URL, method, body and time', () => {
    const now = new Date();
    const createdAt = Math.floor(now.getTime() / 1000);
    const body = '{"a":1}';
    const header = buildHttpAuthHeader({ url: 'https://hub.example/v2/me?x=1', method: 'post', body, createdAt }, keys.privKey);
    const ok = verifyHttpAuth(header, { url: 'https://hub.example/v2/me?x=1', method: 'POST', body }, now);
    expect(ok).toMatchObject({ ok: true, pubkey: keys.pubKey });
    expect(verifyHttpAuth(header, { url: 'https://hub.example/v2/feed?x=1', method: 'POST', body }, now).error).toBe('url_mismatch');
    expect(verifyHttpAuth(header, { url: 'https://hub.example/v2/me?x=1', method: 'GET', body }, now).error).toBe('method_mismatch');
    expect(verifyHttpAuth(header, { url: 'https://hub.example/v2/me?x=1', method: 'POST', body: '{}' }, now).error).toBe('payload_mismatch');
    expect(verifyHttpAuth(header, { url: 'https://hub.example/v2/me?x=1', method: 'POST', body }, new Date(now.getTime() + 120_000)).error).toBe('expired');
    const wrongKind = signEvent({ kind: 1, tags: [['u', 'https://hub.example/'], ['method', 'GET']], content: '' }, keys.privKey);
    const wrongHeader = `Nostr ${Buffer.from(JSON.stringify(wrongKind)).toString('base64')}`;
    expect(verifyHttpAuth(wrongHeader, { url: 'https://hub.example/', method: 'GET' }).error).toBe('wrong_kind');
    expect(verifyHttpAuth('Bearer x', { url: 'https://hub.example/', method: 'GET' }).error).toBe('missing');
  });
});
