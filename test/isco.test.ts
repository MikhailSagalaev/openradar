import { describe, expect, it } from 'vitest';
import { classifyIsco08, matchesOccupationCodes, parseOccupationCodes } from '../src/core/isco.ts';
import { computeInsights } from '../src/core/market.ts';
import type { Lead } from '../src/core/types.ts';

function makeLead(partial: Partial<Lead>): Lead {
  return {
    id: partial.id ?? "lead-1",
    sourceId: "src",
    url: "https://example.com/1",
    title: partial.title ?? "Vacancy",
    text: partial.text ?? "Description",
    type: partial.type ?? "job",
    fingerprint: `fp-${partial.id ?? "1"}`,
    titleKey: "vacancy",
    status: "new",
    score: 50,
    reasons: [],
    skills: partial.skills ?? [],
    direction: partial.direction,
    isRemote: partial.isRemote ?? true,
    createdAt: "2026-11-10T00:00:00Z",
  };
}

describe('ISCO-08 occupation taxonomy (#61 [F-04])', () => {
  it('classifies software, web, application, DevOps, AI/ML, design, and HR leads into 4-digit ISCO-08 codes', () => {
    expect(classifyIsco08(makeLead({ title: 'Senior Backend Golang Developer', direction: 'backend' }))?.code).toBe('2512');
    expect(classifyIsco08(makeLead({ title: 'Frontend React Engineer', direction: 'frontend' }))?.code).toBe('2513');
    expect(classifyIsco08(makeLead({ title: 'Разработчик 1С:ЕРП', skills: ['1С'] }))?.code).toBe('2514');
    expect(classifyIsco08(makeLead({ title: 'Разработать Telegram-бота на Python', skills: ['Telegram Bot'] }))?.code).toBe('2514');
    expect(classifyIsco08(makeLead({ title: 'Senior DevOps / Kubernetes Engineer', direction: 'devops' }))?.code).toBe('2522');
    expect(classifyIsco08(makeLead({ title: 'ML / LLM Engineer', direction: 'ai' }))?.code).toBe('2120');
    expect(classifyIsco08(makeLead({ title: 'Senior Product Designer (Figma)', direction: 'design' }))?.code).toBe('2166');
    expect(classifyIsco08(makeLead({ title: 'IT Recruiter / Sourcer', direction: 'hr' }))?.code).toBe('2423');
    expect(classifyIsco08(makeLead({ title: 'QA Automation Engineer', direction: 'qa' }))?.code).toBe('2519');
  });

  it('parses and matches 2-, 3-, and 4-digit ISCO-08 codes and comma-separated lists', () => {
    const codes = parseOccupationCodes('2512, 2166; 242');
    expect(codes).toEqual(['2512', '2166', '242']);

    const backendLead = makeLead({ title: 'Senior Python Developer', direction: 'backend' });
    const designLead = makeLead({ title: 'UI/UX Designer', direction: 'design' });
    const hrLead = makeLead({ title: 'IT Recruiter', direction: 'hr' });
    const salesLead = makeLead({ title: 'B2B Sales Manager', direction: 'sales' });

    expect(matchesOccupationCodes(backendLead, codes)).toBe(true);
    expect(matchesOccupationCodes(designLead, codes)).toBe(true);
    expect(matchesOccupationCodes(hrLead, codes)).toBe(true); // matches prefix 242 -> 2423
    expect(matchesOccupationCodes(salesLead, codes)).toBe(false); // 2433 does not match
  });

  it('aggregates ISCO-08 occupations in computeInsights', () => {
    const leads = [
      makeLead({ id: '1', title: 'Go Developer', direction: 'backend' }),
      makeLead({ id: '2', title: 'Python Developer', direction: 'backend' }),
      makeLead({ id: '3', title: 'UI/UX Designer', direction: 'design' }),
    ];
    const insights = computeInsights(leads, 30);
    expect(insights.occupations).toEqual([
      { code: '2512', label: 'Software developers', count: 2, share_pct: 66.7 },
      { code: '2166', label: 'Graphic and multimedia designers', count: 1, share_pct: 33.3 },
    ]);
  });
});
