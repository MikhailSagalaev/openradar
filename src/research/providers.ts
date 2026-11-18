/**
 * Extraction provider rotation: the same idea as the decide key pool. Endpoints are tried in
 * order; one that answers 401/402/403 (bad key, no credits, no access) is parked and the next
 * takes over the same post. Free tiers with a one-time token grant go first, paid packages
 * last, so the grant is spent before the package. Parked providers are retried after the
 * cooldown — a top-up brings the same endpoint back without a restart.
 */
import type { Env, ExtractProvider } from '../core/types.ts';

/** Pool order: the JSON list first, then the legacy single OpenAI provider unless already listed. */
export function extractProviders(env: Env): ExtractProvider[] {
  // GigaChat has its own token flow and busy handling; the pool is OpenAI-compatible only.
  if (env.RADAR_EXTRACT_PROVIDER === 'gigachat') return [];
  const list = [...(env.RADAR_EXTRACT_PROVIDERS ?? [])];
  const legacyKey = env.OPENAI_API_KEY;
  if (legacyKey) {
    const fallback = env.RADAR_EXTRACT_FALLBACK_MODEL?.trim();
    const legacy: ExtractProvider = {
      baseUrl: env.OPENAI_BASE_URL,
      apiKey: legacyKey,
      model: env.RADAR_EXTRACT_MODEL || env.OPENAI_MODEL,
      ...(fallback ? { fallbackModel: fallback } : {}),
    };
    if (!list.some((p) => p.baseUrl === legacy.baseUrl && p.apiKey === legacy.apiKey)) list.push(legacy);
  }
  return list;
}

const identity = (p: ExtractProvider): string => `${p.baseUrl}|${p.apiKey}`;

export interface ExtractProviderPool {
  /** First provider not parked, or undefined when every provider is parked. */
  current(): ExtractProvider | undefined;
  /** Park a dead provider; current() skips it until the cooldown passes. */
  park(provider: ExtractProvider, status: number): void;
  /** Status that parked the most recent provider — the batch's stop reason when all are parked. */
  parkedStatus(): number | undefined;
  readonly size: number;
}

/** Shared across rounds so an exhausted provider is not retried every batch. */
export function newExtractProviders(env: Env, now: () => number = Date.now): ExtractProviderPool {
  const providers = extractProviders(env);
  const cooldownMs = (env.RADAR_EXTRACT_PROVIDER_COOLDOWN_MIN ?? 60) * 60_000;
  const parkedUntil = new Map<string, number>();
  let lastStatus: number | undefined;
  return {
    size: providers.length,
    current() {
      const at = now();
      for (const provider of providers) {
        const until = parkedUntil.get(identity(provider));
        if (until === undefined) return provider;
        if (until <= at) {
          parkedUntil.delete(identity(provider));
          return provider;
        }
      }
      return undefined;
    },
    park(provider, status) {
      parkedUntil.set(identity(provider), now() + cooldownMs);
      lastStatus = status;
    },
    parkedStatus() {
      return lastStatus;
    },
  };
}