import { hasWorkOfferSignals, SERVICE_OFFER } from './quality.ts';
import { budgetUsd } from './salary.ts';
import { extractSkills, normalizeForMatch } from './text.ts';
import type { LeadStatus, SourceRecord } from './types.ts';
import type { PreparedLead } from './prepare.ts';

interface SpamRule {
  reason: string;
  pattern: RegExp;
}

/**
 * Rules are intentionally conservative: they only catch categories that are
 * unambiguously not a legitimate order. Everything else is left to the
 * optional LLM classifier and to the operator.
 */
const SPAM_RULES: SpamRule[] = [
  {
    reason: 'FAKE_REVIEWS',
    pattern:
      /(накрутк[а-я]*\s*(отзыв|лайк|просмотр|подписчик)|(?:купить|продать|написать|оставить)\s+(?:[а-я]+\s+){0,3}(?:отзыв|отзывы)|отзывы\s+за\s+деньги|платные\s+отзывы)/iu,
  },
  {
    reason: 'COLD_CALLING',
    pattern:
      /(холодн[а-я]*\s*(звонк|обзвон)|прозвон[а-я]*\s*(баз|клиент|лид)|обзвон\s+(базы|клиентов|номеров)|телемаркетинг)/iu,
  },
  {
    reason: 'MASS_MESSAGING',
    pattern:
      /(масс(?:ов|ой)[а-я]*\s+(?:рассылк|отправк[а-я]*\s+(?:личных|сообщени[а-я]*\s+в\s+(?:соц|личн|директ)))|рассылк[а-я]*\s+(сообщени|писем|в\s+(лс|личк|ватсап|whatsapp|тг|телеграм|viber))|инвайт[а-я]*|спам[а-я]*\s*рассылк|парсинг\s+(контактов|номеров|телефонов)|база\s+номеров)/iu,
  },
  {
    reason: 'BOTTING',
    pattern:
      /(накрутк[а-я]*\s*(просмотр|подписчик|лайк|ботов|поведенческ)|накрутить\s+(просмотры|лайки|подписчиков)|боты\s+для\s+(просмотров|лайков))/iu,
  },
  {
    reason: 'GREY_FINANCE',
    pattern:
      // «дроповод» is the unambiguous money-mule term; a bare «дроп» stem also matched
      // «гидропроект», «недропользователь», «дропшиппинг» and SEO dropped domains, hiding
      // legitimate engineering and e-commerce posts, so it is deliberately not used.
      /(дроповод[а-я]*|обнал[а-я]*|оформлени[а-я]*\s+карт[а-я]*\s+на\s+себя|аренда\s+(аккаунт|лс|ватсап)|верификац[а-я]*\s+(кошельк|бирж|авито)|оплата\s+за\s+верификац|(?:восстановлени[ея]|восстановить|разблокировк[аи]|разблокировать|разбан[а-я]*|recuperaci[oó]n|recuperar|recover(?:y)?|unban)[\s\S]{0,60}?(?:instagram|инстаграм|facebook|фейсбук|whatsapp|ватсап|tiktok|тикток|вконтакте|одноклассник))/iu,
  },
  {
    reason: 'ACADEMIC_FRAUD',
    pattern:
      /(дипломн[а-я]*\s+на\s+заказ|курсов[а-я]*\s+на\s+заказ|заказать\s+(диплом|курсовую|вкр)|написать\s+(диплом|курсовую|вкр)\s+за\s+меня)/iu,
  },
  {
    reason: 'EXPLOITATIVE_OFFER',
    pattern:
      /(за\s+\d+\s*(?:сообщений|людей)\s*плачу\s*\d+|оплата\s*1\s*руб[а-я]*\s*за\s*(сообщение|клиента)|лайкать\s+посты\s+за\s+копейки)/iu,
  },
  {
    reason: 'COMMISSION_ONLY',
    pattern:
      /(не\s+платим\s+(фиксированн[а-я]*|ставк[а-я]*)|оплата\s+(только|строго)?\s*за\s+процент\s+от\s+(продаж|дохода|чека)|пробное\s+задание\s+(бесплатно|за\s+отзыв)|партнерск[а-я]*\s+программ[а-я]*\s+с\s+%\s+от\s+дохода|\b\d+%\s*(?:за|от)\s*(?:каждого\s+)?клиента|лидогенератор[а-я]*\s+и\s+партн[её]р|партн[её]р[а-я]*\s+(?:за\s+процент|на\s+разработку\s+за\s+%|за\s+%\s+от\s+клиент)|ищу\s+лидогенератор)/iu,
  },
  {
    reason: 'MICRO_TASKS',
    pattern:
      /(зарегистрироваться\s+по\s+реферальн|пройти\s+опрос\s+за\s+деньги|скачать\s+приложение\s+за\s+оплату|прием\s+звонков\s+от\s+банков|перейти\s+по\s+ссылке\s+temu|перейти\s+по\s+ссылк[еи].*нового\s+аккаунта|установить\s+приложение\s+за\s+(?:деньги|оплату)|оплата\s+за\s+установку\s+приложени|скачать\s+и\s+оставить\s+отзыв)/iu,
  },
  {
    reason: 'CHANNEL_NOISE',
    pattern:
      /(?:channel\s+photo\s+updated|узнать\s+стоимость\s+и\s+условия\s+размещения\s*:?\s*@|по\s+вопросам\s+размещения\s*(?:вакансий|рекламы)\s*:?\s*@|стоимость\s+публикации\s*:?\s*@)/iu,
  },
  {
    reason: 'RESALE_OR_RENTAL',
    pattern:
      /(?:^|[^\p{L}])(?:продам|продаю|продается|продаётся|сдам|сдается|сдаётся)\s+(?:[а-я]+\s+){0,3}(?:квартир|дом|комнат|кроват|диван|машин|авто|телефон|ноутбук|велосипед)/iu,
  },
  {
    // «Remote data entry, 2000 EUR»: easy work for foreign-currency pay is the classic
    // advance-fee scam. Data entry for roubles (Kwork, FL.ru) passes.
    reason: 'DATA_ENTRY_SCAM',
    pattern:
      /(?:ввод[а-я]*\s+данных|data\s+entry|набор[а-я]*\s+текст)[\s\S]{0,200}?(?:\d[\d\s.,]*\s*(?:eur|€|usd|\$|долл)|(?:€|\$)\s*\d)/iu,
  },
  {
    // Posts by people looking for work. Bare «резюме» or «вакансия» are not enough: employers
    // write «присылайте резюме», and orders mention a «сайт-резюме» or scraping vacancies.
    // Job chats tag a CV «#резюме» / «#resume» and a contractor's offer of services «#помогу».
    reason: 'JOB_SEEKER',
    pattern:
      /(?:^|[^\p{L}])(?:ищу\s+(?:работу|подработку|заказы|заказчиков|вакансию|позици[юи])|(?:мо[ёе]|прикладываю|прилагаю)\s+резюме|рассмотрю\s+(?:предложения|вакансии))|#(?:резюме|resume|cv|помогу)(?![\p{L}\d_])|(?:^|\n)\s*(?:(?:лучшие|свежие|новые)\s+)?резюме\s+(?:и\s+вакансии\s+)?за\s+\d{1,2}\s+(?:январ|феврал|март|апрел|ма[йя]|июн|июл|август|сентябр|октябр|ноябр|декабр)|(?:^|\n)\s*(?:дайджест|подборка|топ|база)\s+резюме(?![\p{L}])|(?:^|\n)\s*резюме\s+[^\n]{2,100}?\s+от\s+(?:@[\w_]+|\[контакт\s+скрыт\])\s*,\s*(?:от\s+)?(?:\d|\$|€|₽)|на\s+расхват\s+у\s+hr\s*[—–-]\s*[^\n]*кандидат|^\s*(?:резюме|cv|resume)\s*[:—–-]\s*\S/iu,
  },
  // An agency's price list or a post tagged #услуги offers work instead of asking for it.
  { reason: 'SERVICE_OFFER', pattern: SERVICE_OFFER },
  {
    reason: 'CHANNEL_NOISE',
    pattern: /(?:запустили|открыли)\s+(?:новый\s+)?курс[-\s]?буткемп|сотн[ия]\s+откликов,\s*а\s+в\s+ответ\s+тишина|в\s+новом\s+дайджесте\s+(?:от\s+)?yandex\s+for\s+developers/iu,
  },
];

