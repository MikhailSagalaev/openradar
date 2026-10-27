import { describe, expect, it } from 'vitest';
import { createApp } from '../src/server/app.ts';
import type { Lead } from '../src/core/types.ts';
import { makeTestRuntime, makeUserSession, type TestRuntime } from './helpers.ts';

const nowMs = Date.now();
const iso = (offsetHours: number) => new Date(nowMs + offsetHours * 3600 * 1000).toISOString();

function makeLead(sourceId: string, overrides: Partial<Lead> = {}): Lead {
  const id = overrides.id ?? 'lead-1';
  return {
    id,
    sourceId,
    externalId: `external-${id}`,
    url: `https://example.com/${id}`,
    canonicalUrl: `https://example.com/${id}`,
    title: 'Нужен сантехник в Ставрополе',
    text: 'Прорвало трубу, бюджет 5000 ₽. Пишите @plumber_boss или +7 999 123-45-67',
    author: '@plumber_boss',
    city: 'Ставрополь',
    budget: 5000,
    publishedAt: iso(-1),
    fingerprint: `fingerprint-${id}`,
    titleKey: `нужен сантехник ${id}`,
    status: 'new',
    score: 75,
    reasons: ['scored'],
    createdAt: iso(-1),
    metadata: { internal: 'note' },
    contacts: [{ type: 'telegram', value: '@plumber_boss' }, { type: 'phone', value: '+79991234567' }],
    ...overrides,
  };
}

/** Hub runtime: guest 12h, member 3h. Leads: fresh (1h), mid (5h), old (13h), hidden (13h). */
async function seedHub(): Promise<TestRuntime> {
  const runtime = makeTestRuntime({ RADAR_ADMIN_TOKEN: 'secret', RADAR_PUBLIC_READ: 'true', RADAR_MODE: 'hub' } as never);
  const source = await runtime.store.createSource({ kind: 'webhook', title: 'Hook', config: {} });
  const leads = [
    makeLead(source.id, { id: 'fresh-lead', createdAt: iso(-1) }),
    makeLead(source.id, { id: 'mid-lead', createdAt: iso(-5) }),
    makeLead(source.id, { id: 'old-lead', createdAt: iso(-13) }),
    makeLead(source.id, { id: 'hidden-lead', createdAt: iso(-13), state: 'hidden_scam' }),
  ];
  for (const lead of leads) expect(await runtime.store.insertLead(lead)).toBe(true);
  return runtime;
}

async function ids(res: Response): Promise<string[]> {
  expect(res.status).toBe(200);
  return ((await res.json()) as { id: string }[]).map((l) => l.id).sort();
}

describe('radar/2 access tiers (hub mode)', () => {
  it('delays the feed by tier: guest 12h, member 3h, admin none; hidden leads only for admin', async () => {
    const runtime = await seedHub();
    const app = createApp(runtime);
    const session = await makeUserSession(runtime);

    expect(await ids(await app.request('/api/leads'))).toEqual(['old-lead']);
    expect(await ids(await app.request('/api/leads', { headers: { cookie: `radar_session=${session}` } })))
      .toEqual(['mid-lead', 'old-lead']);
    expect(await ids(await app.request('/api/leads', { headers: { authorization: 'Bearer secret' } })))
      .toEqual(['fresh-lead', 'hidden-lead', 'mid-lead', 'old-lead']);
  });

  it('never shows contacts to guests: API, lead page, RSS and the main page', async () => {
    const runtime = await seedHub();
    const app = createApp(runtime);

    const api = (await (await app.request('/api/leads')).json()) as Array<Record<string, unknown>>;
    expect(api).toHaveLength(1);
    expect(JSON.stringify(api)).not.toContain('plumber_boss');
    expect(JSON.stringify(api)).not.toContain('999');

    const page = await (await app.request('/leads/old-lead')).text();
    expect(page).not.toContain('plumber_boss');
    expect(page).not.toContain('123-45-67');
    expect(page).toContain('[контакт скрыт]');

    const rss = await (await app.request('/feed.rss')).text();
    expect(rss).not.toContain('plumber_boss');

    const main = await (await app.request('/')).text();
    expect(main).not.toContain('plumber_boss');
    expect(main).toContain('задержкой');
  });

  it('shows contacts to signed-in members', async () => {
    const runtime = await seedHub();
    const app = createApp(runtime);
    const session = await makeUserSession(runtime);
    const page = await (await app.request('/leads/old-lead', { headers: { cookie: `radar_session=${session}` } })).text();
    expect(page).toContain('plumber_boss');
  });

  it('returns 404 for a lead still inside the viewer delay or hidden', async () => {
    const runtime = await seedHub();
    const app = createApp(runtime);
    expect((await app.request('/leads/fresh-lead')).status).toBe(404);
    expect((await app.request('/leads/hidden-lead')).status).toBe(404);
    expect((await app.request('/leads/hidden-lead', { headers: { authorization: 'Bearer secret' } })).status).toBe(200);
  });

  it('applies the same delay and contact rules to MCP', async () => {
    const runtime = await seedHub();
    const app = createApp(runtime);
    const call = async (name: string, args: Record<string, unknown>) => {
      const res = await app.request('/mcp', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }),
      });
      return (await res.json()) as { result?: { content: Array<{ text: string }> }; error?: { code: number } };
    };
    const search = await call('search_leads', { query: 'сантехник' });
    const text = search.result?.content[0]?.text ?? '';
    expect(text).toContain('old-lead');
    expect(text).not.toContain('fresh-lead');
    expect((await call('get_lead_details', { id: 'fresh-lead' })).error?.code).toBe(-32602);
    const details = (await call('get_lead_details', { id: 'old-lead' })).result?.content[0]?.text ?? '';
    expect(details).not.toContain('plumber_boss');
  });

  it('a self-hosted node (default mode) has no delays', async () => {
    const runtime = makeTestRuntime({ RADAR_PUBLIC_READ: 'true' } as never);
    const source = await runtime.store.createSource({ kind: 'webhook', title: 'Hook', config: {} });
    await runtime.store.insertLead(makeLead(source.id, { id: 'fresh-lead', createdAt: iso(-0.1) }));
    const app = createApp(runtime);
    expect(await ids(await app.request('/api/leads'))).toEqual(['fresh-lead']);
  });

  it('guest projection keeps the public marketplace fields only', async () => {
    const runtime = await seedHub();
    const app = createApp(runtime);
    const guestLeads = (await (await app.request('/api/leads')).json()) as Record<string, unknown>[];
    for (const lead of guestLeads) {
      for (const key of ['fingerprint', 'titleKey', 'status', 'externalId', 'sourceId', 'metadata', 'reasons', 'score']) {
        expect(lead).not.toHaveProperty(key);
      }
      expect(lead).toHaveProperty('title');
    }
  });
});

