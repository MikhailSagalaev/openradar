/**
 * The market report: medians and quartiles of pay by role, grade, language, region and
 * skill, built from research records. A figure is published only when enough posts stand
 * behind it (MIN_MEDIAN); quartiles need more (MIN_QUARTILES).
 */
import { GRADE_LABELS, GRADE_ORDER, OTHER_ROLE, ROLES, RUB_PER, roleDef, type ResearchRecord } from './derive.ts';

/** Bump when the rules change what a figure means; snapshots keep the version they were built with. */
export const REPORT_VERSION = 2;
export const MIN_MEDIAN = 10;
export const MIN_QUARTILES = 20;
export const RELIABLE = 30;
/** Pay figures compared at equal role and grade need this many matched posts. */
const MIN_ADJUSTED = 30;
/** Roles of the IT market: the headline for it leaves sales, support and the like out. */
const TECH_ROLES = new Set(['ai', '1c', 'security', 'qa', 'devops', 'architect', 'sysadmin', 'data-engineer', 'analyst-system', 'analyst-business', 'analyst-data', 'ml', 'product', 'project', 'gamedev', 'mobile', 'fullstack', 'frontend', 'embedded', 'backend']);

export interface Dist {
  n: number;
  p25?: number;
  median?: number;
  p75?: number;
  iqr?: number;
  trimmedMean?: number;
  /** 95% confidence interval of the median, from order statistics. */
  ciLow?: number;
  ciHigh?: number;
}

export interface CartaCapitalRow {
  label: string;
  n: number;
  nShare: number;
  capitalRub: number;
  capitalShare: number;
}

export interface TaskTransformationItem {
  label: string;
  n: number;
  /** Against the base median; absent when either side has fewer than MIN_MEDIAN paid posts. */
  changePct?: number;
  medianPay?: number;
}

export interface BumpRankItem {
  name: string;
  rank: number;
  n: number;
}

export interface BumpSnapshot {
  period: string;
  ranks: BumpRankItem[];
}

export interface Slice {
  key: string;
  label: string;
  /** Posts in the slice. */
  n: number;
  /** Of them with pay. */
  withPay: number;
  pay: Dist;
}

export interface Finding {
  text: string;
  /** A ready sentence to quote, with the source and the sample size. */
  quote: string;
}

export interface RoleDetail {
  slug: string;
  label: string;
  plural: string;
  n: number;
  withPay: number;
  pay: Dist;
  byGrade: Slice[];
  byLanguage: Slice[];
  byRegion: Slice[];
  skills: Array<{ skill: string; n: number; pay: Dist }>;
  companies: Array<{ name: string; n: number }>;
  remoteShare: number;
}

/** A difference in pay between posts of the same role and grade. */
export interface Adjusted {
  pct: number;
  /** Matched posts behind it. */
  n: number;
}

export interface Report {
  version: number;
  kind: 'live' | 'month';
  period: { from: string; to: string; label: string; phrase: string; slug?: string };
  generatedAt: string;
  totals: {
    posts: number;
    jobs: number;
    gigs: number;
    jobsWithPay: number;
    gigsWithBudget: number;
    companies: number;
    platforms: Array<{ key: string; n: number }>;
    /** Where the pay of the posts came from: page markup, the text, the board's budget, the model. */
    payOrigins?: Record<string, number>;
    /** Posts the model found to be ads, resumes or chatter, left out of every figure. */
    excluded?: number;
    /** English-language vacancies and orders, counted apart from the main figures. */
    intlJobs?: number;
    intlGigs?: number;
    /** Russian-language vacancies paying in dollars or euros: outside the rouble median. */
    foreignPayJobs?: number;
  };
  jobs: {
    pay: Dist;
    payShare: number;
    /** Vacancies of IT roles only. */
    it?: Dist;
    /** How the sums were written, and the median of full ranges alone. */
    bounds?: { range: number; from: number; to: number; single: number; rangeMedian?: number };
    byPlatform?: Slice[];
    intl: Dist;
    byRole: Slice[];
    byGrade: Slice[];
    byLanguage: Slice[];
    byRegion: Slice[];
    remote: { share: number; remote: Dist; office: Dist; adjusted?: Adjusted };
    ai: { share: number; with: Dist; without: Dist; adjusted?: Adjusted };
    moscowAdjusted?: Adjusted;
    skills: Array<{ skill: string; n: number; pay: Dist }>;
    companies: Array<{ name: string; n: number }>;
    histogram: Array<{ from: number; to?: number; n: number }>;
    weekly: Array<{ week: string; n: number; median?: number }>;
    /** Same pay, held to a fixed role mix. 100 is the first week that has a basket. */
    weeklyIndexed?: Array<{ week: string; index: number; n: number }>;
    roles: RoleDetail[];
  };
  gigs: { budget: Dist; budgetShare: number; byCategory: Slice[]; hourly: Dist };
  findings: Finding[];
  /** Roubles per unit at the end of the period (Bank of Russia). */
  fx?: Record<string, number>;
  cartaCapital?: CartaCapitalRow[];
  taskTransformation?: {
    routine: TaskTransformationItem[];
    emerging: TaskTransformationItem[];
    netShiftPct?: number;
    routineMedian?: number;
    emergingMedian?: number;
    totalMatched?: number;
  };
  bumpChart?: {
    quarters: BumpSnapshot[];
    months: BumpSnapshot[];
  };
  editorialInsight?: {
    fact: string;
    contrast: string;
    conclusion: string;
    quote: string;
  };
}

