import { describe, expect, it } from 'vitest';
import { explainLead, STRONG_AT, STRETCH_AT } from '../src/core/explain.ts';
import { createApp } from '../src/server/app.ts';
import type { Lead } from '../src/core/types.ts';
import { makeTestRuntime } from './helpers.ts';

const NOW = new Date('2026-11-13T12:00:00.000Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

function lead(over: Partial<Lead> = {}): Lead {
  return {
    id: 'l1', sourceId: 's1', type: 'job', title: 'Backend engineer', text: 'Build distributed systems. '.repeat(20),
    url: 'https://jobs.ashbyhq.com/acme/1', fingerprint: 'fp', titleKey: 'tk', status: 'new', score: 80,
    reasons: [], skills: ['Go', 'Postgres'], rawSalary: '£80k–£100k', direction: 'backend', state: 'active',
    createdAt: daysAgo(2), ...over,
  } as Lead;
}

describe('explainable scoring (plan 021A)', () => {
  it('a high-score active lead with pay and skills is strong', () => {
    const e = explainLead(lead());
    expect(e.verdict).toBe('strong');
    expect(e.gates.every((g) => g.pass)).toBe(true);
    expect(e.checks.find((c) => c.name === 'pay')?.pass).toBe(true);
    expect(e.checks.find((c) => c.name === 'requirements')?.pass).toBe(true);
    expect(e.checks.map((c) => c.name)).toEqual(['score', 'pay', 'requirements', 'direction', 'detail']);
  });

  it('a gated lead is never strong, however high the score', () => {
    for (const state of ['closed', 'hidden_scam', 'hidden_junk'] as const) {
      const e = explainLead(lead({ score: 100, state }));
      expect(e.verdict).toBe('skip');
      expect(e.gates.find((g) => g.name === 'live')?.pass).toBe(false);
    }
    for (const flag of ['channel_ad', 'mlm', 'digest', 'mystery_shopper'] as const) {
      const e = explainLead(lead({ score: 100, metadata: { qualityFlags: [flag] } }));
      expect(e.verdict).toBe('skip');
      expect(e.gates.find((g) => g.name === 'real-offer')?.pass).toBe(false);
    }
  });

  it('outstaff is a check note, not a hard gate', () => {
    const e = explainLead(lead({ score: 80, metadata: { qualityFlags: ['outstaff'] } }));
    expect(e.gates.find((g) => g.name === 'real-offer')?.pass).toBe(true);
    expect(e.verdict).toBe('strong'); // outstaff alone does not gate
  });

  it('verdict bands follow the score when no gate fails', () => {
    expect(explainLead(lead({ score: STRONG_AT })).verdict).toBe('strong');
    expect(explainLead(lead({ score: STRONG_AT - 1 })).verdict).toBe('stretch');
    expect(explainLead(lead({ score: STRETCH_AT })).verdict).toBe('stretch');
    expect(explainLead(lead({ score: STRETCH_AT - 1 })).verdict).toBe('skip');
  });

  it('checks reflect missing pay, skills and direction', () => {
    const e = explainLead(lead({ rawSalary: undefined, normalizedUsdMin: undefined, normalizedUsdMax: undefined, budget: undefined, skills: [], direction: 'other' }));
    expect(e.checks.find((c) => c.name === 'pay')?.pass).toBe(false);
    expect(e.checks.find((c) => c.name === 'requirements')?.pass).toBe(false);
    expect(e.checks.find((c) => c.name === 'direction')?.pass).toBe(false);
  });

  it('clamps out-of-range scores', () => {
    expect(explainLead(lead({ score: 250 })).checks.find((c) => c.name === 'score')?.note).toContain('100/100');
    expect(explainLead(lead({ score: -5 })).verdict).toBe('skip');
  });
});

describe('explainability in the public projection and UI', () => {
  it('the API carries checks, gates and verdict additively, score intact', async () => {
    const runtime = makeTestRuntime({ RADAR_PUBLIC_READ: true });
    const app = createApp(runtime);
    await runtime.store.createSource({ kind: 'ats', title: 'Acme', config: {} });
    await runtime.store.insertLead(lead({ id: 'strong' }));
    await runtime.store.insertLead(lead({ id: 'gated', score: 95, fingerprint: 'fp-gated', titleKey: 'tk-gated', url: 'https://jobs.ashbyhq.com/acme/2', metadata: { qualityFlags: ['mlm'] } }));
    const res = await app.request('/v2/feed?limit=200');
    const body = await res.json() as { leads: Array<Record<string, unknown>> };
    const strong = body.leads.find((l) => l.id === 'strong')!;
    const gated = body.leads.find((l) => l.id === 'gated')!;
    expect(strong.score).toBe(80); // numeric contract untouched
    expect(strong.verdict).toBe('strong');
    expect(Array.isArray(strong.checks)).toBe(true);
    expect(Array.isArray(strong.gates)).toBe(true);
    expect(gated.verdict).toBe('skip'); // gated by the mlm flag, despite score 95
    expect(gated.score).toBe(95); // score contract still intact
    await runtime.store.close();
  });

  it('the lead page renders the verdict and named checks', async () => {
    const runtime = makeTestRuntime({ RADAR_PUBLIC_READ: true });
    const app = createApp(runtime);
    await runtime.store.createSource({ kind: 'ats', title: 'Acme', config: {} });
    await runtime.store.insertLead(lead({ id: 'page' }));
    const res = await app.request('/leads/page');
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('verdict-ok');
    expect(html).toContain('Сильное совпадение');
    expect(html).toContain('explain-item');
    expect(html).toContain('Оценка и проверки');
    await runtime.store.close();
  });
});
