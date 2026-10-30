import type { Lead, LeadType, SourceRecord } from './types.ts';

/**
 * The quality stage: what is wrong with a post that is still worth keeping. Spam rules
 * (rules.ts) reject a post outright; a quality flag keeps it but sinks it in the ranked feed
 * and tells the reader, the API and an agent why. Each flag is a decision with a reason
 * that can be checked on the post's own text.
 */
export type QualityFlag =
  /** Not an order or a vacancy: a channel's course sale, webinar, event, discount or article. */
  | 'channel_ad'
  /** A roundup of several vacancies in one post: no single offer to answer. */
  | 'digest'
  /** «Training, then income», age ranges, «no investment»: recruiting into a scheme. */
  | 'mlm'
  /** Outstaffing: the contractor is hired by an intermediary, not by the client. */
  | 'outstaff';

/** Points a flag takes from the ranked feed score; the rating fades by 4 points a day. */
export const QUALITY_PENALTY: Record<QualityFlag, number> = {
  channel_ad: 50,
  mlm: 40,
  digest: 20,
  outstaff: 10,
};

/** Source kinds whose posts are free text with no type of their own: a channel says nothing about job or gig. */
const FREE_TEXT_KINDS = new Set(['telegram', 'telegram-account', 'webhook']);

/** A role at a company that introduces itself: «Roleв Company — IT-компания…», «X is a SaaS platform…». */
const COMPANY_INTRO: RegExp[] = [
  // Channels glue the title to the text: «Системный аналитикв БСБ Банк — …».
  /(?<=[\s\p{L})])в\s+[^\n.]{2,60}?\s+[—–]\s+[^\n]{0,80}?(?:компани|банк|студи|платформ|сервис|разработчик|агентств|стартап)/iu,
  /(?:^|[^\p{L}])is\s+an?\s+[^\n.]{0,100}?(?:company|platform|provider|studio|startup|brand|ecosystem|agency)/iu,
];

/** Words that say «this is a staff position», each counted once. */
const VACANCY_SIGNALS: RegExp[] = [
  /(?:^|[^\p{L}])(?:зарплата|з\/п|зп|вилка|доход)\s*:/iu,
  /(?:^|[^\p{L}])оклад/iu,
  /на\s+руки|до\s+вычета\s+налогов|(?:^|[^\p{L}])гросс|(?:^|[^\p{L}])gross(?![\p{L}])/iu,
  /[₽$€]\s*(?:в|за)\s+месяц|(?:в|за)\s+месяц[^\p{L}]{0,3}(?:на\s+руки|до\s+вычета)|(?:^|[^\p{L}])(?:per|a)\s+month/iu,
  /полн(?:ая|ую)\s+занятост|full[\s-]?time|(?:^|[^\p{L}\d])5\/2(?![\d])/iu,
  /опыт\s+работы\s*:|опыт\s+(?:от|более)\s+\d+\s+(?:год|лет)/iu,
  /испытательн[а-я]*\s+срок|трудоустройств|оформлени[ея]\s+по\s+тк|(?:^|[^\p{L}])дмс(?![\p{L}])|соцпакет/iu,
  /#ваканси|(?:^|[^\p{L}])вакансия\s*:|(?:^|[^\p{L}])(?:hiring|vacancy)(?![\p{L}])/iu,
  /(?:^|[^\p{L}])о\s+нас\s*:|(?:^|[^\p{L}])о\s+компании\s*:|в\s+команд[уы](?![\p{L}])/iu,
  /(?:^|[^\p{L}])(?:junior|middle|senior|джун|мидл|сеньор|стаж[её]р)(?![\p{L}])/iu,
  /(?:^|[^\p{L}])(?:обязанности|чем\s+предстоит\s+заниматься|(?:что\s+)?мы\s+предлагаем|условия\s*:|задачи\s*:)/iu,
  ...COMPANY_INTRO,
];