function quantile(sorted: number[], q: number): number {
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
}

/** Pay is rounded to a thousand roubles: finer digits would only suggest false precision. */
const round = (value: number): number => (value >= 10_000 ? Math.round(value / 1000) * 1000 : Math.round(value / 10) * 10);

export function dist(values: number[]): Dist {
  const sorted = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  const n = sorted.length;
  if (n < MIN_MEDIAN) return { n };
  const out: Dist = { n, median: round(quantile(sorted, 0.5)) };
  // Order statistics give the interval of a median with no assumption about the distribution.
  const reach = 0.98 * Math.sqrt(n);
  out.ciLow = round(sorted[Math.max(0, Math.round(n / 2 - reach) - 1)]!);
  out.ciHigh = round(sorted[Math.min(n - 1, Math.round(n / 2 + 1 + reach) - 1)]!);
  if (n >= MIN_QUARTILES) {
    out.p25 = round(quantile(sorted, 0.25));
    out.p75 = round(quantile(sorted, 0.75));
    out.iqr = out.p75 - out.p25;
    const lo = Math.floor(n * 0.05);
    const hi = Math.ceil(n * 0.95);
    const slice = sorted.slice(lo, hi);
    if (slice.length > 0) {
      out.trimmedMean = round(slice.reduce((a, b) => a + b, 0) / slice.length);
    }
  }
  return out;
}

/**
 * The difference in pay between two groups of posts at the same role and grade: a plain gap
 * mostly shows who the groups are (remote vacancies are more senior). Each role-and-grade cell
 * with both groups gives a ratio of medians; cells weigh by their smaller group.
 */
function adjustedGap(paid: ResearchRecord[], inGroup: (r: ResearchRecord) => boolean): Adjusted | undefined {
  const cells = new Map<string, { yes: number[]; no: number[] }>();
  for (const r of paid) {
    if (r.role === OTHER_ROLE.slug || !r.grade) continue;
    const key = `${r.role}|${r.grade}`;
    const cell = cells.get(key) ?? { yes: [], no: [] };
    (inGroup(r) ? cell.yes : cell.no).push(r.pay!);
    cells.set(key, cell);
  }
  const median = (values: number[]): number => quantile([...values].sort((a, b) => a - b), 0.5);
  let weight = 0;
  let sum = 0;
  for (const { yes, no } of cells.values()) {
    if (yes.length < 3 || no.length < 3) continue;
    const w = Math.min(yes.length, no.length);
    weight += w;
    sum += w * Math.log(median(yes) / median(no));
  }
  return weight >= MIN_ADJUSTED ? { pct: Math.round((Math.exp(sum / weight) - 1) * 100), n: weight } : undefined;
}

/** Orders with a budget by direction: both shares come from the same posts in the same unit. */
function computeCartaCapital(records: ResearchRecord[]): CartaCapitalRow[] {
  if (!records.length) return [];
  const groups = new Map<string, { n: number; capital: number }>();
  let totalPosts = 0;
  let totalCapital = 0;

  for (const r of records) {
    totalPosts++;
    const label = roleDef(r.role)?.label ?? OTHER_ROLE.label;
    const cur = groups.get(label) ?? { n: 0, capital: 0 };
    cur.n++;
    const pay = r.pay ?? 0;
    if (pay > 0) {
      cur.capital += pay;
      totalCapital += pay;
    }
    groups.set(label, cur);
  }

  const sorted = Array.from(groups, ([label, g]) => ({
    label,
    n: g.n,
    capitalRub: g.capital,
  })).sort((a, b) => b.capitalRub - a.capitalRub || b.n - a.n);

  let displayed: Array<{ label: string; n: number; capitalRub: number }> = [];
  if (sorted.length <= 5) {
    displayed = sorted;
  } else {
    displayed = sorted.slice(0, 5);
    const remainder = sorted.slice(5);
    const remN = remainder.reduce((s, r) => s + r.n, 0);
    const remCap = remainder.reduce((s, r) => s + r.capitalRub, 0);
    displayed.push({
      label: 'Другие направления',
      n: remN,
      capitalRub: remCap,
    });
  }

  let sumNShare = 0;
  let sumCapShare = 0;

  return displayed.map((row, idx) => {
    const isLast = idx === displayed.length - 1;
    let nShare: number;
    let capitalShare: number;

    if (!isLast) {
      nShare = Math.round((row.n / totalPosts) * 1000) / 10;
      sumNShare += nShare;
      capitalShare = totalCapital > 0 ? Math.round((row.capitalRub / totalCapital) * 1000) / 10 : 0;
      sumCapShare += capitalShare;
    } else {
      nShare = Math.round((100.0 - sumNShare) * 10) / 10;
      capitalShare = totalCapital > 0 ? Math.round((100.0 - sumCapShare) * 10) / 10 : 0;
    }

    return {
      label: row.label,
      n: row.n,
      nShare,
      capitalRub: row.capitalRub,
      capitalShare,
    };
  });
}

const projectPay = (r: ResearchRecord): boolean => r.payPeriod === 'project' && (r.pay ?? 0) > 0;

