/**
 * OpenRadar Smart PII Scrubbing and Privacy Engine (radar/1 specification).
 * Complies with 152-FZ / GDPR while preserving source actionable connectivity.
 */

export interface SourceMetadata {
  url?: string;
  channel?: string;
  sourceType?: string;
  platform?: string;
}

export interface ScrubResult {
  text: string;
  sourceChannelHandle?: string;
  corporateUrls: string[];
  isActionable: boolean;
  hasHiddenContacts: boolean;
}

const CONTACT_HIDDEN = '[contact hidden]';

// Triggers that indicate an @handle or link is a personal outreach target
const PERSONAL_CONTACT_TRIGGERS = [
  'лс',
  'личк[аеу]',
  'dm',
  'pm',
  'пишите',
  'писать',
  'откликаться',
  'отклик',
  'контакт[ы]?',
  'связь',
  'tg',
  'telegram',
  'телеграм',
  'contact',
  'reach out',
  'write to',
  'резюме',
  'cv',
];

const TRIGGER_PATTERN = new RegExp(
  `(?:^|[\\s,.:;!?—–-])(?:${PERSONAL_CONTACT_TRIGGERS.join('|')})\\s*[:—–-]?\\s*`,
  'i',
);

/**
 * Extracts public channel handle from URL or channel name.
 * Returns '@handle' or undefined if private or not a channel.
 */
export function extractPublicChannelHandle(
  input?: string,
): string | undefined {
  if (!input) return undefined;
  const trimmed = input.trim();

  // If already @handle
  if (/^@[a-zA-Z0-9_]{4,32}$/.test(trimmed)) {
    return trimmed;
  }

  // Telegram URL: t.me/channel or t.me/s/channel or telegram.me/channel
  const tgMatch = trimmed.match(
    /(?:https?:\/\/)?(?:t(?:elegram)?\.me)\/(?:s\/)?([a-zA-Z0-9_]{4,32})(?:\/\d+)?(?:\/|\?|$)/i,
  );
  if (tgMatch && tgMatch[1]) {
    const slug = tgMatch[1].toLowerCase();
    // Ignore private routing slugs
    if (['c', 'joinchat', 'addstickers', 'share', 'addtheme', 'iv'].includes(slug)) {
      return undefined;
    }
    return `@${tgMatch[1]}`;
  }

  // Plain alphanumeric handle without @
  if (/^[a-zA-Z0-9_]{4,32}$/.test(trimmed) && !trimmed.startsWith('http')) {
    return `@${trimmed}`;
  }

  return undefined;
}

/**
 * Checks if a URL is private/internal (e.g. t.me/c/...) rather than publicly actionable.
 */
export function isPrivateInternalUrl(url?: string): boolean {
  if (!url) return true;
  return /(?:t(?:elegram)?\.me)\/(?:c\/\d+|joinchat\/)/i.test(url);
}

/**
 * Smart PII Scrubbing:
 * 1. Masks personal email addresses.
 * 2. Masks personal phone numbers.
 * 3. Masks personal handles (@username) preceded or followed by contact triggers.
 * 4. Preserves corporate/outbound URLs and public source channel handles.
 * 5. Evaluates whether the lead remains actionable for community users.
 */
