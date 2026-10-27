import { describe, expect, it } from 'vitest';
import {
  CONTACT_PLACEHOLDER,
  extractContacts,
  mergeContacts,
  normalizeContact,
  redactContacts,
  redactLead,
} from '../src/core/contacts.ts';
import type { Lead } from '../src/core/types.ts';

describe('contacts', () => {
  it('normalises each contact type to one canonical value', () => {
    expect(normalizeContact('telegram', 'https://t.me/Irina_HR')).toEqual({ type: 'telegram', value: '@irina_hr' });
    expect(normalizeContact('telegram', '@Irina_HR')).toEqual({ type: 'telegram', value: '@irina_hr' });
    expect(normalizeContact('phone', '8 (999) 123-45-67')).toEqual({ type: 'phone', value: '+79991234567' });
    expect(normalizeContact('phone', '+7 999 123 45 67')).toEqual({ type: 'phone', value: '+79991234567' });
    expect(normalizeContact('email', 'HR@Example.COM')).toEqual({ type: 'email', value: 'hr@example.com' });
    expect(normalizeContact('whatsapp', 'https://wa.me/79991234567')).toEqual({ type: 'whatsapp', value: '+79991234567' });
    expect(normalizeContact('url', 'javascript:alert(1)')).toBeNull();
    expect(normalizeContact('telegram', 'joinchat')).toBeNull();
  });

  it('does not take CSS at-rules or decorators for Telegram handles', () => {
    const text = 'Подключите шрифты через @font-face и @media, класс с @Override. Пишите @irina_hr.';
    expect(extractContacts(text)).toEqual([{ type: 'telegram', value: '@irina_hr' }]);
    expect(redactContacts(text)).toContain('@font-face');
    expect(redactContacts(text)).not.toContain('@irina_hr');
    expect(normalizeContact('phone', '12345')).toBeNull();
  });

  it('extracts contacts from free text without mistaking salaries for phones', () => {
    const text = 'Зарплата 200 000 - 300 000 руб. Пишите @irina_hr, t.me/devjobs_ru, hr@acme.io или +7 (999) 123-45-67';
    const found = extractContacts(text);
    expect(found).toContainEqual({ type: 'telegram', value: '@irina_hr' });
    expect(found).toContainEqual({ type: 'telegram', value: '@devjobs_ru' });
    expect(found).toContainEqual({ type: 'email', value: 'hr@acme.io' });
    expect(found).toContainEqual({ type: 'phone', value: '+79991234567' });
    expect(found.filter((c) => c.type === 'phone')).toHaveLength(1);
    expect(found.some((c) => c.value === '@acme')).toBe(false);
  });

  it('merges duplicates by normalised value', () => {
    const merged = mergeContacts(
      [{ type: 'telegram', value: '@a_hr' }],
      [{ type: 'telegram', value: '@a_hr' }, { type: 'email', value: 'x@y.io' }],
    );
    expect(merged).toHaveLength(2);
  });

  it('redacts every contact from text and the guest projection of a lead', () => {
    const text = 'Пишите @irina_hr или hr@acme.io, тел. 8 999 123 45 67, wa.me/79991234567';
    const redacted = redactContacts(text);
    expect(redacted).not.toContain('irina');
    expect(redacted).not.toContain('acme');
    expect(redacted).not.toContain('123');
    expect(redacted).toContain(CONTACT_PLACEHOLDER);

    const lead = {
      id: 'l', sourceId: 's', title: 'Go @irina_hr', text, author: '@irina_hr', fingerprint: 'f', titleKey: 't',
      status: 'new', score: 1, reasons: [], createdAt: new Date().toISOString(),
      contacts: [{ type: 'telegram', value: '@irina_hr' }], metadata: { phone: '+79991234567' },
    } as Lead;
    const guest = redactLead(lead);
    expect(JSON.stringify(guest)).not.toContain('irina');
    expect(guest.contacts).toEqual([]);
    expect(guest.metadata).toBeUndefined();
  });
});
