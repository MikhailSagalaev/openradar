import { extractBudgetAndCurrency } from '../core/extract.ts';
import { prepareRawLead } from '../core/prepare.ts';
import { assessQuality, offersNoPay, qualityFlagsOf, type QualityFlag } from '../core/quality.ts';
import { scoreLead } from '../core/rules.ts';
import { normalizeSalary } from '../core/salary.ts';
import type { LeadMoney, Store } from '../core/store.ts';
import { extractTechSkills } from '../core/text.ts';
import type { Lead, LeadType, SourceRecord } from '../core/types.ts';

/** Leads read per store call: the stores cap a listing at 5000. */
const RESCORE_PAGE = 5000;

export interface RescoreSummary {
  checked: number;
  changed: number;
  /** Leads whose type or quality flags changed. */
  requalified: number;
  /** Leads whose pay or skills changed (with the money option). */
  repriced: number;
}

/** Skills the dictionary used to read off a mere mention: kept only if it still finds them. */
const MENTION_SKILLS = new Set(['Авито', 'Маркетплейсы', 'GPT']);

/** The rawSalary normalizeSalary writes itself, as opposed to what a board published. */
const GENERATED_SALARY = /^\d+(?:–\d+)? [A-Z]{3,4}(?: per year)?$/;

/**
 * Pay and skills of a stored lead by today's rules. A budget taken from the text is read
 * again, so a figure that turns out not to be pay goes; a budget from the board's own field
 * stays and only gets today's rates.
 */
function moneyOf(lead: Lead, type: LeadType, flags: QualityFlag[]): LeadMoney {
  const post = `${lead.title}\n${lead.text}`;
  const found = extractTechSkills(post, 12);
  const skills = Array.from(new Set([...(lead.skills ?? []).filter((skill) => !MENTION_SKILLS.has(skill) || found.includes(skill)), ...found]));
  if (offersNoPay(flags)) return { skills };

  const fromText = lead.budget !== undefined && extractBudgetAndCurrency(post, { keepNotPay: true }).budget === lead.budget;
  const read = fromText ? extractBudgetAndCurrency(post) : undefined;
  const budget = fromText ? read!.budget : lead.budget;
  const currency = (fromText ? read!.currency : undefined) ?? lead.currency;
  const generated = GENERATED_SALARY.test(lead.rawSalary ?? '');
  const rawSalary = generated && (fromText || / per year$/.test(lead.rawSalary!)) ? undefined : lead.rawSalary;
  const info = normalizeSalary({ text: post, rawSalary, budget, currency, type });
  if (info.implausible) return { skills };
  return { budget, currency: info.currency, paymentPeriod: info.paymentPeriod, rawSalary: info.rawSalary, normalizedUsdMin: info.normalizedUsdMin, normalizedUsdMax: info.normalizedUsdMax, skills };
}

/**
 * Recomputes the base score of stored leads with the current scoreLead() and keeps the
 * community vote adjustment. Each lead is scored as of its own ingest time, the same
 * way the pipeline scored it, so only the formula changes. The quality stage runs again
 * too: a lead gets the type and flags today's rules give it, and the flags' penalty.
 */
export async function rescoreLeads(
  store: Store,
  options: { limit?: number; days?: number; now?: Date; pageSize?: number; money?: boolean } = {},
): Promise<RescoreSummary> {
  if (!store.updateLeadScore) return { checked: 0, changed: 0, requalified: 0, repriced: 0 };
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
  let repriced = 0;

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
    const quality = assessQuality({ type: prepared.type ?? 'gig', title: lead.title, text: lead.text, budget: lead.budget, channel: lead.sourceRef?.channel }, source);
    prepared.type = quality.type;
    const before = qualityFlagsOf(lead);
    if (store.updateLeadQuality && (quality.type !== (lead.type ?? 'gig') || before.join() !== quality.flags.join())) {
      await store.updateLeadQuality(lead.id, quality.type, quality.flags);
      requalified += 1;
    }
    if (options.money && store.updateLeadMoney) {
      const money = moneyOf(lead, quality.type, quality.flags);
      const same = money.budget === lead.budget && money.normalizedUsdMax === lead.normalizedUsdMax && money.normalizedUsdMin === lead.normalizedUsdMin
        && money.rawSalary === lead.rawSalary && money.skills.join() === (lead.skills ?? []).join();
      if (!same) {
        await store.updateLeadMoney(lead.id, money);
        repriced += 1;
      }
      Object.assign(prepared, { budget: money.budget, rawSalary: money.rawSalary, normalizedUsdMin: money.normalizedUsdMin, normalizedUsdMax: money.normalizedUsdMax, paymentPeriod: money.paymentPeriod });
    }
    const base = Math.max(0, scoreLead(prepared, source, ingestedAt) - quality.penalty);
    const score = await store.updateLeadScore(lead.id, base);
    if (score !== undefined && score !== lead.score) changed += 1;
  }
  return { checked: leads.length, changed, requalified, repriced };
}
