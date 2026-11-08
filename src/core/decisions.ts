/**
 * Decisions: a fast model that answers fixed questions about a post with probabilities instead
 * of writing text. Any service with the `/v1/systemone` shape fits: SubQ Snap, Jev, or a Laya or
 * Kev running on your own machine. With RADAR_DECIDE_APPLY a sure answer hides a post and moves
 * its score. Each such step is kept, and a person can take it back: a post's author writes the
 * text the model reads, and a sentence can steer it. See docs/DECISIONS.md.
 */

/** Raised when the questions change: older answers then no longer compare. */
export const DECISION_VERSION = 2;

export const DECISION_KINDS = ['vacancy', 'order', 'resume', 'other'] as const;
export type DecisionKind = (typeof DECISION_KINDS)[number];

/** The research directions a post can name, mirroring ROLES in research/derive.ts. */
export const DECISION_ROLES: Record<string, string> = {
  ai: 'AI-инженер и вайб-кодинг',
  '1c': 'Программист 1С',
  security: 'Информационная безопасность',
  qa: 'Тестировщик (QA)',
  devops: 'DevOps и SRE',
  architect: 'Архитектор ПО',
  sysadmin: 'Системный администратор',
  'data-engineer': 'Data-инженер',
  'analyst-system': 'Системный аналитик',
  'analyst-business': 'Бизнес-аналитик',
  'analyst-data': 'Аналитик данных и продуктовый аналитик',
  ml: 'Data Science и ML',
  product: 'Продакт-менеджер',
  project: 'Проджект-менеджер',
  design: 'Дизайнер',
  gamedev: 'Разработчик игр',
  mobile: 'Мобильный разработчик',
  fullstack: 'Fullstack-разработчик',
  frontend: 'Frontend-разработчик',
  embedded: 'Embedded-разработчик',
  backend: 'Backend-разработчик',
  education: 'Преподавание и менторство',
  support: 'Техподдержка',
  marketing: 'Маркетинг и реклама',
  content: 'Тексты и контент',
  sales: 'Продажи',
  hr: 'HR и рекрутинг',
  web: 'Сайты',
  bots: 'Боты',
  parsing: 'Парсинг и автоматизация',
  marketplaces: 'Маркетплейсы',
  video: 'Видео и анимация',
  translation: 'Переводы',
  'dev-other': 'Другая разработка',
  other: 'Другое',
};

export const DECISION_GRADES = ['intern', 'junior', 'middle', 'senior', 'lead'] as const;

export const DECISION_QUESTIONS = {
  kind: {
    type: 'choice',
    instructions: 'Что это за пост?',
    criteria: {
      vacancy: 'Работодатель ищет сотрудника в штат или на постоянную работу',
      order: 'Заказчик ищет исполнителя на разовую задачу или проект',
      resume: 'Человек сам ищет работу или предлагает свои услуги',
      other: 'Реклама, курс, новость, опрос или текст без предложения работы',
    },
  },
  direction: {
    type: 'choice',
    instructions: 'Какое направление работы описывает пост? null — определить не удалось.',
    criteria: DECISION_ROLES,
  },
  remote: {
    type: 'noul',
    instructions: 'Пост обещает удалённую работу из любой точки?',
    criteria: { true: 'Удалённо, из дома, дистанционно, из любой точки мира', false: 'Офис, город, выезд или формат не назван' },
  },
  grade: {
    type: 'choice',
    instructions: 'Какой опыт требует пост? null — не указан.',
    criteria: { intern: 'Стажировка', junior: 'Джун: без опыта или до года', middle: 'Миддл: от года до трёх', senior: 'Сеньор: от трёх лет', lead: 'Лид или руководитель команды' },
  },
  closed: {
    type: 'noul',
    instructions: 'Пост прямо говорит, что вакансия или заказ уже закрыты?',
    criteria: { true: 'Есть слова вроде «вакансия закрыта», «в архиве», «исполнитель найден»', false: 'Такого нет' },
  },
  scam: {
    type: 'noul',
    instructions: 'Похоже на мошенничество?',
    criteria: { true: 'Деньги вперёд, лёгкий заработок без навыков, сомнительная схема', false: 'Обычное предложение работы' },
  },
  fullness: {
    type: 'score',
    instructions: 'Насколько полно пост описывает работу?',
    criteria: ['Почти ничего', 'Только название и общие слова', 'Есть задачи и условия', 'Подробно: задачи, требования, условия, оплата'],
  },
} as const;

export interface ModelDecision {
  leadId: string;
  version: number;
  model: string;
  kind: DecisionKind;
  kindConfidence: number;
  /** v2: the research direction the post describes, with how sure the answer is. */
  direction?: string;
  directionConfidence?: number;
  remote?: number;
  grade?: string;
  closed: number;
  scam: number;
  fullness: number;
  tokens: number;
  decidedAt: string;
  /** What the node did on this answer. */
  applied?: string;
  overruled?: boolean;
}

/** Above this the model is taken to say yes. To be set from labels, not guessed: see below. */
export const FLAG_AT = 0.5;

/** How sure the model must be before a post leaves the feed. */
export const HIDE_SCAM_AT = 0.75;
export const HIDE_JUNK_AT = 0.9;
export const CLOSE_AT = 0.9;

export type DecisionAction = 'hidden_scam' | 'hidden_junk' | 'closed';

