import { describe, expect, it } from 'vitest';
import { createApp } from '../src/server/app.ts';
import { generateKeyPair } from '../src/net/keys.ts';
import {
  buildHttpAuthHeader,
  buildObservationEvent,
  buildSignalEvent,
  buildStatusEvent,
  RadarKinds,
  signEvent,
} from '../src/net/protocol.ts';
import { decodeCursor, encodeCursor, contactFromValue } from '../src/server/v2.ts';
import { makeTestRuntime, makeUserSession, type TestRuntime } from './helpers.ts';

const ADMIN = 'admin-secret-token-0123456789abcdef';

function observation(overrides: Record<string, unknown> = {}): { source: { platform: string; channel: string; [key: string]: unknown }; [key: string]: unknown } {
  return {
    schema: 'radar/2.observation',
    source: { platform: 'telegram', channel: '-1001234567890', channel_title: 'Frontend jobs', visibility: 'private', message_id: '48213' },
    posted_at: new Date().toISOString(),
    author: { name: 'Ирина', handle: '@irina_hr' },
    text: 'Ищем React-разработчика в продуктовую команду. TypeScript, Next.js, удалённо. Зарплата 250 000 ₽. Пишите @irina_hr',
    type: 'job',
    raw: { message: 'kept on the node' },
    ...overrides,
  };
}

function hub(env: Record<string, string> = {}): { runtime: TestRuntime; app: ReturnType<typeof createApp> } {
  const runtime = makeTestRuntime({
    RADAR_ADMIN_TOKEN: ADMIN,
    RADAR_PUBLIC_READ: 'true',
    RADAR_MODE: 'hub',
    ...env,
  } as never);
  return { runtime, app: createApp(runtime) };
}

async function send(app: ReturnType<typeof createApp>, events: unknown[]) {
  const res = await app.request('/v2/events', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(events),
  });
  return { status: res.status, body: (await res.json()) as { results: Array<{ id?: string; status: string; leadId?: string; merged?: boolean }> } };
}

function auth(path: string, privKey: string, method = 'GET', body?: string): Record<string, string> {
  return { authorization: buildHttpAuthHeader({ url: `http://localhost${path}`, method, body }, privKey) };
}

describe('radar/2 hub: events', () => {
  it('is only served in hub mode', async () => {
    const runtime = makeTestRuntime({ RADAR_ADMIN_TOKEN: ADMIN } as never);
    const res = await createApp(runtime).request('/v2/events', { method: 'POST', body: '[]', headers: { 'content-type': 'application/json' } });
    expect(res.status).toBe(404);
  });

  it('turns an observation into a lead, merges a second observer and rejects forgeries', async () => {
    const { runtime, app } = hub();
    const alice = generateKeyPair();
    const bob = generateKeyPair();

    const first = buildObservationEvent(observation(), alice.privKey);
    const r1 = await send(app, [first]);
    expect(r1.status).toBe(200);
    expect(r1.body.results[0]).toMatchObject({ id: first.id, status: 'accepted', merged: false });
    const leadId = r1.body.results[0]!.leadId!;

    expect((await send(app, [first])).body.results[0]!.status).toBe('duplicate');

    const second = buildObservationEvent(observation({ author: { contacts: [{ type: 'phone', value: '8 (999) 123-45-67' }] } }), bob.privKey);
    const r2 = await send(app, [second]);
    expect(r2.body.results[0]).toMatchObject({ status: 'accepted', merged: true, leadId });

    const observations = await runtime.store.listObservations(leadId);
    expect(observations.map((o) => [o.pubkey, o.isFirst])).toEqual([[alice.pubKey, true], [bob.pubKey, false]]);
    const lead = await runtime.store.getLead(leadId);
    expect(lead?.contacts).toEqual(expect.arrayContaining([{ type: 'telegram', value: '@irina_hr' }, { type: 'phone', value: '+79991234567' }]));
    expect(lead?.metadata?.message).toBeUndefined();

    const tampered = { ...buildObservationEvent(observation({ source: { platform: 'telegram', channel: 'x', message_id: '1' } }), alice.privKey) };
    tampered.content = tampered.content.replace('React', 'Vue');
    const mismatched = signEvent(
      { kind: RadarKinds.Observation, tags: [['src', 'telegram,other'], ['msg', '48213']], content: JSON.stringify(observation()) },
      alice.privKey,
    );
    const future = buildObservationEvent(observation(), alice.privKey, Math.floor(Date.now() / 1000) + 3600);
    const unknownKind = signEvent({ kind: 1, tags: [], content: 'hello' }, alice.privKey);
    const results = (await send(app, [tampered, mismatched, future, unknownKind, { nope: true }])).body.results.map((r) => r.status);
    expect(results).toEqual([
      'rejected:bad_id',
      'rejected:src_tag_mismatch',
      'rejected:created_at_in_future',
      'rejected:unsupported_kind',
      'rejected:malformed:id',
    ]);
  });

  it('stores signals and lets only the first observer close a lead by post status', async () => {
    const { runtime, app } = hub();
    const alice = generateKeyPair();
    const bob = generateKeyPair();
    const leadId = (await send(app, [buildObservationEvent(observation(), alice.privKey)])).body.results[0]!.leadId!;

    const signal = buildSignalEvent({ leadId, signal: 'useful', comment: 'ответили' }, bob.privKey);
    const unknown = buildSignalEvent({ leadId: 'missing', signal: 'scam' }, bob.privKey);
    expect((await send(app, [signal, unknown])).body.results.map((r) => r.status)).toEqual(['accepted', 'rejected:unknown_lead']);
    expect((await runtime.store.listSignals(leadId)).map((s) => s.signal)).toEqual(['useful']);

    const post = { platform: 'telegram', channel: '-1001234567890', messageId: '48213' };
    await send(app, [buildStatusEvent({ ...post, status: 'closed' }, bob.privKey)]);
    expect((await runtime.store.getLead(leadId))?.state).toBe('active');
    await send(app, [buildStatusEvent({ ...post, status: 'deleted' }, alice.privKey)]);
    expect((await runtime.store.getLead(leadId))?.state).toBe('closed');
  });
});

