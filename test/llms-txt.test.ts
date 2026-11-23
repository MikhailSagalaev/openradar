import { describe, expect, it } from 'vitest';
import { createApp } from '../src/server/app.ts';
import { renderLlmsTxt } from '../src/server/seo.ts';
import { makeTestRuntime } from './helpers.ts';

describe('/llms.txt', () => {
  it('answers text/plain and carries the agent quickstart in both languages', async () => {
    const runtime = makeTestRuntime({ RADAR_PUBLIC_READ: true });
    const app = createApp(runtime);
    const res = await app.request('/llms.txt');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/plain');
    const ru = await res.text();
    expect(ru).toContain('## Быстрый старт для агента');
    expect(ru).toContain('/api/delta');
    expect(ru).toContain('Cache-Control');
    expect(ru).toContain('задержкой 12 часов');
    const en = await (await app.request('/en/llms.txt')).text();
    expect(en).toContain('## Agent quickstart');
    expect(en).toContain('12-hour delay');
    expect(en).toContain('/api/market?title=backend+developer');
    expect(en).not.toContain('undefined');
    await runtime.store.close();
  });

  it('builds absolute links from the request base url', () => {
    const text = renderLlmsTxt('https://example.com');
    expect(text).toContain('https://example.com/api/leads');
    expect(text).not.toContain('https://example.com/undefined');
  });
});