/** What the node does with an answer, if anything. */
export function decisionAction(d: Pick<ModelDecision, 'kind' | 'kindConfidence' | 'closed' | 'scam'>): DecisionAction | undefined {
  if (d.scam >= HIDE_SCAM_AT) return 'hidden_scam';
  if ((d.kind === 'other' || d.kind === 'resume') && d.kindConfidence >= HIDE_JUNK_AT) return 'hidden_junk';
  if (d.closed >= CLOSE_AT) return 'closed';
  return undefined;
}

/** Points a post gains or loses in the feed: a full description lifts it, doubt sinks it. */
export function scoreShift(d: Pick<ModelDecision, 'fullness' | 'scam'>): number {
  return Math.round((d.fullness - 1.5) * 4 - d.scam * 30);
}

/** The answer as the service sent it, or undefined when it is not the shape asked for. */
export function parseDecision(body: unknown, leadId: string, model: string, decidedAt: string): ModelDecision | undefined {
  const answers = (body as { answers?: Record<string, Record<string, unknown>> } | null)?.answers;
  const kind = answers?.kind?.choice;
  const confidence = answers?.kind?.confidence;
  const closed = answers?.closed?.noul;
  const scam = answers?.scam?.noul;
  const fullness = answers?.fullness?.score;
  if (typeof kind !== 'string' || !(DECISION_KINDS as readonly string[]).includes(kind)) return undefined;
  if (typeof closed !== 'number' || typeof scam !== 'number' || typeof fullness !== 'number') return undefined;
  const tokens = (body as { usage?: { input_tokens?: unknown } }).usage?.input_tokens;
  // v2 answers are optional: a service that only knows the v1 questions still parses.
  const direction = answers?.direction?.choice;
  const directionConfidence = answers?.direction?.confidence;
  const remote = answers?.remote?.noul;
  const grade = answers?.grade?.choice;
  return {
    leadId, version: DECISION_VERSION, model, kind: kind as DecisionKind,
    kindConfidence: typeof confidence === 'number' ? confidence : 0,
    direction: typeof direction === 'string' && direction in DECISION_ROLES ? direction : undefined,
    directionConfidence: typeof directionConfidence === 'number' ? directionConfidence : undefined,
    remote: typeof remote === 'number' ? remote : undefined,
    grade: typeof grade === 'string' && (DECISION_GRADES as readonly string[]).includes(grade) ? grade : undefined,
    closed, scam, fullness, tokens: typeof tokens === 'number' ? tokens : 0, decidedAt,
  };
}

/** Does the model disagree with what the node believes about the post? */
export function disagreement(decision: Pick<ModelDecision, 'kind' | 'closed' | 'scam'>, lead: { type?: string; state?: string }): string | undefined {
  if (decision.closed >= FLAG_AT && lead.state !== 'closed') return 'closed';
  if (decision.scam >= FLAG_AT) return 'scam';
  if (decision.kind === 'other' || decision.kind === 'resume') return decision.kind;
  if (decision.kind === 'vacancy' && lead.type === 'gig') return 'type';
  if (decision.kind === 'order' && lead.type === 'job') return 'type';
  return undefined;
}

export interface LabelledDecision {
  verdict: string;
  type?: string;
  kind: string;
  kindConfidence: number;
  closed: number;
  scam?: number;
}

export interface FlagScore {
  /** Posts the model flagged, of which a person agreed. */
  flagged: number;
  right: number;
  /** Posts a person flagged, of which the model caught. */
  actual: number;
  caught: number;
}

export interface DecisionScore {
  n: number;
  closed: FlagScore;
  junk: FlagScore;
  scam: FlagScore;
  type: FlagScore;
  /** Mean squared gap between the closed probability and the truth: 0 is perfect, 0.25 a coin. */
  closedBrier: number | null;
  /** Share of posts the model answers with this confidence or more, and how many it gets right. */
  byConfidence: Array<{ at: number; answered: number; right: number }>;
}

const flag = (): FlagScore => ({ flagged: 0, right: 0, actual: 0, caught: 0 });

function count(score: FlagScore, said: boolean, truth: boolean): void {
  if (said) score.flagged++;
  if (truth) score.actual++;
  if (said && truth) {
    score.right++;
    score.caught++;
  }
}

/** The model against posts a person checked. */
export function scoreDecisions(labelled: LabelledDecision[]): DecisionScore {
  // «Не знаю» says nothing about the post.
  const rows = labelled.filter((row) => row.verdict !== 'skip');
  const score: DecisionScore = { n: rows.length, closed: flag(), junk: flag(), scam: flag(), type: flag(), closedBrier: null, byConfidence: [] };
  let brier = 0;
  for (const row of rows) {
    const isClosed = row.verdict === 'closed';
    count(score.closed, row.closed >= FLAG_AT, isClosed);
    brier += (row.closed - (isClosed ? 1 : 0)) ** 2;
    count(score.junk, row.kind === 'other' || row.kind === 'resume', row.verdict === 'junk');
    count(score.scam, (row.scam ?? 0) >= FLAG_AT, row.verdict === 'scam');
    const typed = row.kind === 'vacancy' ? 'job' : row.kind === 'order' ? 'gig' : undefined;
    count(score.type, Boolean(typed && row.type && typed !== row.type), row.verdict === 'wrong_type');
  }
  if (rows.length) score.closedBrier = brier / rows.length;
  for (const at of [0.5, 0.7, 0.8, 0.9, 0.95]) {
    const sure = rows.filter((row) => row.kindConfidence >= at);
    const right = sure.filter((row) => (row.kind === 'other' || row.kind === 'resume') === (row.verdict === 'junk')).length;
    score.byConfidence.push({ at, answered: sure.length, right });
  }
  return score;
}