export interface RuleResult {
  accepted: boolean;
  reasons: string[];
  score: number;
}

/**
 * The exact patterns added by the 2026-11 quality audit: the mass-messaging «отправка личных
 * сообщений» branch (the typo that slipped past the old «рассылка»-only pattern) and social-account
 * recovery/unban. The retroactive refilter pass tests only these by default, not whole spam
 * categories: older, broader stems (COLD_CALLING on sales jobs, the former bare «дроп» on
 * «гидропроект»/«дропшиппинг») would retroactively hide legitimate posts, which is an operator
 * product decision, not a cleanup.
 */
export const AUDIT_2026_11_PATTERNS: Array<{ reason: string; pattern: RegExp }> = [
  {
    reason: 'spam:MASS_MESSAGING',
    pattern: /масс(?:ов|ой)[а-я]*\s+отправк[а-я]*\s+(?:личных|сообщени[а-я]*\s+в\s+(?:соц|личн|директ))/iu,
  },
  {
    reason: 'spam:GREY_FINANCE',
    pattern: /(?:восстановлени[ея]|восстановить|разблокировк[аи]|разблокировать|разбан[а-я]*|recuperaci[oó]n|recuperar|recover(?:y)?|unban)[\s\S]{0,60}?(?:instagram|инстаграм|facebook|фейсбук|whatsapp|ватсап|tiktok|тикток|вконтакте|одноклассник)/iu,
  },
  {
    reason: 'spam:JOB_SEEKER',
    pattern: /(?:^|\n)\s*(?:(?:лучшие|свежие|новые)\s+)?резюме\s+(?:и\s+вакансии\s+)?за\s+\d{1,2}\s+(?:январ|феврал|март|апрел|ма[йя]|июн|июл|август|сентябр|октябр|ноябр|декабр)|(?:^|\n)\s*(?:дайджест|подборка|топ|база)\s+резюме(?![\p{L}])|(?:^|\n)\s*резюме\s+[^\n]{2,100}?\s+от\s+(?:@[\w_]+|\[контакт\s+скрыт\])\s*,\s*(?:от\s+)?(?:\d|\$|€|₽)|на\s+расхват\s+у\s+hr\s*[—–-]\s*[^\n]*кандидат|^\s*(?:резюме|cv|resume)\s*[:—–-]\s*\S/iu,
  },
  {
    reason: 'spam:SERVICE_OFFER',
    pattern: /как\s+(?:психолог|коуч|ментор|консультант)(?:\s+и\s+(?:психолог|коуч|ментор|консультант))?\s+работает\s+именно\s+с\s+этим/iu,
  },
  {
    reason: 'spam:CHANNEL_NOISE',
    pattern: /(?:запустили|открыли)\s+(?:новый\s+)?курс[-\s]?буткемп|сотн[ия]\s+откликов,\s*а\s+в\s+ответ\s+тишина|в\s+новом\s+дайджесте\s+(?:от\s+)?yandex\s+for\s+developers/iu,
  },
];

