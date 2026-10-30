import type { LedgerEntry, Store } from '../core/store.ts';
import { escapeHtml, truncate } from '../core/text.ts';
import type { Env, Logger } from '../core/types.ts';
import { telegramApi } from './subscriptions.ts';

/**
 * «Your lead was confirmed, +10»: a Telegram message to a user with a linked chat when the hourly
 * rating run credits (or takes) points for what they brought. Each credit is reported once:
 * `ledger_notices` remembers what was sent, because the ledger itself is rebuilt every hour.
 */
export interface PointsNotifyDeps {
  store: Store;
  env: Env;
  logger: Logger;
  fetchImpl?: typeof fetch;
  now?: () => Date;
  /** The participant keys whose credits belong to this account: its web key and a linked key. */
  pubkeysForUser(userId: number): Promise<string[]>;
}

/** People see points as the rating ×10, the same as the profile. */
const POINTS_SCALE = 10;
/** Credits of leads created this long before the chat was linked are old news. */
const LINK_GRACE_MS = 24 * 3600_000;
const RATING_WINDOW_MS = 30 * 24 * 3600_000;
/** Lines in one message; the rest are in the profile. */
const MAX_LINES = 15;

const KIND_LABELS: Record<LedgerEntry['kind'], string> = {
  first: 'вы нашли первым, заказ подтвердили',
  confirm: 'вы подтвердили заказ',
  signal_match: 'ваш голос совпал с итогом',
  hidden_first: 'ваш заказ скрыли как мусор',
  hidden_confirm: 'вы подтвердили заказ, который оказался мусором',
};

export function formatPointsMessage(entries: Array<LedgerEntry & { title?: string }>, publicUrl: string): string {
  const total = Math.round(entries.reduce((sum, e) => sum + e.points, 0) * POINTS_SCALE);
  const lines = entries.slice(0, MAX_LINES).map((e) => {
    const points = Math.round(e.points * POINTS_SCALE);
    const title = escapeHtml(truncate(e.title ?? 'заказ', 70));
    return `${points > 0 ? '+' : ''}${points} — ${escapeHtml(KIND_LABELS[e.kind] ?? e.kind)}: <a href="${escapeHtml(`${publicUrl}/leads/${e.leadId}`)}">${title}</a>`;
  });
  const more = entries.length > MAX_LINES ? `\n…и ещё ${entries.length - MAX_LINES}` : '';
  return `<b>openradar: ${total > 0 ? '+' : ''}${total} ${pluralPoints(Math.abs(total))}</b>\n\n${lines.join('\n')}${more}\n\n<a href="${escapeHtml(`${publicUrl}/me`)}">Профиль и уровень</a>`;
}

function pluralPoints(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'очко';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'очка';
  return 'очков';
}

export interface PointsRound {
  users: number;
  sent: number;
}

/** One round over every linked chat; run it after the hourly rating recompute. */
export async function notifyPoints(deps: PointsNotifyDeps): Promise<PointsRound> {
  const round: PointsRound = { users: 0, sent: 0 };
  const { store } = deps;
  if (!deps.env.RADAR_SUBSCRIPTION_BOT || !deps.env.TELEGRAM_BOT_TOKEN || !store.listTelegramLinks || !store.listLedgerNotices || !store.addLedgerNotices) return round;
  const now = deps.now?.() ?? new Date();
  const publicUrl = (deps.env.RADAR_PUBLIC_URL ?? 'https://openradar.fun').replace(/\/$/, '');

  for (const link of await store.listTelegramLinks()) {
    round.users += 1;
    const since = new Date(Math.max(now.getTime() - RATING_WINDOW_MS, Date.parse(link.linkedAt) - LINK_GRACE_MS)).toISOString();
    const pubkeys = await deps.pubkeysForUser(link.userId);
    const entries = (await Promise.all(pubkeys.map((key) => store.listLedger(key, since, 200)))).flat();
    const seen = await store.listLedgerNotices(link.userId);
    const fresh = entries.filter((e) => e.points !== 0 && !seen.has(`${e.leadId}:${e.kind}`));
    if (!fresh.length) continue;

    const titled = await Promise.all(fresh.map(async (e) => ({ ...e, title: (await store.getLead(e.leadId))?.title })));
    try {
      const result = await telegramApi(deps.env, 'sendMessage', {
        chat_id: link.chatId,
        text: formatPointsMessage(titled.sort((a, b) => b.points - a.points), publicUrl),
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }, deps.fetchImpl);
      if (result.status === 403) {
        await store.unlinkTelegramChat?.(link.chatId);
        continue;
      }
      if (!result.ok) throw new Error(`telegram: ${result.status} ${result.description ?? ''}`.trim());
      await store.addLedgerNotices(link.userId, fresh);
      round.sent += 1;
    } catch (error) {
      // Not recorded as sent: the next round tries again.
      deps.logger.warn('points notice failed', { userId: link.userId, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return round;
}
