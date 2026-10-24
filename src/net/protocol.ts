/**
 * OpenRadar radar/1 Nostr Protocol (NIP-01) Event Schemas & Builders.
 * Enforces strict typing, canonical serialization, BIP-340 verification,
 * and anti-time-spoofing guards (±15 min drift).
 */

import { createHash } from 'node:crypto';
import { z } from 'zod';
import { schnorrSign, schnorrVerify } from './keys.ts';

export const RADAR_PROTOCOL_VERSION = 'radar/1';

export const RadarEventKinds = {
  RadarLead: 30402,
  SourceManifest: 30403,
  LeadSignal: 30404,
  LeadAttestation: 30405,
  TrustList: 30406,
} as const;

export type RadarEventKind =
  (typeof RadarEventKinds)[keyof typeof RadarEventKinds];

export interface NostrEvent {
  id: string; // 32-byte hex
  pubkey: string; // 32-byte hex
  created_at: number; // unix timestamp in seconds
  kind: number;
  tags: string[][];
  content: string;
  sig: string; // 64-byte hex Schnorr signature
}

// Zod schemas for tags and content
export const RadarLeadContentSchema = z.object({
  title: z.string().min(1).max(300),
  summary: z.string().max(10000),
  published_at: z.string().datetime().optional(),
  author: z.string().max(200).optional(),
  city: z.string().max(100).optional(),
  rawSalary: z.string().max(100).optional(),
  skills: z.array(z.string()).optional(),
});

export type RadarLeadContent = z.infer<typeof RadarLeadContentSchema>;

export const RadarEventSchema = z.object({
  id: z.string().regex(/^[0-9a-f]{64}$/, 'ID must be 64-char hex'),
  pubkey: z.string().regex(/^[0-9a-f]{64}$/, 'Pubkey must be 64-char hex'),
  created_at: z.number().int().positive(),
  kind: z.number().int(),
  tags: z.array(z.array(z.string())),
  content: z.string(),
  sig: z.string().regex(/^[0-9a-f]{128}$/, 'Sig must be 128-char hex'),
});

/**
 * Computes canonical Nostr NIP-01 event serialization.
 * [0, <pubkey>, <created_at>, <kind>, <tags>, <content>]
 */
export function serializeEventForId(event: {
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
}): string {
  return JSON.stringify([
    0,
    event.pubkey,
    event.created_at,
    event.kind,
    event.tags,
    event.content,
  ]);
}

/**
 * Computes the canonical SHA-256 hash ID of an event.
 */
export function computeEventId(event: {
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
}): string {
  const serialized = serializeEventForId(event);
  return createHash('sha256').update(serialized, 'utf8').digest('hex');
}

/**
 * Signs and finalizes an event with a given private key.
 */
