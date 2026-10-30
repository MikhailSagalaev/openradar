import { afterEach, describe, expect, it } from 'vitest';
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
    for (const path of ['/api/leads', '/api/market', '/api/delta', '/v2/feed', '/v2/stream', '/mcp', '/health']) {
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
});