/** The audit-added spam reasons for a stored post, without the older broader rules. */
export function auditSpamReasons(title: string, text: string): string[] {
  const haystack = `${title}\n${text}`;
  const reasons: string[] = [];
  for (const { reason, pattern } of AUDIT_2026_11_PATTERNS) {
    if (pattern.test(haystack)) reasons.push(reason);
  }
  return reasons;
}

/**
 * The door spam categories alone, without a source's keyword/budget/age gates. Shared by
 * applyRules at ingest and by the retroactive refilter pass, so a stored lead is judged by
 * the same spam patterns a fresh one is. The data-entry foreign-currency special case reads
 * the title and the extracted currency, exactly as ingest does.
 */
export function spamReasons(title: string, text: string, currency?: string): string[] {
  const haystack = `${title}\n${text}`;
  for (const rule of SPAM_RULES) {
    const isDataEntryForeignCurrency =
      rule.reason === 'DATA_ENTRY_SCAM' &&
      (currency === 'EUR' || currency === 'USD') &&
      /(?:ввод[а-я]*\s+данных|data\s+entry|набор[а-я]*\s+текст)/iu.test(title);
    if (rule.pattern.test(haystack) || isDataEntryForeignCurrency) {
      return [`spam:${rule.reason}`];
    }
  }
  return [];
}

