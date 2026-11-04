import { describe, expect, it } from 'vitest';
import { isOutletName } from '../src/core/company.ts';
import { extractBudgetAndCurrency } from '../src/core/extract.ts';
import { estimateMarket } from '../src/core/market.ts';
import { prepareRawLead } from '../src/core/prepare.ts';
import { assessQuality, detectPostType } from '../src/core/quality.ts';
import { applyRules } from '../src/core/rules.ts';
import { normalizeSalary } from '../src/core/salary.ts';
import { salaryLooksWrong } from '../src/core/salary-sanity.ts';
import { feedQuery, formatSubscriptionDigest } from '../src/core/subscriptions.ts';
import { decodeHtmlEntities, extractTechSkills } from '../src/core/text.ts';
import type { Lead, SourceRecord } from '../src/core/types.ts';
import { buildXRayResult } from '../src/core/xray.ts';
import { factsFill } from '../src/pipeline/liveness.ts';
import { rescoreLeads } from '../src/pipeline/rescore.ts';
import { classifyRole, deriveRecord, detectCompany, normalizePay, parsePayText } from '../src/research/derive.ts';
import { salaryOf } from '../src/research/facts.ts';
import { MemoryStore } from '../src/store/memory.ts';

const telegram = { kind: 'telegram' as const, config: {} };
const money = (text: string) => extractBudgetAndCurrency(text);

function lead(over: Partial<Lead>): Lead {
  return { id: 'x', sourceId: 's', externalId: 'x', title: 'T', titleKey: 'x', text: '', fingerprint: 'x', status: 'new', score: 60, reasons: [], createdAt: '2026-11-02T10:00:00.000Z', ...over };
}

describe('sums that are not pay', () => {
  it('leaves out ad budgets, every figure of the sentence', () => {
    expect(money('Опыт управления рекламными бюджетами от $100 000 в месяц').budget).toBeUndefined();
    expect(money('Опыт в рекламных бюджетах от $20 тыс., желательно от $50 тыс.').budget).toBeUndefined();
    expect(money('Нужен таргетолог, рекламный бюджет 100 000 ₽').budget).toBeUndefined();
  });

  it('keeps pay in the next sentence', () => {
    expect(money('Вёл рекламные бюджеты от $20 тыс. Зарплата 150 000 ₽').budget).toBe(150000);
  });

  it('leaves out profit, market statistics, subscriptions and big foreign money', () => {
    expect(money('сделаем запуск на 1.500.000₽+ чистой прибыли').budget).toBeUndefined();
    expect(money('Средняя зарплата в IT за год выросла на 17,7%, до 235 тыс. ₽').budget).toBeUndefined();
    expect(money('затем подписка за $39/мес').budget).toBeUndefined();
    expect(money('Аудитория СНГ, чек $2000–4000').budget).toBeUndefined();
    expect(money('Atari потратила до 25 миллионов долларов на права фильма').budget).toBeUndefined();
    expect(money('We raised $781M in Series D').budget).toBeUndefined();
  });

  it('leaves out bonuses and allowances named next to the sum', () => {
    expect(money('€10k signing bonus').budget).toBeUndefined();
    expect(money('$2,000 annual stipend').budget).toBeUndefined();
    expect(money('€3k travel budget').budget).toBeUndefined();
  });

  it('research reads amounts with the same reader', () => {
    expect(parsePayText('We raised $781M', 'job')).toBeUndefined();
    expect(parsePayText('Salary €30.000 per year', 'gig')).toMatchObject({ min: 30000, period: 'year' });
  });
});

