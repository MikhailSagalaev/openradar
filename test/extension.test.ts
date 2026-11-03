import { describe, expect, it } from 'vitest';
// @ts-ignore
import { cleanText, findJobPosting, extractJobPosting, extractPageData } from '../extension/content.js';
// @ts-ignore
import { cleanCompanyName, categorizePersonas, buildXRayPlan } from '../extension/xray.js';

describe('extension content script JobPosting extractor', () => {
  it('cleans HTML text tags cleanly', () => {
    const raw = '<p>Hello <b>World</b>!</p><br/><ul><li>TypeScript</li><li>React</li></ul>';
    const cleaned = cleanText(raw);
    expect(cleaned).toContain('Hello World!');
    expect(cleaned).toContain('TypeScript');
    expect(cleaned).toContain('React');
    expect(cleaned).not.toContain('<p>');
    expect(cleaned).not.toContain('<li>');
  });

  it('finds JobPosting within direct and nested @graph structures', () => {
    const direct = {
      '@context': 'https://schema.org',
      '@type': 'JobPosting',
      title: 'Direct Job',
    };
    expect(findJobPosting(direct)?.title).toBe('Direct Job');

    const graph = {
      '@context': 'https://schema.org',
      '@graph': [
        { '@type': 'WebPage', name: 'Page' },
        { '@type': 'JobPosting', title: 'Graph Job' },
      ],
    };
    expect(findJobPosting(graph)?.title).toBe('Graph Job');
  });

  it('extracts structured JobPosting from mock document', () => {
    const mockJsonLd = {
      '@context': 'https://schema.org',
      '@type': 'JobPosting',
      title: 'Senior Frontend Engineer',
      description: '<p>Join our team to build <b>openradar</b>.</p>',
      hiringOrganization: {
        '@type': 'Organization',
        name: 'Acme Corp',
      },
      jobLocation: {
        '@type': 'Place',
        address: {
          '@type': 'PostalAddress',
          addressLocality: 'Москва',
        },
      },
      baseSalary: {
        '@type': 'MonetaryAmount',
        currency: 'RUB',
        value: {
          '@type': 'QuantitativeValue',
          minValue: 250000,
          maxValue: 350000,
        },
      },
      skills: ['TypeScript', 'React', 'CSS'],
      jobLocationType: 'TELECOMMUTE',
    };

    const mockDoc = {
      querySelectorAll(selector: string) {
        if (selector === 'script[type="application/ld+json"]') {
          return [{ textContent: JSON.stringify(mockJsonLd) }];
        }
        return [];
      },
      location: { href: 'https://example.com/jobs/123' },
      title: 'Page Title',
    };

    const extracted = extractJobPosting(mockDoc);
    expect(extracted).toBeTruthy();
    expect(extracted.type).toBe('job');
    expect(extracted.title).toBe('Senior Frontend Engineer');
    expect(extracted.company).toBe('Acme Corp');
    expect(extracted.city).toBe('Москва');
    expect(extracted.isRemote).toBe(true);
    expect(extracted.budget).toBe(250000);
    expect(extracted.salaryMax).toBe(350000);
    expect(extracted.currency).toBe('RUB');
    expect(extracted.skills).toEqual(['TypeScript', 'React', 'CSS']);
    expect(extracted.description).toContain('Join our team to build openradar.');
  });

  it('extracts OpenGraph metadata and selection when no JobPosting is present', () => {
    const mockDoc = {
      querySelectorAll() {
        return [];
      },
      querySelector(selector: string) {
        if (selector === 'meta[property="og:title"]') {
          return { getAttribute: () => 'OG Title: Freelance Project' };
        }
        if (selector === 'meta[property="og:description"]') {
          return { getAttribute: () => 'OG Description: Need a landing page in Next.js' };
        }
        return null;
      },
      getSelection() {
        return 'Selected spec fragment';
      },
      location: { href: 'https://kwork.ru/projects/456' },
      title: 'Kwork Default Title',
    };

    const data = extractPageData(mockDoc);
    expect(data).toBeTruthy();
    expect(data.title).toBe('OG Title: Freelance Project');
    expect(data.description).toBe('OG Description: Need a landing page in Next.js');
    expect(data.selection).toBe('Selected spec fragment');
    expect(data.detectedType).toBe('gig');
  });

  it('handles array of job locations and recognizes onsite transition', () => {
    const mockJsonLd = {
      '@context': 'https://schema.org',
      '@type': 'JobPosting',
      title: 'Audit and Compliance Program Manager',
      description: 'You will have the flexibility to work remotely while we establish our office, with expectation that this role will transition to onsite once office opens.',
      hiringOrganization: { name: 'Groq' },
      jobLocation: [
        { '@type': 'Place', address: { addressLocality: 'Dallas', addressRegion: 'TX' } },
        { '@type': 'Place', address: { addressLocality: 'San Francisco', addressRegion: 'CA' } },
      ],
      baseSalary: {
        currency: 'USD',
        value: { minValue: 186600, maxValue: 252400 },
      },
    };

    const mockDoc = {
      querySelectorAll(selector: string) {
        if (selector === 'script[type="application/ld+json"]') {
          return [{ textContent: JSON.stringify(mockJsonLd) }];
        }
        return [];
      },
      location: { href: 'https://jobs.gem.com/groq/123' },
      title: 'Audit and Compliance Program Manager',
    };

    const extracted = extractJobPosting(mockDoc);
    expect(extracted.city).toBe('Dallas, San Francisco');
    expect(extracted.isRemote).toBe(false);
    expect(extracted.currency).toBe('USD');
    expect(extracted.budget).toBe(186600);
    expect(extracted.salaryMax).toBe(252400);
  });

  describe('extension xray script', () => {
    it('cleans company name and creates 1-click dork links', () => {
      const plan = buildXRayPlan('ООО "Авито Тех"', 'Senior Frontend Engineer', ['React', 'TypeScript']);
      expect(plan.cleanCompany).toBe('Авито Тех');
      expect(plan.category).toBe('frontend');
      expect(plan.dorks).toHaveLength(4);

      const [linkedin, telegram, habr, github] = plan.dorks;
      expect(linkedin.query).toContain('site:linkedin.com/in/');
      expect(linkedin.query).toContain('"Авито Тех"');
      expect(linkedin.query).toContain('Frontend Lead');
      expect(linkedin.url).toContain('https://www.google.com/search?q=');

      expect(telegram.query).toContain('site:t.me');
      expect(habr.query).toContain('site:habr.com');
      expect(github.query).toContain('site:github.com');
      expect(plan.outreachTemplate).toContain('Авито Тех');
    });
  });
});
