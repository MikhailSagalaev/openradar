import { classifyRole } from '../research/derive.ts';
import { employerOf } from '../core/company.ts';
import { randomUUID } from 'node:crypto';
import { prepareRawLead } from '../core/prepare.ts';
import { applyRules } from '../core/rules.ts';
import { assessQuality, offersNoPay } from '../core/quality.ts';
import { classifyWorkplace, extractSkills } from '../core/text.ts';
import { emitLeadCreated } from '../core/events.ts';
import { estimateJaccardFromSketches } from '../core/fingerprint.ts';
import { companyKeyOf } from '../core/company.ts';
import { SIMILAR_MIN_WORDS, type SimilarIndex } from './similar.ts';
import type {
  Classifier,
  Contact,
  Env,
  Lead,
  Logger,
  RawLead,
  SourceRecord,
} from '../core/types.ts';
import type { Store } from '../core/store.ts';
import type { SinkRegistry } from '../sinks/index.ts';
import type { ServiceMonitor } from '../core/services.ts';

export interface IngestDeps {
  store: Store;
  sinks: SinkRegistry;
  classifier?: Classifier;
  logger: Logger;
  env: Env;
  now?: () => Date;
  fetchImpl?: typeof fetch;
  /** Recent MinHash sketches for merge rule 4 (similar text, no shared contact). */
  similar?: SimilarIndex;
  services?: ServiceMonitor;
}

export type IngestStatus = 'inserted' | 'duplicate' | 'rejected' | 'delivered' | 'failed';

export interface IngestOutcome {
  status: IngestStatus;
  lead?: Lead;
  reasons?: string[];
  error?: string;
}

function duplicateLead(existing: Lead, fingerprint: string): IngestOutcome {
  return {
    status: 'duplicate',
    lead: existing,
    reasons: [`duplicate:${existing.fingerprint === fingerprint ? 'fingerprint' : 'title'}`],
  };
}

function wordCount(text: string): number {
  return text.split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 2).length;
}

/** A vacancy with the same title at the same company within this window is the same vacancy. */
export const TITLE_COMPANY_WINDOW_MS = 30 * 24 * 3600 * 1000;

/**
 * The same vacancy at another address: an aggregator's copy of an ATS page, or the other way
 * round. Generic titles are open at many companies, so the employer has to agree too.
 */
async function findSameVacancy(prepared: { titleKey: string; url?: string; author?: string; text?: string }, now: Date, deps: IngestDeps): Promise<Lead | null> {
  const company = companyKeyOf(prepared);
  if (!company || !deps.store.listRecentByTitleKey) return null;
  const since = new Date(now.getTime() - TITLE_COMPANY_WINDOW_MS).toISOString();
  for (const candidate of await deps.store.listRecentByTitleKey(prepared.titleKey, since, 50)) {
    if (companyKeyOf(candidate) === company) return candidate;
  }
  return null;
}

/** Keeps where else a stored lead was published; a re-read of the same page adds nothing. */
async function recordSighting(outcome: IngestOutcome, url: string | undefined, source: SourceRecord, deps: IngestDeps): Promise<IngestOutcome> {
  const lead = outcome.lead;
  // Another feed seeing the same page matters too: the index counts what its panel feeds saw.
  if (!lead || !url || !deps.store.addLeadSighting || (url === lead.url && source.id === lead.sourceId)) return outcome;
  const method = (outcome.reasons?.[0] ?? 'duplicate:unknown').replace(/^duplicate:/, '');
  try {
    await deps.store.addLeadSighting({ leadId: lead.id, url, sourceId: source.id, method, similarity: 1 });
  } catch (error) {
    deps.logger.warn('sighting not saved', { error: error instanceof Error ? error.message : String(error) });
  }
  return outcome;
}

/** Minimum MinHash similarity for two posts sharing a contact to count as one lead. */
export const CONTACT_MATCH_JACCARD = 0.6;

async function findCrossPost(
  contacts: Contact[],
  minhash: string,
  now: Date,
  deps: IngestDeps,
): Promise<Lead | null> {
  if (!contacts.length || !deps.store.findRecentByContacts) return null;
  const since = new Date(now.getTime() - 14 * 24 * 3600 * 1000).toISOString();
  const candidates = await deps.store.findRecentByContacts(contacts, since, 20);
  for (const candidate of candidates) {
    if (candidate.minhash_sketch && estimateJaccardFromSketches(minhash, candidate.minhash_sketch) >= CONTACT_MATCH_JACCARD) {
      return candidate;
    }
  }
  return null;
}