describe('the ceiling', () => {
  it('shows no pay above any market', () => {
    const raw = { sourceId: 's', title: 'Менеджер', text: 'Предполагаемый уровень месячного дохода: от 3 000 000 ₽', type: 'job' as const };
    const prepared = prepareRawLead(raw, { id: 's', kind: 'rss', config: {} } as SourceRecord, new Date());
    expect(prepared.budget).toBeUndefined();
    expect(prepared.normalizedUsdMax).toBeUndefined();
  });

  it('does not read a rouble figure as yearly pay', () => {
    expect(normalizeSalary({ budget: 3_000_000, currency: 'RUB', type: 'job' }).implausible).toBe(true);
  });

  it('still reads large dollar figures as yearly', () => {
    const info = normalizeSalary({ budget: 180_000, currency: 'USD', type: 'job' });
    expect(info.implausible).toBeUndefined();
    expect(info.normalizedUsdMax).toBe(15_000);
  });

  it('flags stored pay above the ceiling', () => {
    expect(salaryLooksWrong({ type: 'job', paymentPeriod: 'monthly', normalizedUsdMax: 2_000_000 }, new Map())).toBe(true);
  });

  it('ignores a year mentioned away from the amount', () => {
    expect(normalizeSalary({ text: 'Salary $8000 a month. 25 days of annual leave.', budget: 8000, currency: 'USD', type: 'job' }).normalizedUsdMax).toBe(8000);
  });
});

describe('ads, services and roundups', () => {
  it('flags a marked webinar that mentions candidates without experience', () => {
    const text = '40% IT-вакансий открыты для кандидатов без опыта. Средняя зарплата в IT выросла. Поговорим на бесплатном вебинаре Хекслета. #реклама';
    expect(assessQuality({ type: 'gig', title: 'Опоздали в IT из-за нейросетей? Нет', text }, telegram).flags).toContain('channel_ad');
  });

  it('rejects #услуги and flags the ones already stored', () => {
    const text = '#услуги #SMM\nSMM-агентство предлагает готовые пакеты контента. START 18 900 ₽, PREMIUM 48 900 ₽';
    expect(assessQuality({ type: 'gig', title: 'SMM-агентство', text }, telegram).flags).toContain('channel_ad');
    const prepared = prepareRawLead({ sourceId: 's', title: 'SMM-агентство', text }, { id: 's', kind: 'telegram', config: {} } as SourceRecord, new Date());
    expect(applyRules(prepared, { id: 's', kind: 'telegram', config: {} } as SourceRecord, new Date()).reasons).toContain('spam:SERVICE_OFFER');
  });

  it('finds a roundup announced on the second line', () => {
    const text = 'Но мы против стереотипов — ловите вакансий с классными плюшками\nIT Director в NDA\nот 330 000₽';
    expect(assessQuality({ type: 'gig', title: 'Что-то вкусное обычно оставляют на десерт', text }, telegram).flags).toEqual(['digest']);
  });

  it('flags a job channel\'s story, not its vacancy', () => {
    const source = { kind: 'telegram' as const, config: { channel: 'habr_career' } };
    const story = 'Игра разошлась миллионами копий, но покупатели начали её возвращать. Часть картриджей закопали в пустыне.';
    expect(assessQuality({ type: 'gig', title: 'Atari потратила на права фильма больше всех', text: story }, source).flags).toContain('channel_ad');
    expect(assessQuality({ type: 'gig', title: 'Python-разработчик в Acme', text: 'Удалёнка, стек Django.' }, source).flags).toEqual([]);
  });
});

