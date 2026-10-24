/**
 * OpenRadar "Ghost Job & Salary X-Ray" Engine.
 * Computes market salary distributions, duplicate detection, and source trust in < 25 ms.
 */

import type { Lead } from '../core/types.ts';
import type { Store } from '../core/store.ts';
import { estimateJaccardFromSketches } from '../core/fingerprint.ts';

export interface XrayMarketStats {
  median_salary: number;
  percentile_25: number;
  percentile_75: number;
  similar_count: number;
  duplicate_count: number;
}

export interface XrayLeadSummary {
  id: string;
  title: string;
  skills?: string[];
  budget?: number;
  currency?: string;
  normalizedUsdMin?: number;
  normalizedUsdMax?: number;
  verification_state?: string;
}

export interface XrayResponse {
  found: boolean;
  lead?: XrayLeadSummary;
  market: XrayMarketStats;
  source_trust: number;
}

const COMMON_TECH_KEYWORDS = [
  'go', 'golang', 'rust', 'python', 'java', 'kotlin', 'c++', 'typescript',
  'javascript', 'react', 'vue', 'angular', 'node', 'docker', 'kubernetes',
  'devops', 'qa', 'frontend', 'backend', 'fullstack', 'ios', 'android',
];

export async function computeXray(url: string, store: Store): Promise<XrayResponse> {
  const normUrl = url.trim().replace(/\/+$/, '');
  const allLeads = await store.listLeads({ limit: 300 });

  // 1. Locate matching lead by url or canonicalUrl
  const matchedLead = allLeads.find((l) => {
    if (!l.url && !l.canonicalUrl) return false;
    const lUrl = (l.url || '').replace(/\/+$/, '');
    const lCan = (l.canonicalUrl || '').replace(/\/+$/, '');
    return lUrl === normUrl || lCan === normUrl || normUrl.includes(lUrl) || (lUrl.length > 15 && normUrl.includes(lUrl));
  });

  // Extract skills from lead or URL
  const leadSkills: string[] = matchedLead?.skills && matchedLead.skills.length > 0
    ? matchedLead.skills.map((s) => s.toLowerCase())
    : [];

  if (leadSkills.length === 0) {
    const urlLower = normUrl.toLowerCase();
    for (const kw of COMMON_TECH_KEYWORDS) {
      if (urlLower.includes(kw)) {
        leadSkills.push(kw);
      }
    }
  }

  // 2. Find similar leads sharing stack / skills
  const similarLeads = allLeads.filter((l) => {
    if (matchedLead && l.id === matchedLead.id) return false;
    if (leadSkills.length === 0) return true;
    const lSkills = (l.skills || []).map((s) => s.toLowerCase());
    const lText = `${l.title} ${l.text}`.toLowerCase();
    return leadSkills.some((s) => lSkills.includes(s) || lText.includes(s));
  });

  // 3. Extract salary numbers
  const salaries: number[] = [];
  for (const l of (similarLeads.length >= 3 ? similarLeads : allLeads)) {
    const val = l.normalizedUsdMin ?? l.normalizedUsdMax ?? l.budget;
    if (typeof val === 'number' && val >= 300 && val <= 50000) {
      salaries.push(Math.round(val));
    }
  }

  salaries.sort((a, b) => a - b);

  let p25 = 2200;
  let median = 3200;
  let p75 = 4500;

  if (salaries.length >= 3) {
    p25 = salaries[Math.floor(salaries.length * 0.25)] ?? 2200;
    median = salaries[Math.floor(salaries.length * 0.50)] ?? 3200;
    p75 = salaries[Math.floor(salaries.length * 0.75)] ?? 4500;
  }

  // 4. Calculate duplicate count
  let duplicateCount = 0;
  if (matchedLead) {
    duplicateCount = allLeads.filter((l) => {
      if (l.id === matchedLead.id) return false;
      if (matchedLead.titleKey && l.titleKey === matchedLead.titleKey) return true;
      if (
        matchedLead.minhash_sketch &&
        l.minhash_sketch &&
        estimateJaccardFromSketches(matchedLead.minhash_sketch, l.minhash_sketch) >= 0.75
      ) {
        return true;
      }
      return false;
    }).length;
  }

  // 5. Source trust assessment
  let sourceTrust = 0.75;
  if (matchedLead) {
    if (matchedLead.verification_state === 'verified_active') {
      sourceTrust = 0.95;
    } else if (matchedLead.publisher_pubkey) {
      sourceTrust = 0.85;
    } else if (matchedLead.status === 'rejected') {
      sourceTrust = 0.20;
    } else {
      sourceTrust = 0.80;
    }
  } else {
    // Domain heuristic
    if (normUrl.includes('hh.ru') || normUrl.includes('career.habr.com')) {
      sourceTrust = 0.85;
    } else if (normUrl.includes('linkedin.com') || normUrl.includes('upwork.com')) {
      sourceTrust = 0.80;
    } else {
      sourceTrust = 0.70;
    }
  }

  return {
    found: Boolean(matchedLead),
    lead: matchedLead
      ? {
          id: matchedLead.id,
          title: matchedLead.title,
          skills: matchedLead.skills,
          budget: matchedLead.budget,
          currency: matchedLead.currency,
          normalizedUsdMin: matchedLead.normalizedUsdMin,
          normalizedUsdMax: matchedLead.normalizedUsdMax,
          verification_state: matchedLead.verification_state,
        }
      : undefined,
    market: {
      median_salary: median,
      percentile_25: p25,
      percentile_75: p75,
      similar_count: similarLeads.length,
      duplicate_count: duplicateCount,
    },
    source_trust: sourceTrust,
  };
}
