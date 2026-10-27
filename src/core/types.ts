export type SourceKind = 'rss' | 'telegram' | 'kwork' | 'webhook' | 'imap' | 'trudvsem' | 'hh' | 'remoteok' | (string & {});
export type AccessKind = 'official' | 'public' | 'user-provided' | 'auth-required';
export type LeadType = 'job' | 'gig';
export type LeadVoteSignal = 'useful' | 'junk' | 'scam' | 'closed';
export type LeadStatus =
  | 'new'
  | 'delivered'
  | 'duplicate'
  | 'rejected'
  | 'failed'
  | 'interesting'
  | 'applied'
  | 'in_work';
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface Logger {
  debug(message: string, meta?: unknown): void;
  info(message: string, meta?: unknown): void;
  warn(message: string, meta?: unknown): void;
  error(message: string, meta?: unknown): void;
  child(scope: string): Logger;
}

export interface Env {
  NODE_ENV: 'development' | 'production' | 'test';
  DATABASE_URL?: string;
  RADAR_ADMIN_TOKEN?: string;
  RADAR_HOST_PORT?: number;
  RADAR_USER_AGENT: string;
  RADAR_HTTP_TIMEOUT_MS: number;
  RADAR_POLL_INTERVAL_SEC: number;
  RADAR_POLL_CONCURRENCY: number;
  RADAR_LLM_ENABLED: boolean;
  OPENAI_API_KEY?: string;
  OPENAI_BASE_URL: string;
  OPENAI_MODEL: string;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_CHAT_ID?: string;
  WEBHOOK_URL?: string;
  WEBHOOK_SECRET?: string;
  RADAR_CONSOLE_SINK: boolean;
  RADAR_PUBLIC_READ: boolean;
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  RADAR_PUBLIC_URL?: string;
  /** Optional web analytics and search console verification (see src/server/analytics.ts). */
  RADAR_YANDEX_METRIKA_ID?: string;
  RADAR_GA_ID?: string;
  RADAR_GOOGLE_SITE_VERIFICATION?: string;
  RADAR_YANDEX_VERIFICATION?: string;
  /** `node` (self-hosted, no delays) or `hub` (shared network hub with tiered delays). */
  RADAR_MODE: 'node' | 'hub';
  /** Tier delays in minutes, e.g. `guest=720,member=180,active=30,core=0`. */
  RADAR_TIER_DELAYS?: string;
  /** Comma-separated hex pubkeys of hub moderators. */
  RADAR_MODERATORS?: string;
  /** Node: hub to send shared sources to, e.g. https://openradar.fun. */
  RADAR_HUB_URL?: string;
  /** Node: participant key (hex or nsec) that signs observations sent to the hub. */
  RADAR_NODE_KEY?: string;
  RADAR_PROXY_URL?: string;
  RADAR_DIGEST_CHAT_ID?: string;
  RADAR_DIGEST_INTERVAL_HOURS: number;
  RADAR_RETENTION_DAYS: number;
  RADAR_LOG_LEVEL: LogLevel;
  PORT: number;
  RADAR_BIND: string;
}

export interface SourceConfig {
  url?: string;
  channel?: string;
  categoryId?: string;
  city?: string;
  includeKeywords?: string[];
  excludeKeywords?: string[];
  minBudget?: number;
  maxAgeHours?: number;
  limit?: number;
  token?: string;
  [key: string]: unknown;
}

export interface SourceRecord {
  id: string;
  kind: SourceKind;
  title: string;
  enabled: boolean;
  config: SourceConfig;
  createdAt: string;
  updatedAt: string;
}

export type ContactType = 'telegram' | 'phone' | 'email' | 'whatsapp' | 'vk' | 'url' | 'other';

export interface Contact {
  type: ContactType;
  /** Normalised value: `@handle`, E.164 phone, lower-case email, absolute URL. */
  value: string;
}

export type SourceVisibility = 'public' | 'private' | 'invite';

/** Where exactly a post was observed (radar/2 observation `source`). */
export interface SourceRef {
  platform: string;
  channel: string;
  channelTitle?: string;
  visibility: SourceVisibility;
  messageId?: string;
}

