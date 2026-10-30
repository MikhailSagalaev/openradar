import { mergeContacts } from '../core/contacts.ts';
import { observationToRawLead, parseObservation } from '../core/observation.ts';
import type { Store } from '../core/store.ts';
import type { SourceRecord, SourceVisibility } from '../core/types.ts';
import {
  eventTimeError,
  MAX_EVENT_BYTES,
  parseSrcTag,
  POST_STATUSES,
  RadarKinds,
  SIGNALS,
  tagValue,
  verifyEvent,
  type NostrEvent,
  type PostStatus,
  type SignalType,
} from '../net/protocol.ts';
import { ingestRawLead, type IngestDeps } from '../pipeline/ingest.ts';
import { evaluateLeadState, WeightResolver } from './rating.ts';

/**
 * radar/2 hub: accepts signed events from participants (docs/PROTOCOL.md).
 * Observations become leads through the normal ingest pipeline under one built-in
 * source; every observation is kept and linked to its lead.
 */

export const HUB_SOURCE_ID = 'radar2-hub';
/** Observations of posts older than this are archived: stored, but earn no rating. */
export const ARCHIVE_AFTER_MS = 48 * 3600 * 1000;
export const MAX_EVENTS_PER_REQUEST = 500;

export interface EventOutcome {
  id?: string;
  /** `accepted`, `duplicate` or `rejected:<reason>`. */
  status: string;
  leadId?: string;
  /** For observations: true when it joined an existing lead. */
  merged?: boolean;
}

export interface HubDeps extends IngestDeps {
  moderators: Set<string>;
}

export function parseModerators(raw: string | undefined): Set<string> {
  return new Set(
    (raw ?? '')
      .split(',')
      .map((k) => k.trim().toLowerCase())
      .filter((k) => /^[0-9a-f]{64}$/.test(k)),
  );
}

const hubSources = new WeakMap<Store, Promise<SourceRecord>>();

/** The built-in source every hub observation is ingested under. It has no token: v1 ingest cannot reach it. */
export function ensureHubSource(store: Store): Promise<SourceRecord> {
  let pending = hubSources.get(store);
  if (!pending) {
    pending = (async () => {
      const existing = await store.getSource(HUB_SOURCE_ID);
      if (existing) return existing;
      try {
        return await store.createSource({ id: HUB_SOURCE_ID, kind: 'webhook', title: 'Сеть участников', config: { hub: true } });
      } catch (err) {
        const raced = await store.getSource(HUB_SOURCE_ID);
        if (raced) return raced;
        throw err;
      }
    })();
    pending.catch(() => hubSources.delete(store));
    hubSources.set(store, pending);
  }
  return pending;
}

const rejected = (reason: string, id?: string): EventOutcome => ({ id, status: `rejected:${reason}` });

export async function processEvent(input: unknown, deps: HubDeps): Promise<EventOutcome> {
  const now = deps.now?.() ?? new Date();
  let size: number;
  try {
    size = Buffer.byteLength(JSON.stringify(input) ?? '', 'utf8');
  } catch {
    return rejected('malformed');
  }
  if (size > MAX_EVENT_BYTES) return rejected('too_large');

  const checked = verifyEvent(input);
  const claimedId = typeof (input as { id?: unknown })?.id === 'string' ? (input as { id: string }).id : undefined;
  if (!checked.ok || !checked.event) return rejected(checked.error ?? 'invalid', claimedId);
  const event = checked.event;

  const timeError = eventTimeError(event.created_at, now);
  if (timeError) return rejected(timeError, event.id);

  switch (event.kind) {
    case RadarKinds.Observation:
    case RadarKinds.Signal:
    case RadarKinds.Status:
    case RadarKinds.Profile:
      break;
    default:
      return rejected('unsupported_kind', event.id);
  }

  const participant = await deps.store.touchParticipant(event.pubkey);
  if (participant.bannedAt) return rejected('banned', event.id);

  switch (event.kind) {
    case RadarKinds.Observation:
      return handleObservation(event, deps, now);
    case RadarKinds.Signal:
      return handleSignal(event, deps, now);
    case RadarKinds.Status:
      return handleStatus(event, deps);
    default:
      return handleProfile(event, deps);
  }
}

async function storeEvent(event: NostrEvent, deps: HubDeps): Promise<boolean> {
  return deps.store.insertEvent({
    id: event.id,
    pubkey: event.pubkey,
    kind: event.kind,
    createdAt: event.created_at,
    tags: event.tags,
    content: event.content,
    sig: event.sig,
  });
}

