import { classifyRole, isPhysicalNonItWork } from '../research/derive.ts';
import { classifyIsco08 } from "./isco.ts";
import { RUB_PER } from './fx.ts';
import { budgetUsd } from './salary.ts';
import { salaryLooksWrong } from './salary-sanity.ts';
import { extractTechSkills, normalizeForMatch } from './text.ts';
import type { Lead, LeadType } from './types.ts';

const RUB_PER_USD = RUB_PER.USD!;

/** Words that say nothing about the kind of work: «требуется», «разработка», seniority. */
const STOP_WORDS = new Set([
  'требуется', 'требуются', 'нужен', 'нужна', 'нужно', 'ищу', 'ищем', 'для', 'под', 'ключ', 'над', 'при',
  'работа', 'работы', 'вакансия', 'заказ', 'проект', 'проекта', 'задача', 'разработка', 'разработать',
  'сделать', 'создание', 'создать', 'настройка', 'доработка', 'удаленно', 'удалённо', 'москва', 'офис',
  'the', 'and', 'for', 'with', 'remote', 'senior', 'middle', 'junior', 'lead', 'ведущий', 'старший',
  'младший', 'главный', 'специалист', 'менеджер', 'сайт', 'сайта', 'сайте', 'сайты', 'нужна', 'помощь',
  'developer', 'engineer', 'разработчик', 'разработчика', 'программист', 'инженер',
]);

/** Fewer similar leads than this and there is no estimate: unrelated pay is not a market. */
const MIN_SAMPLES = 3;
const MAX_SAMPLES = 40;

export interface MarketQuery {
  title: string;
  type: LeadType;
  /** Skills the caller already knows (schema.org JobPosting); dictionary skills are added. */
  skills?: string[];
}

export interface MarketRange {
  p25: number;
  median: number;
  p75: number;
}

export interface MarketEstimate {
  /** similar: by title and skills; skills: by skills only; none: too few to say. */
  basis: 'similar' | 'skills' | 'none';
  count: number;
  type: LeadType;
  /** Jobs are monthly pay, gigs are a project budget. */
  period: 'month' | 'project';
  skills: string[];
  usd?: MarketRange;
  rub?: MarketRange;
  examples: Array<{ id: string; title: string; usd: number }>;
}

