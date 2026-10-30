import { createHmac } from 'node:crypto';
import { assertSafeUrl, safeFetchImpl } from '../core/ssrf.ts';
import type { Store } from '../core/store.ts';
import {
  DIGEST_MAX_LEADS,
  formatSubscriptionDigest,
  MAX_CURSOR_LAG_MS,
  MAX_DELIVERY_FAILURES,
  signWebhook,
  SUBSCRIPTION_INTERVAL_MS,
  type SavedFilters,
  type SubscriptionRecord,
} from '../core/subscriptions.ts';
import type { Env, Lead, Logger } from '../core/types.ts';

export interface SubscriptionDeps {
  store: Store;
  env: Env;
  logger: Logger;
  fetchImpl?: typeof fetch;
  now?: () => Date;
  /**
   * Leads matching the filter that this user may see, newest first, created after `createdAfter`,
   * and the instant the user's view ends (now minus the tier delay). The feed's own function,
   * so a subscription never shows a lead earlier than the feed would.
   */
  leadsForUser(userId: number, filters: SavedFilters, createdAfter: string, limit: number): Promise<{ leads: Lead[]; until: string }>;
  /** The public JSON of a lead for a webhook, with contacts as this user may see them. */
  projectLead(lead: Lead, userId: number): Record<string, unknown>;
}

export interface SubscriptionRound {
  checked: number;
  sent: number;
  failed: number;
}

/** Subscriptions handled in one background cycle. */
const BATCH = 200;
const TELEGRAM_API = 'https://api.telegram.org';

export async function telegramApi(
  token: string,
  method: string,
  body: Record<string, unknown>,
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: boolean; status: number; description?: string; result?: unknown }> {
  const response = await fetchImpl(`${TELEGRAM_API}/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  const json = (await response.json().catch(() => ({}))) as { ok?: boolean; description?: string; result?: unknown };
  return { ok: Boolean(json.ok), status: response.status, description: json.description, result: json.result };
}

class DeliveryError extends Error {
  constructor(message: string, readonly blocked = false) {
    super(message);
  }
}

async function sendTelegram(deps: SubscriptionDeps, subscription: SubscriptionRecord, leads: Lead[], more: boolean): Promise<'sent' | 'skipped'> {
  const token = deps.env.TELEGRAM_BOT_TOKEN;
  const chatId = await deps.store.getTelegramChat?.(subscription.userId);
  if (!token || !deps.env.RADAR_SUBSCRIPTION_BOT || !chatId) return 'skipped';
  const publicUrl = (deps.env.RADAR_PUBLIC_URL ?? 'https://openradar.fun').replace(/\/$/, '');
  const result = await telegramApi(token, 'sendMessage', {
    chat_id: chatId,
    text: formatSubscriptionDigest(subscription, leads, more, publicUrl),
    parse_mode: 'HTML',
    disable_web_page_preview: true,
  }, deps.fetchImpl);
  // 403: the user blocked the bot; the chat is forgotten until they link it again.
  if (result.status === 403) {
    await deps.store.unlinkTelegramChat?.(chatId);
    throw new DeliveryError(`telegram: ${result.description ?? 'blocked'}`, true);
  }
  if (!result.ok) throw new DeliveryError(`telegram: ${result.status} ${result.description ?? ''}`.trim());
  return 'sent';
}

async function sendWebhook(deps: SubscriptionDeps, subscription: SubscriptionRecord, leads: Lead[], more: boolean): Promise<'sent'> {
  if (!subscription.target || !subscription.secret) throw new DeliveryError('webhook: no URL');
  // Checked again on every send: DNS can change after the URL was saved.
  await assertSafeUrl(subscription.target);
  const publicUrl = (deps.env.RADAR_PUBLIC_URL ?? 'https://openradar.fun').replace(/\/$/, '');
  const body = JSON.stringify({
    event: 'subscription.leads',
    subscription: { id: subscription.id, name: subscription.name, filters: subscription.filters },
    leads: leads.map((lead) => deps.projectLead(lead, subscription.userId)),
    more,
    manage_url: `${publicUrl}/me#subscriptions`,
  });
  const timestamp = String(Math.floor((deps.now?.() ?? new Date()).getTime() / 1000));
  const response = await safeFetchImpl(deps.fetchImpl)(subscription.target, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'user-agent': 'openradar-subscriptions',
      'x-openradar-timestamp': timestamp,
      'x-openradar-signature': signWebhook(subscription.secret, timestamp, body),
    },
    body,
    redirect: 'manual',
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new DeliveryError(`webhook: HTTP ${response.status}`);
  return 'sent';
}

/**
 * One round of saved-search delivery: every active subscription not checked in the last
 * 15 minutes gets the leads that became visible to its owner since its cursor. Nothing new,
 * or nowhere to send (Telegram not linked), moves the cursor on; a failed send keeps it, so the
 * next round retries, and ten failures in a row pause the subscription.
 */
