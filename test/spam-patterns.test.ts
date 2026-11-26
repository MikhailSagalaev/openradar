import { describe, expect, it } from 'vitest';
import { spamReasons } from '../src/core/rules.ts';

describe('spam patterns tightened after the 2026-11 audit', () => {
  it('catches mass messaging with the «массой отправке» typo and «отправка личных»', () => {
    expect(
      spamReasons(
        'массовая отправка личных сообщений в социальной сети',
        'есть большая база людей, нужно помощь в массой отправке сообщений\rбаза 10к',
      ),
    ).toContain('spam:MASS_MESSAGING');
  });

  it('still catches a plain mass rassylka', () => {
    expect(spamReasons('Массовая рассылка в whatsapp', 'Нужна рассылка по базе')).toContain('spam:MASS_MESSAGING');
  });

  it('keeps a legitimate dev task about bulk email over SMTP', () => {
    expect(
      spamReasons('Настроить массовую отправку писем через SMTP', 'Нужно настроить отправку писем через SMTP для CRM'),
    ).toEqual([]);
  });

  it('catches social-account recovery in Russian and Spanish', () => {
    expect(spamReasons('Восстановление аккаунта Instagram', 'Нужно восстановить доступ к аккаунту инстаграм')).toContain('spam:GREY_FINANCE');
    expect(
      spamReasons('Recuperación Urgente de Instagram Bloqueado', 'Buscamos profesional con experiencia en la recuperación de cuentas de Instagram'),
    ).toContain('spam:GREY_FINANCE');
  });

  it('keeps a legitimate cloud-account recovery task', () => {
    expect(spamReasons('Восстановить доступ к AWS аккаунту', 'Потеряли root доступ к AWS, нужно восстановить')).toEqual([]);
  });

  it('no longer hides engineering, dropshipping or SEO posts via a bare «дроп» substring', () => {
    expect(spamReasons('Инженер-гидролог', 'Вакансия компании: Гидропроект, инженерно-гидрологические изыскания')).toEqual([]);
    expect(spamReasons('Машинист автогидроподъемника', 'Работа на автогидроподъемнике, недропользование')).toEqual([]);
    expect(spamReasons('Разработка скрипта автоматизации дропшиппинга avito api', 'Нужен скрипт для дропшиппинга')).toEqual([]);
    expect(spamReasons('Нужно запустить 5 сайтов на дропах', 'SEO, домен дроп со ссылочной историей')).toEqual([]);
  });

  it('still catches the unambiguous money-mule term', () => {
    expect(spamReasons('Нужен дроповод', 'Обнал карт, дроповод с опытом')).toContain('spam:GREY_FINANCE');
  });
  it('rejects Telegram resume compilations, candidate digests, and bootcamp/event ads', () => {
    expect(spamReasons('Резюме за 25 ноября (1/2)', '1. Резюме Fullstack Developer от @candidate, от 80 000₽')).toContain('spam:JOB_SEEKER');
    expect(spamReasons('Лучшие резюме и вакансии за 25 ноября (1/6)', 'Подборка резюме и вакансий')).toContain('spam:JOB_SEEKER');
    expect(spamReasons('Дайджест резюме | На расхват у HR — 8 кандидатов!', '1. Резюме: Backend Developer')).toContain('spam:JOB_SEEKER');
    expect(spamReasons('Сотни откликов, а в ответ тишина', 'Мы запустили новый курс-буткемп для аналитиков')).toContain('spam:CHANNEL_NOISE');
    expect(spamReasons('Коучинг для лидеров', 'Евгений как психолог и ментор работает именно с этим запросом')).toContain('spam:SERVICE_OFFER');
    expect(spamReasons('Куда сходить 28 ноября — 4 декабря', 'Собрали митапы в новом дайджесте от Yandex for Developers')).toContain('spam:CHANNEL_NOISE');
    expect(spamReasons('Backend Python Developer', 'Желаемая должность: Python Developer\nОжидаемая ЗП: от 220 000 ₽\nМой стек: FastAPI, PostgreSQL')).toContain('spam:JOB_SEEKER');
    expect(spamReasons('Frontend React', 'В активном поиске работы, открыт к предложениям о работе')).toContain('spam:JOB_SEEKER');
  });
});