/** Title words cut to a 6-letter stem, so «логотип» and «логотипа» match. */
function titleTokens(title: string): Set<string> {
  return new Set(
    normalizeForMatch(title)
      .split(/[^a-zа-яё0-9+#]+/i)
      .filter((word) => word.length >= 3 && !STOP_WORDS.has(word) && !/^\d+$/.test(word))
      .map((word) => word.slice(0, 6)),
  );
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 1) return sorted[0]!;
  const pos = (sorted.length - 1) * q;
  const lower = Math.floor(pos);
  const upper = Math.ceil(pos);
  return sorted[lower]! + (sorted[upper]! - sorted[lower]!) * (pos - lower);
}

function roundRub(value: number): number {
  const step = value >= 10_000 ? 1_000 : 100;
  return Math.max(step, Math.round(value / step) * step);
}

/**
 * Typical pay for work like the query, from leads that carry a budget: the 25th, 50th
 * and 75th percentile of the most similar ones (shared title words and skills), in the
 * language of the query. With too few of them it says so rather than guess. Leads are
 * expected pre-filtered to one type.
 */
export function estimateMarket(query: MarketQuery, leads: Lead[]): MarketEstimate {
  const words = titleTokens(query.title);
  const skills = Array.from(
    new Set([...(query.skills ?? []), ...extractTechSkills(query.title)].map((s) => s.trim()).filter(Boolean)),
  ).slice(0, 12);
  const wanted = new Set(skills.map((s) => s.toLowerCase()));

  const cyrillic = (title: string): boolean => /[а-яё]/i.test(title);
  const priced = leads
    .filter((lead) => (lead.type ?? 'gig') === query.type && !salaryLooksWrong(lead) && cyrillic(lead.title) === cyrillic(query.title))
    .map((lead) => {
      let usd = budgetUsd(lead);
      if (usd !== undefined && query.type === 'job' && lead.paymentPeriod === 'hourly' && usd <= 300) {
        usd = Math.round(usd * 168);
      }
      return { lead, usd };
    })
    .filter((item): item is { lead: Lead; usd: number } => {
      if (typeof item.usd !== 'number' || !Number.isFinite(item.usd) || item.usd <= 0) return false;
      if (query.type === 'job' && item.usd < 300) return false;
      return true;
    });

  const scored = priced.map((item) => {
    const other = titleTokens(item.lead.title);
    let shared = 0;
    for (const word of words) if (other.has(word)) shared += 1;
    // Share of the query's words found in the lead title: long titles are not penalised.
    const titleSim = words.size ? shared / words.size : 0;
    const jaccard = words.size && other.size ? shared / (words.size + other.size - shared) : 0;
    const leadSkills = (item.lead.skills?.length ? item.lead.skills : extractTechSkills(item.lead.title)).map((s) => s.toLowerCase());
    const skillHits = leadSkills.filter((s) => wanted.has(s)).length;
    const skillSim = wanted.size ? skillHits / wanted.size : 0;
    return { ...item, titleSim, skillSim, sim: titleSim * 2 + skillSim + jaccard };
  });

  const similar = scored.filter((item) => item.titleSim >= 0.5 || item.skillSim >= 0.5);
  const bySkills = scored.filter((item) => item.skillSim > 0);
  const [basis, pool] =
    similar.length >= MIN_SAMPLES
      ? (['similar', similar] as const)
      : bySkills.length >= MIN_SAMPLES
        ? (['skills', bySkills] as const)
        : (['none', []] as const);

  const picked = [...pool].sort((a, b) => b.sim - a.sim || b.lead.createdAt.localeCompare(a.lead.createdAt)).slice(0, MAX_SAMPLES);
  const base: MarketEstimate = {
    basis,
    count: picked.length,
    type: query.type,
    period: query.type === 'job' ? 'month' : 'project',
    skills,
    examples: picked.slice(0, 3).map((item) => ({ id: item.lead.id, title: item.lead.title, usd: Math.round(item.usd) })),
  };
  if (!picked.length) return base;

  const values = picked.map((item) => item.usd).sort((a, b) => a - b);
  const usd = { p25: quantile(values, 0.25), median: quantile(values, 0.5), p75: quantile(values, 0.75) };
  return {
    ...base,
    usd: { p25: Math.round(usd.p25), median: Math.round(usd.median), p75: Math.round(usd.p75) },
    rub: { p25: roundRub(usd.p25 * RUB_PER_USD), median: roundRub(usd.median * RUB_PER_USD), p75: roundRub(usd.p75 * RUB_PER_USD) },
  };
}

const AI_SKILLS = new Set([
  'ai / ml', 'ai', 'ml', 'llm', 'openai', 'langchain', 'pytorch', 'tensorflow', 'rag', 'nlp', 'computer vision',
]);

/**
 * Broad role-umbrella tags assigned by dictionary categories: these duplicate `directions`
 * (sales, backend, marketing, qa, support, etc.), so `trending_skills` focuses on concrete
 * technologies, tools, and stack skills.
 */
const UMBRELLA_CATEGORY_TAGS = new Set([
  'продажи', 'разработка', 'аналитика', 'маркетинг', 'дизайн', 'тестирование', 'техподдержка',
  'поддержка', 'бухгалтерия', 'юриспруденция', 'обучение', 'фото', 'видеомонтаж', 'тексты', 'переводы',
  'администрирование', 'контент', 'инфобез', 'sales', 'development', 'analytics', 'marketing',
  'design', 'qa', 'tech support', 'support', 'customer support', 'sysadmin', 'content', 'security', 'it', 'engineering',
  'software development', 'system and network administration',
]);

const IT_DIRECTIONS = new Set([
  'ai', '1c', 'security', 'qa', 'devops', 'architect', 'sysadmin', 'data-engineer',
  'analyst-system', 'analyst-business', 'analyst-data', 'ml', 'product', 'project',
  'gamedev', 'mobile', 'fullstack', 'frontend', 'embedded', 'backend', 'web', 'bots',
  'parsing', 'dev-other',
]);

export interface PaySummary {
  count: number;
  usd?: MarketRange;
  rub?: MarketRange;
}

export interface MarketInsights {
  window_days: number;
  total_leads: number;
  it_leads?: number;
  it_share_pct?: number;
  trending_skills: Array<{ name: string; count: number; share_pct: number }>;
  directions: Array<{ direction: string; count: number; share_pct: number }>;
  occupations: Array<{ code: string; label: string; count: number; share_pct: number }>;
  workplace: {
    remote: number;
    hybrid: number;
    onsite: number;
    remote_share_pct: number;
  };
  salary_percentiles: {
    job: PaySummary;
    gig: PaySummary;
  };
  ai_exposure: {
    count: number;
    share_pct: number;
  };
}

function paySummaryFor(leads: Lead[], type: LeadType): PaySummary {
  const values = leads
    .filter((l) => (l.type ?? 'gig') === type && !salaryLooksWrong(l))
    .map((l) => {
      let usd = budgetUsd(l);
      if (usd !== undefined && type === 'job' && l.paymentPeriod === 'hourly' && usd <= 300) {
        usd = Math.round(usd * 168);
      }
      return usd;
    })
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v) && v > (type === 'job' ? 299 : 0))
    .sort((a, b) => a - b);

  if (values.length < MIN_SAMPLES) return { count: values.length };
  const p25 = quantile(values, 0.25);
  const median = quantile(values, 0.5);
  const p75 = quantile(values, 0.75);
  return {
    count: values.length,
    usd: { p25: Math.round(p25), median: Math.round(median), p75: Math.round(p75) },
    rub: { p25: roundRub(p25 * RUB_PER_USD), median: roundRub(median * RUB_PER_USD), p75: roundRub(p75 * RUB_PER_USD) },
  };
}

