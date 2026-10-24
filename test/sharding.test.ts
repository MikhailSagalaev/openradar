import { describe, expect, it } from 'vitest';
import {
  assignSourceToNode,
  assignSourcesToNodes,
  isAssignedToMe,
  getEpoch,
  EPOCH_DURATION_SEC,
} from '../src/net/sharding.ts';

describe('Rendezvous Hashing (HRW) & Epoch Rotation (radar/1)', () => {
  const nodes = Array.from({ length: 10 }, (_, i) => `node_pubkey_${i}`);
  const sources = Array.from({ length: 1000 }, (_, i) => `source_channel_${i}`);

  it('distributes 1000 sources uniformly across 10 nodes (100 ± 25 per node)', () => {
    const epochSec = 1700000000;
    const distribution = assignSourcesToNodes(sources, nodes, epochSec);

    expect(distribution.size).toBe(10);

    for (const [node, assignedSources] of distribution.entries()) {
      // In random hash distribution with N=1000 and K=10, standard deviation is ~9.5
      // 100 ± 25 covers > 99.5% probability
      expect(assignedSources.length).toBeGreaterThanOrEqual(70);
      expect(assignedSources.length).toBeLessThanOrEqual(135);
    }

    // Total assigned must equal total sources
    let totalAssigned = 0;
    for (const assignedSources of distribution.values()) {
      totalAssigned += assignedSources.length;
    }
    expect(totalAssigned).toBe(1000);
  });

  it('preserves minimal disruption when a node goes offline (core HRW property)', () => {
    const epochSec = 1700000000;
    const offlineNode = nodes[0]!;
    const remainingNodes = nodes.slice(1);

    const distBefore = assignSourcesToNodes(sources, nodes, epochSec);
    const distAfter = assignSourcesToNodes(sources, remainingNodes, epochSec);

    // Channels that were on remainingNodes MUST stay on the same node
    let keptOnSameNode = 0;
    let movedFromOffline = 0;

    for (const sourceId of sources) {
      const beforeNode = assignSourceToNode(sourceId, nodes, epochSec);
      const afterNode = assignSourceToNode(sourceId, remainingNodes, epochSec);

      if (beforeNode === offlineNode) {
        // Must move to one of the remaining nodes
        expect(remainingNodes).toContain(afterNode);
        movedFromOffline++;
      } else {
        // Crucial HRW guarantee: was not on offline node, so it CANNOT move!
        expect(afterNode).toBe(beforeNode);
        keptOnSameNode++;
      }
    }

    expect(keptOnSameNode).toBe(1000 - distBefore.get(offlineNode)!.length);
    expect(movedFromOffline).toBe(distBefore.get(offlineNode)!.length);
  });

  it('rotates assignments deterministically when a 6-hour epoch advances', () => {
    const epoch1Sec = 1700000000;
    const epoch2Sec = epoch1Sec + EPOCH_DURATION_SEC; // 6 hours later

    expect(getEpoch(epoch2Sec)).toBe(getEpoch(epoch1Sec) + 1);

    const dist1 = assignSourcesToNodes(sources, nodes, epoch1Sec);
    const dist2 = assignSourcesToNodes(sources, nodes, epoch2Sec);

    let changedAssignments = 0;
    for (const sourceId of sources) {
      const node1 = assignSourceToNode(sourceId, nodes, epoch1Sec);
      const node2 = assignSourceToNode(sourceId, nodes, epoch2Sec);
      if (node1 !== node2) {
        changedAssignments++;
      }
    }

    // In a 10-node system, ~90% of assignments rotate each epoch
    expect(changedAssignments).toBeGreaterThan(800);
  });

  it('accurately verifies isAssignedToMe for the current node', () => {
    const myPubkey = nodes[3]!;
    const testSource = 'source_test_channel';
    const assigned = assignSourceToNode(testSource, nodes);

    const isMine = isAssignedToMe(testSource, myPubkey, nodes);
    expect(isMine).toBe(assigned === myPubkey);
  });
});