describe('radar/2 hub: HTTP auth and reading', () => {
  it('authenticates /v2/me with a signed header, refuses replays and keeps profiles', async () => {
    const { app } = hub();
    const alice = generateKeyPair();
    const profile = signEvent({ kind: RadarKinds.Profile, tags: [], content: JSON.stringify({ name: 'Alice', evil: '<x>' }) }, alice.privKey);
    expect((await send(app, [profile])).body.results[0]!.status).toBe('accepted');

    const headers = auth('/v2/me', alice.privKey);
    const me = await app.request('/v2/me', { headers });
    expect(me.status).toBe(200);
    // A bare key with no rating and no linked GitHub account is a guest.
    expect(await me.json()).toMatchObject({ pubkey: alice.pubKey, tier: 'guest', rating: 0, profile: { name: 'Alice' } });

    const replay = await app.request('/v2/me', { headers });
    expect(replay.status).toBe(401);
    expect(await replay.json()).toMatchObject({ reason: 'replay' });

    const wrongUrl = await app.request('/v2/me', { headers: auth('/v2/feed', alice.privKey) });
    expect((await wrongUrl.json())).toMatchObject({ reason: 'url_mismatch' });
    expect((await app.request('/v2/me')).status).toBe(401);
  });

  it('applies tier delays and contact rules to the feed, with a cursor and NDJSON', async () => {
    const { runtime, app } = hub({ RADAR_TIER_DELAYS: 'guest=720,member=0' });
    const alice = generateKeyPair();
    await send(app, [buildObservationEvent(observation(), alice.privKey)]);
    await runtime.store.setParticipantRatings(new Map([[alice.pubKey, 1]]));

    const guest = (await (await app.request('/v2/feed')).json()) as { tier: string; delayMinutes: number; leads: unknown[] };
    expect(guest).toMatchObject({ tier: 'guest', delayMinutes: 720 });
    expect(guest.leads).toHaveLength(0);

    const member = (await (await app.request('/v2/feed', { headers: auth('/v2/feed', alice.privKey) })).json()) as {
      tier: string;
      cursor: string;
      leads: Array<{ id: string; contacts: unknown[]; text: string; sourceRef: { channelTitle: string } }>;
    };
    expect(member.tier).toBe('member');
    expect(member.leads).toHaveLength(1);
    expect(member.leads[0]!.contacts).toEqual([{ type: 'telegram', value: '@irina_hr' }]);
    expect(member.leads[0]!.sourceRef.channelTitle).toBe('Frontend jobs');

    const path = `/v2/feed?cursor=${member.cursor}`;
    const empty = (await (await app.request(path, { headers: auth(path, alice.privKey) })).json()) as { leads: unknown[]; cursor: string };
    expect(empty.leads).toHaveLength(0);
    expect(empty.cursor).toBe(member.cursor);

    await send(app, [buildObservationEvent(observation({
      source: { platform: 'rss', channel: 'https://example.com/feed', message_id: 'x1' },
      author: {},
      text: 'Нужен дизайнер логотипа для кофейни, бюджет 15 000 ₽, срок неделя. Почта owner@example.com',
      type: 'gig',
    }), alice.privKey)]);
    const ndPath = `/v2/feed?cursor=${member.cursor}&format=ndjson`;
    const nd = await app.request(ndPath, { headers: auth(ndPath, alice.privKey) });
    expect(nd.headers.get('content-type')).toContain('application/x-ndjson');
    const lines = (await nd.text()).trim().split('\n').map((l) => JSON.parse(l) as { title: string });
    expect(lines).toHaveLength(1);
    expect(nd.headers.get('x-radar-cursor')).not.toBe(member.cursor);
  });

  it('guests on a zero-delay hub get leads without contacts; members see contacts and author history', async () => {
    const { runtime, app } = hub({ RADAR_TIER_DELAYS: 'guest=0,member=0' });
    const alice = generateKeyPair();
    const leadId = (await send(app, [buildObservationEvent(observation(), alice.privKey)])).body.results[0]!.leadId!;

    const guest = (await (await app.request(`/v2/leads/${leadId}`)).json()) as { lead: { contacts: unknown[]; text: string }; observations: unknown[] };
    expect(guest.lead.contacts).toEqual([]);
    expect(guest.lead.text).not.toContain('@irina_hr');
    expect(guest.observations).toHaveLength(1);
    expect((await app.request('/v2/contacts/@irina_hr')).status).toBe(401);

    const session = await makeUserSession(runtime);
    const history = (await (await app.request('/v2/contacts/irina_hr', { headers: { cookie: `radar_session=${session}` } })).json()) as {
      contact: unknown;
      leads: Array<{ id: string }>;
    };
    expect(history.contact).toEqual({ type: 'telegram', value: '@irina_hr' });
    expect(history.leads.map((l) => l.id)).toEqual([leadId]);
  });

  it('streams new leads over SSE', async () => {
    const { app } = hub();
    const res = await app.request('/v2/stream', { headers: { authorization: `Bearer ${ADMIN}` } });
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    const reader = res.body!.getReader();
    await new Promise((r) => setTimeout(r, 20));
    const alice = generateKeyPair();
    const leadId = (await send(app, [buildObservationEvent(observation(), alice.privKey)])).body.results[0]!.leadId!;
    let text = '';
    const deadline = Date.now() + 3000;
    while (!text.includes('event: lead') && Date.now() < deadline) {
      const { value, done } = await Promise.race([
        reader.read(),
        new Promise<{ value: undefined; done: true }>((r) => setTimeout(() => r({ value: undefined, done: true }), 3000)),
      ]);
      if (done) break;
      text += new TextDecoder().decode(value);
    }
    await reader.cancel();
    expect(text).toContain('event: lead');
    expect(text).toContain(leadId);
  });
});

describe('radar/2 hub helpers', () => {
  it('round-trips cursors and guesses contact types', () => {
    const cursor = encodeCursor({ createdAt: '2026-10-26T12:00:00.000Z', id: 'abc' });
    expect(decodeCursor(cursor)).toEqual({ createdAt: '2026-10-26T12:00:00.000Z', id: 'abc' });
    expect(decodeCursor('garbage')).toBeNull();
    expect(contactFromValue('+7 999 123-45-67')).toEqual({ type: 'phone', value: '+79991234567' });
    expect(contactFromValue('Owner@Example.com')).toEqual({ type: 'email', value: 'owner@example.com' });
    expect(contactFromValue('https://t.me/Irina_HR')).toEqual({ type: 'telegram', value: '@irina_hr' });
  });
});
