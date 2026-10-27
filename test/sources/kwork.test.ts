import { afterEach, describe, expect, it } from 'vitest';
import { kworkSource, resetKworkTokens } from '../../src/sources/kwork.ts';
import { makeSource, pollContext } from '../helpers.ts';

const want = { id: 3270001, name: 'Сверстать лендинг по макету', description: 'Нужна адаптивная вёрстка по макету в Figma, 5 экранов.', priceLimit: 5000 };

describe('Kwork mobile API', () => {
  afterEach(() => {
    delete process.env.RADAR_KWORK_LOGIN;
    delete process.env.RADAR_KWORK_PASSWORD;
    resetKworkTokens();
  });

  it('signs in once and reuses the token on the next polls', async () => {
    process.env.RADAR_KWORK_LOGIN = 'user@example.com';
    process.env.RADAR_KWORK_PASSWORD = 'secret';
    const calls: string[] = [];
    const ctx = {
      ...pollContext(''),
      fetchImpl: async (input: RequestInfo | URL) => {
        const endpoint = input.toString().split('/').pop() ?? '';
        calls.push(endpoint);
        const body = endpoint === 'signIn' ? { response: { token: 'tok-1' } } : { response: [want] };
        return new Response(JSON.stringify(body), { status: 200 });
      },
    };
    const source = makeSource({ kind: 'kwork' });

    const first = await kworkSource.poll!(source, ctx);
    await kworkSource.poll!(source, ctx);
    await kworkSource.poll!(source, ctx);

    expect(first[0]?.externalId).toBe('kwork:3270001');
    expect(calls.filter((c) => c === 'signIn')).toHaveLength(1);
    expect(calls.filter((c) => c === 'projects')).toHaveLength(3);
  });

  it('signs in again when the cached token stops working', async () => {
    process.env.RADAR_KWORK_LOGIN = 'user@example.com';
    process.env.RADAR_KWORK_PASSWORD = 'secret';
    let signIns = 0;
    const ctx = {
      ...pollContext(''),
      fetchImpl: async (input: RequestInfo | URL, init?: RequestInit) => {
        if (input.toString().endsWith('/signIn')) {
          signIns++;
          return new Response(JSON.stringify({ response: { token: `tok-${signIns}` } }), { status: 200 });
        }
        const token = new URLSearchParams(String(init?.body)).get('token');
        if (token !== 'tok-2') return new Response(JSON.stringify({ error: 'expired' }), { status: 401 });
        return new Response(JSON.stringify({ response: [want] }), { status: 200 });
      },
    };

    const leads = await kworkSource.poll!(makeSource({ kind: 'kwork' }), ctx);
    expect(signIns).toBe(2);
    expect(leads).toHaveLength(1);
  });
});
