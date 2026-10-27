import { describe, expect, it } from 'vitest';
import { createApp } from '../src/server/app.ts';
import { generateKeyPair } from '../src/net/keys.ts';
import { ingestRawLead } from '../src/pipeline/ingest.ts';
import { processOutbox } from '../src/pipeline/outbox.ts';
import { createSinkRegistry } from '../src/sinks/index.ts';
import { hubSink, leadToObservation } from '../src/sinks/hub.ts';
import { MemoryStore } from '../src/store/memory.ts';
import { createLogger } from '../src/core/logger.ts';
import { makeTestRuntime, testEnv } from './helpers.ts';

// Both sides use memory stores so the node and the hub never share a database.
function setup(env: Record<string, string> = {}) {
  const hubRuntime = { ...makeTestRuntime({ RADAR_MODE: 'hub', RADAR_ADMIN_TOKEN: 'admin-secret-token-0123456789abcdef' } as never), store: new MemoryStore() };
  const hubApp = createApp(hubRuntime);
  let up = true;
  const calls: string[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push(String(input));
    if (!up) return new Response('down', { status: 503 });
    return hubApp.request(String(input), init);
  }) as typeof fetch;
  const key = generateKeyPair();
  const nodeEnv = testEnv({ RADAR_HUB_URL: 'https://hub.example', RADAR_NODE_KEY: key.nsec, ...env } as never);
  const node = {
    store: new MemoryStore(),
    sinks: createSinkRegistry(nodeEnv),
    logger: createLogger('error'),
    env: nodeEnv,
    fetchImpl,
  };
  return { hubRuntime, node, key, calls, setUp: (v: boolean) => { up = v; } };
}

const POSTS: Record<string, [string, string]> = {
  '1': ['Senior Go developer', 'Ищем Go-разработчика в платёжную команду, Kubernetes, PostgreSQL, удалённо.'],
  '2': ['Дизайнер интерфейсов', 'Студии нужен продуктовый дизайнер мобильного банка, Figma, дизайн-система, офис в Казани.'],
  '3': ['Копирайтер для блога', 'Ищем автора статей о путешествиях, десять текстов в месяц, оплата за знак, свободный график.'],
};
const raw = (n: string) => ({
  sourceId: '',
  externalId: `post-${n}`,
  url: `https://jobs.example/vacancy/${n}`,
  title: POSTS[n]![0],
  text: `${POSTS[n]![1]} Пишите hr${n}@jobs.example`,
  type: 'job' as const,
  publishedAt: new Date().toISOString(),
});

describe('node -> hub sharing', () => {
  it('registers the hub sink only on a node with a hub URL and a key', () => {
    expect(createSinkRegistry(testEnv({ RADAR_HUB_URL: 'https://hub.example', RADAR_NODE_KEY: generateKeyPair().nsec } as never)).list().map((s) => s.kind)).toContain('hub');
    expect(createSinkRegistry(testEnv({ RADAR_HUB_URL: 'https://hub.example' } as never)).list().map((s) => s.kind)).not.toContain('hub');
    expect(createSinkRegistry(testEnv({ RADAR_MODE: 'hub', RADAR_HUB_URL: 'https://hub.example', RADAR_NODE_KEY: generateKeyPair().nsec } as never)).list()).toHaveLength(0);
  });

  it('sends leads of shared sources only, signed with the node key, and retries through the outbox', async () => {
    const { hubRuntime, node, key, calls, setUp } = setup();
    const shared = await node.store.createSource({ kind: 'webhook', title: 'Shared', config: { share: true } });
    const local = await node.store.createSource({ kind: 'webhook', title: 'Local' });

    const kept = await ingestRawLead({ ...raw('1'), sourceId: local.id }, local, node);
    expect(kept.status).toBe('inserted');
    expect(calls).toHaveLength(0);

    const sent = await ingestRawLead({ ...raw('2'), sourceId: shared.id }, shared, node);
    expect(sent.status).toBe('delivered');
    expect(calls).toEqual(['https://hub.example/v2/events']);
    const observations = await hubRuntime.store.listObservationsSince(new Date(0).toISOString());
    expect(observations).toHaveLength(1);
    expect(observations[0]!.pubkey).toBe(key.pubKey);
    const hubLead = await hubRuntime.store.getLead(observations[0]!.leadId);
    expect(hubLead?.contacts).toEqual([{ type: 'email', value: 'hr2@jobs.example' }]);

    setUp(false);
    const failed = await ingestRawLead({ ...raw('3'), sourceId: shared.id }, shared, node);
    expect(failed.status).toBe('failed');
    setUp(true);
    // the outbox retries once the next attempt is due
    expect((await node.store.getLeadDeliveries!(failed.lead!.id)).map((d) => [d.sink, d.status])).toEqual([['hub', 'failed']]);
    await node.store.updateLeadDelivery!(failed.lead!.id, 'hub', 'failed', 'down', new Date(0).toISOString());
    const summary = await processOutbox({ ...node }, 10);
    expect(summary).toMatchObject({ processed: 1, succeeded: 1 });
    expect(await hubRuntime.store.listObservationsSince(new Date(0).toISOString())).toHaveLength(2);
  });

  it('maps a lead back to an observation without metadata', () => {
    const observation = leadToObservation({
      id: 'l1', sourceId: 's1', title: 'Логотип', text: 'Нужен логотип', fingerprint: 'f'.repeat(64), titleKey: 'k',
      status: 'new', score: 50, reasons: [], createdAt: '2026-10-26T10:00:00.000Z', metadata: { secret: 'x' },
      sourceRef: { platform: 'telegram', channel: '-100', visibility: 'private', messageId: '9' },
      contacts: [{ type: 'telegram', value: '@a' }], budget: 15000, currency: 'RUB', paymentPeriod: 'fixed',
    } as never);
    expect(observation).toMatchObject({
      source: { platform: 'telegram', channel: '-100', visibility: 'private', message_id: '9' },
      author: { contacts: [{ type: 'telegram', value: '@a' }] },
      budget: { max: 15000, currency: 'RUB', period: 'fixed' },
    });
    expect(JSON.stringify(observation)).not.toContain('secret');
    expect(hubSink.accepts!({ state: 'hidden_scam' } as never, { config: { share: true } } as never)).toBe(false);
  });
});
