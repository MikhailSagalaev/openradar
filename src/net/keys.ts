/**
 * Participant keys: secp256k1, NIP-01 events.
 * BIP-340 Schnorr signatures via the audited @noble/curves implementation.
 * Supports nsec/npub bech32 encoding and AES-256-GCM local encrypted storage.
 */

import { schnorr, secp256k1 } from '@noble/curves/secp256k1.js';
// secp256k1 curve order (kept for scalar negation)
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from 'node:crypto';

// secp256k1 curve order
const SECP256K1_N = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141n;

/**
 * In BIP-340 / Nostr, the public key is strictly the 32-byte X coordinate
 * of a curve point with an even Y coordinate. If d * G has an odd Y coordinate,
 * we use the negated scalar (N - d) mod N which corresponds to (x, p - y).
 * noble signs correctly either way, but derived-key bookkeeping wants the
 * canonical even-parity scalar.
 */
function privScalarToBytes(d: bigint): Uint8Array {
  return Buffer.from(d.toString(16).padStart(64, '0'), 'hex');
}

export function toEvenParityPrivKeyHex(privHex: string): string {
  let d = BigInt('0x' + privHex);
  const compressed = secp256k1.getPublicKey(privScalarToBytes(d), true);
  if (compressed[0] === 3) {
    d = (SECP256K1_N - d) % SECP256K1_N;
    return d.toString(16).padStart(64, '0');
  }
  return privHex.toLowerCase();
}

/**
 * Extracts 32-byte hex public key (X coordinate) from private key hex.
 */
export function getPublicKey(privKeyHex: string): string {
  const compressed = secp256k1.getPublicKey(Buffer.from(privKeyHex, 'hex'), true);
  // 33-byte compressed point: 0x02/0x03 prefix + 32-byte X
  return Buffer.from(compressed.subarray(1)).toString('hex');
}

/**
 * Signs 32-byte message hash with BIP-340 Schnorr.
 * Returns 64-byte hex signature (128 characters).
 */
export function schnorrSign(messageHashHex: string, privKeyHex: string): string {
  const msgBytes = Buffer.from(messageHashHex, 'hex');
  const privBytes = Buffer.from(privKeyHex, 'hex');
  return Buffer.from(schnorr.sign(msgBytes, privBytes)).toString('hex');
}

/**
 * Verifies a 64-byte BIP-340 Schnorr signature against the 32-byte message
 * hash and 32-byte x-only public key.
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
    return schnorr.verify(
      Buffer.from(signatureHex, 'hex'),
      Buffer.from(messageHashHex, 'hex'),
      Buffer.from(pubKeyHex, 'hex'),
    );
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
