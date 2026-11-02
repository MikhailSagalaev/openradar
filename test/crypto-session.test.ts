import { describe, expect, it } from 'vitest';
import {
  decryptTelegramSession,
  deriveUserSessionKey,
  encryptTelegramSession,
} from '../src/core/crypto-session.ts';

const SECRET = 'test-master-secret-key-at-least-16-chars';
const USER_A = 'user-uuid-1234';
const USER_B = 'user-uuid-5678';
const DUMMY_SESSION = '1BVtsOKIBux2Xf8934kjshf89234jsdf-fake-session-string';

describe('Telegram session encryption with AES-256-GCM + AAD', () => {
  it('encrypts and decrypts session successfully', () => {
    const encrypted = encryptTelegramSession(DUMMY_SESSION, SECRET, USER_A);
    expect(encrypted.session_encrypted).toBeDefined();
    expect(encrypted.iv).toBeDefined();
    expect(encrypted.tag).toBeDefined();

    const decrypted = decryptTelegramSession(encrypted, SECRET, USER_A);
    expect(decrypted).toBe(DUMMY_SESSION);
  });

  it('fails decryption if userId (AAD) does not match the encrypted payload', () => {
    const encrypted = encryptTelegramSession(DUMMY_SESSION, SECRET, USER_A);
    expect(() => {
      decryptTelegramSession(encrypted, SECRET, USER_B);
    }).toThrow();
  });

  it('fails decryption if ciphertext or tag is tampered with', () => {
    const encrypted = encryptTelegramSession(DUMMY_SESSION, SECRET, USER_A);
    const tampered = {
      ...encrypted,
      session_encrypted: Buffer.from('corrupted-data').toString('base64'),
    };
    expect(() => {
      decryptTelegramSession(tampered, SECRET, USER_A);
    }).toThrow();
  });

  it('supports numeric user IDs seamlessly', () => {
    const numUser = 42;
    const encrypted = encryptTelegramSession(DUMMY_SESSION, SECRET, numUser);
    const decrypted = decryptTelegramSession(encrypted, SECRET, numUser);
    expect(decrypted).toBe(DUMMY_SESSION);
  });

  it('enforces secret length >= 16', () => {
    expect(() => {
      deriveUserSessionKey('too-short', USER_A);
    }).toThrow('RADAR_WEB_KEY_SECRET must be at least 16 characters long');
  });
});
