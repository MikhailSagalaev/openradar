import type { Contact, ContactType, Lead } from './types.ts';

/**
 * Contacts are first-class data in radar/2: extracted from the text, normalised
 * so the same person matches across channels, shown to signed-in viewers and
 * cut out for guests.
 */

export const CONTACT_TYPES: readonly ContactType[] = ['telegram', 'phone', 'email', 'whatsapp', 'vk', 'url', 'other'];
export const CONTACT_PLACEHOLDER = '[контакт скрыт]';

const TELEGRAM_RESERVED = new Set([
  'c', 's', 'joinchat', 'addstickers', 'addemoji', 'share', 'iv', 'proxy', 'socks', 'login', 'setlanguage', 'boost',
]);

const EMAIL_RE = /(?<![\w.%+-])[a-z0-9][a-z0-9._%+-]*@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}(?![\w-])/gi;
const RU_PHONE_RE = /(?<![\d+])(?:\+7|8)[\s\-(]*\d{3}[\s\-)]*\d{3}[\s-]*\d{2}[\s-]*\d{2}(?!\d)/g;
const INTL_PHONE_RE = /(?<![\d+])\+(?!7)\d{1,3}(?:[\s-]?\d){7,13}(?!\d)/g;
const TG_LINK_RE = /(?:https?:\/\/)?(?:www\.)?(?:t|telegram)\.me\/(?:s\/)?([a-z][a-z0-9_]{3,31})(?:\/\d+)?\b/gi;
// Telegram usernames are 5-32 characters. A hyphen right after the name means code, not a
// handle: «@font-face», «@media-query»; well-known at-rules and decorators are skipped too.
const TG_HANDLE_RE =
  /(?<![\w@./])@(?!(?:media|import|keyframes|supports|charset|namespace|container|tailwind|apply|override|autowired|component|injectable|deprecated|property|dataclass|staticmethod|classmethod)\b)([a-z][a-z0-9_]{4,31})(?![\w-])/gi;
const WA_RE = /(?:https?:\/\/)?(?:wa\.me\/|api\.whatsapp\.com\/send\/?\?phone=)\+?(\d{7,15})/gi;
const VK_RE = /(?:https?:\/\/)?(?:www\.|m\.)?vk\.(?:com|ru)\/([a-z0-9_.]{2,64})\b/gi;

function digits(value: string): string {
  return value.replace(/\D/g, '');
}

function normalizePhone(raw: string): string | null {
  let d = digits(raw);
  if (d.length === 11 && d.startsWith('8')) d = `7${d.slice(1)}`;
  if (d.length === 10 && /^9\d{9}$/.test(d)) d = `7${d}`;
  if (d.length < 10 || d.length > 15) return null;
  return `+${d}`;
}

function normalizeTelegram(raw: string): string | null {
  const value = raw.trim()
    .replace(/^(?:https?:\/\/)?(?:www\.)?(?:t|telegram)\.me\/(?:s\/)?/i, '')
    .replace(/^@/, '')
    .replace(/[/?#].*$/, '')
    .toLowerCase();
  if (!/^[a-z][a-z0-9_]{3,31}$/.test(value) || TELEGRAM_RESERVED.has(value)) return null;
  return `@${value}`;
}

/** Normalises one contact; returns null when the value is not a usable contact of that type. */
export function normalizeContact(type: string, value: unknown): Contact | null {
  if (typeof value !== 'string') return null;
  const raw = value.trim();
  if (!raw || raw.length > 256) return null;
  const kind = (CONTACT_TYPES as readonly string[]).includes(type) ? (type as ContactType) : 'other';
  switch (kind) {
    case 'telegram': {
      const v = normalizeTelegram(raw);
      return v ? { type: 'telegram', value: v } : null;
    }
    case 'phone': {
      const v = normalizePhone(raw);
      return v ? { type: 'phone', value: v } : null;
    }
    case 'whatsapp': {
      const v = normalizePhone(raw.replace(/^.*(?:wa\.me\/|phone=)/i, ''));
      return v ? { type: 'whatsapp', value: v } : null;
    }
    case 'email': {
      const v = raw.toLowerCase();
      return /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/.test(v) ? { type: 'email', value: v } : null;
    }
    case 'vk': {
      const v = raw.replace(/^(?:https?:\/\/)?(?:www\.|m\.)?vk\.(?:com|ru)\//i, '').replace(/[/?#].*$/, '').toLowerCase();
      return /^[a-z0-9_.]{2,64}$/.test(v) ? { type: 'vk', value: v } : null;
    }
    case 'url': {
      try {
        const url = new URL(raw);
        return url.protocol === 'http:' || url.protocol === 'https:' ? { type: 'url', value: url.href } : null;
      } catch {
        return null;
      }
    }
    default:
      return { type: 'other', value: raw };
  }
}

export function contactKey(contact: Contact): string {
  return `${contact.type}:${contact.value}`;
}

/** Deduplicates contacts by normalised value, keeping the first occurrence order. */
export function mergeContacts(...lists: Array<Contact[] | undefined>): Contact[] {
  const seen = new Set<string>();
  const out: Contact[] = [];
  for (const list of lists) {
    for (const contact of list ?? []) {
      const key = contactKey(contact);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(contact);
    }
  }
  return out.slice(0, 20);
}

/** Finds contacts written in free text: emails, phones, Telegram handles and links, WhatsApp, VK. */
export function extractContacts(text: string): Contact[] {
  if (!text) return [];
  const found: Contact[] = [];
  const push = (type: ContactType, value: string): void => {
    const contact = normalizeContact(type, value);
    if (contact) found.push(contact);
  };
  for (const m of text.matchAll(WA_RE)) push('whatsapp', m[1] ?? '');
  for (const m of text.matchAll(EMAIL_RE)) push('email', m[0]);
  for (const m of text.matchAll(RU_PHONE_RE)) push('phone', m[0]);
  for (const m of text.matchAll(INTL_PHONE_RE)) push('phone', m[0]);
  for (const m of text.matchAll(TG_LINK_RE)) push('telegram', m[1] ?? '');
  for (const m of text.matchAll(TG_HANDLE_RE)) push('telegram', m[1] ?? '');
  for (const m of text.matchAll(VK_RE)) push('vk', m[1] ?? '');
  return mergeContacts(found);
}

/** Replaces every contact-looking fragment with a placeholder. */
export function redactContacts(text: string): string {
  if (!text) return text;
  return text
    .replace(WA_RE, CONTACT_PLACEHOLDER)
    .replace(EMAIL_RE, CONTACT_PLACEHOLDER)
    .replace(RU_PHONE_RE, CONTACT_PLACEHOLDER)
    .replace(INTL_PHONE_RE, CONTACT_PLACEHOLDER)
    .replace(TG_LINK_RE, CONTACT_PLACEHOLDER)
    .replace(TG_HANDLE_RE, CONTACT_PLACEHOLDER)
    .replace(VK_RE, CONTACT_PLACEHOLDER);
}

/** Guest projection of a lead: no contacts anywhere in it. */
export function redactLead(lead: Lead): Lead {
  const author = lead.author && extractContacts(lead.author).length === 0 ? lead.author : undefined;
  return {
    ...lead,
    title: redactContacts(lead.title),
    text: redactContacts(lead.text),
    author,
    contacts: [],
    metadata: undefined,
  };
}
