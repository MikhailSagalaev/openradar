import { afterEach, describe, expect, it } from 'vitest';
import { MCP_TOOLS } from '../src/mcp/server.ts';
import { createApp } from '../src/server/app.ts';
import { ingestRawLead } from '../src/pipeline/ingest.ts';
import type { Runtime } from '../src/runtime.ts';
import { makeSource, makeTestRuntime } from './helpers.ts';

const openRuntimes: Runtime[] = [];
afterEach(async () => {
  for (const runtime of openRuntimes.splice(0)) await runtime.store.close().catch(() => undefined);
});

function makeRuntime(): { app: ReturnType<typeof createApp>; runtime: Runtime } {
  const base = makeTestRuntime({ RADAR_PUBLIC_READ: true });
  const runtime: Runtime = { ...base };
  openRuntimes.push(runtime);
  return { app: createApp(runtime), runtime };
}

async function seedOneLead(runtime: Runtime): Promise<void> {
  const source = await runtime.store.createSource({ kind: 'webhook', title: 'Seed', config: {} });
  await ingestRawLead(
    {
      sourceId: source.id,
      type: 'gig',
      title: 'OpenAPI seed lead',
      text: 'Проверка соответствия схемы, бюджет 50000 рублей',
      currency: 'RUB',
      isRemote: true,
      externalId: 'openapi-test:1',
    },
    source,
    { store: runtime.store, sinks: runtime.sinks, logger: runtime.logger, env: runtime.env, fetchImpl: runtime.fetchImpl },
  );
}

describe('OpenAPI description of the public API', () => {
  it('serves a valid OpenAPI 3.1 document with the main paths', async () => {
    const { app } = makeRuntime();
    const res = await app.request('/openapi.json');
    expect(res.status).toBe(200);
    const spec = (await res.json()) as Record<string, any>;
    expect(spec.openapi).toBe('3.1.0');
    for (const path of ['/api/leads', '/api/market', '/api/insights', '/api/companies/suggest', '/api/delta', '/v2/feed', '/v2/stream', '/mcp', '/health']) {
      expect(spec.paths, `path ${path} missing`).toHaveProperty(path);
    }
    expect(spec.components.schemas.Lead.properties).toHaveProperty('title');
    expect(spec.components.schemas.Lead.properties).toHaveProperty('contacts');
  });

  it('exposes an RFC 9727 catalog pointing at the spec', async () => {
    const { app } = makeRuntime();
    const res = await app.request('/.well-known/api-catalog');
    expect(res.status).toBe(200);
    const catalog = (await res.json()) as any;
    expect(catalog.spec[0].url).toContain('/openapi.json');
  });

  it('gives MCP directories a server card', async () => {
    const { app } = makeRuntime();
    for (const path of ['/.well-known/mcp/server-card.json', '/.well-known/mcp.json', '/mcp/server-card']) {
      const res = await app.request(path);
      expect(res.status).toBe(200);
      const card = (await res.json()) as any;
      expect(card.transport.url).toMatch(/\/mcp$/);
      expect(card.tools.map((tool: { name: string }) => tool.name)).toContain('search_leads');
    }
  });

  it('every field of a live /api/leads lead is described by the Lead schema', async () => {
    const { app, runtime } = makeRuntime();
    await seedOneLead(runtime);

    const res = await app.request('/api/leads');
    expect(res.status).toBe(200);
    const leads = (await res.json()) as Array<Record<string, unknown>>;
    expect(leads.length).toBeGreaterThan(0);

    const spec = (await (await app.request('/openapi.json')).json()) as any;
    const schemaKeys = Object.keys(spec.components.schemas.Lead.properties);
    const undeclared = [...new Set(leads.flatMap((lead) => Object.keys(lead)))].filter((key) => !schemaKeys.includes(key));
    expect(undeclared, `fields not in the schema: ${undeclared.join(', ')}`).toEqual([]);
  });
  it('serves /api/insights and /api/companies/suggest over the guest projection', async () => {
    const { app, runtime } = makeRuntime();
    await seedOneLead(runtime);
    const insightsRes = await app.request('/api/insights?days=30');
    expect(insightsRes.status).toBe(200);
    const insights = (await insightsRes.json()) as Record<string, unknown>;
    expect(insights).toHaveProperty('trending_skills');
    expect(insights).toHaveProperty('workplace');
    expect(insights).toHaveProperty('salary_percentiles');
    expect(insights).toHaveProperty('ai_exposure');

    const suggestRes = await app.request('/api/companies/suggest?q=acme&limit=5');
    expect(suggestRes.status).toBe(200);
    expect(Array.isArray(await suggestRes.json())).toBe(true);
  });

  it('describes /mcp as POST-only, matching the live route', async () => {
    const { app } = makeRuntime();
    const spec = (await (await app.request('/openapi.json')).json()) as any;
    expect(spec.paths['/mcp']).toHaveProperty('post');
    expect(spec.paths['/mcp']).not.toHaveProperty('get');

    const getRes = await app.request('/mcp');
    expect(getRes.status).toBe(405);

    const postRes = await app.request('/mcp', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    });
    expect(postRes.status).toBe(200);
    const body = (await postRes.json()) as any;
    expect(Array.isArray(body.result.tools)).toBe(true);
  });

  it('lists exactly the real MCP tools in the spec description', async () => {
    const { app } = makeRuntime();
    const postRes = await app.request('/mcp', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    });
    const body = (await postRes.json()) as any;
    const liveNames = (body.result.tools as Array<{ name: string }>).map((tool) => tool.name).sort();
    expect(liveNames).toEqual(MCP_TOOLS.map((tool) => tool.name).sort());

    const spec = (await (await app.request('/openapi.json')).json()) as any;
    const description: string = spec.paths['/mcp'].post.description;
    for (const tool of MCP_TOOLS) {
      expect(description, `tool ${tool.name} missing from the /mcp description`).toContain(tool.name);
    }
  });
});
