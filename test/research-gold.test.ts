import { describe, expect, it, vi } from 'vitest';
import type { Lead } from '../src/core/types.ts';
import { classifyRole, deriveRecord } from '../src/research/derive.ts';
import { ensureFxRates, parseCbrRates } from '../src/research/fx.ts';
import { GOLD_COLUMNS, goldCsv, goldSample, parseCsv, scoreGold } from '../src/research/gold.ts';
import { makeTestRuntime } from './helpers.ts';

function lead(id: string, url: string, overrides: Partial<Lead> = {}): Lead {
  return {
    id, sourceId: 's', url, title: 'Python-разработчик', text: 'Текст, с запятой и "кавычками"\nОт 200 000 ₽', type: 'job', status: 'new',
    fingerprint: id, titleKey: id, score: 50, reasons: [], createdAt: '2026-11-03T10:00:00.000Z', publishedAt: '2026-11-03T10:00:00.000Z',
    ...overrides,
  } as unknown as Lead;
}

describe('gold set', () => {
  it('samples in equal shares and repeats itself', () => {
    const leads = [
      ...Array.from({ length: 50 }, (_, i) => lead(`hh${i}`, `https://hh.ru/vacancy/${i}`)),
      ...Array.from({ length: 5 }, (_, i) => lead(`fl${i}`, `https://www.fl.ru/projects/${i}`, { type: 'gig' })),
    ];
    const sample = goldSample(leads, 10);
    expect(sample.filter((l) => l.id.startsWith('fl'))).toHaveLength(5);
    expect(goldSample([...leads].reverse(), 10).map((l) => l.id).sort()).toEqual(sample.map((l) => l.id).sort());
  });

  it('writes a CSV that reads back, and scores against the labels', () => {
    const rows = parseCsv(goldCsv([lead('a', 'https://hh.ru/vacancy/1')]));
    expect(Object.keys(rows[0]!)).toEqual([...GOLD_COLUMNS]);
    expect(rows[0]!.text).toContain('"кавычками"\nОт 200 000');
    expect(rows[0]!.rules_pay).toBe('200000');

    const score = scoreGold([
      { ...rows[0]!, gold_is_post: '1', gold_role: rows[0]!.rules_role!, gold_pay: '210000', model_role: 'qa', model_pay: '500000' },
      { ...rows[0]!, gold_is_post: '1', gold_role: 'qa', gold_pay: '', model_role: 'qa' },
      { ...rows[0]!, gold_is_post: '0' },
      { ...rows[0]! },
    ]);
    expect(score).toMatchObject({ n: 3, notPosts: 1 });
    expect(score.rules.role).toEqual({ n: 2, right: 1 });
    expect(score.rules.pay).toEqual({ n: 1, right: 1 });
    expect(score.model.role).toEqual({ n: 2, right: 1 });
    expect(score.model.pay).toEqual({ n: 1, right: 0 });
  });
});

describe('Bank of Russia rates', () => {
  const xml = `<ValCurs><Valute ID="R01235"><NumCode>840</NumCode><CharCode>USD</CharCode><Nominal>1</Nominal><Name>x</Name><Value>80,5573</Value></Valute>
<Valute><CharCode>EUR</CharCode><Nominal>1</Nominal><Name>x</Name><Value>89,6603</Value></Valute>
<Valute><CharCode>GBP</CharCode><Nominal>1</Nominal><Name>x</Name><Value>107,7454</Value></Valute>
<Valute><CharCode>KZT</CharCode><Nominal>100</Nominal><Name>x</Name><Value>17,7552</Value></Valute>
<Valute><CharCode>BYN</CharCode><Nominal>1</Nominal><Name>x</Name><Value>27,3446</Value></Valute>
<Valute><CharCode>UAH</CharCode><Nominal>10</Nominal><Name>x</Name><Value>17,6935</Value></Valute>
<Valute><CharCode>JPY</CharCode><Nominal>100</Nominal><Name>x</Name><Value>52,0000</Value></Valute></ValCurs>`;

  it('reads rates per unit', () => {
    expect(parseCbrRates(xml)).toEqual({ USD: 80.5573, EUR: 89.6603, GBP: 107.7454, KZT: 0.1776, BYN: 27.3446, UAH: 1.7694 });
  });

  it('fetches a month once and converts pay at the rate of its month', async () => {
    const runtime = makeTestRuntime();
    const fetchImpl = vi.fn(async () => new Response(xml)) as unknown as typeof fetch;
    const now = new Date('2026-11-04T12:00:00Z');
    expect(await ensureFxRates(runtime.store, now, fetchImpl)).toEqual(['2026-10', '2026-11']);
    expect(await ensureFxRates(runtime.store, now, fetchImpl)).toEqual([]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);

    const post = lead('usd', 'https://example.com/1', { text: 'Оплата $2000 в месяц', title: 'Разработчик' });
    expect(deriveRecord(post, { fx: { '2026-11': { USD: 100 } } }).pay).toBe(200_000);
    expect(deriveRecord(post, { fx: await runtime.store.listFxRates!() }).pay).toBe(Math.round(2000 * 80.5573));
  });
});

describe('role rules', () => {
  it('keeps directors out of marketing and workplace safety out of security', () => {
    expect(classifyRole('job', 'Финансовый директор (CFO)')).not.toBe('marketing');
    expect(classifyRole('job', 'Специалист по Яндекс Директ')).toBe('marketing');
    expect(classifyRole('job', 'Инженер по охране труда и технике безопасности')).not.toBe('security');
    expect(classifyRole('job', 'Специалист по информационной безопасности')).toBe('security');
  });
});
