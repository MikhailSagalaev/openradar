import { describe, expect, it } from 'vitest';
import { createApp } from '../src/server/app.ts';
import { generateKeyPair } from '../src/net/keys.ts';
import { buildHttpAuthHeader, buildObservationEvent, buildSignalEvent } from '../src/net/protocol.ts';
import {
  ledgerForLead,
  recomputeRatings,
  signalWeight,
  stateFromSignals,
  tierFor,
  WeightResolver,
} from '../src/hub/rating.ts';
import { makeTestRuntime, makeUserSession, type TestRuntime } from './helpers.ts';

const ADMIN = 'admin-secret-token-0123456789abcdef';

function observation(overrides: Record<string, unknown> = {}) {
  return {
    schema: 'radar/2.observation',
    source: { platform: 'telegram', channel: '-1009876543210', channel_title: 'Design orders', visibility: 'private', message_id: '7001' },
    posted_at: new Date().toISOString(),
    author: { handle: '@studio_lead' },
    text: 'Нужен дизайнер лендинга для студии йоги, Figma, бюджет 40 000 ₽, срок две недели. Пишите @studio_lead',
    type: 'gig',
    ...overrides,
  };
}

function hub(env: Record<string, string> = {}): { runtime: TestRuntime; app: ReturnType<typeof createApp> } {
  const runtime = makeTestRuntime({
    RADAR_ADMIN_TOKEN: ADMIN,
    RADAR_PUBLIC_READ: 'true',
    RADAR_MODE: 'hub',
    RADAR_TIER_DELAYS: 'guest=0,member=0,active=0,core=0',
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
  return ((await res.json()) as { results: Array<{ status: string; leadId?: string }> }).results;
}

function signed(path: string, privKey: string, method = 'GET', body?: string): RequestInit {
  const headers: Record<string, string> = {
    authorization: buildHttpAuthHeader({ url: `http://localhost${path}`, method, body }, privKey),
  };
  if (body !== undefined) headers['content-type'] = 'application/json';
  return { method, headers, body };
}

describe('radar/2 rating: formulas', () => {
  it('weights signals by rating, GitHub age and moderator role', () => {
    const now = new Date('2026-10-26T12:00:00Z');
    expect(signalWeight({ rating: 0, moderator: false }, now)).toBe(0);
    expect(signalWeight({ rating: 0, moderator: false, githubCreatedAt: '2026-10-01T00:00:00Z' }, now)).toBe(0);
    expect(signalWeight({ rating: 0, moderator: false, githubCreatedAt: '2020-01-01T00:00:00Z' }, now)).toBeCloseTo(0.2);
    expect(signalWeight({ rating: 15, moderator: false, githubCreatedAt: '2020-01-01T00:00:00Z' }, now)).toBeCloseTo(0.7);
    expect(signalWeight({ rating: 300, moderator: false }, now)).toBe(1);
    expect(signalWeight({ rating: 0, moderator: true }, now)).toBe(1);
  });

  it('maps rating to tiers', () => {
    expect(tierFor({ rating: 0, moderator: false, githubLinked: false })).toBe('guest');
    expect(tierFor({ rating: 0, moderator: false, githubLinked: true })).toBe('member');
    expect(tierFor({ rating: 1, moderator: false, githubLinked: false })).toBe('member');
    expect(tierFor({ rating: 10, moderator: false, githubLinked: false })).toBe('active');
    expect(tierFor({ rating: 50, moderator: false, githubLinked: false })).toBe('core');
    expect(tierFor({ rating: 0, moderator: true, githubLinked: false })).toBe('core');
  });

  it('hides on weighted complaints and closes on closing signals', () => {
    expect(stateFromSignals({ useful: 0, junk: 1, scam: 0.9, closed: 0 })).toBe('active');
    expect(stateFromSignals({ useful: 0, junk: 0.5, scam: 1.5, closed: 0 })).toBe('hidden_scam');
    expect(stateFromSignals({ useful: 1.5, junk: 2, scam: 1, closed: 0 })).toBe('active');
    expect(stateFromSignals({ useful: 0, junk: 2, scam: 0, closed: 0 })).toBe('hidden_junk');
    expect(stateFromSignals({ useful: 0, junk: 0, scam: 0, closed: 1.5 })).toBe('closed');
  });
});

describe('radar/2 rating: hub flow', () => {
  it('credits the first observer of a private post once a weighted participant confirms it', async () => {
    const { runtime, app } = hub();
    const alice = generateKeyPair();
    const bob = generateKeyPair();
    const leadId = (await send(app, [buildObservationEvent(observation(), alice.privKey)]))[0]!.leadId!;
    await runtime.store.touchParticipant(bob.pubKey);
    await runtime.store.setParticipantRatings(new Map([[bob.pubKey, 6]]));

    // unconfirmed and young: nothing yet
    let summary = await recomputeRatings(runtime.store, new Set());
    expect(summary.entries).toBe(0);

    await send(app, [buildObservationEvent(observation({ author: { handle: '@studio_lead', name: 'Studio' } }), bob.privKey)]);
    await runtime.store.setParticipantRatings(new Map([[bob.pubKey, 6]]));
    summary = await recomputeRatings(runtime.store, new Set());
    expect(summary.leads).toBe(1);
    expect((await runtime.store.getParticipant(alice.pubKey))?.rating).toBeCloseTo(1.5);
    expect((await runtime.store.getParticipant(bob.pubKey))?.rating).toBeCloseTo(0.2);

    // idempotent: running again gives the same ledger
    await recomputeRatings(runtime.store, new Set());
    expect((await runtime.store.getParticipant(alice.pubKey))?.rating).toBeCloseTo(1.5);

    const me = await app.request('/v2/me', signed('/v2/me', alice.privKey));
    const body = (await me.json()) as { tier: string; rating: number; ledger: Array<{ leadId: string; kind: string; points: number }> };
    expect(body.tier).toBe('member');
    expect(body.rating).toBeCloseTo(1.5);
    expect(body.ledger).toEqual([expect.objectContaining({ leadId, kind: 'first', points: 1.5 })]);
  });

  it('hides a lead on weighted scam signals, ignores weightless keys and penalises the first observer', async () => {
    const { runtime, app } = hub();
    const alice = generateKeyPair();
    const [carol, dave, eve] = [generateKeyPair(), generateKeyPair(), generateKeyPair()];
    const leadId = (await send(app, [buildObservationEvent(observation(), alice.privKey)]))[0]!.leadId!;

    // eve has no rating and no GitHub: weight 0, her signal changes nothing
    await send(app, [buildSignalEvent({ leadId, signal: 'scam' }, eve.privKey)]);
    expect((await runtime.store.getLead(leadId))?.state).toBe('active');

    for (const k of [carol, dave]) await runtime.store.touchParticipant(k.pubKey);
    await runtime.store.setParticipantRatings(new Map([[carol.pubKey, 30], [dave.pubKey, 30]]));
    await send(app, [buildSignalEvent({ leadId, signal: 'scam' }, carol.privKey)]);
    expect((await runtime.store.getLead(leadId))?.state).toBe('active');
    await send(app, [buildSignalEvent({ leadId, signal: 'junk' }, dave.privKey)]);
    expect((await runtime.store.getLead(leadId))?.state).toBe('hidden_scam');
    expect((await (await app.request(`/v2/leads/${leadId}`)).status)).toBe(404);

    await runtime.store.setParticipantRatings(new Map([[alice.pubKey, 5], [carol.pubKey, 30], [dave.pubKey, 30]]));
    await recomputeRatings(runtime.store, new Set());
    const ledger = await runtime.store.listLedger(alice.pubKey, new Date(0).toISOString(), 10);
    expect(ledger).toEqual([expect.objectContaining({ kind: 'hidden_first', points: -3 })]);
    // R never goes below zero
    expect((await runtime.store.getParticipant(alice.pubKey))?.rating).toBe(0);
    expect((await runtime.store.getParticipant(carol.pubKey))?.rating).toBeCloseTo(0.1);
  });

  it('lets a moderator overrule signals, flag a scam contact and ban a key', async () => {
    const mod = generateKeyPair();
    const { runtime, app } = hub({ RADAR_MODERATORS: mod.pubKey });
    const alice = generateKeyPair();
    const mallory = generateKeyPair();
    const leadId = (await send(app, [buildObservationEvent(observation(), alice.privKey)]))[0]!.leadId!;

    // a moderator signal alone has weight 1; two moderator-weight complaints hide
    await runtime.store.touchParticipant(mallory.pubKey);
    await runtime.store.setParticipantRatings(new Map([[mallory.pubKey, 30]]));
    await send(app, [buildSignalEvent({ leadId, signal: 'scam' }, mallory.privKey), buildSignalEvent({ leadId, signal: 'junk' }, mod.privKey)]);
    expect((await runtime.store.getLead(leadId))?.state).toBe('hidden_scam');

    // non-moderators are refused
    const refusedBody = JSON.stringify({ state: 'active' });
    const refused = await app.request(`/v2/moderation/lead/${leadId}`, signed(`/v2/moderation/lead/${leadId}`, alice.privKey, 'POST', refusedBody));
    expect(refused.status).toBe(403);

    const body = JSON.stringify({ state: 'active', reason: 'real client, checked' });
    const decided = await app.request(`/v2/moderation/lead/${leadId}`, signed(`/v2/moderation/lead/${leadId}`, mod.privKey, 'POST', body));
    expect(await decided.json()).toMatchObject({ ok: true, state: 'active' });
    expect((await runtime.store.getLeadDecision(leadId))?.decidedBy).toBe('moderator');

    // flag the contact with the admin token: every lead with it is hidden, new ones too
    const flag = await app.request('/v2/moderation/contact', {
      method: 'POST',
      headers: { authorization: `Bearer ${ADMIN}`, 'content-type': 'application/json' },
      body: JSON.stringify({ value: '@Studio_Lead', reason: 'prepayment scam' }),
    });
    expect(await flag.json()).toMatchObject({ ok: true, contact: { type: 'telegram', value: '@studio_lead' }, leads: 1 });
    // the moderator decision still wins for the existing lead
    expect((await runtime.store.getLead(leadId))?.state).toBe('active');
    await app.request(`/v2/moderation/lead/${leadId}`, signed(`/v2/moderation/lead/${leadId}`, mod.privKey, 'POST', '{"state":null}'));
    expect((await runtime.store.getLead(leadId))?.state).toBe('hidden_scam');

    const other = (await send(app, [buildObservationEvent(observation({
      source: { platform: 'telegram', channel: '-1001111', message_id: '1' },
      text: 'Срочно нужен копирайтер для сайта, предоплата 100%, пишите @studio_lead, оплата сразу после теста',
    }), alice.privKey)]))[0]!;
    expect((await runtime.store.getLead(other.leadId!))?.state).toBe('hidden_scam');

    // ban: the key loses access and weight
    const ban = await app.request(`/v2/moderation/ban/${mallory.pubKey}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${ADMIN}`, 'content-type': 'application/json' },
      body: JSON.stringify({ reason: 'spam' }),
    });
    expect(await ban.json()).toMatchObject({ ok: true, banned: true });
    const banned = await app.request('/v2/me', signed('/v2/me', mallory.privKey));
    expect(banned.status).toBe(401);
    expect(await new WeightResolver(runtime.store, new Set()).weightOf(mallory.pubKey)).toBe(0);
    const modBan = await app.request(`/v2/moderation/ban/${mod.pubKey}`, { method: 'POST', headers: { authorization: `Bearer ${ADMIN}` } });
    expect(modBan.status).toBe(400);
  });

  it('links a key to a GitHub account and weights web votes by GitHub age', async () => {
    const { runtime, app } = hub();
    const alice = generateKeyPair();
    const leadId = (await send(app, [buildObservationEvent(observation(), alice.privKey)]))[0]!.leadId!;
    const session = await makeUserSession(runtime);
    const user = await runtime.store.getUserBySession!(session);

    const init = signed('/v2/link/github', alice.privKey, 'POST', '{}');
    (init.headers as Record<string, string>).cookie = `radar_session=${session}`;
    const linked = await app.request('/v2/link/github', init);
    expect(await linked.json()).toMatchObject({ ok: true, githubUserId: user!.id });
    const me = (await (await app.request('/v2/me', signed('/v2/me', alice.privKey))).json()) as { tier: string; githubLinked: boolean };
    expect(me).toMatchObject({ tier: 'member', githubLinked: true });

    const noSession = await app.request('/v2/link/github', signed('/v2/link/github', generateKeyPair().privKey, 'POST', '{}'));
    expect(noSession.status).toBe(401);

    // web vote is mirrored into signals as web:<user id>
    const vote = await app.request(`/leads/${leadId}/vote`, {
      method: 'POST',
      headers: { cookie: `radar_session=${session}`, 'content-type': 'application/json', origin: 'http://localhost' },
      body: JSON.stringify({ signal: 'useful' }),
    });
    expect(vote.status).toBe(200);
    const signals = await runtime.store.listSignals(leadId);
    expect(signals).toEqual([expect.objectContaining({ pubkey: `web:${user!.id}`, signal: 'useful' })]);
    // a fresh GitHub account (no created_at known) has no weight
    expect(await new WeightResolver(runtime.store, new Set()).weightOf(`web:${user!.id}`)).toBe(0);
  });

  it('writes no ledger for archived observations and halves points for age-only confirmation', async () => {
    const { runtime, app } = hub();
    const alice = generateKeyPair();
    const leadId = (await send(app, [buildObservationEvent(observation({ source: { platform: 'rss', channel: 'https://example.com/rss', message_id: 'a' } }), alice.privKey)]))[0]!.leadId!;
    const lead = (await runtime.store.getLead(leadId))!;
    const observations = await runtime.store.listObservations(leadId);
    // Age-only confirmation counts for an observer with weight (here a moderator key).
    const weights = new WeightResolver(runtime.store, new Set([alice.pubKey]));
    const later = new Date(Date.parse(lead.createdAt) + 25 * 3600 * 1000);
    expect(await ledgerForLead(lead, observations, [], weights, later)).toEqual([
      expect.objectContaining({ pubkey: alice.pubKey, kind: 'first', points: 0.5 }),
    ]);
    const archived = observations.map((o) => ({ ...o, archived: true }));
    expect(await ledgerForLead(lead, archived, [], weights, later)).toEqual([]);
  });

  it('pays a site vote that matches the outcome to the voter web key', async () => {
    const { runtime, app } = hub();
    const alice = generateKeyPair();
    const leadId = (await send(app, [buildObservationEvent(observation({ source: { platform: 'rss', channel: 'https://example.com/rss', message_id: 'v' } }), alice.privKey)]))[0]!.leadId!;
    // A confirmed lead: «useful» votes on it match the outcome.
    const lead = { ...(await runtime.store.getLead(leadId))!, confirmedAt: new Date().toISOString() };
    const observations = await runtime.store.listObservations(leadId);
    const weights = new WeightResolver(runtime.store, new Set([alice.pubKey]));
    const later = new Date(Date.parse(lead.createdAt) + 25 * 3600 * 1000);
    const votes = [{ leadId, pubkey: 'web:7', signal: 'useful' as const, comment: '', createdAt: lead.createdAt }];
    const webKey = 'b'.repeat(64);
    const paid = (entries: Array<{ kind: string; pubkey: string }>) => entries.filter((e) => e.kind === 'signal_match').map((e) => e.pubkey);
    expect(paid(await ledgerForLead(lead, observations, votes, weights, later, (id) => (id === 7 ? { payTo: webKey, keys: [webKey] } : undefined)))).toEqual([webKey]);
    // Without a way to name the web key the vote stays unpaid, as before.
    expect(paid(await ledgerForLead(lead, observations, votes, weights, later))).toEqual([]);
    // An account whose own key brought the lead is not paid for voting on it.
    expect(paid(await ledgerForLead(lead, observations, votes, weights, later, () => ({ payTo: webKey, keys: [webKey, alice.pubKey] })))).toEqual([]);
    // One person, one vote: a key of the account already signed, so the site vote is dropped.
    const nodeKey = 'c'.repeat(64);
    const both = [...votes, { leadId, pubkey: nodeKey, signal: 'useful' as const, comment: '', createdAt: lead.createdAt }];
    expect(paid(await ledgerForLead(lead, observations, both, weights, later, () => ({ payTo: webKey, keys: [webKey, nodeKey] })))).toEqual([nodeKey]);
  });

  it('gives a ring of fresh keys nothing for confirming each other', async () => {
    const { runtime, app } = hub();
    const [author, ...ring] = [generateKeyPair(), generateKeyPair(), generateKeyPair(), generateKeyPair()];
    const source = { platform: 'rss', channel: 'https://example.com/rss', message_id: 'sybil' };
    const leadId = (await send(app, [buildObservationEvent(observation({ source }), author!.privKey)]))[0]!.leadId!;
    for (const key of ring) await send(app, [buildObservationEvent(observation({ source }), key.privKey)]);
    const lead = (await runtime.store.getLead(leadId))!;
    const observations = await runtime.store.listObservations(leadId);
    expect(observations.length).toBe(4);
    const later = new Date(Date.parse(lead.createdAt) + 25 * 3600 * 1000);
    // All keys have weight 0: the lead neither ages into a confirmation nor pays the confirmers.
    expect(await ledgerForLead(lead, observations, [], new WeightResolver(runtime.store, new Set()), later)).toEqual([]);
  });
});
