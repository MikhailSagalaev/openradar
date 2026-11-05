import type { RawLead } from '../core/types.ts';

/**
 * Orders the owner's browser reads on boards behind a login: Profi.ru, Yandex Uslugi and
 * YouDo (docs/GIG_SOURCES.md). The extension sends what the page shows; the hub keeps the task,
 * never the client: phones, addresses and handles are cut before the post reaches the pipeline,
 * which would otherwise store them as contacts.
 */
export const COLLECTOR_PLATFORMS = {
  profi: { title: 'Профи.ру — заказы', host: /(?:^|\.)profi\.ru$/ },
  yandex: { title: 'Яндекс Услуги — заказы', host: /^uslugi\.yandex\.ru$/ },
  youdo: { title: 'YouDo — заказы', host: /(?:^|\.)youdo\.com$/ },
} as const;

export type CollectorPlatform = keyof typeof COLLECTOR_PLATFORMS;

/** Orders in one request: a page of a board. */
export const COLLECTOR_MAX_ORDERS = 100;

const PHONE = /(?:\+7|\b8)[\s(-]*\d{3}[\s)-]*\d{3}[\s-]*\d{2}[\s-]*\d{2}\b|\+\d[\d\s()-]{8,}\d/g;
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
const HANDLE = /(?:^|\s)@[a-z0-9_]{4,}/gi;
const MESSENGER_LINK = /https?:\/\/(?:t\.me|wa\.me|vk\.com)\/\S+/gi;

export function scrubContacts(text: string): string {
  return text.replace(MESSENGER_LINK, ' ').replace(PHONE, ' ').replace(EMAIL, ' ').replace(HANDLE, ' ').replace(/[ \t]{2,}/g, ' ').trim();
}

function text(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

/** One order from the extension, or undefined when it is not one. */
export function collectedOrderToRaw(platform: CollectorPlatform, sourceId: string, order: Record<string, unknown>): RawLead | undefined {
  const id = text(order.id, 80);
  const url = text(order.url, 500);
  let host = '';
  try {
    const parsed = new URL(url);
    host = parsed.protocol === 'https:' ? parsed.hostname : '';
  } catch {
    return undefined;
  }
  if (!id || !COLLECTOR_PLATFORMS[platform].host.test(host)) return undefined;
  const title = scrubContacts(text(order.title, 300));
  const body = scrubContacts(text(order.text, 6000));
  if (!title && !body) return undefined;
  const budget = typeof order.budget === 'number' && Number.isFinite(order.budget) && order.budget > 0 ? order.budget : undefined;
  return {
    sourceId,
    type: 'gig',
    externalId: `${platform}:${id}`,
    url,
    title: title || body,
    text: body || title,
    budget,
    currency: budget ? 'RUB' : undefined,
    category: text(order.category, 100) || undefined,
    city: text(order.city, 100) || undefined,
    isRemote: typeof order.remote === 'boolean' ? order.remote : undefined,
    publishedAt: Number.isNaN(Date.parse(text(order.publishedAt, 40))) ? undefined : text(order.publishedAt, 40),
  };
}
