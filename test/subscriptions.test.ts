import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  feedQuery,
  formatSubscriptionDigest,
  MAX_DELIVERY_FAILURES,
  savedFiltersFrom,
  signWebhook,
  subscriptionName,
  type SubscriptionRecord,
} from '../src/core/subscriptions.ts';
import type { Lead } from '../src/core/types.ts';
import { deliverDueSubscriptions, handleTelegramUpdate, telegramWebhookSecret, type SubscriptionDeps } from '../src/pipeline/subscriptions.ts';
import { createApp, subscriptionDeps } from '../src/server/app.ts';
import { makeTestRuntime, makeUserSession } from './helpers.ts';

const T0 = new Date('2026-10-30T12:00:00.000Z');
const minutes = (n: number) => new Date(T0.getTime() + n * 60_000);

function lead(id: string, at: Date, title = `Бот на Python ${id}`): Lead {
  return {
    id, sourceId: 's', title, text: 'Подробности', fingerprint: `fp-${id}`, titleKey: id, status: 'new', score: 60,
    reasons: [], createdAt: at.toISOString(), budget: 30_000, currency: 'RUB', type: 'gig',
  };
}

function subscription(overrides: Partial<SubscriptionRecord> = {}): SubscriptionRecord {
  return {
    id: 'sub1', userId: 7, name: 'Python', filters: { skill: 'Python' }, channel: 'webhook',
    target: 'https://93.184.215.14/hook', secret: 'key', paused: false, cursorAt: T0.toISOString(),
    failures: 0, createdAt: T0.toISOString(), ...overrides,
  };
}

/** A fake world: leads visible to the user up to `until`, a recording fetch. */
function world(options: { leads?: Lead[]; until?: Date; status?: number; telegramStatus?: number } = {}) {
  const runtime = makeTestRuntime({ TELEGRAM_BOT_TOKEN: 'bot-token', RADAR_SUBSCRIPTION_BOT: true, RADAR_PUBLIC_URL: 'https://hub.example' });
  const calls: Array<{ url: string; headers: Record<string, string>; body: string }> = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({ url: String(url), headers: init.headers as Record<string, string>, body: String(init.body) });
    if (String(url).startsWith('https://api.telegram.org')) {
      const status = options.telegramStatus ?? 200;
      return new Response(JSON.stringify({ ok: status === 200, description: status === 403 ? 'Forbidden: bot was blocked by the user' : undefined }), { status });
    }
    return new Response('ok', { status: options.status ?? 200 });
  }) as unknown as typeof fetch;
  let now = minutes(20);
  const deps: SubscriptionDeps = {
    store: runtime.store,
    env: runtime.env,
    logger: runtime.logger,
    fetchImpl,
    now: () => now,
    async leadsForUser(_userId, _filters, createdAfter, limit) {
      const until = (options.until ?? now).toISOString();
      const leads = (options.leads ?? [])
        .filter((l) => l.createdAt >= createdAfter && l.createdAt <= until)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, limit);
      return { leads, until };
    },
    projectLead: (l) => ({ id: l.id, title: l.title }),
  };
  return { runtime, deps, calls, setNow: (d: Date) => { now = d; } };
}

describe('saved filters', () => {
  it('reads the feed form and names the subscription', () => {
    const filters = savedFiltersFrom({ q: ' бот ', skill: 'Python', remote: '1', it: '1', budget: '50000', language: '', default_language: 'ru', sort: 'score', junk: 'x' });
    expect(filters).toEqual({ q: 'бот', skill: 'Python', remote: true, it: true, budgetRub: 50_000, language: 'ru' });
    expect(savedFiltersFrom({ language: 'all', default_language: 'ru', skill: 'Go' })).toEqual({ skill: 'Go' });
    // Intl groups thousands with a non-breaking space.
    expect(subscriptionName(filters).replace(/\s/g, ' ')).toBe('«бот» · IT · Python · удалённо · от 50 000 ₽ · на русском');
    expect(feedQuery(filters)).toBe('q=%D0%B1%D0%BE%D1%82&sort=new&budget=50000&skill=Python&language=ru&remote=1&it=1');
  });

  it('signs a webhook as HMAC of «timestamp.body»', () => {
    expect(signWebhook('key', '1700000000', '{"a":1}')).toBe(`sha256=${createHmac('sha256', 'key').update('1700000000.{"a":1}').digest('hex')}`);
  });

  it('escapes post titles in the Telegram digest', () => {
    const text = formatSubscriptionDigest({ name: 'Python', filters: { skill: 'Python' } }, [lead('a', T0, 'Бот <script>')], true, 'https://hub.example');
    expect(text).toContain('Бот &lt;script&gt;');
    expect(text).toContain('1+ новый');
    expect(text).toContain('https://hub.example/?sort=new&amp;skill=Python');
  });
});

