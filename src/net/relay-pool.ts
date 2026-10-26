/**
 * OpenRadar Nostr Relay Pool.
 * Lightweight NIP-01 WebSocket pool for multi-relay broadcast, failover, and subscription.
 * Uses native Node 22+ WebSocket global.
 */

import type { NostrEvent } from './protocol.ts';

export interface NostrFilter {
  ids?: string[];
  authors?: string[];
  kinds?: number[];
  '#e'?: string[];
  '#p'?: string[];
  '#d'?: string[];
  '#t'?: string[];
  '#v'?: string[];
  since?: number;
  until?: number;
  limit?: number;
}

export interface RelayConnection {
  url: string;
  ws: WebSocket | null;
  status: 'disconnected' | 'connecting' | 'connected' | 'error';
  reconnectAttempts: number;
  reconnectTimer?: ReturnType<typeof setTimeout>;
}

export interface PublishResult {
  ok: boolean;
  publishedCount: number;
  errors: Array<{ relay: string; error: string }>;
}

export interface RelayPoolOptions {
  relays?: string[];
  autoReconnect?: boolean;
  publishTimeoutMs?: number;
  WebSocketClass?: typeof WebSocket;
}

export const DEFAULT_RELAYS = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.openradar.fun',
];

export class RelayPool {
  private relayUrls: string[];
  private connections = new Map<string, RelayConnection>();
  private subscriptions = new Map<
    string,
    { filter: NostrFilter; onEvent: (event: NostrEvent, relayUrl: string) => void }
  >();
  private autoReconnect: boolean;
  private publishTimeoutMs: number;
  private WebSocketClass: typeof WebSocket;
  private isClosed = false;

  constructor(options?: RelayPoolOptions) {
    this.relayUrls = options?.relays && options.relays.length > 0 ? options.relays : DEFAULT_RELAYS;
    this.autoReconnect = options?.autoReconnect ?? true;
    this.publishTimeoutMs = options?.publishTimeoutMs ?? 4000;
    this.WebSocketClass = options?.WebSocketClass ?? globalThis.WebSocket;
  }

  /**
   * Connects to all relays in the pool.
   */
  async connect(): Promise<void> {
    this.isClosed = false;
    const connectPromises = this.relayUrls.map((url) => this.connectRelay(url));
    await Promise.allSettled(connectPromises);
  }

  private connectRelay(url: string): Promise<void> {
    if (this.isClosed) return Promise.resolve();

    let conn = this.connections.get(url);
    if (!conn) {
      conn = {
        url,
        ws: null,
        status: 'disconnected',
        reconnectAttempts: 0,
      };
      this.connections.set(url, conn);
    }

    if (conn.status === 'connected' || conn.status === 'connecting') {
      return Promise.resolve();
    }

    conn.status = 'connecting';

    return new Promise((resolve) => {
      try {
        const ws = new this.WebSocketClass(url);
        conn!.ws = ws;

        ws.onopen = () => {
          conn!.status = 'connected';
          conn!.reconnectAttempts = 0;
          // Re-subscribe to active subscriptions on reconnect
          for (const [subId, sub] of this.subscriptions.entries()) {
            this.sendToWs(ws, ['REQ', subId, sub.filter]);
          }
          resolve();
        };

        ws.onmessage = (ev) => {
          this.handleRelayMessage(url, ev.data);
        };

        ws.onerror = () => {
          conn!.status = 'error';
          resolve();
        };

        ws.onclose = () => {
          conn!.status = 'disconnected';
          conn!.ws = null;
          if (this.autoReconnect && !this.isClosed) {
            this.scheduleReconnect(conn!);
          }
        };
      } catch {
        conn.status = 'error';
        if (this.autoReconnect && !this.isClosed) {
          this.scheduleReconnect(conn);
        }
        resolve();
      }
    });
  }

  private scheduleReconnect(conn: RelayConnection): void {
    if (this.isClosed) return;
    if (conn.reconnectTimer) clearTimeout(conn.reconnectTimer);

    // Exponential backoff: 1s, 2s, 4s, 8s, max 30s
    const delay = Math.min(30000, 1000 * Math.pow(2, conn.reconnectAttempts));
    conn.reconnectAttempts++;

    conn.reconnectTimer = setTimeout(() => {
      if (!this.isClosed) {
        this.connectRelay(conn.url).catch(() => {});
      }
    }, delay);
  }

  private sendToWs(ws: WebSocket | null, payload: unknown): boolean {
    if (!ws || ws.readyState !== ws.OPEN) return false;
    try {
      ws.send(JSON.stringify(payload));
      return true;
    } catch {
      return false;
    }
  }

