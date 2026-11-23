import { describe, expect, it } from 'vitest';
import {
  betaInc,
  chiSquareSf,
  cliffsDeltaMagnitude,
  correlationMagnitude,
  epsilonSqMagnitude,
  fSf,
  formatP,
  gammaP,
  gammaQ,
  holmAdjust,
  isConfirmed,
  logGamma,
  normalTwoSidedP,
  starsOf,
  studentTTwoSidedP,
} from '../src/research/stats.ts';
import { TECH_ROLES, buildReport, dist, monthPeriod } from '../src/research/report.ts';
import { renderReportPage } from '../src/research/pages.ts';
import { renderReportPageEn } from '../src/research/pages-en.ts';
import { syntheticRecords } from './fixtures/research-synthetic.ts';

const close = (actual: number, expected: number, tol = 1e-3) => expect(Math.abs(actual - expected)).toBeLessThan(tol);

describe('research stats: special functions', () => {
  it('log-gamma matches factorials and Γ(1/2) = √π', () => {
    close(logGamma(5), Math.log(24), 1e-12);
    close(logGamma(11), Math.log(3628800), 1e-10);
    close(logGamma(0.5), Math.log(Math.sqrt(Math.PI)), 1e-12);
    close(logGamma(1), 0, 1e-12);
  });

  it('incomplete gamma P + Q = 1 and P(1, x) = 1 − e^−x', () => {
    for (const x of [0.1, 1, 2.5, 10, 40]) {
      close(gammaP(1, x), 1 - Math.exp(-x), 1e-12);
      close(gammaP(3.5, x) + gammaQ(3.5, x), 1, 1e-12);
    }
  });

  it('incomplete beta: symmetric case and I_x(1, 1) = x', () => {
    close(betaInc(1, 1, 0.3), 0.3, 1e-12);
    close(betaInc(2, 2, 0.5), 0.5, 1e-12);
    close(betaInc(2, 3, 0.4), 1 - betaInc(3, 2, 0.6), 1e-12);
  });
});

describe('research stats: distribution tails against reference tables', () => {
  it('chi-square survival', () => {
    close(chiSquareSf(7.81, 3), 0.05);
    close(chiSquareSf(3.84, 1), 0.05);
    close(chiSquareSf(5.99, 2), 0.05);
    close(chiSquareSf(10.83, 1), 0.001, 1e-4);
    close(chiSquareSf(16.27, 3), 0.001, 1e-4);
    close(chiSquareSf(11.34, 3), 0.01, 1e-4);
    close(chiSquareSf(9.49, 4), 0.05);
    expect(chiSquareSf(0, 3)).toBe(1);
    expect(chiSquareSf(5000, 3)).toBeLessThan(1e-100);
  });

  it('Student t two-sided p', () => {
    close(studentTTwoSidedP(2.228, 10), 0.05);
    close(studentTTwoSidedP(1.96, 1e6), 0.05);
    close(studentTTwoSidedP(12.706, 1), 0.05);
    close(studentTTwoSidedP(4.587, 10), 0.001, 1e-4);
    close(studentTTwoSidedP(-2.228, 10), 0.05);
    expect(studentTTwoSidedP(0, 5)).toBe(1);
  });

  it('normal two-sided p', () => {
    close(normalTwoSidedP(1.96), 0.05);
    close(normalTwoSidedP(2.576), 0.01, 1e-4);
    close(normalTwoSidedP(3.291), 0.001, 1e-4);
    expect(normalTwoSidedP(0)).toBe(1);
  });

  it('F survival', () => {
    close(fSf(4.96, 1, 10), 0.05);
    close(fSf(3.0, 2, 1e6), 0.0498, 1e-3);
    close(fSf(3.10, 3, 20), 0.05);
  });
});

