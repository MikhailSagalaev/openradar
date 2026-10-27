import { createHmac } from 'node:crypto';
import type { SinkAdapter } from '../core/types.ts';

export const webhookSink: SinkAdapter = {
  kind: 'webhook',
  async deliver(lead, ctx): Promise<void> {
    const url = ctx.env.WEBHOOK_URL;
    if (!url) throw new Error('WEBHOOK_URL is not configured');

    const body = JSON.stringify({
      event: 'lead.created',
      lead: {
        id: lead.id,
        sourceId: lead.sourceId,
        title: lead.title,
        text: lead.text,
        url: lead.url,
        city: lead.city,
        budget: lead.budget,
        publishedAt: lead.publishedAt,
        score: lead.score,
        createdAt: lead.createdAt,
      },
    });

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'x-radar-timestamp': timestamp,
    };

    if (ctx.env.WEBHOOK_SECRET) {
      headers['x-radar-secret'] = ctx.env.WEBHOOK_SECRET;
      const signature = createHmac('sha256', ctx.env.WEBHOOK_SECRET)
        .update(`${timestamp}.${body}`)
        .digest('hex');
      headers['x-radar-signature'] = signature;
    }

    const response = await ctx.fetchImpl(url, {
      method: 'POST',
      headers,
      body,
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      const respText = await response.text().catch(() => '');
      throw new Error(`Webhook ${response.status}: ${respText.slice(0, 300)}`);
    }
  },
};
