import type { Lead } from './types.ts';
import { qualityFlagsOf, QUALITY_PENALTY, type QualityFlag } from './quality.ts';

/**
 * Explainable scoring (plan 021A, SuperImpress / pathpipe / JobOps ideas — clean-room): the
 * single opaque 0–100 score is accompanied by named checks, binary gates and a human verdict.
 * The numeric score contract is untouched (downstream/UI depend on it); this is an additive
 * explanation computed from what the lead already carries — score, quality flags, state, pay,
 * skills — so it works for every lead without a model call or a new store column.
 *
 * Gates are hard binary filters applied BEFORE the verdict: a lead that fails any gate is
 * never "strong", however high its numeric score (the pathpipe essential-criteria idea).
 */

export type Verdict = 'strong' | 'stretch' | 'skip';

/** One named, human-readable check. `pass` is the judgement; `note` says why. */
export interface ScoreCheck {
  name: string;
  pass: boolean;
  note: string;
}

/** A hard binary filter. A failed gate caps the verdict at "skip". */
export interface ScoreGate {
  name: string;
  pass: boolean;
  note: string;
}

export interface LeadExplanation {
  checks: ScoreCheck[];
  gates: ScoreGate[];
  verdict: Verdict;
}

/** Score at or above this is a strong fit (when no gate fails). */
export const STRONG_AT = 70;
/** Score at or above this (but below STRONG_AT) is a stretch. */
export const STRETCH_AT = 45;

/** A lead the reader can filter on: the fields the explanation reads. */
export type ExplainableLead = Pick<Lead, 'score' | 'state' | 'metadata'> &
  Partial<Pick<Lead, 'type' | 'skills' | 'rawSalary' | 'normalizedUsdMin' | 'normalizedUsdMax' | 'budget' | 'direction' | 'text'>>;

const GATE_NOTE: Record<QualityFlag, string> = {
  channel_ad: 'реклама/курс канала, а не вакансия',
  mlm: 'признаки сетевой схемы («обучение, затем доход»)',
  digest: 'подборка нескольких вакансий, нет единого предложения',
  outstaff: 'аутстафф: наём через посредника',
  mystery_shopper: 'платная проверка («тайный покупатель»), не работа',
};

function hasPay(lead: ExplainableLead): boolean {
  return Boolean(lead.rawSalary?.trim()) || lead.normalizedUsdMin != null || lead.normalizedUsdMax != null || (lead.budget ?? 0) > 0;
}

/** Builds the explanation: gates first, then checks, then the verdict they imply. */
export function explainLead(lead: ExplainableLead): LeadExplanation {
  const state = lead.state ?? 'active';
  const flags = qualityFlagsOf(lead);
  const score = Math.max(0, Math.min(100, lead.score ?? 0));

  // Gates: hard filters. Any failure means the lead is not a fit, regardless of score.
  const gates: ScoreGate[] = [
    {
      name: 'live',
      pass: state === 'active',
      note: state === 'active' ? 'вакансия активна' : `состояние: ${state}`,
    },
    {
      name: 'real-offer',
      pass: !flags.some((f) => f === 'channel_ad' || f === 'mlm' || f === 'digest' || f === 'mystery_shopper'),
      note: flags.length ? flags.map((f) => GATE_NOTE[f]).join('; ') : 'единое предложение работы',
    },
  ];

  // Checks: named, softer signals that explain the score.
  const skills = lead.skills ?? [];
  const checks: ScoreCheck[] = [
    { name: 'score', pass: score >= STRETCH_AT, note: `оценка ${score}/100` },
    { name: 'pay', pass: hasPay(lead), note: hasPay(lead) ? 'оплата указана' : 'оплата не указана' },
    { name: 'requirements', pass: skills.length > 0, note: skills.length ? `навыки: ${skills.slice(0, 6).join(', ')}` : 'навыки не перечислены' },
    { name: 'direction', pass: Boolean(lead.direction && lead.direction !== 'other'), note: lead.direction ? `направление: ${lead.direction}` : 'направление не определено' },
    { name: 'detail', pass: (lead.text?.length ?? 0) >= 300, note: (lead.text?.length ?? 0) >= 300 ? 'подробное описание' : 'короткое описание' },
  ];

  const gated = gates.some((g) => !g.pass);
  const verdict: Verdict = gated ? 'skip' : score >= STRONG_AT ? 'strong' : score >= STRETCH_AT ? 'stretch' : 'skip';
  return { checks, gates, verdict };
}

/** The penalty a lead's quality flags carry (re-exported for the UI's score breakdown). */
export { QUALITY_PENALTY };
