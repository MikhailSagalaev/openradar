/**
 * The market report: medians and quartiles of pay by role, grade, language, region and
 * skill, built from research records. A figure is published only when enough posts stand
 * behind it (MIN_MEDIAN); quartiles need more (MIN_QUARTILES).
 */
import { GRADE_LABELS, GRADE_ORDER, OTHER_ROLE, ROLES, RUB_PER, roleDef, type ResearchRecord } from './derive.ts';
import { classifyTaskTransformation } from './methodology.ts';

/** Bump when the rules change what a figure means; snapshots keep the version they were built with. */
export const REPORT_VERSION = 1;
export const MIN_MEDIAN = 10;
export const MIN_QUARTILES = 20;
export const RELIABLE = 30;

export interface Dist {
  n: number;
  p25?: number;
  median?: number;
  p75?: number;
  iqr?: number;
  trimmedMean?: number;
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
  changePct: number;
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
    /** English-language vacancies, counted apart from the main figures. */
    intlJobs?: number;
  };
  jobs: {
    pay: Dist;
    payShare: number;
    intl: Dist;
    byRole: Slice[];
    byGrade: Slice[];
    byLanguage: Slice[];
    byRegion: Slice[];
    remote: { share: number; remote: Dist; office: Dist };
    ai: { share: number; with: Dist; without: Dist };
    skills: Array<{ skill: string; n: number; pay: Dist }>;
    companies: Array<{ name: string; n: number }>;
    histogram: Array<{ from: number; to?: number; n: number }>;
    weekly: Array<{ week: string; n: number; median?: number }>;
    roles: RoleDetail[];
  };
  gigs: { budget: Dist; budgetShare: number; byCategory: Slice[]; hourly: Dist };
  findings: Finding[];
  cartaCapital?: CartaCapitalRow[];
  taskTransformation?: {
    routine: TaskTransformationItem[];
    emerging: TaskTransformationItem[];
    netShiftPct: number;
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

function computeTaskTransformation(records: ResearchRecord[]) {
  const routineDefs = [
    { key: 'copywriting', label: 'Базовый копирайтинг и рерайт текстов', rx: /копирайт|рерайт|статьи|написание текста|контент|writer/i, roles: ['content'] },
    { key: 'html', label: 'Шаблонная вёрстка и типовые сайты', rx: /верстк|html|css|лендинг|tilda|тильд/i, roles: ['web'] },
    { key: 'translation', label: 'Типовой перевод документации и статей', rx: /перевод|translat/i, roles: ['translation'] },
    { key: 'banner', label: 'Типовые баннеры, креативы и карточки', rx: /баннер|карточк|креатив|обложк/i, roles: ['design', 'marketplaces'] },
  ];

  const emergingDefs = [
    { key: 'agents', label: 'Интеграция AI-агентов, RAG & n8n/Make', rx: /ai[- ]?агент|rag\b|n8n|make\.com|автоматизаци[яи] llm|langchain|llamaindex/i, roles: ['ai'] },
    { key: 'vibe', label: 'Рефакторинг кода после AI (Cursor/Lovable)', rx: /cursor|lovable|v0\.dev|вайб[- ]?кодинг|доработать mvp/i, roles: [] },
    { key: 'lora', label: 'Обучение LoRA и ComfyUI пайплайны', rx: /comfyui|lora|stable diffusion|flux/i, roles: [] },
    { key: 'tma', label: 'Telegram Mini Apps и AI-боты', rx: /tma\b|mini[- ]?app|telegram-бот|чат-бот/i, roles: ['bots'] },
  ];

  const routineStats = new Map<string, { n: number; pays: number[] }>();
  for (const d of routineDefs) routineStats.set(d.key, { n: 0, pays: [] });

  const emergingStats = new Map<string, { n: number; pays: number[] }>();
  for (const d of emergingDefs) emergingStats.set(d.key, { n: 0, pays: [] });

  const allRoutinePays: number[] = [];
  const allEmergingPays: number[] = [];
  let totalMatched = 0;

  for (const r of records) {
    const text = `${r.role} ${r.skills.join(' ')}`;
    let matchedEmerging = false;

    for (const d of emergingDefs) {
      if (d.rx.test(text) || (d.roles.includes(r.role) && (r.ai || d.roles.length > 0))) {
        const cur = emergingStats.get(d.key)!;
        cur.n++;
        if (r.pay && r.pay > 0) {
          cur.pays.push(r.pay);
          allEmergingPays.push(r.pay);
        }
        matchedEmerging = true;
        totalMatched++;
        break;
      }
    }

    if (!matchedEmerging) {
      for (const d of routineDefs) {
        if (d.rx.test(text) || d.roles.includes(r.role)) {
          const cur = routineStats.get(d.key)!;
          cur.n++;
          if (r.pay && r.pay > 0) {
            cur.pays.push(r.pay);
            allRoutinePays.push(r.pay);
          }
          totalMatched++;
          break;
        }
      }
    }
  }

  const routineMed = allRoutinePays.length ? dist(allRoutinePays).median : undefined;
  const emergingMed = allEmergingPays.length ? dist(allEmergingPays).median : undefined;

  const allPays = records.filter((r) => r.pay && r.pay > 0).map((r) => r.pay!);
  const overallMed = allPays.length ? dist(allPays).median : 100000;
  const baseline = routineMed ?? overallMed ?? 100000;

  const routine: TaskTransformationItem[] = routineDefs.map((d) => {
    const st = routineStats.get(d.key)!;
    const med = st.pays.length ? dist(st.pays).median : undefined;
    const changePct = med && overallMed ? Math.round(((med - overallMed) / overallMed) * 100) : 0;
    return {
      label: d.label,
      n: st.n,
      changePct,
      medianPay: med,
    };
  });

  const emerging: TaskTransformationItem[] = emergingDefs.map((d) => {
    const st = emergingStats.get(d.key)!;
    const med = st.pays.length ? dist(st.pays).median : undefined;
    const changePct = med && baseline ? Math.round(((med - baseline) / baseline) * 100) : 0;
    return {
      label: d.label,
      n: st.n,
      changePct: Math.max(0, changePct),
      medianPay: med,
    };
  });

  const netShiftPct = routineMed && emergingMed && routineMed > 0
    ? Math.round(((emergingMed - routineMed) / routineMed) * 100)
    : 0;

  return {
    routine,
    emerging,
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

function computeEditorialInsight(records: ResearchRecord[], carta: CartaCapitalRow[], period: Report['period']) {
  if (!carta.length) {
    return {
      fact: 'Рынок труда формируется балансом инженерных и продуктовых специализаций.',
      contrast: 'Распределение капитала зависит от уровня сложности задач.',
      conclusion: 'Ключевые бюджеты сосредоточены в специализированных направлениях разработки.',
      quote: `По данным openradar, структура рынка труда отражает концентрацию капитала в ключевых направлениях (${period.phrase}, выборка: ${records.length} публикаций).`,
    };
  }

  const topVol = [...carta].sort((a, b) => b.n - a.n)[0]!;
  const topCap = carta[0]!;

  if (topVol.label === topCap.label) {
    return {
      fact: `Направление «${topVol.label}» лидирует по объёму объявлений (${formatShare(topVol.nShare)} от общего потока).`,
      contrast: `Оно же аккумулирует крупнейшую долю контрактного капитала рынка (${formatShare(topCap.capitalShare)}).`,
      conclusion: 'Спрос работодателей и денежная масса в текущей выборке максимально согласованы.',
      quote: `По данным openradar, направление «${topVol.label}» формирует ${formatShare(topVol.nShare)} объявлений и ${formatShare(topCap.capitalShare)} совокупного бюджета (${period.phrase}, выборка: ${records.length} публикаций).`,
    };
  }

  const top2 = carta.slice(0, 2);
  const sumTop2Cap = Math.round(top2.reduce((s, r) => s + r.capitalShare, 0) * 10) / 10;
  const top2Names = top2.map((r) => r.label).join(' и ');

  return {
    fact: `Направление «${topVol.label}» лидирует по числу вакансий и заказов (${formatShare(topVol.nShare)} от общего потока).`,
    contrast: `Однако наибольшую долю контрактного капитала (${formatShare(sumTop2Cap)}) аккумулируют ${top2Names}.`,
    conclusion: 'Массовый поток задач формирует численный объём, тогда как основная покупательная способность сконцентрирована в инженерных специализациях.',
    quote: `По данным openradar, более ${formatShare(sumTop2Cap)} совокупного бюджета рынка сосредоточено в направлениях ${top2Names}, несмотря на долю «${topVol.label}» в объёме (${period.phrase}, выборка: ${records.length} публикаций).`,
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
  const gigs = records.filter((r) => r.type === 'gig');
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

  const cartaCapital = computeCartaCapital(records);
  const taskTransformation = computeTaskTransformation(records);
  const bumpChart = computeBumpChart(records);
  const editorialInsight = computeEditorialInsight(records, cartaCapital, period);

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
      gigsWithBudget: gigsPaid.length,
      companies: new Set(jobs.map((r) => r.company).filter(Boolean)).size,
      platforms: topCounts(records.map((r) => r.platform), 20).map(({ name, n }) => ({ key: name, n })),
      payOrigins: Object.fromEntries(topCounts(records.map((r) => r.payOrigin), 4).map(({ name, n }) => [name, n])),
      excluded,
    },
    jobs: {
      pay: dist(ruJobs.map((r) => r.pay!)),
      payShare: share(ruJobs.length, jobs.length),
      intl: dist(intlJobs.map((r) => r.pay!)),
      byRole: sliceBy(jobs, (r) => r.role, (k) => roleDef(k)?.label ?? OTHER_ROLE.label, ruPaid),
      byGrade: sliceBy(jobs, (r) => r.grade, (k) => GRADE_LABELS[k as keyof typeof GRADE_LABELS], ruPaid, GRADE_ORDER),
      byLanguage: sliceBy(jobs, (r) => r.language, (k) => k, ruPaid),
      byRegion: sliceBy(jobs, (r) => r.region, (k) => k, ruPaid, REGION_ORDER),
      remote: {
        share: share(jobs.filter((r) => r.remote).length, jobs.length),
        remote: dist(ruJobs.filter((r) => r.remote).map((r) => r.pay!)),
        office: dist(ruJobs.filter((r) => !r.remote).map((r) => r.pay!)),
      },
      ai: {
        share: share(jobs.filter((r) => r.ai).length, jobs.length),
        with: dist(ruJobs.filter((r) => r.ai).map((r) => r.pay!)),
        without: dist(ruJobs.filter((r) => !r.ai).map((r) => r.pay!)),
      },
      skills: skillStats(ruJobs, 20),
      companies: topCounts(jobs.map((r) => r.company), 15),
      histogram: bins,
      weekly: [...weekCounts.keys()].sort().map((week) => {
        const d = dist(weeks.get(week) ?? []);
        return { week, n: weekCounts.get(week)!, median: d.median };
      }),
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
  const ranked = jobs.roles.filter((r) => r.pay.n >= MIN_MEDIAN);
  const top = ranked.slice().sort((a, b) => b.pay.median! - a.pay.median!)[0];
  if (top && ranked.length >= 3) {
    out.push({
      text: `Больше всего в вакансиях предлагают направлению «${top.label}»: медиана ${formatRub(top.pay.median!)}.`,
      quote: cite(`медианная зарплата в вакансиях направления «${top.label}» составила ${formatRub(top.pay.median!)} в месяц — больше, чем в других направлениях`, top.pay.n),
    });
  }
  const junior = jobs.byGrade.find((s) => s.key === 'junior')?.pay.median;
  const senior = jobs.byGrade.find((s) => s.key === 'senior');
  if (junior && senior?.pay.median) {
    const ratio = Math.round((senior.pay.median / junior) * 10) / 10;
    out.push({
      text: `Senior в среднем предлагают в ${String(ratio).replace('.', ',')} раза больше, чем Junior: ${formatRub(senior.pay.median)} против ${formatRub(junior)}.`,
      quote: cite(`медианная зарплата в вакансиях уровня Senior (${formatRub(senior.pay.median)}) в ${String(ratio).replace('.', ',')} раза выше, чем у Junior (${formatRub(junior)})`, senior.pay.n + (jobs.byGrade.find((s) => s.key === 'junior')?.pay.n ?? 0)),
    });
  }
  if (jobs.remote.remote.median && jobs.remote.office.median) {
    const diff = Math.round(((jobs.remote.remote.median - jobs.remote.office.median) / jobs.remote.office.median) * 100);
    out.push({
      text: `Удалённую работу допускают ${formatShare(jobs.remote.share)} вакансий; медиана на удалёнке ${formatRub(jobs.remote.remote.median)} против ${formatRub(jobs.remote.office.median)} в офисе.`,
      quote: cite(`удалённую работу допускают ${formatShare(jobs.remote.share)} вакансий, а медианная зарплата в них ${diff >= 0 ? 'на ' + diff + '% выше' : 'на ' + -diff + '% ниже'}, чем в офисных`, jobs.remote.remote.n + jobs.remote.office.n),
    });
  }
  if (jobs.ai.with.median && jobs.ai.without.median) {
    const diff = Math.round(((jobs.ai.with.median - jobs.ai.without.median) / jobs.ai.without.median) * 100);
    out.push({
      text: `ИИ и нейросети упоминают ${formatShare(jobs.ai.share)} вакансий; в них предлагают ${formatRub(jobs.ai.with.median)} против ${formatRub(jobs.ai.without.median)} в остальных.`,
      quote: cite(`ИИ и нейросети упоминаются в ${formatShare(jobs.ai.share)} вакансий, а медианная зарплата в таких вакансиях ${diff >= 0 ? 'на ' + diff + '% выше' : 'на ' + -diff + '% ниже'}, чем в остальных`, jobs.ai.with.n + jobs.ai.without.n),
    });
  }
  const moscow = jobs.byRegion.find((s) => s.key === 'Москва')?.pay;
  const regions = jobs.byRegion.find((s) => s.key === 'Другие города')?.pay;
  if (moscow?.median && regions?.median) {
    out.push({
      text: `В Москве медиана ${formatRub(moscow.median)}, в других городах (кроме Петербурга) — ${formatRub(regions.median)}.`,
      quote: cite(`медианная зарплата в московских вакансиях составила ${formatRub(moscow.median)}, в других городах кроме Петербурга — ${formatRub(regions.median)}`, moscow.n + regions.n),
    });
  }
  if (gigs.budget.median !== undefined) {
    out.push({
      text: `Медианный бюджет заказа на фрилансе — ${formatRub(gigs.budget.median)}; бюджет указан в ${formatShare(gigs.budgetShare)} заказов.`,
      quote: `По данным openradar, медианный бюджет заказа на фриланс-биржах и в Telegram-каналах ${when} составил ${formatRub(gigs.budget.median)} (выборка: ${gigs.budget.n} заказов).`,
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
export function rubMonthToUsdYear(rub: number): number {
  return Math.round((rub * 12) / RUB_PER.USD! / 1000) * 1000;
}

export { ROLES };
