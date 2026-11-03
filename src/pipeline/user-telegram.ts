/**
 * Personal Telegram sources: site members link their own Telegram by QR (src/server/tg-auth.ts)
 * and name a folder or a list of chats. This reader goes through them every quarter of an hour
 * and sends what it finds to the shared feed, credited to the member.
 *
 * Only public channels and groups (ones with a @username) are read. Private chats, chats
 * without a public link and dialogs with people are skipped: their members never agreed to a
 * public feed, and the hub would be publishing someone's correspondence.
 */
import type { IngestDeps, IngestOutcome } from './ingest.ts';
import { ingestRawLead } from './ingest.ts';
import type { TelegramClient } from '@mtcute/node';
import type { Logger, SourceRecord } from '../core/types.ts';
import type { Store, UserSourceRecord } from '../core/store.ts';
import { decryptTelegramSession } from '../core/crypto-session.ts';
import {
  folderChats,
  messageToRawLead,
  newTelegramClient,
  normalizeChat,
  toAccountMessage,
} from '../sources/telegram-account.ts';

export const USER_TELEGRAM_INTERVAL_MS = 15 * 60_000;
const SOURCES_PER_ROUND = 10;
const CHATS_PER_SOURCE = 30;
const MESSAGES_PER_CHAT = 30;

/** The part of an mtcute message this reader looks at. */
export interface UserTelegramMessage {
  id: number;
  text: string;
  date: Date;
  link: string;
  isOutgoing: boolean;
  sender: { username: string | null; displayName: string };
  chat: { id: number; type: 'user' | 'chat'; username: string | null; displayName: string };
}

/** What the reader needs from a connected client; tests hand in a fake. */
export interface UserTelegramClient {
  getHistory(chat: string | number, params: { limit: number; minId: number }): Promise<UserTelegramMessage[]>;
  getFolders: TelegramClient['getFolders'];
  destroy(): Promise<void>;
}

export interface UserTelegramDeps {
  store: Store;
  ingest: IngestDeps;
  logger: Logger;
  /** RADAR_WEB_KEY_SECRET: the sessions are encrypted with keys derived from it. */
  masterSecret: string;
  /** Points for the member whose source brought the post (the hub's web key). */
  credit?: (userId: number, outcome: IngestOutcome) => Promise<void>;
  openClient?: (session: string) => Promise<UserTelegramClient>;
  now?: () => Date;
}

export interface UserTelegramRound {
  sources: number;
  found: number;
  inserted: number;
  skipped: number;
  failed: number;
}

/** Telegram's answers for a session that no longer works: the member has to link it again. */
const DEAD_SESSION_RE = /AUTH_KEY_UNREGISTERED|AUTH_KEY_DUPLICATED|SESSION_REVOKED|SESSION_EXPIRED|USER_DEACTIVATED/;

async function defaultOpenClient(session: string): Promise<UserTelegramClient> {
  const client = await newTelegramClient();
  try {
    await client.importSession(session);
    await client.connect();
    // The storage starts empty: reading the dialogs once lets folder chats be named by id.
    for await (const _dialog of client.iterDialogs({ limit: 300 })) {
      // only fills the peer cache
    }
  } catch (error) {
    await client.destroy().catch(() => {});
    throw error;
  }
  return client as unknown as UserTelegramClient;
}

/** The one passive source row the posts of all personal sources are filed under. */
export async function sharedUserTelegramSource(store: Store): Promise<SourceRecord> {
  const sources = await store.listSources();
  const found = sources.find((s) => s.kind === 'webhook' && s.config.userTelegram === true);
  if (found) return found;
  return store.createSource({
    kind: 'webhook',
    title: 'Telegram участников',
    // Not polled by the scheduler: this reader fills it.
    enabled: false,
    config: { userTelegram: true },
  });
}

