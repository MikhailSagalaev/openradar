/**
 * The market report: medians and quartiles of pay by role, grade, language, region and
 * skill, built from research records. A figure is published only when enough posts stand
 * behind it (MIN_MEDIAN); quartiles need more (MIN_QUARTILES).
 */
import { GRADE_LABELS, GRADE_ORDER, OTHER_ROLE, ROLES, RUB_PER, roleDef, type ResearchRecord } from './derive.ts';

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
  }
  return out;
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
  };
  report.findings = findingsOf(report);
  return report;
}

/** Short facts with a quotable sentence each; only figures above the sample threshold. */
export function findingsOf(report: Report): Finding[] {
  const out: Finding[] = [];
  const when = report.period.phrase;
  const cite = (text: string, n: number): string => `По данным OpenRadar, ${text} ${when} (выборка: ${n} вакансий).`;
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
      quote: `По данным OpenRadar, зарплату указывают в ${formatShare(jobs.payShare)} вакансий ${when} (выборка: ${report.totals.jobs} вакансий).`,
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
      quote: `По данным OpenRadar, медианный бюджет заказа на фриланс-биржах и в Telegram-каналах ${when} составил ${formatRub(gigs.budget.median)} (выборка: ${gigs.budget.n} заказов).`,
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
