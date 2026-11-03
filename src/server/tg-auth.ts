import { randomUUID } from 'node:crypto';
import type { TelegramClient } from '@mtcute/node';
import type { Store, UserTelegramAccountRecord } from '../core/store.ts';
import { decryptTelegramSession, encryptTelegramSession } from '../core/crypto-session.ts';

export type TelegramAuthStatus =
  | 'waiting_qr'
  | 'scanned'
  | 'waiting_password'
  | 'authenticated'
  | 'error'
  | 'expired';

export type PublicTelegramAccountRecord = Omit<UserTelegramAccountRecord, 'sessionEncrypted' | 'iv' | 'tag' | 'phone'>;

export interface TelegramAuthSessionState {
  authSessionId: string;
  userId: number;
  status: TelegramAuthStatus;
  qrUrl?: string;
  qrExpiresAt?: number;
  error?: string;
  accountRecord?: PublicTelegramAccountRecord;
  createdAt: number;
  expiresAt: number;
}

interface ActiveSessionEntry {
  state: TelegramAuthSessionState;
  client?: TelegramClient;
  abortController: AbortController;
  passwordResolver?: (password: string) => void;
  passwordRejecter?: (err: unknown) => void;
  timer?: NodeJS.Timeout;
}

export interface TelegramAuthServiceOptions {
  store: Store;
  masterSecret?: string;
  defaultApiId?: number;
  defaultApiHash?: string;
  ttlMs?: number;
  /** Factory for tests or customized client instantiation */
  createClient?: (apiId: number, apiHash: string) => Promise<TelegramClient>;
}

export class TelegramAuthService {
  private store: Store;
  private masterSecret: string;
  private defaultApiId?: number;
  private defaultApiHash?: string;
  private ttlMs: number;
  private createClientFn?: (apiId: number, apiHash: string) => Promise<TelegramClient>;
  private sessions = new Map<string, ActiveSessionEntry>();

  constructor(options: TelegramAuthServiceOptions) {
    this.store = options.store;
    // No built-in fallback key in any mode: the service only exists when the feature is on
    // (RADAR_USER_TELEGRAM), and then a real secret is required.
    const secret = options.masterSecret || process.env.RADAR_WEB_KEY_SECRET;
    if (!secret || secret.length < 16) {
      throw new Error(
        'RADAR_WEB_KEY_SECRET must be configured with at least 16 characters to enable Telegram account connections.'
      );
    }

    this.masterSecret = secret;
    this.defaultApiId = options.defaultApiId ?? (process.env.RADAR_TELEGRAM_API_ID ? Number(process.env.RADAR_TELEGRAM_API_ID) : undefined);
    this.defaultApiHash = options.defaultApiHash ?? process.env.RADAR_TELEGRAM_API_HASH?.trim();
    this.ttlMs = options.ttlMs ?? 180_000; // 3 minutes TTL
    this.createClientFn = options.createClient;
  }

