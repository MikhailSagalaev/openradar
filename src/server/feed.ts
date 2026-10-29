/**
 * openradar - Saved Search RSS 2.0 Feed Generator
 */

import { isHttpUrl } from '../core/url.ts';
import type { Lead } from '../core/types.ts';

export function renderRssFeed(options: {
  leads: Lead[];
  title: string;
  baseUrl: string;
  feedUrl: string;
}): string {
  const { leads, title, baseUrl, feedUrl } = options;

  const escapeXml = (str: string): string =>
    str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');

  const items = leads
    .map((lead) => {
      const pubDate = lead.publishedAt
        ? new Date(lead.publishedAt).toUTCString()
        : new Date(lead.createdAt).toUTCString();
      const link = lead.url && isHttpUrl(lead.url) ? lead.url : `${baseUrl}/leads/${encodeURIComponent(lead.id)}`;
      const leadTitle = escapeXml(lead.title.trim() || lead.text.slice(0, 80));
      // A raw "]]>" inside the text would close the CDATA section early
      const safeText = lead.text.replace(/\]\]>/g, ']]]]><![CDATA[>');
      return `    <item>
      <title>${leadTitle}</title>
      <link>${escapeXml(link)}</link>
      <guid isPermaLink="false">${escapeXml(lead.id)}</guid>
      <pubDate>${pubDate}</pubDate>
      <description><![CDATA[${safeText}]]></description>
    </item>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(title)}</title>
    <link>${escapeXml(baseUrl)}</link>
    <description>openradar — открытый децентрализованный агрегатор заказов и вакансий</description>
    <language>ru</language>
    <atom:link href="${escapeXml(feedUrl)}" rel="self" type="application/rss+xml" />
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${items}
  </channel>
</rss>`;
}
