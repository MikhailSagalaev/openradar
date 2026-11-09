import { SERVICE_OFFER } from './quality.ts';
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
      /(массов[а-я]*\s+рассылк|рассылк[а-я]*\s+(сообщени|писем|в\s+(лс|личк|ватсап|whatsapp|тг|телеграм|viber))|инвайт[а-я]*|спам[а-я]*\s*рассылк|парсинг\s+(контактов|номеров|телефонов)|база\s+номеров)/iu,
  },
  {
    reason: 'BOTTING',
    pattern:
      /(накрутк[а-я]*\s*(просмотр|подписчик|лайк|ботов|поведенческ)|накрутить\s+(просмотры|лайки|подписчиков)|боты\s+для\s+(просмотров|лайков))/iu,
  },
  {
    reason: 'GREY_FINANCE',
    pattern:
      /(дроп[а-я]*|обнал[а-я]*|оформлени[а-я]*\s+карт[а-я]*\s+на\s+себя|аренда\s+(аккаунт|лс|ватсап)|верификац[а-я]*\s+(кошельк|бирж|авито)|оплата\s+за\s+верификац)/iu,
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
      /(?:^|[^\p{L}])(?:ищу\s+(?:работу|подработку|заказы|заказчиков|вакансию|позици[юи])|(?:мо[ёе]|прикладываю|прилагаю)\s+резюме|рассмотрю\s+(?:предложения|вакансии))|#(?:резюме|resume|cv|помогу)(?![\p{L}\d_])/iu,
  },
  // An agency's price list or a post tagged #услуги offers work instead of asking for it.
  { reason: 'SERVICE_OFFER', pattern: SERVICE_OFFER },
];

export interface RuleResult {
  accepted: boolean;
  reasons: string[];
  score: number;
}

function includesKeyword(haystack: string, keyword: string): boolean {
  const needle = normalizeForMatch(keyword);
  return needle.length > 0 && haystack.includes(needle);
}

export function applyRules(
  lead: PreparedLead,
  source: SourceRecord,
  now: Date,
): RuleResult {
  const reasons: string[] = [];
  const textForMatch = normalizeForMatch(`${lead.title}\n${lead.text}`);

  if (lead.text.trim().length < 20 && lead.title.trim().length < 12) {
    reasons.push('too_short');
  }

  for (const rule of SPAM_RULES) {
    // cleanTitle() strips «- 2000EUR» from the title, so the pattern no longer sees the pay: the
    // extracted currency stands in for it. Only a post titled as data entry counts; company
    // vacancies (an executive assistant, a benefits analyst) list data entry among the duties.
    const isDataEntryForeignCurrency =
      rule.reason === 'DATA_ENTRY_SCAM' &&
      (lead.currency === 'EUR' || lead.currency === 'USD') &&
      /(?:ввод[а-я]*\s+данных|data\s+entry|набор[а-я]*\s+текст)/iu.test(lead.title);

    if (rule.pattern.test(`${lead.title}\n${lead.text}`) || isDataEntryForeignCurrency) {
      reasons.push(`spam:${rule.reason}`);
      break;
    }
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

