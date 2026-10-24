/**
 * OpenRadar Nostr secp256k1 Cryptographic Engine (NIP-01 / radar/1).
 * Uses Node.js native OpenSSL engine for fast, secure signing and verification.
 * Supports nsec/npub bech32 encoding and AES-256-GCM local encrypted storage.
 */

import {
  createCipheriv,
  createDecipheriv,
  createPrivateKey,
  createPublicKey,
  randomBytes,
  scryptSync,
  sign,
  verify,
} from 'node:crypto';

// Standard DER headers for secp256k1
const SEC1_DER_PREFIX = '302e0201010420';
const SEC1_DER_SUFFIX = 'a00706052b8104000a'; // OID 1.3.132.0.10 (secp256k1)
const SPKI_COMPRESSED_PREFIX = '3036301006072a8648ce3d020106052b8104000a03220002';

// secp256k1 curve order
const SECP256K1_N = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141n;

/**
 * In BIP-340 / Nostr, the public key is strictly the 32-byte X coordinate
 * of a curve point with an even Y coordinate. If d * G has an odd Y coordinate,
 * we use the negated scalar (N - d) mod N which corresponds to (x, p - y).
 */
export function toEvenParityPrivKeyHex(privHex: string): string {
  let d = BigInt('0x' + privHex);
  const der = Buffer.from(`${SEC1_DER_PREFIX}${d.toString(16).padStart(64, '0')}${SEC1_DER_SUFFIX}`, 'hex');
  const privKey = createPrivateKey({ key: der, format: 'der', type: 'sec1' });
  const pubKey = createPublicKey(privKey);
  const spkiDer = pubKey.export({ type: 'spki', format: 'der' });
  const yIsOdd = ((spkiDer[87] ?? 0) & 1) === 1;
  if (yIsOdd) {
    d = (SECP256K1_N - d) % SECP256K1_N;
    return d.toString(16).padStart(64, '0');
  }
  return privHex.toLowerCase();
}

function privHexToKeyObject(privHex: string) {
  const der = Buffer.from(`${SEC1_DER_PREFIX}${privHex.toLowerCase()}${SEC1_DER_SUFFIX}`, 'hex');
  return createPrivateKey({ key: der, format: 'der', type: 'sec1' });
}

function pubHexToKeyObject(pubHex: string) {
  const der = Buffer.from(`${SPKI_COMPRESSED_PREFIX}${pubHex.toLowerCase()}`, 'hex');
  return createPublicKey({ key: der, format: 'der', type: 'spki' });
}

function rawToDer(rawSig: Buffer): Buffer {
  let r = rawSig.subarray(0, 32);
  let s = rawSig.subarray(32, 64);
  while (r.length > 1 && r[0] === 0) r = r.subarray(1);
  if ((r[0] ?? 0) & 0x80) r = Buffer.concat([Buffer.from([0]), r]);
  while (s.length > 1 && s[0] === 0) s = s.subarray(1);
  if ((s[0] ?? 0) & 0x80) s = Buffer.concat([Buffer.from([0]), s]);
  const len = 4 + r.length + s.length;
  return Buffer.concat([
    Buffer.from([0x30, len, 0x02, r.length]),
    r,
    Buffer.from([0x02, s.length]),
    s,
  ]);
}

function derToRaw(derSig: Buffer): Buffer {
  let offset = 2;
  const rLen = derSig[offset + 1] ?? 0;
  offset += 2;
  const r = derSig.subarray(offset, offset + rLen);
  offset += rLen;
  const sLen = derSig[offset + 1] ?? 0;
  offset += 2;
  const s = derSig.subarray(offset, offset + sLen);

  const rawR = Buffer.alloc(32);
  const rawS = Buffer.alloc(32);
  r.subarray(Math.max(0, r.length - 32)).copy(rawR, Math.max(0, 32 - r.length));
  s.subarray(Math.max(0, s.length - 32)).copy(rawS, Math.max(0, 32 - s.length));
  return Buffer.concat([rawR, rawS]);
}

