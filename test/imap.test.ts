import { readFileSync } from 'node:fs';
import { simpleParser } from 'mailparser';
import { describe, expect, it } from 'vitest';
import { emailToRawLead } from '../src/sources/imap.ts';

async function parseFixture() {
  const raw = readFileSync(new URL('./fixtures/email.eml', import.meta.url));
  return simpleParser(raw);
}

describe('IMAP email adapter', () => {
  it('converts an email to a raw lead', async () => {
    const parsed = await parseFixture();
    const lead = emailToRawLead(
      {
        subject: parsed.subject ?? undefined,
        text: parsed.text ?? undefined,
        html: parsed.html === false ? undefined : parsed.html,
        from: parsed.from?.text,
        date: parsed.date ?? undefined,
        messageId: parsed.messageId ?? undefined,
        uid: 7,
      },
      { id: 'imap-1', config: {} },
    );

    expect(lead).not.toBeNull();
    expect(lead?.title).toContain('сантехник');
    expect(lead?.text).toContain('Прорвало трубу');
    expect(lead?.url).toBe('https://example.com/orders/42');
    expect(lead?.externalId).toBe('<alert-1@example.com>');
    expect(lead?.author).toContain('alerts@example.com');
  });

  it('filters by subject', async () => {
    const parsed = await parseFixture();
    const lead = emailToRawLead(
      {
        subject: parsed.subject ?? undefined,
        text: parsed.text ?? undefined,
        messageId: parsed.messageId ?? undefined,
      },
      { id: 'imap-1', config: { subjectIncludes: ['электрик'] } },
    );
    expect(lead).toBeNull();
  });

  it('keeps a message that matches the subject filter', async () => {
    const parsed = await parseFixture();
    const lead = emailToRawLead(
      {
        subject: parsed.subject ?? undefined,
        text: parsed.text ?? undefined,
        messageId: parsed.messageId ?? undefined,
      },
      { id: 'imap-1', config: { subjectIncludes: ['сантехник'] } },
    );
    expect(lead).not.toBeNull();
  });
});
