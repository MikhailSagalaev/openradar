/**
 * OpenRadar AI Arbiter (Grokipedia Pattern).
 * Background verification and slashing engine against scam and false reporting.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { assertSafeUrl } from '../core/ssrf.ts';
import { decryptPrivateKey, encryptPrivateKey } from '../net/keys.ts';
import type { Lead, LeadStatus } from '../core/types.ts';
import type { Store, MeshNodeRecord } from '../core/store.ts';
import { generateKeyPair, importPrivateKey, type KeyPair } from '../net/keys.ts';
import { buildLeadAttestationEvent, RadarEventKinds } from '../net/protocol.ts';
import { computeMinHashSketch, estimateJaccardFromSketches } from '../core/fingerprint.ts';

export type ArbiterVerdict = 'active' | 'closed' | 'scam' | 'inconclusive';

/**
 * Loads the persistent arbiter identity (encrypted at rest with the passphrase,
 * AES-256-GCM + scrypt) or creates one on first run. A stable key is required
 * so Web-of-Trust can attribute attestations to this node.
 */
export function loadOrCreateServerKeys(
  passphrase: string,
  dataDir = process.env.RADAR_DATA_DIR || join(process.cwd(), 'data'),
): KeyPair {
  const keyPath = join(dataDir, 'arbiter-key.enc.json');
  if (existsSync(keyPath)) {
    const storage = JSON.parse(readFileSync(keyPath, 'utf8'));
    return importPrivateKey(decryptPrivateKey(storage, passphrase));
  }
  const keypair = generateKeyPair();
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
  writeFileSync(
    keyPath,
    JSON.stringify({ npub: keypair.npub, ...encryptPrivateKey(keypair.privKey, passphrase) }, null, 2),
    { mode: 0o600 },
  );
  return keypair;
}

export interface ArbiterEvaluation {
  verdict: ArbiterVerdict;
  confidence: number;
  reason: string;
  httpCode?: number;
}

export interface ArbiterContext {
  store: Store;
  serverKeys?: KeyPair;
  fetchImpl?: typeof fetch;
  llmUrl?: string;
  llmApiKey?: string;
  timeoutMs?: number;
  userAgent?: string;
}

const DEFAULT_USER_AGENT = 'OpenRadar/1.0 (https://github.com/MikhailSagalaev/radar-oss)';

const CLOSED_STOP_PATTERNS = [
  /ваканси[яи]\s+(?:в\s+архиве|закрыта|перенесена|не\s+найдена)/iu,
  /заказ\s+(?:закрыт|завершен|в\s+архиве|снят)/iu,
  /объявлени[ея]\s+(?:закрыт[оа]|в\s+архиве|неактуальн[оа])/iu,
  /прием\s+(?:откликов|заявок)\s+(?:закрыт|завершен|остановлен)/iu,
  /сбор\s+(?:откликов|заявок)\s+завершен/iu,
  /неактуальн(?:о|ая\s+вакансия)/iu,
  /страница\s+не\s+найдена/iu,
  /404\s+not\s+found/iu,
];

const SCAM_STOP_PATTERNS = [
  /(?:seed|сид)[-\s]*(?:phrase|фраз[а-я]*)/iu,
  /(?:private\s+key|приватн[а-я]*\s+ключ)/iu,
  /(?:предоплат[а-я]*|залог|взнос)\s+(?:за\s+)?(?:тестов[а-я]*|верификац[а-я]*|материал[а-я]*|обучени[а-я]*|оборудовани[а-я]*)/iu,
  /(?:купите|купить)\s+крипт[а-я]*\s+(?:для\s+)?(?:старт[а-я]*|вход[а-я]*|активац[а-я]*)/iu,
  /(?:переведите|внести)\s+(?:депозит|страховк[а-я]*|гарантийный\s+взнос)/iu,
  /оплата\s+за\s+верификацию/iu,
  /аренда\s+банковск[а-я]*\s+карт/iu,
];

/**
 * Deterministically checks page content and HTTP status for closure or fraud.
 * When originalMinHash is supplied and HTTP 200 is returned, checks Jaccard similarity.
 * If J < 0.35, marks status as inconclusive to protect against SPA redirects and login walls.
 */
