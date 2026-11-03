import { describe, it, expect, vi } from 'vitest';
import { TelegramAuthService } from '../src/server/tg-auth.ts';
import { MemoryStore } from '../src/store/memory.ts';
import { decryptTelegramSession } from '../src/core/crypto-session.ts';

describe('TelegramAuthService', () => {
  const masterSecret = '0123456789abcdef0123456789abcdef';
  const userId = 42;

  it('fails if API credentials are missing', async () => {
    const store = new MemoryStore();
    const service = new TelegramAuthService({ store, masterSecret });
    await expect(service.startAuth(userId)).rejects.toThrow('Telegram API credentials not configured');
  });

  it('runs complete QR login flow with mock Telegram client', async () => {
    const store = new MemoryStore();

    let capturedOnUrlUpdated!: (url: string, expires: Date) => void;
    let capturedOnQrScanned!: () => void;
    let capturedPasswordCb!: () => Promise<string>;
    let clientDestroyed = false;

    const mockClient: any = {
      signInQr: vi.fn(async (params: any) => {
        capturedOnUrlUpdated = params.onUrlUpdated;

        // Simulate initial QR emitted
        setTimeout(() => {
          params.onUrlUpdated('tg://login?token=test_token_123', new Date(Date.now() + 60_000));
        }, 10);

        // Hook scanned callback to continue flow
        await new Promise<void>((resolveScanned) => {
          capturedOnQrScanned = () => {
            params.onQrScanned?.();
            resolveScanned();
          };
        });

        // After scan, Telegram prompts for 2FA password
        const pass = await params.password();
        expect(pass).toBe('secret-2fa-pass');

        return {
          id: 999888777n,
          username: 'radar_dev',
          firstName: 'Radar',
          lastName: 'Dev',
          phone: '+79991234567',
        };
      }),
      exportSession: vi.fn(async () => '1BVtsOKIBux...exported_session_data...'),
      destroy: vi.fn(async () => { clientDestroyed = true; }),
    };

    const service = new TelegramAuthService({
      store,
      masterSecret,
      defaultApiId: 12345,
      defaultApiHash: 'mock_hash',
      createClient: async () => mockClient,
    });

    const startResult = await service.startAuth(userId);
    expect(startResult.authSessionId).toBeDefined();
    expect(startResult.qrUrl).toBe('tg://login?token=test_token_123');

    // Status is waiting_qr
    let status = service.getAuthStatus(startResult.authSessionId, userId);
    expect(status?.status).toBe('waiting_qr');

    // User scanned QR
    capturedOnQrScanned();
    status = service.getAuthStatus(startResult.authSessionId, userId);
    expect(status?.status).toBe('scanned');

    // Wait slightly for the mock client to enter password callback
    await new Promise((r) => setTimeout(r, 20));
    status = service.getAuthStatus(startResult.authSessionId, userId);
    expect(status?.status).toBe('waiting_password');

    // Submit password
    await service.submitPassword(startResult.authSessionId, userId, 'secret-2fa-pass');

    // Wait slightly for the async login completion
    await new Promise((r) => setTimeout(r, 30));

    status = service.getAuthStatus(startResult.authSessionId, userId);
    expect(status?.status).toBe('authenticated');
    expect(clientDestroyed).toBe(true);

    // Verify sanitized status record NEVER exposes sessionEncrypted, iv or tag to client
    expect((status?.accountRecord as any)?.sessionEncrypted).toBeUndefined();
    expect((status?.accountRecord as any)?.iv).toBeUndefined();
    expect((status?.accountRecord as any)?.tag).toBeUndefined();
    expect(status?.accountRecord?.tgUsername).toBe('radar_dev');

    // Verify account saved to store
    const accounts = await store.listTelegramAccounts(userId);
    expect(accounts).toHaveLength(1);
    const account = accounts[0]!;
    expect(account.tgUserId).toBe(999888777);
    expect(account.tgUsername).toBe('radar_dev');
    expect(account.displayName).toBe('Radar Dev');

    // Verify session decryption matches exported session
    const decrypted = decryptTelegramSession(
      {
        session_encrypted: account.sessionEncrypted,
        iv: account.iv,
        tag: account.tag,
      },
      masterSecret,
      userId
    );
    expect(decrypted).toBe('1BVtsOKIBux...exported_session_data...');
  });

  it('cancels ongoing auth session', async () => {
    const store = new MemoryStore();
    let aborted = false;

    const mockClient: any = {
      signInQr: vi.fn(async (params: any) => {
        params.abortSignal.addEventListener('abort', () => {
          aborted = true;
        });
        setTimeout(() => {
          params.onUrlUpdated('tg://login?token=token_cancel', new Date(Date.now() + 60_000));
        }, 10);
        return new Promise(() => {}); // never resolves
      }),
      destroy: vi.fn(async () => {}),
    };

    const service = new TelegramAuthService({
      store,
      masterSecret,
      defaultApiId: 12345,
      defaultApiHash: 'mock_hash',
      createClient: async () => mockClient,
    });

    const { authSessionId } = await service.startAuth(userId);
    await service.cancelAuth(authSessionId, userId);

    expect(aborted).toBe(true);
    const status = service.getAuthStatus(authSessionId, userId);
    expect(status?.status).toBe('expired');
  });

  it('rejects missing or short masterSecret in production', () => {
    const origEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const store = new MemoryStore();
      expect(() => new TelegramAuthService({ store, masterSecret: '' })).toThrow('RADAR_WEB_KEY_SECRET must be configured');
      expect(() => new TelegramAuthService({ store, masterSecret: 'too-short' })).toThrow('RADAR_WEB_KEY_SECRET must be configured');
    } finally {
      process.env.NODE_ENV = origEnv;
    }
  });
});

