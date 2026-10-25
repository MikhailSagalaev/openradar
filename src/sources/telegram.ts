import * as cheerio from 'cheerio';
import { createHash } from 'node:crypto';
import { firstLine } from '../core/text.ts';
import type { RawLead, SourceAdapter } from '../core/types.ts';
import { fetchText } from './http.ts';
import { fetchTextViaProxy, resolveProxyUrl } from '../net/proxy.ts';

function normalizeChannel(value: string): string {
  return value
    .trim()
    .replace(/^https?:\/\/t\.me\/(s\/)?/i, '')
    .replace(/^@/, '')
    .replace(/\/+$/, '');
}

export const telegramSource: SourceAdapter = {
  kind: 'telegram',
  access: 'public',
  description:
    'Public Telegram channel through the t.me/s/ preview. Read-only, no account required.',
  risks: [
    'Telegram may rate-limit or change the preview markup',
    'private channels are not readable this way',
    'the preview is a sample, not a guaranteed full history',
  ],
  async poll(source, ctx): Promise<RawLead[]> {
    const rawChannel =
      typeof source.config.channel === 'string'
        ? source.config.channel
        : typeof source.config.url === 'string'
          ? source.config.url
          : '';
    const channel = normalizeChannel(rawChannel);
    if (!channel) throw new Error('Telegram source requires config.channel');

    // RADAR_PROXY_URL (or per-source config.proxyUrl) routes the fetch through
    // a proxy: required on hosts where t.me is network-blocked.
    const proxyUrl = resolveProxyUrl(source.config);
    const html = proxyUrl
      ? await fetchTextViaProxy(`https://t.me/s/${channel}`, {
          proxyUrl,
          userAgent: ctx.userAgent,
          timeoutMs: ctx.timeoutMs,
        })
      : await fetchText(ctx, `https://t.me/s/${channel}`);
    const $ = cheerio.load(html);
    const channelTitle = $('.tgme_channel_info_header_title').text().trim() || channel;
    const limit = Math.max(1, Math.min(Number(source.config.limit ?? 30), 100));
    const leads: RawLead[] = [];

    $('.tgme_widget_message_wrap').each((_index, element) => {
      if (leads.length >= limit) return;
      const message = $(element).find('.tgme_widget_message');
      const text = $(element).find('.tgme_widget_message_text').text().trim();
      if (!text) return;

      const postAttr = message.attr('data-post') ?? '';
      const postId = postAttr.includes('/') ? postAttr.split('/').pop() : undefined;
      const hash = createHash('sha1').update(text).digest('hex').slice(0, 10);
      const publishedAt = $(element).find('time').attr('datetime') ?? undefined;

      leads.push({
        sourceId: source.id,
        externalId: `tg:${channel}:${postId || hash}`,
        url: postAttr ? `https://t.me/${postAttr}` : `https://t.me/${channel}`,
        title: firstLine(text, 140),
        text,
        author: channelTitle,
        publishedAt,
        raw: { channel, postId },
      });
    });

    return leads;
  },
};
