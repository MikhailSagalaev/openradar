import type { Context, Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { canSeeContacts, delayMinutes, viewerCanSeeLead, visibleBefore } from '../core/access.ts';
import { normalizeContact } from '../core/contacts.ts';
import { leadEvents } from '../core/events.ts';
import type { FeedOptions } from '../core/store.ts';
import type { Contact, Lead, LeadType, Viewer } from '../core/types.ts';
import { evaluateLeadState, recomputeRatings, RATING_WINDOW_MS, WeightResolver } from '../hub/rating.ts';
import { MAX_EVENTS_PER_REQUEST, parseModerators, processEvent, type HubDeps } from '../hub/service.ts';
import type { IngestDeps } from '../pipeline/ingest.ts';
import { feedMaxAge } from '../pipeline/liveness.ts';
import type { Runtime } from '../runtime.ts';
import { filterOptions, parseFeedFilters } from './filters.ts';
import { rateLimit } from './ratelimit.ts';

/** What the v2 routes need from app.ts (passed in to avoid an import cycle). */
export interface V2Helpers {
  viewerFromRequest(c: Context): Promise<Viewer>;
  /** Set when the request carried a Nostr auth header that failed verification. */
  authError(c: Context): string | undefined;
  projectLead(lead: Lead, viewer: Viewer): Record<string, unknown>;
  ingestDeps(): IngestDeps;
  /** GitHub user id of the web session, if any. */
  currentUserId(c: Context): Promise<number | undefined>;
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
    const filters = parseFeedFilters(c);
    // The cursor walks forward in time, so it only combines with the default order.
    if (after && filters.sort !== 'new') return c.json({ error: 'cursor_needs_sort_new' }, 400);
    const options: FeedOptions = {
      limit,
      query: c.req.query('q') || undefined,
      type: type === 'job' || type === 'gig' ? (type as LeadType) : undefined,
      ...filterOptions(filters),
      createdBefore: visibleBefore(viewer, runtime.access),
      maxAgeDays: feedMaxAge(runtime.env),
      after,
    };
    const leads = await runtime.store.getLeadsForFeed(options);
    // Without a cursor the newest leads come first; the cursor then points at the newest one.
    const newest = filters.sort !== 'new' ? undefined : after ? leads[leads.length - 1] : leads[0];
    const cursor = newest ? encodeCursor(newest) : filters.sort !== 'new' ? null : c.req.query('cursor') ?? null;
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
    const since = new Date(Date.now() - RATING_WINDOW_MS).toISOString();
    const ledger = await runtime.store.listLedger(viewer.pubkey, since, 100);
    return c.json({
      pubkey: viewer.pubkey,
      tier: viewer.tier,
      delayMinutes: delayMinutes(viewer, runtime.access),
      rating: participant?.rating ?? 0,
      ratingWindowDays: RATING_WINDOW_MS / 86_400_000,
      profile: participant?.profile ?? {},
      githubLinked: Boolean(participant?.githubUserId),
      since: participant?.createdAt,
      ledger: ledger.map((e) => ({ leadId: e.leadId, kind: e.kind, points: e.points, createdAt: e.createdAt })),
    });
  });

  /** Links the signing key to the GitHub account of the current web session (both are required). */
  app.post('/v2/link/github', rateLimit({ windowMs: 60_000, max: 10 }), async (c) => {
    if (runtime.access.mode !== 'hub') return c.json({ error: 'not_a_hub' }, 404);
    const viewer = await viewerOr401(c);
    if (viewer instanceof Response) return viewer;
    if (!viewer.pubkey) return c.json({ error: 'nostr_auth_required' }, 401);
    const userId = await h.currentUserId(c);
    if (!userId) return c.json({ error: 'github_session_required' }, 401);
    const taken = await runtime.store.getParticipantByGithubUser(userId);
    if (taken && taken.pubkey !== viewer.pubkey) return c.json({ error: 'github_already_linked' }, 409);
    await runtime.store.linkParticipantGithub(viewer.pubkey, userId);
    return c.json({ ok: true, pubkey: viewer.pubkey, githubUserId: userId });
  });

  // --- moderation: a key from RADAR_MODERATORS (Nostr auth) or the admin token ---
  const moderatorOr403 = async (c: Context): Promise<string | Response> => {
    const viewer = await viewerOr401(c);
    if (viewer instanceof Response) return viewer;
    if (viewer.tier === 'admin') return 'admin';
    if (viewer.pubkey && parseModerators(runtime.env.RADAR_MODERATORS).has(viewer.pubkey)) return viewer.pubkey;
    return c.json({ error: 'forbidden' }, 403);
  };
  const bodyOf = async (c: Context): Promise<Record<string, unknown>> => {
    const body = await c.req.json().catch(() => null);
    return body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
  };
  const reasonOf = (body: Record<string, unknown>) => (typeof body.reason === 'string' ? body.reason.slice(0, 500) : '');
  const reevaluate = async (leadId: string) => {
    const lead = await runtime.store.getLead(leadId);
    if (!lead) return undefined;
    return evaluateLeadState(runtime.store, lead, new WeightResolver(runtime.store, parseModerators(runtime.env.RADAR_MODERATORS)));
  };

  /** Final decision on a lead: state active|hidden_junk|hidden_scam|closed, or null to return it to signals. */
  app.post('/v2/moderation/lead/:id', async (c) => {
    const moderator = await moderatorOr403(c);
    if (moderator instanceof Response) return moderator;
    const id = c.req.param('id') ?? '';
    if (!(await runtime.store.getLead(id))) return c.json({ error: 'not_found' }, 404);
    const body = await bodyOf(c);
    const states = ['active', 'hidden_junk', 'hidden_scam', 'closed'] as const;
    const state = body.state === null ? null : states.find((v) => v === body.state);
    if (state === undefined) return c.json({ error: 'bad_state', allowed: [...states, null] }, 400);
    await runtime.store.setLeadDecision(
      id,
      state ? { state, decidedBy: 'moderator', pubkey: moderator === 'admin' ? undefined : moderator, reason: reasonOf(body) } : null,
    );
    return c.json({ ok: true, leadId: id, state: await reevaluate(id) });
  });

  /** Marks a contact as scam (hides every lead with it) or clears the flag with `flag: null`. */
  app.post('/v2/moderation/contact', async (c) => {
    const moderator = await moderatorOr403(c);
    if (moderator instanceof Response) return moderator;
    const body = await bodyOf(c);
    const contact = typeof body.type === 'string' && typeof body.value === 'string'
      ? normalizeContact(body.type, body.value)
      : typeof body.value === 'string'
        ? contactFromValue(body.value)
        : null;
    if (!contact) return c.json({ error: 'bad_contact' }, 400);
    const clear = body.flag === null;
    if (!clear && body.flag !== undefined && body.flag !== 'scam') return c.json({ error: 'bad_flag', allowed: ['scam', null] }, 400);
    await runtime.store.setContactFlag(
      contact,
      clear ? null : { flag: 'scam', pubkey: moderator === 'admin' ? undefined : moderator, reason: reasonOf(body) },
    );
    const leads = (await runtime.store.findRecentByContacts?.([contact], new Date(0).toISOString(), 500)) ?? [];
    for (const lead of leads) await reevaluate(lead.id);
    return c.json({ ok: true, contact, flag: clear ? null : 'scam', leads: leads.length });
  });

  /** Bans a key (`ban: true`, default) or lifts the ban (`ban: false`). Banned keys get no access and no weight. */
  app.post('/v2/moderation/ban/:pubkey', async (c) => {
    const moderator = await moderatorOr403(c);
    if (moderator instanceof Response) return moderator;
    const pubkey = (c.req.param('pubkey') ?? '').toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(pubkey)) return c.json({ error: 'bad_pubkey' }, 400);
    if (parseModerators(runtime.env.RADAR_MODERATORS).has(pubkey)) return c.json({ error: 'cannot_ban_moderator' }, 400);
    const body = await bodyOf(c);
    const ban = body.ban !== false;
    await runtime.store.touchParticipant(pubkey);
    await runtime.store.banParticipant(pubkey, ban ? reasonOf(body) || 'banned' : null);
    return c.json({ ok: true, pubkey, banned: ban });
  });

  /** Runs the rating job now (it also runs hourly with the maintenance loop). */
  app.post('/v2/moderation/recompute', async (c) => {
    const moderator = await moderatorOr403(c);
    if (moderator instanceof Response) return moderator;
    return c.json({ ok: true, ...(await recomputeRatings(runtime.store, parseModerators(runtime.env.RADAR_MODERATORS))) });
  });
}