export function scrubPII(rawText: string, sourceMeta?: SourceMetadata): ScrubResult {
  if (!rawText) {
    return {
      text: '',
      sourceChannelHandle: undefined,
      corporateUrls: [],
      isActionable: false,
      hasHiddenContacts: false,
    };
  }

  let text = rawText;
  let hasHiddenContacts = false;

  // 1. Identify source channel handle from meta or text
  let sourceChannelHandle =
    extractPublicChannelHandle(sourceMeta?.channel) ||
    extractPublicChannelHandle(sourceMeta?.url);

  if (!sourceChannelHandle) {
    // Check if text header contains public channel, e.g. "Канал: @golang_jobs" or "t.me/s/golang_jobs"
    const headerChannelMatch = text.match(
      /(?:канал|источник|source|channel)\s*[:—–-]?\s*(@[a-zA-Z0-9_]{4,32}|(?:https?:\/\/)?t\.me\/(?:s\/)?([a-zA-Z0-9_]{4,32}))/i,
    );
    if (headerChannelMatch) {
      sourceChannelHandle =
        extractPublicChannelHandle(headerChannelMatch[1]) ||
        (headerChannelMatch[2] ? `@${headerChannelMatch[2]}` : undefined);
    }
  }

  // 2. Extract corporate and outbound URLs
  const urlRegex = /https?:\/\/[^\s<>"'{}|\\^`]+[^\s<>"'{}|\\^`.,:;!?]/gi;
  const corporateUrls: string[] = [];
  const foundUrls = text.match(urlRegex) || [];

  for (const u of foundUrls) {
    if (!isPrivateInternalUrl(u)) {
      corporateUrls.push(u);
    }
  }

  // 3. Mask personal emails
  const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
  if (emailRegex.test(text)) {
    hasHiddenContacts = true;
    text = text.replace(emailRegex, CONTACT_HIDDEN);
  }

  // 4. Mask phone numbers
  // Matches RU/CIS formats: +7 / 8 with 10 digits in various delimiter formats
  // Matches international formats with explicit + country code
  const ruPhoneRegex = /(?:\+7|8)[\s.-]?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{2}[\s.-]?\d{2}\b/g;
  const intlPhoneRegex = /\+\d{1,3}[\s.-]?\(?\d{2,4}\)?[\s.-]?\d{3,4}[\s.-]?\d{3,4}\b/g;
  const explicitPhonePrefixRegex = /(?:тел(?:ефон|\.)?|моб(?:ильный|\.)?|phone|tel|whatsapp|ватсап)\s*[:—–-]?\s*(\+?[\d\s().-]{7,18}\d)/gi;

  if (ruPhoneRegex.test(text)) {
    hasHiddenContacts = true;
    text = text.replace(ruPhoneRegex, CONTACT_HIDDEN);
  }
  if (intlPhoneRegex.test(text)) {
    hasHiddenContacts = true;
    text = text.replace(intlPhoneRegex, CONTACT_HIDDEN);
  }
  text = text.replace(explicitPhonePrefixRegex, (match, phoneGroup) => {
    hasHiddenContacts = true;
    return match.replace(phoneGroup.trim(), CONTACT_HIDDEN);
  });

  // 4b. Mask direct messenger links (wa.me, t.me personal outreach)
  const waUrlRegex = /https?:\/\/(?:wa\.me\/|api\.whatsapp\.com\/send\?phone=)\d+/gi;
  if (waUrlRegex.test(text)) {
    hasHiddenContacts = true;
    text = text.replace(waUrlRegex, CONTACT_HIDDEN);
  }

  const triggerThenTgUrlRegex = new RegExp(
    `(${TRIGGER_PATTERN.source})(https?:\\/\\/t(?:elegram)?\\.me\\/(?:s\\/)?([a-zA-Z0-9_]{4,32}))`,
    'gi',
  );
  text = text.replace(triggerThenTgUrlRegex, (match, prefix, fullUrl, handle) => {
    if (sourceChannelHandle && `@${handle.toLowerCase()}` === sourceChannelHandle.toLowerCase()) {
      return match;
    }
    hasHiddenContacts = true;
    return `${prefix}${CONTACT_HIDDEN}`;
  });

  // 5. Mask personal handles with contact triggers
  // Pattern A: Trigger followed by @handle (e.g. "писать в лс @alex", "tg: @hr_lead")
  const triggerThenHandleRegex = new RegExp(
    `(${TRIGGER_PATTERN.source})(@[a-zA-Z0-9_]{4,32})`,
    'gi',
  );
  text = text.replace(triggerThenHandleRegex, (match, prefix, handle) => {
    // If handle is the source channel itself, keep it
    if (sourceChannelHandle && handle.toLowerCase() === sourceChannelHandle.toLowerCase()) {
      return match;
    }
    hasHiddenContacts = true;
    return `${prefix}${CONTACT_HIDDEN}`;
  });

  // Pattern B: @handle followed by contact trigger (e.g. "@alex в лс", "@hr (личка)")
  const handleThenTriggerRegex = new RegExp(
    `(@[a-zA-Z0-9_]{4,32})(\\s*(?:\\([^)]*\\)|[—–-])?\\s*(?:в\\s+)?(?:${PERSONAL_CONTACT_TRIGGERS.join('|')}))`,
    'gi',
  );
  text = text.replace(handleThenTriggerRegex, (match, handle, suffix) => {
    if (sourceChannelHandle && handle.toLowerCase() === sourceChannelHandle.toLowerCase()) {
      return match;
    }
    hasHiddenContacts = true;
    return `${CONTACT_HIDDEN}${suffix}`;
  });

  // Clean repeated hidden tokens
  text = text.replace(/(?:\[contact hidden\][\s,;]*){2,}/g, `${CONTACT_HIDDEN} `).trim();

  // 6. Actionability assessment
  // Actionable if:
  // - Valid public source URL exists (not private t.me/c/...)
  // - OR public channel handle exists
  // - OR at least one corporate/external URL exists
  const hasPublicSourceUrl = !!(sourceMeta?.url && !isPrivateInternalUrl(sourceMeta.url));
  const hasPublicChannel = !!sourceChannelHandle;
  const hasCorporateUrls = corporateUrls.length > 0;

  const isActionable = hasPublicSourceUrl || hasPublicChannel || hasCorporateUrls;

  return {
    text,
    sourceChannelHandle,
    corporateUrls,
    isActionable,
    hasHiddenContacts,
  };
}

/**
 * Backward-compatible helper for existing ingestion pipelines.
 */
export function sanitizePrivacy(input: string): string {
  if (!input) return '';
  return input;
}

/**
 * Extracts a /24 IPv4 subnet or /48 IPv6 subnet prefix from an IP address
 * to prevent sybil attack / single-actor spam sniping.
 */
export function extractSubnet24(ip: string | undefined): string {
  if (!ip) return '127.0.0.0/24';
  const first = ip.split(',')[0];
  const cleanIp = (first ?? '').trim();
  const ipv4Parts = cleanIp.split('.');
  if (ipv4Parts.length === 4 && ipv4Parts[0] && ipv4Parts[1] && ipv4Parts[2]) {
    return `${ipv4Parts[0]}.${ipv4Parts[1]}.${ipv4Parts[2]}.0/24`;
  }
  if (cleanIp.includes(':')) {
    const v6Parts = cleanIp.split(':');
    return `${v6Parts.slice(0, 3).join(':')}::/48`;
  }
  return 'unknown/24';
}
