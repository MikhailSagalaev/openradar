/**
 * OpenRadar Blinded Relaying Engine (radar/1).
 * Derives ephemeral child keypairs per source and per week epoch:
 * privkey_child = HMAC-SHA256(master_privkey, source_id || week_epoch)
 *
 * Protects channel scouts and contributors from cross-channel correlation attacks
 * by network surveillance adversaries.
 */

import { createHmac } from 'node:crypto';
import {
  encodeBech32,
  getPublicKey,
  importPrivateKey,
  toEvenParityPrivKeyHex,
  type KeyPair,
} from './keys.ts';

const SECONDS_PER_WEEK = 7 * 86400;

/**
 * Computes the 7-day integer epoch number for a given unix timestamp.
 */
export function computeWeekEpoch(timestampSec: number = Math.floor(Date.now() / 1000)): number {
  return Math.floor(timestampSec / SECONDS_PER_WEEK);
}

/**
 * Derives a deterministic child keypair for a specific source and week epoch.
 * Even-parity adjustment guarantees compatibility with BIP-340 Schnorr signatures.
 */
export function deriveChildKeyPair(
  masterPrivKeyOrNsec: string,
  sourceId: string,
  epochTimestampSec: number = Math.floor(Date.now() / 1000),
): KeyPair {
  let masterPrivHex = masterPrivKeyOrNsec.trim();
  if (masterPrivHex.startsWith('nsec1')) {
    masterPrivHex = importPrivateKey(masterPrivHex).privKey;
  }

  const weekEpoch = computeWeekEpoch(epochTimestampSec);
  const data = `${sourceId.trim()}:week:${weekEpoch}`;

  const rawChildPrivHex = createHmac('sha256', Buffer.from(masterPrivHex, 'hex'))
    .update(data, 'utf8')
    .digest('hex');

  // Enforce BIP-340 even parity on curve point
  const privKey = toEvenParityPrivKeyHex(rawChildPrivHex);
  const pubKey = getPublicKey(privKey);

  return {
    privKey,
    pubKey,
    nsec: encodeBech32('nsec', privKey),
    npub: encodeBech32('npub', pubKey),
  };
}

/**
 * Verifies if two timestamps fall into the same 7-day privacy epoch.
 */
export function isSameWeekEpoch(tsSecA: number, tsSecB: number): boolean {
  return computeWeekEpoch(tsSecA) === computeWeekEpoch(tsSecB);
}