describe('vacancy or order', () => {
  it('reads a dash after «зарплата» and official employment', () => {
    const text = 'Python-тимлид, зарплата — 250–400 тыс. ₽. Официальное оформление.';
    expect(detectPostType({ type: 'gig', title: 'Greenway Global', text }, telegram)).toBe('job');
  });

  it('reads «что предстоит делать» and a trial month', () => {
    expect(detectPostType({ type: 'gig', title: 'Ищем SEO-копирайтера', text: 'Что предстоит делать: писать статьи. Полная занятость.' }, telegram)).toBe('job');
    expect(detectPostType({ type: 'gig', title: 'Ищу ассистента', text: 'График 5/2. Первый месяц (испытательный).' }, telegram)).toBe('job');
  });

  it('reads yearly pay as a salary', () => {
    expect(detectPostType({ type: 'gig', title: 'Front-End AI-инженер', text: '$54K - $205K/год\nОбязанности: писать код' }, telegram)).toBe('job');
  });

  it('takes a post of a job channel for a vacancy, a task in it for a task', () => {
    const source = { kind: 'telegram' as const, config: { channel: '@remote_jobs_ru' } };
    expect(detectPostType({ type: 'gig', title: 'Designer', text: 'Удалённо' }, source)).toBe('job');
    expect(detectPostType({ type: 'gig', title: 'Логотип', text: 'Нужно сделать логотип, бюджет: 5000' }, source)).toBe('gig');
    expect(detectPostType({ type: 'gig', title: 'Designer', text: 'Удалённо', channel: 'proglib_jobs' }, { kind: 'telegram-account' })).toBe('job');
  });

  it('keeps everything on a freelance exchange an order', () => {
    const source = { id: 's', kind: 'rss', config: {} } as SourceRecord;
    expect(prepareRawLead({ sourceId: 's', type: 'job', title: 'Вакансия фрилансера', text: 'x', url: 'https://kwork.ru/projects/1' }, source, new Date()).type).toBe('gig');
  });

  it('a job board beats the type an adapter gave', () => {
    const source = { id: 's', kind: 'rss', config: {} } as SourceRecord;
    expect(prepareRawLead({ sourceId: 's', type: 'gig', title: 'Director of Development', text: 'x', url: 'https://himalayas.app/companies/a/jobs/b' }, source, new Date()).type).toBe('job');
  });

  it('reads «заработная плата» as a vacancy sign', () => {
    expect(detectPostType({ type: 'gig', title: 'Ищем копирайтера', text: 'Что предстоит делать: статьи. Заработная плата от 100000 рублей' }, telegram)).toBe('job');
  });

  it('keeps job boards vacancies in research', () => {
    expect(deriveRecord(lead({ type: 'gig', url: 'https://nodesk.co/remote-jobs/x/', title: 'Designer' })).type).toBe('job');
  });
});

describe('roles', () => {
  it('a marketer using AI is a marketer, someone who builds it is an AI engineer', () => {
    expect(classifyRole('job', 'Маркетолог со знанием нейросетей')).toBe('marketing');
    expect(classifyRole('job', 'Дизайнер с ИИ')).toBe('design');
    expect(classifyRole('job', 'LLM Engineer')).toBe('ai');
    expect(classifyRole('job', 'Разработчик нейросетей')).toBe('ai');
    expect(classifyRole('job', 'Специалист по нейросетям')).toBe('ai');
  });

  it('a profession beats the bare word «engineer»', () => {
    expect(classifyRole('job', 'Sales Engineer')).toBe('sales');
    expect(classifyRole('job', 'Developer Support Engineer')).toBe('support');
    expect(classifyRole('job', 'Senior Engineer')).toBe('backend');
    expect(classifyRole('job', 'Sr. Process Engineer')).toBe('other');
  });

  it('names sales, HR and customer success roles', () => {
    expect(classifyRole('job', 'Account Executive, SMB')).toBe('sales');
    expect(classifyRole('job', 'Talent Sourcer')).toBe('hr');
    expect(classifyRole('job', 'Customer Success Manager')).toBe('support');
  });

  it('does not take «opportunity» for Unity', () => {
    expect(classifyRole('job', 'Equal Opportunity Officer')).toBe('other');
  });

  it('a vague Russian title takes the opening of the text', () => {
    const r = deriveRecord(lead({ type: 'job', title: 'Специалист', text: 'Вакансия компании: Х\nМенеджер по продажам в отдел B2B' }));
    expect(r.role).toBe('sales');
  });
});

describe('employers', () => {
  it('a channel, a board or a placeholder is no employer', () => {
    for (const name of ['Хабр Карьера', 'marketing jobs — вакансии для маркетологов', 'Компания скрыта (Fintech)', 'careerspace', '@jobs', 'IT Job Hub | Работа и вакансии']) {
      expect(isOutletName(name)).toBe(true);
    }
    expect(isOutletName('Сбер')).toBe(false);
    expect(isOutletName('Job Station', 'Job Station')).toBe(true);
  });

  it('falls back to the name in the text', () => {
    expect(detectCompany({ type: 'job', author: 'Хабр Карьера', text: 'Компания: Acme\nПродакт' })).toBe('Acme');
    expect(detectCompany({ type: 'job', author: 'careerspace', text: 'Продакт' })).toBeUndefined();
  });

  it('builds no searches for a channel', () => {
    expect(buildXRayResult({ company: 'IT Job Hub | Работа' }).cleanCompany).toBe('');
  });
});

