import { describe, expect, it } from 'vitest';
import { JOBSPY_COLUMNS, jobspyCsv, jobspyRow, siteSlugFor } from '../src/core/jobspy.ts';
import type { Lead } from '../src/core/types.ts';
import { TEST_NOW } from './helpers.ts';

function makeLead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: 'lead-1',
    sourceId: 'src-1',
    type: 'gig',
    title: 'Лендинг на Tilda',
    text: 'Нужен лендинг, бюджет 40 000 рублей',
    currency: 'RUB',
    paymentPeriod: 'fixed',
    isRemote: true,
    score: 60,
    status: 'new',
    skills: ['Tilda'],
    createdAt: TEST_NOW.toISOString(),
    votes_up: 0,
    votes_down: 0,
    votes_scam: 0,
    votes_closed: 0,
    ...overrides,
  } as Lead;
}

describe('JobSpy-compatible export', () => {
  it('uses the JobSpy column names, in order, with extra data columns', () => {
    expect(JOBSPY_COLUMNS).toEqual([
      'SITE', 'TITLE', 'COMPANY', 'DESCRIPTION', 'LOCATION', 'JOB_TYPE',
      'INTERVAL', 'MIN_AMOUNT', 'MAX_AMOUNT', 'CURRENCY', 'JOB_URL', 'POSTED_AT',
    ]);
  });

  it('maps a lead into one CSV row with amounts in the posting currency', () => {
    const lead = makeLead({
      budget: 40000,
      author: 'ООО Ромашка',
      city: 'Москва',
      canonicalUrl: 'https://kwork.ru/projects/1',
      publishedAt: '2026-10-29T10:00:00Z',
    });
    const row = jobspyRow(lead, 'kwork');
    expect(row).toContain('"kwork"');
    expect(row).toContain('"Лендинг на Tilda"');
    expect(row).toContain('"40000"');
    expect(row).toContain('"RUB"');
    expect(row).toContain('"https://kwork.ru/projects/1"');
    expect(row).toContain('"2026-10-29T10:00:00Z"');
    // gigs are not fulltime jobs
    expect(row).not.toContain('"fulltime"');
  });

  it('escapes quotes and newlines and defuses spreadsheet formulas', () => {
    const lead = makeLead({ title: 'Say "hi"', text: 'line1\nline2 =SUM(A1)', author: '=HYPERLINK("http://x")' });
    const row = jobspyRow(lead, 'rss');
    expect(row).toContain('"Say ""hi"""');
    expect(row).toContain('"line1 line2 =SUM(A1)"');
    expect(row).toContain("\"'=HYPERLINK(\"\"http://x\"\")\"");
  });

  it('writes a vacancy as fulltime with the monthly interval and USD normalization untouched', () => {
    const lead = makeLead({
      type: 'job',
      paymentPeriod: 'monthly',
      budget: 250000,
      currency: 'RUB',
      city: undefined,
    });
    const row = jobspyRow(lead, 'hh');
    expect(row).toContain('"fulltime"');
    expect(row).toContain('"monthly"');
    expect(row).toContain('"Remote"');
  });

  it('starts the document with a BOM and a header row', () => {
    const csv = jobspyCsv([makeLead()], (lead) => siteSlugFor(lead, new Map([['src-1', 'kwork']])).toUpperCase());
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.slice(1).split('\r\n')[0]).toBe(JOBSPY_COLUMNS.join(','));
  });

  it('derives the SITE slug from sourceRef.platform, falling back to the source kind', () => {
    const kinds = new Map([['src-1', 'kwork']]);
    expect(siteSlugFor(makeLead({ sourceRef: { platform: 'telegram', channel: '-100123', visibility: 'public' } }), kinds)).toBe('telegram');
    expect(siteSlugFor(makeLead(), kinds)).toBe('kwork');
    expect(siteSlugFor(makeLead(), new Map())).toBe('openradar');
  });
});