/** Russian-language orders only: project budgets compare with project budgets, never with salaries. */
function computeTaskTransformation(records: ResearchRecord[]) {
  const routineDefs = [
    { key: 'copywriting', label: 'Базовый копирайтинг и рерайт текстов', rx: /копирайт|рерайт|статьи|написание текста|контент|writer/i, roles: ['content'] },
    // Not the whole `web` role and not html/css skills: every frontend developer has those.
    { key: 'html', label: 'Шаблонная вёрстка и типовые сайты', rx: /верстк|лендинг|tilda|тильд/i, roles: [] },
    { key: 'translation', label: 'Типовой перевод документации и статей', rx: /перевод|translat/i, roles: ['translation'] },
    { key: 'banner', label: 'Типовые баннеры, креативы и карточки', rx: /баннер|карточк|креатив|обложк/i, roles: ['design', 'marketplaces'] },
  ];

  const emergingDefs = [
    // Whole words only: a bare `flux` matched «influx», `lora` matched «floral».
    { key: 'agents', label: 'Интеграция AI-агентов, RAG & n8n/Make', rx: /(?<![\p{L}\p{N}])(?:ai[- ]?агент\p{L}*|rag|n8n|make\.com|автоматизаци[яи] llm|langchain|llamaindex)(?![\p{L}\p{N}])/iu, roles: ['ai'] },
    { key: 'vibe', label: 'Рефакторинг кода после AI (Cursor/Lovable)', rx: /(?<![\p{L}\p{N}])(?:cursor|lovable|v0\.dev|вайб[- ]?кодинг\p{L}*|доработать mvp)(?![\p{L}\p{N}])/iu, roles: [] },
    { key: 'lora', label: 'Обучение LoRA и ComfyUI пайплайны', rx: /(?<![\p{L}\p{N}])(?:comfyui|lora|stable diffusion|flux)(?![\p{L}\p{N}])/iu, roles: [] },
    { key: 'tma', label: 'Telegram Mini Apps и AI-боты', rx: /(?<![\p{L}\p{N}])(?:tma|mini[- ]?apps?|telegram-бот\p{L}*|чат-бот\p{L}*)(?![\p{L}\p{N}])/iu, roles: ['bots'] },
  ];

  const routineStats = new Map<string, { n: number; pays: number[] }>();
  for (const d of routineDefs) routineStats.set(d.key, { n: 0, pays: [] });

  const emergingStats = new Map<string, { n: number; pays: number[] }>();
  for (const d of emergingDefs) emergingStats.set(d.key, { n: 0, pays: [] });

  const allRoutinePays: number[] = [];
  const allEmergingPays: number[] = [];
  let totalMatched = 0;

  for (const r of records) {
    const text = r.skills.join(' ');
    let matchedEmerging = false;

    for (const d of emergingDefs) {
      if (d.rx.test(text)) {
        const cur = emergingStats.get(d.key)!;
        cur.n++;
        if (projectPay(r)) {
          cur.pays.push(r.pay!);
          allEmergingPays.push(r.pay!);
        }
        matchedEmerging = true;
        totalMatched++;
        break;
      }
    }

    if (!matchedEmerging) {
      for (const d of routineDefs) {
        if (d.rx.test(text)) {
          const cur = routineStats.get(d.key)!;
          cur.n++;
          if (projectPay(r)) {
            cur.pays.push(r.pay!);
            allRoutinePays.push(r.pay!);
          }
          totalMatched++;
          break;
        }
      }
    }
  }

  const routineMed = allRoutinePays.length ? dist(allRoutinePays).median : undefined;
  const emergingMed = allEmergingPays.length ? dist(allEmergingPays).median : undefined;

  // No invented baseline: without enough paid posts a comparison is simply not shown.
  const allPays = records.filter(projectPay).map((r) => r.pay!);
  const overallMed = allPays.length ? dist(allPays).median : undefined;
  const baseline = routineMed ?? overallMed;
  const pct = (value: number | undefined, base: number | undefined): number | undefined =>
    value && base ? Math.round(((value - base) / base) * 100) : undefined;

  const routine: TaskTransformationItem[] = routineDefs.map((d) => {
    const st = routineStats.get(d.key)!;
    const med = st.pays.length ? dist(st.pays).median : undefined;
    return {
      label: d.label,
      n: st.n,
      changePct: pct(med, overallMed),
      medianPay: med,
    };
  });

  const emerging: TaskTransformationItem[] = emergingDefs.map((d) => {
    const st = emergingStats.get(d.key)!;
    const med = st.pays.length ? dist(st.pays).median : undefined;
    // A negative premium is a finding too; it is shown with its sign.
    return {
      label: d.label,
      n: st.n,
      changePct: pct(med, baseline),
      medianPay: med,
    };
  });

  const netShiftPct = pct(emergingMed, routineMed);

  return {
    // A row with no orders has nothing to show.
    routine: routine.filter((item) => item.n > 0),
    emerging: emerging.filter((item) => item.n > 0),
    netShiftPct,
    routineMedian: routineMed,
    emergingMedian: emergingMed,
    totalMatched,
  };
}

