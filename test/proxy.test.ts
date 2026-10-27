import http from 'node:http';
import net from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fetchTextViaProxy, resolveProxyUrl } from '../src/net/proxy.ts';

let proxyServer: http.Server;
let proxyPort = 0;
let targetServer: http.Server;
let targetPort = 0;
let connectCount = 0;

beforeAll(async () => {
  // Minimal HTTP CONNECT proxy: tunnels TCP to the target host.
  // Plain-HTTP targets arrive as absolute-form requests; HTTPS ones as CONNECT.
  proxyServer = http.createServer((req, res) => {
    connectCount++;
    const upstream = http.get(String(req.url), (up) => {
      res.writeHead(up.statusCode ?? 502, up.headers);
      up.pipe(res);
    });
    upstream.on('error', () => res.destroy());
  });
  proxyServer.on('connect', (req, clientSocket, head) => {
    const [host, port] = String(req.url).split(':');
    connectCount++;
    const upstream = net.connect(Number(port) || 443, host!, () => {
      clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head?.length) upstream.write(head);
      upstream.pipe(clientSocket);
      clientSocket.pipe(upstream);
    });
    upstream.on('error', () => clientSocket.destroy());
    clientSocket.on('error', () => upstream.destroy());
  });
  await new Promise<void>((resolve) => {
    proxyServer.listen(0, '127.0.0.1', () => {
      proxyPort = (proxyServer.address() as { port: number }).port;
      resolve();
    });
  });
  // Local target: the test never leaves the machine.
  targetServer = http.createServer((_req, res) => res.end('<h1>Example Domain</h1>'));
  await new Promise<void>((resolve) => {
    targetServer.listen(0, '127.0.0.1', () => {
      targetPort = (targetServer.address() as { port: number }).port;
      resolve();
    });
  });
});

afterAll(() => {
  proxyServer.close();
  targetServer.close();
});

describe('outbound proxy support', () => {
  it('resolves per-source proxy over the env variable', () => {
    process.env.RADAR_PROXY_URL = 'http://env-proxy:8080';
    try {
      expect(resolveProxyUrl({ proxyUrl: 'http://source-proxy:3128' })).toBe('http://source-proxy:3128');
      expect(resolveProxyUrl({})).toBe('http://env-proxy:8080');
    } finally {
      delete process.env.RADAR_PROXY_URL;
    }
    expect(resolveProxyUrl({})).toBeUndefined();
  });

  it('fetches text through an HTTP CONNECT proxy', async () => {
    const text = await fetchTextViaProxy(`http://127.0.0.1:${targetPort}/`, {
      proxyUrl: `http://127.0.0.1:${proxyPort}`,
      userAgent: 'radar-proxy-test',
      timeoutMs: 15_000,
    });
    expect(text).toContain('Example Domain');
    expect(connectCount).toBeGreaterThanOrEqual(1);
  });
});
