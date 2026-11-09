import { describe, expect, it } from 'vitest';
import { computeInsights, estimateMarket } from '../src/core/market.ts';
import type { Lead } from '../src/core/types.ts';

function lead(id: string, title: string, usd: number, type: 'job' | 'gig' = 'gig', skills: string[] = []): Lead {
  return {
    id, sourceId: 's', externalId: id, title, titleKey: id, text: title, fingerprint: id, type, skills,
    normalizedUsdMin: usd, normalizedUsdMax: usd, status: 'new', score: 60, reasons: [], createdAt: '2026-10-20T10:00:00.000Z',
  };
}

describe('market estimate', () => {
  const leads = [
    ...[30, 40, 50, 60, 70].map((usd, i) => lead(`logo${i}`, `Дизайн логотипа для кофейни ${i}`, usd)),
    ...[300, 400, 500].map((usd, i) => lead(`shop${i}`, `Интернет-магазин на React ${i}`, usd, 'gig', ['React'])),
    lead('job', 'Дизайнер логотипов', 2000, 'job'),
  ];

  it('takes percentiles of similar leads of the same type, in USD and roubles', () => {
    const e = estimateMarket({ title: 'Нужен логотип', type: 'gig' }, leads);
    expect(e.basis).toBe('similar');
    expect(e.count).toBe(5);
    expect(e.usd).toEqual({ p25: 40, median: 50, p75: 60 });
    expect(e.rub?.median).toBe(4000);
    expect(e.period).toBe('project');
  });

  it('gives no figure when nothing similar is priced: unrelated pay is no market', () => {
    const e = estimateMarket({ title: 'Видеомонтаж ролика', type: 'gig' }, leads);
    expect(e).toMatchObject({ basis: 'none', count: 0 });
    expect(e.usd).toBeUndefined();
  });

  it('reports no estimate with too few priced leads', () => {
    expect(estimateMarket({ title: 'Дизайнер', type: 'job' }, leads)).toMatchObject({ basis: 'none', count: 0 });
  });

  it('filters out corrupt sub-100 USD job salaries from market estimation', () => {
    const directorLeads = [
      lead('d1', 'Director, Revenue Operations', 14000, 'job'),
      lead('d2', 'Sr. Director, Revenue Operations', 20000, 'job'),
      lead('d3', 'Revenue Operations Lead', 22000, 'job'),
      lead('bad1', 'Director, Revenue Operations', 3, 'job'), // corrupt parsed amount
      lead('bad2', 'Director, Revenue Operations', 21, 'job'), // corrupt parsed amount
    ];
    const est = estimateMarket({ title: 'Director, Revenue Operations', type: 'job' }, directorLeads);
    expect(est.basis).toBe('similar');
    expect(est.count).toBe(3);
    expect(est.usd?.median).toBe(20000);
    expect(est.usd?.p25).toBeGreaterThanOrEqual(14000);
  });
  it('computes aggregate insights: trending skills, workplace share, pay percentiles, and AI exposure', () => {
    const sample = [
      { ...lead('j1', 'Senior Python LLM Engineer', 4000, 'job', ['Python', 'LLM']), workplaceType: 'remote' as const, direction: 'ai' },
      { ...lead('j2', 'Backend Go Developer', 3500, 'job', ['Golang', 'Python']), workplaceType: 'hybrid' as const, direction: 'backend' },
      { ...lead('j3', 'Frontend React Developer', 3000, 'job', ['React']), workplaceType: 'onsite' as const, isRemote: false, direction: 'frontend' },
    ];
    const insights = computeInsights(sample, 30);
    expect(insights.total_leads).toBe(3);
    expect(insights.trending_skills[0]).toEqual({ name: 'Python', count: 2, share_pct: 66.7 });
    expect(insights.workplace).toEqual({ remote: 1, hybrid: 1, onsite: 1, remote_share_pct: 33.3 });
    expect(insights.salary_percentiles.job.count).toBe(3);
    expect(insights.salary_percentiles.job.usd?.median).toBe(3500);
    expect(insights.ai_exposure).toEqual({ count: 1, share_pct: 33.3 });
  });
});
