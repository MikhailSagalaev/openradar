import { describe, expect, it } from 'vitest';
import { extractSkills } from '../src/core/text.ts';

/** Issue #71, point 3: trades come from the role, not from the company blurb or the benefits. */
describe('extractSkills: trades from the title and requirements only', () => {
  it('does not tag sales roles as development or recruiting', () => {
    const ae = extractSkills(
      'Commercial Account Executive - Australia',
      'We build the developer platform used by 10,000 teams. Our HR team will support your onboarding.\nYou will own the full sales cycle with mid-market accounts.',
    );
    expect(ae).toContain('Продажи');
    expect(ae).not.toContain('Разработка');
    expect(ae).not.toContain('Рекрутинг');

    const director = extractSkills(
      'Директор по продажам и развитию бизнеса (Нефть, газ, химия)',
      'О компании\nНаш HR поможет с адаптацией, а разработчики внутренних систем сделают удобный CRM.\nВ работе постоянное тестирование гипотез и аналитика рынка.',
    );
    expect(director).not.toContain('Рекрутинг');
    expect(director).not.toContain('Разработка');
    expect(director).not.toContain('Тестирование');
  });

  it('keeps the trade a recruiter post names, and only that one', () => {
    const recruiter = extractSkills(
      'Recruiter, GTM (EMEA)',
      'You will hire account executives and partner with our developer relations team.',
    );
    expect(recruiter).toContain('Рекрутинг');
    expect(recruiter).not.toContain('Разработка');
  });

  it('reads trades in the requirements block but not in the benefits', () => {
    const skills = extractSkills(
      'Senior Backend Engineer',
      [
        'Мы финтех, пишем платёжное ядро на Go и PostgreSQL.',
        'Требования:',
        '- 4+ года коммерческой разработки',
        '- пишете автотесты на свой код',
        'Мы предлагаем:',
        '- ДМС и HR-поддержку',
        '- курсы по маркетингу и аналитике',
      ].join('\n'),
    );
    expect(skills).toEqual(expect.arrayContaining(['Golang', 'PostgreSQL', 'Разработка', 'Тестирование']));
    expect(skills).not.toContain('Рекрутинг');
    expect(skills).not.toContain('Маркетинг');
    expect(skills).not.toContain('Аналитика');
  });

  it('reads the lines under a Telegram title that is only the first line of the post', () => {
    const text = '#вакансия\nИщем тестировщика в продуктовую команду\nУдалённо, полный день\n\nНаш HR ответит на вопросы.';
    const skills = extractSkills('#вакансия', text);
    expect(skills).toContain('Тестирование');
    expect(skills).not.toContain('Рекрутинг');
  });
});
