import { auditSpamReasons, spamReasons } from '../core/rules.ts';
import type { Store } from '../core/store.ts';

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
 * By default only the exact patterns added by the 2026-11 audit are tested (auditSpamReasons);
 * pass all: true to re-run every spam category. This keeps the pass from retroactively rejecting
 * legitimate vacancies that an older, broader rule now matches.
 */
export async function refilterLeads(
  store: Store,
  options: { days?: number; limit?: number; apply?: boolean; now?: Date; pageSize?: number; all?: boolean } = {},
): Promise<RefilterSummary> {
  const now = options.now ?? new Date();
  const limit = options.limit ?? 50_000;
  const days = options.days ?? 30;
  const createdAfter = new Date(now.getTime() - days * 24 * 3600 * 1000).toISOString();
  // Walk the window newest first by date, processing each page as it arrives so a long window
  // never holds every lead in memory (a 30-day pass over hundreds of thousands of posts would
  // otherwise exhaust the heap). Only seen ids are retained, to skip the repeats a shared
  // created_at instant can produce at a page edge; a page of nothing but repeats widens.
  let pageSize = options.pageSize ?? REFILTER_PAGE;
  const seen = new Set<string>();
  let createdBefore: string | undefined;
  let checked = 0;
  let matched = 0;
  let rejected = 0;
  const samples: RefilterSummary['samples'] = [];
  while (checked < limit) {
    const page = await store.listLeads({ limit: pageSize, createdAfter, createdBefore });
    if (page.length === 0) break;
    const before = seen.size;
    for (const lead of page) {
      if (seen.has(lead.id)) continue;
      seen.add(lead.id);
      checked += 1;
      if (lead.status !== 'rejected') {
        const reasons = options.all
          ? spamReasons(lead.title, lead.text, lead.currency)
          : auditSpamReasons(lead.title, lead.text);
        if (reasons.length > 0) {
          matched += 1;
          if (samples.length < 25) samples.push({ id: lead.id, title: lead.title, reasons });
          if (options.apply && store.updateLeadStatusAndReasons) {
            await store.updateLeadStatusAndReasons(lead.id, 'rejected', reasons);
            rejected += 1;
          }
        }
      }
      if (checked >= limit) break;
    }
    if (page.length < pageSize || checked >= limit) break;
    if (seen.size === before) {
      if (pageSize >= REFILTER_PAGE) throw new Error(`More than ${REFILTER_PAGE} leads at ${createdBefore}: cannot walk past them`);
      pageSize = Math.min(pageSize * 2, REFILTER_PAGE);
      continue;
    }
    createdBefore = new Date(Date.parse(page.at(-1)!.createdAt) + 1).toISOString();
  }
  return { checked, matched, rejected, samples };
}
