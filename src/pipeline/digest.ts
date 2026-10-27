import { escapeHtml, truncate } from '../core/text.ts';
import type { Env, Lead, Logger } from '../core/types.ts';
import type { Store } from '../core/store.ts';

export interface DigestDeps {
  store: Store;
  env: Env;
  logger: Logger;
  fetchImpl: typeof fetch;
}

export interface DigestSummary {
  sent: boolean;
  leads: number;
  skipped?: 'not_configured' | 'not_due' | 'nothing_new' | 'send_failed';
}

let lastDigestAt: number | undefined;

export function formatDigestMessage(leads: Lead[], hours: number, publicUrl?: string): string {
  const lines = leads.map((lead) => {
    const link =
      publicUrl
        ? `<a href="${escapeHtml(`${publicUrl}/leads/${escapeHtml(lead.id)}`)}">${escapeHtml(truncate(lead.title, 90))}</a>`
        : `<b>${escapeHtml(truncate(lead.title, 90))}</b>`;
    const meta = [
      lead.city,
      typeof lead.budget === 'number'
        ? `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(lead.budget)} ₽`
        : undefined,
      lead.type === 'job' ? 'вакансия' : 'заказ',
    ]
      .filter(Boolean)
      .join(' · ');
    return `• ${link}${meta ? ` — ${escapeHtml(meta)}` : ''}`;
  });
  return `<b>OpenRadar — лучшие заказы за ${hours} ч</b>\n\n${lines.join('\n')}\n\n<a href="${escapeHtml(publicUrl ?? 'https://openradar.fun')}">Все заказы и поиск</a>`;
}

/**
 * Periodic Telegram digest: top fresh leads every RADAR_DIGEST_INTERVAL_HOURS.
 * Enabled when RADAR_DIGEST_CHAT_ID and TELEGRAM_BOT_TOKEN are configured.
 * The first tick only sets the baseline so a fresh deploy does not resend history.
 */
export async function runDigestIfDue(deps: DigestDeps): Promise<DigestSummary> {
  const chatId = deps.env.RADAR_DIGEST_CHAT_ID;
  const token = deps.env.TELEGRAM_BOT_TOKEN;
  if (!chatId || !token) return { sent: false, leads: 0, skipped: 'not_configured' };

  const intervalHours = deps.env.RADAR_DIGEST_INTERVAL_HOURS ?? 6;
  const intervalMs = intervalHours * 3_600_000;
  const now = Date.now();
  if (lastDigestAt === undefined) {
    lastDigestAt = now;
    return { sent: false, leads: 0, skipped: 'not_due' };
  }
  if (now - lastDigestAt < intervalMs) return { sent: false, leads: 0, skipped: 'not_due' };

  const since = new Date(lastDigestAt).toISOString();
  lastDigestAt = now;

  const fresh = (await deps.store.listLeads({ limit: 200 }))
    .filter(
      (lead) =>
        lead.createdAt >= since && lead.status !== 'rejected' && lead.status !== 'failed',
    );
  if (fresh.length === 0) return { sent: false, leads: 0, skipped: 'nothing_new' };

  const top = [...fresh].sort((a, b) => b.score - a.score).slice(0, 10);
  const text = formatDigestMessage(top, intervalHours, deps.env.RADAR_PUBLIC_URL);

  try {
    const response = await deps.fetchImpl(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      deps.logger.warn('digest send failed', { status: response.status, body: body.slice(0, 200) });
      return { sent: false, leads: top.length, skipped: 'send_failed' };
    }
    deps.logger.info('digest sent', { leads: top.length, since });
    return { sent: true, leads: top.length };
  } catch (error) {
    deps.logger.warn('digest send error', {
      error: error instanceof Error ? error.message : String(error),
    });
    return { sent: false, leads: top.length, skipped: 'send_failed' };
  }
}