export interface RawLead {
  sourceId: string;
  type?: LeadType;
  externalId?: string;
  url?: string;
  title: string;
  text: string;
  author?: string;
  city?: string;
  budget?: number;
  currency?: string;
  paymentPeriod?: 'monthly' | 'hourly' | 'fixed';
  rawSalary?: string;
  normalizedUsdMin?: number;
  normalizedUsdMax?: number;
  category?: string;
  skills?: string[];
  isRemote?: boolean;
  publishedAt?: string;
  metadata?: Record<string, unknown>;
  raw?: Record<string, unknown>;
  contacts?: Contact[];
  sourceRef?: SourceRef;
}

export type VoteSignal = 'useful' | 'junk' | 'scam' | 'closed';

export interface VoteResult {
  votes_up: number;
  votes_down: number;
  votes_scam: number;
  votes_closed: number;
  score: number;
}

/**
 * Visibility state of a lead in the feed (radar/2). Only `active` leads are
 * shown to non-admin viewers; the other states are reversible decisions.
 */
export type LeadState = 'active' | 'suspect' | 'hidden_junk' | 'hidden_scam' | 'closed';

/** Access level of whoever reads the feed. Only the delay and contact visibility differ. */
export type ViewerTier = 'admin' | 'core' | 'active' | 'member' | 'guest';

export interface Viewer {
  tier: ViewerTier;
  /** GitHub user id of a logged-in web user. */
  userId?: number;
  /** Participant key (hub mode, NIP-98). */
  pubkey?: string;
}

export interface Lead extends RawLead {
  id: string;
  canonicalUrl?: string;
  fingerprint: string;
  titleKey: string;
  status: LeadStatus;
  score: number;
  reasons: string[];
  createdAt: string;
  deliveredAt?: string;
  votes_up?: number;
  votes_down?: number;
  votes_scam?: number;
  votes_closed?: number;
  /** MinHash sketch of the text (base64url), used for near-duplicate clustering. */
  minhash_sketch?: string;
  state?: LeadState;
  /** Hub: when the lead was first confirmed (another observer or useful signals); sticky. */
  confirmedAt?: string;
}

export interface PollContext {
  fetchImpl: typeof fetch;
  userAgent: string;
  timeoutMs: number;
  logger: Logger;
  now: () => Date;
}

export interface SourceAdapter {
  kind: SourceKind;
  access: AccessKind;
  description: string;
  risks: string[];
  /** Webhook sources have no poll function; they are fed by the HTTP API. */
  poll?(source: SourceRecord, ctx: PollContext): Promise<RawLead[]>;
}

export interface SinkContext {
  fetchImpl: typeof fetch;
  logger: Logger;
  env: Env;
}

export interface SinkAdapter {
  kind: string;
  /** Optional filter: when it returns false the lead is not queued for this sink. */
  accepts?(lead: Lead, source: SourceRecord): boolean;
  deliver(lead: Lead, ctx: SinkContext): Promise<void>;
}

export interface Classification {
  isLead: boolean;
  confidence: number;
  category?: string;
  city?: string;
  summary?: string;
  skills?: string[];
  estimatedBudget?: number;
  urgency?: 'low' | 'medium' | 'high';
}

export interface ClassifierInput {
  title: string;
  text: string;
  city?: string;
  budget?: number;
}

export interface Classifier {
  classify(lead: ClassifierInput): Promise<Classification | null>;
}

export interface RunRecord {
  id: string;
  sourceId: string;
  startedAt: string;
  finishedAt?: string;
  found: number;
  inserted: number;
  duplicates: number;
  rejected: number;
  delivered: number;
  error?: string;
}

export interface Stats {
  sources: number;
  enabledSources: number;
  leads: number;
  newLeads: number;
  deliveredLeads: number;
  rejectedLeads: number;
  last24h: number;
}

export interface SourceHealth {
  source: SourceRecord;
  lastRun?: RunRecord;
  last24h: {
    found: number;
    inserted: number;
    duplicates: number;
    rejected: number;
    delivered: number;
    errors: number;
    runs: number;
  };
  successRate: number;
}
