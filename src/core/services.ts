import type { Env } from './types.ts';

export type ServiceStatus = 'ok' | 'degraded' | 'error' | 'disabled';

export interface ServiceCheck {
  name: string;
  label: string;
  status: ServiceStatus;
  lastChecked?: string;
  lastSuccess?: string;
  error?: string;
  httpStatus?: number;
}

export interface ServiceMonitorDeps {
  env?: Env;
  fetchImpl?: typeof fetch;
}

export class ServiceMonitor {
  private services = new Map<string, ServiceCheck>();
  private lastAlertAt = new Map<string, number>();

  constructor(private deps: ServiceMonitorDeps = {}) {}

  record(
    name: string,
    label: string,
    status: ServiceStatus,
    details?: { error?: string; httpStatus?: number },
  ): ServiceCheck {
    const existing = this.services.get(name);
    const now = new Date().toISOString();
    const isSuccess = status === 'ok';

    const check: ServiceCheck = {
      name,
      label,
      status,
      lastChecked: now,
      lastSuccess: isSuccess ? now : existing?.lastSuccess,
      error: isSuccess ? undefined : details?.error,
      httpStatus: details?.httpStatus,
    };

    const previousStatus = existing?.status;
    this.services.set(name, check);

    // If transitioned to error or repeated error after cooldown, notify admin
    if (status === 'error' && (previousStatus !== 'error' || this.isCooldownPassed(name))) {
      this.triggerAlert(check).catch(() => {});
    }

    return check;
  }

  get(name: string): ServiceCheck | undefined {
    return this.services.get(name);
  }

  all(): ServiceCheck[] {
    return Array.from(this.services.values());
  }

  hasErrors(): boolean {
    return Array.from(this.services.values()).some((s) => s.status === 'error');
  }

  private isCooldownPassed(name: string, cooldownMs = 6 * 3600 * 1000): boolean {
    const last = this.lastAlertAt.get(name) ?? 0;
    return Date.now() - last >= cooldownMs;
  }

  private async triggerAlert(service: ServiceCheck): Promise<void> {
    this.lastAlertAt.set(service.name, Date.now());
    const env = this.deps.env;
    if (!env) return;

    const botToken = env.TELEGRAM_BOT_TOKEN;
    const chatId = env.RADAR_ADMIN_CHAT_ID ?? env.TELEGRAM_CHAT_ID;
    if (!botToken || !chatId) return;

    const fetchImpl = this.deps.fetchImpl ?? globalThis.fetch;
    const msg = [
      `[openradar alert] Сервис ${service.label} (${service.name}) перешел в статус ERROR!`,
      service.httpStatus ? `HTTP Status: ${service.httpStatus}` : undefined,
      service.error ? `Причина: ${service.error}` : undefined,
      service.httpStatus === 402 ? 'Требуется пополнить баланс или обновить SUBQ_API_KEY.' : undefined,
      service.httpStatus === 401 ? 'Ключ API недействителен (Unauthorized).' : undefined,
      `Время: ${service.lastChecked}`,
    ]
      .filter(Boolean)
      .join('\n');

    try {
      const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
      await fetchImpl(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: msg,
          disable_web_page_preview: true,
        }),
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      // Alert delivery failure should not break application flow
    }
  }
}
