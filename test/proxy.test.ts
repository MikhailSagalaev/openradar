import { afterEach, describe, expect, it } from 'vitest';
import { resolveProxyUrl, selectProxyUrl, sourceProxyUrl } from '../src/net/proxy.ts';

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

  it('rotates through comma-separated proxy list round-robin', () => {
    process.env.RADAR_PROXY_URL = 'http://127.0.0.1:9081, http://127.0.0.1:9082, http://127.0.0.1:9083';
    const first = resolveProxyUrl();
    const second = resolveProxyUrl();
    const third = resolveProxyUrl();
    const fourth = resolveProxyUrl();

    expect([first, second, third]).toEqual([
      'http://127.0.0.1:9081',
      'http://127.0.0.1:9082',
      'http://127.0.0.1:9083',
    ]);
    expect(fourth).toBe('http://127.0.0.1:9081');
  });

  it('handles empty or whitespace raw proxy strings', () => {
    expect(selectProxyUrl('')).toBe('');
    expect(selectProxyUrl('   ')).toBe('');
    expect(selectProxyUrl('http://single.local:8080')).toBe('http://single.local:8080');
  });
});
