import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { firstLine, toPlainText, truncate } from '../core/text.ts';
import type { RawLead, SourceAdapter } from '../core/types.ts';
import { canonicalizeUrl } from '../core/url.ts';

interface EmailInput {
  subject?: string;
  text?: string;
  html?: string | false;
  from?: string;
  date?: Date;
  messageId?: string;
  uid?: number;
}

function firstUrl(text: string): string | undefined {
  const match = text.match(/https?:\/\/[^\s<>"')\]]+/i);
  if (!match?.[0]) return undefined;
  return canonicalizeUrl(match[0]);
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

export function emailToRawLead(input: EmailInput, source: {
  id: string;
  config: Record<string, unknown>;
}): RawLead | null {
  const subject = (input.subject ?? '').trim();
  const text = (input.text || (typeof input.html === 'string' ? toPlainText(input.html) : '')).trim();
  if (!text && !subject) return null;

  const subjectIncludes = asStringArray(source.config.subjectIncludes);
  if (
    subjectIncludes.length > 0 &&
    !subjectIncludes.some((needle) => subject.toLowerCase().includes(needle))
  ) {
    return null;
  }

  const fromIncludes = asStringArray(source.config.fromIncludes);
  if (
    fromIncludes.length > 0 &&
    !fromIncludes.some((needle) => (input.from ?? '').toLowerCase().includes(needle))
  ) {
    return null;
  }

  const body = text || subject;
  const title = subject || firstLine(body, 140);
  const url = firstUrl(`${subject}\n${body}`);

  return {
    sourceId: source.id,
    externalId: input.messageId || (input.uid ? `imap:${input.uid}` : undefined),
    url,
    title,
    text: truncate(body, 6_000),
    author: input.from,
    publishedAt: input.date?.toISOString(),
    raw: { uid: input.uid },
  };
}

/** Only dedicated variables may hold IMAP passwords. */
export const IMAP_PASSWORD_ENV_RE = /^RADAR_IMAP_[A-Z0-9_]{1,64}$/;

export const imapSource: SourceAdapter = {
  kind: 'imap',
  access: 'user-provided',
  description:
    'IMAP inbox with job-alert emails. Reads only the mailbox you configure and never sends mail.',
  risks: [
    'mailbox credentials live in an environment variable, not in the database',
    'email HTML is normalized to text; formatting and some links are lost',
    'the adapter reads the mailbox on every poll, so keep the folder small',
  ],
  async poll(source, ctx): Promise<RawLead[]> {
    const config = source.config;
    const host = typeof config.host === 'string' ? config.host.trim() : '';
    const user = typeof config.user === 'string' ? config.user.trim() : '';
    const passwordEnv =
      typeof config.passwordEnv === 'string' ? config.passwordEnv.trim() : '';
    if (!host) throw new Error('IMAP source requires config.host');
    if (!user) throw new Error('IMAP source requires config.user');
    if (!passwordEnv) throw new Error('IMAP source requires config.passwordEnv');
    // A source config must never be able to read arbitrary server secrets
    // (DATABASE_URL, GITHUB_CLIENT_SECRET, ...) and send them to a mail host.
    if (!IMAP_PASSWORD_ENV_RE.test(passwordEnv)) {
      throw new Error('IMAP config.passwordEnv must name a variable starting with RADAR_IMAP_ (e.g. RADAR_IMAP_PASSWORD)');
    }

    const password = process.env[passwordEnv];
    if (!password) {
      throw new Error(`Environment variable ${passwordEnv} is empty; cannot log in to IMAP`);
    }

    const port = Number(config.port ?? 993);
    // Implicit TLS only: the password never travels in clear text.
    const secure = true;
    const mailbox = typeof config.mailbox === 'string' && config.mailbox.trim()
      ? config.mailbox.trim()
      : 'INBOX';
    const sinceDays = Math.max(1, Math.min(Number(config.sinceDays ?? 7), 90));
    const limit = Math.max(1, Math.min(Number(config.limit ?? 50), 200));
    const markSeen = config.markSeen === true;

    const client = new ImapFlow({
      host,
      port,
      secure,
      auth: { user, pass: password },
      logger: false,
      tls: { rejectUnauthorized: true },
    });

    await client.connect();
    try {
      const lock = await client.getMailboxLock(mailbox);
      try {
        const since = new Date(Date.now() - sinceDays * 24 * 3600 * 1000);
        const search = await client.search({ since }, { uid: true });
        const uids = Array.isArray(search) ? search.slice(-limit) : [];
        if (!uids.length) return [];

        const leads: RawLead[] = [];
        for await (const message of client.fetch(
          uids,
          { uid: true, source: true },
          { uid: true },
        )) {
          if (!message.source) continue;
          const parsed = await simpleParser(message.source);
          const lead = emailToRawLead(
            {
              subject: parsed.subject ?? undefined,
              text: parsed.text ?? undefined,
              html: parsed.html === false ? undefined : parsed.html,
              from: parsed.from?.text,
              date: parsed.date ?? undefined,
              messageId: parsed.messageId ?? undefined,
              uid: message.uid,
            },
            { id: source.id, config },
          );
          if (lead) leads.push(lead);
          if (markSeen) {
            await client.messageFlagsAdd(message.uid, ['\\Seen'], { uid: true });
          }
        }
        return leads;
      } finally {
        lock.release();
      }
    } finally {
      await client.logout().catch(() => undefined);
    }
  },
};
