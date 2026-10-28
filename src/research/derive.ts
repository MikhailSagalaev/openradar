/**
 * One research record per lead: role, grade, language, region, employer and pay in
 * roubles per month (vacancies) or per project (orders). Everything is derived when the
 * report is built, so a better rule applies to the whole history at once; published
 * monthly reports are frozen snapshots and do not move.
 */
import { extractTechSkills, normalizeWhitespace } from '../core/text.ts';
import type { Lead, LeadType } from '../core/types.ts';
import type { PageFacts, PageSalary } from './facts.ts';
import type { ModelFacts, StoredModelFacts } from './model.ts';

/** Reference rates to roubles; the methodology page prints them. */
export const RUB_PER: Record<string, number> = {
  RUB: 1,
  RUR: 1,
  USD: 92,
  USDT: 92,
  EUR: 99,
  GBP: 118,
  KZT: 0.19,
  BYN: 28,
  UAH: 2.2,
};

export type Market = 'ru' | 'intl';
export type Grade = 'intern' | 'junior' | 'middle' | 'senior' | 'lead';

export const GRADE_LABELS: Record<Grade, string> = {
  intern: 'Стажёр',
  junior: 'Junior',
  middle: 'Middle',
  senior: 'Senior',
  lead: 'Lead',
};
export const GRADE_ORDER: Grade[] = ['intern', 'junior', 'middle', 'senior', 'lead'];

export interface Pay {
  min?: number;
  max?: number;
  currency: string;
  period: 'month' | 'year' | 'hour' | 'project';
  /** Where the pay came from: the board's page markup, the text, or the stored budget. */
  origin: 'page' | 'text' | 'budget' | 'model';
}

export interface ResearchRecord {
  id: string;
  date: string;
  type: LeadType;
  platform: string;
  role: string;
  grade?: Grade;
  language?: string;
  region: 'Москва' | 'Санкт-Петербург' | 'Другие города' | 'Не указан';
  remote: boolean;
  company?: string;
  skills: string[];
  ai: boolean;
  market?: Market;
  /** Roubles: per month for vacancies, per project for orders, per hour when the post says so. */
  payMin?: number;
  payMax?: number;
  /** Single figure per post: the middle of a range, else the one bound given. */
  pay?: number;
  payPeriod?: 'month' | 'hour' | 'project';
  payOrigin?: Pay['origin'];
  currency?: string;
  /** The model is sure this is an ad, a resume or chatter: left out of every figure. */
  excluded?: boolean;
}

// ---------- Roles ----------

export interface RoleDef {
  slug: string;
  label: string;
  /** Plural form for headlines: «Python-разработчики». */
  plural: string;
  pattern: RegExp;
  types: LeadType[];
}

const W = String.raw`(?<![\p{L}\d])`; // start of a word
const E = String.raw`(?![\p{L}])`; // end of a word
const rx = (body: string): RegExp => new RegExp(body, 'iu');

