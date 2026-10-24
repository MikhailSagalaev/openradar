import { describe, expect, it, afterEach } from 'vitest';
import { createServer, type Server } from 'node:http';
import { createHash } from 'node:crypto';
import { RelayPool } from '../src/net/relay-pool.ts';
import { generateKeyPair } from '../src/net/keys.ts';
import { buildRadarLeadEvent, RadarEventKinds } from '../src/net/protocol.ts';

interface MockRelayServer {
  server: Server;
  port: number;
  url: string;
  receivedEvents: any[];
  receivedReqs: any[];
  close: () => Promise<void>;
}

function startMockRelay(): Promise<MockRelayServer> {
  return new Promise((resolve) => {
    const receivedEvents: any[] = [];
    const receivedReqs: any[] = [];
    const sockets = new Set<any>();

    const server = createServer();
    server.on('upgrade', (req, socket) => {
      sockets.add(socket);
      const key = req.headers['sec-websocket-key'];
      const accept = createHash('sha1')
        .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
        .digest('base64');

      socket.write(
        'HTTP/1.1 101 Switching Protocols\r\n' +
          'Upgrade: websocket\r\n' +
          'Connection: Upgrade\r\n' +
          'Sec-WebSocket-Accept: ' +
          accept +
          '\r\n\r\n',
      );

      socket.on('data', (buf: Buffer) => {
        let offset = 2;
        let len = buf[1]! & 0x7f;
        if (len === 126) {
          len = buf.readUInt16BE(2);
          offset = 4;
        }
        const mask = buf.subarray(offset, offset + 4);
        offset += 4;
        const payload = Buffer.alloc(len);
        for (let i = 0; i < len; i++) {
          payload[i] = buf[offset + i]! ^ mask[i % 4]!;
        }

        try {
          const msg = JSON.parse(payload.toString('utf8'));
          if (Array.isArray(msg)) {
            if (msg[0] === 'EVENT') {
              const ev = msg[1];
              receivedEvents.push(ev);
              // Send ["OK", <id>, true, ""]
              const okResp = Buffer.from(JSON.stringify(['OK', ev.id, true, '']));
              const header = Buffer.from([0x81, okResp.length]);
              socket.write(Buffer.concat([header, okResp]));
            } else if (msg[0] === 'REQ') {
              receivedReqs.push(msg);
            }
          }
        } catch {}
      });

      socket.on('close', () => sockets.delete(socket));
    });

    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as any).port;
      resolve({
        server,
        port,
        url: `ws://127.0.0.1:${port}`,
        receivedEvents,
        receivedReqs,
        close: () =>
          new Promise((done) => {
            for (const s of sockets) {
              try {
                s.destroy();
              } catch {}
            }
            server.close(() => done());
          }),
      });
    });
  });
}

describe('Nostr RelayPool (NIP-01 multi-relay client)', () => {
  let mock1: MockRelayServer | undefined;
  let mock2: MockRelayServer | undefined;
  let pool: RelayPool | undefined;

  afterEach(async () => {
    if (pool) {
      await pool.close();
      pool = undefined;
    }
    if (mock1) {
      await mock1.close();
      mock1 = undefined;
    }
    if (mock2) {
      await mock2.close();
      mock2 = undefined;
    }
  });

  it('connects to multiple relays and tracks connection status', async () => {
    mock1 = await startMockRelay();
    mock2 = await startMockRelay();

    pool = new RelayPool({
      relays: [mock1.url, mock2.url],
      autoReconnect: false,
    });

    await pool.connect();
    const connected = pool.getConnectedRelays();
    expect(connected).toContain(mock1.url);
    expect(connected).toContain(mock2.url);
    expect(connected.length).toBe(2);
  });

  it('publishes event to all relays in parallel and collects confirmations', async () => {
    mock1 = await startMockRelay();
    mock2 = await startMockRelay();

    pool = new RelayPool({
      relays: [mock1.url, mock2.url],
      publishTimeoutMs: 2000,
      autoReconnect: false,
    });

    await pool.connect();

    const keys = generateKeyPair();
    const event = buildRadarLeadEvent({
      contentHash: 'hash-abc',
      canonicalUrl: 'https://example.com/job/42',
      leadType: 'job',
      title: 'Senior Rust Developer',
      summary: 'Systems programming, async Tokio',
      pubkey: keys.pubKey,
      privKey: keys.privKey,
    });

    const result = await pool.publish(event);

    expect(result.ok).toBe(true);
    expect(result.publishedCount).toBe(2);
    expect(result.errors).toHaveLength(0);

    expect(mock1.receivedEvents).toHaveLength(1);
    expect(mock1.receivedEvents[0].id).toBe(event.id);
    expect(mock2.receivedEvents).toHaveLength(1);
    expect(mock2.receivedEvents[0].id).toBe(event.id);
  });

  it('subscribes with NIP-01 filter and dispatches REQ to connected relays', async () => {
    mock1 = await startMockRelay();
    mock2 = await startMockRelay();

    pool = new RelayPool({
      relays: [mock1.url, mock2.url],
      autoReconnect: false,
    });

    await pool.connect();

    const unsub = pool.subscribe('test-sub', { kinds: [RadarEventKinds.RadarLead] }, () => {});

    // Allow REQ frames to arrive
    await new Promise((r) => setTimeout(r, 50));

    expect(mock1.receivedReqs).toHaveLength(1);
    expect(mock1.receivedReqs[0][0]).toBe('REQ');
    expect(mock1.receivedReqs[0][1]).toBe('test-sub');

    expect(mock2.receivedReqs).toHaveLength(1);
    expect(mock2.receivedReqs[0][1]).toBe('test-sub');

    unsub();
  });
});
