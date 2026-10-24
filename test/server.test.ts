import { describe, expect, it } from 'vitest';
import { createApp } from '../src/server/app.ts';
import type { Runtime } from '../src/runtime.ts';
import type { Env } from '../src/core/types.ts';
import { loadEnv } from '../src/config.ts';
import { makeTestRuntime, makeUserSession } from './helpers.ts';

function makeRuntime(overrides: Partial<Env> = {}, fetchImpl: typeof fetch = fetch): Runtime {
  const base = makeTestRuntime({ RADAR_ADMIN_TOKEN: 'secret', ...overrides });
  return {
    env: base.env,
    logger: base.logger,
    store: base.store,
    sources: base.sources,
    sinks: base.sinks,
    fetchImpl,
  };
}

function formBody(values: Record<string, string>): string {
  return new URLSearchParams(values).toString();
}

describe('http server', () => {
  it('fails fast in production when RADAR_ADMIN_TOKEN is missing or weak', () => {
    const prevEnv = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'production';
      expect(() => loadEnv({ NODE_ENV: 'production', RADAR_ADMIN_TOKEN: undefined })).toThrow(
        /RADAR_ADMIN_TOKEN is missing/,
      );
      expect(() => loadEnv({ NODE_ENV: 'production', RADAR_ADMIN_TOKEN: 'change-me' })).toThrow(
        /RADAR_ADMIN_TOKEN is missing/,
      );
      expect(() => loadEnv({ NODE_ENV: 'production', RADAR_ADMIN_TOKEN: 'too-short' })).toThrow(
        /shorter than 32 characters/,
      );
      expect(() =>
        loadEnv({
          NODE_ENV: 'production',
          RADAR_ADMIN_TOKEN: '012345678901234567890123456789012',
        }),
      ).not.toThrow();
    } finally {
      process.env.NODE_ENV = prevEnv;
    }
  });

  it('rejects unauthenticated requests to protected endpoints with 401 or redirect', async () => {
    const runtime = makeRuntime();
    const app = createApp(runtime);

    const apiLeads = await app.request('/api/leads');
    expect(apiLeads.status).toBe(401);

    const webSources = await app.request('/sources');
    expect(webSources.status).toBe(302);
    expect(webSources.headers.get('location')).toBe('/login');

    await runtime.store.close();
  });

  it('exposes health without auth', async () => {
    const runtime = makeRuntime();
    const app = createApp(runtime);
    const response = await app.request('/health');
    expect(response.status).toBe(200);
    const body = (await response.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
    await runtime.store.close();
  });

  it('protects the api when an admin token is configured', async () => {
    const runtime = makeRuntime();
    const app = createApp(runtime);

    const unauthorized = await app.request('/api/sources');
    expect(unauthorized.status).toBe(401);

    const authorized = await app.request('/api/sources', {
      headers: { authorization: 'Bearer secret' },
    });
    expect(authorized.status).toBe(200);
    await runtime.store.close();
  });

  it('redacts source tokens in read APIs', async () => {
    const runtime = makeRuntime();
    await runtime.store.createSource({
      kind: 'webhook',
      title: 'Secret source',
      config: { token: 'super-secret' },
    });
    const app = createApp(runtime);

    const response = await app.request('/api/sources', {
      headers: { authorization: 'Bearer secret' },
    });
    const sources = (await response.json()) as Array<{ config: { token?: string } }>;
    expect(sources[0]?.config.token).toBe('***');
    await runtime.store.close();
  });

  it('serves source health and a source page', async () => {
    const runtime = makeRuntime();
    const source = await runtime.store.createSource({ kind: 'rss', title: 'Health feed' });
    await runtime.store.recordRun({
      id: 'run-1',
      sourceId: source.id,
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      found: 2,
      inserted: 1,
      duplicates: 1,
      rejected: 0,
      delivered: 1,
    });
    const app = createApp(runtime);

    const api = await app.request('/api/sources/health', {
      headers: { authorization: 'Bearer secret' },
    });
    expect(api.status).toBe(200);
    const health = (await api.json()) as Array<{ source: { id: string }; successRate: number }>;
    expect(health[0]?.source.id).toBe(source.id);
    expect(health[0]?.successRate).toBe(100);

    const page = await app.request(`/sources/${source.id}`, {
      headers: { authorization: 'Bearer secret' },
    });
    expect(page.status).toBe(200);
    expect(await page.text()).toContain('Health feed');
    await runtime.store.close();
  });

  it('accepts a webhook lead and stores it', async () => {
    const runtime = makeRuntime();
    const source = await runtime.store.createSource({
      kind: 'webhook',
      title: 'Inbound',
      config: { token: 'hook-secret' },
    });
    const app = createApp(runtime);

    const response = await app.request(`/api/ingest/${source.id}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-radar-token': 'hook-secret',
      },
      body: JSON.stringify({
        title: 'Нужен сантехник',
        text: 'Прорвало трубу, Ставрополь, бюджет 5000 ₽',
      }),
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      outcomes: Array<{ status: string }>;
    };
    expect(body.outcomes).toHaveLength(1);
    expect(body.outcomes[0]?.status).toBe('inserted');

    const leads = await app.request('/api/leads', {
      headers: { authorization: 'Bearer secret' },
    });
    const list = (await leads.json()) as Array<{ title: string }>;
    expect(list).toHaveLength(1);
    expect(list[0]?.title).toContain('сантехник');
    await runtime.store.close();
  });

  async function makeAdminSession(runtime: Runtime): Promise<string> {
    const sessionId = 'test-session-123';
    const expiresAt = new Date(Date.now() + 3600 * 1000).toISOString();
    await runtime.store.createSession?.(sessionId, expiresAt);
    return sessionId;
  }

  it('creates a source from the dashboard form', async () => {
    const runtime = makeRuntime();
    const sessionId = await makeAdminSession(runtime);
    const app = createApp(runtime);

    const page = await app.request('/sources/new', {
      headers: { cookie: `radar_session=${sessionId}` },
    });
    expect(page.status).toBe(200);
    expect(await page.text()).toContain('Новый источник');

    const response = await app.request('/sources', {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        cookie: `radar_session=${sessionId}`,
        origin: 'http://localhost',
      },
      body: formBody({
        kind: 'rss',
        title: 'UI feed',
        url: 'https://example.com/rss',
        includeKeywords: 'сантехник, электрик',
        city: 'Ставрополь',
      }),
    });

    expect(response.status).toBe(302);
    const sources = await runtime.store.listSources();
    expect(sources).toHaveLength(1);
    expect(sources[0]?.title).toBe('UI feed');
    expect(sources[0]?.config.includeKeywords).toEqual(['сантехник', 'электрик']);
    expect(response.headers.get('location')).toBe(`/sources/${sources[0]?.id}?created=1`);
    await runtime.store.close();
  });

  it('shows a webhook token once after creation', async () => {
    const runtime = makeRuntime();
    const sessionId = await makeAdminSession(runtime);
    const app = createApp(runtime);

    const response = await app.request('/sources', {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        cookie: `radar_session=${sessionId}`,
        origin: 'http://localhost',
      },
      body: formBody({ kind: 'webhook', title: 'Browser' }),
    });

    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain('Токен');
    const sources = await runtime.store.listSources();
    expect(sources[0]?.config.token).toMatch(/^[a-f0-9]{32}$/);
    await runtime.store.close();
  });

  it('sets a secure cookie behind an https proxy', async () => {
    const runtime = makeRuntime();
    const app = createApp(runtime);

    const response = await app.request('/login', {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        'x-forwarded-proto': 'https',
        origin: 'https://localhost',
      },
      body: formBody({ token: 'secret' }),
    });

    expect(response.status).toBe(302);
    expect(response.headers.get('set-cookie')).toContain('Secure');
    expect(response.headers.get('set-cookie')).toContain('radar_session=');
    await runtime.store.close();
  });

  it('rate limits brute-force attempts on /login', async () => {
    const runtime = makeRuntime();
    const app = createApp(runtime);

    // The limiter allows 10 attempts per 15 minutes per client.
    let lastStatus = 0;
    for (let attempt = 0; attempt < 11; attempt++) {
      const res = await app.request('/login', {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          'x-forwarded-for': '203.0.113.7',
          origin: 'http://localhost',
        },
        body: formBody({ token: 'wrong-token' }),
      });
      lastStatus = res.status;
    }
    expect(lastStatus).toBe(429);

    // A different client IP keeps its own bucket.
    const otherClient = await app.request('/login', {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        'x-forwarded-for': '198.51.100.9',
        origin: 'http://localhost',
      },
      body: formBody({ token: 'wrong-token' }),
    });
    expect(otherClient.status).toBe(401);
    await runtime.store.close();
  });

  it('rejects cross-origin form posts', async () => {
    const runtime = makeRuntime();
    const sessionId = await makeAdminSession(runtime);
    const app = createApp(runtime);

    const response = await app.request('/sources', {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        cookie: `radar_session=${sessionId}`,
        origin: 'https://evil.example',
      },
      body: formBody({ kind: 'rss', title: 'Evil', url: 'https://example.com/rss' }),
    });

    expect(response.status).toBe(403);
    expect(await runtime.store.listSources()).toHaveLength(0);
    await runtime.store.close();
  });

  it('ignores ?token= query parameter for security', async () => {
    const runtime = makeRuntime();
    const app = createApp(runtime);

    const res = await app.request('/api/leads?token=secret');
    expect(res.status).toBe(401);

    const webRes = await app.request('/?token=secret');
    expect(webRes.status).toBe(302);
    expect(webRes.headers.get('location')).toBe('/login');

    await runtime.store.close();
  });

  it('serves the leads and sources pages', async () => {
    const runtime = makeRuntime();
    const sessionId = await makeAdminSession(runtime);
    const app = createApp(runtime);

    const leads = await app.request('/', {
      headers: { cookie: `radar_session=${sessionId}` },
    });
    expect(leads.status).toBe(200);
    expect(await leads.text()).toContain('Radar');

    const sources = await app.request('/sources', {
      headers: { cookie: `radar_session=${sessionId}` },
    });
    expect(sources.status).toBe(200);
    expect(await sources.text()).toContain('Источники');
    await runtime.store.close();
  });

  it('serves a lead detail page', async () => {
    const runtime = makeRuntime();
    const sessionId = await makeAdminSession(runtime);
    const source = await runtime.store.createSource({
      kind: 'webhook',
      title: 'Inbound',
      config: { token: 'hook-secret' },
    });
    const app = createApp(runtime);

    const ingest = await app.request(`/api/ingest/${source.id}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-radar-token': 'hook-secret' },
      body: JSON.stringify({
        title: 'Нужен сантехник',
        text: 'Прорвало трубу, Ставрополь, бюджет 5000 ₽',
      }),
    });
    const result = (await ingest.json()) as {
      outcomes: Array<{ lead?: { id: string } }>;
    };
    const leadId = result.outcomes[0]?.lead?.id;
    expect(leadId).toBeTruthy();

    const page = await app.request(`/leads/${leadId}`, {
      headers: { cookie: `radar_session=${sessionId}` },
    });
    expect(page.status).toBe(200);
    expect(await page.text()).toContain('Прорвало трубу');
    await runtime.store.close();
  });

  it('edits a source and keeps a webhook token', async () => {
    const runtime = makeRuntime();
    const sessionId = await makeAdminSession(runtime);
    const source = await runtime.store.createSource({
      kind: 'webhook',
      title: 'Old title',
      config: { token: 'keep-me' },
    });
    const app = createApp(runtime);

    const form = await app.request(`/sources/${source.id}/edit`, {
      headers: { cookie: `radar_session=${sessionId}` },
    });
    expect(form.status).toBe(200);
    expect(await form.text()).toContain('Редактировать источник');

    const response = await app.request(`/sources/${source.id}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        cookie: `radar_session=${sessionId}`,
        origin: 'http://localhost',
      },
      body: formBody({ title: 'New title', city: 'Ставрополь' }),
    });
    expect(response.status).toBe(302);
    const updated = await runtime.store.getSource(source.id);
    expect(updated?.title).toBe('New title');
    expect(updated?.config.token).toBe('keep-me');
    expect(updated?.config.city).toBe('Ставрополь');
    await runtime.store.close();
  });

  it('toggles and deletes a source from the dashboard', async () => {
    const runtime = makeRuntime();
    const sessionId = await makeAdminSession(runtime);
    const source = await runtime.store.createSource({ kind: 'rss', title: 'Toggle me' });
    const app = createApp(runtime);

    const toggle = await app.request(`/sources/${source.id}/toggle`, {
      method: 'POST',
      headers: {
        cookie: `radar_session=${sessionId}`,
        origin: 'http://localhost',
      },
    });
    expect(toggle.status).toBe(302);
    expect((await runtime.store.getSource(source.id))?.enabled).toBe(false);

    const remove = await app.request(`/sources/${source.id}/delete`, {
      method: 'POST',
      headers: {
        cookie: `radar_session=${sessionId}`,
        origin: 'http://localhost',
      },
    });
    expect(remove.status).toBe(302);
    expect(await runtime.store.getSource(source.id)).toBeNull();
    await runtime.store.close();
  });

  it('supports GDPR erasure with DELETE /api/leads/:id', async () => {
    const runtime = makeRuntime();
    const app = createApp(runtime);
    const source = await runtime.store.createSource({ kind: 'rss', title: 'Feed' });
    const now = new Date().toISOString();
    const leadId = 'lead-gdpr-1';
    await runtime.store.insertLead({
      id: leadId,
      sourceId: source.id,
      externalId: 'ext-gdpr-1',
      title: 'Удалить меня',
      titleKey: 'удалить меня',
      text: 'Персональные данные Иванова Ивана',
      fingerprint: 'fp-gdpr-1',
      status: 'new',
      score: 50,
      reasons: [],
      createdAt: now,
    });

    const notFound = await app.request('/api/leads/non-existent-id', {
      method: 'DELETE',
      headers: { authorization: 'Bearer secret', origin: 'http://localhost' },
    });
    expect(notFound.status).toBe(404);

    const deleted = await app.request(`/api/leads/${leadId}`, {
      method: 'DELETE',
      headers: { authorization: 'Bearer secret', origin: 'http://localhost' },
    });
    expect(deleted.status).toBe(200);
    expect(await runtime.store.getLead(leadId)).toBeNull();
    await runtime.store.close();
  });

  it('updates lead funnel status and applies score feedback', async () => {
    const runtime = makeRuntime();
    const sessionId = await makeAdminSession(runtime);
    const source = await runtime.store.createSource({ kind: 'rss', title: 'Feed' });
    const now = new Date().toISOString();
    const leadId = 'lead-funnel-1';
    await runtime.store.insertLead({
      id: leadId,
      sourceId: source.id,
      title: 'Разработка на Svelte',
      titleKey: 'разработка на svelte',
      text: 'Нужно сделать компонент',
      fingerprint: 'fp-funnel-1',
      status: 'new',
      score: 50,
      reasons: [],
      createdAt: now,
    });

    const app = createApp(runtime);

    // 1. Change funnel status to "interesting"
    const statusRes = await app.request(`/leads/${leadId}/status`, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        cookie: `radar_session=${sessionId}`,
        origin: 'http://localhost',
      },
      body: formBody({ status: 'interesting' }),
    });
    expect(statusRes.status).toBe(302);
    expect((await runtime.store.getLead(leadId))?.status).toBe('interesting');

    // 2. Feedback "+10 Подходит"
    const feedbackUp = await app.request(`/leads/${leadId}/feedback`, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        cookie: `radar_session=${sessionId}`,
        origin: 'http://localhost',
      },
      body: formBody({ feedback: 'up' }),
    });
    expect(feedbackUp.status).toBe(302);
    expect((await runtime.store.getLead(leadId))?.score).toBe(60);

    // 3. API status patch
    const patchRes = await app.request(`/api/leads/${leadId}/status`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer secret',
        origin: 'http://localhost',
      },
      body: JSON.stringify({ status: 'applied' }),
    });
    expect(patchRes.status).toBe(200);
    expect((await runtime.store.getLead(leadId))?.status).toBe('applied');

    // 4. A logged-in GitHub user without admin rights cannot change the funnel
    const userSession = await makeUserSession(runtime);
    const denied = await app.request(`/leads/${leadId}/status`, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        cookie: `radar_session=${userSession}`,
        origin: 'http://localhost',
      },
      body: formBody({ status: 'rejected' }),
    });
    expect(denied.status).toBe(302);
    expect(denied.headers.get('location')).toBe('/login');
    expect((await runtime.store.getLead(leadId))?.status).toBe('applied');

    await runtime.store.close();
  });

  it('prevents stored XSS by sanitizing javascript: links', async () => {
    const runtime = makeRuntime();
    const sessionId = await makeAdminSession(runtime);
    const source = await runtime.store.createSource({
      kind: 'webhook',
      title: 'Hook',
      config: { token: 'hook-secret' },
    });
    const app = createApp(runtime);

    const ingest = await app.request(`/api/ingest/${source.id}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-radar-token': 'hook-secret' },
      body: JSON.stringify({
        title: 'XSS Test',
        text: 'Order description',
        url: 'javascript:alert(document.cookie)',
      }),
    });
    const result = (await ingest.json()) as { outcomes: Array<{ lead?: { id: string } }> };
    const leadId = result.outcomes[0]?.lead?.id;
    expect(leadId).toBeTruthy();

    const lead = await runtime.store.getLead(leadId!);
    expect(lead?.url).toBeUndefined();

    const page = await app.request(`/leads/${leadId}`, {
      headers: { cookie: `radar_session=${sessionId}` },
    });
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).not.toContain('javascript:alert');

    await runtime.store.close();
  });

  it('requires a GitHub user for /api/leads/:id/vote and counts one vote per user', async () => {
    const runtime = makeRuntime();
    const source = await runtime.store.createSource({ kind: 'rss', title: 'Feed' });
    const lead = {
      id: 'lead-vote-test',
      sourceId: source.id,
      title: 'Нужен фронтендер',
      text: 'Разработка на React',
      fingerprint: 'fp-vote-test',
      titleKey: 'нужен фронтендер',
      status: 'new' as const,
      score: 70,
      reasons: [],
      createdAt: new Date().toISOString(),
    };
    await runtime.store.insertLead(lead);
    const app = createApp(runtime);

    // 1. Anonymous (even with the admin token) -> login required
    const anonVote = await app.request(`/api/leads/${lead.id}/vote`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer secret',
        origin: 'http://localhost',
      },
      body: JSON.stringify({ signal: 'useful' }),
    });
    expect(anonVote.status).toBe(401);

    // 2. Invalid signal with a user session -> 400
    const sessionId = await makeUserSession(runtime);
    const badVote = await app.request(`/api/leads/${lead.id}/vote`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: `radar_session=${sessionId}`,
        origin: 'http://localhost',
      },
      body: JSON.stringify({ signal: 'invalid' }),
    });
    expect(badVote.status).toBe(400);

    // 3. Vote weight is fixed at 1.0; client-supplied weight/reputation is ignored
    const goodVote = await app.request(`/api/leads/${lead.id}/vote`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: `radar_session=${sessionId}`,
        origin: 'http://localhost',
      },
      body: JSON.stringify({ signal: 'useful', reputation: 5.0, weight: 4.2 }),
    });
    expect(goodVote.status).toBe(200);
    const result = (await goodVote.json()) as {
      ok: boolean;
      votes_up: number;
      alreadyVoted: boolean;
    };
    expect(result.ok).toBe(true);
    expect(result.votes_up).toBe(1);
    expect(result.alreadyVoted).toBe(false);

    // 4. Repeating the same signal does not change the counters
    const repeatVote = await app.request(`/api/leads/${lead.id}/vote`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: `radar_session=${sessionId}`,
        origin: 'http://localhost',
      },
      body: JSON.stringify({ signal: 'useful' }),
    });
    expect(repeatVote.status).toBe(200);
    const repeatResult = (await repeatVote.json()) as { votes_up: number; alreadyVoted: boolean };
    expect(repeatResult.votes_up).toBe(1);
    expect(repeatResult.alreadyVoted).toBe(true);

    await runtime.store.close();
  });

  it('renders voting controls per role on /leads/:id and counts form votes once (TASK-A1)', async () => {
    const runtime = makeRuntime();
    const source = await runtime.store.createSource({ kind: 'webhook', title: 'Web Source' });
    const lead = {
      id: 'lead-vote-ui-test',
      sourceId: source.id,
      type: 'gig' as const,
      title: 'Сайт для кофейни',
      text: 'Требуется сделать одностраничник для кофейни на Vue',
      fingerprint: 'fp-vote-ui',
      titleKey: 'сайт для кофейни',
      status: 'new' as const,
      score: 50,
      reasons: [],
      createdAt: new Date().toISOString(),
      votes_up: 5,
      votes_down: 2,
      votes_scam: 1,
      votes_closed: 0,
    };
    await runtime.store.insertLead(lead);
    const app = createApp(runtime);
    const userSession = await makeUserSession(runtime);
    const adminSession = await makeAdminSession(runtime);

    // 1. Logged-in GitHub user sees the active voting form
    const userPage = await app.request(`/leads/${lead.id}`, {
      headers: { cookie: `radar_session=${userSession}` },
    });
    expect(userPage.status).toBe(200);
    const userHtml = await userPage.text();
    expect(userHtml).toContain('Полезно');
    expect(userHtml).toContain('>5<');
    expect(userHtml).toContain('name="signal"');

    // 2. Guests and admin sessions see counts plus a login hint instead of the form
    const guestPage = await app.request(`/leads/${lead.id}`, {
      headers: { cookie: `radar_session=${adminSession}` },
    });
    expect(guestPage.status).toBe(200);
    const guestHtml = await guestPage.text();
    expect(guestHtml).toContain('>5<');
    expect(guestHtml).toContain('Войти через GitHub, чтобы голосовать');
    expect(guestHtml).not.toContain('name="signal"');
    // the funnel stays admin-only and remains visible for the admin session
    expect(guestHtml).toContain('name="status"');

    // 3. Form vote from a user session is counted
    const formVoteRes = await app.request(`/leads/${lead.id}/vote`, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        cookie: `radar_session=${userSession}`,
        origin: 'http://localhost',
      },
      body: formBody({ signal: 'useful' }),
    });
    expect(formVoteRes.status).toBe(302);
    expect(formVoteRes.headers.get('location')).toBe(`/leads/${lead.id}`);
    const afterForm = await runtime.store.getLead(lead.id);
    expect(afterForm?.votes_up).toBe(6);

    // 4. Repeating the same vote from the same user changes nothing
    await app.request(`/leads/${lead.id}/vote`, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        cookie: `radar_session=${userSession}`,
        origin: 'http://localhost',
      },
      body: formBody({ signal: 'useful' }),
    });
    expect((await runtime.store.getLead(lead.id))?.votes_up).toBe(6);

    await runtime.store.close();
  });

  it('implements type filter tab on main page and API query (TASK-A5)', async () => {
    const runtime = makeRuntime();
    const sessionId = await makeAdminSession(runtime);
    const source = await runtime.store.createSource({ kind: 'webhook', title: 'Mixed Source' });
    const gigLead = {
      id: 'lead-gig-1',
      sourceId: source.id,
      type: 'gig' as const,
      title: 'Разработка лендинга',
      text: 'Фриланс проект по верстке',
      fingerprint: 'fp-gig-1',
      titleKey: 'разработка лендинга',
      status: 'new' as const,
      score: 50,
      reasons: [],
      createdAt: new Date('2026-10-23T10:00:00Z').toISOString(),
    };
    const jobLead = {
      id: 'lead-job-1',
      sourceId: source.id,
      type: 'job' as const,
      title: 'Fullstack Разработчик в штат',
      text: 'Полноценная занятость в аккредитованной IT-компании',
      fingerprint: 'fp-job-1',
      titleKey: 'fullstack разработчик в штат',
      status: 'new' as const,
      score: 60,
      reasons: [],
      createdAt: new Date('2026-10-23T11:00:00Z').toISOString(),
    };
    await runtime.store.insertLead(gigLead);
    await runtime.store.insertLead(jobLead);
    const app = createApp(runtime);

    // 1. Default page: shows type tabs (Все / Заказы / Вакансии) and both leads
    const defaultPage = await app.request('/', {
      headers: { cookie: `radar_session=${sessionId}` },
    });
    expect(defaultPage.status).toBe(200);
    const defaultHtml = await defaultPage.text();
    expect(defaultHtml).toContain('class="type-tab active"');
    expect(defaultHtml).toContain('Заказы');
    expect(defaultHtml).toContain('Вакансии');
    expect(defaultHtml).toContain('Разработка лендинга');
    expect(defaultHtml).toContain('Fullstack Разработчик в штат');

    // 2. Filter by type=job: shows only job lead and preserves type in search form
    const jobPage = await app.request('/?type=job', {
      headers: { cookie: `radar_session=${sessionId}` },
    });
    expect(jobPage.status).toBe(200);
    const jobHtml = await jobPage.text();
    expect(jobHtml).toContain('Fullstack Разработчик в штат');
    expect(jobHtml).not.toContain('Разработка лендинга');
    expect(jobHtml).toContain('<input type="hidden" name="type" value="job">');

    // 3. Filter by type=gig: shows only gig lead
    const gigPage = await app.request('/?type=gig', {
      headers: { cookie: `radar_session=${sessionId}` },
    });
    expect(gigPage.status).toBe(200);
    const gigHtml = await gigPage.text();
    expect(gigHtml).toContain('Разработка лендинга');
    expect(gigHtml).not.toContain('Fullstack Разработчик в штат');
    expect(gigHtml).toContain('<input type="hidden" name="type" value="gig">');

    // 4. API endpoint filtering: /api/leads?type=job
    const apiJobRes = await app.request('/api/leads?type=job', {
      headers: { authorization: 'Bearer secret' },
    });
    expect(apiJobRes.status).toBe(200);
    const apiJobs = (await apiJobRes.json()) as Array<{ id: string; type?: string }>;
    expect(apiJobs).toHaveLength(1);
    expect(apiJobs[0]?.id).toBe('lead-job-1');

    // 5. API endpoint filtering: /api/leads?type=gig
    const apiGigRes = await app.request('/api/leads?type=gig', {
      headers: { authorization: 'Bearer secret' },
    });
    expect(apiGigRes.status).toBe(200);
    const apiGigs = (await apiGigRes.json()) as Array<{ id: string; type?: string }>;
    expect(apiGigs).toHaveLength(1);
    expect(apiGigs[0]?.id).toBe('lead-gig-1');

    await runtime.store.close();
  });

  it('correctly ingests leads with type property', async () => {
    const runtime = makeRuntime();
    const source = await runtime.store.createSource({
      kind: 'webhook',
      title: 'Ext Webhook',
      config: { token: 'wh-token' },
    });
    const app = createApp(runtime);

    const ingestRes = await app.request(`/api/ingest/${source.id}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-radar-token': 'wh-token',
      },
      body: JSON.stringify({
        title: 'Senior Frontend Engineer',
        text: 'React, TypeScript, CSS architecture',
        type: 'job',
        author: 'Recruiter',
      }),
    });
    expect(ingestRes.status).toBe(200);
    const result = (await ingestRes.json()) as { outcomes: Array<{ lead?: { id: string; type?: string } }> };
    const leadId = result.outcomes[0]?.lead?.id;
    expect(leadId).toBeTruthy();

    const storedLead = await runtime.store.getLead(leadId!);
    expect(storedLead?.type).toBe('job');

    await runtime.store.close();
  });

  it('serves search RSS feed with matching items', async () => {
    const runtime = makeRuntime({ RADAR_PUBLIC_READ: true });
    const source = await runtime.store.createSource({ kind: 'rss', title: 'Feed' });
    await runtime.store.insertLead({
      id: 'lead-rss-1',
      sourceId: source.id,
      title: 'Python Backend Lead',
      text: 'FastAPI and PostgreSQL development',
      fingerprint: 'fp-rss-1',
      titleKey: 'python-backend-lead',
      status: 'new',
      score: 85,
      reasons: [],
      createdAt: '2026-10-23T14:00:00Z',
    });
    const app = createApp(runtime);

    const rssRes = await app.request('/feed.rss?q=FastAPI');
    expect(rssRes.status).toBe(200);
    expect(rssRes.headers.get('content-type')).toContain('application/rss+xml');
    const xml = await rssRes.text();
    expect(xml).toContain('<rss version="2.0"');
    expect(xml).toContain('<title>Python Backend Lead</title>');
    expect(xml).toContain('FastAPI and PostgreSQL');

    await runtime.store.close();
  });

  it('serves federation delta stream in JSON and NDJSON formats', async () => {
    const runtime = makeRuntime({ RADAR_PUBLIC_READ: true });
    const source = await runtime.store.createSource({ kind: 'rss', title: 'Feed' });
    await runtime.store.insertLead({
      id: 'lead-delta-1',
      sourceId: source.id,
      title: 'DevOps Engineer',
      text: 'Kubernetes, Terraform, CI/CD',
      fingerprint: 'fp-delta-1',
      titleKey: 'devops-engineer',
      status: 'new',
      score: 90,
      reasons: [],
      createdAt: '2026-10-23T14:30:00Z',
    });
    const app = createApp(runtime);

    // JSON delta
    const jsonRes = await app.request('/api/delta?since=2026-10-23T00:00:00Z');
    expect(jsonRes.status).toBe(200);
    const jsonBody = (await jsonRes.json()) as { count: number; items: Array<{ id: string }> };
    expect(jsonBody.count).toBe(1);
    expect(jsonBody.items[0]?.id).toBe('lead-delta-1');

    // NDJSON delta
    const ndjsonRes = await app.request('/api/delta?format=ndjson&since=2026-10-23T00:00:00Z');
    expect(ndjsonRes.status).toBe(200);
    const ndjsonText = await ndjsonRes.text();
    expect(ndjsonText).toContain('"id":"lead-delta-1"');

    await runtime.store.close();
  });

  it('serves /submit with a login gate and creates leads for GitHub users via /api/submit', async () => {
    const runtime = makeRuntime({
      RADAR_PUBLIC_READ: true,
      GITHUB_CLIENT_ID: 'client-id',
      GITHUB_CLIENT_SECRET: 'client-secret',
    });
    const app = createApp(runtime);
    const userSession = await makeUserSession(runtime);

    // 1. Guest sees the login gate instead of the form
    const guestRes = await app.request('/submit');
    expect(guestRes.status).toBe(200);
    const guestHtml = await guestRes.text();
    expect(guestHtml).toContain('Добавление заказов — для участников');
    expect(guestHtml).toContain('Войти через GitHub');
    expect(guestHtml).not.toContain('id="url-input"');

    // 2. Anonymous POST /api/submit -> login required
    const anonRes = await app.request('/api/submit', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Аноним', text: 'Попытка без входа' }),
    });
    expect(anonRes.status).toBe(401);

    // 3. GET /submit for a logged-in user renders the form
    const pageRes = await app.request('/submit', {
      headers: { cookie: `radar_session=${userSession}` },
    });
    expect(pageRes.status).toBe(200);
    expect(await pageRes.text()).toContain('url-input');

    // 4. POST /api/submit creates a lead attributed to the GitHub user
    const submitRes = await app.request('/api/submit', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: `radar_session=${userSession}`,
      },
      body: JSON.stringify({
        url: 'https://example.com/jobs/senior-architect',
        title: 'Lead Software Architect',
        text: 'Microservices architecture with Go and Kubernetes',
        type: 'job',
        budget: 350000,
        currency: 'RUB',
      }),
    });
    expect(submitRes.status).toBe(200);
    const result = (await submitRes.json()) as { ok: boolean; leadId?: string };
    expect(result.ok).toBe(true);
    expect(result.leadId).toBeTruthy();

    const stored = await runtime.store.getLead(result.leadId!);
    expect(stored?.title).toBe('Lead Software Architect');
    expect(stored?.type).toBe('job');
    expect(stored?.budget).toBe(350000);
    expect(stored?.author).toBe('octocat');

    await runtime.store.close();
  });

  it('performs the GitHub OAuth round trip and binds the session to a user', async () => {
    const runtime = makeRuntime(
      { GITHUB_CLIENT_ID: 'client-id', GITHUB_CLIENT_SECRET: 'client-secret' },
      (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === 'https://github.com/login/oauth/access_token') {
          return new Response(JSON.stringify({ access_token: 'gho-token' }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        if (url === 'https://api.github.com/user') {
          return new Response(JSON.stringify({ id: 583231, login: 'octocat' }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        return new Response('unexpected fetch', { status: 404 });
      }) as typeof fetch,
    );
    const app = createApp(runtime);

    // 1. /auth/github redirects to GitHub with client_id and a state cookie
    const start = await app.request('/auth/github');
    expect(start.status).toBe(302);
    const location = start.headers.get('location') ?? '';
    expect(location).toContain('https://github.com/login/oauth/authorize');
    expect(location).toContain('client_id=client-id');
    const state = new URL(location).searchParams.get('state') ?? '';
    expect(state).toBeTruthy();
    const setCookie = start.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain(`radar_oauth_state=${state}`);
    expect(setCookie).toContain('HttpOnly');

    // 2. Callback with the matching state exchanges the code and creates a session
    const callback = await app.request(`/auth/github/callback?code=abc&state=${state}`, {
      headers: { cookie: `radar_oauth_state=${state}` },
    });
    expect(callback.status).toBe(302);
    expect(callback.headers.get('location')).toBe('/');
    const cookies = callback.headers.getSetCookie();
    const sessionCookie = cookies.find((cookie) => cookie.startsWith('radar_session=')) ?? '';
    expect(sessionCookie).toBeTruthy();
    const sessionId = sessionCookie.split('=')[1]?.split(';')[0] ?? '';

    const user = await runtime.store.getUserBySession?.(sessionId);
    expect(user?.handle).toBe('octocat');
    expect(user?.githubId).toBe(583231);

    // 3. A user session is not an admin session
    expect(await runtime.store.validateSession?.(sessionId)).toBe(false);

    await runtime.store.close();
  });

  it('rejects the OAuth callback on state mismatch and when OAuth is not configured', async () => {
    const configured = makeRuntime({ GITHUB_CLIENT_ID: 'id', GITHUB_CLIENT_SECRET: 'secret' });
    const app = createApp(configured);
    const badState = await app.request('/auth/github/callback?code=abc&state=evil', {
      headers: { cookie: 'radar_oauth_state=good' },
    });
    expect(badState.status).toBe(302);
    expect(badState.headers.get('location')).toContain('/login?error=');
    await configured.store.close();

    const unconfigured = makeRuntime();
    const app2 = createApp(unconfigured);
    const start = await app2.request('/auth/github');
    expect(start.status).toBe(302);
    expect(start.headers.get('location')).toContain('/login?error=');
    await unconfigured.store.close();
  });

  it('supports English and Russian language switching via /lang and cookies', async () => {
    const runtime = makeRuntime({ RADAR_PUBLIC_READ: true });
    const app = createApp(runtime);

    // 1. Language switch route sets openradar_lang cookie
    const langRes = await app.request('/lang/en');
    expect(langRes.status).toBe(302);
    const setCookie = langRes.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain('openradar_lang=en');

    // 2. Visiting with lang=en renders English UI strings
    const enPage = await app.request('/?lang=en');
    expect(enPage.status).toBe(200);
    const enHtml = await enPage.text();
    expect(enHtml).toContain('lang="en"');
    expect(enHtml).toContain('Leads');
    expect(enHtml).toContain('Sources');
    expect(enHtml).toContain('Submit by URL');

    // 3. Visiting with cookie openradar_lang=ru renders Russian UI strings
    const ruPage = await app.request('/', {
      headers: { cookie: 'openradar_lang=ru' },
    });
    expect(ruPage.status).toBe(200);
    const ruHtml = await ruPage.text();
    expect(ruHtml).toContain('lang="ru"');
    expect(ruHtml).toContain('Заказы');
    expect(ruHtml).toContain('Источники');
    expect(ruHtml).toContain('Добавить по ссылке');

    // 4. Auto-detects English from browser Accept-Language header when no cookie is set
    const autoEnPage = await app.request('/', {
      headers: { 'accept-language': 'en-US,en;q=0.9,ru;q=0.8' },
    });
    expect(autoEnPage.status).toBe(200);
    const autoEnHtml = await autoEnPage.text();
    expect(autoEnHtml).toContain('lang="en"');
    expect(autoEnHtml).toContain('href="/lang/ru"');
    expect(autoEnHtml).toContain('href="/lang/en"');

    // 5. Auto-detects Russian from browser Accept-Language header
    const autoRuPage = await app.request('/', {
      headers: { 'accept-language': 'ru-RU,ru;q=0.9,en-US;q=0.8' },
    });
    expect(autoRuPage.status).toBe(200);
    const autoRuHtml = await autoRuPage.text();
    expect(autoRuHtml).toContain('lang="ru"');

    await runtime.store.close();
  });

  it('handles unauthenticated community votes with auth modal and reject redirect', async () => {
    const runtime = makeRuntime({ RADAR_PUBLIC_READ: true });
    const app = createApp(runtime);

    const source = await runtime.store.createSource({
      kind: 'rss',
      title: 'Feed',
      config: { url: 'https://example.com/rss' },
    });
    const lead = {
      id: 'lead-unauth-test',
      sourceId: source.id,
      title: 'Test Web Lead',
      text: 'Need frontend developer with TypeScript skills',
      url: 'https://example.com/job/123',
      fingerprint: 'fp-unauth-test',
      titleKey: 'test web lead',
      status: 'new' as const,
      score: 85,
      type: 'gig' as const,
      reasons: ['title:dev'],
      createdAt: new Date().toISOString(),
    };
    await runtime.store.insertLead(lead);

    // 1. Viewing lead page without auth renders modal trigger and dialog
    const leadRes = await app.request(`/leads/${lead.id}`);
    expect(leadRes.status).toBe(200);
    const html = await leadRes.text();
    expect(html).toContain('auth-vote-dialog');
    expect(html).toContain('openAuthVoteModal()');
    expect(html).toContain('Открыть оригинал ↗');
    expect(html).toContain('Копировать текст');
    expect(html).toContain('class="actions lead-actions"');

    // 2. Attempting to vote without auth returns login_required
    const voteApiRes = await app.request(`/leads/${lead.id}/vote`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'http://localhost',
        host: 'localhost',
      },
      body: JSON.stringify({ signal: 'useful' }),
    });
    expect(voteApiRes.status).toBe(401);

    await runtime.store.close();
  });

  it('renders extension guide page, download endpoint, ping, and footer link', async () => {
    const runtime = makeRuntime({ RADAR_PUBLIC_READ: true });
    const app = createApp(runtime);

    // 1. Ping endpoint
    const pingRes = await app.request('/api/ping');
    expect(pingRes.status).toBe(200);
    const pingJson = await pingRes.json();
    expect(pingJson.ok).toBe(true);

    // 2. Extension guide page is accessible and contains instructions & download link
    const extRes = await app.request('/extension');
    expect(extRes.status).toBe(200);
    const html = await extRes.text();
    expect(html).toContain('Расширение для браузера');
    expect(html).toContain('/extension/download');
    expect(html).toContain('chrome://extensions/');

    // 3. Footer on main page contains extension link
    const indexRes = await app.request('/');
    expect(indexRes.status).toBe(200);
    const indexHtml = await indexRes.text();
    expect(indexHtml).toContain('href="/extension"');

    // 4. Download endpoint returns application/zip
    const downloadRes = await app.request('/extension/download');
    expect(downloadRes.status).toBe(200);
    expect(downloadRes.headers.get('content-type')).toContain('application/zip');

    await runtime.store.close();
  });
});
