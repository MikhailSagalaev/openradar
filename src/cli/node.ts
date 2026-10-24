/**
 * OpenRadar Mesh Node CLI Runner.
 * Starts a decentralized crawler/validator node that publishes leads and attestations over Nostr.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import {
  decryptPrivateKey,
  encryptPrivateKey,
  generateKeyPair,
  importPrivateKey,
  type KeyPair,
} from '../net/keys.ts';
import { RelayPool, DEFAULT_RELAYS } from '../net/relay-pool.ts';
import {
  buildRadarLeadEvent,
  buildLeadAttestationEvent,
  verifyRadarEvent,
  RadarEventKinds,
  type NostrEvent,
} from '../net/protocol.ts';
import { computeMinHashSketch } from '../core/fingerprint.ts';
import { deriveChildKeyPair } from '../net/derived-keys.ts';
import { scrubPII } from '../core/privacy.ts';
import { assertSafeUrl } from '../core/ssrf.ts';
import { createRuntime } from '../runtime.ts';
import { pollAll } from '../pipeline/poll.ts';
import { loadEnv } from '../config.ts';

export interface NodeOptions {
  relays?: string[];
  keyFile?: string;
  pollIntervalSec?: number;
  attestationSampleRate?: number; // default 0.1 (10%)
  once?: boolean;
}

export function resolveOrCreateNodeKey(customKeyPath?: string): KeyPair {
  const envPriv = process.env.RADAR_NODE_PRIVKEY || process.env.RADAR_NODE_NSEC;
  if (envPriv) {
    return importPrivateKey(envPriv);
  }

  const passphrase = process.env.RADAR_NODE_PASSPHRASE;
  const defaultDir = join(homedir(), '.radar');
  const keyPath = customKeyPath || join(defaultDir, 'node_key.json');

  if (existsSync(keyPath)) {
    try {
      const data = JSON.parse(readFileSync(keyPath, 'utf8'));
      if (data.ciphertext) {
        if (!passphrase) {
          throw new Error(`Key file ${keyPath} is encrypted: set RADAR_NODE_PASSPHRASE to decrypt it`);
        }
        return importPrivateKey(decryptPrivateKey(data, passphrase));
      }
      // Legacy plaintext key file (v0.5.0 and earlier)
      if (data.privKey) {
        return importPrivateKey(data.privKey);
      }
    } catch (err) {
      if (err instanceof Error && err.message.includes('RADAR_NODE_PASSPHRASE')) throw err;
    }
  }

  if (!passphrase) {
    throw new Error(
      'RADAR_NODE_PASSPHRASE is required to encrypt the node key file (or provide RADAR_NODE_PRIVKEY/NSEC directly)',
    );
  }

  // Generate a fresh keypair and persist it encrypted (AES-256-GCM + scrypt)
  const keypair = generateKeyPair();
  try {
    if (!existsSync(defaultDir)) {
      mkdirSync(defaultDir, { recursive: true });
    }
    writeFileSync(
      keyPath,
      JSON.stringify(
        {
          npub: keypair.npub,
          pubKey: keypair.pubKey,
          createdAt: new Date().toISOString(),
          ...encryptPrivateKey(keypair.privKey, passphrase),
        },
        null,
        2,
      ),
      { mode: 0o600 },
    );
  } catch {}

  return keypair;
}

export async function runMeshNode(options: NodeOptions = {}): Promise<void> {
  const keys = resolveOrCreateNodeKey(options.keyFile);
  const relayUrls = options.relays && options.relays.length > 0 ? options.relays : DEFAULT_RELAYS;
  const pollIntervalSec = options.pollIntervalSec || 300;
  const sampleRate = options.attestationSampleRate ?? 0.1;

  console.log('OpenRadar Mesh Node starting...');
  console.log(`Public Key (npub): ${keys.npub}`);
  console.log(`Relays: ${relayUrls.join(', ')}`);

  const relayPool = new RelayPool({ relays: relayUrls });
  await relayPool.connect();
  console.log(`Connected to relays: ${relayPool.getConnectedRelays().length}/${relayUrls.length}`);

  // Subscribe to other nodes' leads (Kind 30402) for background peer attestation
  const subFilter = {
    kinds: [RadarEventKinds.RadarLead],
    limit: 20,
  };

  const unsubscribe = relayPool.subscribe('radar-node-sub', subFilter, async (event, fromRelay) => {
    // Skip our own events
    if (event.pubkey === keys.pubKey) return;

    // Verify event validity first
    const verification = verifyRadarEvent(event);
    if (!verification.valid) return;

    // 10% sampling to save bandwidth
    if (Math.random() > sampleRate) return;

    // Extract canonical URL from tags: ["u", "<url>"]
    const uTag = event.tags.find((t) => t[0] === 'u');
    const dTag = event.tags.find((t) => t[0] === 'd');
    const targetUrl = uTag?.[1];
    const declaredHash = dTag?.[1];

    if (!targetUrl || !declaredHash) return;

    try {
      await assertSafeUrl(targetUrl);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);

      const res = await fetch(targetUrl, {
        signal: controller.signal,
        headers: { 'User-Agent': 'OpenRadar-MeshNode/1.0' },
      });
      clearTimeout(timer);

      const attestationStatus = res.ok ? 'verified' : (res.status === 404 || res.status === 410 ? 'closed' : 'mismatch');

      const attestationEvent = buildLeadAttestationEvent({
        leadEventId: event.id,
        recomputedHash: declaredHash,
        status: attestationStatus,
        confidence: 0.95,
        httpCode: res.status,
        pubkey: keys.pubKey,
        privKey: keys.privKey,
      });

      await relayPool.publish(attestationEvent);
      console.log(`Published attestation for lead ${event.id.slice(0, 8)}: status=${attestationStatus}`);
    } catch {
      // Failed to verify (timeout or network error)
    }
  });

  // Load local runtime for polling configured sources
  const env = loadEnv();
  const runtime = await createRuntime(env);

  const pollCycle = async () => {
    try {
      const summary = await pollAll(runtime);
      const leads = await runtime.store.listLeads({ limit: 50 });

      for (const lead of leads) {
        // Skip leads that already have a nostr event id
        if (lead.nostr_event_id) continue;

        // Scrub PII for decentralized mesh broadcast
        const scrub = scrubPII(lead.text, {
          channel: (lead as any).channel,
          platform: (lead as any).platform,
          url: lead.url,
        });

        // Compute MinHash sketch
        const minHashSketch = computeMinHashSketch(scrub.text);

        // Derive ephemeral child key to prevent channel deanonymization (Blinded Relaying)
        const sourceId = lead.sourceId || (lead as any).platform || 'generic';
        const childKeys = deriveChildKeyPair(keys.privKey, sourceId);

        const event = buildRadarLeadEvent({
          contentHash: lead.fingerprint,
          canonicalUrl: lead.canonicalUrl || lead.url || '',
          leadType: lead.type === 'job' ? 'job' : 'gig',
          title: lead.title,
          summary: scrub.text.slice(0, 1000),
          budgetMin: lead.normalizedUsdMin,
          budgetMax: lead.normalizedUsdMax,
          currency: lead.currency || 'USD',
          stack: lead.skills,
          minHashSketch,
          pubkey: childKeys.pubKey,
          privKey: childKeys.privKey,
        });

        const pubResult = await relayPool.publish(event);
        if (pubResult.ok) {
          lead.nostr_event_id = event.id;
          lead.publisher_pubkey = childKeys.pubKey;
          lead.minhash_sketch = minHashSketch;
          console.log(`Published lead to mesh: "${lead.title.slice(0, 40)}" (${pubResult.publishedCount} relays)`);
        }
      }
    } catch (err) {
      console.error('Error during node poll cycle:', err);
    }
  };

  // Run initial cycle
  await pollCycle();

  if (options.once) {
    unsubscribe();
    await relayPool.close();
    await runtime.store.close();
    return;
  }

  // Periodic loop
  const intervalId = setInterval(pollCycle, pollIntervalSec * 1000);

  const shutdown = async () => {
    console.log('\nShutting down mesh node...');
    clearInterval(intervalId);
    unsubscribe();
    await relayPool.close();
    await runtime.store.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