/** Ordered: the first match wins, so narrow roles go before broad ones. */
export const ROLES: RoleDef[] = [
  { slug: 'ai', label: 'AI-инженер и вайб-кодинг', plural: 'AI-инженеры', types: ['job', 'gig'],
    pattern: rx(`вайб|vibe|${W}llm${E}|prompt|промпт|genai|${W}ai[- ]?(?:engineer|инженер|разработчик|developer|агент|agent)|${W}ии${E}|нейросет|n8n|${W}rag${E}`) },
  { slug: '1c', label: 'Программист 1С', plural: 'программисты 1С', types: ['job', 'gig'],
    pattern: rx(`${W}1\\s?[сc]${E}`) },
  { slug: 'security', label: 'Информационная безопасность', plural: 'специалисты по ИБ', types: ['job'],
    pattern: rx(`безопасн|security|pentest|пентест|appsec|devsecops|${W}soc${E}|${W}иб${E}|siem`) },
  { slug: 'qa', label: 'Тестировщик (QA)', plural: 'тестировщики', types: ['job', 'gig'],
    pattern: rx(`тестиров|${W}qa${E}|sdet|автотест|test engineer|quality assurance`) },
  { slug: 'devops', label: 'DevOps и SRE', plural: 'DevOps-инженеры', types: ['job'],
    pattern: rx(`devops|${W}sre${E}|site reliability|platform engineer|kubernetes|инфраструктур`) },
  { slug: 'architect', label: 'Архитектор ПО', plural: 'архитекторы ПО', types: ['job'],
    pattern: rx(`архитектор|architect`) },
  { slug: 'sysadmin', label: 'Системный администратор', plural: 'системные администраторы', types: ['job'],
    pattern: rx(`сисадмин|системн\\p{L}* инженер|инженер linux|${W}linux${E}|системн\\p{L}* администратор|администратор (?:linux|серверов|систем|сети|баз)|system administrator|сетев\\p{L}* инженер|network engineer|${W}dba${E}|виртуализац|сопровожден\\p{L}* (?:платформ|систем|инфраструктур)`) },
  { slug: 'data-engineer', label: 'Data-инженер', plural: 'data-инженеры', types: ['job'],
    pattern: rx(`data engineer|инженер данных|${W}dwh${E}|${W}etl${E}|big data|hadoop|airflow`) },
  { slug: 'analyst-system', label: 'Системный аналитик', plural: 'системные аналитики', types: ['job'],
    pattern: rx(`системн\\p{L}* аналитик|system analyst|systems analyst`) },
  { slug: 'analyst-business', label: 'Бизнес-аналитик', plural: 'бизнес-аналитики', types: ['job'],
    pattern: rx(`бизнес[- ]аналитик|business analyst`) },
  { slug: 'analyst-data', label: 'Аналитик данных и продуктовый аналитик', plural: 'аналитики данных', types: ['job', 'gig'],
    pattern: rx(`аналитик данных|data analyst|${W}bi${E}|продуктов\\p{L}* аналитик|product analyst|веб-аналитик|аналитик`) },
  { slug: 'ml', label: 'Data Science и ML', plural: 'специалисты по Data Science и ML', types: ['job'],
    pattern: rx(`data scien|${W}ml${E}|machine learning|машинн\\p{L}* обучен|computer vision|${W}nlp${E}|${W}cv${E} engineer|deep learning`) },
  { slug: 'product', label: 'Продакт-менеджер', plural: 'продакт-менеджеры', types: ['job'],
    pattern: rx(`product manager|product owner|product lead|лидер продукта|менеджер продукта|продакт|продуктов\\p{L}* менеджер|${W}cpo${E}|${W}head of product`) },
  { slug: 'project', label: 'Проджект-менеджер', plural: 'проджект-менеджеры', types: ['job'],
    pattern: rx(`project manager|проджект|руководител\\p{L}* проект|менеджер проект|scrum|delivery manager|${W}pm${E}`) },
  { slug: 'design', label: 'Дизайнер', plural: 'дизайнеры', types: ['job', 'gig'],
    pattern: rx(`дизайн|designer|${W}ui${E}|${W}ux${E}|figma|фигм|логотип|баннер|иллюстрац`) },
  { slug: 'gamedev', label: 'Разработчик игр', plural: 'разработчики игр', types: ['job', 'gig'],
    pattern: rx(`unity|unreal|gamedev|геймдев|game developer|game designer|игров\\p{L}*`) },
  { slug: 'mobile', label: 'Мобильный разработчик', plural: 'мобильные разработчики', types: ['job', 'gig'],
    pattern: rx(`${W}ios${E}|android|flutter|react native|мобильн|swift|kotlin multiplatform`) },
  { slug: 'fullstack', label: 'Fullstack-разработчик', plural: 'fullstack-разработчики', types: ['job'],
    pattern: rx(`full[- ]?stack|фулстек|фуллстек`) },
  { slug: 'frontend', label: 'Frontend-разработчик', plural: 'frontend-разработчики', types: ['job'],
    pattern: rx(`front[- ]?end|фронтенд|фронт-енд|верстальщик|${W}react${E}|${W}vue|angular|javascript-разработчик|js-разработчик`) },
  { slug: 'embedded', label: 'Embedded-разработчик', plural: 'embedded-разработчики', types: ['job'],
    pattern: rx(`embedded|встраиваем|микроконтрол|${W}плис${E}|fpga|${W}stm32`) },
  { slug: 'backend', label: 'Backend-разработчик', plural: 'backend-разработчики', types: ['job'],
    pattern: rx(`back[- ]?end|бэкенд|бекенд|разработчик|программист|developer|engineer|инженер-программист|${W}(?:go|golang|java|python|php|c#|\\.net|c\\+\\+|rust|scala|ruby|kotlin)${E}`) },
  { slug: 'education', label: 'Преподавание и менторство', plural: 'преподаватели', types: ['job'],
    pattern: rx(`преподавател|учител|ментор|наставник|автор (?:курс|дисциплин)|методист|tutor|teacher`) },
  { slug: 'support', label: 'Техподдержка', plural: 'специалисты техподдержки', types: ['job'],
    pattern: rx(`поддержк|support|helpdesk|service desk|оператор`) },
  { slug: 'marketing', label: 'Маркетинг и реклама', plural: 'маркетологи', types: ['job', 'gig'],
    pattern: rx(`маркетолог|marketing|маркетинг|${W}smm|${W}seo${E}|таргет|директ|реклам|продвижен|авито`) },
  { slug: 'content', label: 'Тексты и контент', plural: 'авторы и контент-менеджеры', types: ['job', 'gig'],
    pattern: rx(`копирайт|рерайт|текст|стать|контент|редактор|писател|copywriter|writer|editor`) },
  { slug: 'sales', label: 'Продажи', plural: 'менеджеры по продажам', types: ['job'],
    pattern: rx(`продаж|sales|account manager|менеджер по работе с клиентами|развити\\p{L}* бизнеса|business development|${W}kam${E}|пресейл|presale|аккаунт`) },
  { slug: 'hr', label: 'HR и рекрутинг', plural: 'HR-специалисты', types: ['job'],
    pattern: rx(`${W}hr${E}|рекрутер|recruiter|подбор персонала`) },
  // Orders only: the kinds of work that rarely come as vacancies.
  { slug: 'web', label: 'Сайты', plural: 'веб-разработчики', types: ['gig'],
    pattern: rx(`сайт|лендинг|landing|wordpress|tilda|тильд|битрикс|bitrix|верстк|интернет-магазин|${W}cms${E}|opencart|woocommerce`) },
  { slug: 'bots', label: 'Боты', plural: 'разработчики ботов', types: ['gig'],
    pattern: rx(`${W}бот|${W}bot${E}|чат-бот|telegram-бот`) },
  { slug: 'parsing', label: 'Парсинг и автоматизация', plural: 'разработчики парсеров', types: ['gig'],
    pattern: rx(`парс|scrap|автоматизац|скрипт|интеграц|${W}api${E}`) },
  { slug: 'marketplaces', label: 'Маркетплейсы', plural: 'специалисты по маркетплейсам', types: ['gig'],
    pattern: rx(`маркетплейс|wildberries|${W}wb${E}|ozon|озон|карточ\\p{L}* товар|инфографик`) },
  { slug: 'video', label: 'Видео и анимация', plural: 'видеомонтажёры', types: ['gig'],
    pattern: rx(`видео|монтаж|reels|shorts|анимац|motion|моушн|youtube|ролик`) },
  { slug: 'translation', label: 'Переводы', plural: 'переводчики', types: ['gig'],
    pattern: rx(`перевод|translat|переводчик`) },
  { slug: 'dev-other', label: 'Другая разработка', plural: 'разработчики', types: ['gig'],
    pattern: rx(`разработ|программ|доработ|python|php|javascript|${W}js${E}|developer|код${E}`) },
];

