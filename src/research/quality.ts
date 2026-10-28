/**
 * Is the model good enough to count? Where the rules or the page already know the answer,
 * the model's answer is compared with it; the share that agrees is the evidence for turning
 * RADAR_EXTRACT_APPLY on. The gain shows what the model would add where the rules are silent.
 */
import type { Lead } from '../core/types.ts';
import { deriveRecord, MIN_CONFIDENCE, normalizePay, OTHER_ROLE } from './derive.ts';
import { MODEL_EXTRACT_VERSION, type StoredModelFacts } from './model.ts';

/** Agreement needed on role and pay before the model's answers may enter the figures. */
export const APPLY_AGREEMENT = 0.85;
/** Pay figures this close count as the same. */
const PAY_TOLERANCE = 0.15;

export interface Agreement {
  n: number;
  agree: number;
}

export interface QualityReport {
  answered: number;
  confident: number;
  notPost: number;
  role: Agreement;
  grade: Agreement;
  pay: Agreement;
  gain: { role: number; pay: number; grade: number };
  disagreements: Array<{ id: string; title: string; field: 'role' | 'grade' | 'pay'; rules: string; model: string }>;
  ready: boolean;
}

export function share(a: Agreement): number | undefined {
  return a.n ? a.agree / a.n : undefined;
}

export function modelQuality(leads: Lead[]): QualityReport {
  const report: QualityReport = {
    answered: 0, confident: 0, notPost: 0,
    role: { n: 0, agree: 0 }, grade: { n: 0, agree: 0 }, pay: { n: 0, agree: 0 },
    gain: { role: 0, pay: 0, grade: 0 },
    disagreements: [],
    ready: false,
  };
  const note = (lead: Lead, field: 'role' | 'grade' | 'pay', rules: string, model: string): void => {
    if (report.disagreements.length < 20) report.disagreements.push({ id: lead.id, title: lead.title.slice(0, 80), field, rules, model });
  };
  for (const lead of leads) {
    const stored = lead.metadata?.model as StoredModelFacts | undefined;
    if (!stored?.facts || stored.v !== MODEL_EXTRACT_VERSION) continue;
    report.answered++;
    const m = stored.facts;
    if (m.confidence < MIN_CONFIDENCE) continue;
    report.confident++;
    if (!m.isPost) {
      report.notPost++;
      continue;
    }
    const rules = deriveRecord(lead, { useModel: false });

    if (m.role) {
      if (rules.role === OTHER_ROLE.slug) report.gain.role++;
      else {
        report.role.n++;
        if (rules.role === m.role) report.role.agree++;
        else note(lead, 'role', rules.role, m.role);
      }
    }
    if (rules.type === 'job' && m.grade) {
      if (!rules.grade) report.gain.grade++;
      else {
        report.grade.n++;
        if (rules.grade === m.grade) report.grade.agree++;
        else note(lead, 'grade', rules.grade, m.grade);
      }
    }
    const modelPay = m.currency && m.period
      ? normalizePay({ min: m.payMin, max: m.payMax, currency: m.currency, period: m.period, origin: 'model' }, rules.type)
      : undefined;
    if (modelPay) {
      if (rules.pay === undefined) report.gain.pay++;
      else {
        report.pay.n++;
        const close = modelPay.period === rules.payPeriod && Math.abs(modelPay.point - rules.pay) <= PAY_TOLERANCE * rules.pay;
        if (close) report.pay.agree++;
        else note(lead, 'pay', `${rules.pay} ${rules.payPeriod}`, `${modelPay.point} ${modelPay.period}`);
      }
    }
  }
  const good = (a: Agreement): boolean => a.n >= 30 && share(a)! >= APPLY_AGREEMENT;
  report.ready = good(report.role) && good(report.pay);
  return report;
}
