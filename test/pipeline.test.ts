import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { Classifier, Lead, SinkAdapter } from '../src/core/types.ts';
import { ingestRawLead, type IngestDeps } from '../src/pipeline/ingest.ts';
import { processOutbox } from '../src/pipeline/outbox.ts';
import { webhookSink } from '../src/sinks/webhook.ts';
import { makeTestRuntime, MemorySink, TEST_NOW } from './helpers.ts';

describe('ingest pipeline', () => {
  it('creates and delivers a relevant lead', async () => {
    const runtime = makeTestRuntime();
    const sink = new MemorySink();
    runtime.sinks.register(sink);
    const source = await runtime.store.createSource({
      kind: 'rss',
      title: 'Feed',
      config: { includeKeywords: ['сантехник'] },
    });

    const outcome = await ingestRawLead(
      {
        sourceId: source.id,
        url: 'https://example.com/1?utm_source=rss',
        title: 'Нужен сантехник',
        text: 'Прорвало трубу, Ставрополь, бюджет 5000 ₽',
      },
      source,
      {
        store: runtime.store,
        sinks: runtime.sinks,
        logger: runtime.logger,
        env: runtime.env,
        now: () => TEST_NOW,
      },
    );

    expect(outcome.status).toBe('delivered');
    expect(sink.leads).toHaveLength(1);
    expect((await runtime.store.getStats()).deliveredLeads).toBe(1);
    await runtime.store.close();
  });

  it('deduplicates the same lead twice', async () => {
    const runtime = makeTestRuntime();
    const sink = new MemorySink();
    runtime.sinks.register(sink);
    const source = await runtime.store.createSource({
      kind: 'rss',
      title: 'Feed',
      config: { includeKeywords: ['сантехник'] },
    });
    const baseDeps: IngestDeps = {
      store: runtime.store,
      sinks: runtime.sinks,
      logger: runtime.logger,
      env: runtime.env,
      now: () => TEST_NOW,
    };
    const raw = {
      sourceId: source.id,
      url: 'https://example.com/1',
      title: 'Нужен сантехник',
      text: 'Прорвало трубу, Ставрополь, бюджет 5000 ₽',
    };

    expect((await ingestRawLead(raw, source, baseDeps)).status).toBe('delivered');
    expect((await ingestRawLead(raw, source, baseDeps)).status).toBe('duplicate');
    expect(sink.leads).toHaveLength(1);
    await runtime.store.close();
  });

  it('deduplicates the same title from a different URL', async () => {
    const runtime = makeTestRuntime();
    const sink = new MemorySink();
    runtime.sinks.register(sink);
    const source = await runtime.store.createSource({
      kind: 'rss',
      title: 'Feed',
      config: { includeKeywords: ['сантехник'] },
    });
    const baseDeps: IngestDeps = {
      store: runtime.store,
      sinks: runtime.sinks,
      logger: runtime.logger,
      env: runtime.env,
      now: () => TEST_NOW,
    };

    await ingestRawLead(
      {
        sourceId: source.id,
        url: 'https://example.com/1',
        title: 'Нужен сантехник',
        text: 'Прорвало трубу, Ставрополь, бюджет 5000 ₽',
      },
      source,
      baseDeps,
    );
    const second = await ingestRawLead(
      {
        sourceId: source.id,
        url: 'https://other.example.com/2',
        title: 'Нужен сантехник',
        text: 'Прорвало трубу, Ставрополь, бюджет 5000 ₽',
      },
      source,
      baseDeps,
    );

    expect(second.status).toBe('duplicate');
    expect(sink.leads).toHaveLength(1);
    await runtime.store.close();
  });

  it('rejects spam and never delivers it', async () => {
    const runtime = makeTestRuntime();
    const sink = new MemorySink();
    runtime.sinks.register(sink);
    const source = await runtime.store.createSource({ kind: 'rss', title: 'Feed' });

    const outcome = await ingestRawLead(
      {
        sourceId: source.id,
        title: 'Накрутка отзывов',
        text: 'Нужна накрутка отзывов на Авито, напишем 5 звезд за деньги',
      },
      source,
      {
        store: runtime.store,
        sinks: runtime.sinks,
        logger: runtime.logger,
        env: runtime.env,
        now: () => TEST_NOW,
      },
    );

    expect(outcome.status).toBe('rejected');
    expect(outcome.reasons).toContain('spam:FAKE_REVIEWS');
    expect(sink.leads).toHaveLength(0);
    await runtime.store.close();
  });

  it('rejects a lead when the classifier says it is not an order', async () => {
    const runtime = makeTestRuntime();
    const sink = new MemorySink();
    runtime.sinks.register(sink);
    const source = await runtime.store.createSource({ kind: 'rss', title: 'Feed' });
    const classifier: Classifier = {
      async classify() {
        return { isLead: false, confidence: 0.9 };
      },
    };

    const outcome = await ingestRawLead(
      {
        sourceId: source.id,
        title: 'Нужен сантехник',
        text: 'Прорвало трубу, Ставрополь, бюджет 5000 ₽',
      },
      source,
      {
        store: runtime.store,
        sinks: runtime.sinks,
        classifier,
        logger: runtime.logger,
        env: runtime.env,
        now: () => TEST_NOW,
      },
    );

    expect(outcome.status).toBe('rejected');
    expect(sink.leads).toHaveLength(0);
    await runtime.store.close();
  });

  it('continues with rules when the classifier is unavailable', async () => {
    const runtime = makeTestRuntime();
    const sink = new MemorySink();
    runtime.sinks.register(sink);
    const source = await runtime.store.createSource({ kind: 'rss', title: 'Feed' });
    const classifier: Classifier = {
      async classify() {
        throw new Error('offline');
      },
    };

    const outcome = await ingestRawLead(
      {
        sourceId: source.id,
        title: 'Нужен сантехник',
        text: 'Прорвало трубу, Ставрополь, бюджет 5000 ₽',
      },
      source,
      {
        store: runtime.store,
        sinks: runtime.sinks,
        classifier,
        logger: runtime.logger,
        env: runtime.env,
        now: () => TEST_NOW,
      },
    );

    expect(outcome.status).toBe('delivered');
    expect(sink.leads).toHaveLength(1);
    await runtime.store.close();
  });

  it('signs outgoing webhooks with x-radar-timestamp and HMAC-SHA256 signature', async () => {
    let capturedHeaders: Record<string, string> = {};
    let capturedBody = '';

    const mockFetch = async (_url: string | URL | Request, init?: RequestInit): Promise<Response> => {
      capturedHeaders = (init?.headers as Record<string, string>) || {};
      capturedBody = String(init?.body || '');
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    };

    const runtime = makeTestRuntime({
      WEBHOOK_URL: 'https://example.com/webhook',
      WEBHOOK_SECRET: 'my-super-secret-key-123',
    });

    const lead: Lead = {
      id: 'lead-test-1',
      sourceId: 'src-1',
      title: 'Тестовый заказ',
      text: 'Описание заказа',
      fingerprint: 'fp-1',
      titleKey: 'тестовый заказ',
      status: 'new',
      score: 80,
      reasons: [],
      createdAt: new Date().toISOString(),
    };

    await webhookSink.deliver(lead, {
      env: runtime.env,
      logger: runtime.logger,
      fetchImpl: mockFetch as any,
    });

    expect(capturedHeaders['x-radar-timestamp']).toBeDefined();
    expect(capturedHeaders['x-radar-signature']).toBeDefined();

    const timestamp = capturedHeaders['x-radar-timestamp'];
    const expectedSignature = createHmac('sha256', 'my-super-secret-key-123')
      .update(`${timestamp}.${capturedBody}`)
      .digest('hex');

    expect(capturedHeaders['x-radar-signature']).toBe(expectedSignature);
    await runtime.store.close();
  });

  it('outbox worker retries only failed sinks (telegram fails, webhook succeeds -> repeat only to telegram)', async () => {
    const runtime = makeTestRuntime();
    let webhookCalls = 0;
    let telegramCalls = 0;
    let telegramShouldFail = true;

    const webhookMock: SinkAdapter = {
      kind: 'webhook',
      async deliver() {
        webhookCalls++;
      },
    };

    const telegramMock: SinkAdapter = {
      kind: 'telegram',
      async deliver() {
        telegramCalls++;
        if (telegramShouldFail) {
          throw new Error('Telegram network error');
        }
      },
    };

    runtime.sinks.register(webhookMock);
    runtime.sinks.register(telegramMock);

    const source = await runtime.store.createSource({ kind: 'rss', title: 'Feed' });

    // 1. Ingest lead: webhook succeeds, telegram fails
    const outcome = await ingestRawLead(
      {
        sourceId: source.id,
        title: 'Заказ на сайт',
        text: 'Нужно сделать лендинг срочно',
      },
      source,
      {
        store: runtime.store,
        sinks: runtime.sinks,
        logger: runtime.logger,
        env: runtime.env,
        now: () => TEST_NOW,
      },
    );

    expect(outcome.status).toBe('failed');
    expect(webhookCalls).toBe(1);
    expect(telegramCalls).toBe(1);

    const deliveriesAfterIngest = await runtime.store.getLeadDeliveries?.(outcome.lead!.id);
    expect(deliveriesAfterIngest).toBeDefined();
    const webhookDelivery = deliveriesAfterIngest!.find((d) => d.sink === 'webhook');
    const telegramDelivery = deliveriesAfterIngest!.find((d) => d.sink === 'telegram');

    expect(webhookDelivery?.status).toBe('sent');
    expect(telegramDelivery?.status).toBe('failed');

    // 2. Telegram connection is restored
    telegramShouldFail = false;

    // Reset nextAttemptAt to now so outbox picks it up immediately
    await runtime.store.updateLeadDelivery?.(
      outcome.lead!.id,
      'telegram',
      'failed',
      'network error',
      new Date(Date.now() - 1000).toISOString(),
    );

    // 3. Run outbox processor
    const outboxSummary = await processOutbox({
      store: runtime.store,
      sinks: runtime.sinks,
      env: runtime.env,
      logger: runtime.logger,
    });

    expect(outboxSummary.processed).toBe(1);
    expect(outboxSummary.succeeded).toBe(1);

    // Webhook should NOT receive a duplicate
    expect(webhookCalls).toBe(1);
    // Telegram received the retry
    expect(telegramCalls).toBe(2);

    // Lead is now fully delivered
    const updatedLead = await runtime.store.getLead(outcome.lead!.id);
    expect(updatedLead?.status).toBe('delivered');

    await runtime.store.close();
  });

  it('limits parallel source polling concurrency with pLimit', async () => {
    const { pLimit, pollAll } = await import('../src/pipeline/poll.ts');

    // Test pLimit concurrency
    const limit = pLimit(2);
    let running = 0;
    let maxRunning = 0;

    const task = async () => {
      running++;
      maxRunning = Math.max(maxRunning, running);
      await new Promise((resolve) => setTimeout(resolve, 20));
      running--;
    };

    await Promise.all([limit(task), limit(task), limit(task), limit(task), limit(task)]);
    expect(maxRunning).toBe(2);

    // Test pollAll with concurrency
    const runtime = makeTestRuntime();
    for (let i = 1; i <= 4; i++) {
      await runtime.store.createSource({
        kind: 'rss',
        title: `Feed ${i}`,
        config: { url: `https://example.com/feed-${i}.xml` },
      });
    }

    const summaries = await pollAll({
      store: runtime.store,
      sinks: runtime.sinks,
      logger: runtime.logger,
      env: runtime.env,
      sources: runtime.sources,
      fetchImpl: async () =>
        new Response(
          '<rss version="2.0"><channel><title>T</title><link>https://example.com</link><description>D</description><item><title>Order</title><link>https://example.com/1</link><description>Desc</description></item></channel></rss>',
          { status: 200 },
        ),
    });

    expect(summaries).toHaveLength(4);
    expect(summaries.every((s) => s.found === 1)).toBe(true);
    await runtime.store.close();
  });
});
