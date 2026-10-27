import { describe, expect, it } from 'vitest';
import { estimateMarket } from '../src/core/market.ts';
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
    expect(e.rub?.median).toBe(4600);
    expect(e.period).toBe('project');
  });

  it('falls back to all leads of the type when nothing similar is priced', () => {
    const e = estimateMarket({ title: 'Видеомонтаж ролика', type: 'gig' }, leads);
    expect(e.basis).toBe('type');
    expect(e.count).toBe(8);
  });

  it('reports no estimate with too few priced leads', () => {
    expect(estimateMarket({ title: 'Дизайнер', type: 'job' }, leads)).toMatchObject({ basis: 'none', count: 0 });
  });
});