export async function ingestRawLead(
  raw: RawLead,
  source: SourceRecord,
  deps: IngestDeps,
): Promise<IngestOutcome> {
  const now = deps.now?.() ?? new Date();
  const prepared = prepareRawLead(raw, source, now);

  const byFingerprint = await deps.store.findLeadByFingerprint(prepared.fingerprint);
  if (byFingerprint) return recordSighting(duplicateLead(byFingerprint, prepared.fingerprint), prepared.url, source, deps);

  if (prepared.canonicalUrl) {
    const byUrl = await deps.store.findLeadByCanonicalUrl(prepared.canonicalUrl);
    if (byUrl) return recordSighting({ status: 'duplicate', lead: byUrl, reasons: ['duplicate:url'] }, prepared.url, source, deps);
  }

  const since = new Date(now.getTime() - 24 * 3600 * 1000).toISOString();
  const byTitle = await deps.store.findRecentByTitleKey(prepared.titleKey, prepared.city, since);
  // «Программист 1С» is open at many companies on any day: a vacancy joins by title only at the
  // same employer. An order has no employer to compare, so its title decides unless they differ.
  const company = companyKeyOf(prepared);
  const otherCompany = byTitle ? companyKeyOf(byTitle) : undefined;
  const sameEmployer = prepared.type === 'job' ? Boolean(company) && company === otherCompany : !(company && otherCompany && company !== otherCompany);
  if (byTitle && sameEmployer) return recordSighting(duplicateLead(byTitle, prepared.fingerprint), prepared.url, source, deps);

  if (prepared.type === 'job') {
    const sameVacancy = await findSameVacancy(prepared, now, deps);
    if (sameVacancy) return recordSighting({ status: 'duplicate', lead: sameVacancy, reasons: ['duplicate:title_company'] }, prepared.url, source, deps);
  }

  // Cross-post by the same author: a shared contact and similar text within 14 days.
  const byContact = await findCrossPost(prepared.contacts, prepared.minhash_sketch, now, deps);
  if (byContact) return recordSighting({ status: 'duplicate', lead: byContact, reasons: ['duplicate:contact'] }, prepared.url, source, deps);

  if (deps.similar && wordCount(prepared.text) >= SIMILAR_MIN_WORDS) {
    const similarId = await deps.similar.findSimilar(prepared.minhash_sketch, now);
    const similar = similarId ? await deps.store.getLead(similarId) : null;
    if (similar) return recordSighting({ status: 'duplicate', lead: similar, reasons: ['duplicate:similar'] }, prepared.url, source, deps);
  }

  // The quality stage runs before the rules: the corrected type picks the pay ladder of the score.
  const quality = assessQuality(
    { type: prepared.type ?? 'gig', title: prepared.title, text: prepared.text, budget: prepared.budget, channel: prepared.sourceRef?.channel },
    source,
  );
  prepared.type = quality.type;
  if (offersNoPay(quality.flags)) {
    prepared.budget = undefined;
    prepared.rawSalary = undefined;
    prepared.normalizedUsdMin = undefined;
    prepared.normalizedUsdMax = undefined;
  }
  const rules = applyRules(prepared, source, now);
  let status: IngestOutcome['status'] = rules.accepted ? 'inserted' : 'rejected';
  const reasons = [...rules.reasons, ...quality.flags.map((flag) => `quality:${flag}`)];
  let city = prepared.city;
  let score = Math.max(0, rules.score - quality.penalty);
  let category = prepared.category;
  let skills = prepared.skills ? [...prepared.skills] : [];
  const metadata: Record<string, unknown> = { ...(prepared.metadata ?? {}) };
  if (quality.flags.length) metadata.qualityFlags = quality.flags;

  if (rules.accepted && deps.classifier) {
    try {
      const classification = await deps.classifier.classify({
        title: prepared.title,
        text: prepared.text,
        city: prepared.city,
        budget: prepared.budget,
      });
      if (classification) {
        if (!classification.isLead && classification.confidence >= 0.6) {
          status = 'rejected';
          reasons.push(`llm:not_a_lead:${classification.confidence.toFixed(2)}`);
        } else if (classification.isLead) {
          reasons.push(`llm:lead:${classification.confidence.toFixed(2)}`);
          if (!city && classification.city) city = classification.city;
          if (!category && classification.category) category = classification.category;
          if (classification.skills?.length) {
            skills = Array.from(new Set([...skills, ...classification.skills]));
          }
          if (classification.urgency) metadata.urgency = classification.urgency;
          if (classification.summary) metadata.summary = classification.summary;
          if (classification.confidence) metadata.aiConfidence = classification.confidence;

          if (prepared.budget === undefined && classification.estimatedBudget) {
            prepared.budget = classification.estimatedBudget;
            reasons.push(`llm:budget:${classification.estimatedBudget}`);
          }
          if (classification.category) reasons.push(`llm:category:${classification.category}`);
          if (classification.summary) reasons.push(`llm:summary:${classification.summary}`);
          if (classification.skills?.length) reasons.push(`llm:skills:${classification.skills.join(', ')}`);
          if (classification.urgency) reasons.push(`llm:urgency:${classification.urgency}`);
          score = Math.max(score, Math.round(classification.confidence * 100) - quality.penalty);
        }
      }
    } catch (error) {
      deps.logger.warn('classifier failed; continuing with rules only', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // No LLM classification (or it produced nothing): still fill skills from the
  // lightweight dictionary extractor, so the feed keeps usable tech tags.
  if (skills.length === 0) {
    skills = extractSkills(prepared.title, prepared.text);
  }

  const owner = typeof source.config.company === 'string' ? source.config.company : undefined;
  const employer = employerOf({ type: prepared.type ?? 'gig', author: prepared.author, text: prepared.text }, source.kind, owner);
  const wp = classifyWorkplace({
    title: prepared.title,
    text: prepared.text,
    city,
    type: prepared.type ?? 'gig',
    explicitRemote: typeof prepared.isRemote === 'boolean' ? prepared.isRemote : undefined,
  });

  const lead: Lead = {
    id: randomUUID(),
    sourceId: source.id,
    type: prepared.type ?? 'gig',
    externalId: prepared.externalId,
    url: prepared.url,
    canonicalUrl: prepared.canonicalUrl,
    title: prepared.title,
    text: prepared.text,
    author: prepared.author,
    company: employer?.name,
    companyKey: employer?.key,
    direction: classifyRole(prepared.type ?? 'gig', prepared.title, prepared.text.slice(0, 600)),
    city,
    budget: prepared.budget,
    currency: prepared.currency ?? 'RUB',
    paymentPeriod: prepared.paymentPeriod,
    rawSalary: prepared.rawSalary,
    normalizedUsdMin: prepared.normalizedUsdMin,
    normalizedUsdMax: prepared.normalizedUsdMax,
    category,
    skills,
    isRemote: wp.isRemote,
    workplaceType: wp.workplaceType,
    metadata,
    publishedAt: prepared.publishedAt,
    contacts: prepared.contacts,
    sourceRef: prepared.sourceRef,
    minhash_sketch: prepared.minhash_sketch,
    fingerprint: prepared.fingerprint,
    titleKey: prepared.titleKey,
    status: status === 'rejected' ? 'rejected' : 'new',
    score,
    reasons,
    createdAt: now.toISOString(),
    votes_up: 0,
    votes_down: 0,
    votes_scam: 0,
    votes_closed: 0,
  };

  const inserted = await deps.store.insertLead(lead);
  if (!inserted) return { status: 'duplicate', reasons: ['duplicate:race'] };

  if (status === 'rejected') {
    return { status: 'rejected', lead, reasons };
  }

  await deps.similar?.add(lead.id, lead.minhash_sketch, lead.createdAt);
  emitLeadCreated(lead);

  const registeredSinks = deps.sinks.list().filter((s) => !s.accepts || s.accepts(lead, source)).map((s) => s.kind);
  if (deps.store.initLeadDeliveries && registeredSinks.length > 0) {
    await deps.store.initLeadDeliveries(lead.id, registeredSinks);
  }

  const deliveries = await deps.sinks.deliver(lead, {
    env: deps.env,
    logger: deps.logger,
    fetchImpl: deps.fetchImpl ?? fetch,
  }, registeredSinks);

  for (const delivery of deliveries) {
    await deps.store.recordDelivery(
      lead.id,
      delivery.sink,
      delivery.ok ? 'sent' : 'failed',
      delivery.error,
    );
    if (deps.store.updateLeadDelivery) {
      if (delivery.ok) {
        await deps.store.updateLeadDelivery(lead.id, delivery.sink, 'sent');
      } else {
        const nextAttempt = new Date(Date.now() + 10 * 1000).toISOString();
        await deps.store.updateLeadDelivery(lead.id, delivery.sink, 'failed', delivery.error, nextAttempt);
      }
    }
  }

  if (deliveries.length === 0) {
    return { status: 'inserted', lead, reasons };
  }

  const failed = deliveries.filter((delivery) => !delivery.ok);
  if (failed.length > 0) {
    await deps.store.updateLeadStatus(lead.id, 'failed');
    lead.status = 'failed';
    return {
      status: 'failed',
      lead,
      error: failed.map((delivery) => `${delivery.sink}: ${delivery.error ?? 'unknown'}`).join('; '),
      reasons,
    };
  }

  const deliveredAt = new Date().toISOString();
  await deps.store.updateLeadStatus(lead.id, 'delivered', deliveredAt);
  lead.status = 'delivered';
  lead.deliveredAt = deliveredAt;
  return { status: 'delivered', lead, reasons };
}

export interface IngestSummary {
  found: number;
  inserted: number;
  duplicates: number;
  rejected: number;
  delivered: number;
  failed: number;
  outcomes: IngestOutcome[];
}

export async function ingestRawLeads(
  raws: RawLead[],
  source: SourceRecord,
  deps: IngestDeps,
): Promise<IngestSummary> {
  const summary: IngestSummary = {
    found: raws.length,
    inserted: 0,
    duplicates: 0,
    rejected: 0,
    delivered: 0,
    failed: 0,
    outcomes: [],
  };

  for (const raw of raws) {
    const outcome = await ingestRawLead(raw, source, deps);
    summary.outcomes.push(outcome);
    if (outcome.status === 'inserted') summary.inserted += 1;
    else if (outcome.status === 'duplicate') summary.duplicates += 1;
    else if (outcome.status === 'rejected') summary.rejected += 1;
    else if (outcome.status === 'delivered') {
      summary.inserted += 1;
      summary.delivered += 1;
    } else if (outcome.status === 'failed') {
      summary.inserted += 1;
      summary.failed += 1;
    }
  }

  return summary;
}
