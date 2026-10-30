import { randomUUID } from 'node:crypto';
import { prepareRawLead } from '../core/prepare.ts';
import { applyRules } from '../core/rules.ts';
import { assessQuality } from '../core/quality.ts';
import { extractTechSkills } from '../core/text.ts';
import { emitLeadCreated } from '../core/events.ts';
import { estimateJaccardFromSketches } from '../core/fingerprint.ts';
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
  if (byFingerprint) return duplicateLead(byFingerprint, prepared.fingerprint);

  if (prepared.canonicalUrl) {
    const byUrl = await deps.store.findLeadByCanonicalUrl(prepared.canonicalUrl);
    if (byUrl) return { status: 'duplicate', lead: byUrl, reasons: ['duplicate:url'] };
  }

  const since = new Date(now.getTime() - 24 * 3600 * 1000).toISOString();
  const byTitle = await deps.store.findRecentByTitleKey(prepared.titleKey, prepared.city, since);
  if (byTitle) return duplicateLead(byTitle, prepared.fingerprint);

  // Cross-post by the same author: a shared contact and similar text within 14 days.
  const byContact = await findCrossPost(prepared.contacts, prepared.minhash_sketch, now, deps);
  if (byContact) return { status: 'duplicate', lead: byContact, reasons: ['duplicate:contact'] };

  if (deps.similar && wordCount(prepared.text) >= SIMILAR_MIN_WORDS) {
    const similarId = await deps.similar.findSimilar(prepared.minhash_sketch, now);
    const similar = similarId ? await deps.store.getLead(similarId) : null;
    if (similar) return { status: 'duplicate', lead: similar, reasons: ['duplicate:similar'] };
  }

  // The quality stage runs before the rules: the corrected type picks the pay ladder of the score.
  const quality = assessQuality(
    { type: prepared.type ?? 'gig', title: prepared.title, text: prepared.text, budget: prepared.budget },
    source,
  );
  prepared.type = quality.type;
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
    skills = extractTechSkills(`${prepared.title}\n${prepared.text}`);
  }

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
    city,
    budget: prepared.budget,
    currency: prepared.currency ?? 'RUB',
    paymentPeriod: prepared.paymentPeriod,
    rawSalary: prepared.rawSalary,
    normalizedUsdMin: prepared.normalizedUsdMin,
    normalizedUsdMax: prepared.normalizedUsdMax,
    category,
    skills,
    isRemote: prepared.isRemote !== false,
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

  deps.similar?.add(lead.id, lead.minhash_sketch, lead.createdAt);
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
