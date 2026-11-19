import { describe, expect, it } from 'vitest';
import { createApp } from '../src/server/app.ts';
import { classifyUa, pathTemplate, usageDim } from '../src/server/usage.ts';
import { MemoryStore } from '../src/store/memory.ts';
import { makeTestRuntime } from './helpers.ts';

describe('agent analytics store', () => {
  it('accumulates counters per dimension cell and never stores a raw call', async () => {
    const store = new MemoryStore();
    const day = new Date().toISOString().slice(0, 10);
    const dim = usageDim({ surface: 'api', detail: '/api/leads', tier: 'guest', ua: 'claude-ai-agent/1.0', via: 'treg' });
    expect(dim.day).toBe(day);
    expect(dim.client).toBe('claude');
    await store.bumpApiUsage(dim);
    await store.bumpApiUsage(dim);
    await store.bumpApiUsage(dim, 5);
    const stats = await store.agentUsageStats(3);
    expect(stats.days.at(-1)?.api).toBe(7);
    expect(stats.details[0]).toMatchObject({ surface: 'api', detail: '/api/leads', calls: 7 });
    expect(stats.via[0]).toMatchObject({ via: 'treg', calls: 7 });
    expect(stats.clients[0]).toMatchObject({ client: 'claude', calls: 7 });
    await store.close();
  });

  it('keeps one token-day row per user and day', async () => {
    const store = new MemoryStore();
    await store.touchTokenDay(1);
    await store.touchTokenDay(1);
    await store.touchTokenDay(2, '2026-01-01');
    const stats = await store.agentUsageStats(3);
    expect(stats.days.at(-1)?.api).toBe(0);
    expect(stats.tokens.at(-1)?.active).toBe(1);
    await store.close();
  });
});

describe('agent analytics helpers', () => {
  it('classifies user agents into coarse families, never raw strings', () => {
    expect(classifyUa('claude-ai-agent/1.0 mcp')).toBe('claude');
    expect(classifyUa('Codex/1 host')).toBe('openai');
    expect(classifyUa('cursor/0.9')).toBe('cursor');
    expect(classifyUa('Mozilla/5.0 (Windows NT 10.0) Chrome/130')).toBe('browser');
    expect(classifyUa('Googlebot/2.1')).toBe('bot');
    expect(classifyUa('curl/8.7')).toBe('script');
    expect(classifyUa(undefined)).toBe('other');
  });

  it('collapses ids, numbers and emails so route templates stay bounded', () => {
    expect(pathTemplate('/api/leads/71e6a7ca-896b-4cd7-9b7f-de31467e22e0')).toBe('/api/leads/{id}');
    expect(pathTemplate('/api/leads?page=2')).toBe('/api/leads?page=2');
    expect(pathTemplate('/v2/contacts/hr@northwind.dev')).toBe('/v2/contacts/{id}');
  });
});

describe('agent analytics counting', () => {
  it('counts API and MCP calls through the app, with attribution', async () => {
    const runtime = makeTestRuntime({ RADAR_ADMIN_TOKEN: 'secret', RADAR_PUBLIC_READ: true });
    const app = createApp(runtime);

    const api = await app.request('/api/leads?limit=1&via=treg', { headers: { 'user-agent': 'claude-ai-agent/1.0' } });
    expect(api.status).toBe(200);
    const mcp = await app.request('/mcp', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'user-agent': 'codex/1.0' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    });
    expect(mcp.status).toBe(200);
    // A rejected call must not count.
    const denied = await app.request('/api/leads/00000000-0000-0000-0000-000000000000', { headers: { 'user-agent': 'curl/8' } });
    expect(denied.status).toBe(404);

    const stats = await runtime.store.agentUsageStats!(3);
    const today = stats.days.at(-1)!;
    expect(today.api).toBe(1);
    expect(today.mcp).toBe(1);
    expect(stats.details).toContainEqual({ surface: 'api', detail: '/api/leads', calls: 1 });
    expect(stats.details.some((d) => d.surface === 'mcp' && d.detail === 'tools/list')).toBe(true);
    expect(stats.via).toContainEqual({ via: 'treg', calls: 1 });
    expect(stats.clients.some((c) => c.client === 'claude')).toBe(true);
    await runtime.store.close();
  });
});

describe('/admin/analytics', () => {
  it('renders the counters for an admin and hides them from everyone else', async () => {
    const runtime = makeTestRuntime({ RADAR_ADMIN_TOKEN: 'secret', RADAR_PUBLIC_READ: true });
    const app = createApp(runtime);
    await app.request('/api/leads?limit=1&via=treg', { headers: { 'user-agent': 'claude-ai-agent/1.0' } });

    const anon = await app.request('/admin/analytics');
    expect(anon.status).toBe(302);

    const page = await (await app.request('/admin/analytics', { headers: { authorization: 'Bearer secret' } })).text();
    expect(page).toContain('Аналитика агентов');
    expect(page).toContain('/api/leads');
    expect(page).toContain('treg');
    await runtime.store.close();
  });
});