describe('research pay', () => {
  it('a budget field beats a sum in the description', () => {
    const r = deriveRecord(lead({ type: 'gig', url: 'https://kwork.ru/projects/1', budget: 200000, currency: 'RUB', text: 'Обещаем 750 000 ₽ оборота и 750 000 ₽ вам' }));
    expect(r.pay).toBe(200000);
  });

  it('caps a large sum in the description of an exchange post', () => {
    expect(deriveRecord(lead({ type: 'gig', url: 'https://fl.ru/projects/1', text: 'Заработаете 900 000 ₽' })).pay).toBeUndefined();
    expect(deriveRecord(lead({ type: 'gig', url: 'https://t.me/x/1', text: 'Плачу 900 000 ₽' })).pay).toBe(900000);
  });

  it('caps pay read from text, keeping the lower bound of a boastful range', () => {
    expect(normalizePay({ min: 3_000_000, max: 3_000_000, currency: 'RUB', period: 'month', origin: 'text' }, 'job')).toBeUndefined();
    expect(normalizePay({ min: 400_000, max: 5_000_000, currency: 'RUB', period: 'month', origin: 'text' }, 'job')?.point).toBe(400_000);
    expect(normalizePay({ min: 2_000_000, max: 2_000_000, currency: 'RUB', period: 'month', origin: 'page' }, 'job')?.point).toBe(2_000_000);
    expect(normalizePay({ min: 5_000_000, max: 5_000_000, currency: 'RUB', period: 'project', origin: 'text' }, 'gig')).toBeUndefined();
    expect(normalizePay({ min: 5_000_000, max: 5_000_000, currency: 'RUB', period: 'project', origin: 'budget' }, 'gig')?.point).toBe(5_000_000);
  });

  it('leaves ads and roundups out', () => {
    const r = deriveRecord(lead({ type: 'job', text: 'от 330 000 ₽', metadata: { qualityFlags: ['digest'] } }));
    expect(r.excluded).toBe(true);
    expect(r.pay).toBeUndefined();
  });

  it('turns a day and a week rate into a month', () => {
    expect(salaryOf({ baseSalary: { currency: 'RUB', value: { value: 6000, unitText: 'DAY' } } })).toMatchObject({ min: 126000, period: 'month' });
    expect(salaryOf({ baseSalary: { currency: 'USD', value: { value: 1500, unitText: 'WEEK' } } })).toMatchObject({ min: 6495, period: 'month' });
  });

  it('marks yearly pay from page markup', () => {
    const fill = factsFill({ salary: { min: 120000, max: 120000, currency: 'USD', period: 'year' } }, 'job');
    expect(fill.rawSalary).toBe('120000–120000 USD per year');
    expect(fill.paymentPeriod).toBe('monthly');
    expect(fill.normalizedUsdMax).toBe(10000);
  });
});

describe('skills', () => {
  it('a brand is not a trade', () => {
    expect(extractTechSkills('Аналитик данных (Авито Путешествия)')).not.toContain('Авито');
    expect(extractTechSkills('Старший C#-разработчик в Ozon')).not.toContain('Маркетплейсы');
    expect(extractTechSkills('Лендинг: ссылка на Авито и скриншоты отзывов с Ozon')).toEqual([]);
    expect(extractTechSkills('Благо есть GPT, который поможет оформить ТЗ')).toEqual([]);
  });

  it('the trade itself still counts', () => {
    expect(extractTechSkills('Продвижение объявлений на Авито')).toContain('Авито');
    expect(extractTechSkills('Карточки товаров на Wildberries')).toContain('Маркетплейсы');
    expect(extractTechSkills('Бот на базе GPT-4')).toContain('GPT');
  });

  it('knows the tools of the new tasks', () => {
    expect(extractTechSkills('Доработать проект из Cursor, обучить LoRA в ComfyUI')).toEqual(expect.arrayContaining(['Cursor', 'LoRA', 'ComfyUI']));
  });
});

describe('text', () => {
  it('decodes accented letters', () => {
    expect(decodeHtmlEntities('B&uacute;squeda en Espa&ntilde;a, &Eacute;tat')).toBe('Búsqueda en España, État');
    expect(decodeHtmlEntities('&unknown;')).toBe('&unknown;');
  });
});

