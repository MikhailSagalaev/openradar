import { describe, expect, it, vi } from 'vitest';
import { ServiceMonitor } from '../src/core/services.ts';
import { testEnv } from './helpers.ts';

describe('ServiceMonitor', () => {
  it('records successful check and preserves lastSuccess', () => {
    const monitor = new ServiceMonitor();
    monitor.record('subq', 'SubQ AI', 'ok');
    const check = monitor.get('subq');
    expect(check).toBeDefined();
    expect(check?.status).toBe('ok');
    expect(check?.lastSuccess).toBeDefined();
    expect(monitor.hasErrors()).toBe(false);

    // Transition to error
    monitor.record('subq', 'SubQ AI', 'error', { error: 'HTTP 402', httpStatus: 402 });
    const errCheck = monitor.get('subq');
    expect(errCheck?.status).toBe('error');
    expect(errCheck?.error).toBe('HTTP 402');
    expect(errCheck?.lastSuccess).toBe(check?.lastSuccess);
    expect(monitor.hasErrors()).toBe(true);
  });

  it('triggers telegram alert when service transitions to error', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response('{"ok":true}', { status: 200 }));
    const env = testEnv({
      TELEGRAM_BOT_TOKEN: '123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11',
      RADAR_ADMIN_CHAT_ID: '987654321',
    });

    const monitor = new ServiceMonitor({ env, fetchImpl: mockFetch as unknown as typeof fetch });
    monitor.record('subq', 'SubQ AI', 'ok');
    expect(mockFetch).not.toHaveBeenCalled();

    // Trigger error
    monitor.record('subq', 'SubQ AI', 'error', { error: 'HTTP 402 Insufficient credits', httpStatus: 402 });
    expect(mockFetch).toHaveBeenCalledTimes(1);

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('https://api.telegram.org/bot123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11/sendMessage');
    const body = JSON.parse(init.body as string);
    expect(body.chat_id).toBe('987654321');
    expect(body.text).toContain('SubQ AI');
    expect(body.text).toContain('HTTP 402');
    expect(body.text).toContain('Требуется пополнить баланс');

    // Repeated error before cooldown should NOT alert again
    monitor.record('subq', 'SubQ AI', 'error', { error: 'HTTP 402 Insufficient credits', httpStatus: 402 });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