async function handleObservation(event: NostrEvent, deps: HubDeps, now: Date): Promise<EventOutcome> {
  let content: unknown;
  try {
    content = JSON.parse(event.content);
  } catch {
    return rejected('content_not_json', event.id);
  }
  if (content && typeof content === 'object') delete (content as Record<string, unknown>).raw;
  const parsed = parseObservation(content);
  if (!parsed.ok || !parsed.observation) return rejected(`invalid:${parsed.error}`, event.id);
  const observation = parsed.observation;

  const src = parseSrcTag(tagValue(event, 'src'));
  if (!src || src.platform !== observation.source.platform || src.channel !== observation.source.channel) {
    return rejected('src_tag_mismatch', event.id);
  }
  const msg = tagValue(event, 'msg');
  if ((msg ?? null) !== (observation.source.message_id ?? null)) return rejected('msg_tag_mismatch', event.id);

  if (!(await storeEvent(event, deps))) return { id: event.id, status: 'duplicate' };

  const source = await ensureHubSource(deps.store);
  const raw = observationToRawLead(observation, source.id);
  const outcome = await ingestRawLead(raw, source, deps);
  const lead = outcome.lead;
  if (!lead) return { id: event.id, status: 'duplicate' };

  const merged = outcome.status === 'duplicate';
  if (outcome.status === 'rejected') return { id: event.id, status: 'rejected:not_a_lead', leadId: lead.id };

  const postedAt = observation.posted_at ? Date.parse(observation.posted_at) : now.getTime();
  await deps.store.addObservation({
    eventId: event.id,
    leadId: lead.id,
    pubkey: event.pubkey,
    platform: observation.source.platform,
    channel: observation.source.channel,
    channelTitle: observation.source.channel_title ?? undefined,
    visibility: observation.source.visibility as SourceVisibility,
    messageId: observation.source.message_id ?? undefined,
    isFirst: !merged,
    archived: now.getTime() - postedAt > ARCHIVE_AFTER_MS,
    receivedAt: now.toISOString(),
  });
  let contactsChanged = !merged;
  if (merged && raw.contacts?.length) {
    const fresh = mergeContacts(lead.contacts ?? [], raw.contacts);
    if (fresh.length !== (lead.contacts ?? []).length) {
      await deps.store.mergeLeadContacts(lead.id, raw.contacts);
      contactsChanged = true;
    }
  }
  // A contact a moderator flagged as scam hides the lead at once.
  if (contactsChanged) {
    const current = await deps.store.getLead(lead.id);
    if (current?.contacts?.length && (await deps.store.getContactFlags(current.contacts)).length) {
      await evaluateLeadState(deps.store, current, new WeightResolver(deps.store, deps.moderators, now), { live: true });
    }
  }
  return { id: event.id, status: 'accepted', leadId: lead.id, merged };
}

async function handleSignal(event: NostrEvent, deps: HubDeps, now: Date): Promise<EventOutcome> {
  const leadId = tagValue(event, 'lead');
  const signal = tagValue(event, 'signal') as SignalType | undefined;
  if (!leadId || !signal || !SIGNALS.includes(signal)) return rejected('bad_signal_tags', event.id);
  if (event.content.length > 500) return rejected('comment_too_long', event.id);
  const lead = await deps.store.getLead(leadId);
  if (!lead) return rejected('unknown_lead', event.id);
  if (!(await storeEvent(event, deps))) return { id: event.id, status: 'duplicate' };
  await deps.store.upsertSignal({
    leadId,
    pubkey: event.pubkey,
    signal,
    comment: event.content,
    eventId: event.id,
    createdAt: now.toISOString(),
  });
  await evaluateLeadState(deps.store, lead, new WeightResolver(deps.store, deps.moderators, now), { live: true });
  return { id: event.id, status: 'accepted', leadId };
}

async function handleStatus(event: NostrEvent, deps: HubDeps): Promise<EventOutcome> {
  const src = parseSrcTag(tagValue(event, 'src'));
  const msg = tagValue(event, 'msg');
  const status = tagValue(event, 'status') as PostStatus | undefined;
  if (!src || !msg || !status || !POST_STATUSES.includes(status)) return rejected('bad_status_tags', event.id);
  if (!(await storeEvent(event, deps))) return { id: event.id, status: 'duplicate' };

  // Only the participant who first reported the post can close the lead through it.
  const observations = await deps.store.findObservationsByPost(src.platform, src.channel, msg);
  const own = observations.filter((o) => o.pubkey === event.pubkey && o.isFirst);
  if (status !== 'edited') {
    const weights = new WeightResolver(deps.store, deps.moderators);
    for (const o of own) {
      await deps.store.setLeadDecision(o.leadId, { state: 'closed', decidedBy: 'author', pubkey: event.pubkey, reason: status });
      const lead = await deps.store.getLead(o.leadId);
      if (lead) await evaluateLeadState(deps.store, lead, weights, { live: true });
    }
  }
  return { id: event.id, status: 'accepted', leadId: own[0]?.leadId };
}

const PROFILE_KEYS = ['name', 'about', 'website', 'github'] as const;

async function handleProfile(event: NostrEvent, deps: HubDeps): Promise<EventOutcome> {
  if (event.content.length > 4096) return rejected('profile_too_large', event.id);
  let content: unknown;
  try {
    content = JSON.parse(event.content);
  } catch {
    return rejected('content_not_json', event.id);
  }
  if (!content || typeof content !== 'object' || Array.isArray(content)) return rejected('profile_not_object', event.id);
  const profile: Record<string, string> = {};
  for (const key of PROFILE_KEYS) {
    const value = (content as Record<string, unknown>)[key];
    if (typeof value === 'string' && value.trim()) profile[key] = value.trim().slice(0, 512);
  }
  if (!(await storeEvent(event, deps))) return { id: event.id, status: 'duplicate' };
  await deps.store.setParticipantProfile(event.pubkey, profile);
  return { id: event.id, status: 'accepted' };
}
