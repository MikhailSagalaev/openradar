import { describe, expect, it } from 'vitest';
import { createApp } from '../src/server/app.ts';
import { makeTestRuntime } from './helpers.ts';
import { computeMinHashSketch } from '../src/core/fingerprint.ts';
import type { Lead } from '../src/core/types.ts';
import type { Runtime } from '../src/runtime.ts';

// @ts-expect-error - JavaScript extension content script
import { isJobDomain, renderXrayBar } from '../extension/content.js';

function createMockRuntime(): Runtime {
  const base = makeTestRuntime();
  return {
    ...base,
    fetchImpl: fetch,
  };
}

describe('Ghost Job & Salary X-Ray API & Extension', () => {
  it('rejects /api/v1/xray requests without url parameter', async () => {
    const runtime = createMockRuntime();
    const app = createApp(runtime);

    const res = await app.request('/api/v1/xray');
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('url query param required');
  });

  it('computes market salary distribution, duplicates, and source trust for lead', async () => {
    const runtime = createMockRuntime();
    const app = createApp(runtime);

    const baseText = 'Developing high throughput financial order matching engine in Go and Kafka.';
    const sketch = computeMinHashSketch(baseText);

    // Primary target lead
    const targetLead: Lead = {
      id: 'lead-xray-target',
      sourceId: 'src-1',
      type: 'job',
      title: 'Senior Go Core Engineer',
      text: baseText,
      url: 'https://hh.ru/vacancy/99887766',
      canonicalUrl: 'https://hh.ru/vacancy/99887766',
      fingerprint: 'fp-xray-1',
      titleKey: 'senior go core engineer',
      status: 'new',
      score: 85,
      reasons: [],
      createdAt: new Date().toISOString(),
      skills: ['Go', 'Kafka'],
      budget: 4500,
      currency: 'USD',
      normalizedUsdMin: 4000,
      normalizedUsdMax: 5000,
      minhash_sketch: sketch,
      verification_state: 'verified_active',
    };
    await runtime.store.createSource({ id: 'src-1', kind: 'webhook', title: 'XRay Source 1' });
    await runtime.store.createSource({ id: 'src-2', kind: 'webhook', title: 'XRay Source 2' });
    await runtime.store.insertLead(targetLead);

    // Duplicate lead (same titleKey / minHash)
    const duplicateLead: Lead = {
      id: 'lead-xray-dup',
      sourceId: 'src-2',
      type: 'job',
      title: 'Senior Go Core Engineer',
      text: baseText,
      url: 'https://career.habr.com/vacancies/10001',
      canonicalUrl: 'https://career.habr.com/vacancies/10001',
      fingerprint: 'fp-xray-2',
      titleKey: 'senior go core engineer',
      status: 'new',
      score: 80,
      reasons: [],
      createdAt: new Date().toISOString(),
      skills: ['Go'],
      budget: 4200,
      currency: 'USD',
      normalizedUsdMin: 3800,
      normalizedUsdMax: 4600,
      minhash_sketch: sketch,
    };
    await runtime.store.insertLead(duplicateLead);

    // Additional market leads
    for (let i = 1; i <= 5; i++) {
      await runtime.store.insertLead({
        id: `lead-market-${i}`,
        sourceId: 'src-1',
        type: 'job',
        title: `Go Developer Level ${i}`,
        text: `Backend microservices in Go. Stack: Go. Salary: ${3000 + i * 500}`,
        url: `https://example.com/job/${i}`,
        canonicalUrl: `https://example.com/job/${i}`,
        fingerprint: `fp-market-${i}`,
        titleKey: `go developer level ${i}`,
        status: 'new',
        score: 70,
        reasons: [],
        createdAt: new Date().toISOString(),
        skills: ['Go'],
        normalizedUsdMin: 3000 + i * 500,
      });
    }

    const res = await app.request('/api/v1/xray?url=https://hh.ru/vacancy/99887766');
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.found).toBe(true);
    expect(data.lead.id).toBe('lead-xray-target');
    expect(data.lead.title).toBe('Senior Go Core Engineer');
    expect(data.lead.verification_state).toBe('verified_active');

    // Duplicate detected
    expect(data.market.duplicate_count).toBeGreaterThanOrEqual(1);

    // Verified active source trust is high
    expect(data.source_trust).toBe(0.95);

    // Market distribution is populated
    expect(data.market.median_salary).toBeGreaterThan(0);
    expect(data.market.percentile_25).toBeLessThanOrEqual(data.market.median_salary);
    expect(data.market.percentile_75).toBeGreaterThanOrEqual(data.market.median_salary);
  });

  it('validates supported job domains in extension content script', () => {
    expect(isJobDomain('hh.ru')).toBe(true);
    expect(isJobDomain('career.habr.com')).toBe(true);
    expect(isJobDomain('www.linkedin.com')).toBe(true);
    expect(isJobDomain('kwork.ru')).toBe(true);
    expect(isJobDomain('upwork.com')).toBe(true);
    expect(isJobDomain('random-blog.xyz')).toBe(false);
  });

  it('renders Swiss-style X-Ray bar without any emoji', () => {
    // Minimal DOM mock
    const elements: any[] = [];
    const mockH1 = {
      tagName: 'H1',
      parentNode: {
        insertBefore: (newNode: any) => elements.push(newNode),
      },
    };
    const mockDoc = {
      getElementById: () => null,
      querySelector: () => mockH1,
      createElement: (tag: string) => ({
        tagName: tag.toUpperCase(),
        children: [] as any[],
        setAttribute: () => {},
        appendChild(child: any) {
          this.children.push(child);
        },
        style: {},
      }),
    };

    renderXrayBar(
      {
        market: {
          median_salary: 3500,
          percentile_25: 2500,
          percentile_75: 4500,
          duplicate_count: 2,
        },
        source_trust: 0.90,
      },
      mockDoc as any,
    );

    expect(elements).toHaveLength(1);
    const bar = elements[0];
    expect(bar.id).toBe('openradar-xray-bar');
    expect(bar.children[0].textContent).toBe('[ OpenRadar X-Ray ]');
    expect(bar.children[1].textContent).toContain('Вилка по рынку: $3500 ($2500–$4500)');
    expect(bar.children[1].textContent).toContain('Дубликаты: 2');
    expect(bar.children[1].textContent).toContain('Надежность источника: 90%');

    // Strict zero-emoji invariant check
    const fullText = `${bar.children[0].textContent} ${bar.children[1].textContent}`;
    expect(fullText).not.toMatch(/[\u{1F300}-\u{1F9FF}]/u);
  });
});
