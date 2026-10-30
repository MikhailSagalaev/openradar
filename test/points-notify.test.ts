import { describe, expect, it } from 'vitest';
import { formatPointsMessage, notifyPoints } from '../src/pipeline/points-notify.ts';
import { MemoryStore } from '../src/store/memory.ts';
import { makeTestRuntime } from './helpers.ts';

const NOW = new Date('2026-10-30T12:00:00.000Z');
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3600_000).toISOString();

async function setup() {
  const runtime = { ...makeTestRuntime({ TELEGRAM_BOT_TOKEN: 'bot', RADAR_SUBSCRIPTION_BOT: true, RADAR_PUBLIC_URL: 'https://hub.example' }), store: new MemoryStore() };
  const store = runtime.store;
  const user = await store.upsertGitHubUser!({ githubId: 5, handle: 'finder' });
  await store.setTelegramLinkCode!(user.id, 'code-points', hoursAgo(-1));
  await store.linkTelegramChat!('code-points', '321', hoursAgo(48));
  for (const [id, title, at] of [['l1', 'Бот на Python', hoursAgo(3)], ['l2', 'Сайт для кафе', hoursAgo(5)], ['old', 'Старый заказ', hoursAgo(24 * 10)]] as const) {
    await store.insertLead({ id, sourceId: 's', title, text: 't', fingerprint: `fp-${id}`, titleKey: id, status: 'new', score: 60, reasons: [], createdAt: at });
  }
  await store.replaceLedger(['l1', 'l2', 'old'], [
    { pubkey: 'key-a', leadId: 'l1', kind: 'first', points: 1, createdAt: hoursAgo(3) },
    { pubkey: 'key-a', leadId: 'l2', kind: 'hidden_first', points: -1, createdAt: hoursAgo(5) },
    { pubkey: 'key-a', leadId: 'old', kind: 'first', points: 1, createdAt: hoursAgo(24 * 10) },
  ]);
  const sent: Array<Record<string, unknown>> = [];
  const fetchImpl = (async (_url: string, init: RequestInit) => {
    sent.push(JSON.parse(String(init.body)));
    return new Response(JSON.stringify({ ok: true, result: {} }), { status: 200 });
  }) as unknown as typeof fetch;
  const deps = { store, env: runtime.env, logger: runtime.logger, fetchImpl, now: () => NOW, pubkeysForUser: async () => ['key-a'] };
  return { store, user, sent, deps };
}

describe('points notices', () => {
  it('tells the owner about new credits once, and not about credits from before linking', async () => {
    const { store, user, sent, deps } = await setup();
    expect(await notifyPoints(deps)).toEqual({ users: 1, sent: 1 });
    expect(sent).toHaveLength(1);
    expect(sent[0]!.chat_id).toBe('321');
    const text = String(sent[0]!.text);
    expect(text).toContain('+10 — вы нашли первым, заказ подтвердили: <a href="https://hub.example/leads/l1">Бот на Python</a>');
    expect(text).toContain('-10 — ваш заказ скрыли как мусор');
    expect(text).not.toContain('Старый заказ');
    expect(text).toContain('openradar: 0 очков');

    // The next hour, nothing new: no message.
    expect(await notifyPoints(deps)).toEqual({ users: 1, sent: 0 });
    // The rating run rebuilds the ledger with a new credit: only it arrives.
    await store.replaceLedger(['l1', 'l2'], [
      { pubkey: 'key-a', leadId: 'l1', kind: 'first', points: 1, createdAt: hoursAgo(3) },
      { pubkey: 'key-a', leadId: 'l2', kind: 'hidden_first', points: -1, createdAt: hoursAgo(5) },
      { pubkey: 'key-a', leadId: 'l2', kind: 'signal_match', points: 0.1, createdAt: hoursAgo(5) },
    ]);
    await notifyPoints(deps);
    expect(sent).toHaveLength(2);
    expect(String(sent[1]!.text)).toMatch(/^<b>openradar: \+1 очко<\/b>/);
    expect(await store.listLedgerNotices!(user.id)).toEqual(new Set(['l1:first', 'l2:hidden_first', 'l2:signal_match']));
  });

  it('stays quiet without the bot, and forgets a chat that blocked it', async () => {
    const { store, user, deps } = await setup();
    expect(await notifyPoints({ ...deps, env: { ...deps.env, RADAR_SUBSCRIPTION_BOT: false } })).toEqual({ users: 0, sent: 0 });
    const blocked = (async () => new Response(JSON.stringify({ ok: false, description: 'Forbidden: bot was blocked by the user' }), { status: 403 })) as unknown as typeof fetch;
    expect(await notifyPoints({ ...deps, fetchImpl: blocked })).toEqual({ users: 1, sent: 0 });
    expect(await store.getTelegramChat!(user.id)).toBeNull();
  });

  it('escapes titles and pluralises points', () => {
    const text = formatPointsMessage([{ pubkey: 'k', leadId: 'x', kind: 'first', points: 2.1, createdAt: NOW.toISOString(), title: 'A <b>' }], 'https://hub.example');
    expect(text).toContain('A &lt;b&gt;');
    expect(text).toContain('+21 очко');
  });
});