  private handleRelayMessage(relayUrl: string, rawData: unknown): void {
    if (typeof rawData !== 'string') return;
    try {
      const parsed = JSON.parse(rawData);
      if (!Array.isArray(parsed) || parsed.length < 2) return;

      const type = parsed[0];
      if (type === 'EVENT' && parsed.length >= 3) {
        const subId = parsed[1] as string;
        const event = parsed[2] as NostrEvent;
        const sub = this.subscriptions.get(subId);
        if (sub && event && typeof event.kind === 'number') {
          sub.onEvent(event, relayUrl);
        }
      }
    } catch {
      // Ignore malformed JSON from relay
    }
  }

  /**
   * Publishes an event to all available relays in parallel.
   * Resolves with count of successful relays and detailed errors.
   */
  async publish(event: NostrEvent, timeoutMs?: number): Promise<PublishResult> {
    const timeout = timeoutMs ?? this.publishTimeoutMs;
    const errors: Array<{ relay: string; error: string }> = [];
    let publishedCount = 0;

    const targets = Array.from(this.connections.values());
    if (targets.length === 0) {
      return { ok: false, publishedCount: 0, errors: [{ relay: 'pool', error: 'No relays configured' }] };
    }

    const promises = targets.map((conn) => {
      return new Promise<boolean>((resolve) => {
        if (conn.status !== 'connected' || !conn.ws || conn.ws.readyState !== conn.ws.OPEN) {
          errors.push({ relay: conn.url, error: 'Relay is not connected' });
          return resolve(false);
        }

        let isResolved = false;
        const timer = setTimeout(() => {
          if (!isResolved) {
            isResolved = true;
            // Many Nostr relays accept the event without immediate OK; if sent successfully, treat as dispatched
            resolve(true);
          }
        }, timeout);

        const originalOnMessage = conn.ws.onmessage;
        conn.ws.onmessage = (ev) => {
          if (typeof ev.data === 'string') {
            try {
              const msg = JSON.parse(ev.data);
              // NIP-01: ["OK", <event_id>, <true|false>, <message>]
              if (Array.isArray(msg) && msg[0] === 'OK' && msg[1] === event.id) {
                if (!isResolved) {
                  isResolved = true;
                  clearTimeout(timer);
                  conn.ws!.onmessage = originalOnMessage;
                  if (msg[2] === true) {
                    resolve(true);
                  } else {
                    errors.push({ relay: conn.url, error: String(msg[3] || 'Rejected by relay') });
                    resolve(false);
                  }
                  return;
                }
              }
            } catch {
              // Non-OK message handled by normal pipeline
            }
          }
          if (conn.ws) {
            originalOnMessage?.call(conn.ws, ev);
          }
        };

        const sent = this.sendToWs(conn.ws, ['EVENT', event]);
        if (!sent) {
          clearTimeout(timer);
          errors.push({ relay: conn.url, error: 'Failed to send payload' });
          resolve(false);
        }
      });
    });

    const results = await Promise.all(promises);
    for (const success of results) {
      if (success) publishedCount++;
    }

    return {
      ok: publishedCount > 0,
      publishedCount,
      errors,
    };
  }

  /**
   * Subscribes to events matching a filter across all relays in the pool.
   * Returns an unsubscribe function.
   */
  subscribe(
    subId: string,
    filter: NostrFilter,
    onEvent: (event: NostrEvent, relayUrl: string) => void,
  ): () => void {
    this.subscriptions.set(subId, { filter, onEvent });

    for (const conn of this.connections.values()) {
      if (conn.status === 'connected' && conn.ws) {
        this.sendToWs(conn.ws, ['REQ', subId, filter]);
      }
    }

    return () => {
      this.subscriptions.delete(subId);
      for (const conn of this.connections.values()) {
        if (conn.status === 'connected' && conn.ws) {
          this.sendToWs(conn.ws, ['CLOSE', subId]);
        }
      }
    };
  }

  /**
   * Returns list of connected relay URLs.
   */
  getConnectedRelays(): string[] {
    return Array.from(this.connections.values())
      .filter((c) => c.status === 'connected')
      .map((c) => c.url);
  }

  /**
   * Closes all relay connections and stops reconnect timers.
   */
  async close(): Promise<void> {
    this.isClosed = true;
    for (const conn of this.connections.values()) {
      if (conn.reconnectTimer) clearTimeout(conn.reconnectTimer);
      if (conn.ws) {
        try {
          conn.ws.close();
        } catch {}
        conn.ws = null;
      }
      conn.status = 'disconnected';
    }
    this.subscriptions.clear();
  }
}
