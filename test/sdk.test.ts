import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/server/app.ts';
import { HubClient, NodeClient } from '../src/client.ts';
import { verifyEvent } from '../src/net/protocol.ts';
import { makeTestRuntime } from './helpers.ts';

const ADMIN = 'admin-secret-token-0123456789abcdef';

function hubFetch(app: ReturnType<typeof createApp>): typeof fetch {
  return ((input: RequestInfo | URL, init?: RequestInit) => app.request(String(input), init)) as typeof fetch;
}

const python = spawnSync('python3', ['--version']).status === 0;

describe('TypeScript client', () => {
  it('observes, reads its rating and the feed through a hub', async () => {
    const runtime = makeTestRuntime({ RADAR_MODE: 'hub', RADAR_ADMIN_TOKEN: ADMIN, RADAR_TIER_DELAYS: 'guest=0' } as never);
    const app = createApp(runtime);
    const hub = new HubClient('http://localhost', undefined, hubFetch(app));
    const [result] = await hub.observe([{
      source: { platform: 'telegram', channel: '-100555', visibility: 'private', message_id: 3 },
      text: 'Ищем QA-инженера на автотесты Playwright, удалённо, 180 000 ₽. Пишите @qa_lead',
      raw: { stays: 'here' },
    }]);
    expect(result).toMatchObject({ status: 'accepted', merged: false });
    expect((await hub.signal(result!.leadId!, 'useful')).status).toBe('accepted');
    expect(await hub.me()).toMatchObject({ pubkey: hub.key.pubKey, tier: 'guest', rating: 0 });
    const feed = await hub.feed({ limit: 10 });
    expect(feed.leads.map((l: { id: string }) => l.id)).toEqual([result!.leadId]);
    expect(feed.leads[0].contacts).toEqual([]);
    const card = await hub.lead(result!.leadId!);
    expect(card.observations).toHaveLength(1);
  });

  it('pushes observations to a node with a source token', async () => {
    const runtime = makeTestRuntime({ RADAR_ADMIN_TOKEN: ADMIN } as never);
    const source = await runtime.store.createSource({ kind: 'webhook', title: 'Parser', config: { token: 'source-token-0123456789' } });
    const node = new NodeClient('http://localhost', source.id, 'source-token-0123456789', hubFetch(createApp(runtime)));
    const summary = await node.push([
      { source: { platform: 'vk', channel: 'club1', message_id: '10' }, text: 'Нужен монтажёр рилсов, 20 роликов в месяц, оплата 1 500 ₽ за ролик, vk.com/id1' },
      { source: { platform: 'vk', channel: 'club1' }, text: '' },
    ]);
    expect(summary).toMatchObject({ received: 2, rejected: 1 });
    expect(summary.accepted).toBe(1);
  });
});

describe.skipIf(!python)('Python SDK', () => {
  it('produces events and auth headers the hub accepts', async () => {
    const script = path.resolve('sdk/python/tests/test_sdk.py');
    const run = spawnSync('python3', [script, '--emit'], { encoding: 'utf8' });
    expect(run.status, run.stderr).toBe(0);
    const out = JSON.parse(run.stdout) as { pubkey: string; events: unknown[]; auth: string };
    for (const event of out.events) expect(verifyEvent(event).ok).toBe(true);

    const runtime = makeTestRuntime({ RADAR_MODE: 'hub', RADAR_ADMIN_TOKEN: ADMIN } as never);
    const app = createApp(runtime);
    const res = await app.request('/v2/events', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(out.events) });
    const results = ((await res.json()) as { results: Array<{ status: string }> }).results.map((r) => r.status);
    expect(results).toEqual(['accepted', 'rejected:unknown_lead']);
    const me = await app.request('/v2/me', { headers: { authorization: out.auth } });
    expect(await me.json()).toMatchObject({ pubkey: out.pubkey });
  });
});
