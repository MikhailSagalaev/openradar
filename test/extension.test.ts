import { describe, expect, it } from 'vitest';
// @ts-ignore
import { cleanText, findJobPosting, extractJobPosting, extractPageData } from '../extension/content.js';

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
      description: '<p>Join our team to build <b>OpenRadar</b>.</p>',
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
    expect(extracted.description).toContain('Join our team to build OpenRadar.');
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

  it('generates secp256k1 keys and performs local PII scrubbing for mesh broadcast', async () => {
    // @ts-ignore
    const { getOrCreateExtensionKey, scrubPIILocal, buildAndSignExtensionLead } = await import('../extension/crypto.js');

    const keypair = await getOrCreateExtensionKey();
    expect(keypair.pubKey).toMatch(/^[0-9a-f]{64}$/);
    expect(keypair.privKey).toMatch(/^[0-9a-f]{64}$/);
    expect(keypair.npub).toMatch(/^npub1/);
    expect(keypair.nsec).toMatch(/^nsec1/);

    const scrubbed = scrubPIILocal(
      'Ищем Go разработчика. Пишите в тг @alex_lead или на alex@work.com. Телефон +7 999 111-22-33.',
      'https://habr.com/vacancies/123',
    );
    expect(scrubbed.hasHiddenContacts).toBe(true);
    expect(scrubbed.isActionable).toBe(true);
    expect(scrubbed.text).not.toContain('@alex_lead');
    expect(scrubbed.text).not.toContain('alex@work.com');
    expect(scrubbed.text).not.toContain('+7 999 111-22-33');

    const event = await buildAndSignExtensionLead(
      {
        title: 'Senior Go Engineer',
        text: scrubbed.text,
        url: 'https://habr.com/vacancies/123',
        type: 'job',
        company: 'Habr Corp',
      },
      keypair,
    );

    expect(event.kind).toBe(30402);
    expect(event.pubkey).toBe(keypair.pubKey);
    expect(event.id).toMatch(/^[0-9a-f]{64}$/);
    expect(event.sig).toBeDefined();
    expect(event.tags).toContainEqual(['u', 'https://habr.com/vacancies/123']);
  });
});