describe('research stats: inference helpers', () => {
  it('Holm adjustment is step-down, monotone and capped at 1', () => {
    const adj = holmAdjust([0.01, 0.04, 0.03, 0.005]);
    expect(adj.map((p) => Math.round(p * 1e6) / 1e6)).toEqual([0.03, 0.06, 0.06, 0.02]);
    expect(holmAdjust([0.6, 0.9])).toEqual([1, 1]);
    expect(holmAdjust([])).toEqual([]);
  });

  it('APA p formatting and stars', () => {
    expect(formatP(0.0004)).toBe('< 0.001');
    expect(formatP(0.0421)).toBe('0.042');
    expect(formatP(1)).toBe('1.000');
    expect(starsOf(0.0004)).toBe('***');
    expect(starsOf(0.004)).toBe('**');
    expect(starsOf(0.04)).toBe('*');
    expect(starsOf(0.05)).toBe('');
  });

  it('effect-size labels follow the published conventions', () => {
    expect(epsilonSqMagnitude(0.005)).toBe('negligible');
    expect(epsilonSqMagnitude(0.01)).toBe('small');
    expect(epsilonSqMagnitude(0.1)).toBe('medium');
    expect(epsilonSqMagnitude(0.3)).toBe('large');
    expect(cliffsDeltaMagnitude(-0.2)).toBe('small');
    expect(cliffsDeltaMagnitude(0.5)).toBe('large');
    expect(correlationMagnitude(-0.35)).toBe('medium');
  });

  it('decision rule needs adjusted significance AND a non-negligible effect', () => {
    expect(isConfirmed(1e-20, 'negligible')).toBe(false);
    expect(isConfirmed(0.2, 'large')).toBe(false);
    expect(isConfirmed(0.01, 'small')).toBe(true);
    expect(isConfirmed(0.01, 'large', false)).toBe(false);
  });
});

