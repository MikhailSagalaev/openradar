import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { createApp } from '../src/server/app.ts';
import type { Runtime } from '../src/runtime.ts';
import type { Env } from '../src/core/types.ts';
import { loadEnv } from '../src/config.ts';
import { makeTestRuntime, makeUserSession } from './helpers.ts';

// Every runtime opens its own store (a PostgreSQL pool in CI): close them all after
// each test, or the database runs out of connections.
const openRuntimes: Runtime[] = [];
afterEach(async () => {
  for (const runtime of openRuntimes.splice(0)) await runtime.store.close().catch(() => undefined);
});

function makeRuntime(overrides: Partial<Env> = {}, fetchImpl: typeof fetch = fetch): Runtime {
  const base = makeTestRuntime({ RADAR_ADMIN_TOKEN: 'secret', ...overrides });
  const runtime: Runtime = {
    env: base.env,
    logger: base.logger,
    store: base.store,
    sources: base.sources,
    sinks: base.sinks,
    fetchImpl,
    access: base.access,
  };
  openRuntimes.push(runtime);
  return runtime;
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
      // The example value once shipped in docker-compose.yml is public: refuse it.
      expect(() =>
        loadEnv({ NODE_ENV: 'production', RADAR_ADMIN_TOKEN: '012345678901234567890123456789012' }),
      ).toThrow(/published example value/);
      expect(() => loadEnv({ NODE_ENV: 'production', RADAR_ADMIN_TOKEN: 'a'.repeat(40) })).toThrow();
      expect(() =>
        loadEnv({ NODE_ENV: 'production', RADAR_ADMIN_TOKEN: '9f2c4e1a7b3d5f6e8a0c2b4d6f8e1a3c5b7d9f0e2a4c6b8d' }),
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
    const body = (await response.json()) as { ok: boolean; enabledSources: number; last24h: number };
    expect(body).toMatchObject({ ok: true, enabledSources: 0, last24h: 0 });
    await runtime.store.close();
  });

  it('limits a client looping over the public feed', async () => {
    const runtime = makeRuntime();
    const app = createApp(runtime);
    const get = (path: string, ip: string) => app.request(path, { headers: { 'x-forwarded-for': ip } });
    let last = 0;
    for (let i = 0; i < 121; i++) last = (await get('/api/leads', '203.0.113.9')).status;
    expect(last).toBe(429);
    expect((await get('/api/leads', '203.0.113.10')).status).not.toBe(429);
    await runtime.store.close();
  });

  it('tells the extension which version the server hands out', async () => {
    const runtime = makeRuntime();
    const app = createApp(runtime);
    const response = await app.request('/api/ext/version');
    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
    const manifest = JSON.parse(fs.readFileSync('extension/manifest.json', 'utf8')) as { version: string };
    const body = (await response.json()) as { version: string; url: string };
    expect(body.version).toBe(manifest.version);
    expect(body.url).toMatch(/\/extension$/);
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

  it('polls preset sources right after loading them', async () => {
    const requested: string[] = [];
    const fetchImpl = (async (input: RequestInfo | URL) => {
      requested.push(String(input));
      return new Response('', { status: 503 });
    }) as typeof fetch;
    const runtime = makeRuntime({}, fetchImpl);
    const sessionId = await makeAdminSession(runtime);
    const app = createApp(runtime);

    const response = await app.request('/sources/presets', {
      method: 'POST',
      headers: { cookie: `radar_session=${sessionId}`, origin: 'http://localhost' },
    });
    expect(response.status).toBe(302);
    const sources = await runtime.store.listSources();
    expect(sources.length).toBeGreaterThan(0);

    await expect.poll(async () => (await runtime.store.listRuns(50)).length).toBe(sources.length);
    expect(requested.length).toBeGreaterThan(0);
  });

  it('serves the stylesheet from a cacheable hashed path instead of inlining it', async () => {
    const runtime = makeRuntime({ RADAR_PUBLIC_READ: true });
    const app = createApp(runtime);

    const html = await (await app.request('/')).text();
    const href = html.match(/<link rel="stylesheet" href="(\/assets\/app\.[0-9a-f]{10}\.css)">/)?.[1];
    expect(href).toBeDefined();
    expect(html).not.toContain('<style>:root');

    const css = await app.request(href!);
    expect(css.status).toBe(200);
    expect(css.headers.get('content-type')).toContain('text/css');
    expect(css.headers.get('cache-control')).toContain('immutable');

    // The traced logo is referenced as a cached mask, not inlined three times per page.
    expect(html).not.toContain('<path d="M23.4 0');
    const logo = html.match(/url\((\/assets\/logo\.[0-9a-f]{10}\.svg)\)/)?.[1];
    expect(logo).toBeDefined();
    const svg = await app.request(logo!);
    expect(svg.headers.get('content-type')).toContain('image/svg+xml');
    expect(svg.headers.get('cache-control')).toContain('immutable');
  });

  it('does not loop between / and /login when sign-in is not configured', async () => {
    const runtime = makeRuntime({ RADAR_ADMIN_TOKEN: undefined, RADAR_PUBLIC_READ: false });
    const app = createApp(runtime);

    expect((await app.request('/')).headers.get('location')).toBe('/login');
    const login = await app.request('/login');
    expect(login.status).toBe(503);
  });

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

  it('creates a Telegram account source and refuses foreign secret variables', async () => {
    const runtime = makeRuntime();
    const sessionId = await makeAdminSession(runtime);
    const app = createApp(runtime);
    const post = (fields: Record<string, string>) =>
      app.request('/sources', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: `radar_session=${sessionId}`, origin: 'http://localhost' },
        body: formBody({ kind: 'telegram-account', title: 'Мои чаты', ...fields }),
      });

    const refused = await post({ chats: '@freelance_jobs', sessionEnv: 'DATABASE_URL' });
    expect(refused.status).toBe(400);
    expect(await refused.text()).toContain('RADAR_TELEGRAM_SESSION');
    expect((await post({ chats: 'not a chat!' })).status).toBe(400);

    const created = await post({ chats: '@freelance_jobs, -1001234567890, https://t.me/remote_work' });
    expect(created.status).toBe(302);
    const [source] = await runtime.store.listSources();
    expect(source?.config.chats).toEqual(['@freelance_jobs', '-1001234567890', 'https://t.me/remote_work']);
    expect(source?.config.sessionEnv).toBe('RADAR_TELEGRAM_SESSION');
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
    expect(await leads.text()).toContain('openradar');

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

  it('filters and sorts the feed by budget, skill, remote work and score', async () => {
    const runtime = makeRuntime({ RADAR_PUBLIC_READ: true, RADAR_ADMIN_TOKEN: 'secret' });
    const app = createApp(runtime);
    const source = await runtime.store.createSource({ kind: 'rss', title: 'Feed' });
    const base = Date.now() - 3600_000;
    const leads = [
      { id: 'cheap', title: 'Поправить вёрстку', city: 'Онлайн', usd: 20, skills: ['WordPress'], score: 50 },
      { id: 'rich', title: 'Интернет-магазин', city: 'Москва', usd: 1600, skills: ['Python', 'React'], score: 85 },
      { id: 'mid', title: 'Бот для Telegram', city: undefined, usd: 220, skills: ['python'], score: 70 },
    ];
    for (const [i, l] of leads.entries()) {
      await runtime.store.insertLead({
        id: l.id, sourceId: source.id, externalId: l.id, title: l.title, titleKey: l.id, text: `${l.title}, подробности`,
        fingerprint: `fp-${l.id}`, status: 'new', score: l.score, reasons: [], city: l.city, skills: l.skills,
        normalizedUsdMin: l.usd, normalizedUsdMax: l.usd, createdAt: new Date(base + i * 60_000).toISOString(),
      });
    }
    const ids = async (path: string): Promise<string[]> =>
      ((await (await app.request(path, { headers: { authorization: 'Bearer secret' } })).json()) as Array<{ id: string }>).map((l) => l.id);

    expect(await ids('/api/leads')).toEqual(['mid', 'rich', 'cheap']);
    expect(await ids('/api/leads?sort=score')).toEqual(['rich', 'mid', 'cheap']);
    expect(await ids('/api/leads?sort=budget')).toEqual(['rich', 'mid', 'cheap']);
    // 20 000 ₽ is about 217 USD at the reference rate.
    expect(await ids('/api/leads?budget=20000')).toEqual(['mid', 'rich']);
    expect(await ids('/api/leads?skill=Python')).toEqual(['mid', 'rich']);
    expect(await ids('/api/leads?remote=1')).toEqual(['mid', 'cheap']);

    const page = await (await app.request('/?sort=score&remote=1', { headers: { authorization: 'Bearer secret' } })).text();
    expect(page).toContain('<option value="score" selected>');
    expect(page).toContain('name="remote" value="1" checked');
    expect(page).toContain('href="/?type=gig&amp;sort=score&amp;remote=1"');
  });

  it('pages the feed, filters by language and shows similar leads and the profile', async () => {
    const runtime = makeRuntime({ RADAR_PUBLIC_READ: true, RADAR_ADMIN_TOKEN: 'secret', RADAR_PUBLIC_URL: 'https://hub.example' });
    const app = createApp(runtime);
    const source = await runtime.store.createSource({ kind: 'rss', title: 'Feed' });
    const base = Date.now() - 3600_000;
    for (let i = 0; i < 52; i += 1) {
      const english = i % 2 === 0;
      await runtime.store.insertLead({
        id: `l${i}`, sourceId: source.id, externalId: `l${i}`, titleKey: `l${i}`, fingerprint: `fp-${i}`,
        title: english ? `Python developer ${i}` : `Бот на Python ${i}`, text: 'Подробности задачи', skills: ['Python'],
        status: 'new', score: 60, reasons: [], createdAt: new Date(base + i * 1000).toISOString(),
      });
    }
    const auth = { headers: { authorization: 'Bearer secret' } };

    const first = await (await app.request('/', auth)).text();
    expect(first).toContain('href="/?page=2"');
    const second = await (await app.request('/?page=2', auth)).text();
    expect(second).toContain('/leads/l0"');
    expect(second).not.toContain('href="/?page=3"');

    const english = (await (await app.request('/api/leads?language=en&limit=100', auth)).json()) as Array<{ title: string }>;
    expect(english).toHaveLength(26);
    expect(english.every((l) => !/[А-Яа-я]/.test(l.title))).toBe(true);

    const lead = await (await app.request('/leads/l10', auth)).text();
    expect(lead).toContain('class="similar"');
    expect(lead).toContain('<meta property="og:image" content="https://hub.example/og.png">');
    expect(lead).toContain('<meta property="og:url" content="https://hub.example/leads/l10">');
    expect(lead).toContain('<link rel="canonical" href="https://hub.example/leads/l10">');

    expect((await app.request('/me')).headers.get('location')).toBe('/login?returnTo=/me');
    const me = await (await app.request('/me', auth)).text();
    expect(me).toContain('Администратор');
  });

  it('serves a market estimate over leads a guest may already see', async () => {
    const runtime = makeRuntime({ RADAR_PUBLIC_READ: true, RADAR_MODE: 'hub' });
    const app = createApp(runtime);
    const source = await runtime.store.createSource({ kind: 'rss', title: 'Feed' });
    const old = Date.now() - 24 * 3600_000;
    for (const [i, usd] of [30, 40, 50, 60, 70].entries()) {
      await runtime.store.insertLead({
        id: `m${i}`, sourceId: source.id, externalId: `m${i}`, titleKey: `m${i}`, fingerprint: `fpm${i}`,
        title: `Дизайн логотипа ${i}`, text: 'Логотип', status: 'new', score: 60, reasons: [],
        normalizedUsdMin: usd, normalizedUsdMax: usd, createdAt: new Date(old + i * 1000).toISOString(),
      });
    }
    // A fresh, very expensive lead is still under the guest delay and must not move the estimate.
    await runtime.store.insertLead({
      id: 'fresh', sourceId: source.id, externalId: 'fresh', titleKey: 'fresh', fingerprint: 'fp-fresh',
      title: 'Дизайн логотипа срочно', text: 'Логотип', status: 'new', score: 60, reasons: [],
      normalizedUsdMin: 9000, normalizedUsdMax: 9000, createdAt: new Date().toISOString(),
    });

    const res = await app.request('/api/market?title=' + encodeURIComponent('Логотип для бренда') + '&type=gig');
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    const body = (await res.json()) as { basis: string; count: number; usd: { median: number } };
    expect(body).toMatchObject({ basis: 'similar', count: 5, usd: { median: 50 } });
    expect((await app.request('/api/market?title=a')).status).toBe(400);
  });

  it('renders the lead card with icon actions, bare votes and formatted text', async () => {
    const runtime = makeRuntime({ RADAR_PUBLIC_READ: true });
    const app = createApp(runtime);
    const source = await runtime.store.createSource({ kind: 'rss', title: 'Хабр Карьера — Вакансии', config: { url: 'https://career.habr.com/vacancies/rss' } });
    await runtime.store.insertLead({
      id: 'card', sourceId: source.id, externalId: 'card', titleKey: 'card', fingerprint: 'fp-card',
      title: 'Аналитик DWH', text: 'Компания ищет аналитика. Требуемые навыки: #DWH, #SQL.',
      status: 'new', score: 60, reasons: [], createdAt: new Date(Date.now() - 86_400_000).toISOString(),
    });
    const html = await (await app.request('/leads/card')).text();
    expect(html).toContain('id="share-lead"');
    expect(html).not.toContain('class="icon-btn-label"');
    expect(html).not.toContain('Сообщество:');
    expect(html).toContain('<div class="lead-tags"><span class="tag">DWH</span><span class="tag">SQL</span></div>');

    const sources = await (await app.request('/sources')).text();
    expect(sources).toContain('Откуда заказы');
    expect(sources).toContain('<span class="source-scope">Вакансии</span>');
    expect(sources).toContain('career.habr.com ↗');

    const partial = await (await app.request('/?q=' + encodeURIComponent('аналитик кондитер'))).text();
    expect(partial).toContain('Точных совпадений нет');
    expect(partial).toContain('/leads/card"');
  });

  it('adds analytics and console verification only when configured', async () => {
    const plain = createApp(makeRuntime({ RADAR_PUBLIC_READ: true }));
    const plainRes = await plain.request('/', { headers: { accept: 'text/html' } });
    const plainCsp = plainRes.headers.get('content-security-policy') ?? '';
    expect(plainCsp).toContain("frame-ancestors 'none'");
    expect(plainCsp).not.toContain('yandex');
    expect(plainRes.headers.get('x-frame-options')).toBe('DENY');
    expect(await plainRes.text()).not.toContain('mc.yandex.ru');

    const app = createApp(makeRuntime({
      RADAR_PUBLIC_READ: true,
      RADAR_YANDEX_METRIKA_ID: '113821053',
      RADAR_GA_ID: 'G-3LWJ6YD6TP',
      RADAR_GOOGLE_SITE_VERIFICATION: '5Bbwcz78I5nEcaz3ILjY8D4lFyO8qB9ZQ68OuKlahOc',
      RADAR_YANDEX_VERIFICATION: '3fb8622ca1035d2f',
    }));
    const res = await app.request('/', { headers: { accept: 'text/html' } });
    const html = await res.text();
    expect(html).toContain('<meta name="google-site-verification" content="5Bbwcz78I5nEcaz3ILjY8D4lFyO8qB9ZQ68OuKlahOc">');
    expect(html).toContain("ym(113821053,'init'");
    expect(html).toContain('https://www.googletagmanager.com/gtag/js?id=G-3LWJ6YD6TP');
    const csp = res.headers.get('content-security-policy') ?? '';
    expect(csp).toContain("script-src 'self' 'unsafe-inline' https://mc.yandex.ru https://yastatic.net https://www.googletagmanager.com");
    expect(csp).toContain('frame-ancestors https://webvisor.com');
    expect(res.headers.get('x-frame-options')).toBeNull();

    const verify = await app.request('/yandex_3fb8622ca1035d2f.html');
    expect(verify.status).toBe(200);
    expect(await verify.text()).toContain('Verification: 3fb8622ca1035d2f');
  });

  it('shows /admin to the token admin and to listed GitHub accounts only', async () => {
    const plain = makeRuntime({ RADAR_PUBLIC_READ: true });
    const plainApp = createApp(plain);
    expect((await plainApp.request('/admin')).headers.get('location')).toBe('/login?returnTo=/admin');
    const memberSession = await makeUserSession(plain, 'octocat');
    expect((await plainApp.request('/admin', { headers: { cookie: `radar_session=${memberSession}` } })).status).toBe(302);

    const source = await plain.store.createSource({ kind: 'rss', title: 'Feed' });
    await plain.store.insertLead({
      id: 'a1', sourceId: source.id, externalId: 'a1', titleKey: 'a1', fingerprint: 'fp-a1', title: 'Логотип', text: 'Логотип',
      type: 'gig', status: 'new', score: 60, reasons: [], createdAt: new Date().toISOString(),
    });
    const tokenPage = await (await plainApp.request('/admin', { headers: { authorization: 'Bearer secret' } })).text();
    expect(tokenPage).toContain('Админка');
    expect(tokenPage).toContain('class="admin-chart"');
    expect(tokenPage).toContain('<td><a href="/sources/');

    // makeUserSession creates GitHub id 583231.
    const byId = makeRuntime({ RADAR_PUBLIC_READ: true, RADAR_ADMIN_GITHUB: '583231' });
    const session = await makeUserSession(byId, 'octocat');
    const page = await createApp(byId).request('/admin', { headers: { cookie: `radar_session=${session}` } });
    expect(page.status).toBe(200);
    expect(await (await createApp(byId).request('/', { headers: { cookie: `radar_session=${session}` } })).text()).toContain('href="/admin"');

    const byLogin = makeRuntime({ RADAR_PUBLIC_READ: true, RADAR_ADMIN_GITHUB: 'someone-else, OctoCat' });
    const loginSession = await makeUserSession(byLogin, 'octocat');
    expect((await createApp(byLogin).request('/admin', { headers: { cookie: `radar_session=${loginSession}` } })).status).toBe(200);
  });

  it('shows the signed-in account on research and catalog pages, in both languages', async () => {
    const runtime = makeRuntime({ RADAR_PUBLIC_READ: true });
    const app = createApp(runtime);
    const cookie = { cookie: `radar_session=${await makeUserSession(runtime, 'octocat')}` };
    for (const path of ['/research', '/research/index', '/research/methodology', '/about', '/faq', '/catalog', '/en/research', '/en/research/index', '/en/research/methodology']) {
      const response = await app.request(path, { headers: cookie });
      expect(response.status, path).toBe(200);
      expect(await response.text(), path).toContain('@octocat');
    }
    const en = await (await app.request('/en/research')).text();
    expect(en).toContain('<html lang="en">');
    expect(en).toContain('hreflang="ru"');
    expect(await (await app.request('/research')).text()).toContain('hreflang="en"');
  });

  it('connects the browser extension through GitHub sign-in and a consent page', async () => {
    const runtime = makeRuntime({ RADAR_PUBLIC_READ: true, GITHUB_CLIENT_ID: 'id', GITHUB_CLIENT_SECRET: 'secret', RADAR_PUBLIC_URL: 'https://hub.example' });
    const app = createApp(runtime);
    const redirect = 'https://abcdefghijklmnopabcdefghijklmnop.chromiumapp.org/';
    const connect = `/extension/connect?redirect_uri=${encodeURIComponent(redirect)}`;

    expect((await app.request('/extension/connect?redirect_uri=https://evil.example/')).status).toBe(400);
    expect((await app.request('/extension/connect?redirect_uri=chrome-extension://abcdefghijklmnopabcdefghijklmnop/popup.html')).status).toBe(400);
    const tabFlow = `/extension/connect?redirect_uri=${encodeURIComponent('chrome-extension://abcdefghijklmnopabcdefghijklmnop/connected.html')}`;
    expect((await app.request(tabFlow)).status).toBe(302);
    const anonymous = await app.request(connect);
    expect(anonymous.headers.get('location')).toBe(`/auth/github?returnTo=${encodeURIComponent(connect)}`);

    const session = await makeUserSession(runtime, 'octocat');
    const cookie = { cookie: `radar_session=${session}` };
    const consent = await (await app.request(connect, { headers: cookie })).text();
    expect(consent).toContain('@octocat');
    expect(consent).toContain(`name="redirect_uri" value="${redirect}"`);

    const evil = await app.request('/extension/connect', {
      method: 'POST',
      headers: { ...cookie, origin: 'http://localhost', 'content-type': 'application/x-www-form-urlencoded' },
      body: formBody({ redirect_uri: 'https://evil.example/' }),
    });
    expect(evil.status).toBe(400);

    const granted = await app.request('/extension/connect', {
      method: 'POST',
      headers: { ...cookie, origin: 'http://localhost', 'content-type': 'application/x-www-form-urlencoded' },
      body: formBody({ redirect_uri: redirect }),
    });
    const location = granted.headers.get('location') ?? '';
    expect(location.startsWith(`${redirect}#`)).toBe(true);
    const fragment = new URLSearchParams(location.split('#')[1]);
    const token = fragment.get('token') ?? '';
    expect(token).toMatch(/^ext_[0-9a-f]{64}$/);
    expect(fragment.get('handle')).toBe('octocat');
    expect(fragment.get('base')).toBe('https://hub.example');

    const bearer = { authorization: `Bearer ${token}` };
    const preflight = await app.request('/api/ext/submit', { method: 'OPTIONS' });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('access-control-allow-headers')).toContain('authorization');
    expect(await (await app.request('/api/ext/me', { headers: bearer })).json()).toEqual({ handle: 'octocat' });

    const submitted = await app.request('/api/ext/submit', {
      method: 'POST',
      headers: { ...bearer, 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'gig', title: 'Логотип для кофейни', text: 'Нужен логотип и брендбук, бюджет 20 000 ₽', url: 'https://example.com/order/1', author: 'Someone else' }),
    });
    const result = (await submitted.json()) as { ok: boolean; leadId: string };
    expect(result.ok).toBe(true);
    expect((await runtime.store.getLead(result.leadId))?.author).toBe('octocat');

    const extensionPage = await (await app.request('/extension')).text();
    expect(extensionPage).toMatch(/Актуальная версия: <strong>\d+\.\d+\.\d+<\/strong>/);

    await app.request('/api/ext/token', { method: 'DELETE', headers: bearer });
    expect((await app.request('/api/ext/me', { headers: bearer })).status).toBe(401);
    expect((await app.request('/api/ext/me', { headers: { authorization: 'Bearer ext_forged' } })).status).toBe(401);
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

    // 4. Repeating the same signal cancels / toggles the vote
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
    const repeatResult = (await repeatVote.json()) as { votes_up: number; myVote: string | null };
    expect(repeatResult.votes_up).toBe(0);
    expect(repeatResult.myVote).toBeNull();

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

    // 4. Repeating the same vote from the same user toggles/cancels the vote
    await app.request(`/leads/${lead.id}/vote`, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        cookie: `radar_session=${userSession}`,
        origin: 'http://localhost',
      },
      body: formBody({ signal: 'useful' }),
    });
    expect((await runtime.store.getLead(lead.id))?.votes_up).toBe(5);

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

  describe('public view for readers who are not the operator', () => {
    async function seed(runtime: Runtime) {
      const source = await runtime.store.createSource({ kind: 'rss', title: 'Feed' });
      const base = { sourceId: source.id, reasons: [], score: 70, createdAt: '2026-10-23T14:00:00Z' };
      await runtime.store.insertLead({
        ...base, id: 'lead-ok', title: 'Python bot', text: 'Telegram bot in Python', fingerprint: 'fp-ok', titleKey: 'python-bot', status: 'delivered',
      });
      await runtime.store.insertLead({
        ...base, id: 'lead-rejected', title: 'Write a review', text: 'Leave a five star review', fingerprint: 'fp-rej', titleKey: 'write-review', status: 'rejected',
      });
      return source;
    }

    it('hides pipeline statuses and rejected leads from guests, keeps them for the admin', async () => {
      const runtime = makeRuntime({ RADAR_PUBLIC_READ: true });
      await seed(runtime);
      const app = createApp(runtime);

      const guest = await (await app.request('/')).text();
      expect(guest).toContain('Python bot');
      expect(guest).not.toContain('Write a review');
      expect(guest).not.toContain('status=delivered');
      expect(guest).not.toContain('доставлен');
      expect(guest).toContain('id="feed-intro"');
      expect(guest).toContain('Скор от 0 до 100');

      for (const path of ['/api/leads', '/v2/feed', '/feed.rss', '/api/delta?since=2000-01-01T00:00:00Z']) {
        const body = await (await app.request(path)).text();
        expect(body, path).toContain('Python bot');
        expect(body, path).not.toContain('Write a review');
      }
      expect((await app.request('/leads/lead-rejected')).status).toBe(404);

      const sessionId = await makeAdminSession(runtime);
      const admin = await (await app.request('/', { headers: { cookie: `radar_session=${sessionId}` } })).text();
      expect(admin).toContain('Write a review');
      expect(admin).toContain('status=rejected');
      expect(admin).not.toContain('id="feed-intro"');
      expect((await app.request('/leads/lead-rejected', { headers: { cookie: `radar_session=${sessionId}` } })).status).toBe(200);

      await runtime.store.close();
    });

    it('shows readers source states without raw errors or disabled sources', async () => {
      const runtime = makeRuntime({ RADAR_PUBLIC_READ: true });
      const source = await seed(runtime);
      await runtime.store.createSource({ kind: 'rss', title: 'Old feed', enabled: false });
      await runtime.store.recordRun({
        id: 'run-1', sourceId: source.id, startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(),
        found: 0, inserted: 0, duplicates: 0, rejected: 0, delivered: 0, error: 'fetch failed',
      });
      const app = createApp(runtime);

      const page = await (await app.request('/sources')).text();
      expect(page).toContain('временно недоступен');
      expect(page).not.toContain('fetch failed');
      expect(page).not.toContain('Сбой сети');
      expect(page).not.toContain('Old feed');
      expect(page).not.toContain('найдено / новых / доставлено');

      await runtime.store.close();
    });
  });

  it('answers unknown pages with an HTML 404 and unknown API paths with JSON', async () => {
    const app = createApp(makeRuntime({ RADAR_PUBLIC_READ: true }));

    const page = await app.request('/no-such-page', { headers: { accept: 'text/html' } });
    expect(page.status).toBe(404);
    expect(page.headers.get('content-type')).toContain('text/html');
    expect(await page.text()).toContain('Страница не найдена');

    const api = await app.request('/api/no-such-endpoint', { headers: { accept: 'text/html' } });
    expect(api.status).toBe(404);
    expect(await api.json()).toEqual({ error: 'not_found' });
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
    expect(html).toContain('chrome://extensions');
    expect(html).toContain('Войдите через GitHub');

    // Guests of a public hub do not see the operator's webhook sources.
    const hook = await runtime.store.createSource({ kind: 'webhook', title: 'Browser hook', config: { token: 'secret-token' } });
    const guestHtml = await (await app.request('/extension')).text();
    expect(guestHtml).not.toContain(hook.id);
    const adminHtml = await (await app.request('/extension', { headers: { authorization: 'Bearer secret' } })).text();
    expect(adminHtml).toContain(hook.id);

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

  it('preserves returnTo context during GitHub OAuth login', async () => {
    const runtime = makeRuntime({
      GITHUB_CLIENT_ID: 'test-client-id',
      GITHUB_CLIENT_SECRET: 'test-client-secret',
    });
    const app = createApp(runtime);

    // 1. GET /login with returnTo renders GitHub link with returnTo
    const loginPageRes = await app.request('/login?returnTo=/leads/lead-42');
    expect(loginPageRes.status).toBe(200);
    const loginHtml = await loginPageRes.text();
    expect(loginHtml).toContain('/auth/github?returnTo=%2Fleads%2Flead-42');

    // 2. GET /auth/github with valid returnTo sets cookie and redirects to GitHub
    const authRes = await app.request('/auth/github?returnTo=/leads/lead-42');
    expect(authRes.status).toBe(302);
    const location = authRes.headers.get('location') || '';
    expect(location).toContain('https://github.com/login/oauth/authorize');
    const setCookie = authRes.headers.get('set-cookie') || '';
    expect(setCookie).toContain('radar_oauth_return_to=%2Fleads%2Flead-42');

    // 3. Reject open redirects: //evil.com or http://evil.com should not be saved as returnTo
    const evilRes = await app.request('/auth/github?returnTo=https://evil.com');
    const evilCookie = evilRes.headers.get('set-cookie') || '';
    expect(evilCookie).not.toContain('radar_oauth_return_to');

    await runtime.store.close();
  });

  it('serves the custom vector logo and renders it in web layouts', async () => {
    const runtime = makeRuntime({ RADAR_PUBLIC_READ: true });
    const app = createApp(runtime);

    // 1. GET /logo.svg endpoint returns vector asset
    const logoRes = await app.request('/logo.svg');
    expect(logoRes.status).toBe(200);
    expect(logoRes.headers.get('content-type')).toContain('image/svg+xml');
    const svgText = await logoRes.text();
    expect(svgText).toContain('viewBox="0 0 794 140"');
    expect(svgText).toContain('fill-rule="evenodd"');

    // 1b. GET /favicon.svg endpoint returns favicon asset
    const faviconRes = await app.request('/favicon.svg');
    expect(faviconRes.status).toBe(200);
    expect(faviconRes.headers.get('content-type')).toContain('image/svg+xml');
    const faviconSvg = await faviconRes.text();
    expect(faviconSvg).toContain('viewBox="0 0 138 140"');

    // 2. Main layout renders the custom logo SVG in the header and favicon link
    const indexRes = await app.request('/');
    expect(indexRes.status).toBe(200);
    const indexHtml = await indexRes.text();
    expect(indexHtml).toContain('class="brand-logo-svg"');
    expect(indexHtml).toContain('rel="icon" href="/favicon.svg"');

    // 3. Login page renders the custom logo
    const loginRes = await app.request('/login');
    expect(loginRes.status).toBe(200);
    const loginHtml = await loginRes.text();
    expect(loginHtml).toContain('class="brand-logo-svg"');

    await runtime.store.close();
  });
});
