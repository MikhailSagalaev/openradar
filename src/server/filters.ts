import type { Context } from 'hono';
import { rubToUsd } from '../core/salary.ts';
import type { SavedFilters } from '../core/subscriptions.ts';
import type { Lead } from '../core/types.ts';
import type { LeadSort, ListLeadsOptions } from '../core/store.ts';

/**
 * Ordering by score or budget looks at the last week only: over all history the
 * best leads of last month would stay on top forever.
 */
export const RANKED_WINDOW_MS = 7 * 24 * 3600 * 1000;

/** Budget thresholds offered in the feed filter, in roubles. */
export const BUDGET_STEPS_RUB = [5_000, 20_000, 50_000, 100_000] as const;

/**
 * Skills that make a lead IT work for the «IT» chip: development, data, DevOps, 1C, site
 * builders, bots, and the English categories of company boards. Design and «Нейросети» are left
 * out: in posts they are mostly content work.
 */
export const IT_SKILLS = [
  '1С', 'Python', 'JavaScript', 'TypeScript', 'React', 'Vue', 'Node.js', 'PHP', 'Golang', 'Java', 'Kotlin',
  'Swift', 'C++', 'C#', '.NET', 'Django', 'Laravel', 'WordPress', 'WooCommerce', 'Битрикс', 'OpenCart', 'Tilda',
  'SQL', 'PostgreSQL', 'MySQL', 'MongoDB', 'Docker', 'Flutter', 'Unity', 'Telegram Bot',
  'IT', 'Engineering', 'Software Development', 'System and Network Administration',
] as const;

/** Feed filters as they appear in the query string: ?sort=score&remote=1&it=1&budget=20000&skill=Python */
export interface FeedFilters {
  sort: LeadSort;
  remote: boolean;
  /** Only IT work (IT_SKILLS). */
  it?: boolean;
  budgetRub?: number;
  skill?: string;
  language?: 'ru' | 'en';
  /** The order this page shows without ?sort: the home feed ranks, feeds and APIs stay newest first. */
  defaultSort?: LeadSort;
  /** The language this page shows without ?language: the home feed follows the interface, `language=all` lifts it. */
  defaultLanguage?: 'ru' | 'en';
}

export function parseFeedFilters(c: Context, defaultSort: LeadSort = 'new', defaultLanguage?: 'ru' | 'en'): FeedFilters {
  const rawSort = c.req.query('sort');
  const sort: LeadSort = rawSort === 'new' || rawSort === 'score' || rawSort === 'budget' ? rawSort : defaultSort;
  const rawRemote = c.req.query('remote');
  const budget = Number(c.req.query('budget'));
  const skill = (c.req.query('skill') ?? '').trim().slice(0, 40);
  const language = c.req.query('language');
  return {
    language: language === 'ru' || language === 'en' ? language : language === 'all' ? undefined : defaultLanguage,
    sort,
    remote: rawRemote === '1' || rawRemote === 'true',
    it: c.req.query('it') === '1' || c.req.query('it') === 'true',
    budgetRub: Number.isFinite(budget) && budget > 0 ? Math.min(Math.round(budget), 100_000_000) : undefined,
    skill: skill || undefined,
    defaultSort,
    defaultLanguage,
  };
}

/**
 * True when the ranked order looks at the last week only. The default ranked view needs no
 * window: the rating fades with age, and a node whose leads are all older than a week would
 * otherwise open on an empty feed.
 */
export function rankedWindowApplies(filters: FeedFilters): boolean {
  return filters.sort !== 'new' && !(filters.sort === 'score' && filters.defaultSort === 'score');
}

export function filterOptions(filters: FeedFilters, now: Date = new Date()): ListLeadsOptions {
  return {
    sort: filters.sort,
    remote: filters.remote || undefined,
    minBudgetUsd: filters.budgetRub ? rubToUsd(filters.budgetRub) : undefined,
    skill: filters.skill,
    skillsAny: filters.it ? [...IT_SKILLS] : undefined,
    language: filters.language,
    createdAfter: rankedWindowApplies(filters) ? new Date(now.getTime() - RANKED_WINDOW_MS).toISOString() : undefined,
  };
}

/** How many filters differ from the default view. */
export function activeFilterCount(filters: FeedFilters): number {
  return [filters.sort !== (filters.defaultSort ?? 'new'), filters.remote, Boolean(filters.it), Boolean(filters.budgetRub), Boolean(filters.skill), filters.language !== filters.defaultLanguage]
    .filter(Boolean).length;
}

/** True when any filter differs from the default view. */
export function hasActiveFilters(filters: FeedFilters): boolean {
  return activeFilterCount(filters) > 0;
}

/**
 * Whether one lead matches a saved-search filter — the client-side twin of the feed's
 * SQL, used to notify subscribers of closures (the feed itself cannot be re-queried:
 * a closed lead left the active feed). `it` mirrors skillsAny: any skill of the lead
 * in IT_SKILLS; `q` requires every word of it in the title or text.
 */
export function matchesSavedFilters(lead: Lead, filters: SavedFilters): boolean {
  if (filters.type && lead.type !== filters.type) return false;
  if (filters.skill && !(lead.skills ?? []).some((s) => s.toLowerCase() === filters.skill!.toLowerCase())) return false;
  if (filters.it && !(lead.skills ?? []).some((s) => (IT_SKILLS as readonly string[]).some((it) => it.toLowerCase() === s.toLowerCase()))) return false;
  if (filters.remote) {
    const remoteLike = lead.isRemote !== false || /удал[её]нн|remote|онлайн/i.test(`${lead.title} ${lead.city ?? ''}`);
    if (!remoteLike) return false;
  }
  if (filters.budgetRub && (lead.normalizedUsdMax ?? lead.normalizedUsdMin ?? (lead.budget ? rubToUsd(lead.budget) : 0)) < rubToUsd(filters.budgetRub)) return false;
  if (filters.language) {
    const cyrillic = /[А-Яа-яЁё]/.test(lead.title);
    if (cyrillic !== (filters.language === 'ru')) return false;
  }
  if (filters.q) {
    const haystack = `${lead.title} ${lead.text}`.toLowerCase();
    const words = filters.q.toLowerCase().split(/\s+/).filter((w) => w.length >= 2);
    if (words.length && !words.every((w) => haystack.includes(w))) return false;
  }
  return true;
}