export const OTHER_ROLE = { slug: 'other', label: 'Другое', plural: 'другие специалисты' };

/**
 * Roles whose order of checks needs care in orders: a «бот на нейросетях» is a bot and a
 * «сайт на Битриксе» a site, so for orders the AI role only wins when the title says so.
 */
const GIG_ORDER = ['1c', 'marketplaces', 'bots', 'parsing', 'qa', 'mobile', 'gamedev', 'design', 'web', 'video', 'content', 'translation', 'marketing', 'analyst-data', 'ai', 'dev-other'];

export function roleDef(slug: string): RoleDef | undefined {
  return ROLES.find((role) => role.slug === slug);
}

export function roleLabel(slug: string): string {
  return roleDef(slug)?.label ?? OTHER_ROLE.label;
}

export function classifyRole(type: LeadType, title: string, extra = ''): string {
  if (type === 'gig') {
    // The title decides; the text helps when the title is «Нужна помощь».
    for (const slug of GIG_ORDER) if (roleDef(slug)!.pattern.test(title)) return slug;
    for (const slug of GIG_ORDER) if (slug !== 'ai' && roleDef(slug)!.pattern.test(extra)) return slug;
    return OTHER_ROLE.slug;
  }
  // A vacancy is named by its title; the board's specialization helps when the title is vague.
  for (const role of ROLES) {
    if (role.types.includes('job') && role.pattern.test(title)) return role.slug;
  }
  if (extra) {
    for (const role of ROLES) {
      if (role.types.includes('job') && role.pattern.test(extra)) return role.slug;
    }
  }
  return OTHER_ROLE.slug;
}

