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
}

export function parseFeedFilters(c: Context): FeedFilters {
  const rawSort = c.req.query('sort');
  const sort: LeadSort = rawSort === 'score' || rawSort === 'budget' ? rawSort : 'new';
  const rawRemote = c.req.query('remote');
  const budget = Number(c.req.query('budget'));
  const skill = (c.req.query('skill') ?? '').trim().slice(0, 40);
  const language = c.req.query('language');
  return {
    language: language === 'ru' || language === 'en' ? language : undefined,
    sort,
    remote: rawRemote === '1' || rawRemote === 'true',
    budgetRub: Number.isFinite(budget) && budget > 0 ? Math.min(Math.round(budget), 100_000_000) : undefined,
    skill: skill || undefined,
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
  return [filters.sort !== 'new', filters.remote, Boolean(filters.budgetRub), Boolean(filters.skill), Boolean(filters.language)]
    .filter(Boolean).length;
}

/** True when any filter differs from the default view. */
export function hasActiveFilters(filters: FeedFilters): boolean {
  return activeFilterCount(filters) > 0;
}
