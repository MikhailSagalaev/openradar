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
  | 'outstaff'
  /** A paid evaluation visit («тайный покупатель», mystery shopper): a task, not work. */
  | 'mystery_shopper';

/** Points a flag takes from the ranked feed score; the rating fades by 4 points a day. */
export const QUALITY_PENALTY: Record<QualityFlag, number> = {
  channel_ad: 50,
  mlm: 40,
  digest: 20,
  outstaff: 10,
  mystery_shopper: 30,
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
  // «Зарплата:» needs no word boundary: channels glue it to the title («Fullstack-разработчикЗарплата: 120 000»).
  /зарплат[а-я]*\s*[:—–-]|заработн[а-я]*\s+плат|(?:^|[^\p{L}])(?:з\/п|зп|вилка|доход)\s*[:—–-]/iu,
  /(?:^|[^\p{L}])без\s+опыта(?![\p{L}])/iu,
  /(?:^|[^\p{L}])оклад/iu,
  /на\s+руки|до\s+вычета\s+налогов|(?:^|[^\p{L}])гросс|(?:^|[^\p{L}])gross(?![\p{L}])/iu,
  /[₽$€]\s*(?:в|за)\s+месяц|(?:в|за)\s+месяц[^\p{L}]{0,3}(?:на\s+руки|до\s+вычета)|(?:^|[^\p{L}])(?:per|a)\s+month/iu,
  /полн(?:ая|ую)\s+занятост|full[\s-]?time|(?:^|[^\p{L}\d])5\/2(?![\d])/iu,
  /опыт\s+работы\s*:|опыт\s+(?:от|более)\s+\d+\s+(?:год|лет)/iu,
  /испытательн|трудоустройств|оформлени[ея]\s+по\s+тк|официальн[а-я]*\s+оформлени|(?:^|[^\p{L}])дмс(?![\p{L}])|соцпакет/iu,
  // Terms of employment: orders have a deadline, not hours or a monthly sum.
  /занятост[ьи]\s*[:—–-]|частичн[а-я]*\s+занятост|(?:^|[^\p{L}])график\s*[:—–-]|\d\s*(?:к|k|тыс[а-я.]*|₽|руб[а-я.]*)?\s*(?:в|за|\/)\s*мес/iu,
  // Yearly pay is a salary: nobody quotes an order by the year.
  /[\dkк₽$€]\s*\/\s*(?:год|year|yr)(?![\p{L}])|\d\s*(?:₽|\$|€|руб[а-я.]*)\s+в\s+год(?![\p{L}])/iu,
  /#ваканси|(?:^|[^\p{L}])вакансия\s*:|(?:^|[^\p{L}])(?:hiring|vacancy)(?![\p{L}])/iu,
  /(?:^|[^\p{L}])о\s+нас\s*:|(?:^|[^\p{L}])о\s+компании\s*:|в\s+команд[уы](?![\p{L}])/iu,
  /(?:^|[^\p{L}])(?:junior|middle|senior|джун|мидл|сеньор|стаж[её]р)(?![\p{L}])/iu,
  /(?:^|[^\p{L}])(?:обязанности|(?:чем|что)\s+предстоит\s+(?:заниматься|делать)|(?:что\s+)?мы\s+предлагаем|условия\s*:|задачи\s*:)/iu,
  ...COMPANY_INTRO,
];

/** Words that say «a one-off task for a contractor». */
const GIG_SIGNALS =
  /(?:^|[^\p{L}])(?:разов[а-я]+\s+(?:задач|проект|работ)|нужно\s+(?:сделать|создать|доработать|починить|настроить|сверстать)|ищу\s+исполнител|нуж[её]н\s+исполнител|техническое\s+задание|(?:^|[^\p{L}])тз(?![\p{L}])|бюджет\s*:|за\s+проект|срок[а-я]*\s+выполнени|фикс(?:ированн[а-я]+)?\s+оплат)/iu;

/** Russian law marks paid posts with an erid token and «Реклама»; employers pay for vacancy posts too. */
const AD_MARKING = /(?:^|[^\p{L}])erid(?![\p{L}])|на\s+правах\s+рекламы|#реклама|(?:^|\n)\s*реклама\.?\s*(?:$|\n|ооо|ип)/iu;

/** Promotion that no vacancy wording excuses: it is an ad even when it talks about candidates. */
const PROMOTION = /openradar\.fun|о\s+рекламодателе|бесплатн[а-я]*\s+(?:вебинар|интенсив|мастер-класс)|записаться\s+на\s+(?:бесплатн|вебинар|интенсив|курс)/iu;