describe('TelegramAuthService hardening', () => {
  const masterSecret = '0123456789abcdef0123456789abcdef';
  const userId = 7;

  function pendingClient(onAbort?: () => void): any {
    return {
      signInQr: vi.fn(async (params: any) => {
        params.abortSignal.addEventListener('abort', () => onAbort?.());
        setTimeout(() => params.onUrlUpdated('tg://login?token=t', new Date(Date.now() + 60_000)), 5);
        return new Promise(() => {});
      }),
      destroy: vi.fn(async () => {}),
    };
  }

  it('refuses to start without a real secret in any mode', () => {
    expect(() => new TelegramAuthService({ store: new MemoryStore(), masterSecret: '' })).toThrow('RADAR_WEB_KEY_SECRET');
  });

  it('keeps one QR login per person: a new one ends the previous', async () => {
    let aborted = 0;
    const service = new TelegramAuthService({
      store: new MemoryStore(), masterSecret, defaultApiId: 1, defaultApiHash: 'h',
      createClient: async () => pendingClient(() => { aborted += 1; }),
    });
    const first = await service.startAuth(userId);
    const second = await service.startAuth(userId);
    expect(aborted).toBe(1);
    expect(service.getAuthStatus(first.authSessionId, userId)?.status).toBe('expired');
    expect(service.getAuthStatus(second.authSessionId, userId)?.status).toBe('waiting_qr');
  });

  it('does not keep the phone and does not turn a finished login into expired', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const store = new MemoryStore();
      const client: any = {
        signInQr: vi.fn(async (params: any) => {
          params.onUrlUpdated('tg://login?token=t', new Date(Date.now() + 60_000));
          return { id: 5n, username: 'u', firstName: 'U', phone: '+79990000000' };
        }),
        exportSession: vi.fn(async () => 'session'),
        destroy: vi.fn(async () => {}),
      };
      const service = new TelegramAuthService({
        store, masterSecret, defaultApiId: 1, defaultApiHash: 'h', ttlMs: 1_000, createClient: async () => client,
      });
      const { authSessionId } = await service.startAuth(userId);
      await vi.advanceTimersByTimeAsync(10);
      expect(service.getAuthStatus(authSessionId, userId)?.status).toBe('authenticated');
      expect((await store.listTelegramAccounts(userId))[0]!.phone).toBeNull();
      expect((service.getAuthStatus(authSessionId, userId)?.accountRecord as any)?.phone).toBeUndefined();
      await vi.advanceTimersByTimeAsync(1_500);
      expect(service.getAuthStatus(authSessionId, userId)?.status).toBe('authenticated');
    } finally {
      vi.useRealTimers();
    }
  });

  it('logs the stored session out at Telegram when the account is removed', async () => {
    const store = new MemoryStore();
    const login: any = {
      signInQr: vi.fn(async (params: any) => {
        params.onUrlUpdated('tg://login?token=t', new Date(Date.now() + 60_000));
        return { id: 6n, username: 'v', firstName: 'V' };
      }),
      exportSession: vi.fn(async () => 'stored-session'),
      destroy: vi.fn(async () => {}),
    };
    const revoker: any = {
      importSession: vi.fn(async () => {}),
      logOut: vi.fn(async () => ({})),
      destroy: vi.fn(async () => {}),
    };
    const clients = [login, revoker];
    const service = new TelegramAuthService({
      store, masterSecret, defaultApiId: 1, defaultApiHash: 'h', createClient: async () => clients.shift(),
    });
    await service.startAuth(userId);
    await new Promise((r) => setTimeout(r, 10));
    const account = (await store.listTelegramAccounts(userId))[0]!;
    expect(await service.revokeAccount(account.id, userId)).toBe(true);
    expect(revoker.importSession).toHaveBeenCalledWith('stored-session');
    expect(revoker.logOut).toHaveBeenCalled();
    expect(revoker.destroy).toHaveBeenCalled();
    expect(await service.revokeAccount(account.id, userId + 1)).toBe(false);
  });
});
