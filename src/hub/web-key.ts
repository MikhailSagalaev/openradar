import { createHash } from 'node:crypto';
import type { Store } from '../core/store.ts';
import type { Lead } from '../core/types.ts';
import { getPublicKey, toEvenParityPrivKeyHex } from '../net/keys.ts';
import { RadarKinds, signEvent } from '../net/protocol.ts';

/**
 * Web keys: every GitHub account gets a participant key the hub derives from its secret, so
 * what people add on the site and through the extension earns rating by the same ledger as
 * node keys. Nothing is stored: the key is recomputed from the secret and the user id.
 */

const pubkeys = new Map<string, string>();

export function webPrivateKey(secret: string, userId: number): string {
  const digest = createHash('sha256').update(`openradar-web-key\u0000${secret}\u0000${userId}`).digest('hex');
  return toEvenParityPrivKeyHex(digest);
}

export function webPubkey(secret: string, userId: number): string {
  const key = `${userId}\u0000${secret}`;
  let pubkey = pubkeys.get(key);
  if (!pubkey) {
    pubkey = getPublicKey(webPrivateKey(secret, userId));
    pubkeys.set(key, pubkey);
  }
  return pubkey;
}

/**
 * Records that this account brought the lead: a signed observation of its web key, first when
 * the lead is new. The key is linked to the account unless the account already has a key.
 */
export async function recordWebObservation(
  store: Store,
  secret: string,
  userId: number,
  lead: Lead,
  isFirst: boolean,
  now: Date = new Date(),
): Promise<void> {
  const privateKey = webPrivateKey(secret, userId);
  let host = 'manual';
  try {
    if (lead.url) host = new URL(lead.url).hostname.replace(/^www\./, '');
  } catch {}
  const event = signEvent(
    {
      kind: RadarKinds.Observation,
      created_at: Math.floor(now.getTime() / 1000),
      tags: [['src', `web:${host}`], ['lead', lead.id]],
      content: JSON.stringify({ via: 'web', url: lead.url }),
    },
    privateKey,
  );
  await store.touchParticipant(event.pubkey);
  if (!(await store.getParticipantByGithubUser(userId))) await store.linkParticipantGithub(event.pubkey, userId);
  const fresh = await store.insertEvent({
    id: event.id,
    pubkey: event.pubkey,
    kind: event.kind,
    createdAt: event.created_at,
    tags: event.tags,
    content: event.content,
    sig: event.sig,
  });
  if (!fresh) return;
  const seen = await store.listObservations(lead.id);
  if (seen.some((observation) => observation.pubkey === event.pubkey)) return;
  await store.addObservation({
    eventId: event.id,
    leadId: lead.id,
    pubkey: event.pubkey,
    platform: 'web',
    channel: host,
    visibility: 'public',
    isFirst: isFirst && !seen.some((observation) => observation.isFirst),
    archived: false,
    receivedAt: now.toISOString(),
  });
}