/** Words that say «a one-off task for a contractor». */
const GIG_SIGNALS =
  /(?:^|[^\p{L}])(?:разов[а-я]+\s+(?:задач|проект|работ)|нужно\s+(?:сделать|создать|доработать|починить|настроить|сверстать)|ищу\s+исполнител|нуж[её]н\s+исполнител|техническое\s+задание|(?:^|[^\p{L}])тз(?![\p{L}])|бюджет\s*:|за\s+проект|срок[а-я]*\s+выполнени|фикс(?:ированн[а-я]+)?\s+оплат)/iu;

/** Russian law marks paid posts with an erid token and «Реклама»; employers pay for vacancy posts too. */
const AD_MARKING = /(?:^|[^\p{L}])erid(?![\p{L}])|на\s+правах\s+рекламы|#реклама|(?:^|\n)\s*реклама\.?\s*(?:$|\n|ооо|ип)/iu;

/** Channel content that is never an offer of work: course sales, discounts, events, greetings to subscribers. */
const CHANNEL_CONTENT: RegExp[] = [
  /(?:нов(?:ый|ого)|следующ[а-я]+|(?:^|[^\p{L}])[ivx]+|\d+[-‑]?(?:й|ий))\s+поток|ид[её]т\s+набор\s+(?:на|в)\s+(?:[\p{L}-]+\s+){0,2}(?:поток|курс|обучени|программ)|набор\s+(?:на|в)\s+(?:курс|поток|программ|обучени)/iu,
  /(?:^|[^\p{L}])курс[а-я]*(?![\p{L}])[\s\S]{0,160}?(?:скидк|акци|бесплатн|в\s+подарок|промокод|по\s+той\s+же\s+цене|повышени[ея]\s+цен|старт|начал[оа]\s+\d)/iu,
  /второй\s+(?:курс\s+)?(?:получаешь\s+)?(?:бесплатно|в\s+подарок)|повышени[ея]\s+цен[ыа]/iu,
  /(?:вебинар|митап|мастер[-\s]класс|воркшоп|workshop|интенсив|конференци|эфир)[а-я]*[\s\S]{0,200}?(?:регистрац|приглаша|начинаем|собираемся|начало|ждём\s+вас|ждем\s+вас|\d{1,2}[:.]\d{2}\s*(?:мск|по\s+мск))/iu,
  /уважаемые\s+подписчики|с\s+вами\s+ваш|#оффтоп|по\s+цене\s+одного|вечная\s+память/iu,
];

/** Someone is hiring: a post with these is an offer even when a channel adds a promo line under it. */
const HIRING = /#ищу|#ваканси|нов(?:ая|ые)\s*ваканси|(?:^|[^\p{L}])вакансия\s*:|(?:^|[^\p{L}])(?:ищем|ищу|требу[ею]тся|нуж[её]н|нужна|нужны)\s/iu;

/** A title phrased as a question or a lesson is an article, unless the post asks for work. */
const EDITORIAL_TITLE = /\?\s*$|^(?:как|почему|зачем|что\s+(?:реально|делать|такое)|сколько\s+можно|топ[-\s]\d+)\s/iu;

/** Roundup headers of job channels: «Вакансии в разработке», «Вот ваш топ», «ловите вакансий». */
const DIGEST_HEADER =
  /^(?:новые\s+вакансии|вакансии\s+(?:в|для|на)\s|работа\s+(?:для|в)\s[^\n]{0,60}?на\s+хабр\s+карьере)|ваш\s+топ|подготовили\s+(?:эти|для\s+вас)\s+ваканси|ловите\s+ваканси|подборк[аеу]\s+ваканси/iu;

