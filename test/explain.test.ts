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

  it('a rejected lead is never strong, however high the score and active the state', () => {
    // Production carried 4k+ rejected rows whose visibility state stayed 'active': the live
    // gate must read the pipeline status too, or the card shows green on rejected vacancies.
    for (const status of ['rejected', 'duplicate', 'failed'] as const) {
      const e = explainLead(lead({ score: 100, state: 'active', status }));
      expect(e.verdict).toBe('skip');
      expect(e.gates.find((g) => g.name === 'live')?.pass).toBe(false);
    }
    expect(explainLead(lead({ score: 100, status: 'rejected' })).gates.find((g) => g.name === 'live')?.note).toBe('отклонена при проверке');
    expect(explainLead(lead({ score: 100, status: 'duplicate' })).gates.find((g) => g.name === 'live')?.note).toBe('дубликат другой вакансии');
    expect(explainLead(lead({ score: 100, status: 'rejected' }), 'en').gates.find((g) => g.name === 'live')?.note).toBe('rejected by the pipeline');
    // Funnel statuses a reader sets are not rejections: the listing is still live.
    for (const status of ['new', 'delivered', 'interesting', 'applied', 'in_work'] as const) {
      expect(explainLead(lead({ score: 80, status })).verdict).toBe('strong');
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

  it('renders English gate and check notes when lang is en', () => {
    const en = explainLead(lead({ score: 85 }), 'en');
    expect(en.gates.find((g) => g.name === 'live')?.note).toBe('listing is active');
    expect(en.gates.find((g) => g.name === 'real-offer')?.note).toBe('single direct offer');
    expect(en.checks.find((c) => c.name === 'pay')?.note).toBe('pay stated');
  });
});

describe('explainability in the public projection and UI', () => {
  it('the API carries checks, gates and verdict additively, score intact', async () => {
    const runtime = makeTestRuntime({ RADAR_PUBLIC_READ: true });
    const app = createApp(runtime);
    const source = await runtime.store.createSource({ kind: 'ats', title: 'Acme', config: {} });
    await runtime.store.insertLead(lead({ id: 'strong', sourceId: source.id }));
    await runtime.store.insertLead(lead({ id: 'gated', sourceId: source.id, score: 95, fingerprint: 'fp-gated', titleKey: 'tk-gated', url: 'https://jobs.ashbyhq.com/acme/2', metadata: { qualityFlags: ['mlm'] } }));
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
    const source = await runtime.store.createSource({ kind: 'ats', title: 'Acme', config: {} });
    await runtime.store.insertLead(lead({ id: 'page', sourceId: source.id }));
    const res = await app.request('/leads/page');
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('verdict-ok');
    expect(html).toContain('Сильное совпадение');
    expect(html).toContain('explain-item');
    expect(html).toContain('Оценка и проверки');
    // The explanation is a full-width card, not a squeezed right-aligned dl row.
    expect(html).toContain('explain-card');
    expect(html).not.toContain('<dt>Оценка и проверки</dt>');
    // Grouped, labelled sections with a pass counter and per-check reasons.
    expect(html).toContain('Обязательные условия');
    expect(html).toContain('Проверки');
    expect(html).toContain('5 из 5');
    expect(html).toContain('data-tip="');
    expect(html).toContain('tabindex="0"');
    // The long explanatory hint under the checks is gone: the chips carry their own reasons.
    expect(html).not.toContain('explain-hint');
    expect(html).not.toContain('Вердикт складывается');
    await runtime.store.close();
  });

  it('a rejected lead shows the skip verdict to the admin who can see it', async () => {
    const runtime = makeTestRuntime({ RADAR_PUBLIC_READ: true, RADAR_ADMIN_TOKEN: 'test-admin-token' });
    const app = createApp(runtime);
    const source = await runtime.store.createSource({ kind: 'ats', title: 'Acme', config: {} });
    await runtime.store.insertLead(lead({ id: 'rejected-page', sourceId: source.id, score: 95, status: 'rejected', state: 'active', fingerprint: 'fp-rp', titleKey: 'tk-rp', url: 'https://jobs.ashbyhq.com/acme/10' }));
    const sessionId = 'admin-explain-session';
    await runtime.store.createSession?.(sessionId, new Date(Date.now() + 3600_000).toISOString());
    const res = await app.request('/leads/rejected-page', { headers: { cookie: `radar_session=${sessionId}` } });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('explain-card explain-bad');
    expect(html).toContain('verdict-bad');
    expect(html).toContain('Пропустить');
    expect(html).toContain('отклонена при проверке');
    expect(html).not.toContain('Сильное совпадение');
    await runtime.store.close();
  });

  it('a gated lead renders the skip verdict card with a failed gate', async () => {
    const runtime = makeTestRuntime({ RADAR_PUBLIC_READ: true });
    const app = createApp(runtime);
    const source = await runtime.store.createSource({ kind: 'ats', title: 'Acme', config: {} });
    await runtime.store.insertLead(lead({ id: 'gated-page', sourceId: source.id, score: 95, fingerprint: 'fp-gp', titleKey: 'tk-gp', url: 'https://jobs.ashbyhq.com/acme/9', metadata: { qualityFlags: ['mlm'] } }));
    const res = await app.request('/leads/gated-page');
    const html = await res.text();
    expect(html).toContain('explain-card explain-bad');
    expect(html).toContain('verdict-bad');
    expect(html).toContain('Пропустить');
    expect(html).toContain('explain-item fail');
    await runtime.store.close();
  });
});
