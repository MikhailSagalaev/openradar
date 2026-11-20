/**
 * The market report: medians and quartiles of pay by role, grade, language, region and
 * skill, built from research records. A figure is published only when enough posts stand
 * behind it (MIN_MEDIAN); quartiles need more (MIN_QUARTILES).
 */
import { GRADE_LABELS, GRADE_ORDER, OTHER_ROLE, ROLES, RUB_PER, roleDef, type ResearchRecord } from './derive.ts';
import {
  chiSquareSf,
  cliffsDeltaMagnitude,
  correlationMagnitude,
  epsilonSqMagnitude,
  fSf,
  formatP,
  holmAdjust,
  isConfirmed,
  normalTwoSidedP,
  starsOf,
  studentTTwoSidedP,
  type EffectMagnitude,
  type Stars,
} from './stats.ts';

/**
 * Bump when the rules change what a figure means; snapshots keep the version they were built with.
 * 3: exact p-values (χ², t, F, normal), Holm across the hypothesis family, effect-size-gated verdicts.
 */
export const REPORT_VERSION = 3;
export const MIN_MEDIAN = 10;
export const MIN_QUARTILES = 20;
export const RELIABLE = 30;
/** Pay figures compared at equal role and grade need this many matched posts. */
const MIN_ADJUSTED = 30;
/** Roles of the IT market: the headline for it leaves sales, support and the like out. */
export const TECH_ROLES = new Set(['ai', '1c', 'security', 'qa', 'devops', 'architect', 'sysadmin', 'data-engineer', 'analyst-system', 'analyst-business', 'analyst-data', 'ml', 'product', 'project', 'gamedev', 'mobile', 'fullstack', 'frontend', 'embedded', 'backend']);

/** Generic category names stored as tags on older leads; excluded from technology skill rankings. */
const UMBRELLA_SKILLS = new Set([
  'продажи', 'маркетинг', 'разработка', 'аналитика', 'дизайн', 'маркетплейсы',
  'рекрутинг', 'управление проектами', 'тестирование', 'поддержка', 'техподдержка',
  'копирайтинг', 'тексты', 'контент', 'администрирование', 'перевод', 'переводы',
  'другое', 'it', 'ит', 'работа с клиентами', 'консультирование', 'менеджмент',
]);

export interface GradeMatrixRow {
  slug: string;
  label: string;
  n: number;
  withPay: number;
  payShare: number;
  remoteShare: number;
  median?: number;
  p25?: number;
  p75?: number;
  junior?: number;
  middle?: number;
  senior?: number;
  lead?: number;
  seniorToJuniorRatio?: number;
  spreadPct?: number;
  qcdPct?: number;
}

export interface RegionalMatrixRow {
  slug: string;
  label: string;
  n: number;
  withPay: number;
  median?: number;
  moscow?: number;
  moscowN: number;
  spb?: number;
  spbN: number;
  regions?: number;
  regionsN: number;
  remote?: number;
  remoteN: number;
  /** Regional office median vs Moscow office median, in %. */
  regVsMskPct?: number;
  /** Remote median vs Regional office median, in % (relocation-free remote premium). */
  remoteVsRegPct?: number;
}

export interface RegionalComparisonRow {
  key: "moscow" | "spb" | "regions" | "remote";
  label: string;
  n: number;
  sharePct: number;
  withPay: number;
  payShare: number;
  remoteShare: number;
  pay: Dist;
  itPay: Dist;
  moscowParityPct?: number;
  itMoscowParityPct?: number;
  adjustedVsMoscow?: Adjusted;
  qcdPct?: number;
}

export interface LanguageMatrixRow {
  language: string;
  n: number;
  withPay: number;
  median?: number;
  p25?: number;
  p75?: number;
  junior?: number;
  middle?: number;
  senior?: number;
  lead?: number;
  seniorToJuniorRatio?: number;
  qcdPct?: number;
}

export interface EconometricSlice {
  n: number;
  p10?: number;
  p25?: number;
  p50?: number;
  p75?: number;
  p90?: number;
  trimmedMean?: number;
  decileRatio?: number;
  quartileRatio?: number;
  gini?: number;
  /** Theil entropy inequality index GE(1), additively decomposable. */
  theil?: number;
  qcdPct?: number;
  bowleySkew?: number;
  kelleySkew?: number;
  meanToMedianPct?: number;
}

export interface GradeTransparencyRow {
  grade: string;
  label: string;
  n: number;
  withPay: number;
  payShare: number;
  median?: number;
  spreadPct?: number;
  qcdPct?: number;
}

export interface MarketEconometrics {
  all: EconometricSlice;
  it: EconometricSlice;
  employerConcentration: {
    hhi: number;
    cr5Pct: number;
    cr10Pct: number;
    totalEmployers: number;
  };
  gradeTransparency: GradeTransparencyRow[];
  /** Horvitz-Thompson Inverse Probability Weighted (IPW) IT median correcting for grade disclosure bias. */
  ipwCorrectedIt?: {
    n: number;
    rawMedian: number;
    ipwMedian: number;
    biasPct: number;
  };
}

export interface MincerCoefficient {
  key: string;
  label: string;
  beta: number;
  se: number;
  tStat: number;
  stars: Stars;
  /** APA-formatted two-sided p from Student t with df = n − k. */
  pValue: string;
  /** Unrounded two-sided p (version 3+). */
  p?: number;
  effectPct?: number;
  baselineRub?: number;
}

export interface MincerRegression {
  n: number;
  r2: number;
  adjR2: number;
  fStat: number;
  /** Residual degrees of freedom n − k (version 3+). */
  df?: number;
  /** APA-formatted p of the overall F test, F(k − 1, n − k) (version 3+). */
  fPValue?: string;
  baselineRub: number;
  coefficients: MincerCoefficient[];
}

export interface VarianceFactorRow {
  key: "grade" | "geo" | "role" | "language";
  label: string;
  n: number;
  groups: number;
  etaSqPct: number;
  fStat: number;
  /** APA-formatted p from F(G − 1, N − G). */
  pValue: string;
  /** Unrounded p (version 3+). */
  p?: number;
}

export interface HypothesisTestRow {
  id: "H1" | "H2" | "H3" | "H4";
  title: string;
  method: string;
  n: number;
  statLabel: string;
  statValue: string;
  /** APA-formatted raw (unadjusted) two-sided p. */
  pValue: string;
  /** Unrounded raw p (version 3+). */
  p?: number;
  /** Holm–Bonferroni adjusted p across the H1…Hn family of this analysis (version 3+). */
  pAdjusted?: number;
  /** APA-formatted Holm-adjusted p (version 3+). */
  pAdjustedLabel?: string;
  /** Name of the effect-size measure (ε², Cliff's δ, ρ_s). */
  effectLabel: string;
  effectValue: string;
  /** Conventional magnitude of the effect size (version 3+). */
  effectMagnitude?: EffectMagnitude;
  /** Holm-adjusted p < 0.05, effect at least "small", and the predicted direction (see stats.isConfirmed). */
  confirmed: boolean;
}

export interface OaxacaDecompositionRow {
  key: "moscow_vs_regions" | "remote_vs_regions";
  label: string;
  nA: number;
  nB: number;
  totalLogGap: number;
  rawGapPct: number;
  endowmentLog: number;
  endowmentSharePct: number;
  endowmentPct: number;
  coefficientLog: number;
  coefficientSharePct: number;
  coefficientPct: number;
}

export interface ScientificAnalysis {
  mincer?: MincerRegression;
  varianceDecomposition: VarianceFactorRow[];
  hypotheses: HypothesisTestRow[];
  oaxaca?: OaxacaDecompositionRow[];
}

export interface IntlMacroRegionRow {
  key: "north_america" | "western_europe" | "cee_poland" | "global_remote";
  label: string;
  n: number;
  sharePct: number;
  withPay: number;
  payShare: number;
  pay: Dist;
  qcdPct?: number;
  adjustedVsNa?: Adjusted;
}

export interface IntlMarketResearch {
  usdRate: number;
  totalVacancies: number;
  paidVacancies: number;
  payShare: number;
  remoteShare: number;
  aiShare: number;
  gradeMatrix: GradeMatrixRow[];
  languageMatrix: LanguageMatrixRow[];
  macroRegions: IntlMacroRegionRow[];
  byHub: Slice[];
  econometrics: MarketEconometrics;
  scientific: ScientificAnalysis;
}

export interface CrossMarketGradeRow {
  grade: string;
  label: string;
  ruMedianRubMo: number;
  ruMedianUsdYr: number;
  ruPppUsdYr: number;
  intlMedianUsdYr: number;
  nominalGapRatio: number;
  pppParityPct: number;
}

export interface CrossMarketRoleRow {
  slug: string;
  label: string;
  ruMedianRubMo: number;
  ruMedianUsdYr: number;
  ruPppUsdYr: number;
  intlMedianUsdYr: number;
  nominalGapRatio: number;
  pppParityPct: number;
}

export interface CrossMarketMetricRow {
  key: string;
  label: string;
  ruValue: string;
  intlValue: string;
  interpretation: string;
}

export interface CrossMarketComparison {
  usdRate: number;
  pppFactor: number;
  byGrade: CrossMarketGradeRow[];
  byRole: CrossMarketRoleRow[];
  structuralMetrics: CrossMarketMetricRow[];
}

export interface GigBracket {
  key: 'micro' | 'small' | 'medium' | 'large';
  label: string;
  n: number;
  nShare: number;
  capitalRub: number;
  capitalShare: number;
  median?: number;
}

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