/**
 * Someone selling their services, not looking for a contractor: the tags chats use for it and
 * an agency's price list. Works on raw text and on normalizeForMatch() output alike.
 */
export const SERVICE_OFFER = /(?:^|[^\p{L}\d_])#(?:услуг[аи]|предлагаю|ищузаказ[а-я]*|резюме|resume)(?![\p{L}])|помогаю\s+бизнесу|(?:^|[^\p{L}])ищу\s+(?:проекты|разовые\s+задачи|клиентов)|занимаюсь\s+профессиональн|профессиональн[а-я]*\s+помощь\s+в\s+подготовке|наши\s+(?:тарифы|пакеты|услуги\s+и\s+цены)|(?:агентств[а-я]*|студи[а-я]*)\s+предлагает\s+(?:готов|услуг|пакет)|(?<![a-z])start(?![a-z])[^a-z]{0,40}\d[\s\S]{0,400}?(?<![a-z])(?:business|premium)(?![a-z])[^a-z]{0,40}\d/iu;

/** Channel content that is never an offer of work: course sales, discounts, events, greetings to subscribers. */
const CHANNEL_CONTENT: RegExp[] = [
  /(?:нов(?:ый|ого)|следующ[а-я]+|(?:^|[^\p{L}])[ivx]+|\d+[-‑]?(?:й|ий))\s+поток|ид[её]т\s+набор\s+(?:на|в)\s+(?:[\p{L}-]+\s+){0,2}(?:поток|курс|обучени|программ)|набор\s+(?:на|в)\s+(?:курс|поток|программ|обучени)/iu,
  /(?:^|[^\p{L}])курс[а-я]*(?![\p{L}])[\s\S]{0,160}?(?:скидк|акци|бесплатн|в\s+подарок|промокод|по\s+той\s+же\s+цене|повышени[ея]\s+цен|старт|начал[оа]\s+\d)/iu,
  /второй\s+(?:курс\s+)?(?:получаешь\s+)?(?:бесплатно|в\s+подарок)|повышени[ея]\s+цен[ыа]/iu,
  /(?:вебинар|митап|мастер[-\s]класс|воркшоп|workshop|интенсив|конференци|эфир)[а-я]*[\s\S]{0,200}?(?:регистрац|приглаша|начинаем|собираемся|начало|ждём\s+вас|ждем\s+вас|\d{1,2}[:.]\d{2}\s*(?:мск|по\s+мск))/iu,
  /уважаемые\s+подписчики|с\s+вами\s+ваш|#оффтоп|по\s+цене\s+одного|вечная\s+память/iu,
  /акция\s+действует|возвращаем\s+до\s+\d+\s*%|скидк[аиу]\s+(?:до\s+)?\d+\s*%|зарегистрируйтесь\s+в\s/iu,
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
/** A paid evaluation visit: a task on a job board, not employment. */
const MYSTERY_SHOPPER = /тайн\S*\s+покупат|тайн\S*\s+клиент|mystery[\s-]?shopper|тайн\S*\s+звонк\S*/iu;

/** Channels that post vacancies and only vacancies: a post there is a job unless it says it is a task. */
const JOB_CHANNELS = new Set([
  'careerspace', 'datasciencejobs', 'designhunters', 'devjobs', 'foranalysts', 'forcpp', 'forcsharp', 'fordevops', 'forfrontend',
  'forgamedev', 'forhr', 'forproducts', 'forpython', 'gamedevjobs', 'habr_career', 'hireproproduct', 'it_vakansii_jobs',
  'job4analyst_junior', 'jobforjunior', 'jobs_juniors_remote', 'juno_jobs', 'marketing_jobs', 'motion_design_jobs',
  'product_design_jobs', 'product_jobs', 'proglib_jobs', 'remocate', 'remote_jobs_ru', 'stagirovky', 'startup_job_russia', 'vacancysmm', 'vakansii_it', 'workasap',
]);

/** The word itself, near the top of a post: its author calls it a vacancy, whatever else it says. */
const NAMED_VACANCY = /(?:^|[^\p{L}])ваканси[яюи](?![\p{L}])|#ваканси/iu;

/** «Product Marketing Manager в Got it Life»: a position at a named company. */
const AT_COMPANY = /\sв\s+(?:команду\s+)?[A-ZА-ЯЁ][\p{L}\d.-]+/u;

/** A title that names a position: a job channel's post without one and without vacancy words is its own content. */
const POSITION_WORD = /разработчик|программист|developer|engineer|инженер|менеджер|manager|дизайнер|designer|аналитик|analyst|маркетолог|marketer|рекрутер|recruiter|специалист|specialist|редактор|копирайтер|тестировщик|стаж[её]р|intern|lead|head|директор|руководител|администратор|architect|архитектор|devops|(?:^|[^\p{L}])(?:hr|qa|ml|smm|seo)(?![\p{L}])/iu;

function distinctMatches(text: string, patterns: RegExp[]): number {
  return patterns.filter((pattern) => pattern.test(text)).length;
}

/** How many separate vacancy entries a post lists, by its «Подробнее» links. */
function listedOffers(text: string): number {
  const links = text.match(/подробнее/giu)?.length ?? 0;
  // A roundup without links: a line per position, each opening with its grade.
  const grades = text.match(/(?:^|\n)\s*(?:junior|middle\+?|senior|lead|стаж[её]р|c-level)\s+[\p{L}]/giu)?.length ?? 0;
  return Math.max(links, grades);
}

export interface QualityInput {
  type: LeadType;
  title: string;
  text: string;
  budget?: number;
  /** The channel of a post that came through a shared folder. */
  channel?: string;
}

type QualitySource = Pick<SourceRecord, 'kind'> & { config?: SourceRecord['config'] };

function isJobChannel(lead: QualityInput, source: QualitySource): boolean {
  const channel = lead.channel ?? source.config?.channel;
  return typeof channel === 'string' && JOB_CHANNELS.has(channel.replace(/^@/, '').toLowerCase());
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
export function detectPostType(lead: QualityInput, source: QualitySource): LeadType {
  if (!FREE_TEXT_KINDS.has(source.kind) || lead.type === 'job') return lead.type;
  const head = `${lead.title}\n${lead.text}`.slice(0, 1500);
  const vacancy = distinctMatches(head, VACANCY_SIGNALS);
  if (vacancy >= 3 || NAMED_VACANCY.test(head.slice(0, 250))) return 'job';
  if (GIG_SIGNALS.test(head)) return lead.type;
  if (isJobChannel(lead, source)) return 'job';
  // Chats tag an order #ищу; a position named with no tag comes from a channel of vacancies.
  if (POSITION_WORD.test(lead.title) && (AT_COMPANY.test(lead.title) || !/#ищу/iu.test(head))) return 'job';
  // A post that opens with a role at an introduced company is a vacancy post of a job channel.
  return vacancy >= 2 || distinctMatches(head.slice(0, 300), COMPANY_INTRO) > 0 ? 'job' : lead.type;
}

export function assessQuality(lead: QualityInput, source: QualitySource): QualityAssessment {
  const type = detectPostType(lead, source);
  const text = `${lead.title}\n${lead.text}`;
  const head = text.slice(0, 1500);
  const flags: QualityFlag[] = [];

  const vacancy = distinctMatches(head, VACANCY_SIGNALS);
  const hiring = HIRING.test(head);
  const gig = GIG_SIGNALS.test(head);
  const content = distinctMatches(text, CHANNEL_CONTENT) > 0 && vacancy < 3 && !hiring;
  // An ad may say «без опыта» and «нужен» about its audience: only an opening that hires excuses the marking.
  const hiringOpening = HIRING.test(head.slice(0, 200));
  const marked = (AD_MARKING.test(text) || PROMOTION.test(text)) && vacancy < 3 && !hiringOpening;
  const editorial = EDITORIAL_TITLE.test(lead.title.trim()) && vacancy < 2 && !hiring && !gig && lead.budget === undefined;
  const roundup = DIGEST_HEADER.test(lead.title.trim()) || DIGEST_HEADER.test(text.slice(0, 400)) || listedOffers(text) >= 3;
  // Job channels publish articles between vacancies, and a figure in one must not read as pay.
  const channelStory = FREE_TEXT_KINDS.has(source.kind) && type === 'job' && vacancy === 0 && !hiring && !gig && !roundup && !POSITION_WORD.test(lead.title);
  const services = SERVICE_OFFER.test(head);
  if (content || marked || editorial || channelStory || services) flags.push('channel_ad');

  if (!flags.includes('channel_ad') && roundup) flags.push('digest');
  if (distinctMatches(head, MLM) > 0) flags.push('mlm');
  if (OUTSTAFF.test(head)) flags.push('outstaff');
  if (MYSTERY_SHOPPER.test(text) && lead.type === 'gig') flags.push('mystery_shopper');

  return { type, flags, penalty: flags.reduce((sum, flag) => sum + QUALITY_PENALTY[flag], 0) };
}

/** Flags saying the post is no single offer: any sum in it belongs to something else. */
export function offersNoPay(flags: QualityFlag[]): boolean {
  return flags.includes('channel_ad') || flags.includes('digest');
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