export function signAndFinalizeEvent(
  unsigned: {
    pubkey: string;
    created_at?: number;
    kind: number;
    tags: string[][];
    content: string;
  },
  privKeyHex: string,
): NostrEvent {
  const created_at = unsigned.created_at ?? Math.floor(Date.now() / 1000);
  const base = {
    pubkey: unsigned.pubkey.toLowerCase(),
    created_at,
    kind: unsigned.kind,
    tags: unsigned.tags,
    content: unsigned.content,
  };
  const id = computeEventId(base);
  const sig = schnorrSign(id, privKeyHex);
  return {
    ...base,
    id,
    sig,
  };
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

export interface VerifyEventOptions {
  now?: Date;
  maxDriftSec?: number; // default 900s = 15 min
}

/**
 * Verifies Nostr event:
 * 1. Checks structure with Zod.
 * 2. Checks time drift (±15 min).
 * 3. Checks id = sha256(canonical_serialized).
 * 4. Checks BIP-340 Schnorr signature.
 */
export function verifyRadarEvent(
  event: unknown,
  opts?: VerifyEventOptions,
): ValidationResult {
  const parsed = RadarEventSchema.safeParse(event);
  if (!parsed.success) {
    return {
      valid: false,
      error: `Invalid event schema: ${parsed.error.issues[0]?.message ?? 'unknown'}`,
    };
  }

  const ev = parsed.data;

  // Time drift check (anti-time-spoofing)
  const nowSec = Math.floor((opts?.now ?? new Date()).getTime() / 1000);
  const maxDrift = opts?.maxDriftSec ?? 900; // 15 minutes
  if (Math.abs(ev.created_at - nowSec) > maxDrift) {
    return {
      valid: false,
      error: `Event timestamp drift exceeds ±${maxDrift}s (event=${ev.created_at}, now=${nowSec})`,
    };
  }

  // Canonical ID verification
  const computedId = computeEventId({
    pubkey: ev.pubkey,
    created_at: ev.created_at,
    kind: ev.kind,
    tags: ev.tags,
    content: ev.content,
  });

  if (computedId !== ev.id) {
    return {
      valid: false,
      error: `Event ID mismatch: declared ${ev.id}, computed ${computedId}`,
    };
  }

  // BIP-340 Schnorr signature verification
  const isSigValid = schnorrVerify(ev.sig, ev.id, ev.pubkey);
  if (!isSigValid) {
    return {
      valid: false,
      error: 'Invalid BIP-340 Schnorr signature',
    };
  }

  return { valid: true };
}

// --- Specific Radar Event Builders ---

export interface BuildLeadParams {
  contentHash: string;
  canonicalUrl: string;
  leadType: 'job' | 'gig';
  title: string;
  summary: string;
  platform?: string;
  channel?: string;
  extId?: string;
  minHashSketch?: string;
  budgetMin?: number;
  budgetMax?: number;
  currency?: string;
  salaryPeriod?: string;
  stack?: string[];
  originMeta?: string[];
  pubkey: string;
  privKey: string;
  createdAt?: number;
}

export function buildRadarLeadEvent(p: BuildLeadParams): NostrEvent {
  const tags: string[][] = [
    ['d', p.contentHash],
    ['u', p.canonicalUrl],
    ['t', p.leadType],
    ['v', RADAR_PROTOCOL_VERSION],
  ];

  if (p.platform) {
    tags.push(['src', p.platform, p.channel ?? '', p.extId ?? '']);
  }
  if (p.minHashSketch) {
    tags.push(['mh', p.minHashSketch]);
  }
  if (p.stack && p.stack.length > 0) {
    tags.push(['stack', ...p.stack]);
  }
  if (p.budgetMin !== undefined || p.budgetMax !== undefined) {
    tags.push([
      'budget',
      String(p.budgetMin ?? ''),
      String(p.budgetMax ?? ''),
      p.currency ?? 'USD',
      p.salaryPeriod ?? 'month',
    ]);
  }
  if (p.originMeta && p.originMeta.length > 0) {
    tags.push(['origin_meta', ...p.originMeta]);
  }

  const contentObj: RadarLeadContent = {
    title: p.title,
    summary: p.summary,
    published_at: new Date(
      (p.createdAt ?? Math.floor(Date.now() / 1000)) * 1000,
    ).toISOString(),
    skills: p.stack,
  };

  return signAndFinalizeEvent(
    {
      pubkey: p.pubkey,
      created_at: p.createdAt,
      kind: RadarEventKinds.RadarLead,
      tags,
      content: JSON.stringify(contentObj),
    },
    p.privKey,
  );
}

export function buildLeadSignalEvent(p: {
  leadEventId: string;
  contentHash: string;
  signal: 'useful' | 'junk' | 'scam' | 'closed';
  reason?: string;
  pubkey: string;
  privKey: string;
  createdAt?: number;
}): NostrEvent {
  const tags: string[][] = [
    ['e', p.leadEventId],
    ['h', p.contentHash],
    ['signal', p.signal],
    ['v', RADAR_PROTOCOL_VERSION],
  ];
  if (p.reason) {
    tags.push(['reason', p.reason]);
  }

  return signAndFinalizeEvent(
    {
      pubkey: p.pubkey,
      created_at: p.createdAt,
      kind: RadarEventKinds.LeadSignal,
      tags,
      content: p.signal,
    },
    p.privKey,
  );
}

export function buildLeadAttestationEvent(p: {
  leadEventId: string;
  recomputedHash: string;
  status: 'verified' | 'mismatch' | 'closed' | 'scam';
  confidence?: number;
  httpCode?: number;
  pubkey: string;
  privKey: string;
  createdAt?: number;
}): NostrEvent {
  const tags: string[][] = [
    ['e', p.leadEventId],
    ['h', p.recomputedHash],
    ['status', p.status],
    ['confidence', String(p.confidence ?? 1.0)],
    ['v', RADAR_PROTOCOL_VERSION],
  ];
  if (p.httpCode !== undefined) {
    tags.push(['http_code', String(p.httpCode)]);
  }

  return signAndFinalizeEvent(
    {
      pubkey: p.pubkey,
      created_at: p.createdAt,
      kind: RadarEventKinds.LeadAttestation,
      tags,
      content: '',
    },
    p.privKey,
  );
}
