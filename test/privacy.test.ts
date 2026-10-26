import { describe, expect, it } from 'vitest';
import { extractPublicChannelHandle, isPrivateInternalUrl, scrubPII } from '../src/core/privacy.ts';

describe('Smart PII Scrubbing (radar/1 specification)', () => {
  it('case 1: masks personal contact handle while preserving public channel handle from URL', () => {
    const raw = 'Ищем Senior Rust разработчика. Писать в лс @cto_alex по всем вопросам.';
    const result = scrubPII(raw, {
      url: 'https://t.me/s/rust_jobs/456',
    });

    expect(result.text).toContain('Писать в лс [contact hidden]');
    expect(result.text).not.toContain('@cto_alex');
    expect(result.sourceChannelHandle).toBe('@rust_jobs');
    expect(result.isActionable).toBe(true);
    expect(result.hasHiddenContacts).toBe(true);
  });

  it('case 2: marks post as non-actionable if only private channel t.me/c/... and no links or handles exist', () => {
    const raw = 'Срочный заказ на фронтенд. Пишите на номер +7 999 123-45-67';
    const result = scrubPII(raw, {
      url: 'https://t.me/c/12345678/90',
    });

    expect(result.text).toContain('[contact hidden]');
    expect(result.text).not.toContain('+7 999 123-45-67');
    expect(result.sourceChannelHandle).toBeUndefined();
    expect(result.isActionable).toBe(false);
    expect(result.hasHiddenContacts).toBe(true);
  });

  it('case 3: preserves corporate careers URL and marks lead as actionable', () => {
    const raw = 'Открыта вакансия Staff Go Engineer. Подробнее и отклик: https://company.com/careers/staff-go';
    const result = scrubPII(raw);

    expect(result.text).toContain('https://company.com/careers/staff-go');
    expect(result.corporateUrls).toContain('https://company.com/careers/staff-go');
    expect(result.isActionable).toBe(true);
    expect(result.hasHiddenContacts).toBe(false);
  });

  it('case 4: masks personal email with contact trigger', () => {
    const raw = 'Требуется дизайнер в стартап. Присылайте портфолио и резюме на ivanov@gmail.com';
    const result = scrubPII(raw, {
      url: 'https://t.me/s/design_gigs/101',
    });

    expect(result.text).toContain('резюме на [contact hidden]');
    expect(result.text).not.toContain('ivanov@gmail.com');
    expect(result.hasHiddenContacts).toBe(true);
    expect(result.isActionable).toBe(true);
  });

  it('case 5: masks Russian phone numbers in various formats', () => {
    const raw = 'Звонить строго с 10 до 18: 8 (495) 123-45-67 или +79261112233';
    const result = scrubPII(raw, {
      url: 'https://hh.ru/vacancy/987654',
    });

    expect(result.text).not.toContain('8 (495) 123-45-67');
    expect(result.text).not.toContain('+79261112233');
    expect(result.hasHiddenContacts).toBe(true);
    expect(result.isActionable).toBe(true);
  });

  it('case 6: masks DM / PM triggers with personal handles', () => {
    const raw = 'Нужен парсер на Python. DM @recruiter_olga для получения ТЗ.';
    const result = scrubPII(raw, {
      channel: 'python_dev_feed',
    });

    expect(result.text).toContain('DM [contact hidden]');
    expect(result.text).not.toContain('@recruiter_olga');
    expect(result.sourceChannelHandle).toBe('@python_dev_feed');
    expect(result.isActionable).toBe(true);
  });

  it('case 7: masks tg: trigger with handle and trailing contact info', () => {
    const raw = 'Backend Node.js (NestJS). Связь: tg: @hr_lead_anna';
    const result = scrubPII(raw, {
      url: 'https://t.me/s/nodejs_jobs/1234',
    });

    expect(result.text).toContain('[contact hidden]');
    expect(result.text).not.toContain('@hr_lead_anna');
    expect(result.sourceChannelHandle).toBe('@nodejs_jobs');
    expect(result.isActionable).toBe(true);
  });

  it('case 8: normalizes channel handle passed without @ symbol', () => {
    const raw = 'Вакансия DevOps инженер';
    const result = scrubPII(raw, {
      channel: 'devops_jobs',
    });

    expect(result.sourceChannelHandle).toBe('@devops_jobs');
    expect(result.isActionable).toBe(true);
  });

  it('case 9: standard public web vacancy URL is recognized as actionable without hiding non-contact text', () => {
    const raw = 'Senior Fullstack Engineer ($150k-$200k). Remote worldwide.';
    const result = scrubPII(raw, {
      url: 'https://remoteok.com/remote-jobs/12345-senior-fullstack',
    });

    expect(result.isActionable).toBe(true);
    expect(result.hasHiddenContacts).toBe(false);
    expect(result.text).toBe(raw);
  });

  it('case 10: masks multiple combined contact details in a single post', () => {
    const raw = 'Срочный проект! Телефон: +7 (903) 123-45-67, email: jobs@techcorp.io, писать в личку @lead_dev';
    const result = scrubPII(raw, {
      url: 'https://t.me/s/freelance_feed/55',
    });

    expect(result.text).not.toContain('+7 (903) 123-45-67');
    expect(result.text).not.toContain('jobs@techcorp.io');
    expect(result.text).not.toContain('@lead_dev');
    expect(result.hasHiddenContacts).toBe(true);
    expect(result.isActionable).toBe(true);
  });

  it('case 11: extracts channel handle from post header if not supplied in metadata', () => {
    const raw = 'Канал: @frontend_daily\nВакансия: React / TypeScript разработчик\nОтклик в лс @author';
    const result = scrubPII(raw);

    expect(result.sourceChannelHandle).toBe('@frontend_daily');
    expect(result.text).not.toContain('@author');
    expect(result.isActionable).toBe(true);
  });

  it('case 12: handles empty or blank string gracefully', () => {
    const result = scrubPII('');
    expect(result.text).toBe('');
    expect(result.isActionable).toBe(false);
    expect(result.hasHiddenContacts).toBe(false);
  });

  it('case 13: masks wa.me direct links with phone numbers', () => {
    const raw = 'Срочный заказ на верстку. WhatsApp: https://wa.me/79991234567';
    const result = scrubPII(raw);

    expect(result.text).not.toContain('https://wa.me/79991234567');
    expect(result.text).toContain('[contact hidden]');
    expect(result.hasHiddenContacts).toBe(true);
  });

  it('case 14: masks t.me direct contact link preceded by contact trigger', () => {
    const raw = 'Ищем Go разработчика. Писать: https://t.me/hr_recruiter_m';
    const result = scrubPII(raw, { channel: 'golang_channel' });

    expect(result.text).not.toContain('https://t.me/hr_recruiter_m');
    expect(result.text).toContain('[contact hidden]');
    expect(result.hasHiddenContacts).toBe(true);
  });

  it('helpers: extractPublicChannelHandle and isPrivateInternalUrl work correctly', () => {
    expect(extractPublicChannelHandle('https://t.me/s/my_channel/123')).toBe('@my_channel');
    expect(extractPublicChannelHandle('https://t.me/my_channel')).toBe('@my_channel');
    expect(extractPublicChannelHandle('https://t.me/c/12345/67')).toBeUndefined();
    expect(extractPublicChannelHandle('@good_channel')).toBe('@good_channel');

    expect(isPrivateInternalUrl('https://t.me/c/12345/67')).toBe(true);
    expect(isPrivateInternalUrl('https://t.me/joinchat/Abc123xyz')).toBe(true);
    expect(isPrivateInternalUrl('https://t.me/s/public_channel/123')).toBe(false);
    expect(isPrivateInternalUrl('https://hh.ru/vacancy/123')).toBe(false);
  });
});
