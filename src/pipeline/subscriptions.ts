import { fetch as undiciFetch } from 'undici';
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
import { getProxyAgent } from '../net/proxy.ts';
import { matchesSavedFilters } from '../server/filters.ts';
import { escapeHtml } from '../core/text.ts';

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

/**
 * A Bot API call. The hub in Russia cannot reach api.telegram.org directly, so the call goes
 * through RADAR_PROXY_URL when it is set; the host is fixed, so the proxy adds no SSRF surface.
 */
export async function telegramApi(
  env: Pick<Env, 'TELEGRAM_BOT_TOKEN' | 'RADAR_PROXY_URL'>,
  method: string,
  body: Record<string, unknown>,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 10_000,
): Promise<{ ok: boolean; status: number; description?: string; result?: unknown }> {
  const init = {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  };
  const url = `${TELEGRAM_API}/bot${env.TELEGRAM_BOT_TOKEN}/${method}`;
  const proxy = env.RADAR_PROXY_URL?.trim();
  const response = proxy
    ? ((await undiciFetch(url, { ...init, dispatcher: getProxyAgent(proxy) })) as unknown as Response)
    : await fetchImpl(url, init);
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
  const result = await telegramApi(deps.env, 'sendMessage', {
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
 * Pushes a closure to every active subscription whose filter matches: the lead left the
 * active feed (closed, hidden as junk or scam). Delivery respects the owner's tier delay —
 * a lead they could not see yet is not announced as gone. A failed send counts toward the
 * pause threshold, as with digests; closures are never replayed.
 */
export async function deliverLeadClosedToSubscriptions(deps: SubscriptionDeps, lead: Lead, reason: string): Promise<SubscriptionRound> {
  const round: SubscriptionRound = { checked: 0, sent: 0, failed: 0 };
  if (!deps.store.listActiveSubscriptions || !deps.store.updateSubscription) return round;
  const now = deps.now?.() ?? new Date();
  const all = await deps.store.listActiveSubscriptions(1_000);
  for (const subscription of all) {
    if (!matchesSavedFilters(lead, subscription.filters)) continue;
    round.checked += 1;
    try {
      // The tier delay: leadsForUser returns the instant this user's view reaches (`until`).
      const { until } = await deps.leadsForUser(subscription.userId, subscription.filters, lead.createdAt, 1);
      if (lead.createdAt > until) continue;
      const outcome = subscription.channel === 'webhook'
        ? await sendClosedWebhook(deps, subscription, lead, reason, now)
        : await sendClosedTelegram(deps, subscription, lead, reason);
      await deps.store.updateSubscription(subscription.id, {
        ...(outcome === 'sent' ? { lastSentAt: now.toISOString(), failures: 0, lastError: undefined } : {}),
      });
      if (outcome === 'sent') round.sent += 1;
    } catch (error) {
      round.failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      const failures = subscription.failures + 1;
      await deps.store.updateSubscription(subscription.id, {
        failures,
        lastError: message.slice(0, 300),
        paused: failures >= MAX_DELIVERY_FAILURES ? true : subscription.paused,
      });
      deps.logger.warn('closure delivery failed', { id: subscription.id, channel: subscription.channel, error: message });
    }
  }
  return round;
}

async function sendClosedWebhook(deps: SubscriptionDeps, subscription: SubscriptionRecord, lead: Lead, reason: string, now: Date): Promise<'sent'> {
  if (!subscription.target || !subscription.secret) throw new DeliveryError('webhook: no URL');
  await assertSafeUrl(subscription.target);
  const body = JSON.stringify({
    event: 'lead.closed',
    subscription: { id: subscription.id, name: subscription.name },
    lead: { ...deps.projectLead(lead, subscription.userId), state: reason },
    closedAt: now.toISOString(),
    reason,
  });
  const timestamp = String(Math.floor(now.getTime() / 1000));
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

async function sendClosedTelegram(deps: SubscriptionDeps, subscription: SubscriptionRecord, lead: Lead, reason: string): Promise<'sent' | 'skipped'> {
  const token = deps.env.TELEGRAM_BOT_TOKEN;
  const chatId = await deps.store.getTelegramChat?.(subscription.userId);
  if (!token || !deps.env.RADAR_SUBSCRIPTION_BOT || !chatId) return 'skipped';
  const publicUrl = (deps.env.RADAR_PUBLIC_URL ?? 'https://openradar.fun').replace(/\/$/, '');
  const reasonText = reason.startsWith('hidden_scam') ? 'мошенники' : reason.startsWith('hidden_junk') ? 'мусор' : 'закрыт участниками';
  const result = await telegramApi(deps.env, 'sendMessage', {
    chat_id: chatId,
    text: `🚫 <b>Закрыт</b>: <a href="${publicUrl}/leads/${lead.id}">${escapeHtml(lead.title.slice(0, 120))}</a>
${reasonText}`,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
  }, deps.fetchImpl);
  if (result.status === 403) {
    await deps.store.unlinkTelegramChat?.(chatId);
    throw new DeliveryError(`telegram: ${result.description ?? 'blocked'}`, true);
  }
  if (!result.ok) throw new DeliveryError(`telegram: ${result.status} ${result.description ?? ''}`.trim());
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

interface TelegramUpdate {
  update_id?: number;
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
  const reply = (message: string) => telegramApi(deps.env, 'sendMessage', { chat_id: chatId, text: message, disable_web_page_preview: true }, deps.fetchImpl);

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

/** Seconds Telegram holds a getUpdates call open while waiting for a message. */
const LONG_POLL_SECONDS = 25;

/**
 * The bot's username for t.me links, after removing any webhook: the bot reads its messages by
 * long polling, an outgoing call. Telegram does not have to reach the hub, which a server in
 * Russia cannot promise, and the hub has no endpoint for the bot to protect.
 */
export async function setupSubscriptionBot(deps: Pick<SubscriptionDeps, 'env' | 'fetchImpl' | 'logger'>): Promise<string | undefined> {
  if (!deps.env.RADAR_SUBSCRIPTION_BOT || !deps.env.TELEGRAM_BOT_TOKEN) return undefined;
  const me = await telegramApi(deps.env, 'getMe', {}, deps.fetchImpl, 30_000);
  if (!me.ok) throw new Error(`getMe: ${me.status} ${me.description ?? ''}`.trim());
  await telegramApi(deps.env, 'deleteWebhook', {}, deps.fetchImpl, 30_000);
  return (me.result as { username?: string } | undefined)?.username;
}

/**
 * One long-poll round: waits up to LONG_POLL_SECONDS for messages, handles them, and returns
 * the offset of the next round. Telegram drops confirmed updates once the next offset is sent.
 */
export async function pollTelegramUpdates(
  deps: Pick<SubscriptionDeps, 'store' | 'env' | 'fetchImpl' | 'now' | 'logger'>,
  offset: number | undefined,
): Promise<number | undefined> {
  const result = await telegramApi(deps.env, 'getUpdates', {
    timeout: LONG_POLL_SECONDS,
    allowed_updates: ['message'],
    ...(offset === undefined ? {} : { offset }),
  }, deps.fetchImpl, (LONG_POLL_SECONDS + 15) * 1000);
  if (!result.ok) throw new Error(`getUpdates: ${result.status} ${result.description ?? ''}`.trim());
  let next = offset;
  for (const update of (result.result as TelegramUpdate[] | undefined) ?? []) {
    if (typeof update.update_id === 'number') next = Math.max(next ?? 0, update.update_id + 1);
    try {
      await handleTelegramUpdate(update, deps);
    } catch (error) {
      deps.logger.warn('telegram update failed', { error: error instanceof Error ? error.message : String(error) });
    }
  }
  return next;
}

/** Long-polls the bot until `signal` aborts; a failed round waits 30 s before the next. */
export async function runTelegramPolling(
  deps: Pick<SubscriptionDeps, 'store' | 'env' | 'fetchImpl' | 'now' | 'logger'>,
  signal: AbortSignal,
): Promise<void> {
  let offset: number | undefined;
  while (!signal.aborted) {
    try {
      offset = await pollTelegramUpdates(deps, offset);
    } catch (error) {
      deps.logger.warn('telegram polling failed', { error: error instanceof Error ? error.message : String(error) });
      await new Promise((resolve) => setTimeout(resolve, 30_000));
    }
  }
}
