import { createHash } from 'node:crypto';
import { normalizeForMatch } from './text.ts';

export function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

/**
 * Title key is deliberately lossy: it catches the same order reposted on
 * another board with a different URL and slightly different punctuation.
 */
export function titleKeyOf(title: string): string {
  return normalizeForMatch(title)
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);
}

export function fingerprintOf(input: {
  canonicalUrl?: string;
  title: string;
  text: string;
}): string {
  const basis = input.canonicalUrl
    ? `url:${input.canonicalUrl}`
    : `text:${titleKeyOf(input.title)}|${normalizeForMatch(input.text).slice(0, 600)}`;
  return sha256(basis);
}

// 64 deterministic seed constants for MinHash hashing (32-bit unsigned integers)
const MINHASH_K = 64;
const MINHASH_A: number[] = [];
const MINHASH_B: number[] = [];

// Deterministic seed generation using a linear congruential generator
let seed = 0x12345678;
function nextLcg(): number {
  seed = (Math.imul(1103515245, seed) + 12345) >>> 0;
  return seed;
}
for (let i = 0; i < MINHASH_K; i++) {
  // odd multiplier for full period modulo 2^32
  MINHASH_A.push((nextLcg() | 1) >>> 0);
  MINHASH_B.push(nextLcg() >>> 0);
}

// The seeds and the modulus never change, so their BigInt forms are built once here rather
// than on every (shingle × seed) pair inside the hot loop. Same exact arithmetic, far fewer
// allocations during ingestion (plan 013, step 1).
const MINHASH_A_BIG: bigint[] = MINHASH_A.map((a) => BigInt(a));
const MINHASH_B_BIG: bigint[] = MINHASH_B.map((b) => BigInt(b));
const P32_BIG = BigInt(4294967291); // Largest 32-bit prime

function fnv1a32(str: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/**
 * Computes a compact 64 x 16-bit (128 bytes) MinHash sketch over word 3-grams,
 * encoded as base64url for NIP-01 ["mh", "..."] tags and fast duplicate detection.
 */
export function computeMinHashSketch(normalizedText: string): string {
  if (!normalizedText) {
    return Buffer.alloc(MINHASH_K * 2, 0).toString('base64url');
  }

  const clean = normalizeForMatch(normalizedText)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

  const words = clean ? clean.split(/\s+/).filter((w) => w.length >= 2) : [];
  if (words.length === 0) {
    return Buffer.alloc(MINHASH_K * 2, 0).toString('base64url');
  }

  // Use unique words as tokens for bag-of-words MinHash
  const shingles = Array.from(new Set(words));

  // Pre-fill min values with max 16-bit integer (0xFFFF)
  const minHashes = new Uint16Array(MINHASH_K);
  minHashes.fill(0xffff);

  for (const shingle of shingles) {
    const bigH = BigInt(fnv1a32(shingle));
    for (let i = 0; i < MINHASH_K; i++) {
      // (a * rawH + b) % P32, mapped to 16-bit — identical to the pre-hoisted expression.
      const combined = Number((MINHASH_A_BIG[i]! * bigH + MINHASH_B_BIG[i]!) % P32_BIG) & 0xffff;
      if (combined < (minHashes[i] ?? 0xffff)) {
        minHashes[i] = combined;
      }
    }
  }

  const buffer = Buffer.from(minHashes.buffer, minHashes.byteOffset, minHashes.byteLength);
  return buffer.toString('base64url');
}

/**
 * Decodes a base64url MinHash sketch into a typed Uint16Array.
 * Returns null if the sketch is empty, invalid or corrupt.
 */
export function decodeMinHashSketch(sketch: string): Uint16Array | null {
  if (!sketch) return null;
  try {
    const buf = Buffer.from(sketch, 'base64url');
    if (buf.length !== MINHASH_K * 2) return null;
    if (buf.byteOffset % 2 === 0) {
      return new Uint16Array(buf.buffer, buf.byteOffset, MINHASH_K);
    }
    // If byteOffset in Node's shared buffer pool is odd, allocate an aligned buffer
    const copy = new Uint8Array(buf).slice();
    return new Uint16Array(copy.buffer, 0, MINHASH_K);
  } catch {
    return null;
  }
}

/**
 * Fast zero-copy Jaccard estimation between two already decoded Uint16Array MinHash sketches.
 */
export function estimateJaccardFromUint16(uintA: Uint16Array, uintB: Uint16Array): number {
  let matches = 0;
  for (let i = 0; i < MINHASH_K; i++) {
    if (uintA[i] === uintB[i]) {
      matches++;
    }
  }
  return matches / MINHASH_K;
}

/**
 * Estimates the Jaccard similarity coefficient between two MinHash sketches.
 * Returns a value in [0.0, 1.0].
 * By convention, sketches with similarity >= 0.75 are considered fuzzy duplicates.
 */
export function estimateJaccardFromSketches(mhA: string, mhB: string): number {
  if (!mhA || !mhB) return 0;
  const a = decodeMinHashSketch(mhA);
  const b = decodeMinHashSketch(mhB);
  if (!a || !b) return 0;
  return estimateJaccardFromUint16(a, b);
}

export const MINHASH_BANDS = 16;
export const MINHASH_ROWS_PER_BAND = 4; // 16 bands * 4 hashes = 64

/**
 * Computes 16 band bucket keys for Locality-Sensitive Hashing (LSH).
 * Reduces candidate search for near-duplicates from O(N) linear scans to O(1) indexed lookups.
 */
export function computeMinHashBands(sketch: string): string[] {
  if (!sketch) return [];
  const uint16 = decodeMinHashSketch(sketch);
  if (!uint16) return [];

  const bands: string[] = new Array(MINHASH_BANDS);
  for (let b = 0; b < MINHASH_BANDS; b++) {
    const offset = b * MINHASH_ROWS_PER_BAND;
    const v0 = uint16[offset] ?? 0;
    const v1 = uint16[offset + 1] ?? 0;
    const v2 = uint16[offset + 2] ?? 0;
    const v3 = uint16[offset + 3] ?? 0;
    let h = 0x811c9dc5;
    h = Math.imul(h ^ v0, 0x01000193) >>> 0;
    h = Math.imul(h ^ v1, 0x01000193) >>> 0;
    h = Math.imul(h ^ v2, 0x01000193) >>> 0;
    h = Math.imul(h ^ v3, 0x01000193) >>> 0;
    bands[b] = `b${b}:${h.toString(16)}`;
  }
  return bands;
}
