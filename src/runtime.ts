import { createClassifier } from './classifier/openai.ts';
import { parseTierDelays, type AccessPolicy } from './core/access.ts';
import { loadEnv } from './config.ts';
import { createLogger } from './core/logger.ts';
import type { Classifier, Env, Logger } from './core/types.ts';
import type { Store } from './core/store.ts';
import { createSinkRegistry, type SinkRegistry } from './sinks/index.ts';
import { createSourceRegistry, type SourceRegistry } from './sources/index.ts';
import { MemoryStore } from './store/memory.ts';
import { PostgresStore } from './store/postgres.ts';
import { SimilarIndex } from './pipeline/similar.ts';

export interface Runtime {
  env: Env;
  logger: Logger;
  store: Store;
  sources: SourceRegistry;
  sinks: SinkRegistry;
  classifier?: Classifier;
  fetchImpl: typeof fetch;
  access: AccessPolicy;
  /** Recent-sketch index for merge rule 4 (similar text). */
  similar?: SimilarIndex;
}

export interface RuntimeOverrides {
  store?: Store;
  fetchImpl?: typeof fetch;
}

export async function createRuntime(env: Env = loadEnv(), overrides: RuntimeOverrides = {}): Promise<Runtime> {
  const logger = createLogger(env.RADAR_LOG_LEVEL);
  let store: Store;
  if (overrides.store) {
    store = overrides.store;
    if (store.init) {
      await store.init();
    }
  } else if (env.DATABASE_URL) {
    logger.info('Using PostgreSQL storage engine', { url: env.DATABASE_URL.replace(/:[^:@]+@/, ':***@') });
    const pgStore = new PostgresStore(env.DATABASE_URL);
    await pgStore.init();
    store = pgStore;
  } else {
    if (env.NODE_ENV === 'production') {
      throw new Error('FATAL: DATABASE_URL is not configured in production mode.');
    }
    logger.warn('DATABASE_URL is not set. Using in-memory ephemeral store.');
    store = new MemoryStore();
  }
  const sources = createSourceRegistry();
  const sinks = createSinkRegistry(env);
  const classifier = createClassifier(env, logger);

  return {
    env,
    logger,
    store,
    sources,
    sinks,
    classifier,
    fetchImpl: overrides.fetchImpl ?? fetch,
    access: accessPolicyFromEnv(env),
    similar: new SimilarIndex(store),
  };
}

export function accessPolicyFromEnv(env: Env): AccessPolicy {
  return { mode: env.RADAR_MODE ?? 'node', delays: parseTierDelays(env.RADAR_TIER_DELAYS) };
}
