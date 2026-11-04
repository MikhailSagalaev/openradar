/**
 * The gold set: posts a person labelled by hand, the only fair measure of the rules and the
 * model. Comparing them with each other says little, since the rules make mistakes too.
 * `research sample` writes a CSV to label; `research gold` scores both against it.
 */
import { createHash } from 'node:crypto';
import type { Lead } from '../core/types.ts';
import { deriveRecord, MIN_CONFIDENCE, normalizePay, OTHER_ROLE } from './derive.ts';
import type { StoredModelFacts } from './model.ts';

export const GOLD_COLUMNS = [
  'id', 'platform', 'type', 'title', 'text', 'rules_role', 'rules_pay', 'rules_period', 'model_role', 'model_pay', 'model_period',
  'gold_is_post', 'gold_role', 'gold_pay', 'gold_period',
] as const;

/** Pay figures this close count as the same. */
const PAY_TOLERANCE = 0.15;

function cell(value: unknown): string {
  const text = value === undefined || value === null ? '' : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** A sample in equal shares by platform and type; a hash of the id orders it, so it repeats. */
export function goldSample(leads: Lead[], size: number): Lead[] {
  const groups = new Map<string, Lead[]>();
  const rank = (id: string): string => createHash('sha256').update(id).digest('hex');
  for (const lead of [...leads].sort((a, b) => rank(a.id).localeCompare(rank(b.id)))) {
    const record = deriveRecord(lead, { useModel: false });
    const key = `${record.platform}|${record.type}|${record.scope}`;
    groups.set(key, [...(groups.get(key) ?? []), lead]);
  }
  const queues = [...groups.values()].sort((a, b) => b.length - a.length);
  const picked: Lead[] = [];
  for (let i = 0; picked.length < size && queues.some((q) => i < q.length); i++) {
    for (const queue of queues) {
      if (picked.length >= size) break;
      if (i < queue.length) picked.push(queue[i]!);
    }
  }
  return picked;
}

function modelAnswer(lead: Lead): { role?: string; pay?: number; period?: string } {
  const facts = (lead.metadata?.model as StoredModelFacts | undefined)?.facts;
  if (!facts || facts.confidence < MIN_CONFIDENCE) return {};
  const pay = facts.currency && facts.period
    ? normalizePay({ min: facts.payMin, max: facts.payMax, currency: facts.currency, period: facts.period, origin: 'model' }, lead.type ?? 'gig')
    : undefined;
  return { role: facts.role, pay: pay?.point, period: pay?.period };
}

export function goldCsv(leads: Lead[]): string {
  const rows = leads.map((lead) => {
    const rules = deriveRecord(lead, { useModel: false });
    const model = modelAnswer(lead);
    return [
      lead.id, rules.platform, rules.type, lead.title, lead.text.slice(0, 1500), rules.role, rules.pay, rules.payPeriod,
      model.role, model.pay, model.period, '', '', '', '',
    ].map(cell).join(',');
  });
  return `${GOLD_COLUMNS.join(',')}\n${rows.join('\n')}\n`;
}

export function parseCsv(text: string): Array<Record<string, string>> {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { value += '"'; i++; }
      else if (c === '"') quoted = false;
      else value += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(value); value = ''; }
    else if (c === '\n') { row.push(value.replace(/\r$/, '')); rows.push(row); row = []; value = ''; }
    else value += c;
  }
  if (value || row.length) { row.push(value); rows.push(row); }
  const [head, ...body] = rows;
  if (!head) return [];
  return body.map((cells) => Object.fromEntries(head.map((name, i) => [name, cells[i] ?? ''])));
}

export interface GoldScore {
  n: number;
  /** Posts the person judged not to be vacancies or orders. */
  notPosts: number;
  rules: { role: Share; pay: Share };
  model: { role: Share; pay: Share };
}

interface Share {
  n: number;
  right: number;
}

const closePay = (value: string, gold: string): boolean => Math.abs(Number(value) - Number(gold)) <= PAY_TOLERANCE * Number(gold);

/** How often each side matches the labels; a row counts once it has a label for that field. */
export function scoreGold(rows: Array<Record<string, string>>): GoldScore {
  const score: GoldScore = { n: 0, notPosts: 0, rules: { role: { n: 0, right: 0 }, pay: { n: 0, right: 0 } }, model: { role: { n: 0, right: 0 }, pay: { n: 0, right: 0 } } };
  for (const row of rows) {
    if (!row.gold_is_post && !row.gold_role && !row.gold_pay) continue;
    score.n++;
    if (/^(0|no|нет)$/i.test(row.gold_is_post ?? '')) {
      score.notPosts++;
      continue;
    }
    if (row.gold_role) {
      score.rules.role.n++;
      if (row.rules_role === row.gold_role) score.rules.role.right++;
      // The model is judged on the posts it answered; the rules' «other» is a miss.
      if (row.model_role && row.model_role !== OTHER_ROLE.slug) {
        score.model.role.n++;
        if (row.model_role === row.gold_role) score.model.role.right++;
      }
    }
    if (row.gold_pay) {
      score.rules.pay.n++;
      if (row.rules_pay && closePay(row.rules_pay, row.gold_pay)) score.rules.pay.right++;
      if (row.model_pay) {
        score.model.pay.n++;
        if (closePay(row.model_pay, row.gold_pay)) score.model.pay.right++;
      }
    }
  }
  return score;
}