/** Explicit offline / blue-collar / retail-store / medical positions out of scope when focused on IT/digital/creative. */
const OFFLINE_NON_DIGITAL_TITLE_RE =
  /(?:^|[^\p{L}])(?:пиццамейкер|сушист|кассир|повар|помощник\s+повара|пекарь|бариста|официант|бармен|хостес|горничн[а-я]*|уборщи[кца]+|клинер|дворник|мойщи[кца]+|грузчик|кладовщик|комплектовщик|сборщик\s+заказов|фасовщи[кца]+|(?:работник|сотрудник)\s+(?:кухни|общепита|пвз|пункта\s+выдач[а-я]*|склада|торгового\s+зала)|(?<!руко|произ)водител[ья](?![\p{L}])|шоф[её]р|авто?курьер|курьер|экспедитор|мерчендайзер|продавец(?:[-\s]+кассир|[-\s]+консультант)?|менеджер\s+по\s+продажам\s+(?:автомобил[а-яё]*|запчаст[а-яё]*|автозапчаст[а-яё]*|недвижимост[а-яё]*|окон|дверей|мебели)|заведующ[а-я]+\s+(?:кассой|магазином|аптекой|складом)|менеджер\s+(?:в\s+отделение|по\s+работе\s+с\s+залогами|торгового\s+зала)|оператор\s+1[сc]|бухгалтер(?![-\s]+аналитик)|охранник|сторож|слесарь|токарь|фрезеровщик|сварщик|сантехник|швея|закройщик|маляр|плотник|разнорабочий|электромонтажник|(?:инженер[-\s]?)?монтажник|электромеханик|медсестр[а-я]*|медицинск[а-я]+\s+сестр[а-я]*|медбрат|фельдшер|фармацевт|провизор|ветеринар|агроном|зоотехник|инженер\s+пто|геодезист|сметчик|grünflächenpflege|nuclear\s+technician|buitendienstmonteur|forklift|delivery\s+driver|warehouse\s+(?:worker|associate)|housekeeper|cashier|line\s+cook|bartender|waiter|waitress|janitor|security\s+guard|nurse|pharmacist|truck\s+driver)(?![\p{L}])/iu;

/** Digital, IT, product, marketing or creative title words that always belong even if a niche word appears (e.g. «сайт для кофейни»). */
const DIGITAL_CREATIVE_TITLE_ALLOWLIST_RE =
  /(?:разработ|программист|developer|software\s+engineer|devops|(?<![\p{L}])(?:sre|qa|ml|ai|ui|ux|bi|pr|smm|seo|aso|it|hr)(?![\p{L}])|(?:программист|разработчик|аналитик|консультант|внедрен\S*|архитектор)\s+1[сc]|1[сc][-\s]+(?:программист|разработчик|аналитик|консультант|битрикс)|тестировщик|аналитик|analyst|data\s+scien|нейросет|дизайнер|designer|арт[-\s]?директор|art\s+director|иллюстратор|3d|моушн|motion|видео|(?:видео[-\s]?монтаж[а-яё]*|(?<![\p{L}])монтаж(?:[ауе]|ом|ёр[а-яё]*|ер[а-яё]*)?(?![\p{L}]))|копирайтер|редактор|контент|маркетолог|таргетолог|директолог|продакт|product|проджект|project|техническ[а-я]+\s+специалист|сайт|лендинг|(?<![\p{L}])бот[а-я]*(?![\p{L}])|figma|python|golang|java|javascript|typescript|react|php|c\+\+|битрикс|тильд[ае]|tilda|wordpress|gamedev|геймдев|unity|unreal|рекрутер|digital|диджитал|креатив)/iu;

/** Returns a rejection reason when an unambiguous offline blue-collar title appears under IT/digital focus. */
export function nonDigitalReason(title: string): string | undefined {
  if (DIGITAL_CREATIVE_TITLE_ALLOWLIST_RE.test(title)) return undefined;
  if (OFFLINE_NON_DIGITAL_TITLE_RE.test(title)) return 'offtopic:non_digital';
  return undefined;
}

