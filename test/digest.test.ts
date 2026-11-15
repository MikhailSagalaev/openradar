import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Lead } from '../src/core/types.ts';
import { MemoryStore } from '../src/store/memory.ts';
import { runDigestIfDue } from '../src/pipeline/digest.ts';
import { createLogger } from '../src/core/logger.ts';
import { testEnv } from './helpers.ts';

const env = testEnv({
  RADAR_DIGEST_CHAT_ID: '-100123',
  TELEGRAM_BOT_TOKEN: 'test-token',
  RADAR_DIGEST_INTERVAL_HOURS: 6,
});
const logger = createLogger('error');

function makeLead(id: string, createdAt: string): Lead {
  return {
    id,
    sourceId: 'source-1',
    externalId: `external-${id}`,
    title: `Заказ ${id}`,
    text: 'Нужен разработчик, бюджет 50000 ₽',
    publishedAt: createdAt,
    fingerprint: `fingerprint-${id}`,
    titleKey: `заказ ${id}`,
    status: 'new',
    score: 80,
    reasons: [],
    createdAt,
    type: 'gig',
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

// lastDigestAt is module-global: the cases run in order and share the watermark.
describe('digest watermark', () => {
  const store = new MemoryStore();

  it('first tick only sets the baseline', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-01T00:00:00Z'));
    const summary = await runDigestIfDue({
      store,
      env,
      logger,
      fetchImpl: async () => new Response('', { status: 200 }),
    });
    expect(summary).toEqual({ sent: false, leads: 0, skipped: 'not_due' });
  });

  it('a failed send keeps the window for the next tick', async () => {
    // Past the 6h interval; the lead was created inside the pending window.
    vi.setSystemTime(new Date('2026-11-01T07:00:00Z'));
    await store.insertLead(makeLead('digest-lead-1', '2026-11-01T03:00:00Z'));
    const summary = await runDigestIfDue({
      store,
      env,
      logger,
      fetchImpl: async () => new Response('', { status: 500 }),
    });
    expect(summary.skipped).toBe('send_failed');
    expect(summary.leads).toBe(1);
  });

  it('the retry after a failure still includes the same window', async () => {
    vi.setSystemTime(new Date('2026-11-01T07:00:00Z'));
    let sentBody = '';
    const summary = await runDigestIfDue({
      store,
      env,
      logger,
      fetchImpl: async (_url, init) => {
        sentBody = String((init as RequestInit).body ?? '');
        return new Response('{}', { status: 200 });
      },
    });
    expect(summary.sent).toBe(true);
    expect(summary.leads).toBe(1);
    expect(sentBody).toContain('digest-lead-1');
  });

  it('an empty window advances the watermark too', async () => {
    vi.setSystemTime(new Date('2026-11-01T14:00:00Z'));
    const summary = await runDigestIfDue({
      store,
      env,
      logger,
      fetchImpl: async () => new Response('', { status: 200 }),
    });
    expect(summary.skipped).toBe('nothing_new');
    // Still inside the next interval: not due, so the empty window was consumed.
    const again = await runDigestIfDue({
      store,
      env,
      logger,
      fetchImpl: async () => new Response('', { status: 200 }),
    });
    expect(again.skipped).toBe('not_due');
    await store.close();
  });
});
