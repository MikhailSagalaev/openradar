import type { Lead, SinkAdapter, SourceRecord } from '../core/types.ts';
import { importPrivateKey } from '../net/keys.ts';
import { buildObservationEvent } from '../net/protocol.ts';

/**
 * Node -> hub: leads from sources marked `share` are signed with the node key
 * (RADAR_NODE_KEY) and sent to RADAR_HUB_URL as radar/2 observations (kind 4040).
 * Failed sends are retried by the outbox like any other sink.
 */

const PERIOD_BACK: Record<string, string> = { monthly: 'month', hourly: 'hour', fixed: 'fixed' };

/** The observation a node sends for one of its leads. `raw` and metadata never leave the node. */
export function leadToObservation(lead: Lead): Record<string, unknown> & { source: { platform: string; channel: string; [key: string]: unknown } } {
  const ref = lead.sourceRef;
  let fallbackChannel = `node:${lead.sourceId}`;
  if (lead.url) {
    try {
      fallbackChannel = new URL(lead.url).host || fallbackChannel;
    } catch {
      // keep the fallback
    }
  }
  const source = ref
    ? {
        platform: ref.platform,
        channel: ref.channel,
        channel_title: ref.channelTitle ?? null,
        visibility: ref.visibility,
        message_id: ref.messageId ?? null,
        url: lead.url ?? null,
      }
    : {
        platform: 'web',
        channel: fallbackChannel,
        visibility: 'public',
        message_id: lead.externalId ?? lead.fingerprint.slice(0, 32),
        url: lead.url ?? null,
      };
  return {
    schema: 'radar/2.observation',
    source,
    posted_at: lead.publishedAt ?? lead.createdAt,
    observed_at: lead.createdAt,
    author: { name: lead.author ?? null, contacts: lead.contacts ?? [] },
    title: lead.title,
    text: lead.text || lead.title,
    type: lead.type ?? null,
    budget: lead.budget !== undefined
      ? { max: lead.budget, currency: lead.currency ?? null, period: lead.paymentPeriod ? PERIOD_BACK[lead.paymentPeriod] ?? null : null }
      : null,
    skills: lead.skills?.length ? lead.skills.slice(0, 50) : null,
    location: { city: lead.city ?? null, remote: lead.isRemote ?? null },
  };
}

export function isSharedSource(source: Pick<SourceRecord, 'config'>): boolean {
  return source.config?.share === true;
}

export const hubSink: SinkAdapter = {
  kind: 'hub',
  accepts(lead, source) {
    return isSharedSource(source) && (lead.state ?? 'active') === 'active';
  },
  async deliver(lead, ctx): Promise<void> {
    const hubUrl = ctx.env.RADAR_HUB_URL;
    const nodeKey = ctx.env.RADAR_NODE_KEY;
    if (!hubUrl || !nodeKey) throw new Error('RADAR_HUB_URL and RADAR_NODE_KEY are required to share with the hub');
    const { privKey } = importPrivateKey(nodeKey);
    const event = buildObservationEvent(leadToObservation(lead), privKey);
    const response = await ctx.fetchImpl(new URL('/v2/events', hubUrl).toString(), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify([event]),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`hub ${response.status}: ${text.slice(0, 300)}`);
    }
    const body = (await response.json().catch(() => null)) as { results?: Array<{ status?: string }> } | null;
    const status = body?.results?.[0]?.status ?? 'missing';
    if (status !== 'accepted' && status !== 'duplicate') {
      // A rejection is final: retrying the same event would be rejected again.
      ctx.logger.warn('hub rejected observation', { leadId: lead.id, status });
    }
  },
};
