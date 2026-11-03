import { describe, expect, it, vi } from 'vitest';
import { encryptTelegramSession } from '../src/core/crypto-session.ts';
import { pollUserTelegramSources, type UserTelegramClient, type UserTelegramMessage } from '../src/pipeline/user-telegram.ts';
import { makeTestRuntime } from './helpers.ts';

const masterSecret = '0123456789abcdef0123456789abcdef';
const NOW = new Date('2026-11-03T12:00:00Z');

function message(id: number, chat: Partial<UserTelegramMessage['chat']>, text = 'Ищем Python-разработчика на проект парсинга маркетплейсов, бюджет 80 000 ₽'): UserTelegramMessage {
  return {
    id,
    text,
    date: new Date(NOW.getTime() - 60_000),
    link: `https://t.me/${chat.username ?? 'c'}/${id}`,
    isOutgoing: false,
    sender: { username: 'client', displayName: 'Client' },
    chat: { id: 100, type: 'chat', username: 'jobs_public', displayName: 'Jobs', ...chat },
  };
}

async function setup(chats: string[], history: Record<string, UserTelegramMessage[]>) {
  const runtime = makeTestRuntime();
  const store = runtime.store;
  const user = await store.upsertGitHubUser!({ githubId: 777, handle: 'member' });
  const encrypted = encryptTelegramSession('session-string', masterSecret, user.id);
  const account = await store.upsertTelegramAccount!({
    userId: user.id, tgUserId: 1, displayName: 'Member',
    sessionEncrypted: encrypted.session_encrypted, iv: encrypted.iv, tag: encrypted.tag,
  });
  const source = await store.createUserSource!({ userId: user.id, accountId: account.id, title: 'Мои каналы', chats });
  const calls: Array<{ chat: string | number; minId: number }> = [];
  const client: UserTelegramClient = {
    getHistory: vi.fn(async (chat: string | number, params: { limit: number; minId: number }) => {
      calls.push({ chat, minId: params.minId });
      return (history[String(chat)] ?? []).filter((m) => m.id > params.minId);
    }),
    getFolders: vi.fn(async () => ({ _: 'messages.dialogFilters', filters: [], tagsEnabled: false })) as unknown as UserTelegramClient['getFolders'],
    destroy: vi.fn(async () => {}),
  };
  const sessions: string[] = [];
  const credit = vi.fn(async (_userId: number, _outcome: unknown) => {});
  const deps = {
    store,
    ingest: { store, sinks: runtime.sinks, logger: runtime.logger, env: runtime.env, now: () => NOW },
    logger: runtime.logger,
    masterSecret,
    credit,
    openClient: async (session: string) => {
      sessions.push(session);
      return client;
    },
    now: () => NOW,
  };
  return { runtime, store, user, account, source, client, calls, sessions, credit, deps };
}

describe('personal Telegram sources', () => {
  it('reads public channels with the decrypted session and credits the member', async () => {
    const t = await setup(['@jobs_public'], { jobs_public: [message(5, {}), message(6, {}, 'Нужен дизайнер лендинга для студии йоги, оплата 30 000 ₽ за проект')] });
    const round = await pollUserTelegramSources(t.deps);
    expect(t.sessions).toEqual(['session-string']);
    expect(round).toMatchObject({ sources: 1, found: 2, failed: 0 });
    expect(round.inserted).toBe(2);
    expect(t.credit).toHaveBeenCalledTimes(2);
    expect(t.credit.mock.calls[0]![0]).toBe(t.user.id);
    expect(t.client.destroy).toHaveBeenCalled();

    const saved = await t.store.getUserSource!(t.source.id, t.user.id);
    expect(saved?.cursors).toEqual({ '@jobs_public': 6 });
    expect(saved?.lastCount).toBe(2);
    expect(saved?.lastError).toBeNull();
    expect(saved?.lastPolledAt).toBe(NOW.toISOString());

    // Read again only after the interval, and then only newer messages.
    expect((await pollUserTelegramSources(t.deps)).sources).toBe(0);
    const later = { ...t.deps, now: () => new Date(NOW.getTime() + 16 * 60_000) };
    await pollUserTelegramSources(later);
    expect(t.calls.at(-1)).toEqual({ chat: 'jobs_public', minId: 6 });
  });

  it('never reads dialogs with people or chats without a public link', async () => {
    const t = await setup(['@friend', '-1001234', '@jobs_public'], {
      friend: [message(1, { type: 'user', username: 'friend' }, 'Привет! Нужен разработчик для моего проекта, обсудим цену завтра?')],
      '-1001234': [message(2, { username: null }, 'В закрытом чате: ищем тестировщика на месяц, оплата 60 000 ₽ в месяц')],
      jobs_public: [message(3, {})],
    });
    const round = await pollUserTelegramSources(t.deps);
    expect(round.found).toBe(1);
    expect(round.skipped).toBe(2);
    const saved = await t.store.getUserSource!(t.source.id, t.user.id);
    expect(saved?.lastError).toContain('без публичной ссылки: 2');
    const leads = await t.store.listLeads({ limit: 50 });
    expect(leads.some((l) => l.text.includes('Привет') || l.text.includes('закрытом'))).toBe(false);
    expect(leads).toHaveLength(1);
    expect(leads.every((l) => l.sourceRef?.visibility === 'public')).toBe(true);
  });

  it('marks the account when Telegram revoked the session and stops reading it', async () => {
    const t = await setup(['@jobs_public'], {});
    (t.client.getHistory as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('AUTH_KEY_UNREGISTERED'));
    const round = await pollUserTelegramSources(t.deps);
    expect(round.failed).toBe(1);
    expect((await t.store.getTelegramAccount!(t.account.id, t.user.id))?.status).toBe('auth_error');
    expect((await t.store.getUserSource!(t.source.id, t.user.id))?.lastError).toContain('подключите аккаунт заново');
    const later = { ...t.deps, now: () => new Date(NOW.getTime() + 60 * 60_000) };
    expect((await pollUserTelegramSources(later)).sources).toBe(0);
  });

  it('files the posts under one passive source that manual submits do not use', async () => {
    const t = await setup(['@jobs_public'], { jobs_public: [message(9, {})] });
    await pollUserTelegramSources(t.deps);
    const sources = await t.store.listSources();
    const shared = sources.filter((s) => s.config.userTelegram === true);
    expect(shared).toHaveLength(1);
    expect(shared[0]).toMatchObject({ kind: 'webhook', enabled: false });
  });
});
