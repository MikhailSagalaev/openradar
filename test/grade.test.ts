import { describe, expect, it } from 'vitest';
import { MemoryStore } from '../src/store/memory.ts';
import { detectGrade } from '../src/research/derive.ts';
import { parseFeedFilters, matchesSavedFilters, filterOptions } from '../src/server/filters.ts';
import { applyDecisions } from '../src/pipeline/decide.ts';
import type { Lead } from '../src/core/types.ts';
import type { ModelDecision } from '../src/core/decisions.ts';
import type { Context } from 'hono';

describe('Seniority grade pipeline and store', () => {
  it('detects grades from job titles correctly', () => {
    expect(detectGrade('Junior Frontend Developer', 'React/TS')).toBe('junior');
    expect(detectGrade('Senior Go Engineer', 'highload')).toBe('senior');
    expect(detectGrade('Стажёр аналитик данных', 'Python/SQL')).toBe('intern');
    expect(detectGrade('Team Lead Python', 'команда')).toBe('lead');
    expect(detectGrade('Middle/Senior Java Developer', 'Spring Boot')).toBe('senior');
    expect(detectGrade('Middle Backend Developer', 'Node.js')).toBe('middle');
  });

  it('filters and counts grades in MemoryStore', async () => {
    const store = new MemoryStore();

    const makeLead = (id: string, grade?: string): Lead => ({
      id,
      sourceId: 'test-src',
      title: `Job ${id}`,
      text: 'Description',
      fingerprint: `fp-${id}`,
      titleKey: `key-${id}`,
      status: 'new',
      state: 'active',
      score: 80,
      reasons: [],
      grade,
      createdAt: new Date().toISOString(),
    });

    await store.insertLead(makeLead('l1', 'senior'));
    await store.insertLead(makeLead('l2', 'senior'));
    await store.insertLead(makeLead('l3', 'junior'));
    await store.insertLead(makeLead('l4', 'middle'));
    await store.insertLead(makeLead('l5')); // no grade

    // 1. listGrades
    const grades = await store.listGrades();
    expect(grades).toEqual([
      { slug: 'senior', total: 2 },
      { slug: 'junior', total: 1 },
      { slug: 'middle', total: 1 },
    ]);

    // 2. listLeads with grade filter
    const seniors = await store.listLeads({ grade: 'senior' });
    expect(seniors.map((l) => l.id).sort()).toEqual(['l1', 'l2']);

    const juniors = await store.listLeads({ grade: 'junior' });
    expect(juniors.map((l) => l.id)).toEqual(['l3']);

    // 3. applyLeadGrade
    await store.applyLeadGrade('l5', 'lead');
    const lead5 = await store.getLead('l5');
    expect(lead5?.grade).toBe('lead');

    const updatedGrades = await store.listGrades();
    expect(updatedGrades.find((g) => g.slug === 'lead')?.total).toBe(1);
  });

  it('parses feed grade filter and matches saved filters', () => {
    const fakeContext = (queryMap: Record<string, string>) => ({
      req: {
        query: (key: string) => queryMap[key],
      },
    } as unknown as Context);

    const filters = parseFeedFilters(fakeContext({ grade: 'Senior' }));
    expect(filters.grade).toBe('senior');

    const opts = filterOptions(filters);
    expect(opts.grade).toBe('senior');

    const lead: Lead = {
      id: 'test',
      sourceId: 'src',
      title: 'Senior Dev',
      text: 'Text',
      fingerprint: 'fp',
      titleKey: 'tk',
      status: 'new',
      score: 80,
      reasons: [],
      grade: 'senior',
      createdAt: new Date().toISOString(),
    };

    expect(matchesSavedFilters(lead, { grade: 'senior' })).toBe(true);
    expect(matchesSavedFilters(lead, { grade: 'junior' })).toBe(false);
  });

  it('applies model decision grade to lead via applyDecisions', async () => {
    const store = new MemoryStore();
    const lead: Lead = {
      id: 'lead-decide',
      sourceId: 'src',
      title: 'Developer',
      text: 'Text',
      fingerprint: 'fp',
      titleKey: 'tk',
      status: 'new',
      state: 'active',
      score: 70,
      reasons: [],
      createdAt: new Date().toISOString(),
    };
    await store.insertLead(lead);

    const decision: ModelDecision = {
      leadId: 'lead-decide',
      decidedAt: new Date().toISOString(),
      kind: 'vacancy',
      grade: 'middle',
      direction: 'backend',
      directionConfidence: 0.9,
    } as any;
    await store.saveModelDecision(decision);

    const summary = await applyDecisions({
      store,
      env: { RADAR_DECIDE_APPLY: true } as any,
    } as any, 10);
    expect(summary.directed).toBe(1);

    const updated = await store.getLead('lead-decide');
    expect(updated?.grade).toBe('middle');
    expect(updated?.direction).toBe('backend');
  });
});
