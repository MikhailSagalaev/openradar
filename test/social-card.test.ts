import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/server/app.ts';
import type { Runtime } from '../src/runtime.ts';
import type { Env } from '../src/core/types.ts';
import { makeTestRuntime } from './helpers.ts';

// Every runtime opens its own store (a PostgreSQL pool in CI): close them all after
// each test, or the database runs out of connections.
const openRuntimes: Runtime[] = [];
afterEach(async () => {
  for (const runtime of openRuntimes.splice(0)) await runtime.store.close().catch(() => undefined);
});

function makeRuntime(overrides: Partial<Env> = {}): Runtime {
  const base = makeTestRuntime({ RADAR_ADMIN_TOKEN: 'secret', ...overrides });
  const runtime: Runtime = {
    env: base.env,
    logger: base.logger,
    store: base.store,
    sources: base.sources,
    sinks: base.sinks,
    fetchImpl: fetch,
    access: base.access,
  };
  openRuntimes.push(runtime);
  return runtime;
}

describe('social link preview card', () => {
  it('serves the English card to the X/Twitter crawler even with RU cookie', async () => {
    const app = createApp(makeRuntime({ RADAR_PUBLIC_READ: true, RADAR_PUBLIC_URL: 'https://hub.example' }));
    const html = await (
      await app.request('/', {
        headers: { 'user-agent': 'Twitterbot/1.0', cookie: 'openradar_lang=ru', 'accept-language': 'ru-RU,ru;q=0.9' },
      })
    ).text();
    expect(html).toContain('<html lang="en">');
    expect(html).toContain('<meta property="og:image" content="https://hub.example/og-en.png">');
    expect(html).toContain('<meta name="twitter:image" content="https://hub.example/og-en.png">');
    expect(html).toContain('Freelance orders and IT jobs — an open feed');
    expect(html).toContain('open decentralized feed of freelance gigs and IT jobs');
  });

  it('keeps the Russian card for Telegram and Russian visitors', async () => {
    const app = createApp(makeRuntime({ RADAR_PUBLIC_READ: true, RADAR_PUBLIC_URL: 'https://hub.example' }));
    // Telegram's UA mentions TwitterBot in parentheses; it must NOT get the EN override.
    const tg = await (
      await app.request('/', { headers: { 'user-agent': 'TelegramBot (like TwitterBot)', cookie: 'openradar_lang=ru' } })
    ).text();
    expect(tg).toContain('<html lang="ru">');
    expect(tg).toContain('content="https://hub.example/og.png"');
    const human = await (await app.request('/', { headers: { cookie: 'openradar_lang=ru' } })).text();
    expect(human).toContain('<html lang="ru">');
    expect(human).toContain('content="https://hub.example/og.png"');
  });

  it('shows the English card to English visitors and serves both assets', async () => {
    const app = createApp(makeRuntime({ RADAR_PUBLIC_READ: true, RADAR_PUBLIC_URL: 'https://hub.example' }));
    const en = await (await app.request('/', { headers: { cookie: 'openradar_lang=en' } })).text();
    expect(en).toContain('<html lang="en">');
    expect(en).toContain('content="https://hub.example/og-en.png"');
    for (const path of ['/og.png', '/og-en.png']) {
      const res = await app.request(path);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('image/png');
    }
  });
});
