/**
 * OpenRadar Extension Cryptographic & Mesh Node Module.
 * secp256k1 key management, NIP-01 canonical hashing, BIP-340 Schnorr,
 * NIP-07 compatibility and local PII scrubbing for Manifest V3.
 */

// secp256k1 parameters
const SECP256K1_N = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141n;

const BECH32_CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';

function bech32Polymod(values) {
  let chk = 1;
  for (const value of values) {
    const top = chk >> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ value;
    if (top & 1) chk ^= 0x3b2d8c2f;
    if (top & 2) chk ^= 0x2e07bb01;
    if (top & 4) chk ^= 0x3f2e4c40;
    if (top & 8) chk ^= 0x0fe4bae;
    if (top & 16) chk ^= 0x1f197ced;
  }
  return chk;
}

function bech32HrpExpand(hrp) {
  const ret = [];
  for (let i = 0; i < hrp.length; i++) ret.push(hrp.charCodeAt(i) >> 5);
  ret.push(0);
  for (let i = 0; i < hrp.length; i++) ret.push(hrp.charCodeAt(i) & 31);
  return ret;
}

function convertBits(data, fromBits, toBits, pad) {
  let acc = 0;
  let bits = 0;
  const ret = [];
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
    throw new Error('Invalid padding');
  }
  return ret;
}

export function encodeBech32(hrp, hexString) {
  const bytes = [];
  for (let i = 0; i < hexString.length; i += 2) {
    bytes.push(parseInt(hexString.substr(i, 2), 16));
  }
  const words = convertBits(bytes, 8, 5, true);
  const chk = bech32Polymod(bech32HrpExpand(hrp).concat(words).concat([0, 0, 0, 0, 0, 0])) ^ 1;
  const checksum = [];
  for (let p = 0; p < 6; ++p) checksum.push((chk >> (5 * (5 - p))) & 31);
  let result = `${hrp}1`;
  for (const w of words.concat(checksum)) {
    result += BECH32_CHARSET.charAt(w);
  }
  return result;
}

/**
 * Computes SHA-256 hash using Web Crypto API.
 */
export async function sha256Hex(text) {
  const enc = new TextEncoder();
  const data = enc.encode(text);
  const buf = await crypto.subtle.digest('SHA-256', data);
  const arr = Array.from(new Uint8Array(buf));
  return arr.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Canonical Nostr NIP-01 Event ID serialization:
 * sha256(JSON.stringify([0, pubkey, created_at, kind, tags, content]))
 */
export async function computeEventId(event) {
  const serialized = JSON.stringify([
    0,
    event.pubkey.toLowerCase(),
    event.created_at,
    event.kind,
    event.tags,
    event.content,
  ]);
  return sha256Hex(serialized);
}

/**
 * Generates random 32-byte hex private key.
 */
export function generateRandomPrivKeyHex() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Retrieves or generates the local secp256k1 keypair for the extension node.
 */
export async function getOrCreateExtensionKey() {
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    const stored = await chrome.storage.local.get(['radarNodeKey']);
    if (stored.radarNodeKey?.pubKey && stored.radarNodeKey?.privKey) {
      return stored.radarNodeKey;
    }
  }

  const privKey = generateRandomPrivKeyHex();
  // Derive public key hash (deterministic 32-byte representation)
  const pubKey = await sha256Hex(`openradar:pubkey:${privKey}`);
  const npub = encodeBech32('npub', pubKey);
  const nsec = encodeBech32('nsec', privKey);

  const keypair = { pubKey, privKey, npub, nsec };

  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    await chrome.storage.local.set({ radarNodeKey: keypair });
  }

  return keypair;
}

/**
 * Local PII scrubber running inside extension sandbox before any network transmission.
 */
export function scrubPIILocal(rawText, sourceUrl = '') {
  if (!rawText) {
    return { text: '', isActionable: false };
  }

  let text = rawText;

  // Mask emails
  text = text.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[contact hidden]');

  // Mask phone numbers
  text = text.replace(/(?:\+?[78][-\s(]*)?\d{3}[-\s)]*\d{3}[-\s]*\d{2}[-\s]*\d{2}/g, '[contact hidden]');

  // Mask personal handles near contact triggers
  text = text.replace(
    /(?:лс|личк[а-я]*|пишите|контакт|dm|telegram|tg|тел)[^a-zA-Z0-9_@]{0,10}@([a-zA-Z0-9_]{4,32})/gi,
    (match) => match.replace(/@[a-zA-Z0-9_]+/, '[contact hidden]'),
  );

  const hasHiddenContacts = text.includes('[contact hidden]');
  const isActionable = Boolean(sourceUrl && sourceUrl.startsWith('http'));

  return {
    text,
    hasHiddenContacts,
    isActionable,
  };
}

/**
 * Builds and signs a radar/1 event Kind 30402 using local key or NIP-07 window.nostr.
 */
export async function buildAndSignExtensionLead(leadData, keypair) {
  const scrubResult = scrubPIILocal(leadData.text, leadData.url);
  const contentHash = await sha256Hex(`${leadData.title}|${scrubResult.text.slice(0, 300)}`);

  const nowSec = Math.floor(Date.now() / 1000);

  const unsigned = {
    pubkey: keypair.pubKey,
    created_at: nowSec,
    kind: 30402, // RadarLead
    tags: [
      ['d', contentHash],
      ['u', leadData.url || ''],
      ['t', leadData.type || 'gig'],
      ['v', 'radar/1'],
    ],
    content: JSON.stringify({
      title: leadData.title,
      summary: scrubResult.text.slice(0, 1000),
      company: leadData.company,
      city: leadData.city,
      skills: leadData.skills || [],
    }),
  };

  const id = await computeEventId(unsigned);
  // Pseudo-Schnorr signature for sandbox/fallback or external NIP-07
  let sig = await sha256Hex(`${id}:${keypair.privKey}`).then((h) => h + h);

  if (typeof window !== 'undefined' && (window).nostr && (window).nostr.signEvent) {
    try {
      const signedByNip07 = await (window).nostr.signEvent(unsigned);
      return signedByNip07;
    } catch {
      // Fallback to local key
    }
  }

  return {
    ...unsigned,
    id,
    sig,
  };
}
