import { describe, expect, it } from 'vitest';
import { createApp } from '../src/server/app.ts';
import { renderSkillMd, renderSkillsIndex } from '../src/server/seo.ts';
import { makeTestRuntime } from './helpers.ts';

describe('agent skill discovery (/skill.md, /.well-known/skills/index.json)', () => {
  it('serves the skill with install commands and a cached machine-readable index', async () => {
    const runtime = makeTestRuntime({ RADAR_PUBLIC_READ: true });
    const app = createApp(runtime);

    const skill = await app.request('/skill.md');
    expect(skill.status).toBe(200);
    expect(skill.headers.get('content-type')).toContain('text/markdown');
    const text = await skill.text();
    expect(text).toContain('/plugin marketplace add MikhailSagalaev/openradar-plugin');
    expect(text).toContain('npx skills add MikhailSagalaev/openradar-plugin');
    expect(text).toContain('/mcp');
    expect(text).toContain('search-orders');

    const index = await app.request('/.well-known/skills/index.json');
    expect(index.status).toBe(200);
    expect(index.headers.get('cache-control')).toContain('max-age=3600');
    const manifest = (await index.json()) as { name: string; skills: Array<{ name: string }>; mcp: { url: string } };
    expect(manifest.name).toBe('openradar');
    expect(manifest.skills.map((s) => s.name)).toEqual(['search-orders', 'market-research', 'submit-lead']);
    expect(manifest.mcp.url).toContain('/mcp');
    await runtime.store.close();
  });

  it('llms.txt links to the skill pack in both languages', async () => {
    const runtime = makeTestRuntime({ RADAR_PUBLIC_READ: true });
    const app = createApp(runtime);
    const ru = await (await app.request('/llms.txt')).text();
    expect(ru).toContain('/skill.md');
    expect(ru).toContain('Пакет скиллов для агентов');
    const en = await (await app.request('/en/llms.txt')).text();
    expect(en).toContain('/skill.md');
    expect(en).toContain('Agent skill pack');
    await runtime.store.close();
  });

  it('builds absolute links from the request base url', () => {
    expect(renderSkillMd('https://example.com')).toContain('https://example.com/mcp');
    const manifest = renderSkillsIndex('https://example.com') as { url: string; api: { openapi: string } };
    expect(manifest.url).toBe('https://example.com/skill.md');
    expect(manifest.api.openapi).toBe('https://example.com/openapi.json');
  });
});