export async function pollUserTelegramSources(deps: UserTelegramDeps): Promise<UserTelegramRound> {
  const round: UserTelegramRound = { sources: 0, found: 0, inserted: 0, skipped: 0, failed: 0 };
  const store = deps.store;
  if (!store.listDueUserSources || !store.getTelegramAccount || !store.updateUserSource) return round;
  const now = deps.now?.() ?? new Date();
  const due = await store.listDueUserSources(new Date(now.getTime() - USER_TELEGRAM_INTERVAL_MS).toISOString(), SOURCES_PER_ROUND);
  if (!due.length) return round;
  const shared = await sharedUserTelegramSource(store);
  for (const source of due) {
    round.sources++;
    await readSource(source, shared, deps, round, now);
  }
  return round;
}

async function readSource(
  source: UserSourceRecord,
  shared: SourceRecord,
  deps: UserTelegramDeps,
  round: UserTelegramRound,
  now: Date,
): Promise<void> {
  const store = deps.store;
  const finish = async (patch: { lastError: string | null; lastCount: number; cursors?: Record<string, number> }) => {
    await store.updateUserSource!(source.id, source.userId, { ...patch, lastPolledAt: now.toISOString() });
  };
  const account = await store.getTelegramAccount!(source.accountId, source.userId);
  if (!account || account.status !== 'active') return;

  let client: UserTelegramClient | undefined;
  try {
    const session = decryptTelegramSession(
      { session_encrypted: account.sessionEncrypted, iv: account.iv, tag: account.tag },
      deps.masterSecret,
      source.userId,
    );
    client = await (deps.openClient ?? defaultOpenClient)(session);
    const fromFolder = source.folder ? await folderChats(client, `user:${source.id}`, source.folder) : [];
    const chats = [...new Set([...source.chats, ...fromFolder])].slice(0, CHATS_PER_SOURCE);
    const cursors = { ...source.cursors };
    let found = 0;
    let skippedChats = 0;
    const failedChats: string[] = [];
    for (const chat of chats) {
      let history: UserTelegramMessage[];
      try {
        history = await client.getHistory(normalizeChat(chat), { limit: MESSAGES_PER_CHAT, minId: cursors[chat] ?? 0 });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (DEAD_SESSION_RE.test(message)) throw error;
        failedChats.push(chat);
        deps.logger.warn('personal Telegram source: chat skipped', { source: source.id, error: message });
        continue;
      }
      let skippedHere = false;
      for (const message of history) {
        cursors[chat] = Math.max(cursors[chat] ?? 0, message.id);
        if (message.isOutgoing) continue;
        // People, bots and chats without a public @username are never read.
        if (message.chat.type !== 'chat' || !message.chat.username) {
          skippedHere = true;
          continue;
        }
        const raw = messageToRawLead(toAccountMessage(message), shared);
        if (!raw) continue;
        found++;
        round.found++;
        try {
          const outcome = await ingestRawLead(raw, shared, deps.ingest);
          if (outcome.status === 'inserted' || outcome.status === 'delivered') round.inserted++;
          if (outcome.status !== 'rejected') await deps.credit?.(source.userId, outcome);
        } catch (error) {
          round.failed++;
          deps.logger.warn('personal Telegram source: post not saved', { source: source.id, error: error instanceof Error ? error.message : String(error) });
        }
      }
      if (skippedHere) {
        skippedChats++;
        round.skipped++;
      }
    }
    const notes = [
      skippedChats ? `пропущено чатов без публичной ссылки: ${skippedChats}` : '',
      failedChats.length ? `не прочитаны: ${failedChats.slice(0, 5).join(', ')}` : '',
      !chats.length ? 'в папке нет каналов и групп' : '',
    ].filter(Boolean);
    await finish({ lastError: notes.length ? notes.join('; ') : null, lastCount: found, cursors });
  } catch (error) {
    round.failed++;
    const message = error instanceof Error ? error.message : String(error);
    if (DEAD_SESSION_RE.test(message)) {
      await store.setTelegramAccountStatus?.(account.id, 'auth_error');
      await finish({ lastError: 'Telegram отозвал сессию: подключите аккаунт заново', lastCount: 0 });
    } else {
      deps.logger.warn('personal Telegram source failed', { source: source.id, error: message });
      await finish({ lastError: message.startsWith('Telegram folder not found') ? 'папка не найдена в Telegram' : 'не удалось прочитать, попробуем позже', lastCount: 0 });
    }
  } finally {
    await client?.destroy().catch(() => {});
  }
}
