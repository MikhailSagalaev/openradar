import { describe, expect, it } from 'vitest';
import { createApp } from '../src/server/app.ts';
import { makeTestRuntime, makeUserSession } from './helpers.ts';

const form = (session: string) => ({
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: `radar_session=${session}`, origin: 'http://localhost' },
  body: '',
});
const mcp = (token: string | undefined, method: string, params: Record<string, unknown> = {}) => ({
  method: 'POST',
  headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
  body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
});

describe('agent token and save_search', () => {
  it('issues a token once, lets an agent save a search as the user, and revokes it', async () => {
    const runtime = makeTestRuntime({ RADAR_ADMIN_TOKEN: 'secret', RADAR_PUBLIC_READ: true });
    const app = createApp(runtime);
    const session = await makeUserSession(runtime);

    const issued = await (await app.request('/me/agent-token', form(session))).text();
    const token = /mcp_[0-9a-f]{64}/.exec(issued)?.[0];
    expect(token).toBeDefined();
    expect(issued).toContain('больше он показан не будет');
    // The profile afterwards says a token exists but never shows it again.
    const profile = await (await app.request('/me', { headers: { cookie: `radar_session=${session}` } })).text();
    expect(profile).not.toContain(token!);
    expect(profile).toContain('Выпустить новый');

    const tools = (await (await app.request('/mcp', mcp(undefined, 'tools/list'))).json()) as { result: { tools: Array<{ name: string }> } };
    expect(tools.result.tools.map((t) => t.name)).toContain('save_search');

    const anonymous = (await (await app.request('/mcp', mcp(undefined, 'tools/call', { name: 'save_search', arguments: { skill: 'Python' } }))).json()) as { error: { message: string } };
    expect(anonymous.error.message).toContain('personal token');

    const saved = (await (await app.request('/mcp', mcp(token, 'tools/call', { name: 'save_search', arguments: { skill: 'Python', remote: true, market: 'ru' } }))).json()) as { result: { content: Array<{ text: string }> } };
    const result = JSON.parse(saved.result.content[0]!.text);
    expect(result).toMatchObject({ name: 'Python · удалённо · на русском', created: true, telegramLinked: false });
    expect(result.note).toContain('Подключить Telegram');

    const again = (await (await app.request('/mcp', mcp(token, 'tools/call', { name: 'save_search', arguments: { skill: 'Python', remote: true, market: 'ru' } }))).json()) as { result: { content: Array<{ text: string }> } };
    expect(JSON.parse(again.result.content[0]!.text).created).toBe(false);

    const listed = (await (await app.request('/mcp', mcp(token, 'tools/call', { name: 'list_saved_searches', arguments: {} }))).json()) as { result: { content: Array<{ text: string }> } };
    expect(JSON.parse(listed.result.content[0]!.text).searches).toHaveLength(1);

    await app.request('/me/agent-token/delete', form(session));
    expect((await app.request('/mcp', mcp(token, 'tools/list'))).status).toBe(401);
    await runtime.store.close();
  });

  it('refuses an empty search and a made-up token', async () => {
    const runtime = makeTestRuntime({ RADAR_ADMIN_TOKEN: 'secret', RADAR_PUBLIC_READ: true });
    const app = createApp(runtime);
    const session = await makeUserSession(runtime);
    const token = /mcp_[0-9a-f]{64}/.exec(await (await app.request('/me/agent-token', form(session))).text())![0];
    const empty = (await (await app.request('/mcp', mcp(token, 'tools/call', { name: 'save_search', arguments: {} }))).json()) as { error: { message: string } };
    expect(empty.error.message).toContain('at least one filter');
    expect((await app.request('/mcp', mcp(`mcp_${'0'.repeat(64)}`, 'tools/list'))).status).toBe(401);
    await runtime.store.close();
  });
});