export interface CitySlice extends Slice {
  /** Pay distribution among IT vacancies in this city. */
  itPay?: Dist;
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
  skills: Array<{ skill: string; n: number; pay: Dist; premiumPct?: number }>;
  spreadPct?: number;
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
    bounds?: { range: number; from: number; to: number; single: number; rangeMedian?: number; medianSpreadPct?: number };
    byPlatform?: Slice[];
    intl: Dist;
    intlByRole?: Slice[];
    intlByGrade?: Slice[];
    intlCompanies?: Array<{ name: string; n: number }>;
    intlResearch?: IntlMarketResearch;
    crossMarket?: CrossMarketComparison;
    byRole: Slice[];
    byGrade: Slice[];
    /** Seniority ladder within IT roles only, free of non-IT composition bias. */
    itByGrade?: Slice[];
    /** Cross-tabulation of pay by role and seniority grade. */
    gradeMatrix?: GradeMatrixRow[];
    regionalMatrix?: RegionalMatrixRow[];
    regionalComparison?: RegionalComparisonRow[];
    languageMatrix?: LanguageMatrixRow[];
    byCity?: CitySlice[];
    econometrics?: MarketEconometrics;
    scientific?: ScientificAnalysis;
    byLanguage: Slice[];
    byRegion: Slice[];
    remote: { share: number; remote: Dist; office: Dist; adjusted?: Adjusted };
    ai: { share: number; with: Dist; without: Dist; adjusted?: Adjusted };
    moscowAdjusted?: Adjusted;
    skills: Array<{ skill: string; n: number; pay: Dist; premiumPct?: number }>;
    companies: Array<{ name: string; n: number }>;
    itCompanies?: Array<{ name: string; n: number }>;
    histogram: Array<{ from: number; to?: number; n: number }>;
    weekly: Array<{ week: string; n: number; median?: number }>;
    /** Same pay, held to a fixed role mix. 100 is the first week that has a basket. */
    weeklyIndexed?: Array<{ week: string; index: number; n: number }>;
    roles: RoleDetail[];
  };
  gigs: { budget: Dist; budgetShare: number; byCategory: Slice[]; hourly: Dist; brackets?: GigBracket[]; intlBudget?: Dist; intlByCategory?: Slice[]; intlBrackets?: GigBracket[] };
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

/** One pass over the records instead of a filter per group; insertion order is kept. */
function groupBy<K>(records: ResearchRecord[], key: (r: ResearchRecord) => K | undefined): Map<K, ResearchRecord[]> {
  const out = new Map<K, ResearchRecord[]>();
  for (const r of records) {
    const k = key(r);
    if (k === undefined) continue;
    const list = out.get(k);
    if (list) list.push(r);
    else out.set(k, [r]);
  }
  return out;
}

function quantile(sorted: number[], q: number): number {
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
}

/** Pay is rounded to a thousand roubles: finer digits would only suggest false precision. */
const round = (value: number): number => (value >= 10_000 ? Math.round(value / 1000) * 1000 : Math.round(value / 10) * 10);