const TELEGRAM_CHAT_BANTER_RE =
  /(?:(?:знакомьтесь|познакомьтесь)[\s\S]{0,40}наш\s+нов(?:ый|ая)|серия\s+подкастов|постер\s+сериала)/iu;
const TELEGRAM_HIRING_RE = /(?:требу[ею]тся|ищем|ищу|нуж[её]н|нужна|нужны|#?ваканси)/iu;

function includesKeyword(haystack: string, keyword: string): boolean {
  const needle = normalizeForMatch(keyword);
  return needle.length > 0 && haystack.includes(needle);
}

export interface ApplyRulesOptions {
  domainFocus?: 'all' | 'it_digital';
}

export function applyRules(
  lead: PreparedLead,
  source: SourceRecord,
  now: Date,
  options?: ApplyRulesOptions,
): RuleResult {
  const reasons: string[] = [];
  const textForMatch = normalizeForMatch(`${lead.title}\n${lead.text}`);

  if (lead.text.trim().length < 20 && lead.title.trim().length < 12) {
    reasons.push('too_short');
  }

  // cleanTitle() strips «- 2000EUR» from the title, so the pattern no longer sees the pay: the
  // extracted currency stands in for it. Only a post titled as data entry counts; company
  // vacancies (an executive assistant, a benefits analyst) list data entry among the duties.
  reasons.push(...spamReasons(lead.title, lead.text, lead.currency));

  const isFreeTextTelegram =
    source.kind === 'telegram' || source.kind === 'telegram-account' || source.config.userTelegram === true;
  if (isFreeTextTelegram && reasons.length === 0) {
    const rawCombined = `${lead.title}\n${lead.text}`;
    const explicitBanter = TELEGRAM_CHAT_BANTER_RE.test(rawCombined) && !TELEGRAM_HIRING_RE.test(rawCombined);
    const noWorkIntent = !hasWorkOfferSignals(lead) && extractSkills(lead.title, lead.text).length === 0;
    if (explicitBanter || noWorkIntent) {
      reasons.push('spam:CHAT_NOISE');
    }
  }

  if (options?.domainFocus === 'it_digital' && source.config.domainFilter !== false && reasons.length === 0) {
    const domainIssue = nonDigitalReason(lead.title);
    if (domainIssue) reasons.push(domainIssue);
  }

  const exclude = source.config.excludeKeywords ?? [];
  for (const keyword of exclude) {
    if (includesKeyword(textForMatch, keyword)) {
      reasons.push(`excluded:${keyword}`);
      break;
    }
  }

  const include = source.config.includeKeywords ?? [];
  if (include.length > 0 && !include.some((keyword) => includesKeyword(textForMatch, keyword))) {
    reasons.push('missing_keyword');
  }

  const minBudget = source.config.minBudget;
  if (
    typeof minBudget === 'number' &&
    minBudget > 0 &&
    typeof lead.budget === 'number' &&
    lead.budget < minBudget
  ) {
    reasons.push(`budget_below:${minBudget}`);
  }

  const maxAgeHours = source.config.maxAgeHours;
  if (typeof maxAgeHours === 'number' && maxAgeHours > 0) {
    const ageMs = now.getTime() - lead.publishedAtDate.getTime();
    if (ageMs > maxAgeHours * 3600 * 1000) {
      reasons.push(`too_old:${maxAgeHours}h`);
    }
  }

  const strictCity = source.config.strictCity === true;
  const configuredCity =
    typeof source.config.city === 'string' ? source.config.city.trim() : '';
  if (
    strictCity &&
    configuredCity &&
    lead.city &&
    lead.city !== 'Онлайн' &&
    normalizeForMatch(lead.city) !== normalizeForMatch(configuredCity)
  ) {
    reasons.push(`city_mismatch:${configuredCity}`);
  }

  return {
    accepted: reasons.length === 0,
    reasons,
    score: scoreLead(lead, source, now),
  };
}

/**
 * Static worth of a lead, 0-100, computed once at ingest. Freshness is not part of it:
 * at ingest every lead is fresh, and the feed already orders by time. What counts:
 * money (USD-normalised, separate ladders for gigs and monthly salaries), skills of the trade,
 * how detailed the post is, a direct contact, the operator's keywords, city and trust.
 * Calibrated on the hub's leads: median ~60, a one-line post without budget ~45-50,
 * 80+ (about one lead in twenty) for a detailed, well-paid one with clear skills.
 */
export function scoreLead(
  lead: PreparedLead,
  source: SourceRecord,
  now: Date,
): number {
  let score = 55;
  const textForMatch = normalizeForMatch(`${lead.title}\n${lead.text}`);

  const include = source.config.includeKeywords ?? [];
  let hits = 0;
  for (const keyword of include) {
    if (includesKeyword(textForMatch, keyword)) hits += 1;
  }
  score += Math.min(hits * 8, 24);

  // Dictionary skills of any trade (code, design, video, texts, marketing, accounting…);
  // board tags such as RemoteOK «senior» or «exec» are not skills.
  const skills = extractSkills(lead.title, lead.text);
  score += skills.length >= 3 ? 12 : skills.length === 2 ? 9 : skills.length === 1 ? 6 : 0;

  score += moneyPoints(lead);

  const length = lead.text.trim().length;
  if (length < 60) score -= 10;
  else if (length < 150) score -= 4;
  // A vacancy in two lines of a sitemap snippet says nothing of the job, whatever it pays.
  else if (length < 300 && lead.type === 'job') score -= 6;
  else if (length > 1500) score += 6;
  else if (length > 600) score += 4;

  if (lead.contacts.length > 0) score += 3;

  // Posts that were already stale when they reached us (boards keep orders open for days).
  const ageHours = Math.max(0, (now.getTime() - lead.publishedAtDate.getTime()) / 3_600_000);
  if (ageHours > 168) score -= 10;

  if (lead.city === 'Онлайн') score += 2;
  if (
    lead.city &&
    typeof source.config.city === 'string' &&
    normalizeForMatch(lead.city) === normalizeForMatch(source.config.city)
  ) {
    score += 5;
  }

  const trust = Number(source.config.trust ?? 0);
  if (Number.isFinite(trust)) score += Math.max(0, Math.min(10, trust));

  return Math.max(0, Math.min(100, Math.round(score)));
}

/** Budget points: gigs by total budget, jobs and hourly rates by monthly pay (USD). */
function moneyPoints(lead: PreparedLead): number {
  const usd = budgetUsd(lead);
  if (usd === undefined) return 0;
  const monthly =
    lead.paymentPeriod === 'hourly' ? usd * 160 : lead.type === 'job' || lead.paymentPeriod === 'monthly' ? usd : undefined;
  if (monthly !== undefined) {
    if (monthly >= 3300) return 20;
    if (monthly >= 2200) return 16;
    if (monthly >= 1300) return 10;
    if (monthly >= 700) return 4;
    return -5;
  }
  if (usd >= 1500) return 22;
  if (usd >= 500) return 18;
  if (usd >= 150) return 12;
  if (usd >= 50) return 6;
  if (usd >= 15) return 0;
  return -8;
}

export interface VoteSums {
  useful: number;
  junk: number;
  scam: number;
  closed: number;
}

export function recalculateVoteScoreAndStatus(
  currentStatus: LeadStatus,
  baseScore: number,
  votes: VoteSums,
): { score: number; status: LeadStatus; community: number } {
  const U = votes.useful;
  const J = votes.junk;
  const S = votes.scam;
  const C = votes.closed;

  // Community sentiment formula (scam has 4x penalty weight in sentiment):
  const totalVotes = U + J + S + C;
  const denominator = U + J + S + 2;
  const community = (U - J - 4 * S) / denominator;

  // Score adjustment applies when total vote weight reaches quorum (>= 1.0)
  let adjustment = 0;
  if (totalVotes >= 1.0) {
    if (S >= 1) {
      // Direct scam penalty drops score heavily
      adjustment = Math.round(community * 35) - Math.round(S * 20);
    } else if (J >= 2 && J > U) {
      adjustment = Math.round(community * 30);
    } else {
      adjustment = Math.round(community * 25);
    }
  }

  const score = Math.max(0, Math.min(100, Math.round(baseScore + adjustment)));

  // Hiding is not decided here: weighted signals (src/hub/rating.ts) set the lead state.
  const status = currentStatus;

  return { score, status, community };
}