export async function deliverDueSubscriptions(deps: SubscriptionDeps): Promise<SubscriptionRound> {
  const round: SubscriptionRound = { checked: 0, sent: 0, failed: 0 };
  if (!deps.store.listDueSubscriptions || !deps.store.updateSubscription) return round;
  const now = deps.now?.() ?? new Date();
  const due = await deps.store.listDueSubscriptions(new Date(now.getTime() - SUBSCRIPTION_INTERVAL_MS).toISOString(), BATCH);

  for (const subscription of due) {
    round.checked += 1;
    const oldest = new Date(now.getTime() - MAX_CURSOR_LAG_MS).toISOString();
    const cursor = subscription.cursorAt > oldest ? subscription.cursorAt : oldest;
    try {
      const { leads: found, until } = await deps.leadsForUser(subscription.userId, subscription.filters, cursor, DIGEST_MAX_LEADS + 1);
      const fresh = found.filter((lead) => lead.createdAt > cursor && lead.createdAt <= until);
      const leads = fresh.slice(0, DIGEST_MAX_LEADS);
      const more = fresh.length > DIGEST_MAX_LEADS;
      const nextCursor = until > cursor ? until : cursor;
      if (!leads.length) {
        await deps.store.updateSubscription(subscription.id, { checkedAt: now.toISOString(), cursorAt: nextCursor });
        continue;
      }
      const outcome = subscription.channel === 'webhook'
        ? await sendWebhook(deps, subscription, leads, more)
        : await sendTelegram(deps, subscription, leads, more);
      await deps.store.updateSubscription(subscription.id, {
        checkedAt: now.toISOString(),
        cursorAt: nextCursor,
        ...(outcome === 'sent' ? { lastSentAt: now.toISOString(), failures: 0, lastError: undefined } : {}),
      });
      if (outcome === 'sent') round.sent += 1;
    } catch (error) {
      round.failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      const failures = subscription.failures + 1;
      // A blocked bot is not retried: the cursor moves on and the user re-links when they want.
      const blocked = error instanceof DeliveryError && error.blocked;
      await deps.store.updateSubscription(subscription.id, {
        checkedAt: now.toISOString(),
        failures,
        lastError: message.slice(0, 300),
        paused: failures >= MAX_DELIVERY_FAILURES ? true : subscription.paused,
        ...(blocked ? { cursorAt: now.toISOString() } : {}),
      });
      deps.logger.warn('subscription delivery failed', { id: subscription.id, channel: subscription.channel, error: message });
    }
  }
  return round;
}

/** Secret Telegram sends in X-Telegram-Bot-Api-Secret-Token, derived from the hub's own secret. */
export function telegramWebhookSecret(hubSecret: string): string {
  return createHmac('sha256', hubSecret).update('telegram-webhook').digest('hex').slice(0, 48);
}

interface TelegramUpdate {
  message?: { chat?: { id?: number | string; type?: string }; text?: string };
}

/**
 * The bot's whole conversation: «/start <code>» links the chat to the account that made the
 * code in its profile, «/stop» unlinks it. Only private chats are linked.
 */
export async function handleTelegramUpdate(
  update: TelegramUpdate,
  deps: Pick<SubscriptionDeps, 'store' | 'env' | 'fetchImpl' | 'now' | 'logger'>,
): Promise<void> {
  const token = deps.env.TELEGRAM_BOT_TOKEN;
  const chat = update.message?.chat;
  const text = (update.message?.text ?? '').trim();
  if (!token || !chat?.id || chat.type !== 'private') return;
  const chatId = String(chat.id);
  const publicUrl = (deps.env.RADAR_PUBLIC_URL ?? 'https://openradar.fun').replace(/\/$/, '');
  const reply = (message: string) => telegramApi(token, 'sendMessage', { chat_id: chatId, text: message, disable_web_page_preview: true }, deps.fetchImpl);

  const start = /^\/start(?:@\w+)?\s+([A-Za-z0-9_-]{8,64})$/.exec(text);
  if (start) {
    const userId = await deps.store.linkTelegramChat?.(start[1]!, chatId, (deps.now?.() ?? new Date()).toISOString());
    await reply(userId
      ? 'Готово: Telegram подключён. Новые заказы по вашим подпискам будут приходить сюда не чаще раза в 15 минут. Отключить: /stop.'
      : `Код не подошёл или устарел. Получите новый на ${publicUrl}/me#subscriptions`);
    return;
  }
  if (/^\/stop(?:@\w+)?$/.test(text)) {
    const userId = await deps.store.unlinkTelegramChat?.(chatId);
    await reply(userId ? 'Отключено: сообщения больше не придут. Подключить снова можно в профиле.' : 'Этот чат не был подключён.');
    return;
  }
  await reply(`Это бот подписок openradar. Подключите его в профиле: ${publicUrl}/me#subscriptions`);
}

/** Points the bot's webhook at the hub; returns the bot's username for t.me links. */
export async function setupSubscriptionBot(
  deps: Pick<SubscriptionDeps, 'env' | 'fetchImpl' | 'logger'>,
  hubSecret: string,
): Promise<string | undefined> {
  const token = deps.env.TELEGRAM_BOT_TOKEN;
  const publicUrl = deps.env.RADAR_PUBLIC_URL?.replace(/\/$/, '');
  if (!deps.env.RADAR_SUBSCRIPTION_BOT || !token || !publicUrl) return undefined;
  const me = await telegramApi(token, 'getMe', {}, deps.fetchImpl);
  const hook = await telegramApi(token, 'setWebhook', {
    url: `${publicUrl}/api/telegram/webhook`,
    secret_token: telegramWebhookSecret(hubSecret),
    allowed_updates: ['message'],
  }, deps.fetchImpl);
  if (!hook.ok) deps.logger.warn('telegram webhook not set', { status: hook.status, description: hook.description });
  return (me.result as { username?: string } | undefined)?.username;
}
