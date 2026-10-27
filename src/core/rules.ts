import { hasItSkillSignal, hasNonItCategorySignal, normalizeForMatch } from './text.ts';
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
      /(не\s+платим\s+(фиксированн[а-я]*|ставк[а-я]*)|оплата\s+(только|строго)?\s*за\s+процент\s+от\s+(продаж|дохода|чека)|пробное\s+задание\s+(бесплатно|за\s+отзыв)|партнерск[а-я]*\s+программ[а-я]*\s+с\s+%\s+от\s+дохода)/iu,
  },
  {
    reason: 'MICRO_TASKS',
    pattern:
      /(зарегистрироваться\s+по\s+реферальн|пройти\s+опрос\s+за\s+деньги|скачать\s+приложение\s+за\s+оплату|прием\s+звонков\s+от\s+банков)/iu,
  },
  {
    reason: 'RESALE_OR_RENTAL',
    pattern:
      /(?:^|[^\p{L}])(?:продам|продаю|продается|продаётся|сдам|сдается|сдаётся)\s+(?:[а-я]+\s+){0,3}(?:квартир|дом|комнат|кроват|диван|машин|авто|телефон|ноутбук|велосипед)/iu,
  },
  {
    // Posts by people looking for work. Bare «резюме» or «вакансия» are not enough: employers
    // write «присылайте резюме», and orders mention a «сайт-резюме» or scraping vacancies.
    reason: 'JOB_SEEKER',
    pattern:
      /(?:^|[^\p{L}])(?:ищу\s+(?:работу|подработку|заказы|заказчиков|вакансию)|(?:мо[ёе]|прикладываю|прилагаю)\s+резюме|рассмотрю\s+(?:предложения|вакансии))/iu,
  },
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
    if (rule.pattern.test(`${lead.title}\n${lead.text}`)) {
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

export function scoreLead(
  lead: PreparedLead,
  source: SourceRecord,
  now: Date,
): number {
  let score = 50;
  const textForMatch = normalizeForMatch(`${lead.title}\n${lead.text}`);

  const include = source.config.includeKeywords ?? [];
  let hits = 0;
  for (const keyword of include) {
    if (includesKeyword(textForMatch, keyword)) hits += 1;
  }
  score += Math.min(hits * 8, 24);

  const budget = lead.budget ?? 0;
  // DATA-01: two-stage gate before the budget bonus. Off-topic categories
  // (ремонт, доставка,…) are penalized; the "market fit" bonus requires an
  // IT/digital signal — either the source's own include keywords or detected skills.
  const nonItCategory = hasNonItCategorySignal(textForMatch);
  const itSignal = hits > 0 || hasItSkillSignal(textForMatch);
  if (nonItCategory && !itSignal) {
    score -= 15;
  } else if (itSignal) {
    if (budget >= 25_000) score += 20;
    else if (budget >= 10_000) score += 15;
    else if (budget >= 5_000) score += 10;
    else if (budget >= 1_000) score += 5;
  } else {
    const bonus = budget >= 25_000 ? 20 : budget >= 10_000 ? 15 : budget >= 5_000 ? 10 : budget >= 1_000 ? 5 : 0;
    score += Math.round(bonus / 2);
  }

  const ageHours = Math.max(0, (now.getTime() - lead.publishedAtDate.getTime()) / 3_600_000);
  if (ageHours <= 1) score += 15;
  else if (ageHours <= 6) score += 10;
  else if (ageHours <= 24) score += 5;
  else if (ageHours > 72) score -= 10;

  if (lead.city === 'Онлайн') score += 3;
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

  // Community sentiment formula:
  // community = (U - J - 3*S) / (U + J + S + 2)
  const totalVotes = U + J + S + C;
  const denominator = U + J + S + 2;
  const community = (U - J - 3 * S) / denominator;

  // Score adjustment applies when total vote weight reaches quorum (>= 1.0)
  const adjustment = totalVotes >= 1.0 ? Math.round(community * 25) : 0;
  const score = Math.max(0, Math.min(100, Math.round(baseScore + adjustment)));

  // Hiding is not decided here: weighted signals (src/hub/rating.ts) set the lead state.
  const status = currentStatus;

  return { score, status, community };
}