describe('research report: inference wiring and grouping', () => {
  const report = buildReport(syntheticRecords(), monthPeriod('2026-11'), 'month', new Date('2026-11-19T00:00:00Z'));

  it('pre-grouped matrices match a naive filter-per-group reference', () => {
    const jobs = syntheticRecords().filter((r) => r.type === 'job' && r.scope !== 'intl');
    const seen = new Set<string>();
    const repeated = new Set<string>();
    for (const r of jobs) {
      if (!r.company || r.pay === undefined) continue;
      const key = `${r.company.toLowerCase()}|${r.role}|${r.grade ?? ''}|${r.pay}`;
      if (seen.has(key)) repeated.add(r.id);
      else seen.add(key);
    }
    const paid = jobs.filter((r) => r.market === 'ru' && r.payPeriod === 'month' && r.pay !== undefined && !repeated.has(r.id));
    const med = (rs: typeof paid, min: number) => dist(rs.map((r) => r.pay!), min).median;
    expect(report.jobs.gradeMatrix!.length).toBeGreaterThan(3);
    for (const row of report.jobs.gradeMatrix!) {
      const rolePaid = paid.filter((r) => r.role === row.slug);
      expect(row.senior).toBe(med(rolePaid.filter((r) => r.grade === 'senior'), 5));
      expect(row.junior).toBe(med(rolePaid.filter((r) => r.grade === 'junior'), 5));
    }
    expect(report.jobs.regionalMatrix!.length).toBeGreaterThan(3);
    for (const row of report.jobs.regionalMatrix!) {
      const rolePaid = paid.filter((r) => r.role === row.slug);
      expect(row.moscow).toBe(med(rolePaid.filter((r) => r.region === 'Москва' && !r.remote), 5));
      expect(row.remote).toBe(med(rolePaid.filter((r) => r.remote), 5));
    }
    for (const role of report.jobs.roles) expect(role.n).toBe(jobs.filter((r) => r.role === role.slug).length);
    expect(report.jobs.byCity!.length).toBeGreaterThan(2);
    for (const city of report.jobs.byCity!) {
      expect(city.itPay?.median).toBe(med(paid.filter((r) => r.city === city.key && TECH_ROLES.has(r.role)), 5));
    }
  });

  it('hypotheses carry exact p, Holm-adjusted p and an effect-gated verdict', () => {
    for (const sci of [report.jobs.scientific!, report.jobs.intlResearch!.scientific!]) {
      const hs = sci.hypotheses;
      expect(hs.length).toBe(4);
      const adjusted = holmAdjust(hs.map((h) => h.p!));
      hs.forEach((h, i) => {
        expect(h.pAdjusted).toBeCloseTo(adjusted[i]!, 12);
        expect(h.pAdjusted!).toBeGreaterThanOrEqual(h.p!);
        expect(h.pValue).toBe(formatP(h.p!));
        const direction = h.id === 'H4' ? h.effectValue.startsWith('-') : h.id === 'H1' ? !h.statValue.includes('-') : true;
        expect(h.confirmed).toBe(h.pAdjusted! < 0.05 && h.effectMagnitude !== 'negligible' && direction);
      });
      const h2 = hs.find((h) => h.id === 'H2')!;
      const df = Number(/df = (\d+)/.exec(h2.statLabel)![1]);
      const H = Number(/H = ([\d.]+)/.exec(h2.statValue)![1]);
      expect(h2.p!).toBeCloseTo(chiSquareSf(H, df), 3);
      for (const c of sci.mincer!.coefficients) {
        expect(c.stars).toBe(starsOf(c.p!));
        expect(c.p!).toBeCloseTo(studentTTwoSidedP(c.beta / c.se, sci.mincer!.df!), 2);
      }
      expect(sci.mincer!.fPValue).toBe('< 0.001');
      for (const v of sci.varianceDecomposition) expect(v.pValue).toBe(formatP(v.p!));
    }
  });

  it('the English report renders the four order/demand sections the Russian one has, in English', () => {
    expect(report.editorialInsight).toBeDefined();
    expect(report.cartaCapital?.length).toBeGreaterThan(1);
    expect(report.bumpChart?.quarters.length).toBe(4);
    const en = renderReportPageEn({ report, baseUrl: 'https://openradar.fun', version: '0.0.0', snapshots: [] });
    const ru = renderReportPage({ report, baseUrl: 'https://openradar.fun', version: '0.0.0', snapshots: [] });
    for (const [html, marks] of [
      [ru, ['rs-insight-card', 'Заказы на фрилансе: число против суммы бюджетов', 'Типовые задачи и новые AI-задачи', 'Эволюция позиций направлений', 'id="embed-dialog"']],
      [en, ['rs-insight-card', 'Freelance orders: count versus total budget', 'Routine tasks and new AI tasks', 'How roles move in the demand ranking', 'id="embed-dialog"', 'function switchBump']],
    ] as const) {
      for (const mark of marks) expect(html).toContain(mark);
    }
    const sections = en.slice(en.indexOf('rs-insight-card'), en.indexOf('Key findings'));
    expect(sections).toContain('Backend developer');
    expect(sections).toContain('Basic copywriting and rewriting');
    expect(sections).not.toMatch(/Встроить|Скопировать|Специализация|Типовые задачи|Неделя|Бэкенд/);
  });

  it('Kruskal–Wallis uses the actual df when a group is dropped', () => {
    const base = syntheticRecords().filter((r) => !(r.type === 'job' && r.region === 'Санкт-Петербург' && !r.remote));
    const spb = base
      .filter((r) => r.type === 'job' && r.scope === 'ru' && r.role === 'backend' && r.pay !== undefined)
      .slice(0, 3)
      .map((r, i) => ({ ...r, id: `spb${i}`, region: 'Санкт-Петербург' as const, city: 'Санкт-Петербург', remote: false }));
    const r = buildReport([...base, ...spb], monthPeriod('2026-11'), 'month');
    const h2 = r.jobs.scientific!.hypotheses.find((h) => h.id === 'H2')!;
    expect(h2.statLabel).toContain('df = 2');
    const H = Number(/H = ([\d.]+)/.exec(h2.statValue)![1]);
    expect(h2.p!).toBeCloseTo(chiSquareSf(H, 2), 3);
  });
});
