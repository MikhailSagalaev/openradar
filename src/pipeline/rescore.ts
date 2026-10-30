import { prepareRawLead } from '../core/prepare.ts';
import { assessQuality, qualityFlagsOf } from '../core/quality.ts';
import { scoreLead } from '../core/rules.ts';
import type { Store } from '../core/store.ts';
import type { Lead, SourceRecord } from '../core/types.ts';

/** Leads read per store call: the stores cap a listing at 5000. */
const RESCORE_PAGE = 5000;

export interface RescoreSummary {
  checked: number;
  changed: number;
  /** Leads whose type or quality flags changed. */
  requalified: number;
}

/**
 * Recomputes the base score of stored leads with the current scoreLead() and keeps the
 * community vote adjustment. Each lead is scored as of its own ingest time, the same
 * way the pipeline scored it, so only the formula changes. The quality stage runs again
 * too: a lead gets the type and flags today's rules give it, and the flags' penalty.
 */
export async function rescoreLeads(
  store: Store,
  options: { limit?: number; days?: number; now?: Date; pageSize?: number } = {},
): Promise<RescoreSummary> {
  if (!store.updateLeadScore) return { checked: 0, changed: 0, requalified: 0 };
  const now = options.now ?? new Date();
  const limit = options.limit ?? 5000;
  const createdAfter = options.days ? new Date(now.getTime() - options.days * 24 * 3600 * 1000).toISOString() : undefined;
  // The store returns at most 5000 leads a call; a long window is read page by page, newest first.
  const leads: Lead[] = [];
  while (leads.length < limit) {
    const want = Math.min(options.pageSize ?? RESCORE_PAGE, limit - leads.length);
    const page = await store.listLeads({ limit: want, createdAfter, offset: leads.length });
    leads.push(...page);
    if (page.length < want) break;
  }
  const sources = new Map<string, SourceRecord | null>();
  let changed = 0;
  let requalified = 0;

  for (const lead of leads) {
    if (!sources.has(lead.sourceId)) sources.set(lead.sourceId, await store.getSource(lead.sourceId));
    const source = sources.get(lead.sourceId);
    if (!source) continue;
    const ingestedAt = new Date(lead.createdAt);
    const prepared = prepareRawLead(
      {
        sourceId: lead.sourceId,
        type: lead.type,
        url: lead.url,
        title: lead.title,
        text: lead.text,
        author: lead.author,
        city: lead.city,
        budget: lead.budget,
        currency: lead.currency,
        rawSalary: lead.rawSalary,
        skills: lead.skills,
        publishedAt: lead.publishedAt,
        contacts: lead.contacts,
      },
      source,
      ingestedAt,
    );
    const quality = assessQuality({ type: prepared.type ?? 'gig', title: lead.title, text: lead.text, budget: lead.budget }, source);
    prepared.type = quality.type;
    const before = qualityFlagsOf(lead);
    if (store.updateLeadQuality && (quality.type !== (lead.type ?? 'gig') || before.join() !== quality.flags.join())) {
      await store.updateLeadQuality(lead.id, quality.type, quality.flags);
      requalified += 1;
    }
    const base = Math.max(0, scoreLead(prepared, source, ingestedAt) - quality.penalty);
    const score = await store.updateLeadScore(lead.id, base);
    if (score !== undefined && score !== lead.score) changed += 1;
  }
  return { checked: leads.length, changed, requalified };
}
