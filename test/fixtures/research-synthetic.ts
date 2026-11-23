// Deterministic synthetic research records: enough variety (roles, grades, regions, cities,
// languages, intl hubs, orders) to exercise every report block. Used by the golden test.
import type { ResearchRecord } from '../../src/research/derive.ts';

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

export function syntheticRecords(seed = 42): ResearchRecord[] {
  const rnd = lcg(seed);
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)]!;
  const roles = ['backend', 'frontend', 'devops', 'qa', 'ml', 'analyst-data', 'mobile', '1c', 'product', 'other'] as const;
  const grades = ['intern', 'junior', 'middle', 'senior', 'lead', undefined] as const;
  const gradeMul: Record<string, number> = { intern: 0.4, junior: 0.6, middle: 1, senior: 1.6, lead: 2.1 };
  const regions = ['Москва', 'Санкт-Петербург', 'Другие города', 'Не указан'] as const;
  const regionMul: Record<string, number> = { 'Москва': 1.3, 'Санкт-Петербург': 1.15, 'Другие города': 0.85, 'Не указан': 1 };
  const cities: Record<string, readonly string[]> = {
    'Москва': ['Москва'],
    'Санкт-Петербург': ['Санкт-Петербург'],
    'Другие города': ['Екатеринбург', 'Новосибирск', 'Казань', 'Пермь'],
    'Не указан': [],
  };
  const languages = ['Python', 'Go', 'Java', 'TypeScript', 'Kotlin', undefined] as const;
  const platforms = ['hh.ru', 'habr-career', 'getmatch', 'telegram'] as const;
  const out: ResearchRecord[] = [];
  const months = ['2026-08', '2026-09', '2026-10', '2026-11'];
  for (let i = 0; i < 1400; i++) {
    const role = pick(roles);
    const grade = pick(grades);
    const remote = rnd() < 0.3;
    const region = remote ? 'Не указан' : pick(regions);
    const cityList = cities[region]!;
    const city = cityList.length ? pick(cityList) : undefined;
    const withPay = rnd() < 0.6;
    const base = 150_000 * (gradeMul[grade ?? 'middle'] ?? 1) * (remote ? 1.2 : regionMul[region]!) * (0.7 + rnd() * 0.6);
    const pay = Math.round(base / 1000) * 1000;
    const ranged = rnd() < 0.5;
    out.push({
      id: `j${i}`,
      date: `${pick(months)}-${String(1 + Math.floor(rnd() * 28)).padStart(2, '0')}`,
      type: 'job',
      platform: pick(platforms),
      role,
      grade,
      language: pick(languages),
      region,
      city,
      remote,
      company: `Co ${Math.floor(rnd() * 180)}`,
      skills: rnd() < 0.5 ? ['SQL', 'Docker'] : ['Git'],
      ai: rnd() < 0.2,
      market: withPay && rnd() < 0.05 ? 'intl' : 'ru',
      pay: withPay ? pay : undefined,
      payMin: withPay ? (ranged ? pay - 20_000 : pay) : undefined,
      payMax: withPay && ranged ? pay + 20_000 : undefined,
      payPeriod: withPay ? 'month' : undefined,
      currency: withPay ? 'RUB' : undefined,
      scope: 'ru',
    });
  }
  const hubs = [
    { city: 'New York', currency: 'USD' },
    { city: 'Berlin', currency: 'EUR' },
    { city: 'London', currency: 'GBP' },
    { city: 'Warsaw', currency: 'PLN' },
  ] as const;
  for (let i = 0; i < 360; i++) {
    const hub = pick(hubs);
    const grade = pick(grades);
    const remote = rnd() < 0.25;
    const usdYear = 90_000 * (gradeMul[grade ?? 'middle'] ?? 1) * (hub.currency === 'USD' ? 1.5 : hub.currency === 'PLN' ? 0.6 : 1) * (0.7 + rnd() * 0.6);
    const withPay = rnd() < 0.7;
    out.push({
      id: `x${i}`,
      date: `${pick(months)}-${String(1 + Math.floor(rnd() * 28)).padStart(2, '0')}`,
      type: 'job',
      platform: 'remoteok',
      role: pick(roles),
      grade,
      language: pick(languages),
      region: 'Не указан',
      city: remote ? undefined : hub.city,
      remote,
      company: `Global ${Math.floor(rnd() * 60)}`,
      skills: [],
      ai: rnd() < 0.3,
      market: 'intl',
      pay: withPay ? Math.round((usdYear * 80) / 12 / 1000) * 1000 : undefined,
      payPeriod: withPay ? 'month' : undefined,
      currency: hub.currency,
      scope: 'intl',
    });
  }
  for (let i = 0; i < 300; i++) {
    const withPay = rnd() < 0.7;
    out.push({
      id: `g${i}`,
      date: `${pick(months)}-${String(1 + Math.floor(rnd() * 28)).padStart(2, '0')}`,
      type: 'gig',
      platform: pick(['kwork', 'fl.ru', 'freelancehunt'] as const),
      role: pick(roles),
      region: 'Не указан',
      remote: true,
      skills: rnd() < 0.3 ? ['n8n', 'Python'] : rnd() < 0.5 ? ['копирайтинг'] : ['WordPress'],
      ai: rnd() < 0.25,
      pay: withPay ? Math.round((3000 + rnd() * 120_000) / 500) * 500 : undefined,
      payPeriod: withPay ? (rnd() < 0.1 ? 'hour' : 'project') : undefined,
      scope: i % 10 === 0 ? 'intl' : 'ru',
    });
  }
  return out;
}
