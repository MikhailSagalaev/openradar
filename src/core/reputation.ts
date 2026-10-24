/**
 * OpenRadar Web-of-Trust and Sybil-Resistance Engine.
 * Implements NIP-39 GitHub identity claim verification and personalized PageRank.
 */

export interface GithubClaimResult {
  valid: boolean;
  username?: string;
  accountAgeDays?: number;
  trustScore?: number;
  reason?: string;
}

export interface VerifyGithubClaimOptions {
  fetchImpl?: typeof fetch;
  minAccountAgeDays?: number; // default 90 days
  userAgent?: string;
  githubToken?: string;
}

/**
 * Verifies NIP-39 GitHub proof for Nostr npub.
 * 1. Checks gistUrl matches https://gist.github.com/<username>/<gist_id>
 * 2. Fetches user profile, ensures account age > 90 days.
 * 3. Fetches gist files, ensures it belongs to user and contains npub.
 * Upon successful verification, baseline trust_score is elevated from 0.05 to 0.40.
 */
export async function verifyGithubClaim(
  npub: string,
  gistUrl: string,
  opts: VerifyGithubClaimOptions = {},
): Promise<GithubClaimResult> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const minAgeDays = opts.minAccountAgeDays ?? 90;
  const userAgent = opts.userAgent ?? 'OpenRadar-WebOfTrust/1.0';

  const match = gistUrl.match(/gist\.github\.com\/([a-zA-Z0-9_\-]+)\/([a-f0-9]+)/i);
  if (!match) {
    return { valid: false, reason: 'Invalid GitHub Gist URL format' };
  }

  const [, username, gistId] = match;
  if (!username || !gistId) {
    return { valid: false, reason: 'Could not extract username and gist ID' };
  }

  const headers: Record<string, string> = {
    'User-Agent': userAgent,
    Accept: 'application/vnd.github.v3+json',
  };
  if (opts.githubToken) {
    headers.Authorization = `token ${opts.githubToken}`;
  }

  try {
    // 1. Check user account age
    const userRes = await fetchImpl(`https://api.github.com/users/${encodeURIComponent(username)}`, { headers });
    if (!userRes.ok) {
      return { valid: false, reason: `GitHub user ${username} not found (HTTP ${userRes.status})` };
    }
    const userData = (await userRes.json()) as { created_at?: string };
    if (!userData.created_at) {
      return { valid: false, reason: 'GitHub user profile missing created_at' };
    }

    const createdTime = new Date(userData.created_at).getTime();
    const ageDays = (Date.now() - createdTime) / (1000 * 60 * 60 * 24);
    if (ageDays < minAgeDays) {
      return {
        valid: false,
        username,
        accountAgeDays: Math.floor(ageDays),
        reason: `Account age (${Math.floor(ageDays)} days) is less than required ${minAgeDays} days`,
      };
    }

    // 2. Check gist ownership and npub content
    const gistRes = await fetchImpl(`https://api.github.com/gists/${encodeURIComponent(gistId)}`, { headers });
    if (!gistRes.ok) {
      return { valid: false, reason: `Gist not found (HTTP ${gistRes.status})` };
    }
    const gistData = (await gistRes.json()) as {
      owner?: { login?: string };
      files?: Record<string, { content?: string }>;
    };

    if (gistData.owner?.login?.toLowerCase() !== username.toLowerCase()) {
      return { valid: false, reason: 'Gist does not belong to claimed GitHub user' };
    }

    let foundNpub = false;
    const files = gistData.files || {};
    for (const fileName of Object.keys(files)) {
      const fileContent = files[fileName]?.content || '';
      if (fileContent.includes(npub.trim())) {
        foundNpub = true;
        break;
      }
    }

    if (!foundNpub) {
      return { valid: false, username, reason: `Gist does not contain declared npub ${npub}` };
    }

    return {
      valid: true,
      username,
      accountAgeDays: Math.floor(ageDays),
      trustScore: 0.40,
    };
  } catch (err) {
    return {
      valid: false,
      reason: `GitHub API request failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

export interface WoTNode {
  pubkey: string;
  isSeed?: boolean;
  isVerifiedGithub?: boolean;
  baseTrust?: number; // e.g. 0.05 default, 0.40 if GitHub verified, 1.0 for indexer seed
}

export interface WoTEdge {
  fromPubkey: string;
  toPubkey: string;
  weight?: number; // default 1.0
}

export interface WebOfTrustGraph {
  nodes: WoTNode[];
  edges: WoTEdge[];
  dampingFactor?: number; // default 0.85
  iterations?: number;    // default 15
}

/**
 * Computes personalized PageRank across the Web-of-Trust mesh network.
 * Guaranteed Sybil-resistant: naked keys with no incoming edges from seeds/verified nodes
 * receive negligible score, preventing Sybil collusion.
 */
export function recomputeWebOfTrust(graph: WebOfTrustGraph): Map<string, number> {
  const d = graph.dampingFactor ?? 0.85;
  const iterations = graph.iterations ?? 15;
  const nodes = graph.nodes;
  const n = nodes.length;

  const scores = new Map<string, number>();
  if (n === 0) return scores;

  // Build personalization (teleport) vector based on baseline trust
  // Seed nodes and GitHub-verified nodes constitute the trusted seed set.
  // Unverified/naked keys receive 0 teleport mass to prevent Sybil mass dilution.
  const teleport = new Map<string, number>();
  let totalTeleportMass = 0;

  for (const node of nodes) {
    let mass = 0;
    if (node.isSeed) {
      mass = 1.0;
    } else if (node.isVerifiedGithub) {
      mass = 0.40;
    } else if (node.baseTrust && node.baseTrust > 0.1) {
      mass = node.baseTrust;
    }
    teleport.set(node.pubkey, mass);
    totalTeleportMass += mass;
  }

  // Fallback to uniform distribution if no seeds are defined
  if (totalTeleportMass === 0) {
    for (const node of nodes) {
      teleport.set(node.pubkey, 1.0 / n);
      totalTeleportMass += 1.0 / n;
    }
  }

  // Normalize teleport vector
  for (const [pubkey, mass] of teleport.entries()) {
    teleport.set(pubkey, mass / totalTeleportMass);
    scores.set(pubkey, teleport.get(pubkey)!);
  }

  // Build adjacency list with outgoing weights
  const outEdges = new Map<string, Array<{ to: string; weight: number }>>();
  const outDegreeSum = new Map<string, number>();

  for (const node of nodes) {
    outEdges.set(node.pubkey, []);
    outDegreeSum.set(node.pubkey, 0);
  }

  for (const edge of graph.edges) {
    if (outEdges.has(edge.fromPubkey) && outEdges.has(edge.toPubkey)) {
      const w = edge.weight ?? 1.0;
      outEdges.get(edge.fromPubkey)!.push({ to: edge.toPubkey, weight: w });
      outDegreeSum.set(edge.fromPubkey, (outDegreeSum.get(edge.fromPubkey) || 0) + w);
    }
  }

  // Power iteration
  for (let it = 0; it < iterations; it++) {
    const nextScores = new Map<string, number>();

    // Dangling node contribution (nodes with no outgoing edges distribute to teleport)
    let danglingSum = 0;
    for (const node of nodes) {
      const deg = outDegreeSum.get(node.pubkey) || 0;
      if (deg === 0) {
        danglingSum += scores.get(node.pubkey)!;
      }
    }

    // Initialize with teleport + distributed dangling mass
    for (const node of nodes) {
      const p = teleport.get(node.pubkey)!;
      nextScores.set(node.pubkey, (1 - d) * p + d * danglingSum * p);
    }

    // Distribute along edges
    for (const node of nodes) {
      const fromScore = scores.get(node.pubkey)!;
      const deg = outDegreeSum.get(node.pubkey) || 0;
      if (deg > 0) {
        const edges = outEdges.get(node.pubkey)!;
        for (const edge of edges) {
          const contrib = d * fromScore * (edge.weight / deg);
          nextScores.set(edge.to, nextScores.get(edge.to)! + contrib);
        }
      }
    }

    for (const [k, v] of nextScores.entries()) {
      scores.set(k, v);
    }
  }

  // Normalize maximum score to 1.0 (or keep relative trust scores in [0, 1])
  let maxScore = 0;
  for (const val of scores.values()) {
    if (val > maxScore) maxScore = val;
  }
  if (maxScore > 0) {
    for (const [k, v] of scores.entries()) {
      scores.set(k, v / maxScore);
    }
  }

  return scores;
}