/**
 * Extracts 32-byte hex public key (X coordinate) from private key hex.
 */
export function getPublicKey(privKeyHex: string): string {
  const privKey = privHexToKeyObject(privKeyHex);
  const pubKey = createPublicKey(privKey);
  const spkiDer = pubKey.export({ type: 'spki', format: 'der' });
  // The X coordinate is at offset -64 to -32
  return spkiDer.subarray(spkiDer.length - 64, spkiDer.length - 32).toString('hex');
}

/**
 * Signs 32-byte message hash with secp256k1 private key.
 * Returns 64-byte hex signature (128 characters).
 */
export function schnorrSign(messageHashHex: string, privKeyHex: string): string {
  const normalizedPrivHex = toEvenParityPrivKeyHex(privKeyHex);
  const privKey = privHexToKeyObject(normalizedPrivHex);
  const msgBytes = Buffer.from(messageHashHex, 'hex');
  const derSig = sign(null, msgBytes, privKey);
  const rawSig = derToRaw(derSig);
  return rawSig.toString('hex');
}

/**
 * Verifies 64-byte hex signature against 32-byte message hash and 32-byte public key.
 */
export function schnorrVerify(
  signatureHex: string,
  messageHashHex: string,
  pubKeyHex: string,
): boolean {
  try {
    if (signatureHex.length !== 128 || pubKeyHex.length !== 64 || messageHashHex.length !== 64) {
      return false;
    }
    const pubKey = pubHexToKeyObject(pubKeyHex);
    const msgBytes = Buffer.from(messageHashHex, 'hex');
    const rawSig = Buffer.from(signatureHex, 'hex');
    const derSig = rawToDer(rawSig);
    return verify(null, msgBytes, pubKey, derSig);
  } catch {
    return false;
  }
}

// --- Bech32 Encoding/Decoding (NIP-19 npub/nsec) ---
const BECH32_CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';

function bech32Polymod(values: number[]): number {
  const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  let chk = 1;
  for (const v of values) {
    const b = chk >> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let i = 0; i < 5; i++) {
      if ((b >> i) & 1) chk ^= GEN[i] ?? 0;
    }
  }
  return chk;
}

function bech32HrpExpand(hrp: string): number[] {
  const ret: number[] = [];
  for (let i = 0; i < hrp.length; i++) ret.push(hrp.charCodeAt(i) >> 5);
  ret.push(0);
  for (let i = 0; i < hrp.length; i++) ret.push(hrp.charCodeAt(i) & 31);
  return ret;
}

function convertBits(data: Uint8Array | number[], fromBits: number, toBits: number, pad: boolean): number[] {
  let acc = 0;
  let bits = 0;
  const ret: number[] = [];
  const maxv = (1 << toBits) - 1;
  for (const value of data) {
    acc = (acc << fromBits) | value;
    bits += fromBits;
    while (bits >= toBits) {
      bits -= toBits;
      ret.push((acc >> bits) & maxv);
    }
  }
  if (pad) {
    if (bits > 0) ret.push((acc << (toBits - bits)) & maxv);
  } else if (bits >= fromBits || ((acc << (toBits - bits)) & maxv)) {
    throw new Error('Invalid padding in bit conversion');
  }
  return ret;
}

export function encodeBech32(hrp: string, hexString: string): string {
  const data = Buffer.from(hexString, 'hex');
  const words = convertBits(data, 8, 5, true);
  const chk = bech32Polymod(bech32HrpExpand(hrp).concat(words).concat([0, 0, 0, 0, 0, 0])) ^ 1;
  const checksum = [];
  for (let p = 0; p < 6; ++p) checksum.push((chk >> (5 * (5 - p))) & 31);
  let result = `${hrp}1`;
  for (const w of words.concat(checksum)) {
    result += BECH32_CHARSET.charAt(w);
  }
  return result;
}

