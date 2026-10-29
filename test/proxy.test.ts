import { afterEach, describe, expect, it } from 'vitest';
import { sourceProxyUrl } from '../src/net/proxy.ts';

describe('source proxy', () => {
  const saved = process.env.RADAR_PROXY_URL;
  afterEach(() => {
    if (saved === undefined) delete process.env.RADAR_PROXY_URL;
    else process.env.RADAR_PROXY_URL = saved;
  });

  it('is opt-in per source', () => {
    process.env.RADAR_PROXY_URL = 'http://127.0.0.1:9080';
    expect(sourceProxyUrl({ url: 'https://example.com/rss' })).toBeUndefined();
    expect(sourceProxyUrl({ proxy: true })).toBe('http://127.0.0.1:9080');
    expect(sourceProxyUrl({ proxy: true, proxyUrl: 'http://proxy.local:8080' })).toBe('http://proxy.local:8080');
    delete process.env.RADAR_PROXY_URL;
    expect(sourceProxyUrl({ proxy: true })).toBeUndefined();
  });
});
