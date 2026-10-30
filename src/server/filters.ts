import type { Context } from 'hono';
import { rubToUsd } from '../core/salary.ts';
import type { LeadSort, ListLeadsOptions } from '../core/store.ts';

/**
 * Ordering by score or budget looks at the last week only: over all history the
 * best leads of last month would stay on top forever.
 */
export const RANKED_WINDOW_MS = 7 * 24 * 3600 * 1000;

/** Budget thresholds offered in the feed filter, in roubles. */
export const BUDGET_STEPS_RUB = [5_000, 20_000, 50_000, 100_000] as const;

/** Feed filters as they appear in the query string: ?sort=score&remote=1&budget=20000&skill=Python */
export interface FeedFilters {
  sort: LeadSort;
  remote: boolean;
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
    budgetRub: Number.isFinite(budget) && budget > 0 ? Math.min(Math.round(budget), 100_000_000) : undefined,
    skill: skill || undefined,
    defaultSort,
    defaultLanguage,
  };
}

export function filterOptions(filters: FeedFilters, now: Date = new Date()): ListLeadsOptions {
  return {
    sort: filters.sort,
    remote: filters.remote || undefined,
    minBudgetUsd: filters.budgetRub ? rubToUsd(filters.budgetRub) : undefined,
    skill: filters.skill,
    language: filters.language,
    createdAfter: filters.sort === 'new' ? undefined : new Date(now.getTime() - RANKED_WINDOW_MS).toISOString(),
  };
}

/** How many filters differ from the default view. */
export function activeFilterCount(filters: FeedFilters): number {
  return [filters.sort !== (filters.defaultSort ?? 'new'), filters.remote, Boolean(filters.budgetRub), Boolean(filters.skill), filters.language !== filters.defaultLanguage]
    .filter(Boolean).length;
}

/** True when any filter differs from the default view. */
export function hasActiveFilters(filters: FeedFilters): boolean {
  return activeFilterCount(filters) > 0;
}
