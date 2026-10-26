/**
 * radar/2 signed events (docs/PROTOCOL.md).
 * NIP-01 compatible: id = sha256 of the canonical array, sig = BIP-340 Schnorr.
 */

import { createHash } from 'node:crypto';
import { z } from 'zod';
import { getPublicKey, schnorrSign, schnorrVerify } from './keys.ts';

export const RADAR_PROTOCOL_VERSION = 'radar/2';

export const RadarKinds = {
  Observation: 4040,
  Signal: 4041,
  Status: 4042,
  Profile: 30440,
  HttpAuth: 27235,
} as const;

export const SIGNALS = ['useful', 'junk', 'scam', 'closed'] as const;
export type SignalType = (typeof SIGNALS)[number];

export const POST_STATUSES = ['deleted', 'edited', 'closed'] as const;
export type PostStatus = (typeof POST_STATUSES)[number];

/** Largest accepted serialised event. */
export const MAX_EVENT_BYTES = 64 * 1024;

export interface NostrEvent {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
  sig: string;
}

export type UnsignedEvent = Pick<NostrEvent, 'kind' | 'tags' | 'content'> & { created_at?: number };

const hex = (len: number) => z.string().regex(new RegExp(`^[0-9a-f]{${len}}$`), `must be ${len}-char lowercase hex`);

export const EventSchema = z.object({
  id: hex(64),
  pubkey: hex(64),
  created_at: z.number().int().nonnegative(),
  kind: z.number().int().nonnegative(),
  tags: z.array(z.array(z.string().max(4096)).max(16)).max(64),
  content: z.string(),
  sig: hex(128),
});

export function serializeEventForId(event: Pick<NostrEvent, 'pubkey' | 'created_at' | 'kind' | 'tags' | 'content'>): string {
  return JSON.stringify([0, event.pubkey, event.created_at, event.kind, event.tags, event.content]);
}

export function computeEventId(event: Pick<NostrEvent, 'pubkey' | 'created_at' | 'kind' | 'tags' | 'content'>): string {
  return createHash('sha256').update(serializeEventForId(event), 'utf8').digest('hex');
}

export function signEvent(unsigned: UnsignedEvent, privKeyHex: string): NostrEvent {
  const base = {
    pubkey: getPublicKey(privKeyHex),
    created_at: unsigned.created_at ?? Math.floor(Date.now() / 1000),
    kind: unsigned.kind,
    tags: unsigned.tags,
    content: unsigned.content,
  };
  const id = computeEventId(base);
  return { ...base, id, sig: schnorrSign(id, privKeyHex) };
}

export interface EventCheck {
  ok: boolean;
  event?: NostrEvent;
  error?: string;
}

/** Structure, id and signature. Time and kind rules are the receiver's. */
export function verifyEvent(input: unknown): EventCheck {
  const parsed = EventSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: `malformed:${issue ? issue.path.join('.') : 'event'}` };
  }
  const event = parsed.data;
  if (computeEventId(event) !== event.id) return { ok: false, error: 'bad_id' };
  if (!schnorrVerify(event.sig, event.id, event.pubkey)) return { ok: false, error: 'bad_signature' };
  return { ok: true, event };
}

/** Accepted window for `created_at`: 30 days back, 10 minutes ahead. */
export function eventTimeError(createdAt: number, now: Date = new Date()): string | undefined {
  const nowSec = Math.floor(now.getTime() / 1000);
  if (createdAt > nowSec + 600) return 'created_at_in_future';
  if (createdAt < nowSec - 30 * 24 * 3600) return 'created_at_too_old';
  return undefined;
}

export function tagValue(event: Pick<NostrEvent, 'tags'>, name: string): string | undefined {
  return event.tags.find((t) => t[0] === name)?.[1];
}

/** `src` tag: `<platform>,<channel>`; the channel may itself contain commas. */
export function parseSrcTag(value: string | undefined): { platform: string; channel: string } | undefined {
  if (!value) return undefined;
  const comma = value.indexOf(',');
  if (comma <= 0 || comma === value.length - 1) return undefined;
  return { platform: value.slice(0, comma), channel: value.slice(comma + 1) };
}

interface ObservationLike {
  source: { platform: string; channel: string; visibility?: string; message_id?: string | number | null };
  raw?: unknown;
  [key: string]: unknown;
}