// ---------- Languages ----------

const LANGUAGES: Array<[string, RegExp]> = [
  ['Java', rx(`${W}java${E}(?!\\s*script)`)],
  ['Python', rx(`python|питон|django|fastapi`)],
  ['Go', rx(`golang|${W}go[- ]?(?:разработчик|developer|engineer|backend|бэкенд)|${W}go${E}`)],
  ['PHP', rx(`${W}php|laravel|symfony|yii`)],
  ['C#/.NET', rx(`c#|\\.net|${W}dotnet|asp\\.net`)],
  ['Node.js', rx(`node\\.?js|nest\\.?js|${W}node${E}`)],
  ['C++', rx(`c\\+\\+`)],
  ['Kotlin', rx(`kotlin`)],
  ['Ruby', rx(`${W}ruby|rails`)],
  ['Rust', rx(`${W}rust${E}`)],
  ['Scala', rx(`${W}scala${E}`)],
  ['TypeScript', rx(`typescript|${W}ts${E}`)],
  ['JavaScript', rx(`javascript|${W}js${E}`)],
];

/** Main language of a developer vacancy: from the title first, then the listed skills. */
export function detectLanguage(title: string, skills: string[]): string | undefined {
  for (const [name, pattern] of LANGUAGES) if (pattern.test(title)) return name;
  const listed = skills.join(', ');
  for (const [name, pattern] of LANGUAGES) if (pattern.test(listed)) return name;
  return undefined;
}

// ---------- Grade ----------

const GRADE_PATTERNS: Array<[Grade, RegExp]> = [
  ['lead', rx(`${W}(?:team ?lead|tech ?lead|lead|лид|тимлид|техлид|head|principal|architect|архитектор|руководител\\p{L}*|cto)${E}`)],
  ['senior', rx(`${W}(?:senior|сеньор|синьор|старш\\p{L}*|ведущ\\p{L}*|sr\\.?)${E}`)],
  ['middle', rx(`${W}(?:middle|мидл|mid)${E}`)],
  ['junior', rx(`${W}(?:junior|джуниор|джун|младш\\p{L}*|jr\\.?)${E}`)],
  ['intern', rx(`${W}(?:intern|internship|стаж[её]р\\p{L}*|стажировк\\p{L}*|trainee|практикант\\p{L}*)${E}`)],
];

