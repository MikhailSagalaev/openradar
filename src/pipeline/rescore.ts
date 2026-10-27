import { prepareRawLead } from '../core/prepare.ts';
import { scoreLead } from '../core/rules.ts';
import type { Store } from '../core/store.ts';
import type { SourceRecord } from '../core/types.ts';

export interface RescoreSummary {
  checked: number;
  changed: number;
}

/**
 * Recomputes the base score of stored leads with the current scoreLead() and keeps the
 * community vote adjustment. Each lead is scored as of its own ingest time, the same
 * way the pipeline scored it, so only the formula changes.
 */
export async function rescoreLeads(store: Store, options: { limit?: number } = {}): Promise<RescoreSummary> {
  if (!store.updateLeadScore) return { checked: 0, changed: 0 };
  const leads = await store.listLeads({ limit: options.limit ?? 5000 });
  const sources = new Map<string, SourceRecord | null>();
  let changed = 0;

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
    const score = await store.updateLeadScore(lead.id, scoreLead(prepared, source, ingestedAt));
    if (score !== undefined && score !== lead.score) changed += 1;
  }
  return { checked: leads.length, changed };
}