const MLM: RegExp[] = [
  /в\s+возрасте\s+(?:от\s+)?\d{2}\s*(?:[-–—]|до)\s*\d{2}\s*лет/iu,
  /с\s+нас\s+обучени|без\s+вложений|пассивн[а-я]+\s+доход|сетев[а-я]+\s+маркетинг|(?:^|[^\p{L}])mlm(?![\p{L}])|доход\s+от\s+[\d\s]+\S*\s+в\s+(?:день|неделю)/iu,
  /помощь\s+с\s+выходом\s+на\s+фриланс|выведем\s+на\s+(?:фриланс|доход)/iu,
];

const OUTSTAFF = /аутстафф?|outstaff/iu;

function distinctMatches(text: string, patterns: RegExp[]): number {
  return patterns.filter((pattern) => pattern.test(text)).length;
}

/** How many separate vacancy entries a post lists, by its «Подробнее» links. */
function listedOffers(text: string): number {
  return text.match(/подробнее/giu)?.length ?? 0;
}

export interface QualityInput {
  type: LeadType;
  title: string;
  text: string;
  budget?: number;
}

export interface QualityAssessment {
  type: LeadType;
  flags: QualityFlag[];
  /** Points to take from the ingest score. */
  penalty: number;
}

/**
 * The type a free-text post really has. Channels post vacancies with «Зарплата: 120 000 руб.»
 * and «Полная занятость» but no word «вакансия» in the title, so prepare() calls them gigs.
 * Two distinct vacancy signals and no sign of a one-off task make it a job.
 */
export function detectPostType(lead: QualityInput, source: Pick<SourceRecord, 'kind'>): LeadType {
  if (!FREE_TEXT_KINDS.has(source.kind) || lead.type === 'job') return lead.type;
  const head = `${lead.title}\n${lead.text}`.slice(0, 1500);
  const vacancy = distinctMatches(head, VACANCY_SIGNALS);
  if (vacancy >= 3) return 'job';
  if (GIG_SIGNALS.test(head)) return lead.type;
  // A post that opens with a role at an introduced company is a vacancy post of a job channel.
  return vacancy >= 2 || distinctMatches(head.slice(0, 300), COMPANY_INTRO) > 0 ? 'job' : lead.type;
}

export function assessQuality(lead: QualityInput, source: Pick<SourceRecord, 'kind'>): QualityAssessment {
  const type = detectPostType(lead, source);
  const text = `${lead.title}\n${lead.text}`;
  const head = text.slice(0, 1500);
  const flags: QualityFlag[] = [];

  const vacancy = distinctMatches(head, VACANCY_SIGNALS);
  const hiring = HIRING.test(head);
  const gig = GIG_SIGNALS.test(head);
  const content = distinctMatches(text, CHANNEL_CONTENT) > 0 && vacancy < 3 && !hiring;
  const marked = AD_MARKING.test(text) && vacancy === 0 && !hiring && !gig;
  const editorial = EDITORIAL_TITLE.test(lead.title.trim()) && vacancy < 2 && !hiring && !gig && lead.budget === undefined;
  if (content || marked || editorial) flags.push('channel_ad');

  if (!flags.includes('channel_ad') && (DIGEST_HEADER.test(lead.title.trim()) || listedOffers(text) >= 3)) flags.push('digest');
  if (distinctMatches(head, MLM) > 0) flags.push('mlm');
  if (OUTSTAFF.test(head)) flags.push('outstaff');

  return { type, flags, penalty: flags.reduce((sum, flag) => sum + QUALITY_PENALTY[flag], 0) };
}

/** Flags stored on a lead (in its metadata), or none. */
export function qualityFlagsOf(lead: Pick<Lead, 'metadata'>): QualityFlag[] {
  const value = lead.metadata?.qualityFlags;
  return Array.isArray(value) ? value.filter((flag): flag is QualityFlag => typeof flag === 'string' && flag in QUALITY_PENALTY) : [];
}

/** Ranked-feed points the stored flags take from a lead. */
export function qualityPenaltyOf(lead: Pick<Lead, 'metadata'>): number {
  return qualityFlagsOf(lead).reduce((sum, flag) => sum + QUALITY_PENALTY[flag], 0);
}
