import { createHmac, randomBytes } from 'node:crypto';
import { escapeHtml, truncate } from './text.ts';
import type { Lead, LeadType } from './types.ts';

/**
 * Saved searches: a signed-in user follows a feed filter and gets the new leads it matches,
 * in Telegram or on a webhook. The filter is the feed's own, so what arrives is what the feed
 * would show with that filter, after the same tier delay.
 */

/** The feed filter a subscription follows: the query string of the feed, minus the order. */
export interface SavedFilters {
  q?: string;
  type?: LeadType;
  it?: boolean;
  remote?: boolean;
  budgetRub?: number;
  skill?: string;
  language?: 'ru' | 'en';
}

export type SubscriptionChannel = 'telegram' | 'webhook';

export interface SubscriptionRecord {
  id: string;
  userId: number;
  name: string;
  filters: SavedFilters;
  channel: SubscriptionChannel;
  /** Webhook URL. */
  target?: string;
  /** HMAC-SHA256 key of the webhook signature. */
  secret?: string;
  paused: boolean;
  /** Leads the user could see up to this instant were already sent. */
  cursorAt: string;
  checkedAt?: string;
  lastSentAt?: string;
  failures: number;
  lastError?: string;
  createdAt: string;
}

/** At most this many subscriptions per user. */
export const MAX_SUBSCRIPTIONS_PER_USER = 20;
/** A subscription is checked, and a digest sent, at most this often. */
export const SUBSCRIPTION_INTERVAL_MS = 15 * 60_000;
/** Leads in one digest; the rest are one click away in the feed. */
export const DIGEST_MAX_LEADS = 10;
/** Failed deliveries in a row before a subscription pauses itself. */
export const MAX_DELIVERY_FAILURES = 10;
/** A cursor never lags more than this: after a long outage the digest starts from recent leads. */
export const MAX_CURSOR_LAG_MS = 3 * 24 * 3600_000;

/** Feed filters from a form or a query string; anything unknown is dropped. */
export function savedFiltersFrom(input: Record<string, unknown>): SavedFilters {
  const text = (key: string, max: number): string | undefined => {
    const value = input[key];
    return typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : undefined;
  };
  const flag = (key: string): boolean | undefined => (input[key] === '1' || input[key] === 'true' || input[key] === true ? true : undefined);
  const budget = Number(input.budget ?? input.budgetRub);
  const type = input.type === 'job' || input.type === 'gig' ? input.type : undefined;
  // The feed's language select sends '' for its default (the interface's market) and 'all' for any.
  const chosen = input.language === 'all' ? undefined : input.language || input.default_language;
  const language = chosen === 'ru' || chosen === 'en' ? chosen : undefined;
  const filters: SavedFilters = {
    q: text('q', 200),
    type,
    it: flag('it'),
    remote: flag('remote'),
    budgetRub: Number.isFinite(budget) && budget > 0 ? Math.min(Math.round(budget), 100_000_000) : undefined,
    skill: text('skill', 40),
    language,
  };
  return Object.fromEntries(Object.entries(filters).filter(([, value]) => value !== undefined)) as SavedFilters;
}

/** True when the filter narrows nothing: such a subscription would be the whole feed. */
export function isEmptyFilter(filters: SavedFilters): boolean {
  return !filters.q && !filters.it && !filters.skill && !filters.budgetRub && !filters.type && !filters.remote;
}

/** The feed URL of a saved filter, so a digest links to the rest of its leads. */
export function feedQuery(filters: SavedFilters): string {
  const params = new URLSearchParams();
  if (filters.q) params.set('q', filters.q);
  if (filters.type) params.set('type', filters.type);
  params.set('sort', 'new');
  if (filters.budgetRub) params.set('budget', String(filters.budgetRub));
  if (filters.skill) params.set('skill', filters.skill);
  params.set('language', filters.language ?? 'all');
  if (filters.remote) params.set('remote', '1');
  if (filters.it) params.set('it', '1');
  return params.toString();
}

/** A short human name: «Python · удалённо · от 50 000 ₽». */
export function subscriptionName(filters: SavedFilters): string {
  const parts = [
    filters.q ? `«${truncate(filters.q, 40)}»` : undefined,
    filters.type === 'job' ? 'вакансии' : filters.type === 'gig' ? 'заказы' : undefined,
    filters.it ? 'IT' : undefined,
    filters.skill,
    filters.remote ? 'удалённо' : undefined,
    filters.budgetRub ? `от ${new Intl.NumberFormat('ru-RU').format(filters.budgetRub)} ₽` : undefined,
    filters.language === 'ru' ? 'на русском' : filters.language === 'en' ? 'на английском' : undefined,
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'Вся лента';
}

export function newWebhookSecret(): string {
  return randomBytes(24).toString('hex');
}

/** Value of the X-OpenRadar-Signature header: `sha256=` and the HMAC of `timestamp.body`. */
export function signWebhook(secret: string, timestamp: string, body: string): string {
  return `sha256=${createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex')}`;
}

/** Telegram digest of one subscription (HTML parse mode). */
export function formatSubscriptionDigest(
  subscription: Pick<SubscriptionRecord, 'name' | 'filters'>,
  leads: Lead[],
  more: boolean,
  publicUrl: string,
): string {
  const lines = leads.map((lead) => {
    const money = typeof lead.budget === 'number'
      ? `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(lead.budget)} ${lead.currency === 'RUB' || !lead.currency ? '₽' : lead.currency}`
      : undefined;
    const meta = [lead.type === 'job' ? 'вакансия' : 'заказ', money].filter(Boolean).join(' · ');
    return `• <a href="${escapeHtml(`${publicUrl}/leads/${lead.id}`)}">${escapeHtml(truncate(lead.title, 90))}</a> — ${escapeHtml(meta)}`;
  });
  const feed = `${publicUrl}/?${feedQuery(subscription.filters)}`;
  return [
    `<b>${escapeHtml(subscription.name)}</b>: ${leads.length}${more ? '+' : ''} ${leads.length === 1 ? 'новый' : 'новых'}`,
    '',
    ...lines,
    '',
    `<a href="${escapeHtml(feed)}">${more ? 'Остальные в ленте' : 'Открыть в ленте'}</a> · <a href="${escapeHtml(`${publicUrl}/me#subscriptions`)}">Подписки</a>`,
  ].join('\n');
}
