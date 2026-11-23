import { extractSkills } from '../core/text.ts';
import type { SavedFilters } from '../core/subscriptions.ts';
import type { Lead } from '../core/types.ts';
import { budgetStepsFor, matchesSavedFilters } from './filters.ts';

/** How long one fetched recent window (and every count derived from it) stays fresh. */
export const POPULAR_TTL_MS = 10 * 60_000;
/** Hard cap on cached skill lists (one per filter combination); least recently used go first. */
export const POPULAR_MAX_KEYS = 64;

/**
 * Snaps a user-supplied budget floor down to the nearest offered filter step, so the cache key
 * space stays tiny: any integer up to 1e8 maps to one of at most four steps (or none).
 */
export function budgetBucket(budgetRub: number | undefined, type: 'job' | 'gig' | undefined): number | undefined {
  if (!budgetRub || !Number.isFinite(budgetRub) || budgetRub <= 0) return undefined;
  let bucket: number | undefined;
  for (const step of budgetStepsFor(type)) if (budgetRub >= step) bucket = step;
  return bucket;
}

interface RecentWindow {
  at: number;
  leads: Array<{ lead: Lead; skills: string[] }>;
}

/**
 * Popular skills and directions over the recent leads. One fetch of the recent window per TTL
 * is shared by every filter combination and by the directions count (filtered in memory);
 * concurrent misses share one in-flight fetch; skill lists live in a small LRU.
 */
export function createPopularCounters(options: {
  loadRecent: () => Promise<Lead[]>;
  loadDirections?: () => Promise<Map<string, number>>;
  loadGrades?: () => Promise<Map<string, number>>;
  loadTopSkills?: () => Promise<Array<{ name: string; count: number }>>;
  now?: () => number;
  ttlMs?: number;
  maxKeys?: number;
}) {
  const now = options.now ?? Date.now;
  const ttlMs = options.ttlMs ?? POPULAR_TTL_MS;
  const maxKeys = options.maxKeys ?? POPULAR_MAX_KEYS;
  let window: { at: number; promise: Promise<RecentWindow> } | undefined;
  const skillCache = new Map<string, { at: number; promise: Promise<Array<{ name: string; count: number }>> }>();
  let directionCache: { at: number; promise: Promise<Map<string, number>> } | undefined;
  let gradeCache: { at: number; promise: Promise<Map<string, number>> } | undefined;
  let topSkillsCache: { at: number; promise: Promise<Array<{ name: string; count: number }>> } | undefined;

  const getTopSkills = (): Promise<Array<{ name: string; count: number }>> => {
    if (topSkillsCache && now() - topSkillsCache.at < ttlMs) return topSkillsCache.promise;
    const at = now();
    const promise = options.loadTopSkills!();
    topSkillsCache = { at, promise };
    promise.catch(() => { if (topSkillsCache?.promise === promise) topSkillsCache = undefined; });
    return promise;
  };

  const recent = (): Promise<RecentWindow> => {
    if (window && now() - window.at < ttlMs) return window.promise;
    const at = now();
    const promise = options.loadRecent().then((leads) => ({
      at,
      leads: leads.map((lead) => ({ lead, skills: lead.skills?.length ? lead.skills : extractSkills(lead.title, lead.text) })),
    }));
    window = { at, promise };
    // A failed fetch must not stick for the whole TTL.
    promise.catch(() => { if (window?.promise === promise) window = undefined; });
    return promise;
  };

  const popularSkills = (filters: SavedFilters): Promise<Array<{ name: string; count: number }>> => {
    const type = filters.type === 'job' || filters.type === 'gig' ? filters.type : undefined;
    const scope: SavedFilters = { type, it: filters.it, remote: filters.remote, language: filters.language, budgetRub: budgetBucket(filters.budgetRub, type) };
    const hasNarrowFilters = Boolean(scope.it || scope.remote || scope.budgetRub);

    if (!hasNarrowFilters && options.loadTopSkills) {
      return getTopSkills();
    }

    const key = [scope.type ?? '', scope.it ? '1' : '0', scope.remote ? '1' : '0', scope.language ?? '', scope.budgetRub ?? ''].join('|');
    const cached = skillCache.get(key);
    if (cached && now() - cached.at < ttlMs) {
      skillCache.delete(key);
      skillCache.set(key, cached); // LRU touch
      return cached.promise;
    }
    const promise = recent().then(({ leads }) => {
      const counts = new Map<string, number>();
      for (const { lead, skills } of leads) {
        if (!matchesSavedFilters(lead, scope)) continue;
        for (const skill of skills) counts.set(skill, (counts.get(skill) ?? 0) + 1);
      }
      return [...counts.entries()]
        .filter(([, count]) => count >= 2)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 30)
        .map(([name, count]) => ({ name, count }));
    });
    skillCache.delete(key);
    skillCache.set(key, { at: now(), promise });
    promise.catch(() => { if (skillCache.get(key)?.promise === promise) skillCache.delete(key); });
    while (skillCache.size > maxKeys) {
      const oldest = skillCache.keys().next().value;
      if (oldest === undefined) break;
      skillCache.delete(oldest);
    }
    return promise;
  };

  /** Lead counts per `direction`: uses `loadDirections` when supplied, else counts over recent window. */
  const directionCounts = (): Promise<Map<string, number>> => {
    if (directionCache && now() - directionCache.at < ttlMs) return directionCache.promise;
    const at = now();
    const promise = options.loadDirections
      ? options.loadDirections()
      : recent().then(({ leads }) => {
          const counts = new Map<string, number>();
          for (const { lead } of leads) if (lead.direction) counts.set(lead.direction, (counts.get(lead.direction) ?? 0) + 1);
          return counts;
        });
    const entry = { at, promise };
    directionCache = entry;
    promise.catch(() => { if (directionCache === entry) directionCache = undefined; });
    return promise;
  };

  /** Lead counts per `grade`: uses `loadGrades` when supplied, else counts over recent window. */
  const gradeCounts = (): Promise<Map<string, number>> => {
    if (gradeCache && now() - gradeCache.at < ttlMs) return gradeCache.promise;
    const at = now();
    const promise = options.loadGrades
      ? options.loadGrades()
      : recent().then(({ leads }) => {
          const counts = new Map<string, number>();
          for (const { lead } of leads) if (lead.grade) counts.set(lead.grade, (counts.get(lead.grade) ?? 0) + 1);
          return counts;
        });
    const entry = { at, promise };
    gradeCache = entry;
    promise.catch(() => { if (gradeCache === entry) gradeCache = undefined; });
    return promise;
  };

  return { popularSkills, directionCounts, gradeCounts, get cachedSkillKeys(): number { return skillCache.size; } };
}
