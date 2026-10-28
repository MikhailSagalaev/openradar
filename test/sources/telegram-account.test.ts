import { describe, expect, it } from 'vitest';
import { createSourceRegistry } from '../../src/sources/index.ts';
import {
  chatsOf,
  messageToRawLead,
  normalizeChat,
  sessionEnvOf,
  telegramAccountSource,
} from '../../src/sources/telegram-account.ts';
import { makeSource, pollContext } from '../helpers.ts';

const text = 'Ищем дизайнера на лендинг, бюджет 30 000 ₽, пишите в личку';

describe('Telegram account source', () => {
  it('is registered', () => {
    expect(createSourceRegistry().get('telegram-account')).toBe(telegramAccountSource);
  });

  it('turns a private chat message into a private lead with the sender as contact', () => {
    const source = makeSource({ kind: 'telegram-account' });
    const lead = messageToRawLead(
      {
        id: 512,
        text,
        date: new Date('2026-10-28T09:00:00Z'),
        link: 'https://t.me/c/1234567890/512',
        sender: { username: 'Client_Anna', displayName: 'Анна' },
        chat: { id: -1001234567890, username: null, displayName: 'Закрытый чат заказов' },
      },
      source,
    )!;
    expect(lead.externalId).toBe('tgacc:-1001234567890:512');
    expect(lead.url).toBe('https://t.me/c/1234567890/512');
    expect(lead.author).toBe('@Client_Anna');
    expect(lead.contacts).toEqual([{ type: 'telegram', value: '@client_anna' }]);
    expect(lead.sourceRef).toMatchObject({ platform: 'telegram', visibility: 'private', channelTitle: 'Закрытый чат заказов', messageId: '512' });
  });

  it('marks public channels public and skips short messages', () => {
    const source = makeSource({ kind: 'telegram-account' });
    const chat = { id: -1009, username: 'freelance_jobs', displayName: 'Freelance jobs' };
    const lead = messageToRawLead({ id: 1, text, date: new Date(), chat }, source)!;
    expect(lead.sourceRef?.visibility).toBe('public');
    expect(lead.sourceRef?.channel).toBe('freelance_jobs');
    expect(messageToRawLead({ id: 2, text: 'Спасибо!', date: new Date(), chat }, source)).toBeNull();
  });

  it('reads chats and the session variable from the config', () => {
    expect(chatsOf(makeSource({ config: { chats: ['@jobs', ' -100123 '] } }))).toEqual(['@jobs', '-100123']);
    expect(normalizeChat('https://t.me/jobs')).toBe('jobs');
    expect(normalizeChat('-1001234567890')).toBe(-1001234567890);
    expect(sessionEnvOf(makeSource({ config: {} }))).toBe('RADAR_TELEGRAM_SESSION');
    expect(sessionEnvOf(makeSource({ config: { sessionEnv: 'RADAR_TELEGRAM_SESSION_WORK' } }))).toBe('RADAR_TELEGRAM_SESSION_WORK');
    // A source must not read other secrets of the server.
    expect(() => sessionEnvOf(makeSource({ config: { sessionEnv: 'DATABASE_URL' } }))).toThrow(/RADAR_TELEGRAM_SESSION/);
  });

  it('asks for the session before connecting anywhere', async () => {
    process.env.RADAR_TELEGRAM_API_ID = '12345';
    process.env.RADAR_TELEGRAM_API_HASH = 'abcdef';
    delete process.env.RADAR_TELEGRAM_SESSION_EMPTY;
    const source = makeSource({ kind: 'telegram-account', config: { chats: ['@jobs'], sessionEnv: 'RADAR_TELEGRAM_SESSION_EMPTY' } });
    await expect(telegramAccountSource.poll!(source, pollContext(''))).rejects.toThrow(/radar telegram login/);
    delete process.env.RADAR_TELEGRAM_API_ID;
    delete process.env.RADAR_TELEGRAM_API_HASH;
  });
});