/** Seniority from the title, the board's own grade, or Хабр's #junior/#middle tags. */
export function detectGrade(title: string, text: string, boardGrade?: string): Grade | undefined {
  // «Middle+/Senior» means senior: the highest grade named wins.
  for (const [grade, pattern] of GRADE_PATTERNS) if (pattern.test(title)) return grade;
  if (boardGrade) for (const [grade, pattern] of GRADE_PATTERNS) if (pattern.test(boardGrade)) return grade;
  const tag = text.match(/#(intern|junior|middle|senior|lead)\b/i)?.[1]?.toLowerCase();
  return tag ? (tag as Grade) : undefined;
}

// ---------- Employer ----------

export function detectCompany(lead: Pick<Lead, 'author' | 'text' | 'type'>, facts?: PageFacts): string | undefined {
  const fromText =
    lead.text.match(/Вакансия компании:\s*([^\n]{2,80})/u)?.[1] ??
    lead.text.match(/Компания «(.{2,80}?)» ищет/u)?.[1] ??
    lead.text.match(/Компания «([^»]{2,80})»/u)?.[1] ??
    lead.text.match(/^(?:Компания|Company):\s*([^\n]{2,80})/mu)?.[1];
  const name = facts?.company ?? fromText ?? (lead.type === 'job' ? lead.author : undefined);
  const clean = name?.replace(/\s+/g, ' ').trim();
  return clean && !clean.startsWith('@') ? clean : undefined;
}

// ---------- Pay ----------

const NUM = String.raw`(\d{1,3}(?:[   ]\d{3})+|\d+(?:[.,]\d+)?)\s*(к|k|тыс\.?|тысяч)?`;
const UNIT = String.raw`(₽|руб\p{L}*\.?|р\.|rub|\$|usd|долл\p{L}*|€|eur|евро|₸|тенге|kzt|byn|грн|uah)`;

function toNumber(raw: string | undefined, thousands?: string): number | undefined {
  if (!raw) return undefined;
  const value = Number.parseFloat(raw.replace(/[   ]/g, '').replace(',', '.'));
  if (!Number.isFinite(value) || value <= 0) return undefined;
  return Math.round(thousands ? value * 1000 : value);
}

function currencyOf(unit: string): string {
  const u = unit.toLowerCase();
  if (u === '$' || u.startsWith('usd') || u.startsWith('долл')) return 'USD';
  if (u === '€' || u.startsWith('eur') || u.startsWith('евро')) return 'EUR';
  if (u === '₸' || u.startsWith('тенге') || u === 'kzt') return 'KZT';
  if (u === 'byn') return 'BYN';
  if (u.startsWith('грн') || u === 'uah') return 'UAH';
  return 'RUB';
}

function periodNear(text: string, index: number, type: LeadType): Pay['period'] {
  const tail = text.slice(index, index + 60).toLowerCase();
  if (/(?:в|за|\/)\s*час|per hour|\/\s*h(?:r|our)?\b|hourly/.test(tail)) return 'hour';
  if (/(?:в|за|\/)\s*год|per year|annual|\/\s*y(?:ea)?r\b/.test(tail)) return 'year';
  return type === 'job' ? 'month' : 'project';
}

/**
 * Pay written in the text, keeping what the bounds mean: «от 150 000 ₽» is a lower bound,
 * «до 200 000 ₽» an upper one. A number counts only next to a currency, so «3–5 лет
 * опыта» is never a salary.
 */
export function parsePayText(text: string, type: LeadType): Pay | undefined {
  const source = normalizeWhitespace(text.replace(/[  ]/g, ' '));
  const patterns: Array<[RegExp, (m: RegExpExecArray) => Pay | undefined]> = [
    // «от 180 000 до 240 000 ₽», «180–240 тыс. руб»
    [new RegExp(`(?:от\\s*)?${NUM}\\s*(?:-|–|—|до)\\s*${NUM}\\s*${UNIT}`, 'iu'), (m) => ({
      min: toNumber(m[1], m[2] ?? m[4]), max: toNumber(m[3], m[4]), currency: currencyOf(m[5]!), period: periodNear(source, m.index + m[0].length, type), origin: 'text',
    })],
    // «$3000 - $5000»
    [/([$€])\s*(\d[\d ]{0,9}\d|\d)\s*(k)?\s*(?:-|–|—)\s*[$€]?\s*(\d[\d ]{0,9}\d|\d)\s*(k)?/iu, (m) => ({
      min: toNumber(m[2], m[3] ?? m[5]), max: toNumber(m[4], m[5]), currency: currencyOf(m[1]!), period: periodNear(source, m.index + m[0].length, type), origin: 'text',
    })],
    // «от 290 000 ₽»
    [new RegExp(`от\\s*${NUM}\\s*${UNIT}`, 'iu'), (m) => ({
      min: toNumber(m[1], m[2]), currency: currencyOf(m[3]!), period: periodNear(source, m.index + m[0].length, type), origin: 'text',
    })],
    // «до 188 000 ₽»
    [new RegExp(`до\\s*${NUM}\\s*${UNIT}`, 'iu'), (m) => ({
      max: toNumber(m[1], m[2]), currency: currencyOf(m[3]!), period: periodNear(source, m.index + m[0].length, type), origin: 'text',
    })],
    // «150 000 ₽», «бюджет 5000 руб»
    [new RegExp(`${NUM}\\s*${UNIT}`, 'iu'), (m) => {
      const value = toNumber(m[1], m[2]);
      return { min: value, max: value, currency: currencyOf(m[3]!), period: periodNear(source, m.index + m[0].length, type), origin: 'text' };
    }],
    // «$5000»
    [/([$€])\s*(\d[\d ]{0,9}\d|\d)\s*(k)?/iu, (m) => {
      const value = toNumber(m[2], m[3]);
      return { min: value, max: value, currency: currencyOf(m[1]!), period: periodNear(source, m.index + m[0].length, type), origin: 'text' };
    }],
  ];
  for (const [pattern, build] of patterns) {
    const match = pattern.exec(source);
    if (!match) continue;
    const pay = build(match);
    if (pay && (pay.min !== undefined || pay.max !== undefined)) {
      if (pay.min !== undefined && pay.max !== undefined && pay.min > pay.max) [pay.min, pay.max] = [pay.max, pay.min];
      return pay;
    }
  }
  return undefined;
}

function payFromPage(salary: PageSalary | undefined): Pay | undefined {
  if (!salary || (salary.min === undefined && salary.max === undefined)) return undefined;
  return { ...salary, origin: 'page' };
}

/** Sane bounds in roubles; anything outside is a parsing slip, not a salary. */
const BOUNDS: Record<'month' | 'hour' | 'project', [number, number]> = {
  month: [12_000, 3_000_000],
  hour: [150, 30_000],
  project: [300, 20_000_000],
};

interface NormalizedPay {
  min?: number;
  max?: number;
  point: number;
  period: 'month' | 'hour' | 'project';
}

export function normalizePay(pay: Pay, type: LeadType): NormalizedPay | undefined {
  const rate = RUB_PER[pay.currency.toUpperCase()];
  if (!rate) return undefined;
  let factor = rate;
  let period: NormalizedPay['period'];
  if (pay.period === 'hour') period = 'hour';
  else if (type === 'gig') period = 'project';
  else {
    period = 'month';
    if (pay.period === 'year') factor = rate / 12;
  }
  const min = pay.min === undefined ? undefined : Math.round(pay.min * factor);
  const max = pay.max === undefined ? undefined : Math.round(pay.max * factor);
  // A vacancy «monthly» figure above the ceiling with no year marker is a yearly salary
  // from an international board (Jobicy, RemoteOK).
  if (period === 'month' && pay.period !== 'year' && pay.currency !== 'RUB' && (max ?? min ?? 0) > BOUNDS.month[1] / 2) {
    return normalizePay({ ...pay, period: 'year' }, type);
  }
  const point = min !== undefined && max !== undefined ? Math.round((min + max) / 2) : (min ?? max)!;
  const [low, high] = BOUNDS[period];
  if (point < low || point > high) return undefined;
  return { min, max, point, period };
}

// ---------- Record ----------

const AI_MENTION = rx(`нейросет|${W}llm${E}|${W}gpt|chatgpt|openai|langchain|${W}rag${E}|генеративн|prompt|промпт|вайб|vibe|cursor|copilot|${W}ии${E}|${W}ai${E}|machine learning|машинн\\p{L}* обучен`);
const REMOTE = /удал[её]нн|удал[её]нк|можно\s+удал|дистанц|remote|anywhere/i;

function regionOf(city: string | undefined): ResearchRecord['region'] {
  if (!city || /^(?:онлайн|удал)/i.test(city)) return 'Не указан';
  if (/москв/i.test(city)) return 'Москва';
  if (/петербург|спб/i.test(city)) return 'Санкт-Петербург';
  return 'Другие города';
}

function platformOf(url: string | undefined, fallback: string): string {
  if (!url) return fallback;
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return fallback;
  }
}

