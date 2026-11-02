import crypto from 'node:crypto';

export interface EncryptedSessionPayload {
  session_encrypted: string;
  iv: string;
  tag: string;
}

export function deriveUserSessionKey(masterSecret: string, userId: string | number): Buffer {
  if (!masterSecret || masterSecret.length < 16) {
    throw new Error('RADAR_WEB_KEY_SECRET must be at least 16 characters long');
  }
  const derived = crypto.hkdfSync(
    'sha256',
    Buffer.from(masterSecret, 'utf8'),
    Buffer.from(String(userId), 'utf8'),
    Buffer.from('openradar-mtproto-session-v1', 'utf8'),
    32,
  );
  return Buffer.from(derived);
}

export function encryptTelegramSession(
  plainSession: string,
  masterSecret: string,
  userId: string | number,
): EncryptedSessionPayload {
  const key = deriveUserSessionKey(masterSecret, userId);
  const iv = crypto.randomBytes(12); // 96-bit IV for AES-GCM
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(String(userId), 'utf8'));

  const encrypted = Buffer.concat([
    cipher.update(plainSession, 'utf8'),
    cipher.final(),
  ]);

  return {
    session_encrypted: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
  };
}

export function decryptTelegramSession(
  payload: EncryptedSessionPayload,
  masterSecret: string,
  userId: string | number,
): string {
  const key = deriveUserSessionKey(masterSecret, userId);
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(payload.iv, 'base64'),
  );
  decipher.setAAD(Buffer.from(String(userId), 'utf8'));
  decipher.setAuthTag(Buffer.from(payload.tag, 'base64'));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(payload.session_encrypted, 'base64')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}
