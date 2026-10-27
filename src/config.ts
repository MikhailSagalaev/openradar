import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';
import type { Env } from './core/types.ts';

loadDotenv({ quiet: true });

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
    .default('RadarBot/0.8.1 (+https://github.com/MikhailSagalaev/openradar)'),
  RADAR_HTTP_TIMEOUT_MS: z.coerce.number().int().positive().default(15_000),
  RADAR_POLL_INTERVAL_SEC: z.coerce.number().int().positive().default(300),
  RADAR_POLL_CONCURRENCY: z.coerce.number().int().positive().default(4),
  RADAR_LLM_ENABLED: booleanFromEnv(false),
  OPENAI_API_KEY: optionalString,
  OPENAI_BASE_URL: z.string().url().default('https://api.openai.com/v1'),
  OPENAI_MODEL: z.string().default('gpt-4o-mini'),
  TELEGRAM_BOT_TOKEN: optionalString,
  TELEGRAM_CHAT_ID: optionalString,
  WEBHOOK_URL: z.string().url().optional().or(z.literal('').transform(() => undefined)),
  WEBHOOK_SECRET: optionalString,
  RADAR_CONSOLE_SINK: booleanFromEnv(true),
  RADAR_PUBLIC_READ: booleanFromEnv(false),
  GITHUB_CLIENT_ID: optionalString,
  GITHUB_CLIENT_SECRET: optionalString,
  RADAR_PUBLIC_URL: optionalString,
  RADAR_ADMIN_GITHUB: optionalString,
  RADAR_YANDEX_METRIKA_ID: optionalString,
  RADAR_GA_ID: optionalString,
  RADAR_GOOGLE_SITE_VERIFICATION: optionalString,
  RADAR_YANDEX_VERIFICATION: optionalString,
  RADAR_MODE: z.enum(['node', 'hub']).default('node'),
  RADAR_TIER_DELAYS: optionalString,
  RADAR_MODERATORS: optionalString,
  RADAR_HUB_URL: z.string().url().optional().or(z.literal('').transform(() => undefined)),
  RADAR_NODE_KEY: optionalString,
  RADAR_PROXY_URL: optionalString,
  RADAR_DIGEST_CHAT_ID: optionalString,
  RADAR_DIGEST_INTERVAL_HOURS: z.coerce.number().int().positive().default(6),
  RADAR_RETENTION_DAYS: z.coerce.number().int().positive().default(180),
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
