import { randomUUID } from 'node:crypto';
import { loadEnv } from '../src/config.ts';
import { createLogger } from '../src/core/logger.ts';
import type { Env, Lead, PollContext, SinkAdapter, SourceRecord } from '../src/core/types.ts';
import type { Store } from '../src/core/store.ts';
import { createSourceRegistry, type SourceRegistry } from '../src/sources/index.ts';
import { SinkRegistry } from '../src/sinks/index.ts';
import { MemoryStore } from '../src/store/memory.ts';
import { PostgresStore } from '../src/store/postgres.ts';
import { accessPolicyFromEnv } from '../src/runtime.ts';
import type { AccessPolicy } from '../src/core/access.ts';

export const TEST_NOW = new Date('2026-10-21T12:00:00.000Z');

export function testEnv(overrides: Partial<Env> = {}): Env {
  return loadEnv({
    NODE_ENV: 'test',
    RADAR_ADMIN_TOKEN: undefined,
    RADAR_CONSOLE_SINK: false,
    RADAR_LOG_LEVEL: 'error',
    TELEGRAM_BOT_TOKEN: undefined,
    TELEGRAM_CHAT_ID: undefined,
    WEBHOOK_URL: undefined,
    WEBHOOK_SECRET: undefined,
    RADAR_LLM_ENABLED: false,
    RADAR_EXTRACT_ENABLED: false,
    RADAR_EXTRACT_PER_HOUR: 300,
    RADAR_EXTRACT_APPLY: false,
    RADAR_EXTRACT_PROVIDER: 'openai',
    GIGACHAT_SCOPE: 'GIGACHAT_API_PERS',
    GIGACHAT_BASE_URL: 'https://gigachat.devices.sberbank.ru/api/v1',
    GIGACHAT_OAUTH_URL: 'https://ngw.devices.sberbank.ru:9443/api/v2/oauth',
    OPENAI_API_KEY: undefined,
    ...overrides,
  });
}

export function makeSource(overrides: Partial<SourceRecord> = {}): SourceRecord {
  const now = TEST_NOW.toISOString();
  return {
    id: 'source-1',
    kind: 'rss',
    title: 'Test source',
    enabled: true,
    config: {},
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

export function pollContext(body: string, now: Date = TEST_NOW): PollContext {
  return {
    fetchImpl: async () => new Response(body, { status: 200 }),
    userAgent: 'radar-test',
    timeoutMs: 5_000,
    logger: createLogger('error'),
    now: () => now,
  };
}

export class MemorySink implements SinkAdapter {
  readonly kind = 'memory';
  readonly leads: Lead[] = [];

  async deliver(lead: Lead): Promise<void> {
    this.leads.push(lead);
  }
}

export interface TestRuntime {
  store: Store;
  env: Env;
  logger: ReturnType<typeof createLogger>;
  sources: SourceRegistry;
  sinks: SinkRegistry;
  fetchImpl: typeof fetch;
  access: AccessPolicy;
}

export function createTestStore(): Store {
  if (process.env.RADAR_TEST_STORE === 'postgres') {
    const url = process.env.DATABASE_URL || 'postgres://radar:radar@127.0.0.1:5432/radar_test';
    return new PostgresStore(url);
  }
  return new MemoryStore();
}

export function makeTestRuntime(overrides: Partial<Env> = {}): TestRuntime {
  const env = testEnv(overrides);
  return {
    store: createTestStore(),
    env,
    logger: createLogger('error'),
    sources: createSourceRegistry(),
    sinks: new SinkRegistry(),
    fetchImpl: fetch,
    access: accessPolicyFromEnv(env),
  };
}

/** Registers a GitHub user and returns a session cookie value bound to it. */
export async function makeUserSession(
  runtime: TestRuntime,
  handle = 'octocat',
): Promise<string> {
  if (!runtime.store.upsertGitHubUser || !runtime.store.createSession) {
    throw new Error('store does not support GitHub users');
  }
  const user = await runtime.store.upsertGitHubUser({ githubId: 583231, handle });
  const sessionId = `user-session-${randomUUID().slice(0, 8)}`;
  const expiresAt = new Date(Date.now() + 3600 * 1000).toISOString();
  await runtime.store.createSession(sessionId, expiresAt, user.id);
  return sessionId;
}
