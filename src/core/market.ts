import { budgetUsd } from './salary.ts';
import { extractTechSkills, normalizeForMatch } from './text.ts';
import type { Lead, LeadType } from './types.ts';

/** Reference rate for showing USD-normalised money in roubles (FX_TO_USD.RUB in salary.ts). */
const RUB_PER_USD = 92;

/** Words that say nothing about the kind of work: «требуется», «разработка», seniority. */
const STOP_WORDS = new Set([
  'требуется', 'требуются', 'нужен', 'нужна', 'нужно', 'ищу', 'ищем', 'для', 'под', 'ключ', 'над', 'при',
  'работа', 'работы', 'вакансия', 'заказ', 'проект', 'проекта', 'задача', 'разработка', 'разработать',
  'сделать', 'создание', 'создать', 'настройка', 'доработка', 'удаленно', 'удалённо', 'москва', 'офис',
  'the', 'and', 'for', 'with', 'remote', 'senior', 'middle', 'junior', 'lead', 'ведущий', 'старший',
  'младший', 'главный', 'специалист', 'менеджер', 'сайт', 'сайта', 'сайте', 'сайты', 'нужна', 'помощь',
  'developer', 'engineer', 'разработчик', 'разработчика', 'программист', 'инженер',
]);

/** Fewer similar leads than this, and the estimate falls back to a wider basis. */
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
  /** similar: by title and skills; skills: by skills only; type: all leads of this type. */
  basis: 'similar' | 'skills' | 'type' | 'none';
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
 * and 75th percentile of the most similar ones (shared title words and skills), with a
 * wider basis when there are too few. Leads are expected pre-filtered to one type.
 */
export function estimateMarket(query: MarketQuery, leads: Lead[]): MarketEstimate {
  const words = titleTokens(query.title);
  const skills = Array.from(
    new Set([...(query.skills ?? []), ...extractTechSkills(query.title)].map((s) => s.trim()).filter(Boolean)),
  ).slice(0, 12);
  const wanted = new Set(skills.map((s) => s.toLowerCase()));

  const priced = leads
    .filter((lead) => (lead.type ?? 'gig') === query.type)
    .map((lead) => ({ lead, usd: budgetUsd(lead) }))
    .filter((item): item is { lead: Lead; usd: number } => typeof item.usd === 'number' && item.usd > 0);

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
        : scored.length >= MIN_SAMPLES
          ? (['type', scored] as const)
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