export function dist(values: number[], minMedian: number = MIN_MEDIAN): Dist {
  const sorted = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  const n = sorted.length;
  if (n < minMedian) return { n };
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
          // Full-time monthly salaries in Telegram translation/design posts (> 45k) are not single-article/banner gig budgets.
          if ((d.key === 'translation' || d.key === 'banner') && (r.pay ?? 0) > 45_000) continue;
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
  const techCounts = new Map<string, number>();
  const allCounts = new Map<string, number>();
  for (const r of records) {
    const slug = r.role;
    if (slug && slug !== OTHER_ROLE.slug) {
      allCounts.set(slug, (allCounts.get(slug) ?? 0) + 1);
      if (TECH_ROLES.has(slug) || slug === 'design') {
        techCounts.set(slug, (techCounts.get(slug) ?? 0) + 1);
      }
    }
  }
  const overallRoleCounts = techCounts.size >= 5 ? techCounts : allCounts;
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

function skillStats(
  records: ResearchRecord[],
  limit: number,
  baselineMedian?: number,
): Array<{ skill: string; n: number; pay: Dist; premiumPct?: number }> {
  const by = new Map<string, number[]>();
  for (const record of records) {
    for (const skill of record.skills) {
      if (UMBRELLA_SKILLS.has(skill.trim().toLowerCase())) continue;
      by.set(skill, [...(by.get(skill) ?? []), record.pay!]);
    }
  }
  const base = baselineMedian ?? dist(records.map((r) => r.pay!)).median;
  return Array.from(by, ([skill, values]) => {
    const pay = dist(values);
    const matched = records.length >= MIN_ADJUSTED ? adjustedGap(records, (r) => r.skills.includes(skill))?.pct : undefined;
    const rawPct = pay.median !== undefined && base ? Math.round(((pay.median - base) / base) * 100) : undefined;
    return { skill, n: values.length, pay, premiumPct: matched ?? rawPct };
  })
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

function medianSpreadPctOf(records: ResearchRecord[]): number | undefined {
  const spreads = records
    .filter((r) => r.payMin !== undefined && r.payMax !== undefined && r.payMax > r.payMin && (r.pay ?? 0) > 0)
    .map((r) => ((r.payMax! - r.payMin!) / (2 * r.pay!)) * 100)
    .sort((a, b) => a - b);
  if (spreads.length < 5) return undefined;
  return Math.round(quantile(spreads, 0.5));
}

function computeGigBrackets(records: ResearchRecord[]): GigBracket[] {
  const defs: Array<{ key: GigBracket['key']; label: string; pred: (pay: number) => boolean }> = [
    { key: 'micro', label: 'До 3 000 ₽ (микрозадачи)', pred: (p) => p < 3_000 },
    { key: 'small', label: '3 000 – 15 000 ₽ (небольшие работы)', pred: (p) => p >= 3_000 && p < 15_000 },
    { key: 'medium', label: '15 000 – 50 000 ₽ (средние проекты)', pred: (p) => p >= 15_000 && p < 50_000 },
    { key: 'large', label: 'От 50 000 ₽ (крупные проекты и MVP)', pred: (p) => p >= 50_000 },
  ];
  const totalN = records.length;
  const totalCap = records.reduce((s, r) => s + (r.pay ?? 0), 0);
  if (!totalN || !totalCap) return [];
  return defs.map((d) => {
    const group = records.filter((r) => d.pred(r.pay ?? 0));
    const cap = group.reduce((s, r) => s + (r.pay ?? 0), 0);
    return {
      key: d.key,
      label: d.label,
      n: group.length,
      nShare: share(group.length, totalN),
      capitalRub: cap,
      capitalShare: share(cap, totalCap),
      median: dist(group.map((r) => r.pay!), 3).median,
    };
  });
}

function qcdPctOf(d: Dist): number | undefined {
  if (d.p25 === undefined || d.p75 === undefined || d.p25 + d.p75 <= 0) return undefined;
  return Math.round(((d.p75 - d.p25) / (d.p75 + d.p25)) * 1000) / 10;
}

function giniCoefficient(sorted: number[]): number | undefined {
  const n = sorted.length;
  if (n < MIN_QUARTILES) return undefined;
  let weighted = 0;
  let total = 0;
  for (let i = 0; i < n; i++) {
    weighted += (2 * (i + 1) - n - 1) * sorted[i]!;
    total += sorted[i]!;
  }
  return total > 0 ? Math.round((weighted / (n * total)) * 1000) / 1000 : undefined;
}

function theilEntropy(sorted: number[]): number | undefined {
  const n = sorted.length;
  if (n < MIN_QUARTILES) return undefined;
  const mean = sorted.reduce((a, b) => a + b, 0) / n;
  if (mean <= 0) return undefined;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const r = sorted[i]! / mean;
    if (r > 0) sum += r * Math.log(r);
  }
  return Math.round((sum / n) * 1000) / 1000;
}

function weightedMedianOf(items: Array<{ value: number; weight: number }>): number | undefined {
  if (items.length < MIN_MEDIAN) return undefined;
  const sorted = [...items].sort((a, b) => a.value - b.value);
  const totalWeight = sorted.reduce((s, x) => s + x.weight, 0);
  if (totalWeight <= 0) return undefined;
  let cum = 0;
  for (const item of sorted) {
    cum += item.weight;
    if (cum >= totalWeight / 2) return round(item.value);
  }
  return round(sorted[sorted.length - 1]!.value);
}

function computeEconometricSlice(records: ResearchRecord[]): EconometricSlice {
  const sorted = records.map((r) => r.pay!).filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  const n = sorted.length;
  if (n < MIN_QUARTILES) return { n };
  const p10 = round(quantile(sorted, 0.1));
  const p25 = round(quantile(sorted, 0.25));
  const p50 = round(quantile(sorted, 0.5));
  const p75 = round(quantile(sorted, 0.75));
  const p90 = round(quantile(sorted, 0.9));
  const lo = Math.floor(n * 0.05);
  const hi = Math.ceil(n * 0.95);
  const trimmedSlice = sorted.slice(lo, hi);
  const trimmedMean = trimmedSlice.length ? round(trimmedSlice.reduce((a, b) => a + b, 0) / trimmedSlice.length) : undefined;
  const decileRatio = p10 > 0 ? Math.round((p90 / p10) * 100) / 100 : undefined;
  const quartileRatio = p25 > 0 ? Math.round((p75 / p25) * 100) / 100 : undefined;
  const qcdPct = p25 + p75 > 0 ? Math.round(((p75 - p25) / (p75 + p25)) * 1000) / 10 : undefined;
  const bowleySkew = p75 > p25 ? Math.round((((p75 - p50) - (p50 - p25)) / (p75 - p25)) * 100) / 100 : undefined;
  const kelleySkew = p90 > p10 ? Math.round((((p90 - p50) - (p50 - p10)) / (p90 - p10)) * 100) / 100 : undefined;
  const meanToMedianPct = trimmedMean && p50 > 0 ? Math.round(((trimmedMean - p50) / p50) * 1000) / 10 : undefined;
  return {
    n,
    p10,
    p25,
    p50,
    p75,
    p90,
    trimmedMean,
    decileRatio,
    quartileRatio,
    gini: giniCoefficient(sorted),
    theil: theilEntropy(sorted),
    qcdPct,
    bowleySkew,
    kelleySkew,
    meanToMedianPct,
  };
}

function computeMarketEconometrics(jobs: ResearchRecord[], ruJobs: ResearchRecord[], paid: (r: ResearchRecord) => boolean): MarketEconometrics {
  const itJobs = jobs.filter((r) => TECH_ROLES.has(r.role));
  const itPaid = ruJobs.filter((r) => TECH_ROLES.has(r.role));

  const empCounts = new Map<string, number>();
  let totalWithEmp = 0;
  for (const r of itJobs) {
    if (!r.company) continue;
    totalWithEmp++;
    empCounts.set(r.company, (empCounts.get(r.company) ?? 0) + 1);
  }
  const sortedCounts = [...empCounts.values()].sort((a, b) => b - a);
  let hhi = 0;
  if (totalWithEmp > 0) {
    for (const c of sortedCounts) {
      const s = c / totalWithEmp;
      hhi += s * s * 10_000;
    }
  }
  const top5 = sortedCounts.slice(0, 5).reduce((a, b) => a + b, 0);
  const top10 = sortedCounts.slice(0, 10).reduce((a, b) => a + b, 0);

  const gradeTransparency: GradeTransparencyRow[] = GRADE_ORDER.map((g) => {
    const gAll = itJobs.filter((r) => r.grade === g);
    const gPaid = gAll.filter(paid);
    const d = dist(gPaid.map((r) => r.pay!), 5);
    return {
      grade: g,
      label: GRADE_LABELS[g],
      n: gAll.length,
      withPay: gPaid.length,
      payShare: share(gPaid.length, gAll.length),
      median: d.median,
      spreadPct: medianSpreadPctOf(gPaid),
      qcdPct: qcdPctOf(d),
    };
  }).filter((row) => row.n > 0);

  const probByGrade = new Map<string, number>();
  for (const row of gradeTransparency) {
    if (row.n >= 5 && row.withPay >= 2 && row.payShare > 0) {
      probByGrade.set(row.grade, row.withPay / row.n);
    }
  }
  const gradedItPaid = itPaid.filter((r) => r.grade && probByGrade.has(r.grade));
  let ipwCorrectedIt: MarketEconometrics["ipwCorrectedIt"] | undefined;
  if (gradedItPaid.length >= MIN_MEDIAN && probByGrade.size >= 2) {
    const rawMed = dist(gradedItPaid.map((r) => r.pay!), 5).median;
    const ipwMed = weightedMedianOf(
      gradedItPaid.map((r) => ({ value: r.pay!, weight: 1 / probByGrade.get(r.grade!)! })),
    );
    if (rawMed && ipwMed) {
      ipwCorrectedIt = {
        n: gradedItPaid.length,
        rawMedian: rawMed,
        ipwMedian: ipwMed,
        biasPct: Math.round(((ipwMed - rawMed) / rawMed) * 1000) / 10,
      };
    }
  }

  return {
    all: computeEconometricSlice(ruJobs),
    it: computeEconometricSlice(itPaid),
    employerConcentration: {
      hhi: Math.round(hhi),
      cr5Pct: share(top5, totalWithEmp),
      cr10Pct: share(top10, totalWithEmp),
      totalEmployers: empCounts.size,
    },
    gradeTransparency,
    ipwCorrectedIt,
  };
}


function solveOlsWhiteHc1(y: number[], X: number[][]): { beta: number[]; se: number[]; r2: number; adjR2: number; fStat: number } | undefined {
  const n = y.length;
  const k = X[0]?.length ?? 0;
  if (n <= k + 2 || k < 2) return undefined;
  const XtX = Array.from({ length: k }, () => new Array<number>(k).fill(0));
  const Xty = new Array<number>(k).fill(0);
  for (let i = 0; i < n; i++) {
    const xi = X[i]!;
    const yi = y[i]!;
    for (let a = 0; a < k; a++) {
      Xty[a]! += xi[a]! * yi;
      for (let b = 0; b < k; b++) XtX[a]![b]! += xi[a]! * xi[b]!;
    }
  }
  const A = XtX.map((row, i) => [...row, ...Array.from({ length: k }, (_, j) => (i === j ? 1 : 0))]);
  for (let col = 0; col < k; col++) {
    let pivot = col;
    for (let r = col + 1; r < k; r++) {
      if (Math.abs(A[r]![col]!) > Math.abs(A[pivot]![col]!)) pivot = r;
    }
    if (Math.abs(A[pivot]![col]!) < 1e-10) return undefined;
    const tmp = A[col]!;
    A[col] = A[pivot]!;
    A[pivot] = tmp;
    const div = A[col]![col]!;
    for (let j = 0; j < 2 * k; j++) A[col]![j]! /= div;
    for (let r = 0; r < k; r++) {
      if (r !== col) {
        const factor = A[r]![col]!;
        for (let j = 0; j < 2 * k; j++) A[r]![j]! -= factor * A[col]![j]!;
      }
    }
  }
  const invXtX = A.map((row) => row.slice(k));
  const beta = invXtX.map((row) => row.reduce((s, v, j) => s + v * Xty[j]!, 0));
  const e = y.map((yi, i) => yi - X[i]!.reduce((s, xij, j) => s + xij * beta[j]!, 0));
  const yMean = y.reduce((s, v) => s + v, 0) / n;
  const ssTot = y.reduce((s, v) => s + (v - yMean) ** 2, 0);
  const ssRes = e.reduce((s, v) => s + v ** 2, 0);
  if (ssTot <= 0 || ssRes <= 0) return undefined;
  const r2 = Math.max(0, Math.min(1, 1 - ssRes / ssTot));
  const adjR2 = Math.max(0, 1 - ((1 - r2) * (n - 1)) / (n - k));
  const fStat = ((ssTot - ssRes) / (k - 1)) / (ssRes / (n - k));

  const meat = Array.from({ length: k }, () => new Array<number>(k).fill(0));
  const hcFactor = n / (n - k);
  for (let i = 0; i < n; i++) {
    const e2 = e[i]! * e[i]! * hcFactor;
    const xi = X[i]!;
    for (let a = 0; a < k; a++) {
      for (let b = 0; b < k; b++) meat[a]![b]! += e2 * xi[a]! * xi[b]!;
    }
  }
  const se = new Array<number>(k).fill(0);
  for (let a = 0; a < k; a++) {
    let varA = 0;
    for (let b = 0; b < k; b++) {
      for (let c = 0; c < k; c++) varA += invXtX[a]![b]! * meat[b]![c]! * invXtX[c]![a]!;
    }
    se[a] = Math.sqrt(Math.max(1e-12, varA));
  }
  return { beta, se, r2, adjR2, fStat };
}

/** Mann–Whitney U with the tie-corrected normal approximation; two-sided p from N(0, 1). */
function mannWhitneyTest(a: number[], b: number[]): { u: number; z: number; cliffsDelta: number; p: number } | undefined {
  const n1 = a.length;
  const n2 = b.length;
  if (n1 < 5 || n2 < 5) return undefined;
  const combined = [...a.map((v) => ({ v, g: 1 })), ...b.map((v) => ({ v, g: 2 }))].sort((x, y) => x.v - y.v);
  const N = n1 + n2;
  let r1 = 0;
  let tieSum = 0;
  let i = 0;
  while (i < N) {
    let j = i;
    while (j < N && combined[j]!.v === combined[i]!.v) j++;
    const avgRank = (i + 1 + j) / 2;
    const t = j - i;
    if (t > 1) tieSum += t * t * t - t;
    for (let k = i; k < j; k++) if (combined[k]!.g === 1) r1 += avgRank;
    i = j;
  }
  const u1 = r1 - (n1 * (n1 + 1)) / 2;
  const mu = (n1 * n2) / 2;
  const sigma = Math.sqrt(((n1 * n2) / 12) * (N + 1 - tieSum / (N * (N - 1))));
  const z = sigma > 0 ? (u1 - mu) / sigma : 0;
  const cliffsDelta = (2 * u1) / (n1 * n2) - 1;
  return { u: Math.round(u1), z: Math.round(z * 100) / 100, cliffsDelta: Math.round(cliffsDelta * 1000) / 1000, p: normalTwoSidedP(z) };
}

/**
 * Kruskal–Wallis H with the tie correction. Groups under five observations are dropped, so the
 * degrees of freedom are (groups kept − 1) and p is the exact χ²(df) upper tail. ε² = H / (N − 1).
 */
function kruskalWallisTest(groups: number[][]): { h: number; df: number; epsilonSq: number; p: number; n: number } | undefined {
  const valid = groups.filter((g) => g.length >= 5);
  if (valid.length < 2) return undefined;
  const combined: Array<{ v: number; idx: number }> = [];
  valid.forEach((g, idx) => g.forEach((v) => combined.push({ v, idx })));
  combined.sort((x, y) => x.v - y.v);
  const N = combined.length;
  const rankSums = new Array<number>(valid.length).fill(0);
  let tieSum = 0;
  let i = 0;
  while (i < N) {
    let j = i;
    while (j < N && combined[j]!.v === combined[i]!.v) j++;
    const avgRank = (i + 1 + j) / 2;
    const t = j - i;
    if (t > 1) tieSum += t * t * t - t;
    for (let k = i; k < j; k++) rankSums[combined[k]!.idx]! += avgRank;
    i = j;
  }
  let sumSq = 0;
  valid.forEach((g, idx) => {
    sumSq += rankSums[idx]! ** 2 / g.length;
  });
  let H = (12 / (N * (N + 1))) * sumSq - 3 * (N + 1);
  const tieCorr = 1 - tieSum / (N * N * N - N);
  if (tieCorr > 0) H /= tieCorr;
  const df = valid.length - 1;
  const epsilonSq = Math.max(0, Math.min(1, H / (N - 1)));
  return { h: Math.round(H * 10) / 10, df, epsilonSq: Math.round(epsilonSq * 1000) / 1000, p: chiSquareSf(H, df), n: N };
}

interface MincerSpec {
  key: string;
  label: string;
  fn: (r: ResearchRecord) => number;
}

/**
 * Coefficient table of a fitted Mincer equation: HC1 standard errors, t = β / SE and two-sided
 * p from Student t with df = n − k (k parameters including the intercept); stars come from p.
 */
function mincerFromOls(
  ols: { beta: number[]; se: number[]; r2: number; adjR2: number; fStat: number },
  specs: MincerSpec[],
  n: number,
  intercept: { label: string; baselineRub: number },
): MincerRegression {
  const k = specs.length + 1;
  const df = n - k;
  const coefficient = (key: string, label: string, b: number, s: number) => {
    const t = b / s;
    const p = studentTTwoSidedP(t, df);
    return {
      key,
      label,
      beta: Math.round(b * 1000) / 1000,
      se: Math.round(s * 1000) / 1000,
      tStat: Math.round(t * 100) / 100,
      stars: starsOf(p),
      pValue: formatP(p),
      p,
    };
  };
  const coefficients: MincerCoefficient[] = [
    { ...coefficient("intercept", intercept.label, ols.beta[0]!, ols.se[0]!), baselineRub: intercept.baselineRub },
    ...specs.map((spec, idx) => {
      const b = ols.beta[idx + 1]!;
      return { ...coefficient(spec.key, spec.label, b, ols.se[idx + 1]!), effectPct: Math.round((Math.exp(b) - 1) * 1000) / 10 };
    }),
  ];
  return {
    n,
    r2: Math.round(ols.r2 * 1000) / 1000,
    adjR2: Math.round(ols.adjR2 * 1000) / 1000,
    fStat: Math.round(ols.fStat * 10) / 10,
    df,
    fPValue: formatP(fSf(ols.fStat, k - 1, df)),
    baselineRub: intercept.baselineRub,
    coefficients,
  };
}

/**
 * Holm–Bonferroni across the hypothesis family of one analysis, then the single decision rule
 * (stats.isConfirmed): adjusted p < 0.05, effect at least "small", predicted direction.
 */
function adjustHypothesisFamily(rows: Array<HypothesisTestRow & { p: number; directionHolds: boolean }>): HypothesisTestRow[] {
  const adjusted = holmAdjust(rows.map((r) => r.p));
  return rows.map(({ directionHolds, ...row }, i) => {
    const pAdjusted = adjusted[i]!;
    return {
      ...row,
      pAdjusted,
      pAdjustedLabel: formatP(pAdjusted),
      confirmed: isConfirmed(pAdjusted, row.effectMagnitude ?? "negligible", directionHolds),
    };
  });
}

function computeScientificAnalysis(jobs: ResearchRecord[], ruJobs: ResearchRecord[], roles: RoleDetail[]): ScientificAnalysis {
  const itPaid = ruJobs.filter((r) => TECH_ROLES.has(r.role));
  const gradedIt = itPaid.filter((r) => r.grade !== undefined);

  // 1. Mincer Log-Wage Regression
  let mincer: MincerRegression | undefined;
  if (gradedIt.length >= 12) {
    const candidateSpecs: MincerSpec[] = [
      { key: "middle", label: "Грейд: Middle (к базе Junior/Intern)", fn: (r) => (r.grade === "middle" ? 1 : 0) },
      { key: "senior", label: "Грейд: Senior (к базе Junior/Intern)", fn: (r) => (r.grade === "senior" ? 1 : 0) },
      { key: "lead", label: "Грейд: Lead / Staff (к базе Junior/Intern)", fn: (r) => (r.grade === "lead" ? 1 : 0) },
      { key: "moscow", label: "Локация: Москва, офис/гибрид (к регионам)", fn: (r) => (!r.remote && r.region === "Москва" ? 1 : 0) },
      { key: "spb", label: "Локация: Санкт-Петербург, офис/гибрид (к регионам)", fn: (r) => (!r.remote && r.region === "Санкт-Петербург" ? 1 : 0) },
      { key: "remote", label: "Режим: Всероссийская удалёнка (к офису в регионах)", fn: (r) => (r.remote ? 1 : 0) },
      { key: "ai", label: "Навык: ИИ / LLM в требованиях", fn: (r) => (r.ai ? 1 : 0) },
    ];
    const y = gradedIt.map((r) => Math.log(r.pay!));
    const activeSpecs: typeof candidateSpecs = [];
    for (const spec of candidateSpecs) {
      const ones = gradedIt.reduce((s, r) => s + spec.fn(r), 0);
      if (ones < 2 || gradedIt.length - ones < 2) continue;
      const trialSpecs = [...activeSpecs, spec];
      const trialX = gradedIt.map((r) => [1, ...trialSpecs.map((s) => s.fn(r))]);
      if (solveOlsWhiteHc1(y, trialX)) activeSpecs.push(spec);
    }
    if (activeSpecs.length >= 1) {
      const X = gradedIt.map((r) => [1, ...activeSpecs.map((spec) => spec.fn(r))]);
      const ols = solveOlsWhiteHc1(y, X);
      if (ols) {
        mincer = mincerFromOls(ols, activeSpecs, gradedIt.length, { label: "Константа β₀ (Junior/Intern, офис в регионе)", baselineRub: round(Math.exp(ols.beta[0]!)) });
      }
    }
  }

  // 2. One-way ANOVA Variance Decomposition (Eta-squared on ln(pay))
  const computeAnovaFactor = (
    key: VarianceFactorRow["key"],
    label: string,
    pool: ResearchRecord[],
    groupFn: (r: ResearchRecord) => string | undefined,
  ): VarianceFactorRow | undefined => {
    const grouped = new Map<string, number[]>();
    for (const r of pool) {
      const g = groupFn(r);
      if (!g) continue;
      let arr = grouped.get(g);
      if (!arr) {
        arr = [];
        grouped.set(g, arr);
      }
      arr.push(Math.log(r.pay!));
    }
    const validGroups = [...grouped.values()].filter((g) => g.length >= 5);
    if (validGroups.length < 2) return undefined;
    const allVals = validGroups.flat();
    const N = allVals.length;
    const G = validGroups.length;
    if (N <= G + 2) return undefined;
    const grandMean = allVals.reduce((s, v) => s + v, 0) / N;
    let ssTot = 0;
    let ssBetween = 0;
    for (const g of validGroups) {
      const gMean = g.reduce((s, v) => s + v, 0) / g.length;
      ssBetween += g.length * (gMean - grandMean) ** 2;
      for (const v of g) ssTot += (v - grandMean) ** 2;
    }
    if (ssTot <= 0) return undefined;
    const ssWithin = Math.max(1e-9, ssTot - ssBetween);
    const etaSqPct = Math.round((ssBetween / ssTot) * 1000) / 10;
    const f = (ssBetween / (G - 1)) / (ssWithin / (N - G));
    const p = fSf(f, G - 1, N - G);
    return { key, label, n: N, groups: G, etaSqPct, fStat: Math.round(f * 10) / 10, pValue: formatP(p), p };
  };

  const varianceDecomposition = [
    computeAnovaFactor("grade", "Квалификационный грейд (Intern → Lead в IT)", itPaid, (r) => r.grade),
    computeAnovaFactor("geo", "География и формат (Москва, СПб, регионы, удалёнка)", itPaid, (r) => (r.remote ? "remote" : r.region)),
    computeAnovaFactor("role", "Профессиональная специализация (направление)", ruJobs, (r) => (r.role !== OTHER_ROLE.slug ? r.role : undefined)),
    computeAnovaFactor("language", "Язык программирования / основной стек", itPaid, (r) => r.language),
  ]
    .filter((f): f is VarianceFactorRow => f !== undefined)
    .sort((a, b) => b.etaSqPct - a.etaSqPct);

  // 3. Formal Hypothesis Testing Suite
  // Raw p first; Holm across the family and the verdict come once all tests are in.
  const hypotheses: Array<HypothesisTestRow & { p: number; directionHolds: boolean }> = [];

  const remItPays = itPaid.filter((r) => r.remote).map((r) => r.pay!);
  const regItPays = itPaid.filter((r) => !r.remote && r.region === "Другие города").map((r) => r.pay!);
  const mw = mannWhitneyTest(remItPays, regItPays);
  if (mw) {
    hypotheses.push({
      id: "H1",
      title: "Премия всероссийской ИТ-удалёнки над региональным офисом",
      method: "U-критерий Манна — Уитни и дельта Клиффа (δ)",
      n: remItPays.length + regItPays.length,
      statLabel: "z-статистика",
      statValue: `z = ${mw.z > 0 ? "+" : ""}${mw.z}`,
      pValue: formatP(mw.p),
      p: mw.p,
      effectLabel: "Дельта Клиффа δ",
      effectValue: `${mw.cliffsDelta > 0 ? "+" : ""}${mw.cliffsDelta}`,
      effectMagnitude: cliffsDeltaMagnitude(mw.cliffsDelta),
      confirmed: false,
      directionHolds: mw.z > 0,
    });
  }

  const mskItPays = itPaid.filter((r) => !r.remote && r.region === "Москва").map((r) => r.pay!);
  const spbItPays = itPaid.filter((r) => !r.remote && r.region === "Санкт-Петербург").map((r) => r.pay!);
  const kwGeo = kruskalWallisTest([mskItPays, spbItPays, regItPays, remItPays]);
  if (kwGeo) {
    hypotheses.push({
      id: "H2",
      title: "Межрегиональная стратификация оплаты труда в ИТ (4 сегмента)",
      method: "H-критерий Краскела — Уоллиса (ранговый ANOVA)",
      n: kwGeo.n,
      statLabel: `H (df = ${kwGeo.df})`,
      statValue: `H = ${kwGeo.h}`,
      pValue: formatP(kwGeo.p),
      p: kwGeo.p,
      effectLabel: "Доля дисперсии ε²",
      effectValue: `${(kwGeo.epsilonSq * 100).toFixed(1)}%`,
      effectMagnitude: epsilonSqMagnitude(kwGeo.epsilonSq),
      confirmed: false,
      directionHolds: true,
    });
  }

  const gradeGroups = GRADE_ORDER.map((g) => itPaid.filter((r) => r.grade === g).map((r) => r.pay!));
  const kwGrade = kruskalWallisTest(gradeGroups);
  if (kwGrade) {
    hypotheses.push({
      id: "H3",
      title: "Монотонная отдача от квалификационного грейда (Intern → Lead)",
      method: "H-критерий Краскела — Уоллиса по грейдам",
      n: kwGrade.n,
      statLabel: `H (df = ${kwGrade.df})`,
      statValue: `H = ${kwGrade.h}`,
      pValue: formatP(kwGrade.p),
      p: kwGrade.p,
      effectLabel: "Доля дисперсии ε²",
      effectValue: `${(kwGrade.epsilonSq * 100).toFixed(1)}%`,
      effectMagnitude: epsilonSqMagnitude(kwGrade.epsilonSq),
      confirmed: false,
      directionHolds: true,
    });
  }

  const validRoles = roles.filter((r) => r.withPay >= 15 && r.pay.median !== undefined && r.n > 0);
  if (validRoles.length >= 6) {
    const rankArr = (vals: number[]): number[] => {
      const sorted = vals.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
      const ranks = new Array<number>(vals.length).fill(0);
      let i = 0;
      while (i < sorted.length) {
        let j = i;
        while (j < sorted.length && sorted[j]!.v === sorted[i]!.v) j++;
        const avg = (i + 1 + j) / 2;
        for (let k = i; k < j; k++) ranks[sorted[k]!.i] = avg;
        i = j;
      }
      return ranks;
    };
    const rx = rankArr(validRoles.map((r) => r.pay.median!));
    const ry = rankArr(validRoles.map((r) => (r.withPay / r.n) * 100));
    const k = validRoles.length;
    const mean = (k + 1) / 2;
    let numSum = 0;
    let dx = 0;
    let dy = 0;
    for (let i = 0; i < k; i++) {
      numSum += (rx[i]! - mean) * (ry[i]! - mean);
      dx += (rx[i]! - mean) ** 2;
      dy += (ry[i]! - mean) ** 2;
    }
    if (dx > 0 && dy > 0) {
      const rho = Math.round((numSum / Math.sqrt(dx * dy)) * 1000) / 1000;
      // t = ρ·√((k − 2) / (1 − ρ²)) ~ Student t(k − 2) under H0; |ρ| = 1 has p = 0.
      const tRaw = Math.abs(rho) < 1 ? rho * Math.sqrt((k - 2) / (1 - rho * rho)) : rho * Infinity;
      const tStat = Number.isFinite(tRaw) ? Math.round(tRaw * 100) / 100 : 0;
      const p = Number.isFinite(tRaw) ? studentTTwoSidedP(tRaw, k - 2) : 0;
      hypotheses.push({
        id: "H4",
        title: "Смещение сокрытия окладов в высокооплачиваемых специализациях",
        method: "Ранговая корреляция Спирмена (ρ_s) между медианой и % вилок",
        n: k,
        statLabel: `t (df = ${k - 2})`,
        statValue: Number.isFinite(tRaw) ? `t = ${tStat}` : `ρ_s = ${rho}`,
        pValue: formatP(p),
        p,
        effectLabel: "Корреляция ρ_s",
        effectValue: `${rho}`,
        effectMagnitude: correlationMagnitude(rho),
        confirmed: false,
        directionHolds: rho < 0,
      });
    }
  }

  const computeOaxaca = (
    key: OaxacaDecompositionRow["key"],
    label: string,
    groupA: ResearchRecord[],
    groupB: ResearchRecord[],
  ): OaxacaDecompositionRow | undefined => {
    if (groupA.length < 8 || groupB.length < 8) return undefined;
    const covFns: Array<(r: ResearchRecord) => number> = [
      (r) => (r.grade === "middle" ? 1 : 0),
      (r) => (r.grade === "senior" ? 1 : 0),
      (r) => (r.grade === "lead" ? 1 : 0),
      (r) => (["backend", "ml", "ai", "devops", "architect", "data-engineer", "security"].includes(r.role) ? 1 : 0),
      (r) => (r.ai ? 1 : 0),
    ];
    const pooled = [...groupA, ...groupB];
    const setA = new Set(groupA.map((r) => r.id));
    const yPool = pooled.map((r) => Math.log(r.pay!));
    const activeFns: Array<(r: ResearchRecord) => number> = [];
    for (const fn of covFns) {
      const ones = pooled.reduce((s, r) => s + fn(r), 0);
      if (ones < 2 || pooled.length - ones < 2) continue;
      const trial = [...activeFns, fn];
      const trialX = pooled.map((r) => [1, ...trial.map((f) => f(r)), setA.has(r.id) ? 1 : 0]);
      if (solveOlsWhiteHc1(yPool, trialX)) activeFns.push(fn);
    }
    const yA = groupA.map((r) => Math.log(r.pay!));
    const yB = groupB.map((r) => Math.log(r.pay!));
    const meanLogA = yA.reduce((a, b) => a + b, 0) / yA.length;
    const meanLogB = yB.reduce((a, b) => a + b, 0) / yB.length;
    const totalLogGap = meanLogA - meanLogB;
    if (Math.abs(totalLogGap) < 1e-4) return undefined;

    const xPoolWithDummy = pooled.map((r) => [1, ...activeFns.map((fn) => fn(r)), setA.has(r.id) ? 1 : 0]);
    const olsPool = solveOlsWhiteHc1(yPool, xPoolWithDummy);
    let endowmentLog = 0;
    if (olsPool) {
      for (let j = 0; j < activeFns.length; j++) {
        const fn = activeFns[j]!;
        const meanXA = groupA.reduce((s, r) => s + fn(r), 0) / groupA.length;
        const meanXB = groupB.reduce((s, r) => s + fn(r), 0) / groupB.length;
        endowmentLog += (meanXA - meanXB) * olsPool.beta[j + 1]!;
      }
    }
    const coefficientLog = totalLogGap - endowmentLog;
    const endowmentSharePct = Math.round((endowmentLog / totalLogGap) * 1000) / 10;
    const coefficientSharePct = Math.round((100 - endowmentSharePct) * 10) / 10;
    return {
      key,
      label,
      nA: groupA.length,
      nB: groupB.length,
      totalLogGap: Math.round(totalLogGap * 1000) / 1000,
      rawGapPct: Math.round((Math.exp(totalLogGap) - 1) * 1000) / 10,
      endowmentLog: Math.round(endowmentLog * 1000) / 1000,
      endowmentSharePct,
      endowmentPct: Math.round((Math.exp(endowmentLog) - 1) * 1000) / 10,
      coefficientLog: Math.round(coefficientLog * 1000) / 1000,
      coefficientSharePct,
      coefficientPct: Math.round((Math.exp(coefficientLog) - 1) * 1000) / 10,
    };
  };

  const mskOfficeIt = itPaid.filter((r) => !r.remote && r.region === "Москва");
  const regOfficeIt = itPaid.filter((r) => !r.remote && r.region === "Другие города");
  const remIt = itPaid.filter((r) => r.remote);

  const oaxaca = [
    computeOaxaca("moscow_vs_regions", "Москва (офис) против регионов РФ (офис) в IT", mskOfficeIt, regOfficeIt),
    computeOaxaca("remote_vs_regions", "Всероссийская удалёнка против офиса в регионах РФ в IT", remIt, regOfficeIt),
  ].filter((x): x is OaxacaDecompositionRow => x !== undefined);

  return {
    mincer,
    varianceDecomposition,
    hypotheses: adjustHypothesisFamily(hypotheses),
    oaxaca,
  };
}

function computeRegionalComparison(jobs: ResearchRecord[], ruJobs: ResearchRecord[], paid: (r: ResearchRecord) => boolean): RegionalComparisonRow[] {
  const segments: Array<{ key: RegionalComparisonRow["key"]; label: string; pred: (r: ResearchRecord) => boolean }> = [
    { key: "moscow", label: "Москва (офис и гибрид)", pred: (r) => r.region === "Москва" && !r.remote },
    { key: "spb", label: "Санкт-Петербург (офис и гибрид)", pred: (r) => r.region === "Санкт-Петербург" && !r.remote },
    { key: "regions", label: "Другие города РФ (офис и гибрид)", pred: (r) => r.region === "Другие города" && !r.remote },
    { key: "remote", label: "Всероссийская удалёнка (Remote)", pred: (r) => r.remote },
  ];
  const mskPaid = ruJobs.filter((r) => r.region === "Москва" && !r.remote);
  const mskMed = dist(mskPaid.map((r) => r.pay!)).median;
  const mskItMed = dist(mskPaid.filter((r) => TECH_ROLES.has(r.role)).map((r) => r.pay!)).median;

  return segments
    .map((seg) => {
      const segAll = jobs.filter(seg.pred);
      const segPaid = segAll.filter(paid);
      const payDist = dist(segPaid.map((r) => r.pay!));
      const itDist = dist(segPaid.filter((r) => TECH_ROLES.has(r.role)).map((r) => r.pay!));
      const adjustedVsMoscow =
        seg.key === "moscow"
          ? { pct: 0, n: mskPaid.length }
          : adjustedGap([...mskPaid, ...segPaid], (r) => seg.pred(r));
      return {
        key: seg.key,
        label: seg.label,
        n: segAll.length,
        sharePct: share(segAll.length, jobs.length),
        withPay: segPaid.length,
        payShare: share(segPaid.length, segAll.length),
        remoteShare: share(segAll.filter((r) => r.remote).length, segAll.length),
        pay: payDist,
        itPay: itDist,
        moscowParityPct: mskMed && payDist.median ? Math.round((payDist.median / mskMed) * 100) : undefined,
        itMoscowParityPct: mskItMed && itDist.median ? Math.round((itDist.median / mskItMed) * 100) : undefined,
        adjustedVsMoscow,
        qcdPct: qcdPctOf(payDist),
      };
    })
    .filter((row) => row.n > 0);
}

function computeRegionalMatrix(roles: RoleDetail[], jobs: ResearchRecord[], paid: (r: ResearchRecord) => boolean): RegionalMatrixRow[] {
  const paidByRole = groupBy(jobs.filter(paid), (j) => j.role);
  return roles
    .filter((r) => r.pay.median !== undefined && r.withPay >= 15)
    .map((r) => {
      const rolePaid = paidByRole.get(r.slug) ?? [];
      const msk = rolePaid.filter((j) => j.region === "Москва" && !j.remote).map((j) => j.pay!);
      const spb = rolePaid.filter((j) => j.region === "Санкт-Петербург" && !j.remote).map((j) => j.pay!);
      const reg = rolePaid.filter((j) => j.region === "Другие города" && !j.remote).map((j) => j.pay!);
      const rem = rolePaid.filter((j) => j.remote).map((j) => j.pay!);
      const moscow = dist(msk, 5).median;
      const spbMed = dist(spb, 5).median;
      const regions = dist(reg, 5).median;
      const remote = dist(rem, 5).median;
      const regVsMskPct = moscow && regions ? Math.round(((regions - moscow) / moscow) * 100) : undefined;
      const remoteVsRegPct = regions && remote ? Math.round(((remote - regions) / regions) * 100) : undefined;
      return {
        slug: r.slug,
        label: r.label,
        n: r.n,
        withPay: r.withPay,
        median: r.pay.median,
        moscow,
        moscowN: msk.length,
        spb: spbMed,
        spbN: spb.length,
        regions,
        regionsN: reg.length,
        remote,
        remoteN: rem.length,
        regVsMskPct,
        remoteVsRegPct,
      };
    })
    .filter((row) => [row.moscow, row.spb, row.regions, row.remote].filter((v) => v !== undefined).length >= 2)
    .sort((a, b) => (b.median ?? 0) - (a.median ?? 0));
}

function computeLanguageMatrix(jobs: ResearchRecord[], paid: (r: ResearchRecord) => boolean): LanguageMatrixRow[] {
  const langs = [...new Set(jobs.map((r) => r.language).filter((l): l is string => Boolean(l)))];
  return langs
    .map((language) => {
      const all = jobs.filter((r) => r.language === language);
      const withPay = all.filter(paid);
      const d = dist(withPay.map((r) => r.pay!), 5);
      const gMed = (g: string): number | undefined => dist(withPay.filter((r) => r.grade === g).map((r) => r.pay!), 3).median;
      const junior = gMed("junior");
      const middle = gMed("middle");
      const senior = gMed("senior");
      const leadVals = withPay.filter((r) => r.grade === "lead").map((r) => r.pay!);
      const rawLead = dist(leadVals, 5).median;
      const lead = rawLead !== undefined && senior !== undefined && rawLead < senior && leadVals.length < 15 ? undefined : rawLead;
      const seniorToJuniorRatio = junior && senior && senior >= junior ? Math.round((senior / junior) * 10) / 10 : undefined;
      return {
        language,
        n: all.length,
        withPay: withPay.length,
        median: d.median,
        p25: d.p25,
        p75: d.p75,
        junior,
        middle,
        senior,
        lead,
        seniorToJuniorRatio,
        qcdPct: qcdPctOf(d),
      };
    })
    .filter((row) => row.median !== undefined && row.withPay >= 8)
    .sort((a, b) => (b.median ?? 0) - (a.median ?? 0));
}

function computeGradeMatrix(roles: RoleDetail[], jobs: ResearchRecord[], paid: (r: ResearchRecord) => boolean): GradeMatrixRow[] {
  const paidByRole = groupBy(jobs.filter(paid), (j) => j.role);
  return roles
    .filter((r) => r.pay.median !== undefined)
    .map((r) => {
      const rolePaid = paidByRole.get(r.slug) ?? [];
      const gradeMed = (g: string): number | undefined => {
        const vals = rolePaid.filter((j) => j.grade === g).map((j) => j.pay!);
        return dist(vals, 5).median;
      };
      const junior = gradeMed('junior');
      const middle = gradeMed('middle');
      const senior = gradeMed('senior');
      const lead = gradeMed('lead');
      const seniorToJuniorRatio =
        junior && senior && senior >= junior ? Math.round((senior / junior) * 10) / 10 : undefined;
      return {
        slug: r.slug,
        label: r.label,
        n: r.n,
        withPay: r.withPay,
        payShare: share(r.withPay, r.n),
        remoteShare: r.remoteShare,
        median: r.pay.median,
        p25: r.pay.p25,
        p75: r.pay.p75,
        junior,
        middle,
        senior,
        lead,
        seniorToJuniorRatio,
        spreadPct: r.spreadPct,
        qcdPct: qcdPctOf(r.pay),
      };
    })
    .sort((a, b) => (b.median ?? 0) - (a.median ?? 0));
}

const RETAIL_STORE_COMPANY = /\.\s*(?:Магазины|Команда магазинов|Магазины продуктов)$/i;
const NON_IT_RETAIL_EMPLOYER = /(?:красное\s*(?:&|и)\s*белое|пят[её]рочк|перекр[её]сток|дикси|бристоль|фикс\s*прайс|fix\s*price|чижик|светофор|ашан|auchan|лента\b(?!\s*tech)|магнит\b(?!\s*(?:tech|ит|it)))/iu;

function roleDetail(slug: string, records: ResearchRecord[], paid: (r: ResearchRecord) => boolean): RoleDetail {
  const def = roleDef(slug);
  const withPay = records.filter(paid);
  const payDist = dist(withPay.map((r) => r.pay!));
  return {
    slug,
    label: def?.label ?? OTHER_ROLE.label,
    plural: def?.plural ?? OTHER_ROLE.plural,
    n: records.length,
    withPay: withPay.length,
    pay: payDist,
    byGrade: sliceBy(records, (r) => r.grade, (k) => GRADE_LABELS[k as keyof typeof GRADE_LABELS], paid, GRADE_ORDER),
    byLanguage: sliceBy(records, (r) => r.language, (k) => k, paid).filter((s) => s.n >= 3),
    byRegion: sliceBy(records, (r) => r.region, (k) => k, paid, REGION_ORDER),
    skills: skillStats(withPay, 12, payDist.median),
    companies: topCounts(records.map((r) => r.company), 10),
    remoteShare: share(records.filter((r) => r.remote).length, records.length),
    spreadPct: medianSpreadPctOf(withPay),
  };
}


function classifyIntlMacroRegion(r: ResearchRecord): IntlMacroRegionRow["key"] {
  if (r.remote) return "global_remote";
  const cur = (r.currency ?? "").toUpperCase();
  const city = r.city ?? "";
  if (cur === "PLN" || r.platform === "justjoin.it" || /^(?:Warsaw|Krakow|Wroclaw|Gdansk|Poznan|Prague|Budapest|Bucharest|Belgrade|Sofia|Vilnius|Riga|Tallinn)$/i.test(city)) {
    return "cee_poland";
  }
  if (cur === "EUR" || cur === "GBP" || cur === "CHF" || /^(?:London|Berlin|Munich|Amsterdam|Zurich|Paris|Dublin|Barcelona|Madrid|Vienna|Stockholm|Limassol|Milan|Lisbon)$/i.test(city)) {
    return "western_europe";
  }
  return "north_america";
}

function toUsdYrRecord(r: ResearchRecord, usdRate: number): ResearchRecord {
  const factor = 12 / (usdRate > 0 ? usdRate : 80);
  const conv = (v: number | undefined): number | undefined =>
    v !== undefined ? Math.round((v * factor) / 100) * 100 : undefined;
  return {
    ...r,
    pay: conv(r.pay),
    payMin: conv(r.payMin),
    payMax: conv(r.payMax),
  };
}

function computeIntlMarketResearch(
  intlScope: ResearchRecord[],
  intlJobsRub: ResearchRecord[],
  usdRate: number,
): IntlMarketResearch | undefined {
  if (intlScope.length < 10 || intlJobsRub.length < 10) return undefined;
  const intlAll = intlScope.map((r) => toUsdYrRecord(r, usdRate));
  const repeated = new Set<string>();
  const seen = new Set<string>();
  for (const r of intlAll) {
    if (!r.company || r.pay === undefined) continue;
    const key = `${r.company.toLowerCase()}|${r.role}|${r.grade ?? ""}|${r.pay}`;
    if (seen.has(key)) repeated.add(r.id);
    else seen.add(key);
  }
  const intlPaidPred = (r: ResearchRecord): boolean =>
    r.market === "intl" && r.payPeriod === "month" && r.pay !== undefined && !repeated.has(r.id);
  const intlPaid = intlAll.filter(intlPaidPred);
  if (intlPaid.length < 10) return undefined;

  const intlRoles = [...groupBy(intlAll, (r) => r.role)]
    .filter(([slug]) => slug !== OTHER_ROLE.slug)
    .map(([slug, list]) => roleDetail(slug, list, intlPaidPred))
    .filter((detail) => detail.pay.median !== undefined)
    .sort((a, b) => b.withPay - a.withPay);

  const gradeMatrix = computeGradeMatrix(intlRoles, intlAll, intlPaidPred);
  const languageMatrix = computeLanguageMatrix(intlAll, intlPaidPred);

  // Macro-regions
  const macroDefs: Array<{ key: IntlMacroRegionRow["key"]; label: string }> = [
    { key: "north_america", label: "Северная Америка и USD-офисы (US / Canada)" },
    { key: "western_europe", label: "Западная Европа и Великобритания (EUR / GBP / CHF)" },
    { key: "cee_poland", label: "Центральная и Восточная Европа (PLN / CEE хабы)" },
    { key: "global_remote", label: "Глобальная удалёнка (Worldwide Remote)" },
  ];
  const naPaid = intlPaid.filter((r) => classifyIntlMacroRegion(r) === "north_america");
  const macroRegions: IntlMacroRegionRow[] = macroDefs
    .map((m) => {
      const segAll = intlAll.filter((r) => classifyIntlMacroRegion(r) === m.key);
      const segPaid = intlPaid.filter((r) => classifyIntlMacroRegion(r) === m.key);
      const d = dist(segPaid.map((r) => r.pay!), 5);
      const adjustedVsNa =
        m.key === "north_america"
          ? { pct: 0, n: naPaid.length }
          : adjustedGap([...naPaid, ...segPaid], (r) => classifyIntlMacroRegion(r) === m.key);
      return {
        key: m.key,
        label: m.label,
        n: segAll.length,
        sharePct: share(segAll.length, intlAll.length),
        withPay: segPaid.length,
        payShare: share(segPaid.length, segAll.length),
        pay: d,
        qcdPct: qcdPctOf(d),
        adjustedVsNa,
      };
    })
    .filter((row) => row.n > 0);

  const byHub = sliceBy(
    intlAll.filter((r) => r.city !== undefined && !/^(?:Москва|Санкт-Петербург)$/i.test(r.city)),
    (r) => r.city,
    (k) => k,
    intlPaidPred,
  )
    .filter((s) => s.pay.median !== undefined)
    .sort((a, b) => b.withPay - a.withPay || b.n - a.n)
    .slice(0, 16)
    .sort((a, b) => (b.pay.median ?? 0) - (a.pay.median ?? 0));

  const econometrics = computeMarketEconometrics(intlAll, intlPaid, intlPaidPred);

  // Global Scientific Analysis (Mincer OLS in ln(USD/yr), ANOVA eta^2, Hypotheses, Blinder-Oaxaca)
  const gradedIntl = intlPaid.filter((r) => r.role !== OTHER_ROLE.slug && r.grade !== undefined);
  let mincer: MincerRegression | undefined;
  if (gradedIntl.length >= 12) {
    const candidateSpecs: MincerSpec[] = [
      { key: "middle", label: "Грейд: Middle (к базе Junior/Intern)", fn: (r) => (r.grade === "middle" ? 1 : 0) },
      { key: "senior", label: "Грейд: Senior (к базе Junior/Intern)", fn: (r) => (r.grade === "senior" ? 1 : 0) },
      { key: "lead", label: "Грейд: Lead / Staff / Principal (к базе Junior/Intern)", fn: (r) => (r.grade === "lead" ? 1 : 0) },
      { key: "north_america", label: "Локация: Северная Америка / USD-хаб (к CEE/базе)", fn: (r) => (classifyIntlMacroRegion(r) === "north_america" ? 1 : 0) },
      { key: "western_europe", label: "Локация: Западная Европа / UK (EUR/GBP/CHF)", fn: (r) => (classifyIntlMacroRegion(r) === "western_europe" ? 1 : 0) },
      { key: "remote", label: "Режим: Глобальная удалёнка (Worldwide Remote)", fn: (r) => (r.remote ? 1 : 0) },
      { key: "ai", label: "Навык: ИИ / LLM в требованиях", fn: (r) => (r.ai ? 1 : 0) },
    ];
    const y = gradedIntl.map((r) => Math.log(r.pay!));
    const activeSpecs: typeof candidateSpecs = [];
    for (const spec of candidateSpecs) {
      const ones = gradedIntl.reduce((s, r) => s + spec.fn(r), 0);
      if (ones < 2 || gradedIntl.length - ones < 2) continue;
      const trialSpecs = [...activeSpecs, spec];
      const trialX = gradedIntl.map((r) => [1, ...trialSpecs.map((s) => s.fn(r))]);
      if (solveOlsWhiteHc1(y, trialX)) activeSpecs.push(spec);
    }
    if (activeSpecs.length >= 1) {
      const X = gradedIntl.map((r) => [1, ...activeSpecs.map((spec) => spec.fn(r))]);
      const ols = solveOlsWhiteHc1(y, X);
      if (ols) {
        mincer = mincerFromOls(ols, activeSpecs, gradedIntl.length, { label: "Константа β₀ (Junior/Intern, базовая локация, $/год)", baselineRub: Math.round(Math.exp(ols.beta[0]!) / 100) * 100 });
      }
    }
  }

  // Global ANOVA
  const baseSci = computeScientificAnalysis(
    intlAll.map((r) => ({
      ...r,
      region:
        classifyIntlMacroRegion(r) === "north_america"
          ? "Москва"
          : classifyIntlMacroRegion(r) === "western_europe"
            ? "Санкт-Петербург"
            : "Другие города",
    })),
    intlPaid.map((r) => ({
      ...r,
      region:
        classifyIntlMacroRegion(r) === "north_america"
          ? "Москва"
          : classifyIntlMacroRegion(r) === "western_europe"
            ? "Санкт-Петербург"
            : "Другие города",
    })),
    intlRoles,
  );

  const intlOaxaca = (baseSci.oaxaca ?? []).map((o) => ({
    ...o,
    label:
      o.key === "moscow_vs_regions"
        ? "Северная Америка (US/USD) против Восточной Европы (CEE/PLN)"
        : "Глобальная удалёнка против локальных офисов Восточной Европы (CEE)",
  }));

  const intlHypotheses = baseSci.hypotheses.map((h) =>
    h.id === "H1"
      ? { ...h, title: "Премия глобальной удалёнки (Worldwide Remote) к локальным региональным хабам CEE" }
      : h.id === "H2"
        ? { ...h, title: "Межрегиональная стратификация глобальных зарплат (US, Западная Европа, CEE, Remote)" }
        : h,
  );

  return {
    usdRate,
    totalVacancies: intlAll.length,
    paidVacancies: intlPaid.length,
    payShare: share(intlPaid.length, intlAll.length),
    remoteShare: share(intlAll.filter((r) => r.remote).length, intlAll.length),
    aiShare: share(intlAll.filter((r) => r.ai).length, intlAll.length),
    gradeMatrix,
    languageMatrix,
    macroRegions,
    byHub,
    econometrics,
    scientific: {
      mincer: mincer ?? baseSci.mincer,
      varianceDecomposition: baseSci.varianceDecomposition.map((v) =>
        v.key === "geo" ? { ...v, label: "Макрорегион и валютная зона (US, EU/UK, CEE, Worldwide Remote)" } : v,
      ),
      hypotheses: intlHypotheses,
      oaxaca: intlOaxaca,
    },
  };
}

function computeCrossMarketComparison(
  ruItByGrade: Slice[] | undefined,
  ruByRole: Slice[],
  ruEcon: MarketEconometrics | undefined,
  ruSci: ScientificAnalysis | undefined,
  intlResearch: IntlMarketResearch | undefined,
  intlByGrade: Slice[] | undefined,
  intlByRole: Slice[] | undefined,
  usdRate: number,
): CrossMarketComparison | undefined {
  if (!intlResearch || !ruEcon?.it.p50 || !intlResearch.econometrics.all.p50) return undefined;
  const rate = usdRate > 0 ? usdRate : 80;
  // IMF / World Bank PPP conversion factor for Russian non-tradable services & consumption basket vs US/WE
  const pppFactor = 2.55;
  const toUsdYr = (rubMo: number): number => Math.round(((rubMo * 12) / rate) / 100) * 100;

  const byGrade: CrossMarketGradeRow[] = [];
  for (const g of GRADE_ORDER) {
    const ruSlice = (ruItByGrade ?? []).find((s) => s.key === g);
    const intlSlice = (intlByGrade ?? []).find((s) => s.key === g);
    if (!ruSlice?.pay.median || !intlSlice?.pay.median) continue;
    const ruMedianRubMo = ruSlice.pay.median;
    const ruMedianUsdYr = toUsdYr(ruMedianRubMo);
    const ruPppUsdYr = Math.round((ruMedianUsdYr * pppFactor) / 100) * 100;
    const intlMedianUsdYr = toUsdYr(intlSlice.pay.median);
    if (ruMedianUsdYr <= 0 || intlMedianUsdYr <= 0) continue;
    byGrade.push({
      grade: g,
      label: GRADE_LABELS[g],
      ruMedianRubMo,
      ruMedianUsdYr,
      ruPppUsdYr,
      intlMedianUsdYr,
      nominalGapRatio: Math.round((intlMedianUsdYr / ruMedianUsdYr) * 100) / 100,
      pppParityPct: Math.round((ruPppUsdYr / intlMedianUsdYr) * 100),
    });
  }

  const byRole: CrossMarketRoleRow[] = [];
  for (const intlSlice of intlByRole ?? []) {
    if (!TECH_ROLES.has(intlSlice.key) && intlSlice.key !== "design") continue;
    const ruSlice = ruByRole.find((s) => s.key === intlSlice.key);
    if (!ruSlice?.pay.median || !intlSlice.pay.median) continue;
    const ruMedianRubMo = ruSlice.pay.median;
    const ruMedianUsdYr = toUsdYr(ruMedianRubMo);
    const ruPppUsdYr = Math.round((ruMedianUsdYr * pppFactor) / 100) * 100;
    const intlMedianUsdYr = toUsdYr(intlSlice.pay.median);
    if (ruMedianUsdYr <= 0 || intlMedianUsdYr <= 0) continue;
    byRole.push({
      slug: intlSlice.key,
      label: intlSlice.label,
      ruMedianRubMo,
      ruMedianUsdYr,
      ruPppUsdYr,
      intlMedianUsdYr,
      nominalGapRatio: Math.round((intlMedianUsdYr / ruMedianUsdYr) * 100) / 100,
      pppParityPct: Math.round((ruPppUsdYr / intlMedianUsdYr) * 100),
    });
  }

  const ruItMedUsd = toUsdYr(ruEcon.it.p50);
  const ruItPppUsd = Math.round((ruItMedUsd * pppFactor) / 100) * 100;
  const intlMedUsd = intlResearch.econometrics.all.p50;

  const ruGradeEta = ruSci?.varianceDecomposition.find((v) => v.key === "grade")?.etaSqPct;
  const intlGradeEta = intlResearch.scientific.varianceDecomposition.find((v) => v.key === "grade")?.etaSqPct;
  const ruGeoEta = ruSci?.varianceDecomposition.find((v) => v.key === "geo")?.etaSqPct;
  const intlGeoEta = intlResearch.scientific.varianceDecomposition.find((v) => v.key === "geo")?.etaSqPct;

  const structuralMetrics: CrossMarketMetricRow[] = [
    {
      key: "median_usd",
      label: "Годовая медиана в IT (номинал / по ППС, $/год)",
      ruValue: `${new Intl.NumberFormat("en-US").format(ruItMedUsd)} (ППС: ${new Intl.NumberFormat("en-US").format(ruItPppUsd)})`,
      intlValue: `${new Intl.NumberFormat("en-US").format(intlMedUsd)}`,
      interpretation: `Номинальный разрыв ${(intlMedUsd / ruItMedUsd).toFixed(2)}×; реальный паритет покупательной способности (ППС) — ${Math.round((ruItPppUsd / intlMedUsd) * 100)}%`,
    },
    {
      key: "gini_theil",
      label: "Индекс неравенства Джини (G) / Индекс энтропии Тейла (T)",
      ruValue: `G = ${ruEcon.it.gini?.toFixed(3) ?? "—"} / T = ${ruEcon.it.theil?.toFixed(3) ?? "—"}`,
      intlValue: `G = ${intlResearch.econometrics.all.gini?.toFixed(3) ?? "—"} / T = ${intlResearch.econometrics.all.theil?.toFixed(3) ?? "—"}`,
      interpretation: "Сравнение внутриотраслевой дифференциации окладов между рынком РФ и глобальным рынком",
    },
    {
      key: "decile_qcd",
      label: "Децильный коэффициент (P90/P10) / Квартильная дисперсия (QCD)",
      ruValue: `${ruEcon.it.decileRatio ?? "—"}× (${ruEcon.it.qcdPct ?? "—"}%)`,
      intlValue: `${intlResearch.econometrics.all.decileRatio ?? "—"}× (${intlResearch.econometrics.all.qcdPct ?? "—"}%)`,
      interpretation: "Размах между верхними 10% и стартовыми 10% зарплатных предложений",
    },
    {
      key: "anova_eta",
      label: "Декомпозиция дисперсии ANOVA η² (грейд / география)",
      ruValue: `Грейд: ${ruGradeEta ?? "—"}% / Гео: ${ruGeoEta ?? "—"}%`,
      intlValue: `Грейд: ${intlGradeEta ?? "—"}% / Гео: ${intlGeoEta ?? "—"}%`,
      interpretation: "На обоих рынках квалификационный грейд доминирует над географией, но на глобальном рынке выше валютно-страновая рента",
    },
    {
      key: "hhi",
      label: "Концентрация работодателей Херфиндаля — Хиршмана (HHI / CR5)",
      ruValue: `HHI = ${ruEcon.employerConcentration.hhi} (CR₅ = ${ruEcon.employerConcentration.cr5Pct}%)`,
      intlValue: `HHI = ${intlResearch.econometrics.employerConcentration.hhi} (CR₅ = ${intlResearch.econometrics.employerConcentration.cr5Pct}%)`,
      interpretation: "Глобальный пул вакансий распределён между тысячами компаний более равномерно, чем в РФ",
    },
  ];

  return {
    usdRate: rate,
    pppFactor,
    byGrade,
    byRole: byRole.slice(0, 14),
    structuralMetrics,
  };
}

function computeIntlGigBrackets(records: ResearchRecord[], usdRate: number): GigBracket[] {
  const rate = usdRate > 0 ? usdRate : 80;
  const usdRecords = records.map((r) => ({ ...r, pay: r.pay !== undefined ? Math.round(r.pay / rate) : undefined }));
  const defs: Array<{ key: GigBracket["key"]; label: string; pred: (pay: number) => boolean }> = [
    { key: "micro", label: "До $50 (микрозадачи и правки)", pred: (p) => p < 50 },
    { key: "small", label: "$50 – $250 (небольшие заказы)", pred: (p) => p >= 50 && p < 250 },
    { key: "medium", label: "$250 – $1 000 (средние проекты)", pred: (p) => p >= 250 && p < 1_000 },
    { key: "large", label: "От $1 000 (крупные проекты и MVP)", pred: (p) => p >= 1_000 },
  ];
  const totalN = usdRecords.length;
  const totalCap = usdRecords.reduce((s, r) => s + (r.pay ?? 0), 0);
  if (!totalN || !totalCap) return [];
  return defs.map((d) => {
    const group = usdRecords.filter((r) => d.pred(r.pay ?? 0));
    const cap = group.reduce((s, r) => s + (r.pay ?? 0), 0);
    return {
      key: d.key,
      label: d.label,
      n: group.length,
      nShare: share(group.length, totalN),
      capitalRub: cap,
      capitalShare: share(cap, totalCap),
      median: dist(group.map((r) => r.pay!), 3).median,
    };
  });
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
  const intlPaid = (r: ResearchRecord): boolean => r.market === 'intl' && r.payPeriod === 'month' && r.pay !== undefined;
  const intlJobs = intlScope.filter(intlPaid);
  const intlGigsScope = records.filter((r) => r.type === 'gig' && r.scope === 'intl');
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

  const roles = [...groupBy(jobs, (r) => r.role)]
    .filter(([slug]) => slug !== OTHER_ROLE.slug)
    .map(([slug, list]) => roleDetail(slug, list, ruPaid))
    .filter((detail) => detail.pay.median !== undefined)
    .sort((a, b) => b.withPay - a.withPay);

  const cartaCapital = computeCartaCapital(gigsPaid);
  const taskTransformation = computeTaskTransformation(gigs);
  const bumpChart = computeBumpChart([...jobs, ...gigs]);
  const editorialInsight = computeEditorialInsight(cartaCapital, period);
  const twoBounds = ruJobs.filter((r) => r.payMin !== undefined && r.payMax !== undefined && r.payMin !== r.payMax);
  const usdRate = RUB_PER.USD ?? 80;
  const ruEcon = computeMarketEconometrics(jobs, ruJobs, ruPaid);
  const ruSci = computeScientificAnalysis(jobs, ruJobs, roles);
  const ruItByGrade = sliceBy(jobs.filter((r) => TECH_ROLES.has(r.role)), (r) => r.grade, (k) => GRADE_LABELS[k as keyof typeof GRADE_LABELS], ruPaid, GRADE_ORDER);
  const ruByRole = sliceBy(jobs, (r) => r.role, (k) => roleDef(k)?.label ?? OTHER_ROLE.label, ruPaid);
  const intlByRole = sliceBy(intlScope.filter((r) => r.role !== OTHER_ROLE.slug), (r) => r.role, (k) => roleDef(k)?.label ?? OTHER_ROLE.label, intlPaid).filter((s) => s.pay.median !== undefined);
  const intlByGrade = sliceBy(intlScope.filter((r) => r.role !== OTHER_ROLE.slug), (r) => r.grade, (k) => GRADE_LABELS[k as keyof typeof GRADE_LABELS], intlPaid, GRADE_ORDER).filter((s) => s.pay.median !== undefined);
  const intlResearch = computeIntlMarketResearch(intlScope, intlJobs, usdRate);
  const crossMarket = computeCrossMarketComparison(ruItByGrade, ruByRole, ruEcon, ruSci, intlResearch, intlByGrade, intlByRole, usdRate);
  const intlGigsPaid = intlGigsScope.filter(projectPaid);
  const itPaidByCity = groupBy(jobs.filter((r) => TECH_ROLES.has(r.role) && ruPaid(r)), (r) => r.city);

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
        medianSpreadPct: medianSpreadPctOf(twoBounds),
      },
      byPlatform: sliceBy(jobs, (r) => r.platform, (k) => k, ruPaid).filter((slice) => slice.pay.median !== undefined),
      intl: dist(intlJobs.map((r) => r.pay!)),
      intlByRole,
      intlByGrade,
      intlCompanies: topCounts(intlScope.map((r) => r.company), 12),
      intlResearch,
      crossMarket,
      byRole: ruByRole,
      byGrade: sliceBy(jobs.filter((r) => r.role !== OTHER_ROLE.slug), (r) => r.grade, (k) => GRADE_LABELS[k as keyof typeof GRADE_LABELS], ruPaid, GRADE_ORDER),
      itByGrade: ruItByGrade,
      gradeMatrix: computeGradeMatrix(roles, jobs, ruPaid),
      regionalMatrix: computeRegionalMatrix(roles, jobs, ruPaid),
      regionalComparison: computeRegionalComparison(jobs, ruJobs, ruPaid),
      languageMatrix: computeLanguageMatrix(jobs, ruPaid),
      byCity: sliceBy(jobs.filter((r) => r.city !== undefined), (r) => r.city, (k) => k, ruPaid)
        .filter((s) => s.pay.median !== undefined)
        .sort((a, b) => b.withPay - a.withPay || b.n - a.n)
        .slice(0, 20)
        .map((s): CitySlice => {
          const itVals = (itPaidByCity.get(s.key) ?? []).map((r) => r.pay!);
          const itPay = dist(itVals, 5);
          return itPay.median !== undefined ? { ...s, itPay } : s;
        })
        .sort((a, b) => (b.pay.median ?? 0) - (a.pay.median ?? 0) || b.withPay - a.withPay)
        .slice(0, 16),
      econometrics: ruEcon,
      scientific: ruSci,
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
      skills: skillStats(ruJobs.filter((r) => r.role !== OTHER_ROLE.slug), 20),
      companies: topCounts(jobs.filter((r) => !(r.role === OTHER_ROLE.slug && r.company && RETAIL_STORE_COMPANY.test(r.company))).map((r) => r.company), 15),
      itCompanies: topCounts(
        jobs
          .filter((r) => TECH_ROLES.has(r.role) && !(r.company && (RETAIL_STORE_COMPANY.test(r.company) || NON_IT_RETAIL_EMPLOYER.test(r.company))))
          .map((r) => r.company),
        15,
      ),
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
      brackets: computeGigBrackets(gigsPaid),
      intlBudget: dist(intlGigsPaid.map((r) => r.pay!)),
      intlByCategory: sliceBy(
        intlGigsScope.filter((r) => r.role !== OTHER_ROLE.slug).map((r) => ({ ...r, pay: r.pay !== undefined ? Math.round(r.pay / usdRate) : undefined })),
        (r) => r.role,
        (k) => roleDef(k)?.label ?? OTHER_ROLE.label,
        projectPaid,
      ).filter((s) => s.pay.median !== undefined),
      intlBrackets: computeIntlGigBrackets(intlGigsPaid, usdRate),
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
  const gradeSource =
    jobs.itByGrade?.some((s) => s.key === 'junior' && s.pay.median) &&
    jobs.itByGrade?.some((s) => s.key === 'senior' && s.pay.median)
      ? jobs.itByGrade
      : jobs.byGrade;
  const juniorSlice = gradeSource.find((s) => s.key === 'junior');
  const senior = gradeSource.find((s) => s.key === 'senior');
  const junior = juniorSlice?.pay.median;
  if (junior && senior?.pay.median) {
    const ratio = Math.round((senior.pay.median / junior) * 10) / 10;
    out.push({
      text: `Вакансии Senior предлагают в ${String(ratio).replace('.', ',')} раза больше, чем Junior: ${formatRub(senior.pay.median)} против ${formatRub(junior)}.`,
      quote: cite(`медианная зарплата в вакансиях уровня Senior (${formatRub(senior.pay.median)}) в ${String(ratio).replace('.', ',')} раза выше, чем у Junior (${formatRub(junior)})`, senior.pay.n + (juniorSlice?.pay.n ?? 0)),
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
  if (jobs.bounds && jobs.bounds.range >= RELIABLE && jobs.bounds.medianSpreadPct) {
    out.push({
      text: `Полную зарплатную вилку («от и до») указывают в ${jobs.bounds.range} вакансиях; типичный разброс внутри вилки — ±${jobs.bounds.medianSpreadPct}% от середины.`,
      quote: cite(`полная зарплатная вилка («от и до») указана в ${jobs.bounds.range} вакансиях, а медианный разброс внутри вилки составляет ±${jobs.bounds.medianSpreadPct}%`, jobs.bounds.range),
    });
  }
  const topSkill = jobs.skills.find((s) => s.n >= RELIABLE && (s.premiumPct ?? 0) >= 10 && s.pay.median !== undefined);
  if (topSkill) {
    out.push({
      text: `Среди востребованных навыков высокую зарплатную премию даёт ${topSkill.skill}: медиана ${formatRub(topSkill.pay.median!)} (+${topSkill.premiumPct}%).`,
      quote: cite(`медианная зарплата в вакансиях с требованием ${topSkill.skill} составила ${formatRub(topSkill.pay.median!)} в месяц (+${topSkill.premiumPct}%)`, topSkill.n),
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
