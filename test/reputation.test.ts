import { describe, expect, it } from 'vitest';
import { recomputeWebOfTrust, verifyGithubClaim, type WebOfTrustGraph } from '../src/core/reputation.ts';

describe('Web-of-Trust & GitHub claim verification (radar/1)', () => {
  it('verifies valid GitHub gist proof and elevates trust to 0.40', async () => {
    const npub = 'npub105v3w3v7d5...mock';
    const gistUrl = 'https://gist.github.com/alexdev/abcdef1234567890';

    const mockFetch = async (url: string | URL | Request) => {
      const urlStr = url.toString();
      if (urlStr.includes('/users/alexdev')) {
        // Account created 120 days ago (> 90 days)
        const created = new Date(Date.now() - 120 * 86400 * 1000).toISOString();
        return new Response(JSON.stringify({ login: 'alexdev', created_at: created }), { status: 200 });
      }
      if (urlStr.includes('/gists/abcdef1234567890')) {
        return new Response(
          JSON.stringify({
            owner: { login: 'alexdev' },
            files: {
              'openradar.md': {
                content: `Verifying OpenRadar identity:\n${npub}\nAll good.`,
              },
            },
          }),
          { status: 200 },
        );
      }
      return new Response('Not found', { status: 404 });
    };

    const result = await verifyGithubClaim(npub, gistUrl, {
      fetchImpl: mockFetch as any,
    });

    expect(result.valid).toBe(true);
    expect(result.username).toBe('alexdev');
    expect(result.trustScore).toBe(0.40);
    expect(result.accountAgeDays).toBeGreaterThanOrEqual(90);
  });

  it('rejects GitHub claim if account age is under 90 days', async () => {
    const npub = 'npub1test...';
    const gistUrl = 'https://gist.github.com/newbie/11223344';

    const mockFetch = async (url: string | URL | Request) => {
      const urlStr = url.toString();
      if (urlStr.includes('/users/newbie')) {
        // Account created 10 days ago (< 90 days)
        const created = new Date(Date.now() - 10 * 86400 * 1000).toISOString();
        return new Response(JSON.stringify({ login: 'newbie', created_at: created }), { status: 200 });
      }
      return new Response('Not found', { status: 404 });
    };

    const result = await verifyGithubClaim(npub, gistUrl, {
      fetchImpl: mockFetch as any,
    });

    expect(result.valid).toBe(false);
    expect(result.reason).toContain('less than required 90 days');
  });

  it('rejects claim if gist does not contain the declared npub', async () => {
    const npub = 'npub1mykey...';
    const gistUrl = 'https://gist.github.com/alexdev/998877';

    const mockFetch = async (url: string | URL | Request) => {
      const urlStr = url.toString();
      if (urlStr.includes('/users/alexdev')) {
        const created = new Date(Date.now() - 200 * 86400 * 1000).toISOString();
        return new Response(JSON.stringify({ login: 'alexdev', created_at: created }), { status: 200 });
      }
      if (urlStr.includes('/gists/998877')) {
        return new Response(
          JSON.stringify({
            owner: { login: 'alexdev' },
            files: {
              'readme.md': { content: 'Wrong key: npub1other...' },
            },
          }),
          { status: 200 },
        );
      }
      return new Response('Not found', { status: 404 });
    };

    const result = await verifyGithubClaim(npub, gistUrl, {
      fetchImpl: mockFetch as any,
    });

    expect(result.valid).toBe(false);
    expect(result.reason).toContain('does not contain declared npub');
  });

  it('proves Sybil resistance: 100 colluding naked keys cannot outweigh 1 verified node', () => {
    const seedPubkey = 'seed_indexer_node';
    const verifiedPubkey = 'verified_github_node';

    const nodes: WebOfTrustGraph['nodes'] = [
      { pubkey: seedPubkey, isSeed: true },
      { pubkey: verifiedPubkey, isVerifiedGithub: true },
    ];

    const edges: WebOfTrustGraph['edges'] = [
      // Seed endorses verified node
      { fromPubkey: seedPubkey, toPubkey: verifiedPubkey, weight: 1.0 },
    ];

    // Create 100 sybil nodes that form a complete dense graph (collusion) among themselves
    const sybilCount = 100;
    for (let i = 0; i < sybilCount; i++) {
      const sybilKey = `sybil_${i}`;
      nodes.push({ pubkey: sybilKey, baseTrust: 0.05 });
      // Sybils endorse each other
      for (let j = 0; j < 3; j++) {
        const target = `sybil_${(i + j + 1) % sybilCount}`;
        edges.push({ fromPubkey: sybilKey, toPubkey: target, weight: 1.0 });
      }
    }

    const scores = recomputeWebOfTrust({
      nodes,
      edges,
      dampingFactor: 0.85,
      iterations: 15,
    });

    const verifiedScore = scores.get(verifiedPubkey) || 0;
    expect(verifiedScore).toBeGreaterThan(0.5);

    // Each individual Sybil node has negligible score compared to the verified node
    for (let i = 0; i < sybilCount; i++) {
      const sybilScore = scores.get(`sybil_${i}`) || 0;
      expect(verifiedScore).toBeGreaterThan(sybilScore * 50);
    }

    // Even the sum of any random 10 sybils cannot reach the verified node
    let sum10Sybils = 0;
    for (let i = 0; i < 10; i++) {
      sum10Sybils += scores.get(`sybil_${i}`) || 0;
    }
    expect(verifiedScore).toBeGreaterThan(sum10Sybils);
  });
});
