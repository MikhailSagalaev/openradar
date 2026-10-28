/**
 * Telegram through your own account (MTProto, mtcute): reads the channels and chats the
 * account is a member of, private ones included. The session is created once with
 * `radar telegram login` and lives in an environment variable, never in the database.
 */
import type { TelegramClient } from '@mtcute/node';
import type { Contact, PollContext, RawLead, SourceAdapter, SourceRecord } from '../core/types.ts';
import { firstLine } from '../core/text.ts';

/** Only dedicated variables may hold sessions: a source config must not read other secrets. */
export const TELEGRAM_SESSION_ENV_RE = /^RADAR_TELEGRAM_SESSION(?:_[A-Z0-9]{1,32})?$/;
export const DEFAULT_SESSION_ENV = 'RADAR_TELEGRAM_SESSION';

/** Telegram app credentials from my.telegram.org/apps. */
export function telegramApiCredentials(): { apiId: number; apiHash: string } {
  const apiId = Number(process.env.RADAR_TELEGRAM_API_ID);
  const apiHash = process.env.RADAR_TELEGRAM_API_HASH?.trim() ?? '';
  if (!Number.isInteger(apiId) || apiId <= 0 || !apiHash) {
    throw new Error('Set RADAR_TELEGRAM_API_ID and RADAR_TELEGRAM_API_HASH (my.telegram.org/apps)');
  }
  return { apiId, apiHash };
}

/** Loaded on first use: nodes without a Telegram account never load the MTProto client. */
export async function newTelegramClient(): Promise<TelegramClient> {
  const { apiId, apiHash } = telegramApiCredentials();
  const { MemoryStorage, TelegramClient: Client } = await import('@mtcute/node');
  // Sessions come from the environment, so nothing needs to persist between runs.
  return new Client({ apiId, apiHash, storage: new MemoryStorage() });
}

/** One connected client per session for the whole process, shared by all its sources. */
const clients = new Map<string, Promise<TelegramClient>>();

async function clientFor(sessionEnv: string): Promise<TelegramClient> {
  let pending = clients.get(sessionEnv);
  if (!pending) {
    pending = (async () => {
      const session = process.env[sessionEnv]?.trim();
      if (!session) throw new Error(`${sessionEnv} is empty: run "radar telegram login" and put the session there`);
      const client = await newTelegramClient();
      await client.importSession(session);
      await client.connect();
      // The storage starts empty: reading the dialogs once lets chats be named by numeric id.
      for await (const _dialog of client.iterDialogs({ limit: 500 })) {
        // only fills the peer cache
      }
      return client;
    })();
    clients.set(sessionEnv, pending);
    // A failed connection is retried on the next poll instead of being cached.
    pending.catch(() => clients.delete(sessionEnv));
  }
  return pending;
}

/** Highest message id already read, per session and chat, so each poll asks only for new ones. */
const lastSeen = new Map<string, number>();

/** "@jobs", "jobs", "https://t.me/jobs", "-1001234567890" → what mtcute resolves. */
export function normalizeChat(value: string): string | number {
  const trimmed = value.trim().replace(/^https?:\/\/t\.me\//i, '').replace(/^@/, '').replace(/\/+$/, '');
  return /^-?\d+$/.test(trimmed) ? Number(trimmed) : trimmed;
}

export function chatsOf(source: SourceRecord): string[] {
  const raw = source.config.chats;
  const list = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(/[\s,]+/) : [];
  return list.map((c) => String(c).trim()).filter(Boolean);
}

export function sessionEnvOf(source: SourceRecord): string {
  const value = typeof source.config.sessionEnv === 'string' && source.config.sessionEnv.trim()
    ? source.config.sessionEnv.trim()
    : DEFAULT_SESSION_ENV;
  if (!TELEGRAM_SESSION_ENV_RE.test(value)) {
    throw new Error('config.sessionEnv must be RADAR_TELEGRAM_SESSION or RADAR_TELEGRAM_SESSION_<NAME>');
  }
  return value;
}

/** The parts of an mtcute message the adapter reads; also what tests build. */
export interface AccountMessage {
  id: number;
  text: string;
  date: Date;
  link?: string;
  sender?: { username?: string | null; displayName?: string };
  chat: { id: number; username?: string | null; displayName?: string };
}

export function messageToRawLead(message: AccountMessage, source: SourceRecord): RawLead | null {
  const text = message.text.trim();
  if (text.length < 30) return null;
  const chat = message.chat;
  const channel = chat.username ?? String(chat.id);
  const handle = message.sender?.username ? `@${message.sender.username}` : undefined;
  const contacts: Contact[] = handle ? [{ type: 'telegram', value: handle.toLowerCase() }] : [];
  return {
    sourceId: source.id,
    externalId: `tgacc:${chat.id}:${message.id}`,
    url: message.link,
    title: firstLine(text, 140),
    text,
    author: handle ?? message.sender?.displayName ?? chat.displayName,
    publishedAt: message.date.toISOString(),
    contacts,
    sourceRef: {
      platform: 'telegram',
      channel,
      channelTitle: chat.displayName,
      // A chat without a public username is private: it counts so on the hub, too.
      visibility: chat.username ? 'public' : 'private',
      messageId: String(message.id),
    },
    raw: { chatId: chat.id, messageId: message.id },
  };
}

function toAccountMessage(m: {
  id: number;
  text: string;
  date: Date;
  link: string;
  sender: { username: string | null; displayName: string };
  chat: { id: number; username: string | null; displayName: string };
}): AccountMessage {
  let link: string | undefined;
  try {
    link = m.link;
  } catch {
    // mtcute throws for chats where a message link cannot exist (private groups).
  }
  return {
    id: m.id,
    text: m.text,
    date: m.date,
    link,
    sender: { username: m.sender.username, displayName: m.sender.displayName },
    chat: { id: m.chat.id, username: m.chat.username, displayName: m.chat.displayName },
  };
}

export const telegramAccountSource: SourceAdapter = {
  kind: 'telegram-account',
  access: 'user-provided',
  description:
    'Telegram channels and chats read through your own account (MTProto), private ones included. The session lives in an environment variable.',
  risks: [
    'reads with your account: keep the chat list short and the interval calm, or Telegram may limit the account',
    'posts from private chats become visible on the feed of this node; add only chats meant for job posts',
    'the session string grants full access to the account: keep it only in .env',
  ],
  async poll(source: SourceRecord, ctx: PollContext): Promise<RawLead[]> {
    const chats = chatsOf(source);
    if (!chats.length) throw new Error('Telegram account source requires config.chats');
    const sessionEnv = sessionEnvOf(source);
    const client = await clientFor(sessionEnv);
    const limit = Math.max(1, Math.min(Number(source.config.limit ?? 30), 100));

    const leads: RawLead[] = [];
    for (const chat of chats) {
      const key = `${sessionEnv}:${chat}`;
      try {
        const history = await client.getHistory(normalizeChat(chat), { limit, minId: lastSeen.get(key) ?? 0 });
        for (const message of history) {
          lastSeen.set(key, Math.max(lastSeen.get(key) ?? 0, message.id));
          if (message.isOutgoing) continue;
          const lead = messageToRawLead(toAccountMessage(message), source);
          if (lead) leads.push(lead);
        }
      } catch (error) {
        ctx.logger.warn('Telegram account: chat skipped', {
          chat,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return leads;
  },
};