describe('source config hardening', () => {
  it('masks every non-public config key for guests, including proxyUrl', async () => {
    const runtime = makeTestRuntime({ RADAR_ADMIN_TOKEN: 'secret', RADAR_PUBLIC_READ: 'true' } as never);
    await runtime.store.createSource({
      kind: 'rss',
      title: 'Feed',
      config: {
        url: 'https://example.com/rss',
        proxyUrl: 'http://proxy.local:8080',
        token: 'super-secret',
      },
    });
    const app = createApp(runtime);

    const res = await app.request('/api/sources');
    expect(res.status).toBe(200);
    const sources = (await res.json()) as { config: Record<string, string> }[];
    const config = sources[0]!.config;
    expect(config.url).toBe('https://example.com/rss');
    expect(config.proxyUrl).toBe('***');
    expect(config.token).toBe('***');
  });

  it('rejects proxyUrl with a non-http scheme or embedded credentials', async () => {
    const runtime = makeTestRuntime({ RADAR_ADMIN_TOKEN: 'secret', RADAR_PUBLIC_READ: 'true' } as never);
    const app = createApp(runtime);
    const headers = { authorization: 'Bearer secret', 'content-type': 'application/json' };

    for (const proxyUrl of ['socks5://127.0.0.1:1080', 'http://user:pass@proxy.local:8080', 'not a url']) {
      const res = await app.request('/api/sources', {
        method: 'POST',
        headers,
        body: JSON.stringify({ kind: 'rss', title: 'X', config: { url: 'https://example.com/rss', proxyUrl } }),
      });
      expect(res.status).toBe(400);
    }

    const ok = await app.request('/api/sources', {
      method: 'POST',
      headers,
      body: JSON.stringify({ kind: 'rss', title: 'X', config: { url: 'https://example.com/rss', proxyUrl: 'http://proxy.local:8080' } }),
    });
    expect(ok.status).toBe(201);
  });

  it('a masked round-trip does not overwrite the real secret on PATCH', async () => {
    const runtime = makeTestRuntime({ RADAR_ADMIN_TOKEN: 'secret', RADAR_PUBLIC_READ: 'true' } as never);
    const app = createApp(runtime);
    const headers = { authorization: 'Bearer secret', 'content-type': 'application/json' };

    const created = await app.request('/api/sources', {
      method: 'POST',
      headers,
      body: JSON.stringify({ kind: 'rss', title: 'X', config: { url: 'https://example.com/rss', token: 'real-secret' } }),
    });
    const source = (await created.json()) as { id: string };

    const patched = await app.request(`/api/sources/${source.id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ config: { url: 'https://example.com/rss', token: '***' } }),
    });
    expect(patched.status).toBe(200);

    const stored = await runtime.store.getSource(source.id);
    expect(stored?.config.token).toBe('real-secret');
  });
});
