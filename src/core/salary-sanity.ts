import { budgetUsd, rubToUsd } from './salary.ts';
import type { Lead } from './types.ts';

/**
 * A vacancy's monthly pay that no full-time job has. Boards let employers type anything into
 * the salary field: hh.ru "project work" ads put a lesson or a task rate into "monthly income"
 * (a physics teacher "from 500 to 700 ₽", an HR director "20 000 ₽"). Such numbers are kept but
 * not shown as a salary in the feed: next to real pay they make the whole feed look broken.
 */
export const SALARY_FLOOR_RUB = 15_000;

/** A vacancy paying less than this share of the median for its role is flagged too. */
export const SALARY_MEDIAN_SHARE = 0.3;

/** Fewer vacancies than this give no median: one odd ad would set the bar. */
export const SALARY_MEDIAN_MIN_SAMPLE = 20;

/** Median monthly pay in USD by role key; `*` holds the median of all vacancies. */
export type SalaryMedians = ReadonlyMap<string, number>;

type SalaryLead = Pick<Lead, 'type' | 'paymentPeriod' | 'budget' | 'currency' | 'normalizedUsdMin' | 'normalizedUsdMax' | 'category' | 'skills'>;

/** The group a vacancy's pay is compared with: its category, else its first skill. */
export function salaryRoleKey(lead: Pick<Lead, 'category' | 'skills'>): string | undefined {
  const key = lead.category?.trim() || lead.skills?.[0]?.trim();
  return key ? key.toLowerCase() : undefined;
}

/** Monthly pay of a vacancy in USD, or undefined when it is hourly, per project or unknown. */
function monthlyUsd(lead: SalaryLead): number | undefined {
  if (lead.type !== 'job' || (lead.paymentPeriod ?? 'monthly') !== 'monthly') return undefined;
  return budgetUsd(lead);
}

/** Medians of monthly vacancy pay by role, from recent leads. */
export function computeSalaryMedians(leads: SalaryLead[]): SalaryMedians {
  const groups = new Map<string, number[]>([['*', []]]);
  for (const lead of leads) {
    const usd = monthlyUsd(lead);
    // Pay under the floor would drag the median down to the very ads it should catch.
    if (usd === undefined || usd < rubToUsd(SALARY_FLOOR_RUB)) continue;
    groups.get('*')!.push(usd);
    const key = salaryRoleKey(lead);
    if (key) groups.set(key, [...(groups.get(key) ?? []), usd]);
  }
  const medians = new Map<string, number>();
  for (const [key, values] of groups) {
    if (values.length < SALARY_MEDIAN_MIN_SAMPLE) continue;
    const sorted = values.sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    medians.set(key, sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2);
  }
  return medians;
}

let currentMedians: SalaryMedians = new Map();

/** Replaces the medians the feed compares with; the server refreshes them on a timer. */
export function setSalaryMedians(medians: SalaryMedians): void {
  currentMedians = medians;
}

/** True when a vacancy's monthly pay is below the floor or far below the median for its role. */
export function salaryLooksWrong(lead: SalaryLead, medians: SalaryMedians = currentMedians): boolean {
  const usd = monthlyUsd(lead);
  if (usd === undefined) return false;
  if (usd < rubToUsd(SALARY_FLOOR_RUB)) return true;
  const key = salaryRoleKey(lead);
  const median = (key && medians.get(key)) || medians.get('*');
  return median !== undefined && usd < median * SALARY_MEDIAN_SHARE;
}