export function decodeBech32(bech32String: string): { hrp: string; hex: string } {
  const str = bech32String.toLowerCase();
  const pos = str.lastIndexOf('1');
  if (pos < 1 || pos + 7 > str.length) throw new Error('Invalid bech32 string');
  const hrp = str.slice(0, pos);
  const data: number[] = [];
  for (let i = pos + 1; i < str.length; i++) {
    const idx = BECH32_CHARSET.indexOf(str.charAt(i));
    if (idx === -1) throw new Error(`Invalid bech32 character: ${str.charAt(i)}`);
    data.push(idx);
  }
  if (bech32Polymod(bech32HrpExpand(hrp).concat(data)) !== 1) {
    throw new Error('Invalid bech32 checksum');
  }
  const words = data.slice(0, -6);
  const bytes = convertBits(words, 5, 8, false);
  return { hrp, hex: Buffer.from(bytes).toString('hex') };
}

export interface KeyPair {
  privKey: string; // 32-byte hex
  pubKey: string;  // 32-byte hex
  nsec: string;
  npub: string;
}

/**
 * Generates a fresh cryptographically secure Nostr keypair.
 */
export function generateKeyPair(): KeyPair {
  let privKeyHex = '';
  while (true) {
    const buf = randomBytes(32);
    // ensure valid private key
    if (buf[0] !== 0 && buf[0] !== 0xff) {
      privKeyHex = buf.toString('hex');
      break;
    }
  }
  const pubKeyHex = getPublicKey(privKeyHex);
  return {
    privKey: privKeyHex,
    pubKey: pubKeyHex,
    nsec: encodeBech32('nsec', privKeyHex),
    npub: encodeBech32('npub', pubKeyHex),
  };
}

/**
 * Imports a keypair from a private key hex or nsec string.
 */
export function importPrivateKey(nsecOrHex: string): KeyPair {
  let privKeyHex = nsecOrHex.trim();
  if (privKeyHex.startsWith('nsec1')) {
    const decoded = decodeBech32(privKeyHex);
    if (decoded.hrp !== 'nsec') throw new Error('Expected nsec HRP');
    privKeyHex = decoded.hex;
  }
  if (!/^[0-9a-fA-F]{64}$/.test(privKeyHex)) {
    throw new Error('Private key must be 32 bytes hex');
  }
  const pubKeyHex = getPublicKey(privKeyHex);
  return {
    privKey: privKeyHex.toLowerCase(),
    pubKey: pubKeyHex.toLowerCase(),
    nsec: encodeBech32('nsec', privKeyHex.toLowerCase()),
    npub: encodeBech32('npub', pubKeyHex.toLowerCase()),
  };
}

// --- Encrypted Local Storage (AES-256-GCM + Scrypt) ---
export interface EncryptedKeyStorage {
  version: 1;
  kdf: 'scrypt';
  salt: string;       // 16 bytes hex
  iv: string;         // 12 bytes hex
  authTag: string;    // 16 bytes hex
  ciphertext: string; // hex
}

/**
 * Encrypts a private key using AES-256-GCM derived via scrypt.
 */
export function encryptPrivateKey(privKeyHex: string, passphrase: string): EncryptedKeyStorage {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = scryptSync(passphrase, salt, 32, { N: 16384, r: 8, p: 1 });

  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(Buffer.from(privKeyHex, 'utf8')),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return {
    version: 1,
    kdf: 'scrypt',
    salt: salt.toString('hex'),
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex'),
    ciphertext: ciphertext.toString('hex'),
  };
}

/**
 * Decrypts a private key from EncryptedKeyStorage with passphrase.
 */
export function decryptPrivateKey(storage: EncryptedKeyStorage, passphrase: string): string {
  if (storage.version !== 1 || storage.kdf !== 'scrypt') {
    throw new Error('Unsupported encrypted key storage version');
  }
  const salt = Buffer.from(storage.salt, 'hex');
  const iv = Buffer.from(storage.iv, 'hex');
  const authTag = Buffer.from(storage.authTag, 'hex');
  const ciphertext = Buffer.from(storage.ciphertext, 'hex');

  const key = scryptSync(passphrase, salt, 32, { N: 16384, r: 8, p: 1 });
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}