  /**
   * Start a new QR auth flow for a given user.
   * Spawns @mtcute client and waits until the first QR code token is received.
   */
  async startAuth(
    userId: number,
    credentials?: { apiId?: number; apiHash?: string }
  ): Promise<{ authSessionId: string; qrUrl: string; expiresAt: number }> {
    const apiId = credentials?.apiId ?? this.defaultApiId;
    const apiHash = credentials?.apiHash ?? this.defaultApiHash;

    if (!apiId || !apiHash) {
      throw new Error(
        'Telegram API credentials not configured. Please specify RADAR_TELEGRAM_API_ID and RADAR_TELEGRAM_API_HASH.'
      );
    }

    // One QR login per person at a time: each holds an MTProto connection for minutes.
    for (const [id, other] of this.sessions) {
      if (other.state.userId === userId && !isFinal(other.state.status)) this.expireSession(id);
    }

    const authSessionId = randomUUID();
    const now = Date.now();
    const expiresAt = now + this.ttlMs;
    const abortController = new AbortController();

    const state: TelegramAuthSessionState = {
      authSessionId,
      userId,
      status: 'waiting_qr',
      createdAt: now,
      expiresAt,
    };

    const entry: ActiveSessionEntry = {
      state,
      abortController,
    };
    this.sessions.set(authSessionId, entry);

    // Timeout cleaner: auto-expire after TTL
    entry.timer = setTimeout(() => {
      if (isFinal(entry.state.status)) this.forgetLater(authSessionId);
      else this.expireSession(authSessionId);
    }, this.ttlMs);

    const client = await this.newClient(apiId, apiHash);
    entry.client = client;

    // We wait for the initial QR URL to resolve startAuth()
    let initialQrReceived = false;
    let initialResolve: (url: string) => void = () => {};
    let initialReject: (err: unknown) => void = () => {};

    const initialQrPromise = new Promise<string>((resolve, reject) => {
      initialResolve = resolve;
      initialReject = reject;
    });

    // Start background login flow
    (async () => {
      try {
        const user = await client.signInQr({
          onUrlUpdated: (url, expires) => {
            state.qrUrl = url;
            state.qrExpiresAt = expires.getTime();
            state.status = 'waiting_qr';
            if (!initialQrReceived) {
              initialQrReceived = true;
              initialResolve(url);
            }
          },
          onQrScanned: () => {
            state.status = 'scanned';
          },
          password: () => {
            state.status = 'waiting_password';
            state.error = undefined;
            return new Promise<string>((resolve, reject) => {
              entry.passwordResolver = resolve;
              entry.passwordRejecter = reject;
            });
          },
          invalidPasswordCallback: () => {
            state.status = 'waiting_password';
            state.error = 'Invalid 2FA password. Please try again.';
          },
          abortSignal: abortController.signal,
        });

        // Authorized successfully! Export MTProto session string
        const sessionString = await client.exportSession();
        const encrypted = encryptTelegramSession(sessionString, this.masterSecret, userId);

        const tgUserId = Number(user.id);
        const displayName = [user.firstName, user.lastName].filter(Boolean).join(' ') || (user.username ? `@${user.username}` : String(tgUserId));

        if (this.store.upsertTelegramAccount) {
          const rawAccount = await this.store.upsertTelegramAccount({
            userId,
            tgUserId,
            tgUsername: user.username ?? null,
            displayName,
            // The phone number is not needed to read chats and is not kept.
            phone: null,
            sessionEncrypted: encrypted.session_encrypted,
            iv: encrypted.iv,
            tag: encrypted.tag,
            status: 'active',
          });

          // Sanitize: strip encrypted credentials before storing in memory / exposing to status endpoint
          state.accountRecord = {
            id: rawAccount.id,
            userId: rawAccount.userId,
            tgUserId: rawAccount.tgUserId,
            tgUsername: rawAccount.tgUsername,
            displayName: rawAccount.displayName,
            status: rawAccount.status,
            lastPolledAt: rawAccount.lastPolledAt,
            createdAt: rawAccount.createdAt,
            updatedAt: rawAccount.updatedAt,
          };
        }

        state.status = 'authenticated';
        state.error = undefined;
      } catch (err: any) {
        if (abortController.signal.aborted) {
          state.status = 'expired';
        } else {
          // Details stay in the log; the status page gets a fixed text.
          console.error('[tg-auth] QR login failed:', err instanceof Error ? err.message : err);
          state.status = 'error';
          state.error = 'Telegram login failed. Please try again.';
        }
        if (!initialQrReceived) {
          initialReject(err);
        }
      } finally {
        await client.destroy().catch(() => {});
        entry.client = undefined;
      }
    })();

    // Await first QR token or failure (with a 15-second connect timeout)
    const timeout = setTimeout(() => {
      if (!initialQrReceived) {
        abortController.abort();
        initialReject(new Error('Timed out waiting for initial Telegram QR code token'));
      }
    }, 15_000);

    try {
      const qrUrl = await initialQrPromise;
      clearTimeout(timeout);
      return {
        authSessionId,
        qrUrl,
        expiresAt,
      };
    } catch (err) {
      clearTimeout(timeout);
      this.sessions.delete(authSessionId);
      throw err;
    }
  }