describe('subscription delivery', () => {
  it('sends new visible leads once, signed, and moves the cursor', async () => {
    const leads = [lead('old', minutes(-5)), lead('a', minutes(5)), lead('b', minutes(10))];
    const { runtime, deps, calls, setNow } = world({ leads });
    await runtime.store.createSubscription!(subscription());

    expect(await deliverDueSubscriptions(deps)).toEqual({ checked: 1, sent: 1, failed: 0 });
    expect(calls).toHaveLength(1);
    const body = JSON.parse(calls[0]!.body);
    expect(body.leads.map((l: { id: string }) => l.id)).toEqual(['b', 'a']);
    expect(calls[0]!.headers['x-openradar-signature']).toBe(signWebhook('key', calls[0]!.headers['x-openradar-timestamp']!, calls[0]!.body));

    // Checked a minute later: not due. Twenty minutes later: due, but nothing new.
    setNow(minutes(21));
    expect((await deliverDueSubscriptions(deps)).checked).toBe(0);
    setNow(minutes(40));
    expect(await deliverDueSubscriptions(deps)).toEqual({ checked: 1, sent: 0, failed: 0 });
    expect(calls).toHaveLength(1);
  });

  it('never sends a lead before the tier delay lets the user see it', async () => {
    const leads = [lead('seen', minutes(5)), lead('delayed', minutes(15))];
    const { runtime, deps, calls } = world({ leads, until: minutes(10) });
    await runtime.store.createSubscription!(subscription());
    await deliverDueSubscriptions(deps);
    expect(JSON.parse(calls[0]!.body).leads.map((l: { id: string }) => l.id)).toEqual(['seen']);
    expect((await runtime.store.getSubscription!('sub1'))!.cursorAt).toBe(minutes(10).toISOString());
  });

  it('keeps the cursor on a failed send and pauses after repeated failures', async () => {
    const { runtime, deps, setNow } = world({ leads: [lead('a', minutes(5))], status: 500 });
    await runtime.store.createSubscription!(subscription({ failures: MAX_DELIVERY_FAILURES - 2 }));
    expect((await deliverDueSubscriptions(deps)).failed).toBe(1);
    let stored = (await runtime.store.getSubscription!('sub1'))!;
    expect(stored.cursorAt).toBe(T0.toISOString());
    expect(stored.lastError).toBe('webhook: HTTP 500');
    expect(stored.paused).toBe(false);
    setNow(minutes(40));
    await deliverDueSubscriptions(deps);
    stored = (await runtime.store.getSubscription!('sub1'))!;
    expect(stored.paused).toBe(true);
  });

  it('refuses a webhook into the internal network', async () => {
    const { runtime, deps, calls } = world({ leads: [lead('a', minutes(5))] });
    await runtime.store.createSubscription!(subscription({ target: 'https://169.254.169.254/latest' }));
    expect((await deliverDueSubscriptions(deps)).failed).toBe(1);
    expect(calls).toHaveLength(0);
  });

  it('skips Telegram until it is linked, then forgets a chat that blocked the bot', async () => {
    const { runtime, deps, calls, setNow } = world({ leads: [lead('a', minutes(5)), lead('b', minutes(30))], telegramStatus: 403 });
    const user = await runtime.store.upsertGitHubUser!({ githubId: 1, handle: 'u' });
    await runtime.store.createSubscription!(subscription({ userId: user.id, channel: 'telegram', target: undefined, secret: undefined }));
    expect(await deliverDueSubscriptions(deps)).toEqual({ checked: 1, sent: 0, failed: 0 });
    expect(calls).toHaveLength(0);

    await runtime.store.setTelegramLinkCode!(user.id, 'code-12345', minutes(60).toISOString());
    expect(await runtime.store.linkTelegramChat!('code-12345', '555', minutes(21).toISOString())).toBe(user.id);
    setNow(minutes(40));
    expect((await deliverDueSubscriptions(deps)).failed).toBe(1);
    expect(calls[0]!.url).toContain('/sendMessage');
    expect(await runtime.store.getTelegramChat!(user.id)).toBeNull();
  });
});

describe('telegram bot', () => {
  it('links a private chat by a fresh code and unlinks it on /stop', async () => {
    const { runtime, deps, calls } = world();
    const user = await runtime.store.upsertGitHubUser!({ githubId: 2, handle: 'v' });
    await runtime.store.setTelegramLinkCode!(user.id, 'fresh-code-1', minutes(60).toISOString());
    await handleTelegramUpdate({ message: { chat: { id: 99, type: 'group' }, text: '/start fresh-code-1' } }, deps);
    expect(await runtime.store.getTelegramChat!(user.id)).toBeNull();
    await handleTelegramUpdate({ message: { chat: { id: 99, type: 'private' }, text: '/start fresh-code-1' } }, deps);
    expect(await runtime.store.getTelegramChat!(user.id)).toBe('99');
    expect(JSON.parse(calls.at(-1)!.body).text).toContain('Telegram подключён');
    // The code is single-use.
    expect(await runtime.store.linkTelegramChat!('fresh-code-1', '100', minutes(21).toISOString())).toBeNull();
    await handleTelegramUpdate({ message: { chat: { id: 99, type: 'private' }, text: '/stop' } }, deps);
    expect(await runtime.store.getTelegramChat!(user.id)).toBeNull();
  });
});

