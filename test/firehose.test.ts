import { describe, expect, it } from 'vitest';
import {
  broadcastToFirehose,
  matchesFirehoseFilter,
  type FirehoseFilter,
} from '../src/server/firehose.ts';
import { createApp } from '../src/server/app.ts';
import { makeTestRuntime } from './helpers.ts';
import type { Lead } from '../src/core/types.ts';
import type { Runtime } from '../src/runtime.ts';

function createMockRuntime(adminToken = 'test-b2b-secret'): Runtime {
  const base = makeTestRuntime({ RADAR_ADMIN_TOKEN: adminToken });
  return {
    env: base.env,
    logger: base.logger,
    store: base.store,
    sources: base.sources,
    sinks: base.sinks,
    fetchImpl: fetch,
  };
}

describe('B2B Realtime Firehose API (SSE Stream)', () => {
  it('filters leads accurately by stack, budget, and type', () => {
    const leadGo: Lead = {
      id: 'lead-1',
      sourceId: 'mesh',
      type: 'job',
      title: 'Go Architect',
      text: 'Distributed systems',
      fingerprint: 'fp-1',
      titleKey: 'go architect',
      status: 'new',
      score: 85,
      budget: 5000,
      currency: 'USD',
      skills: ['Go', 'Kafka'],
      reasons: [],
      createdAt: new Date().toISOString(),
      verification_state: 'verified_active',
    };

    const filter1: FirehoseFilter = { stacks: ['go'] };
    expect(matchesFirehoseFilter(leadGo, filter1)).toBe(true);

    const filterMismatchStack: FirehoseFilter = { stacks: ['python'] };
    expect(matchesFirehoseFilter(leadGo, filterMismatchStack)).toBe(false);

    const filterBudgetOk: FirehoseFilter = { minBudget: 4000 };
    expect(matchesFirehoseFilter(leadGo, filterBudgetOk)).toBe(true);

    const filterBudgetTooHigh: FirehoseFilter = { minBudget: 6000 };
    expect(matchesFirehoseFilter(leadGo, filterBudgetTooHigh)).toBe(false);

    const filterTypeJob: FirehoseFilter = { types: ['job'] };
    expect(matchesFirehoseFilter(leadGo, filterTypeJob)).toBe(true);

    const filterTypeGig: FirehoseFilter = { types: ['gig'] };
    expect(matchesFirehoseFilter(leadGo, filterTypeGig)).toBe(false);
  });

  it('rejects unauthenticated requests with 401', async () => {
    const runtime = createMockRuntime();
    const app = createApp(runtime);

    const res = await app.request('/api/v1/firehose');
    expect(res.status).toBe(401);
    const data = await res.json() as any;
    expect(data.error).toBe('unauthorized');
  });

  it('streams realtime leads via Server-Sent Events when broadcast occurs', async () => {
    const runtime = createMockRuntime('secret-123');
    const app = createApp(runtime);

    const res = await app.request('/api/v1/firehose?stack=rust', {
      headers: {
        Authorization: 'Bearer secret-123',
      },
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');

    const reader = res.body?.getReader();
    expect(reader).toBeDefined();

    const decoder = new TextDecoder();

    // 1. Initial connection message
    const { value: chunk1 } = await reader!.read();
    const text1 = decoder.decode(chunk1);
    expect(text1).toContain('event: connected');

    // 2. Broadcast matching lead
    const matchLead: Lead = {
      id: 'rust-lead-1',
      sourceId: 'mesh',
      type: 'job',
      title: 'Rust Core Dev',
      text: 'Tokio and memory safety',
      fingerprint: 'fp-rust',
      titleKey: 'rust core dev',
      status: 'new',
      score: 95,
      skills: ['Rust', 'Wasm'],
      reasons: [],
      createdAt: new Date().toISOString(),
    };

    // Broadcast in background
    setTimeout(() => broadcastToFirehose(matchLead), 20);

    const { value: chunk2 } = await reader!.read();
    const text2 = decoder.decode(chunk2);
    expect(text2).toContain('event: lead');
    expect(text2).toContain('Rust Core Dev');

    // Clean up stream
    await reader!.cancel();
  });
});