export function evaluateContentDeterministically(
  htmlOrText: string,
  statusCode: number,
  originalMinHash?: string,
): ArbiterEvaluation {
  if (statusCode === 404 || statusCode === 410) {
    return {
      verdict: 'closed',
      confidence: 1.0,
      reason: `HTTP ${statusCode} Not Found or Gone`,
      httpCode: statusCode,
    };
  }

  // MinHash divergence check runs BEFORE stop-patterns: on an SPA shell,
  // redirect or login-wall the patterns would match unrelated site chrome.
  if (statusCode >= 200 && statusCode < 300 && originalMinHash) {
    const pageSketch = computeMinHashSketch(htmlOrText);
    const similarity = estimateJaccardFromSketches(pageSketch, originalMinHash);
    if (similarity < 0.35) {
      return {
        verdict: 'inconclusive',
        confidence: 0.50,
        reason: `MinHash divergence (J=${similarity.toFixed(2)} < 0.35): probable SPA skeleton, redirect or login-wall`,
        httpCode: statusCode,
      };
    }
  }

  for (const pattern of SCAM_STOP_PATTERNS) {
    if (pattern.test(htmlOrText)) {
      return {
        verdict: 'scam',
        confidence: 0.95,
        reason: `Matched scam pattern: ${pattern.source}`,
        httpCode: statusCode,
      };
    }
  }

  for (const pattern of CLOSED_STOP_PATTERNS) {
    if (pattern.test(htmlOrText)) {
      return {
        verdict: 'closed',
        confidence: 0.95,
        reason: `Matched closure pattern: ${pattern.source}`,
        httpCode: statusCode,
      };
    }
  }

  if (statusCode >= 200 && statusCode < 300) {
    return {
      verdict: 'active',
      confidence: 0.90,
      reason: 'HTTP 200 reachable, no stop markers detected',
      httpCode: statusCode,
    };
  }

  // 403/429 (bot protection), 5xx and anything else must never kill a lead.
  return {
    verdict: 'inconclusive',
    confidence: 0.50,
    reason: `Undetermined response status ${statusCode}`,
    httpCode: statusCode,
  };
}

/**
 * Optional LLM verifier fallback via standard HTTP completions endpoint.
 */
