/**
 * OpenRadar Rendezvous Hashing (HRW) & Epoch Rotation Engine.
 * Decentralized, deterministic load distribution of crawl sources across active mesh nodes.
 */

import { createHash } from 'node:crypto';

export const EPOCH_DURATION_SEC = 6 * 3600; // 6 hours

/**
 * Returns current 6-hour epoch index.
 */
export function getEpoch(timestampSec: number = Math.floor(Date.now() / 1000)): number {
  return Math.floor(timestampSec / EPOCH_DURATION_SEC);
}

/**
 * Computes deterministic HRW weight for (node, source, epoch) tuple.
 */
export function computeHrwWeight(nodePubkey: string, sourceId: string, epoch: number): bigint {
  const hash = createHash('sha256')
    .update(`${nodePubkey.toLowerCase()}:${sourceId}:${epoch}`)
    .digest('hex');
  return BigInt(`0x${hash}`);
}

/**
 * Assigns a source to the active node with the Highest Random Weight (HRW).
 * Returns node pubkey or null if no nodes are active.
 */
export function assignSourceToNode(
  sourceId: string,
  activeNodePubkeys: string[],
  timestampSec: number = Math.floor(Date.now() / 1000),
): string | null {
  if (!activeNodePubkeys || activeNodePubkeys.length === 0) return null;
  if (activeNodePubkeys.length === 1) return activeNodePubkeys[0]!;

  const epoch = getEpoch(timestampSec);
  let bestNode: string = activeNodePubkeys[0]!;
  let maxWeight = -1n;

  for (const pubkey of activeNodePubkeys) {
    const weight = computeHrwWeight(pubkey, sourceId, epoch);
    if (weight > maxWeight) {
      maxWeight = weight;
      bestNode = pubkey;
    }
  }

  return bestNode;
}

/**
 * Checks whether the current node is assigned to crawl this source in the current epoch.
 */
export function isAssignedToMe(
  sourceId: string,
  myPubkey: string,
  activeNodePubkeys: string[],
  timestampSec?: number,
): boolean {
  const assigned = assignSourceToNode(sourceId, activeNodePubkeys, timestampSec);
  return assigned === myPubkey.toLowerCase();
}

/**
 * Distributes an array of sources across active mesh nodes for a given epoch.
 */
export function assignSourcesToNodes(
  sourceIds: string[],
  activeNodePubkeys: string[],
  timestampSec: number = Math.floor(Date.now() / 1000),
): Map<string, string[]> {
  const distribution = new Map<string, string[]>();
  for (const node of activeNodePubkeys) {
    distribution.set(node, []);
  }

  for (const sourceId of sourceIds) {
    const assigned = assignSourceToNode(sourceId, activeNodePubkeys, timestampSec);
    if (assigned && distribution.has(assigned)) {
      distribution.get(assigned)!.push(sourceId);
    }
  }

  return distribution;
}
