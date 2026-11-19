import { AUDIT_2026_11_REASONS, spamReasons } from '../core/rules.ts';
import type { Store } from '../core/store.ts';
import type { Lead } from '../core/types.ts';

/** Leads read per store call: the stores cap a listing at 5000. */
const REFILTER_PAGE = 5000;

export interface RefilterSummary {
  checked: number;
  /** Visible leads the current spam patterns now reject. */
  matched: number;
  /** Leads actually rejected (only with the apply option). */
  rejected: number;
  /** A sample of the matches, for reviewing a dry run before applying. */
  samples: Array<{ id: string; title: string; reasons: string[] }>;
}

/**
 * Re-runs the door spam patterns over stored, still-visible leads and rejects the ones a
 * tightened pattern now catches (the mass-messaging typo and social-account recovery added
 * after the 2026-11 quality audit). Only spam categories are re-checked — not a source's
 * keyword/budget/age gates, which are ingest-time decisions and would wrongly reject every
 * old lead. Dry run by default: it reports matches and a sample; apply rejects them. Already
 * rejected leads are left alone, and nothing is ever restored. The store's listing hides
 * archived rows, so the pass only touches what a reader can still see.
 *
 * By default only the categories tightened by the 2026-11 audit are acted on (onlyReasons);
 * pass onlyReasons: undefined to re-run every spam category. This keeps the pass from
 * retroactively rejecting legitimate vacancies that an older, broader rule now matches.
 */
export async function refilterLeads(
  store: Store,
  options: { days?: number; limit?: number; apply?: boolean; now?: Date; pageSize?: number; onlyReasons?: string[] | null } = {},
): Promise<RefilterSummary> {
  const onlyReasons = options.onlyReasons === undefined ? AUDIT_2026_11_REASONS : options.onlyReasons;
  const now = options.now ?? new Date();
  const limit = options.limit ?? 50_000;
  const days = options.days ?? 30;
  const createdAfter = new Date(now.getTime() - days * 24 * 3600 * 1000).toISOString();
  // Walk the window newest first by date, the same way rescore does: the store caps a page
  // at 5000 and an offset at 10 000, so a long window is walked by createdBefore, skipping
  // repeats by id. A page of nothing but repeats widens until it gets past a shared instant.
  let pageSize = options.pageSize ?? REFILTER_PAGE;
  const byId = new Map<string, Lead>();
  let createdBefore: string | undefined;
  while (byId.size < limit) {
    const page = await store.listLeads({ limit: pageSize, createdAfter, createdBefore });
    const known = byId.size;
    for (const lead of page) byId.set(lead.id, lead);
    if (page.length < pageSize) break;
    if (byId.size === known) {
      if (pageSize >= REFILTER_PAGE) throw new Error(`More than ${REFILTER_PAGE} leads at ${createdBefore}: cannot walk past them`);
      pageSize = Math.min(pageSize * 2, REFILTER_PAGE);
      continue;
    }
    createdBefore = new Date(Date.parse(page.at(-1)!.createdAt) + 1).toISOString();
  }
  const leads = [...byId.values()].slice(0, limit);
  let matched = 0;
  let rejected = 0;
  const samples: RefilterSummary['samples'] = [];
  for (const lead of leads) {
    if (lead.status === 'rejected') continue;
    const reasons = spamReasons(lead.title, lead.text, lead.currency);
    if (reasons.length === 0) continue;
    if (onlyReasons && !reasons.some((r) => onlyReasons.includes(r))) continue;
    matched += 1;
    if (samples.length < 25) samples.push({ id: lead.id, title: lead.title, reasons });
    if (options.apply && store.updateLeadStatusAndReasons) {
      await store.updateLeadStatusAndReasons(lead.id, 'rejected', reasons);
      rejected += 1;
    }
  }
  return { checked: leads.length, matched, rejected, samples };
}
