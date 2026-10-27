import { generateKeyPair, importPrivateKey, type KeyPair } from './net/keys.ts';
import {
  buildHttpAuthHeader,
  buildObservationEvent,
  buildSignalEvent,
  buildStatusEvent,
  RadarKinds,
  signEvent,
  type NostrEvent,
  type PostStatus,
  type SignalType,
} from './net/protocol.ts';

/**
 * radar/2 client for TypeScript / JavaScript parsers (docs/PROTOCOL.md).
 *
 *   const hub = new HubClient('https://openradar.fun', process.env.RADAR_KEY!);
 *   await hub.observe([{ source: { platform: 'telegram', channel: '-100123', message_id: '5' }, text: '...' }]);
 */

export interface ObservationInput {
  source: { platform: string; channel: string; channel_title?: string | null; visibility?: 'public' | 'private' | 'invite'; message_id?: string | number | null; url?: string | null };
  text: string;
  [key: string]: unknown;
}

export interface EventResult {
  id?: string;
  status: string;
  leadId?: string;
  merged?: boolean;
}

export class RadarHttpError extends Error {
  constructor(readonly status: number, readonly body: unknown) {
    super(`HTTP ${status}: ${typeof body === 'string' ? body : JSON.stringify(body)}`);
  }
}

async function call(fetchImpl: typeof fetch, url: string, init: RequestInit): Promise<any> {
  const res = await fetchImpl(url, init);
  const text = await res.text();
  let body: unknown = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    // keep text
  }
  if (!res.ok) throw new RadarHttpError(res.status, body);
  return body;
}

const BATCH = 500;

export class HubClient {
  readonly key: KeyPair;
  private readonly base: string;

  /** `key`: hex or nsec; omit to generate a new one (save `client.key.nsec`). */
  constructor(url: string, key?: string, private readonly fetchImpl: typeof fetch = fetch) {
    this.base = url.replace(/\/+$/, '');
    this.key = key ? importPrivateKey(key) : generateKeyPair();
  }

  private signed(path: string, method: string, body?: string): RequestInit {
    const headers: Record<string, string> = {
      accept: 'application/json',
      authorization: buildHttpAuthHeader({ url: this.base + path, method, body }, this.key.privKey),
    };
    if (body !== undefined) headers['content-type'] = 'application/json';
    return { method, headers, body };
  }

  async send(events: NostrEvent[]): Promise<EventResult[]> {
    const results: EventResult[] = [];
    for (let i = 0; i < events.length; i += BATCH) {
      const body = await call(this.fetchImpl, `${this.base}/v2/events`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(events.slice(i, i + BATCH)),
      });
      results.push(...(body.results as EventResult[]));
    }
    return results;
  }

  observe(observations: ObservationInput[]): Promise<EventResult[]> {
    return this.send(observations.map((o) => buildObservationEvent(o, this.key.privKey)));
  }

  async signal(leadId: string, signal: SignalType, comment?: string): Promise<EventResult> {
    return (await this.send([buildSignalEvent({ leadId, signal, comment }, this.key.privKey)]))[0]!;
  }

  async status(p: { platform: string; channel: string; messageId: string; status: PostStatus }): Promise<EventResult> {
    return (await this.send([buildStatusEvent(p, this.key.privKey)]))[0]!;
  }

  async setProfile(profile: Record<string, unknown>): Promise<EventResult> {
    const event = signEvent({ kind: RadarKinds.Profile, tags: [], content: JSON.stringify(profile) }, this.key.privKey);
    return (await this.send([event]))[0]!;
  }

  me(): Promise<any> {
    return call(this.fetchImpl, `${this.base}/v2/me`, this.signed('/v2/me', 'GET'));
  }

  feed(options: { cursor?: string; limit?: number; q?: string; type?: 'job' | 'gig' } = {}): Promise<any> {
    const params = new URLSearchParams();
    params.set('limit', String(options.limit ?? 50));
    if (options.cursor) params.set('cursor', options.cursor);
    if (options.q) params.set('q', options.q);
    if (options.type) params.set('type', options.type);
    const path = `/v2/feed?${params.toString()}`;
    return call(this.fetchImpl, this.base + path, this.signed(path, 'GET'));
  }

  lead(id: string): Promise<any> {
    const path = `/v2/leads/${encodeURIComponent(id)}`;
    return call(this.fetchImpl, this.base + path, this.signed(path, 'GET'));
  }
}

export interface PushSummary {
  received: number;
  accepted: number;
  duplicate: number;
  rejected: number;
  outcomes: Array<{ status: string; leadId?: string; reasons: string[] }>;
}

/** Pushes observations to your own node through a webhook source token. */
export class NodeClient {
  private readonly base: string;

  constructor(url: string, private readonly sourceId: string, private readonly token: string, private readonly fetchImpl: typeof fetch = fetch) {
    this.base = url.replace(/\/+$/, '');
  }

  async push(observations: ObservationInput[]): Promise<PushSummary> {
    const summary: PushSummary = { received: 0, accepted: 0, duplicate: 0, rejected: 0, outcomes: [] };
    for (let i = 0; i < observations.length; i += BATCH) {
      const body = await call(this.fetchImpl, `${this.base}/api/v2/ingest/${encodeURIComponent(this.sourceId)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-radar-token': this.token },
        body: JSON.stringify(observations.slice(i, i + BATCH)),
      });
      summary.received += body.received ?? 0;
      summary.accepted += body.accepted ?? 0;
      summary.duplicate += body.duplicate ?? 0;
      summary.rejected += body.rejected ?? 0;
      summary.outcomes.push(...(body.outcomes ?? []));
    }
    return summary;
  }
}
