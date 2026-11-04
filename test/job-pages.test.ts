import { describe, expect, it } from 'vitest';
import { remoteFromText, remoteOfPosting } from '../src/core/extract.ts';
import { prepareRawLead } from '../src/core/prepare.ts';
import { extractAnchoredSalary, normalizeSalary } from '../src/core/salary.ts';
import { extractTechSkills } from '../src/core/text.ts';
import type { SourceRecord } from '../src/core/types.ts';
import { parsePayText } from '../src/research/derive.ts';
import { extractPreviewFromHtml } from '../src/server/preview.ts';
// @ts-ignore
import { extractJobPosting, moneyInText } from '../extension/content.js';

/** A real page: jobs.gem.com/groq, Kubernetes Platform Engineer, November 2026. */
const GEM_TEXT = `Location: This role will be based in one of our three hiring hubs: the Dallas, San Francisco, or New York City area. You'll have the flexibility to work remotely while we establish our local Groq office, with the expectation that this role will transition to onsite once the office opens.
Build production Kubernetes platform capabilities. Hands-on Kubernetes experience, including controllers/operators, CRDs, node management, scheduling. No problem is too big: go build it!
Compensation:
- Engineer: $184,800 - $250,000
- Sr. Engineer: $223,600 - $302,500`;

const GEM_BODY = `View all jobs
Kubernetes Platform Engineer, Infrastructure (GroqMetal)
Dallas-Fort Worth Area • San Francisco Bay Area • New York City Area
Platform Eng
In office
Full-time
About Groq
${GEM_TEXT}`;

function page(url: string, body: string, ld?: unknown, metas: Record<string, string> = {}) {
  return {
    title: metas['og:title'] ?? 'Page',
    location: { href: url },
    body: { innerText: body },
    querySelectorAll: () => (ld ? [{ textContent: JSON.stringify(ld) }] : []),
    querySelector: (selector: string) => {
      const name = /="([^"]+)"/.exec(selector)?.[1] ?? '';
      return metas[name] ? { getAttribute: () => metas[name] } : null;
    },
  };
}

describe('a vacancy that is remote only until the office opens', () => {
  it('is office work, even marked TELECOMMUTE', () => {
    expect(remoteOfPosting('TELECOMMUTE', GEM_TEXT)).toBe(false);
    expect(remoteOfPosting('TELECOMMUTE', 'Work from anywhere, occasional onsite visits')).toBe(true);
    expect(remoteOfPosting(undefined, 'Senior engineer, fully remote, no onsite visits')).toBe(true);
    expect(remoteOfPosting(undefined, 'Engineer in Berlin')).toBe(false);
    expect(remoteFromText('Работаем удалённо')).toBe(true);
    expect(remoteFromText('Инженер в Берлине')).toBeUndefined();
  });

  it('reads through a link preview without markup', () => {
    const html = `<html><head><title>Kubernetes Platform Engineer</title><meta property="og:description" content="${GEM_TEXT.replace(/\n/g, ' ')}"></head><body></body></html>`;
    expect(extractPreviewFromHtml(html, 'https://jobs.gem.com/groq/abc').isRemote).toBe(false);
  });
});

describe('levels of pay in one vacancy', () => {
  it('make one range with the period', () => {
    expect(extractAnchoredSalary(GEM_TEXT)).toEqual({ min: 184800, max: 302500 });
    const salary = normalizeSalary({ text: GEM_TEXT, budget: 302500, currency: 'USD', type: 'job' });
    expect(salary.rawSalary).toBe('184800–302500 USD per year');
    expect(salary.normalizedUsdMin).toBe(15400);
    expect(salary.normalizedUsdMax).toBe(25208);
  });

  it('leave a bonus out', () => {
    expect(extractAnchoredSalary('Salary $100,000 - $120,000, signing bonus $5,000 - $10,000')).toEqual({ min: 100000, max: 120000 });
  });

  it('keep a whole lead in dollars', () => {
    const source = { id: 's', kind: 'webhook', title: 'x', config: {} } as unknown as SourceRecord;
    const lead = prepareRawLead({ sourceId: 's', type: 'job', title: 'Engineer', text: GEM_TEXT, url: 'https://jobs.gem.com/groq/abc' }, source, new Date());
    expect(lead).toMatchObject({ currency: 'USD', rawSalary: '184800–302500 USD per year' });
  });

  it('read with a comma in research', () => {
    expect(parsePayText('Salary: $184,800 - $250,000 per year', 'job')).toMatchObject({ min: 184800, max: 250000, currency: 'USD', period: 'year' });
    expect(parsePayText('$120,000', 'job')).toMatchObject({ min: 120000 });
    expect(parsePayText('Команда 5, 120 000 ₽', 'job')).toMatchObject({ min: 120000 });
    expect(parsePayText('от 1,5 тыс ₽ в час', 'gig')).toMatchObject({ min: 1500 });
  });
});

describe('skills', () => {
  it('finds infrastructure and not English words', () => {
    const skills = extractTechSkills(`Kubernetes Platform Engineer\n${GEM_TEXT}`, 12);
    expect(skills).toContain('Kubernetes');
    expect(skills).not.toContain('Node.js');
    expect(skills).not.toContain('Golang');
    expect(extractTechSkills('Translate insights into plans', 12)).not.toContain('Переводы');
    expect(extractTechSkills('Backend на Go, Node.js и Golang', 12)).toEqual(expect.arrayContaining(['Golang', 'Node.js']));
    expect(extractTechSkills('Стек: Go, PostgreSQL, Kafka', 12)).toEqual(expect.arrayContaining(['Golang', 'PostgreSQL', 'Kafka']));
  });
});

describe('extension on boards like Gem', () => {
  const url = 'https://jobs.gem.com/groq/am9icG9zdDpeSFj39G';

  it('reads a page with no markup', () => {
    const doc = page(url, GEM_BODY, undefined, { 'og:title': 'Kubernetes Platform Engineer, Infrastructure (GroqMetal)', 'og:description': GEM_TEXT });
    expect(extractJobPosting(doc)).toMatchObject({
      company: 'Groq', isRemote: false, budget: 184800, salaryMax: 302500, currency: 'USD',
      city: 'Dallas-Fort Worth, San Francisco Bay, New York City',
    });
  });

  it('trusts the printed work mode over the markup and fills what it leaves out', () => {
    const doc = page(url, GEM_BODY, { '@type': 'JobPosting', title: 'Kubernetes Platform Engineer', description: 'Build platforms', hiringOrganization: { name: 'Groq' }, jobLocationType: 'TELECOMMUTE' });
    expect(extractJobPosting(doc)).toMatchObject({ company: 'Groq', isRemote: false, currency: 'USD', budget: 184800 });
  });

  it('leaves ordinary pages alone and reads a plain money range', () => {
    expect(extractJobPosting(page('https://example.com/blog/post', 'Text'))).toBeNull();
    expect(moneyInText('€60,000 – €80,000 a year')).toEqual({ budget: 60000, salaryMax: 80000, currency: 'EUR' });
  });
});
