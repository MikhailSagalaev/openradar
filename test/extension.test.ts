import { describe, expect, it } from 'vitest';
// @ts-ignore
import { cleanText, findJobPosting, extractJobPosting, extractPageData } from '../extension/content.js';
// @ts-ignore
import { cleanCompanyName, categorizePersonas, buildXRayPlan } from '../extension/xray.js';
// @ts-ignore
import { validateConnectFragment } from '../extension/connected.js';

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

  it('keeps an explicitly fully remote job remote despite a mention of onsite', () => {
    const posting = { '@context': 'https://schema.org', '@type': 'JobPosting', title: 'Backend engineer', description: 'Fully remote team, no onsite visits required.', hiringOrganization: { name: 'Acme' } };
    const doc = {
      querySelectorAll: (s: string) => (s === 'script[type="application/ld+json"]' ? [{ textContent: JSON.stringify(posting) }] : []),
      location: { href: 'https://example.com/jobs/1' },
      title: 'Backend engineer',
    };
    expect(extractJobPosting(doc).isRemote).toBe(true);
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

  describe('extension connect fragment validation', () => {
    const state = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
    const fragment = (overrides: Record<string, string> = {}) =>
      new URLSearchParams({ token: 'ext_' + 'ab'.repeat(32), base: 'https://hub.example', handle: 'octocat', state, ...overrides });

    it('accepts a valid token, https base and matching flow nonce', () => {
      const result = validateConnectFragment(fragment(), state);
      expect(result.ok).toBe(true);
      expect(result.token).toMatch(/^ext_/);
      expect(result.base).toBe('https://hub.example');
      expect(result.handle).toBe('octocat');
    });

    it('rejects a missing or mismatched flow nonce', () => {
      expect(validateConnectFragment(fragment(), undefined).ok).toBe(false);
      expect(validateConnectFragment(fragment(), '').ok).toBe(false);
      expect(validateConnectFragment(fragment(), 'ffffffff-0000-4000-8000-000000000000').ok).toBe(false);
      expect(validateConnectFragment(fragment({ state: '' }), state).ok).toBe(false);
    });

    it('rejects non-ext tokens', () => {
      expect(validateConnectFragment(fragment({ token: 'mcp_deadbeef' }), state).ok).toBe(false);
      expect(validateConnectFragment(fragment({ token: '' }), state).ok).toBe(false);
    });

    it('allows https hosts and loopback http only', () => {
      expect(validateConnectFragment(fragment({ base: 'http://evil.example' }), state).ok).toBe(false);
      expect(validateConnectFragment(fragment({ base: 'ftp://hub.example' }), state).ok).toBe(false);
      expect(validateConnectFragment(fragment({ base: 'not a url' }), state).ok).toBe(false);
      expect(validateConnectFragment(fragment({ base: 'http://127.0.0.1:8787' }), state).ok).toBe(true);
      expect(validateConnectFragment(fragment({ base: 'http://localhost:8787/' }), state).base).toBe('http://localhost:8787');
    });
  });
});