describe('market estimate', () => {
  const priced = (id: string, title: string, usd: number, type: 'job' | 'gig' = 'gig'): Lead => lead({ id, title, type, normalizedUsdMin: usd, normalizedUsdMax: usd });

  it('compares a query with posts in its language', () => {
    const leads = [1, 2, 3].map((i) => priced(`e${i}`, `Logo design ${i}`, 50));
    expect(estimateMarket({ title: 'Логотип', type: 'gig' }, leads).basis).toBe('none');
  });

  it('leaves out pay that looks wrong', () => {
    const leads = [priced('a', 'Менеджер логистики', 3000, 'job'), priced('b', 'Менеджер логистики', 2000, 'job'), priced('c', 'Менеджер логистики', 2500, 'job'), priced('d', 'Менеджер логистики', 2_000_000, 'job')];
    expect(estimateMarket({ title: 'Менеджер логистики', type: 'job' }, leads).usd?.p75).toBeLessThan(3001);
  });
});

describe('digests', () => {
  const digest = (over: Partial<Lead>) => formatSubscriptionDigest({ name: 'n', filters: {} }, [lead({ title: 'Роль', type: 'job', ...over })], false, 'https://x');

  it('says the period of the pay', () => {
    expect(digest({ budget: 150000, currency: 'RUB', normalizedUsdMax: 1800 })).toContain('₽/мес');
    expect(digest({ budget: 120000, currency: 'USD', rawSalary: '120000 USD per year', normalizedUsdMax: 10000 })).toContain('USD/год');
  });

  it('sends no pay that looks wrong', () => {
    expect(digest({ budget: 100000, currency: 'USD', normalizedUsdMax: 100000 })).not.toContain('100');
  });

  it('a subscription without a language follows every language, as the user chose', () => {
    expect(feedQuery({ q: 'x' })).toContain('language=all');
  });
});

describe('repair of stored leads', () => {
  async function stored(over: Partial<Lead>, kind = 'telegram'): Promise<{ store: MemoryStore; id: string }> {
    const store = new MemoryStore();
    const source = await store.createSource({ kind: kind as SourceRecord['kind'], title: 's', config: {} });
    await store.insertLead(lead({ sourceId: source.id, ...over }));
    return { store, id: over.id ?? 'x' };
  }

  it('drops a figure that was read from the text and is not pay', async () => {
    const { store, id } = await stored({ type: 'job', title: 'Paid Social Lead', text: 'О НАС: школа. Опыт управления рекламными бюджетами от $100 000. Полная занятость.', budget: 100000, currency: 'USD', rawSalary: '100000 USD', normalizedUsdMax: 100000 });
    const summary = await rescoreLeads(store, { money: true });
    expect(summary.repriced).toBe(1);
    const lead = await store.getLead(id);
    expect(lead?.budget).toBeUndefined();
    expect(lead?.normalizedUsdMax).toBeUndefined();
  });

  it('keeps a budget from the board\'s own field and applies today\'s rate', async () => {
    const { store, id } = await stored({ type: 'gig', title: 'Логотип', text: 'Нарисовать логотип для магазина', budget: 2000, currency: 'UAH', rawSalary: '2000 UAH', normalizedUsdMax: 48 }, 'rss');
    await rescoreLeads(store, { money: true });
    const lead = await store.getLead(id);
    expect(lead?.budget).toBe(2000);
    expect(lead?.normalizedUsdMax).toBe(44);
  });

  it('reads a channel post again whatever figure it stored', async () => {
    const text = 'Запуски принесли 1,3 млн ₽ выручки. При чистой прибыли 900 000 ₽ ваши 5% составят 45 000 ₽';
    const { store, id } = await stored({ type: 'gig', title: 'Контент-менеджер', text, budget: 900000, currency: 'RUB', rawSalary: '900000 RUB', normalizedUsdMax: 11172 });
    await rescoreLeads(store, { money: true });
    expect((await store.getLead(id))?.budget).toBeUndefined();
  });

  it('drops a skill that came from a mention', async () => {
    const { store, id } = await stored({ type: 'gig', title: 'Создание лэндинга', text: 'Ссылка на Авито', skills: ['Авито', 'Figma'] });
    await rescoreLeads(store, { money: true });
    expect((await store.getLead(id))?.skills).toEqual(['Figma']);
  });
});