function computeBumpChart(records: ResearchRecord[]): { quarters: BumpSnapshot[]; months: BumpSnapshot[] } {
  const overallRoleCounts = new Map<string, number>();
  for (const r of records) {
    const slug = r.role;
    if (slug && slug !== OTHER_ROLE.slug) {
      overallRoleCounts.set(slug, (overallRoleCounts.get(slug) ?? 0) + 1);
    }
  }
  const topSlugs = [...overallRoleCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map((e) => e[0]);

  const fallbackSlugs = ['backend', 'frontend', 'ai', 'design', 'qa'];
  for (const s of fallbackSlugs) {
    if (topSlugs.length < 5 && !topSlugs.includes(s)) {
      topSlugs.push(s);
    }
  }

  // --- Mode 1: Weekly intervals ---
  const weeksMap = new Map<string, ResearchRecord[]>();
  for (const r of records) {
    const w = mondayOf(r.date);
    const list = weeksMap.get(w) ?? [];
    list.push(r);
    weeksMap.set(w, list);
  }
  const sortedWeeks = [...weeksMap.keys()].sort();

  let weeklyPeriods: Array<{ label: string; records: ResearchRecord[] }> = [];
  if (sortedWeeks.length >= 4) {
    const chosen = sortedWeeks.slice(-4);
    weeklyPeriods = chosen.map((w, idx) => {
      const isLast = idx === chosen.length - 1;
      return {
        label: `${w.slice(8, 10)}.${w.slice(5, 7)}${isLast ? ' (Live)' : ''}`,
        records: weeksMap.get(w) ?? [],
      };
    });
  } else {
    const sortedRecords = [...records].sort((a, b) => a.date.localeCompare(b.date));
    const n = sortedRecords.length;
    if (n === 0) {
      weeklyPeriods = [
        { label: 'Неделя 1', records: [] },
        { label: 'Неделя 2', records: [] },
        { label: 'Неделя 3', records: [] },
        { label: 'Неделя 4 (Live)', records: [] },
      ];
    } else {
      const bounds = [0, Math.floor(n / 4), Math.floor(n / 2), Math.floor((3 * n) / 4), n];
      weeklyPeriods = [0, 1, 2, 3].map((i) => {
        const slice = sortedRecords.slice(bounds[i], bounds[i + 1]);
        const d1 = slice[0]?.date.slice(5) ?? '';
        const d2 = slice[slice.length - 1]?.date.slice(5) ?? '';
        const isLast = i === 3;
        const label = d1 && d2 && d1 !== d2 ? `${d1}–${d2}${isLast ? ' (Live)' : ''}` : `Неделя ${i + 1}${isLast ? ' (Live)' : ''}`;
        return { label, records: slice };
      });
    }
  }

  const quarters: BumpSnapshot[] = weeklyPeriods.map((p) => {
    const counts = topSlugs.map((slug) => ({
      slug,
      name: roleDef(slug)?.label ?? slug,
      n: p.records.filter((r) => r.role === slug).length,
      overallN: overallRoleCounts.get(slug) ?? 0,
    }));
    counts.sort((a, b) => b.n - a.n || b.overallN - a.overallN || a.slug.localeCompare(b.slug));
    return {
      period: p.label,
      ranks: counts.map((item, idx) => ({
        name: item.name,
        rank: idx + 1,
        n: item.n,
      })),
    };
  });

  // --- Mode 2: Market day-of-week rhythm ---
  const dayGroups: [string, (day: number) => boolean][] = [
    ['Пн (Старт)', (day) => day === 1],
    ['Вт–Ср (Пик)', (day) => day === 2 || day === 3],
    ['Чт–Пт (Спад)', (day) => day === 4 || day === 5],
    ['Сб–Вс (Уикенд)', (day) => day === 6 || day === 0],
  ];

  const months: BumpSnapshot[] = dayGroups.map(([label, pred]) => {
    const groupRecords = records.filter((r) => {
      const day = new Date(`${r.date}T12:00:00Z`).getUTCDay();
      return pred(day);
    });
    const counts = topSlugs.map((slug) => ({
      slug,
      name: roleDef(slug)?.label ?? slug,
      n: groupRecords.filter((r) => r.role === slug).length,
      overallN: overallRoleCounts.get(slug) ?? 0,
    }));
    counts.sort((a, b) => b.n - a.n || b.overallN - a.overallN || a.slug.localeCompare(b.slug));
    return {
      period: label,
      ranks: counts.map((item, idx) => ({
        name: item.name,
        rank: idx + 1,
        n: item.n,
      })),
    };
  });

  return { quarters, months };
}

/** Fact, contrast, conclusion about order budgets; nothing to say without a real contrast. */
function computeEditorialInsight(carta: CartaCapitalRow[], period: Report['period']): Report['editorialInsight'] {
  const named = carta.filter((row) => row.label !== OTHER_ROLE.label && row.label !== 'Другие направления');
  const total = carta.reduce((sum, row) => sum + row.n, 0);
  if (named.length < 2 || total < RELIABLE) return undefined;
  const byCount = [...named].sort((a, b) => b.n - a.n)[0]!;
  const byMoney = [...named].sort((a, b) => b.capitalShare - a.capitalShare)[0]!;
  if (byCount.label === byMoney.label) {
    return {
      fact: `Больше всего заказов с бюджетом — в направлении «${byCount.label}» (${formatShare(byCount.nShare)}).`,
      contrast: `На него же приходится наибольшая сумма бюджетов (${formatShare(byMoney.capitalShare)}).`,
      conclusion: 'Здесь число заказов и деньги совпадают.',
      quote: `По данным openradar, на направление «${byCount.label}» приходится ${formatShare(byCount.nShare)} заказов с указанным бюджетом и ${formatShare(byCount.capitalShare)} суммы этих бюджетов (${period.phrase}, выборка: ${total} заказов).`,
    };
  }
  return {
    fact: `Больше всего заказов с бюджетом — в направлении «${byCount.label}» (${formatShare(byCount.nShare)}).`,
    contrast: `Наибольшая сумма бюджетов — у направления «${byMoney.label}»: ${formatShare(byMoney.capitalShare)} при ${formatShare(byMoney.nShare)} заказов.`,
    conclusion: 'Частые заказы и крупные бюджеты — разные части рынка. Сумма чувствительна к отдельным крупным заказам.',
    quote: `По данным openradar, направление «${byMoney.label}» даёт ${formatShare(byMoney.nShare)} заказов с указанным бюджетом и ${formatShare(byMoney.capitalShare)} суммы этих бюджетов; больше всего заказов — у направления «${byCount.label}» (${period.phrase}, выборка: ${total} заказов).`,
  };
}

function sliceBy(records: ResearchRecord[], key: (r: ResearchRecord) => string | undefined, label: (k: string) => string, paid: (r: ResearchRecord) => boolean, order?: string[]): Slice[] {
  const groups = new Map<string, ResearchRecord[]>();
  for (const record of records) {
    const k = key(record);
    if (!k) continue;
    groups.set(k, [...(groups.get(k) ?? []), record]);
  }
  const slices = Array.from(groups, ([k, group]) => {
    const withPay = group.filter(paid);
    return { key: k, label: label(k), n: group.length, withPay: withPay.length, pay: dist(withPay.map((r) => r.pay!)) };
  });
  if (order) return slices.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
  return slices.sort((a, b) => (b.pay.median ?? -1) - (a.pay.median ?? -1) || b.n - a.n);
}

function topCounts(values: Array<string | undefined>, limit: number): Array<{ name: string; n: number }> {
  const counts = new Map<string, number>();
  for (const value of values) if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
  return Array.from(counts, ([name, n]) => ({ name, n })).sort((a, b) => b.n - a.n).slice(0, limit);
}

function skillStats(records: ResearchRecord[], limit: number): Array<{ skill: string; n: number; pay: Dist }> {
  const by = new Map<string, number[]>();
  for (const record of records) for (const skill of record.skills) by.set(skill, [...(by.get(skill) ?? []), record.pay!]);
  return Array.from(by, ([skill, values]) => ({ skill, n: values.length, pay: dist(values) }))
    .filter((s) => s.pay.median !== undefined)
    .sort((a, b) => b.n - a.n)
    .slice(0, limit)
    .sort((a, b) => b.pay.median! - a.pay.median!);
}

const BASKET_MIN = 30;
const WEEK_CELL_MIN = 10;

/** Laspeyres-style weekly pay: roles with enough posts keep a fixed weight, so a flood of one role cannot move the index alone. */
function compositionIndex(records: ResearchRecord[]): Array<{ week: string; index: number; n: number }> {
  const totals = new Map<string, number>();
  for (const record of records) totals.set(record.role, (totals.get(record.role) ?? 0) + 1);
  const basket = [...totals.entries()].filter(([, n]) => n >= BASKET_MIN);
  const weightTotal = basket.reduce((sum, [, n]) => sum + n, 0);
  if (!basket.length || weightTotal === 0) return [];
  const weights = new Map(basket.map(([role, n]) => [role, n / weightTotal]));
  const cells = new Map<string, Map<string, number[]>>();
  for (const record of records) {
    if (!weights.has(record.role) || record.pay === undefined) continue;
    const week = mondayOf(record.date);
    const byRole = cells.get(week) ?? new Map<string, number[]>();
    const pays = byRole.get(record.role) ?? [];
    pays.push(record.pay);
    byRole.set(record.role, pays);
    cells.set(week, byRole);
  }
  const rows = [...cells.keys()].sort().flatMap((week) => {
    const byRole = cells.get(week)!;
    const present = [...weights.keys()].filter((role) => (byRole.get(role)?.length ?? 0) >= WEEK_CELL_MIN);
    const weightSum = present.reduce((sum, role) => sum + weights.get(role)!, 0);
    if (!present.length || weightSum === 0) return [];
    const value = present.reduce((sum, role) => {
      const pays = [...(byRole.get(role) ?? [])].sort((a, b) => a - b);
      return sum + (weights.get(role)! / weightSum) * pays[Math.floor((pays.length - 1) / 2)]!;
    }, 0);
    const n = present.reduce((sum, role) => sum + (byRole.get(role)?.length ?? 0), 0);
    return [{ week, value, n }];
  });
  const base = rows[0]?.value;
  if (!base) return [];
  return rows.map((row) => ({ week: row.week, index: Math.round((row.value / base) * 1000) / 10, n: row.n }));
}

function mondayOf(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

const REGION_ORDER = ['Москва', 'Санкт-Петербург', 'Другие города', 'Не указан'];
const share = (part: number, whole: number): number => (whole ? Math.round((part / whole) * 1000) / 10 : 0);

export function formatRub(value: number): string {
  return `${new Intl.NumberFormat('ru-RU').format(value).replace(/ /g, ' ')} ₽`;
}

export function formatShare(value: number): string {
  return `${String(value).replace('.', ',')}%`;
}

function roleDetail(slug: string, records: ResearchRecord[], paid: (r: ResearchRecord) => boolean): RoleDetail {
  const def = roleDef(slug);
  const withPay = records.filter(paid);
  return {
    slug,
    label: def?.label ?? OTHER_ROLE.label,
    plural: def?.plural ?? OTHER_ROLE.plural,
    n: records.length,
    withPay: withPay.length,
    pay: dist(withPay.map((r) => r.pay!)),
    byGrade: sliceBy(records, (r) => r.grade, (k) => GRADE_LABELS[k as keyof typeof GRADE_LABELS], paid, GRADE_ORDER),
    byLanguage: sliceBy(records, (r) => r.language, (k) => k, paid).filter((s) => s.n >= 3),
    byRegion: sliceBy(records, (r) => r.region, (k) => k, paid, REGION_ORDER),
    skills: skillStats(withPay, 12),
    companies: topCounts(records.map((r) => r.company), 10),
    remoteShare: share(records.filter((r) => r.remote).length, records.length),
  };
}

export function buildReport(
  records: ResearchRecord[],
  period: Report['period'],
  kind: Report['kind'],
  now: Date = new Date(),
): Report {
  const excluded = records.filter((r) => r.excluded).length;
  records = records.filter((r) => !r.excluded);
  // The main figures describe the Russian-language market; English-language boards and
  // company career pages make the international section.
  const intlScope = records.filter((r) => r.type === 'job' && r.scope === 'intl');
  const jobs = records.filter((r) => r.type === 'job' && r.scope !== 'intl');
  // Orders in English (Freelancer.com and the like) are a market of their own, as vacancies are.
  const gigs = records.filter((r) => r.type === 'gig' && r.scope !== 'intl');
  // One employer often posts the same vacancy in many cities: in pay figures it counts once.
  const repeated = new Set<string>();
  const seen = new Set<string>();
  for (const r of jobs) {
    if (!r.company || r.pay === undefined) continue;
    const key = `${r.company.toLowerCase()}|${r.role}|${r.grade ?? ''}|${r.pay}`;
    if (seen.has(key)) repeated.add(r.id);
    else seen.add(key);
  }
  // Russian-market monthly pay is the headline figure; international boards pay in USD and are kept apart.
  const ruPaid = (r: ResearchRecord): boolean => r.market === 'ru' && r.payPeriod === 'month' && r.pay !== undefined && !repeated.has(r.id);
  const ruJobs = jobs.filter(ruPaid);
  const intlJobs = intlScope.filter((r) => r.market === 'intl' && r.payPeriod === 'month' && r.pay !== undefined);
  const projectPaid = (r: ResearchRecord): boolean => r.payPeriod === 'project' && r.pay !== undefined;
  const gigsPaid = gigs.filter(projectPaid);

  const bins: Array<{ from: number; to?: number; n: number }> = [];
  for (let from = 0; from < 500_000; from += 50_000) bins.push({ from, to: from + 50_000, n: 0 });
  bins.push({ from: 500_000, n: 0 });
  for (const r of ruJobs) bins[Math.min(Math.floor(r.pay! / 50_000), bins.length - 1)]!.n++;

  const weeks = new Map<string, number[]>();
  const weekCounts = new Map<string, number>();
  for (const r of jobs) weekCounts.set(mondayOf(r.date), (weekCounts.get(mondayOf(r.date)) ?? 0) + 1);
  for (const r of ruJobs) weeks.set(mondayOf(r.date), [...(weeks.get(mondayOf(r.date)) ?? []), r.pay!]);

  const roleSlugs = new Set(jobs.map((r) => r.role));
  const roles = [...roleSlugs]
    .filter((slug) => slug !== OTHER_ROLE.slug)
    .map((slug) => roleDetail(slug, jobs.filter((r) => r.role === slug), ruPaid))
    .filter((detail) => detail.pay.median !== undefined)
    .sort((a, b) => b.withPay - a.withPay);

  const cartaCapital = computeCartaCapital(gigsPaid);
  const taskTransformation = computeTaskTransformation(gigs);
  const bumpChart = computeBumpChart([...jobs, ...gigs]);
  const editorialInsight = computeEditorialInsight(cartaCapital, period);
  const twoBounds = ruJobs.filter((r) => r.payMin !== undefined && r.payMax !== undefined && r.payMin !== r.payMax);

  const report: Report = {
    version: REPORT_VERSION,
    kind,
    period,
    generatedAt: now.toISOString(),
    totals: {
      posts: records.length,
      jobs: jobs.length,
      gigs: gigs.length,
      jobsWithPay: ruJobs.length,
      intlJobs: intlScope.length,
      intlGigs: records.filter((r) => r.type === 'gig' && r.scope === 'intl').length,
      foreignPayJobs: jobs.filter((r) => r.market === 'intl' && r.pay !== undefined).length,
      gigsWithBudget: gigsPaid.length,
      companies: new Set(jobs.map((r) => r.company).filter(Boolean)).size,
      platforms: topCounts(records.map((r) => r.platform), 20).map(({ name, n }) => ({ key: name, n })),
      payOrigins: Object.fromEntries(topCounts(records.map((r) => r.payOrigin), 4).map(({ name, n }) => [name, n])),
      excluded,
    },
    jobs: {
      pay: dist(ruJobs.map((r) => r.pay!)),
      payShare: share(ruJobs.length, jobs.length),
      it: dist(ruJobs.filter((r) => TECH_ROLES.has(r.role)).map((r) => r.pay!)),
      bounds: {
        range: twoBounds.length,
        from: ruJobs.filter((r) => r.payMin !== undefined && r.payMax === undefined).length,
        to: ruJobs.filter((r) => r.payMax !== undefined && r.payMin === undefined).length,
        single: ruJobs.filter((r) => r.payMin !== undefined && r.payMin === r.payMax).length,
        rangeMedian: dist(twoBounds.map((r) => r.pay!)).median,
      },
      byPlatform: sliceBy(jobs, (r) => r.platform, (k) => k, ruPaid).filter((slice) => slice.pay.median !== undefined),
      intl: dist(intlJobs.map((r) => r.pay!)),
      byRole: sliceBy(jobs, (r) => r.role, (k) => roleDef(k)?.label ?? OTHER_ROLE.label, ruPaid),
      byGrade: sliceBy(jobs, (r) => r.grade, (k) => GRADE_LABELS[k as keyof typeof GRADE_LABELS], ruPaid, GRADE_ORDER),
      byLanguage: sliceBy(jobs, (r) => r.language, (k) => k, ruPaid),
      byRegion: sliceBy(jobs, (r) => r.region, (k) => k, ruPaid, REGION_ORDER),
      remote: {
        share: share(jobs.filter((r) => r.remote).length, jobs.length),
        remote: dist(ruJobs.filter((r) => r.remote).map((r) => r.pay!)),
        office: dist(ruJobs.filter((r) => !r.remote).map((r) => r.pay!)),
        adjusted: adjustedGap(ruJobs, (r) => r.remote),
      },
      ai: {
        share: share(jobs.filter((r) => r.ai).length, jobs.length),
        with: dist(ruJobs.filter((r) => r.ai).map((r) => r.pay!)),
        without: dist(ruJobs.filter((r) => !r.ai).map((r) => r.pay!)),
        adjusted: adjustedGap(ruJobs, (r) => r.ai),
      },
      moscowAdjusted: adjustedGap(ruJobs.filter((r) => r.region === 'Москва' || r.region === 'Другие города'), (r) => r.region === 'Москва'),
      skills: skillStats(ruJobs, 20),
      companies: topCounts(jobs.map((r) => r.company), 15),
      histogram: bins,
      weekly: [...weekCounts.keys()].sort().map((week) => {
        const d = dist(weeks.get(week) ?? []);
        return { week, n: weekCounts.get(week)!, median: d.median };
      }),
      weeklyIndexed: compositionIndex(ruJobs),
      roles,
    },
    gigs: {
      budget: dist(gigsPaid.map((r) => r.pay!)),
      budgetShare: share(gigsPaid.length, gigs.length),
      byCategory: sliceBy(gigs, (r) => r.role, (k) => roleDef(k)?.label ?? OTHER_ROLE.label, projectPaid),
      hourly: dist(gigs.filter((r) => r.payPeriod === 'hour').map((r) => r.pay!)),
    },
    findings: [],
    cartaCapital,
    taskTransformation,
    bumpChart,
    editorialInsight,
  };
  report.findings = findingsOf(report);
  return report;
}

/** Short facts with a quotable sentence each; only figures above the sample threshold. */
export function findingsOf(report: Report): Finding[] {
  const out: Finding[] = [];
  const when = report.period.phrase;
  const cite = (text: string, n: number): string => `По данным openradar, ${text} ${when} (выборка: ${n} вакансий).`;
  const { jobs, gigs } = report;

  if (jobs.pay.median !== undefined) {
    out.push({
      text: `Медианная зарплата в вакансиях с указанной оплатой — ${formatRub(jobs.pay.median)} в месяц.`,
      quote: cite(`медианная зарплата в вакансиях с указанной оплатой составила ${formatRub(jobs.pay.median)} в месяц`, jobs.pay.n),
    });
  }
  if (report.totals.jobs >= RELIABLE) {
    out.push({
      text: `Зарплату указывают в ${formatShare(jobs.payShare)} вакансий.`,
      quote: `По данным openradar, зарплату указывают в ${formatShare(jobs.payShare)} вакансий ${when} (выборка: ${report.totals.jobs} вакансий).`,
    });
  }
  if (jobs.it?.median !== undefined) {
    out.push({
      text: `В IT-вакансиях медиана — ${formatRub(jobs.it.median)} в месяц.`,
      quote: cite(`медианная зарплата в IT-вакансиях с указанной оплатой составила ${formatRub(jobs.it.median)} в месяц`, jobs.it.n),
    });
  }
  const ranked = jobs.roles.filter((r) => r.pay.n >= RELIABLE).sort((a, b) => b.pay.median! - a.pay.median!);
  const top = ranked[0];
  if (top && ranked.length >= 3) {
    // «The highest» needs the next role's interval to end below this one's.
    const clear = (ranked[1]!.pay.ciHigh ?? Infinity) < (top.pay.ciLow ?? 0);
    out.push({
      text: `${clear ? 'Больше всего' : 'Среди самых высоких'} в вакансиях предлагают направлению «${top.label}»: медиана ${formatRub(top.pay.median!)}.`,
      quote: cite(`медианная зарплата в вакансиях направления «${top.label}» составила ${formatRub(top.pay.median!)} в месяц — ${clear ? 'больше, чем в других направлениях' : 'одна из самых высоких среди направлений'}`, top.pay.n),
    });
  }
  const junior = jobs.byGrade.find((s) => s.key === 'junior')?.pay.median;
  const senior = jobs.byGrade.find((s) => s.key === 'senior');
  if (junior && senior?.pay.median) {
    const ratio = Math.round((senior.pay.median / junior) * 10) / 10;
    out.push({
      text: `Вакансии Senior предлагают в ${String(ratio).replace('.', ',')} раза больше, чем Junior: ${formatRub(senior.pay.median)} против ${formatRub(junior)}.`,
      quote: cite(`медианная зарплата в вакансиях уровня Senior (${formatRub(senior.pay.median)}) в ${String(ratio).replace('.', ',')} раза выше, чем у Junior (${formatRub(junior)})`, senior.pay.n + (jobs.byGrade.find((s) => s.key === 'junior')?.pay.n ?? 0)),
    });
  }
  const gap = (a: Adjusted): string => (a.pct === 0 ? 'разницы нет' : `разница ${a.pct > 0 ? '+' : '−'}${Math.abs(a.pct)}%`);
  if (jobs.remote.remote.median && jobs.remote.office.median) {
    const adjusted = jobs.remote.adjusted;
    out.push({
      text: `Удалённую работу допускают ${formatShare(jobs.remote.share)} вакансий. Медиана ${formatRub(jobs.remote.remote.median)} против ${formatRub(jobs.remote.office.median)} в офисе${adjusted ? `, но при той же роли и уровне ${gap(adjusted)}` : ': сравнивать напрямую нельзя, у этих вакансий другой состав'}.`,
      quote: adjusted
        ? cite(`удалённую работу допускают ${formatShare(jobs.remote.share)} вакансий; при той же роли и уровне ${gap(adjusted)} к офисным`, adjusted.n)
        : `По данным openradar, удалённую работу допускают ${formatShare(jobs.remote.share)} вакансий ${when} (выборка: ${report.totals.jobs} вакансий).`,
    });
  }
  if (jobs.ai.with.median && jobs.ai.without.median) {
    const adjusted = jobs.ai.adjusted;
    out.push({
      text: `ИИ и нейросети упоминают ${formatShare(jobs.ai.share)} вакансий${adjusted ? `; при той же роли и уровне ${gap(adjusted)} к остальным` : '. Сравнить оплату при той же роли и уровне пока не на чем'}.`,
      quote: adjusted
        ? cite(`ИИ и нейросети упоминаются в ${formatShare(jobs.ai.share)} вакансий; при той же роли и уровне ${gap(adjusted)} к остальным`, adjusted.n)
        : `По данным openradar, ИИ и нейросети упоминаются в ${formatShare(jobs.ai.share)} вакансий ${when} (выборка: ${report.totals.jobs} вакансий).`,
    });
  }
  const moscow = jobs.byRegion.find((s) => s.key === 'Москва')?.pay;
  const regions = jobs.byRegion.find((s) => s.key === 'Другие города')?.pay;
  if (moscow?.median && regions?.median) {
    const adjusted = jobs.moscowAdjusted;
    out.push({
      text: `В Москве медиана ${formatRub(moscow.median)}, в других городах (кроме Петербурга) — ${formatRub(regions.median)}${adjusted ? `; при той же роли и уровне ${gap(adjusted)}` : ''}.`,
      quote: cite(`медианная зарплата в московских вакансиях составила ${formatRub(moscow.median)}, в других городах кроме Петербурга — ${formatRub(regions.median)}${adjusted ? `; при той же роли и уровне ${gap(adjusted)}` : ''}`, moscow.n + regions.n),
    });
  }
  if (gigs.budget.median !== undefined) {
    out.push({
      text: `Медианный бюджет заказа на фрилансе — ${formatRub(gigs.budget.median)}; бюджет указан в ${formatShare(gigs.budgetShare)} заказов.`,
      quote: `По данным openradar, медианный бюджет русскоязычного заказа на фриланс-биржах и в Telegram-каналах ${when} составил ${formatRub(gigs.budget.median)} (выборка: ${gigs.budget.n} заказов).`,
    });
  }
  return out;
}

export const MONTHS_NOM = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
export const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const MONTHS_PREP = ['январе', 'феврале', 'марте', 'апреле', 'мае', 'июне', 'июле', 'августе', 'сентябре', 'октябре', 'ноябре', 'декабре'];

/** Calendar month «2026-10» as a period; `to` is exclusive. */
export function monthPeriod(slug: string): Report['period'] {
  const [y, m] = slug.split('-').map(Number) as [number, number];
  const from = new Date(Date.UTC(y, m - 1, 1));
  const to = new Date(Date.UTC(y, m, 1));
  return {
    from: from.toISOString(),
    to: to.toISOString(),
    label: `${MONTHS_NOM[m - 1]![0]!.toUpperCase()}${MONTHS_NOM[m - 1]!.slice(1)} ${y}`,
    phrase: `в ${MONTHS_PREP[m - 1]} ${y} года`,
    slug,
  };
}

export function livePeriod(now: Date, days = 30): Report['period'] {
  const from = new Date(now.getTime() - days * 86_400_000);
  const fmt = (d: Date): string => d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', timeZone: 'UTC' });
  return { from: from.toISOString(), to: now.toISOString(), label: `${fmt(from)} — ${fmt(now)}`, phrase: `за последние ${days} дней` };
}

/** USD per year from roubles per month, for the international section. */
export function rubMonthToUsdYear(rub: number, usd: number = RUB_PER.USD!): number {
  return Math.round((rub * 12) / usd / 1000) * 1000;
}

export { ROLES };
