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

  it('signs via NIP-07 only, stores no keys, and performs local PII scrubbing', async () => {
    // @ts-ignore
    const cryptoModule = await import('../extension/crypto.js');
    const { buildAndSignExtensionLead, scrubPIILocal } = cryptoModule as Record<string, any>;

    // The extension must not even expose key generation: raw key material never
    // touches chrome.storage.
    expect(cryptoModule.generateRandomPrivKeyHex).toBeUndefined();
    expect(cryptoModule.getOrCreateExtensionKey).toBeUndefined();

    const scrubbed = scrubPIILocal(
      'Ищем Go разработчика. Пишите в тг @alex_lead или на alex@work.com. Телефон +7 999 111-22-33.',
      'https://habr.com/vacancies/123',
    );
    expect(scrubbed.hasHiddenContacts).toBe(true);
    expect(scrubbed.isActionable).toBe(true);
    expect(scrubbed.text).not.toContain('@alex_lead');
    expect(scrubbed.text).not.toContain('alex@work.com');
    expect(scrubbed.text).not.toContain('+7 999 111-22-33');

    const lead = {
      title: 'Senior Go Engineer',
      text: scrubbed.text,
      url: 'https://habr.com/vacancies/123',
      type: 'job',
      company: 'Habr Corp',
    };

    // Signing requires a NIP-07 signer: without window.nostr the event must
    // never be emitted, and no local key fallback may exist.
    await expect(buildAndSignExtensionLead(lead)).rejects.toThrow(/NIP-07/);

    const PUBKEY = 'a'.repeat(64);
    (globalThis as any).window = {
      nostr: {
        getPublicKey: async () => PUBKEY,
        // A real NIP-07 signer computes the event id and the BIP-340 signature
        signEvent: async (unsigned: { id?: string }) => ({
          ...unsigned,
          id: unsigned.id ?? 'e'.repeat(64),
          sig: 'ab'.repeat(64),
        }),
      },
    };
    try {
      const event = await buildAndSignExtensionLead(lead);

      expect(event.kind).toBe(30402);
      expect(event.pubkey).toBe(PUBKEY);
      expect(event.id).toMatch(/^[0-9a-f]{64}$/);
      expect(event.sig).toBe('ab'.repeat(64));
      expect(event.tags).toContainEqual(['u', 'https://habr.com/vacancies/123']);
    } finally {
      delete (globalThis as any).window;
    }
  });
});