  /**
   * Status check called periodically by frontend polling.
   */
  getAuthStatus(authSessionId: string, userId: number): TelegramAuthSessionState | null {
    const entry = this.sessions.get(authSessionId);
    if (!entry || entry.state.userId !== userId) {
      return null;
    }
    return entry.state;
  }

  /**
   * Submit 2FA password for an account waiting for password input.
   */
  async submitPassword(authSessionId: string, userId: number, password: string): Promise<void> {
    const entry = this.sessions.get(authSessionId);
    if (!entry || entry.state.userId !== userId) {
      throw new Error('Auth session not found');
    }
    if (entry.state.status !== 'waiting_password' || !entry.passwordResolver) {
      throw new Error('This session is not waiting for a 2FA password');
    }

    const resolver = entry.passwordResolver;
    entry.passwordResolver = undefined;
    entry.passwordRejecter = undefined;
    resolver(password);
  }

  /**
   * Cancel an ongoing QR login session and release resources.
   */
  async cancelAuth(authSessionId: string, userId: number): Promise<void> {
    const entry = this.sessions.get(authSessionId);
    if (!entry || entry.state.userId !== userId) {
      return;
    }
    this.expireSession(authSessionId);
  }

  /**
   * Ends the stored Telegram session on Telegram's side (it disappears from the person's
   * active sessions) before the row is deleted. A session that is already dead counts as revoked.
   */
  async revokeAccount(accountId: string, userId: number): Promise<boolean> {
    const account = await this.store.getTelegramAccount?.(accountId, userId);
    if (!account) return false;
    const apiId = this.defaultApiId;
    const apiHash = this.defaultApiHash;
    if (!apiId || !apiHash) return false;
    let client: TelegramClient | undefined;
    try {
      const session = decryptTelegramSession(
        { session_encrypted: account.sessionEncrypted, iv: account.iv, tag: account.tag },
        this.masterSecret,
        userId,
      );
      client = await this.newClient(apiId, apiHash);
      await client.importSession(session);
      await client.logOut();
      return true;
    } catch (err) {
      console.error('[tg-auth] could not revoke Telegram session:', err instanceof Error ? err.message : err);
      return false;
    } finally {
      await client?.destroy().catch(() => {});
    }
  }

  private async newClient(apiId: number, apiHash: string): Promise<TelegramClient> {
    if (this.createClientFn) return this.createClientFn(apiId, apiHash);
    const { MemoryStorage, TelegramClient: Client, proxyTransportFromUrl } = await import('@mtcute/node');
    const proxy = process.env.RADAR_TELEGRAM_PROXY?.trim();
    return new Client({
      apiId,
      apiHash,
      storage: new MemoryStorage(),
      ...(proxy ? { transport: proxyTransportFromUrl(proxy) } : {}),
    });
  }

  /** Keep a finished state for a minute so the poller can read it, then drop it. */
  private forgetLater(authSessionId: string): void {
    setTimeout(() => {
      this.sessions.delete(authSessionId);
    }, 60_000);
  }

  private expireSession(authSessionId: string): void {
    const entry = this.sessions.get(authSessionId);
    if (!entry) return;

    if (entry.timer) {
      clearTimeout(entry.timer);
      entry.timer = undefined;
    }

    entry.state.status = 'expired';
    entry.abortController.abort();

    if (entry.passwordRejecter) {
      entry.passwordRejecter(new Error('Session cancelled or expired'));
      entry.passwordResolver = undefined;
      entry.passwordRejecter = undefined;
    }

    if (entry.client) {
      entry.client.destroy().catch(() => {});
      entry.client = undefined;
    }

    this.forgetLater(authSessionId);
  }
}

function isFinal(status: TelegramAuthStatus): boolean {
  return status === 'authenticated' || status === 'error' || status === 'expired';
}
