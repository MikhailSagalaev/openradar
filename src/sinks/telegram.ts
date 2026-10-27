import { escapeHtml, truncate } from '../core/text.ts';
import type { Lead, SinkAdapter } from '../core/types.ts';

function formatMessage(lead: Lead): string {
  const meta = [
    lead.city,
    typeof lead.budget === 'number'
      ? `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(lead.budget)} ₽`
      : undefined,
  ]
    .filter(Boolean)
    .join(' · ');

  const lines = [
    '<b>Новый заказ</b>',
    `<b>${escapeHtml(lead.title)}</b>`,
    escapeHtml(truncate(lead.text, 900)),
    meta ? escapeHtml(meta) : '',
    lead.url ? `<a href="${escapeHtml(lead.url)}">Открыть источник</a>` : '',
  ].filter(Boolean);

  return lines.join('\n\n');
}

export const telegramSink: SinkAdapter = {
  kind: 'telegram',
  async deliver(lead, ctx): Promise<void> {
    const token = ctx.env.TELEGRAM_BOT_TOKEN;
    const chatId = ctx.env.TELEGRAM_CHAT_ID;
    if (!token || !chatId) {
      throw new Error('TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are required');
    }

    const response = await ctx.fetchImpl(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: formatMessage(lead),
          parse_mode: 'HTML',
          disable_web_page_preview: false,
        }),
        signal: AbortSignal.timeout(15_000),
      },
    );

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Telegram API ${response.status}: ${body.slice(0, 300)}`);
    }
  },
};