/** kind 4040: the observation without `raw` (raw stays on the node). */
export function buildObservationEvent(observation: ObservationLike, privKeyHex: string, createdAt?: number): NostrEvent {
  const { raw: _raw, ...rest } = observation;
  const tags: string[][] = [
    ['v', RADAR_PROTOCOL_VERSION],
    ['src', `${observation.source.platform},${observation.source.channel}`],
    ['vis', observation.source.visibility ?? 'public'],
  ];
  if (observation.source.message_id !== undefined && observation.source.message_id !== null) {
    tags.push(['msg', String(observation.source.message_id)]);
  }
  return signEvent({ kind: RadarKinds.Observation, tags, content: JSON.stringify(rest), created_at: createdAt }, privKeyHex);
}

export function buildSignalEvent(
  p: { leadId: string; signal: SignalType; comment?: string; createdAt?: number },
  privKeyHex: string,
): NostrEvent {
  return signEvent(
    {
      kind: RadarKinds.Signal,
      tags: [['v', RADAR_PROTOCOL_VERSION], ['lead', p.leadId], ['signal', p.signal]],
      content: (p.comment ?? '').slice(0, 500),
      created_at: p.createdAt,
    },
    privKeyHex,
  );
}

export function buildStatusEvent(
  p: { platform: string; channel: string; messageId: string; status: PostStatus; createdAt?: number },
  privKeyHex: string,
): NostrEvent {
  return signEvent(
    {
      kind: RadarKinds.Status,
      tags: [['v', RADAR_PROTOCOL_VERSION], ['src', `${p.platform},${p.channel}`], ['msg', p.messageId], ['status', p.status]],
      content: '',
      created_at: p.createdAt,
    },
    privKeyHex,
  );
}

// --- HTTP auth (after NIP-98) ---

export function sha256Hex(body: string | Uint8Array): string {
  return createHash('sha256').update(body).digest('hex');
}

/** `Authorization` header value for one request. */
export function buildHttpAuthHeader(
  p: { url: string; method: string; body?: string; createdAt?: number },
  privKeyHex: string,
): string {
  const tags: string[][] = [['u', p.url], ['method', p.method.toUpperCase()]];
  if (p.body) tags.push(['payload', sha256Hex(p.body)]);
  const event = signEvent({ kind: RadarKinds.HttpAuth, tags, content: '', created_at: p.createdAt }, privKeyHex);
  return `Nostr ${Buffer.from(JSON.stringify(event), 'utf8').toString('base64')}`;
}

export interface HttpAuthResult {
  ok: boolean;
  pubkey?: string;
  eventId?: string;
  /** Unix seconds after which the auth event can no longer be replayed. */
  expiresAt?: number;
  error?: string;
}

export function isNostrAuthHeader(header: string | undefined): boolean {
  return Boolean(header && /^Nostr\s+/i.test(header));
}

/**
 * Checks an `Authorization: Nostr <base64 event>` header against the request.
 * Replay protection (each event id once) is the caller's: it must remember `eventId`
 * until `expiresAt`.
 */
export function verifyHttpAuth(
  header: string | undefined,
  request: { url: string; method: string; body?: string },
  now: Date = new Date(),
): HttpAuthResult {
  if (!header || !isNostrAuthHeader(header)) return { ok: false, error: 'missing' };
  const encoded = header.replace(/^Nostr\s+/i, '').trim();
  if (encoded.length > 16_384) return { ok: false, error: 'too_large' };
  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
  } catch {
    return { ok: false, error: 'malformed' };
  }
  const checked = verifyEvent(decoded);
  if (!checked.ok || !checked.event) return { ok: false, error: checked.error };
  const event = checked.event;
  if (event.kind !== RadarKinds.HttpAuth) return { ok: false, error: 'wrong_kind' };
  const nowSec = Math.floor(now.getTime() / 1000);
  if (Math.abs(nowSec - event.created_at) > 60) return { ok: false, error: 'expired' };
  if (!sameUrl(tagValue(event, 'u'), request.url)) return { ok: false, error: 'url_mismatch' };
  if ((tagValue(event, 'method') ?? '').toUpperCase() !== request.method.toUpperCase()) {
    return { ok: false, error: 'method_mismatch' };
  }
  if (request.body) {
    if (tagValue(event, 'payload') !== sha256Hex(request.body)) return { ok: false, error: 'payload_mismatch' };
  }
  return { ok: true, pubkey: event.pubkey, eventId: event.id, expiresAt: event.created_at + 61 };
}

function sameUrl(signed: string | undefined, actual: string): boolean {
  if (!signed) return false;
  try {
    const a = new URL(signed);
    const b = new URL(actual);
    return a.protocol === b.protocol && a.host === b.host && a.pathname === b.pathname && a.search === b.search;
  } catch {
    return false;
  }
}