export async function evaluateWithLLM(
  text: string,
  llmUrl: string,
  apiKey?: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ArbiterEvaluation | null> {
  try {
    const prompt = `Analyze this job posting / lead text and determine its status.
Respond STRICTLY with a valid JSON object matching:
{"verdict": "active" | "closed" | "scam", "confidence": <float 0.0 to 1.0>, "reason": "<short explanation>"}

Text:
${text.slice(0, 3000)}`;

    const res = await fetchImpl(llmUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
      }),
    });

    if (!res.ok) return null;
    const data = await res.json() as any;
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') return null;

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]);

    if (
      (parsed.verdict === 'active' || parsed.verdict === 'closed' || parsed.verdict === 'scam') &&
      typeof parsed.confidence === 'number'
    ) {
      return {
        verdict: parsed.verdict,
        confidence: parsed.confidence,
        reason: parsed.reason || 'LLM assessment',
      };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Safely fetches the candidate URL using SSRF DNS Resolver Guard and evaluates it.
 */
export async function evaluateUrl(
  targetUrl: string,
  ctx: ArbiterContext,
  originalMinHash?: string,
): Promise<ArbiterEvaluation> {
  const fetchImpl = ctx.fetchImpl ?? fetch;
  const timeoutMs = ctx.timeoutMs ?? 5000;
  const userAgent = ctx.userAgent ?? DEFAULT_USER_AGENT;

  try {
    await assertSafeUrl(targetUrl);
  } catch (err) {
    return {
      verdict: 'closed',
      confidence: 0.85,
      reason: `Blocked by SSRF guard: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetchImpl(targetUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': userAgent,
        Accept: 'text/html,application/xhtml+xml,text/plain,*/*',
      },
    });

    const statusCode = res.status;
    const text = await res.text().catch(() => '');

    const deterministic = evaluateContentDeterministically(text, statusCode, originalMinHash);
    if (deterministic.confidence >= 0.85) {
      return deterministic;
    }
    if (deterministic.verdict === 'inconclusive') {
      return deterministic;
    }

    // Optional LLM check if deterministic is inconclusive
    const llmUrl = ctx.llmUrl || process.env.ARBITER_LLM_URL;
    if (llmUrl) {
      const llmResult = await evaluateWithLLM(text, llmUrl, ctx.llmApiKey, fetchImpl);
      if (llmResult && llmResult.confidence >= 0.85) {
        return { ...llmResult, httpCode: statusCode };
      }
    }

    return deterministic;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('abort') || msg.includes('timeout')) {
      return {
        verdict: 'inconclusive',
        confidence: 0.50,
        reason: `Request timeout (${timeoutMs}ms)`,
      };
    }
    return {
      verdict: 'inconclusive',
      confidence: 0.50,
      reason: `Connection error: ${msg}`,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Main Arbiter execution on a lead:
 * 1. Checks canonicalUrl or url safely.
 * 2. Applies verification state (killed_scam | killed_closed | verified_active | under_review).
 * 3. Signs Kind 30405 attestation.
 * 4. Slashes false scam reporters when lead is confirmed active (Skin-in-the-game).
 * 5. Prevents slashing when verdict is inconclusive (SPA/Login-Wall Guard).
 */
export async function arbitrateLead(
  leadId: string,
  ctx: ArbiterContext,
  reportedReporters?: string[], // pubkeys of nodes that reported scam
): Promise<ArbiterEvaluation> {
  const lead = await ctx.store.getLead(leadId);
  if (!lead) {
    return {
      verdict: 'closed',
      confidence: 1.0,
      reason: 'Lead not found in store',
    };
  }

  const checkUrl = lead.canonicalUrl || lead.url;
  const originalMinHash = lead.minhash_sketch;
  let evaluation: ArbiterEvaluation;

  if (checkUrl) {
    evaluation = await evaluateUrl(checkUrl, ctx, originalMinHash);
  } else {
    // If no URL exists, evaluate lead text directly
    evaluation = evaluateContentDeterministically(lead.text, 200, originalMinHash);
  }

  if (evaluation.verdict === 'inconclusive') {
    lead.verification_state = 'under_review';
    await ctx.store.updateLeadVerification?.(lead.id, 'under_review');
    // Slashing is strictly forbidden for inconclusive evaluations
    return evaluation;
  }

  const serverKeys = ctx.serverKeys ?? generateKeyPair();

  if (evaluation.confidence >= 0.85) {
    if (evaluation.verdict === 'scam') {
      lead.verification_state = 'killed_scam';
      lead.status = 'rejected';
      await ctx.store.updateLeadStatus(lead.id, 'rejected');
      await ctx.store.updateLeadVerification?.(lead.id, 'killed_scam');

      // Publish Kind 30405 attestation
      const attestationEvent = buildLeadAttestationEvent({
        leadEventId: lead.nostr_event_id || lead.fingerprint || '0'.repeat(64),
        recomputedHash: lead.fingerprint,
        status: 'scam',
        confidence: evaluation.confidence,
        httpCode: evaluation.httpCode,
        pubkey: serverKeys.pubKey,
        privKey: serverKeys.privKey,
      });

      await ctx.store.recordAttestation({
        nostr_event_id: attestationEvent.id,
        lead_id: lead.id,
        signer_pubkey: serverKeys.pubKey,
        kind: RadarEventKinds.LeadAttestation,
        signal_or_status: 'scam',
        confidence: evaluation.confidence,
        raw_event: attestationEvent as any,
      });
    } else if (evaluation.verdict === 'closed') {
      lead.verification_state = 'killed_closed';
      lead.status = 'rejected';
      await ctx.store.updateLeadStatus(lead.id, 'rejected');
      await ctx.store.updateLeadVerification?.(lead.id, 'killed_closed');

      const attestationEvent = buildLeadAttestationEvent({
        leadEventId: lead.nostr_event_id || lead.fingerprint || '0'.repeat(64),
        recomputedHash: lead.fingerprint,
        status: 'closed',
        confidence: evaluation.confidence,
        httpCode: evaluation.httpCode,
        pubkey: serverKeys.pubKey,
        privKey: serverKeys.privKey,
      });

      await ctx.store.recordAttestation({
        nostr_event_id: attestationEvent.id,
        lead_id: lead.id,
        signer_pubkey: serverKeys.pubKey,
        kind: RadarEventKinds.LeadAttestation,
        signal_or_status: 'closed',
        confidence: evaluation.confidence,
        raw_event: attestationEvent as any,
      });
    } else if (evaluation.verdict === 'active') {
      lead.verification_state = 'verified_active';
      // Restore status only for mesh-exclusive leads: connector-sourced leads
      // may be 'rejected' by the operator funnel or community votes, and the
      // arbiter must not override that decision.
      if (lead.is_mesh_exclusive && lead.status === 'rejected') {
        lead.status = 'new';
        await ctx.store.updateLeadStatus(lead.id, 'new');
      }
      await ctx.store.updateLeadVerification?.(lead.id, 'verified_active');

      // Skin-in-the-game slashing:
      // If verdict is active, slash trust_score by 50% for all nodes that submitted false scam reports
      if (reportedReporters && reportedReporters.length > 0 && ctx.store.getMeshNode) {
        for (const pubkey of reportedReporters) {
          const node = await ctx.store.getMeshNode(pubkey);
          if (node) {
            const slashedTrust = Math.max(0.01, node.trust_score * 0.5);
            const nextFalseReports = (node.false_reports_count ?? 0) + 1;
            await ctx.store.upsertMeshNode({
              pubkey: node.pubkey,
              npub: node.npub,
              trust_score: slashedTrust,
              false_reports_count: nextFalseReports,
            });
            node.trust_score = slashedTrust;
            node.false_reports_count = nextFalseReports;
          }
        }
      }

      const attestationEvent = buildLeadAttestationEvent({
        leadEventId: lead.nostr_event_id || lead.fingerprint || '0'.repeat(64),
        recomputedHash: lead.fingerprint,
        status: 'verified',
        confidence: evaluation.confidence,
        httpCode: evaluation.httpCode,
        pubkey: serverKeys.pubKey,
        privKey: serverKeys.privKey,
      });

      await ctx.store.recordAttestation({
        nostr_event_id: attestationEvent.id,
        lead_id: lead.id,
        signer_pubkey: serverKeys.pubKey,
        kind: RadarEventKinds.LeadAttestation,
        signal_or_status: 'verified',
        confidence: evaluation.confidence,
        raw_event: attestationEvent as any,
      });
    }
  }

  return evaluation;
}
