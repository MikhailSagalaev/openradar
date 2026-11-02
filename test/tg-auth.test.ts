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

    let capturedOnUrlUpdated: (url: string, expires: Date) => void;
    let capturedOnQrScanned: () => void;
    let capturedPasswordCb: () => Promise<string>;
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

    // Verify account saved to store
    const accounts = await store.listTelegramAccounts(userId);
    expect(accounts).toHaveLength(1);
    expect(accounts[0].tgUserId).toBe(999888777);
    expect(accounts[0].tgUsername).toBe('radar_dev');
    expect(accounts[0].displayName).toBe('Radar Dev');

    // Verify session decryption matches exported session
    const decrypted = decryptTelegramSession(
      {
        session_encrypted: accounts[0].sessionEncrypted,
        iv: accounts[0].iv,
        tag: accounts[0].tag,
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
});