describe('subscription routes', () => {
  const post = (path: string, session: string, form: Record<string, string> = {}) => ({
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: `radar_session=${session}`, origin: 'http://localhost' },
    body: new URLSearchParams(form).toString(),
  });

  it('follows the filters on screen, lists, pauses, moves to a webhook and deletes', async () => {
    const runtime = makeTestRuntime({ RADAR_ADMIN_TOKEN: 'secret', RADAR_PUBLIC_READ: true });
    const app = createApp(runtime);
    const session = await makeUserSession(runtime);

    const feed = await (await app.request('/?skill=Python', { headers: { cookie: `radar_session=${session}` } })).text();
    expect(feed).toContain('formaction="/subscriptions"');
    expect(feed).toContain('name="default_language" value="ru"');

    const created = await app.request('/subscriptions', post('/subscriptions', session, { skill: 'Python', remote: '1', default_language: 'ru' }));
    expect(created.headers.get('location')).toBe('/me?subscriptions=created#subscriptions');
    const [sub] = await runtime.store.listSubscriptions!((await runtime.store.upsertGitHubUser!({ githubId: 583231, handle: 'octocat' })).id);
    expect(sub!.filters).toEqual({ skill: 'Python', remote: true, language: 'ru' });
    expect(sub!.name).toBe('Python · удалённо · на русском');
    const again = await app.request('/subscriptions', post('/subscriptions', session, { skill: 'Python', remote: '1', default_language: 'ru' }));
    expect(again.headers.get('location')).toBe('/me?subscriptions=exists#subscriptions');

    const me = await (await app.request('/me', { headers: { cookie: `radar_session=${session}` } })).text();
    expect(me).toContain('id="subscriptions"');
    expect(me).toContain('Python · удалённо · на русском');

    await app.request(`/subscriptions/${sub!.id}/pause`, post('', session));
    expect((await runtime.store.getSubscription!(sub!.id))!.paused).toBe(true);

    const internal = await app.request(`/subscriptions/${sub!.id}/channel`, post('', session, { target: 'https://127.0.0.1/hook' }));
    expect(internal.headers.get('location')).toContain('bad_url');
    const plain = await app.request(`/subscriptions/${sub!.id}/channel`, post('', session, { target: 'http://93.184.215.14/hook' }));
    expect(plain.headers.get('location')).toContain('bad_url');
    await app.request(`/subscriptions/${sub!.id}/channel`, post('', session, { target: 'https://93.184.215.14/hook' }));
    const moved = (await runtime.store.getSubscription!(sub!.id))!;
    expect(moved.channel).toBe('webhook');
    expect(moved.secret).toMatch(/^[0-9a-f]{48}$/);

    // Someone else's subscription is out of reach.
    const other = await runtime.store.upsertGitHubUser!({ githubId: 999, handle: 'other' });
    await runtime.store.createSession!('other-session', new Date(Date.now() + 3600_000).toISOString(), other.id);
    await app.request(`/subscriptions/${sub!.id}/delete`, post('', 'other-session'));
    expect(await runtime.store.getSubscription!(sub!.id)).not.toBeNull();

    await app.request(`/subscriptions/${sub!.id}/delete`, post('', session));
    expect(await runtime.store.getSubscription!(sub!.id)).toBeNull();
    await runtime.store.close();
  });

  it('refuses an empty filter and a guest', async () => {
    const runtime = makeTestRuntime({ RADAR_ADMIN_TOKEN: 'secret', RADAR_PUBLIC_READ: true });
    const app = createApp(runtime);
    const session = await makeUserSession(runtime);
    const empty = await app.request('/subscriptions', post('', session, { sort: 'score', default_language: 'ru' }));
    expect(empty.headers.get('location')).toContain('subscriptions=empty');
    const guest = await app.request('/subscriptions', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', origin: 'http://localhost' }, body: 'skill=Python' });
    expect(guest.headers.get('location')).toContain('/login');
    const page = await (await app.request('/?skill=Python')).text();
    expect(page).toContain('href="/login?returnTo=%2F%3Fskill%3DPython"');
    await runtime.store.close();
  });

  it('takes Telegram updates only with the secret header', async () => {
    const runtime = makeTestRuntime({ RADAR_ADMIN_TOKEN: 'secret', RADAR_SUBSCRIPTION_BOT: true, TELEGRAM_BOT_TOKEN: 't' });
    const app = createApp(runtime);
    const update = { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message: { chat: { id: 1, type: 'private' }, text: '/stop' } }) };
    expect((await app.request('/api/telegram/webhook', update)).status).toBe(403);
    expect(subscriptionDeps(runtime).store).toBe(runtime.store);
    await runtime.store.close();
    expect(telegramWebhookSecret('secret')).toHaveLength(48);
  });
});
