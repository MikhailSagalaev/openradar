import { describe, expect, it } from 'vitest';
import { createApp } from '../src/server/app.ts';
import type { Runtime } from '../src/runtime.ts';
import type { Lead } from '../src/core/types.ts';
import { makeTestRuntime } from './helpers.ts';
import { handleMcpRequest } from '../src/mcp/server.ts';
import { MemoryStore } from '../src/store/memory.ts';

const nowMs = Date.now();
const iso = (offsetHours: number) => new Date(nowMs + offsetHours * 3600 * 1000).toISOString();

function makeLead(overrides: Partial<Lead> = {}): Lead {
  const id = overrides.id ?? 'lead-1';
  return {
    id,
    sourceId: 'source-1',
    externalId: `external-${id}`,
    url: `https://example.com/${id}`,
    canonicalUrl: `https://example.com/${id}`,
    title: 'Нужен сантехник в Ставрополе',
    text: 'Прорвало трубу, бюджет 5000 ₽',
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
    ...overrides,
  };
}

async function seedLeads(runtime: Runtime): Promise<void> {
  // Public lead, a mesh-exclusive lead, a lead still inside the 12h lock window
  // and a lead whose unlock time has already passed. Timestamps are relative to
  // the real clock: the store filter compares against new Date().
  const leads = [
    makeLead({ id: 'public-lead' }),
    makeLead({ id: 'mesh-lead', is_mesh_exclusive: true }),
    makeLead({ id: 'locked-lead', unlocked_at: iso(6) }),
    makeLead({ id: 'unlocked-lead', unlocked_at: iso(-1) }),
  ];
  for (const lead of leads) expect(await runtime.store.insertLead(lead)).toBe(true);
}

function makeRuntime(overrides: Record<string, unknown> = {}): Runtime {
  const base = makeTestRuntime({ RADAR_ADMIN_TOKEN: 'secret', RADAR_PUBLIC_READ: 'true', ...overrides } as never);
  return {
    env: base.env,
    logger: base.logger,
    store: base.store,
    sources: base.sources,
    sinks: base.sinks,
    fetchImpl: fetch,
  };
}

describe('feed access hardening', () => {
  it('hides mesh-exclusive and still-locked leads from anonymous /api/leads', async () => {
    const runtime = makeRuntime();
    await seedLeads(runtime);
    const app = createApp(runtime);

    const res = await app.request('/api/leads');
    expect(res.status).toBe(200);
    const leads = (await res.json()) as { id: string }[];
    expect(leads.map((l) => l.id).sort()).toEqual(['public-lead', 'unlocked-lead']);
  });

  it('returns full lead objects to the admin, whitelisted projections to everyone else', async () => {
    const runtime = makeRuntime();
    await seedLeads(runtime);
    const app = createApp(runtime);

    const adminRes = await app.request('/api/leads', { headers: { authorization: 'Bearer secret' } });
    const adminLeads = (await adminRes.json()) as Record<string, unknown>[];
    expect(adminLeads).toHaveLength(4);
    expect(adminLeads[0]).toHaveProperty('fingerprint');

    const guestRes = await app.request('/api/leads');
    const guestLeads = (await guestRes.json()) as Record<string, unknown>[];
    for (const lead of guestLeads) {
      expect(lead).not.toHaveProperty('fingerprint');
      expect(lead).not.toHaveProperty('titleKey');
      expect(lead).not.toHaveProperty('status');
      expect(lead).not.toHaveProperty('deliveredAt');
      expect(lead).not.toHaveProperty('externalId');
      expect(lead).not.toHaveProperty('sourceId');
      expect(lead).not.toHaveProperty('metadata');
      expect(lead).not.toHaveProperty('reasons');
      expect(lead).not.toHaveProperty('score');
      expect(lead).toHaveProperty('id');
      expect(lead).toHaveProperty('title');
      expect(lead).toHaveProperty('url');
    }
  });

  it('hides locked leads from the anonymous RSS feed and catalog pages', async () => {
    const runtime = makeRuntime();
    await seedLeads(runtime);
    const app = createApp(runtime);

    const rss = await app.request('/feed.rss');
    const xml = await rss.text();
    // Assert on full guids: the visible 'unlocked-lead' contains 'locked-lead' as a substring.
    expect(xml).toContain('<guid isPermaLink="false">public-lead</guid>');
    expect(xml).toContain('<guid isPermaLink="false">unlocked-lead</guid>');
    expect(xml).not.toContain('<guid isPermaLink="false">mesh-lead</guid>');
    expect(xml).not.toContain('<guid isPermaLink="false">locked-lead</guid>');

    const catalog = await app.request('/catalog/zakazy-na-razrabotku');
    const html = await catalog.text();
    expect(catalog.status).toBe(200);
    expect(html).not.toContain('>mesh-lead<');
    expect(html).not.toContain('>locked-lead<');
  });

  it('MCP search and details respect the viewer tier', async () => {
    const store = new MemoryStore();
    for (const lead of [
      makeLead({ id: 'public-lead' }),
      makeLead({ id: 'mesh-lead', is_mesh_exclusive: true }),
    ]) expect(await store.insertLead(lead)).toBe(true);

    const anonSearch = await handleMcpRequest(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'search_leads', arguments: { query: 'сантехник' } } },
      store,
      {},
    );
    const anonText = (anonSearch.result?.content?.[0]?.text as string) ?? '';
    expect(anonText).toContain('public-lead');
    expect(anonText).not.toContain('mesh-lead');

    const anonDetails = await handleMcpRequest(
      { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'get_lead_details', arguments: { id: 'mesh-lead' } } },
      store,
      {},
    );
    expect(anonDetails.error?.code).toBe(-32602);

    const adminDetails = await handleMcpRequest(
      { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'get_lead_details', arguments: { id: 'mesh-lead' } } },
      store,
      { isAdmin: true },
    );
    expect(adminDetails.result).toBeTruthy();
  });
});

describe('source config hardening', () => {
  it('masks every non-public config key for guests, including proxyUrl', async () => {
    const runtime = makeRuntime();
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
    const runtime = makeRuntime();
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
    const runtime = makeRuntime();
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

describe('x-ray CORS', () => {
  it('echoes only allowed origins, never wildcard', async () => {
    const runtime = makeRuntime();
    const app = createApp(runtime);
    const url = '/api/v1/xray?url=https://hh.ru/vacancy/1';

    const allowed = await app.request(url, { headers: { origin: 'https://openradar.fun' } });
    expect(allowed.headers.get('access-control-allow-origin')).toBe('https://openradar.fun');

    const extension = await app.request(url, { headers: { origin: 'chrome-extension://abcdef123' } });
    expect(extension.headers.get('access-control-allow-origin')).toBe('chrome-extension://abcdef123');

    const evil = await app.request(url, { headers: { origin: 'https://evil.example' } });
    expect(evil.headers.get('access-control-allow-origin')).toBeNull();
  });
});