export function factsOf(lead: Pick<Lead, 'metadata'>): PageFacts | undefined {
  const facts = lead.metadata?.facts;
  return facts && typeof facts === 'object' ? (facts as PageFacts) : undefined;
}

/** Boards that publish only vacancies, whatever type an older post was stored with. */
const JOB_BOARDS = /^https?:\/\/(?:www\.)?(?:jobicy\.com|weworkremotely\.com|remoteok\.com)\//i;

/** Model answers below this confidence are kept but never used in figures. */
export const MIN_CONFIDENCE = 0.7;

/** The model's answer when it is current and confident enough to use. */
export function modelFactsOf(lead: Pick<Lead, 'metadata'>): ModelFacts | undefined {
  const stored = lead.metadata?.model as StoredModelFacts | undefined;
  const facts = stored?.facts;
  return facts && typeof facts === 'object' && facts.confidence >= MIN_CONFIDENCE ? facts : undefined;
}

export interface DeriveOptions {
  /** Use the model's answers; off while their quality is being checked. */
  useModel?: boolean;
}

export function deriveRecord(lead: Lead, options: DeriveOptions = {}): ResearchRecord {
  const facts = factsOf(lead);
  const model = options.useModel === false ? undefined : modelFactsOf(lead);
  const type = lead.url && JOB_BOARDS.test(lead.url) ? 'job' : (lead.type ?? 'gig');
  const head = lead.text.slice(0, 3000);
  const skills = Array.from(new Set([...(lead.skills ?? []), ...(facts?.skills ?? []), ...extractTechSkills(`${lead.title}\n${head}`, 12), ...(model?.skills ?? [])]));
  // Rules and page markup first; the model fills what they left open.
  const ruled = classifyRole(type, lead.title, type === 'gig' ? head.slice(0, 600) : (facts?.specialization ?? ''));
  const role = ruled === OTHER_ROLE.slug && model?.role ? model.role : ruled;

  const fromModel: Pay | undefined = model?.currency && model.period
    ? { min: model.payMin, max: model.payMax, currency: model.currency, period: model.period, origin: 'model' }
    : undefined;
  const pay = payFromPage(facts?.salary) ?? parsePayText(`${lead.title}\n${head}`, type)
    ?? (typeof lead.budget === 'number' && lead.budget > 0
      ? { min: lead.budget, max: lead.budget, currency: lead.currency ?? 'RUB', period: lead.paymentPeriod === 'hourly' ? 'hour' as const : type === 'job' ? 'month' as const : 'project' as const, origin: 'budget' as const }
      : fromModel);
  const normalized = pay ? normalizePay(pay, type) : undefined;
  const currency = pay?.currency.toUpperCase();
  const developer = ['backend', 'fullstack', 'frontend', 'mobile', 'data-engineer', 'ml', 'qa', 'gamedev', 'embedded'].includes(role);
  const city = lead.city ?? head.match(/Регион:\s*([^\n]{2,40})/u)?.[1] ?? head.match(/\.\s*([А-ЯЁ][а-яё-]+(?: [А-ЯЁ][а-яё-]+)?) \(Россия\)/u)?.[1] ?? model?.city;

  return {
    id: lead.id,
    date: (lead.publishedAt ?? lead.createdAt).slice(0, 10),
    type,
    platform: lead.sourceRef?.platform === 'telegram' ? 'telegram' : platformOf(lead.url, lead.sourceRef?.platform ?? 'other'),
    role,
    grade: type === 'job' ? detectGrade(lead.title, head, facts?.grade) ?? model?.grade : undefined,
    language: type === 'job' && developer
      ? detectLanguage(lead.title, role === 'frontend' ? skills.filter((skill) => /script|^js$|^ts$/i.test(skill)) : skills)
        ?? (model?.language ? detectLanguage(model.language, []) : undefined)
      : undefined,
    region: regionOf(city),
    remote: Boolean(facts?.remote) || Boolean(model?.remote) || REMOTE.test(`${lead.title}\n${head}`) || /^(?:онлайн|удал)/i.test(lead.city ?? ''),
    company: detectCompany(lead, facts) ?? model?.company,
    skills,
    ai: AI_MENTION.test(`${lead.title}\n${head}`),
    market: normalized ? (currency === 'RUB' || currency === 'RUR' || currency === 'KZT' || currency === 'BYN' ? 'ru' : 'intl') : undefined,
    payMin: normalized?.min,
    payMax: normalized?.max,
    pay: normalized?.point,
    payPeriod: normalized?.period,
    payOrigin: normalized ? pay!.origin : undefined,
    currency: normalized ? currency : undefined,
    ...(model?.isPost === false ? { excluded: true } : {}),
  };
}
