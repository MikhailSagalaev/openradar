import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';
import type { Env } from './core/types.ts';

if (process.env.NODE_ENV !== 'test' && !process.env.VITEST) {
  loadDotenv({ quiet: true });
}

const optionalString = z
  .string()
  .optional()
  .transform((value) => {
    const trimmed = value?.trim();
    return trimmed ? trimmed : undefined;
  });

const booleanFromEnv = (defaultValue: boolean) =>
  z
    .string()
    .optional()
    .transform((value) => {
      if (value === undefined) return defaultValue;
      return value === 'true' || value === '1' || value === 'yes';
    });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: optionalString,
  RADAR_ADMIN_TOKEN: optionalString,
  RADAR_HOST_PORT: z.coerce.number().int().positive().optional(),
  RADAR_USER_AGENT: z
    .string()
    .default('RadarBot/0.12.0 (+https://github.com/MikhailSagalaev/openradar)'),
  RADAR_HTTP_TIMEOUT_MS: z.coerce.number().int().positive().default(15_000),
  RADAR_POLL_INTERVAL_SEC: z.coerce.number().int().positive().default(300),
  RADAR_POLL_CONCURRENCY: z.coerce.number().int().positive().default(16),
  RADAR_LLM_ENABLED: booleanFromEnv(false),
  OPENAI_API_KEY: optionalString,
  OPENAI_BASE_URL: z.string().url().default('https://api.openai.com/v1'),
  OPENAI_MODEL: z.string().default('gpt-4o-mini'),
  // Verbatim JSON merged into every classifier/extract request (e.g. Qwen's enable_thinking).
  OPENAI_EXTRA_BODY: optionalString,
  // Model extraction of pay, role and grade for the research reports (same API as above).
  RADAR_EXTRACT_ENABLED: booleanFromEnv(false),
  RADAR_EXTRACT_MODEL: optionalString,
  RADAR_EXTRACT_FALLBACK_MODEL: optionalString,
  RADAR_EXTRACT_PER_HOUR: z.coerce.number().int().nonnegative().default(300),
  // Group N posts into one extraction request (plan 021E/D2); 0 or 1 keeps one lead per call.
  RADAR_EXTRACT_BATCH: z.coerce.number().int().nonnegative().max(16).default(0),
  // Ordered pool of OpenAI-compatible endpoints: [{"baseUrl","apiKey","model","fallbackModel"?,"pauseMs"?,"concurrency"?}].
  // The legacy OPENAI_* provider joins last unless the same baseUrl+key is already listed.
  RADAR_EXTRACT_PROVIDERS: z.string().optional().transform((value, ctx) => {
    const trimmed = value?.trim();
    if (!trimmed) return undefined;
    try {
      return z.array(z.object({
        baseUrl: z.string().url(),
        apiKey: z.string().min(1),
        model: z.string().min(1),
        fallbackModel: z.string().min(1).optional(),
        pauseMs: z.coerce.number().int().nonnegative().optional(),
        concurrency: z.coerce.number().int().positive().optional(),
      })).min(1).parse(JSON.parse(trimmed));
    } catch {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'RADAR_EXTRACT_PROVIDERS must be a non-empty JSON array of {baseUrl, apiKey, model, fallbackModel?, pauseMs?, concurrency?}' });
      return z.NEVER;
    }
  }),
  RADAR_EXTRACT_PROVIDER_COOLDOWN_MIN: z.coerce.number().int().nonnegative().default(60),
  // Answers are saved either way; figures use them only once their quality is checked.
  RADAR_EXTRACT_APPLY: booleanFromEnv(false),
  RADAR_USER_TELEGRAM: booleanFromEnv(false),
  // A decision model answers fixed questions about each post; nothing in the feed reads it yet.
  RADAR_DECIDE_ENABLED: booleanFromEnv(false),
  RADAR_DECIDE_URL: z.string().url().default('https://api.subq.ai/v1/systemone'),
  RADAR_DECIDE_MODEL: z.string().default('subq-snap-1.1'),
  RADAR_DECIDE_PER_HOUR: z.coerce.number().int().nonnegative().default(600),
  RADAR_DECIDE_KEY: optionalString,
  RADAR_DECIDE_APPLY: booleanFromEnv(false),
  // Pages read per hour for short posts of boards with thin feeds; 0 stops it.
  RADAR_ENRICH_PER_HOUR: z.coerce.number().int().nonnegative().default(120),
  // Visa sponsorship notes from the UK public register (src/research/visa-sponsors.ts).
  RADAR_VISA_SPONSORS: booleanFromEnv(true),
  // ATS board-diff: a job removed from its board is soft-closed, a returned one reopened.
  RADAR_ATS_GHOST_CHECK: booleanFromEnv(true),
  SUBQ_API_KEY: optionalString,
  SUBQ_API_KEYS: optionalString,
  RADAR_DECIDE_KEY_COOLDOWN_MIN: z.coerce.number().int().nonnegative().default(60),
  RADAR_EXTRACT_PROVIDER: z.enum(['openai', 'gigachat']).default('openai'),
  GIGACHAT_AUTH_KEY: optionalString,
  GIGACHAT_SCOPE: z.string().default('GIGACHAT_API_PERS'),
  GIGACHAT_BASE_URL: z.string().url().default('https://gigachat.devices.sberbank.ru/api/v1'),
  GIGACHAT_OAUTH_URL: z.string().url().default('https://ngw.devices.sberbank.ru:9443/api/v2/oauth'),
  TELEGRAM_BOT_TOKEN: optionalString,
  TELEGRAM_CHAT_ID: optionalString,
  RADAR_ADMIN_CHAT_ID: optionalString,
  WEBHOOK_URL: z.string().url().optional().or(z.literal('').transform(() => undefined)),
  WEBHOOK_SECRET: optionalString,
  RADAR_CONSOLE_SINK: booleanFromEnv(true),
  RADAR_PUBLIC_READ: booleanFromEnv(false),
  GITHUB_CLIENT_ID: optionalString,
  GITHUB_CLIENT_SECRET: optionalString,
  RADAR_PUBLIC_URL: optionalString,
  // Forwarded headers count only behind a proxy that APPENDS the real client IP.
  RADAR_TRUSTED_PROXY: booleanFromEnv(false),
  RADAR_ADMIN_GITHUB: optionalString,
  RADAR_YANDEX_METRIKA_ID: optionalString,
  RADAR_GA_ID: optionalString,
  RADAR_GOOGLE_SITE_VERIFICATION: optionalString,
  RADAR_YANDEX_VERIFICATION: optionalString,
  RADAR_MODE: z.enum(['node', 'hub']).default('node'),
  RADAR_TIER_DELAYS: optionalString,
  RADAR_MODERATORS: optionalString,
  RADAR_WEB_KEY_SECRET: optionalString,
  RADAR_HUB_URL: z.string().url().optional().or(z.literal('').transform(() => undefined)),
  RADAR_NODE_KEY: optionalString,
  RADAR_PROXY_URL: optionalString,
  RADAR_DIGEST_CHAT_ID: optionalString,
  RADAR_DIGEST_INTERVAL_HOURS: z.coerce.number().int().positive().default(6),
  // Lead lifecycle: hot (0..HOT_DAYS) в фиде; warm (archived_at) — скрыт, строка целиком;
  // cold (> RETENTION_DAYS) — после выгрузки месяца в RADAR_ARCHIVE_DIR строка сжимается
  // (compact) или, по явному выбору, удаляется (delete). off — ни того, ни другого.
  RADAR_RETENTION_DAYS: z.coerce.number().int().positive().default(180),
  RADAR_RETENTION_MODE: z.enum(['compact', 'delete', 'off']).default('compact'),
  RADAR_LEADS_HOT_DAYS: z.coerce.number().int().positive().default(60),
  RADAR_ARCHIVE_DIR: z.string().default('data/archives'),
  // Closed-post checks against the boards, and feed age limits (0 turns a limit off).
  RADAR_CHECK_CLOSED: booleanFromEnv(true),
  RADAR_SUBSCRIPTION_BOT: booleanFromEnv(false),
  RADAR_GIG_TTL_DAYS: z.coerce.number().int().nonnegative().default(14),
  RADAR_JOB_TTL_DAYS: z.coerce.number().int().nonnegative().default(30),
  // Per-IP requests per minute on public GETs. Limiters live in process memory: each process counts on its own.
  RADAR_FEED_RATE_PER_MIN: z.coerce.number().int().positive().default(120),
  RADAR_RSS_RATE_PER_MIN: z.coerce.number().int().positive().default(60),
  RADAR_DELTA_RATE_PER_MIN: z.coerce.number().int().positive().default(30),
  RADAR_SITEMAP_RATE_PER_MIN: z.coerce.number().int().positive().default(10),
  // Pooled PG connections are recycled after this age/usage: a pg_search backend keeps its
  // Tantivy caches and allocator high-water mark for the life of the connection, so recycling
  // is the only way to hand that memory back (docs/OPS_BOT_AND_MEMORY.md). 0 disables a limit.
  RADAR_PG_CONN_MAX_AGE_SEC: z.coerce.number().int().nonnegative().default(1800),
  RADAR_PG_CONN_MAX_USES: z.coerce.number().int().nonnegative().default(500),
  // Per-request statement timeout for web reads (SET LOCAL inside the request's transaction):
  // a runaway BM25 query dies alone instead of growing until the OOM-killer picks a victim.
  // Background jobs keep the role-level timeout. 0 disables.
  RADAR_WEB_STATEMENT_TIMEOUT_MS: z.coerce.number().int().nonnegative().default(15_000),
  // Anonymous lead-card HTML cache TTL (seconds); logged-in views are never cached. 0 disables.
  RADAR_LEAD_CACHE_SEC: z.coerce.number().int().nonnegative().default(60),
  RADAR_LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  PORT: z.coerce.number().int().positive().default(8787),
  /** Interface to listen on; the Docker image sets 0.0.0.0. */
  RADAR_BIND: z.string().min(1).default('127.0.0.1'),
});

/** Example values that ever shipped in this repository: never accept them as a real secret. */
const KNOWN_WEAK_TOKENS = new Set([
  'change-me',
  '012345678901234567890123456789012',
  'your_secure_random_admin_token_here_at_least_32_chars',
]);

export function loadEnv(overrides: Partial<Env> = {}): Env {
  const parsed = envSchema.parse(process.env);
  const env: Env = { ...parsed, ...overrides };

  if (env.NODE_ENV === 'production') {
    const token = env.RADAR_ADMIN_TOKEN?.trim();
    if (!token || KNOWN_WEAK_TOKENS.has(token) || token.length < 32 || /^(.)\1+$/.test(token)) {
      throw new Error(
        'FATAL: RADAR_ADMIN_TOKEN is missing, a published example value, or shorter than 32 characters in production mode. ' +
        'Generate a strong random token, e.g. `openssl rand -hex 32`.'
      );
    }
  }

  return env;
}