/**
 * Aggregate market insights over guest-visible leads: trending skills, role
 * directions, workplace breakdown (remote/hybrid/onsite), pay percentiles, and AI exposure.
 */
export function computeInsights(leads: Lead[], windowDays: number = 30): MarketInsights {
  const total = leads.length;
  const pct = (n: number): number => (total > 0 ? Math.round((n / total) * 1000) / 10 : 0);

  const skillCounts = new Map<string, number>();
  const dirCounts = new Map<string, number>();
  const iscoCounts = new Map<string, { label: string; count: number }>();
  let remote = 0;
  let hybrid = 0;
  let onsite = 0;
  let aiCount = 0;
  let itCount = 0;

  for (const lead of leads) {
    const gigRemote = (lead.type ?? 'gig') === 'gig' && (!lead.city || /^(?:онлайн|удал)/i.test(lead.city)) && lead.workplaceType !== 'hybrid';
    const wp = lead.workplaceType === 'hybrid' ? 'hybrid' : (lead.isRemote || gigRemote || lead.workplaceType === 'remote' ? 'remote' : 'onsite');
    if (wp === 'remote') remote++;
    else if (wp === 'hybrid') hybrid++;
    else onsite++;

    const physicalNoise = isPhysicalNonItWork(lead.title, lead.text);
    const rawDir = physicalNoise
      ? 'other'
      : (lead.direction && lead.direction !== 'other' ? lead.direction : classifyRole(lead.type ?? 'job', lead.title));
    if (rawDir && rawDir !== 'other') {
      dirCounts.set(rawDir, (dirCounts.get(rawDir) ?? 0) + 1);
      if (IT_DIRECTIONS.has(rawDir)) itCount++;
    }

    if (!physicalNoise) {
      const isco = classifyIsco08(lead);
      if (isco) {
        const prev = iscoCounts.get(isco.code);
        iscoCounts.set(isco.code, { label: isco.label, count: (prev?.count ?? 0) + 1 });
      }
    }

    const skills = lead.skills ?? [];
    for (const s of skills) {
      if (UMBRELLA_CATEGORY_TAGS.has(s.trim().toLowerCase())) continue;
      skillCounts.set(s, (skillCounts.get(s) ?? 0) + 1);
    }

    const hasAiSkill = skills.some((s) => AI_SKILLS.has(s.toLowerCase()));
    if (lead.direction === 'ai' || hasAiSkill || /\b(llm|gpt|openai|claude|rag|machine learning|нейросет)\b/i.test(lead.title)) {
      aiCount++;
    }
  }

  const trending_skills = [...skillCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 15)
    .map(([name, count]) => ({ name, count, share_pct: pct(count) }));

  const directions = [...dirCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([direction, count]) => ({ direction, count, share_pct: pct(count) }));

  const occupations = [...iscoCounts.entries()]
    .sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0]))
    .map(([code, { label, count }]) => ({ code, label, count, share_pct: pct(count) }));

  return {
    window_days: windowDays,
    total_leads: total,
    it_leads: itCount,
    it_share_pct: pct(itCount),
    trending_skills,
    directions,
    occupations,
    workplace: {
      remote,
      hybrid,
      onsite,
      remote_share_pct: pct(remote),
    },
    salary_percentiles: {
      job: paySummaryFor(leads, 'job'),
      gig: paySummaryFor(leads, 'gig'),
    },
    ai_exposure: {
      count: aiCount,
      share_pct: pct(aiCount),
    },
  };
}
