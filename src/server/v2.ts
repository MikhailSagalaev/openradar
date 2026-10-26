import type { Context, Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { canSeeContacts, delayMinutes, viewerCanSeeLead, visibleBefore } from '../core/access.ts';
import { normalizeContact } from '../core/contacts.ts';
import { leadEvents } from '../core/events.ts';
import type { FeedOptions } from '../core/store.ts';
import type { Contact, Lead, LeadType, Viewer } from '../core/types.ts';
import { MAX_EVENTS_PER_REQUEST, parseModerators, processEvent, type HubDeps } from '../hub/service.ts';
import type { IngestDeps } from '../pipeline/ingest.ts';
import type { Runtime } from '../runtime.ts';
import { rateLimit } from './ratelimit.ts';

/** What the v2 routes need from app.ts (passed in to avoid an import cycle). */
export interface V2Helpers {
  viewerFromRequest(c: Context): Promise<Viewer>;
  /** Set when the request carried a Nostr auth header that failed verification. */
  authError(c: Context): string | undefined;
  projectLead(lead: Lead, viewer: Viewer): Record<string, unknown>;
  ingestDeps(): IngestDeps;
}

const MAX_EVENTS_BODY_BYTES = 10 * 1024 * 1024;
const STREAM_POLL_MS = 15_000;
const STREAM_HEARTBEAT_MS = 25_000;
const MAX_STREAMS = 500;
let openStreams = 0;

export function encodeCursor(lead: Pick<Lead, 'createdAt' | 'id'>): string {
  return Buffer.from(`${lead.createdAt}|${lead.id}`, 'utf8').toString('base64url');
}

export function decodeCursor(cursor: string | undefined): FeedOptions['after'] | undefined | null {
  if (!cursor) return undefined;
  const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
  const sep = decoded.indexOf('|');
  if (sep <= 0) return null;
  const createdAt = decoded.slice(0, sep);
  const id = decoded.slice(sep + 1);
  if (Number.isNaN(Date.parse(createdAt)) || !id) return null;
  return { createdAt, id };
}

/** Guesses the contact type of a bare value from `/v2/contacts/:value`. */
export function contactFromValue(value: string): Contact | null {
  const v = value.trim();
  if (/^@/.test(v) || /^(https?:\/\/)?t\.me\//i.test(v)) return normalizeContact('telegram', v);
  if (v.includes('@')) return normalizeContact('email', v);
  if (/^[+\d][\d\s()-]{6,}$/.test(v)) return normalizeContact('phone', v);
  if (/^https?:\/\//i.test(v)) return normalizeContact('url', v);
  return normalizeContact('telegram', `@${v}`);
}

function wantsNdjson(c: Context): boolean {
  return c.req.query('format') === 'ndjson' || (c.req.header('accept') ?? '').includes('application/x-ndjson');
}

export function registerV2Routes(app: Hono, runtime: Runtime, h: V2Helpers): void {
  const hubDeps = (): HubDeps => ({ ...h.ingestDeps(), moderators: parseModerators(runtime.env.RADAR_MODERATORS) });

  /** Rejects a request whose Nostr auth header is present but invalid, instead of silently treating it as a guest. */
  const viewerOr401 = async (c: Context): Promise<Viewer | Response> => {
    const viewer = await h.viewerFromRequest(c);
    const error = h.authError(c);
    if (error) return c.json({ error: 'unauthorized', reason: error }, 401);
    return viewer;
  };

  app.post('/v2/events', rateLimit({ windowMs: 60_000, max: 120 }), async (c) => {
    if (runtime.access.mode !== 'hub') return c.json({ error: 'not_a_hub' }, 404);
    const length = Number(c.req.header('content-length') ?? 0);
    if (length > MAX_EVENTS_BODY_BYTES) return c.json({ error: 'payload_too_large' }, 413);
    const text = await c.req.text();
    if (text.length > MAX_EVENTS_BODY_BYTES) return c.json({ error: 'payload_too_large' }, 413);
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      return c.json({ error: 'invalid_json' }, 400);
    }
    const events = Array.isArray(body)
      ? body
      : body && typeof body === 'object' && Array.isArray((body as { events?: unknown }).events)
        ? (body as { events: unknown[] }).events
        : body && typeof body === 'object'
          ? [body]
          : null;
    if (!events) return c.json({ error: 'invalid_body' }, 400);
    if (events.length === 0) return c.json({ error: 'no_events' }, 400);
    if (events.length > MAX_EVENTS_PER_REQUEST) return c.json({ error: 'too_many_events', max: MAX_EVENTS_PER_REQUEST }, 400);

    const deps = hubDeps();
    const results = [];
    for (const event of events) results.push(await processEvent(event, deps));
    return c.json({ results });
  });

  app.get('/v2/feed', rateLimit({ windowMs: 60_000, max: 120 }), async (c) => {
    const viewer = await viewerOr401(c);
    if (viewer instanceof Response) return viewer;
    const after = decodeCursor(c.req.query('cursor'));
    if (after === null) return c.json({ error: 'bad_cursor' }, 400);
    const limit = Math.max(1, Math.min(Number(c.req.query('limit') ?? 50) || 50, 200));
    const type = c.req.query('type');
    const options: FeedOptions = {
      limit,
      query: c.req.query('q') || undefined,
      type: type === 'job' || type === 'gig' ? (type as LeadType) : undefined,
      createdBefore: visibleBefore(viewer, runtime.access),
      after,
    };
    const leads = await runtime.store.getLeadsForFeed(options);
    // Without a cursor the newest leads come first; the cursor then points at the newest one.
    const newest = after ? leads[leads.length - 1] : leads[0];
    const cursor = newest ? encodeCursor(newest) : c.req.query('cursor') ?? null;
    const items = leads.map((lead) => h.projectLead(lead, viewer));
    c.header('x-radar-delay-minutes', String(delayMinutes(viewer, runtime.access)));
    if (cursor) c.header('x-radar-cursor', cursor);
    if (wantsNdjson(c)) {
      return c.body(items.map((item) => JSON.stringify(item)).join('\n') + (items.length ? '\n' : ''), 200, {
        'content-type': 'application/x-ndjson; charset=utf-8',
      });
    }
    return c.json({ tier: viewer.tier, delayMinutes: delayMinutes(viewer, runtime.access), cursor, leads: items });
  });

  app.get('/v2/stream', async (c) => {
    const viewer = await viewerOr401(c);
    if (viewer instanceof Response) return viewer;
    if (openStreams >= MAX_STREAMS) return c.json({ error: 'too_many_streams' }, 503);
    const initial = decodeCursor(c.req.query('cursor') ?? c.req.header('last-event-id'));
    if (initial === null) return c.json({ error: 'bad_cursor' }, 400);

    return streamSSE(c, async (stream) => {
      openStreams += 1;
      let after = initial ?? { createdAt: new Date().toISOString(), id: '' };
      let wake: (() => void) | undefined;
      const onLead = () => wake?.();
      if (delayMinutes(viewer, runtime.access) === 0) leadEvents.on('lead.created', onLead);
      let lastBeat = Date.now();
      stream.onAbort(() => wake?.());
      try {
        while (!stream.aborted && !stream.closed) {
          const leads = await runtime.store.getLeadsForFeed({
            limit: 200,
            after,
            createdBefore: visibleBefore(viewer, runtime.access),
          });
          for (const lead of leads) {
            after = { createdAt: lead.createdAt, id: lead.id };
            await stream.writeSSE({ event: 'lead', id: encodeCursor(lead), data: JSON.stringify(h.projectLead(lead, viewer)) });
          }
          if (leads.length === 200) continue;
          if (Date.now() - lastBeat >= STREAM_HEARTBEAT_MS) {
            await stream.write(': ping\n\n');
            lastBeat = Date.now();
          }
          await new Promise<void>((resolve) => {
            const timer = setTimeout(resolve, Math.min(STREAM_POLL_MS, STREAM_HEARTBEAT_MS));
            wake = () => {
              clearTimeout(timer);
              resolve();
            };
          });
          wake = undefined;
        }
      } finally {
        leadEvents.off('lead.created', onLead);
        openStreams -= 1;
      }
    });
  });

  app.get('/v2/leads/:id', async (c) => {
    const viewer = await viewerOr401(c);
    if (viewer instanceof Response) return viewer;
    const lead = await runtime.store.getLead(c.req.param('id') ?? '');
    if (!lead || !viewerCanSeeLead(viewer, lead, runtime.access)) return c.json({ error: 'not_found' }, 404);
    const [observations, signals] = await Promise.all([
      runtime.store.listObservations(lead.id),
      runtime.store.listSignals(lead.id),
    ]);
    const counts = { useful: 0, junk: 0, scam: 0, closed: 0 };
    for (const s of signals) counts[s.signal] += 1;
    return c.json({
      lead: h.projectLead(lead, viewer),
      state: lead.state ?? 'active',
      observations: observations.map((o) => ({
        pubkey: o.pubkey,
        platform: o.platform,
        channel: o.channel,
        channelTitle: o.channelTitle,
        visibility: o.visibility,
        messageId: o.messageId,
        first: o.isFirst,
        archived: o.archived,
        receivedAt: o.receivedAt,
      })),
      signals: counts,
    });
  });

  app.get('/v2/contacts/:value', rateLimit({ windowMs: 60_000, max: 60 }), async (c) => {
    const viewer = await viewerOr401(c);
    if (viewer instanceof Response) return viewer;
    if (!canSeeContacts(viewer)) return c.json({ error: 'login_required' }, 401);
    const contact = contactFromValue(c.req.param('value') ?? '');
    if (!contact) return c.json({ error: 'bad_contact' }, 400);
    const found = (await runtime.store.findRecentByContacts?.([contact], new Date(0).toISOString(), 100)) ?? [];
    const visible = found.filter((lead) => viewerCanSeeLead(viewer, lead, runtime.access));
    return c.json({ contact, leads: visible.map((lead) => h.projectLead(lead, viewer)) });
  });

  app.get('/v2/me', async (c) => {
    const viewer = await viewerOr401(c);
    if (viewer instanceof Response) return viewer;
    if (!viewer.pubkey) return c.json({ error: 'nostr_auth_required' }, 401);
    const participant = await runtime.store.getParticipant(viewer.pubkey);
    return c.json({
      pubkey: viewer.pubkey,
      tier: viewer.tier,
      delayMinutes: delayMinutes(viewer, runtime.access),
      profile: participant?.profile ?? {},
      githubLinked: Boolean(participant?.githubUserId),
      since: participant?.createdAt,
    });
  });
}
