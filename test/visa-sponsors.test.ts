import { describe, expect, it } from 'vitest';
import {
  buildSponsorIndex,
  ensureSponsorIndex,
  lookupSponsor,
  parseCsvLine,
  registerNameVariants,
  runVisaSponsors,
  sponsorCsvLink,
  UK_SPONSOR_PAGE,
} from '../src/research/visa-sponsors.ts';
import { createApp } from '../src/server/app.ts';
import { renderLeadPage } from '../src/server/ui.ts';
import type { Lead } from '../src/core/types.ts';
import { makeTestRuntime } from './helpers.ts';

const logger = { info() {}, warn() {}, error() {}, debug() {}, child() { return logger; } } as never;

/** The register's real header plus enough rows to pass the sanity floor. */
function registerCsv(extra: string[] = []): string {
  const filler = Array.from({ length: 1200 }, (_, i) => `Filler Sponsor ${i} Ltd,London,,Worker (A rating),Skilled Worker`);
  return [
    'Organisation Name,Town/City,County,Type & Rating,Route',
    ...filler,
    'Monzo Bank Ltd,London,,Worker (A rating),Skilled Worker',
    'Roofoods Ltd t/a Deliveroo,London,,Worker (A rating),Skilled Worker',
    'Google (UK) Limited,London,,Worker (A (Premium)),Skilled Worker',
    '"Acme, Labs Ltd",Cambridge,,Worker (A rating),Global Business Mobility',
    ...extra,
  ].join('\n');
}

const PAGE_HTML = `<html><body><a href="https://assets.publishing.service.gov.uk/media/x/SP_-_Worker_and_Temporary_Worker_Web_Register_-_2026-11-12.csv">CSV</a><a href="/csv-preview/x/SP_-_Worker_and_Temporary_Worker_Web_Register_-_2026-11-12.csv">preview</a></body></html>`;

/** A fetch double that serves the publication page and the register, counting calls. */
function registerFetch(csv: string, options: { pageStatus?: number; csvStatus?: number } = {}) {
  const calls: string[] = [];
  const fetchImpl = (async (url: string | URL) => {
    const u = String(url);
    calls.push(u);
    if (u === UK_SPONSOR_PAGE) return new Response(PAGE_HTML, { status: options.pageStatus ?? 200 });
    if (u.includes('.csv')) return new Response(csv, { status: options.csvStatus ?? 200 });
    throw new Error(`unexpected fetch: ${u}`);
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

describe('UK sponsor register parsing', () => {
  it('splits CSV records on commas outside quotes', () => {
    expect(parseCsvLine('Monzo Bank Ltd,London,,Worker (A rating),Skilled Worker')).toEqual(['Monzo Bank Ltd', 'London', '', 'Worker (A rating)', 'Skilled Worker']);
    expect(parseCsvLine('"Acme, Labs Ltd",Cambridge,,Worker (A rating),Route')).toEqual(['Acme, Labs Ltd', 'Cambridge', '', 'Worker (A rating)', 'Route']);
    expect(parseCsvLine('"He said ""hi""",x')).toEqual(['He said "hi"', 'x']);
  });

  it('indexes trading names and normalised legal names', () => {
    const index = buildSponsorIndex(registerCsv(), { registerDate: '2026-11-12', fetchedAt: '2026-11-13T00:00:00.000Z' });
    expect(index.rows).toBeGreaterThanOrEqual(1204);
    expect(index.registerDate).toBe('2026-11-12');
    // The licence holder and its trading name both resolve to the same row.
    expect(lookupSponsor(index, 'Deliveroo')?.name).toBe('Roofoods Ltd t/a Deliveroo');
    expect(lookupSponsor(index, 'Roofoods Ltd')?.name).toBe('Roofoods Ltd t/a Deliveroo');
    expect(lookupSponsor(index, 'Monzo Bank Limited')?.route).toBe('Skilled Worker');
    expect(lookupSponsor(index, 'Google (UK) Ltd')?.city).toBe('London');
    expect(lookupSponsor(index, 'Acme, Labs Ltd')?.route).toBe('Global Business Mobility');
    // Substring luck is not a match: "Heaven Revolution CIC" is not Revolut.
    expect(lookupSponsor(index, 'Revolut')).toBeUndefined();
    expect(lookupSponsor(index, 'Nobody Heard Ltd')).toBeUndefined();
  });

  it('keeps the first row of a name with several routes', () => {
    const csv = registerCsv(['Monzo Bank Ltd,London,,Worker (A rating),Global Business Mobility']);
    const index = buildSponsorIndex(csv, { fetchedAt: '2026-11-13T00:00:00.000Z' });
    expect(lookupSponsor(index, 'Monzo Bank Limited')?.route).toBe('Skilled Worker');
  });

  it('reads the attachment link and its edition date, skipping the preview', () => {
    const link = sponsorCsvLink(PAGE_HTML, UK_SPONSOR_PAGE);
    expect(link?.url).toBe('https://assets.publishing.service.gov.uk/media/x/SP_-_Worker_and_Temporary_Worker_Web_Register_-_2026-11-12.csv');
    expect(link?.registerDate).toBe('2026-11-12');
    expect(sponsorCsvLink('<html>no attachments</html>', UK_SPONSOR_PAGE)).toBeUndefined();
    const relative = sponsorCsvLink('<a href="/media/file.csv">x</a>', UK_SPONSOR_PAGE);
    expect(relative?.url).toBe('https://www.gov.uk/media/file.csv');
  });

  it('splits t/a and trading-as names', () => {
    expect(registerNameVariants('Roofoods Ltd t/a Deliveroo')).toEqual(['Roofoods Ltd t/a Deliveroo', 'Deliveroo', 'Roofoods Ltd']);
    expect(registerNameVariants('Foo Limited trading as Bar')).toEqual(['Foo Limited trading as Bar', 'Bar', 'Foo Limited']);
    expect(registerNameVariants('Plain Ltd')).toEqual(['Plain Ltd']);
  });
});

describe('register download discipline', () => {
  it('downloads once, caches for half a day and re-reads after', async () => {
    const runtime = makeTestRuntime();
    const { fetchImpl, calls } = registerFetch(registerCsv());
    const deps = { store: runtime.store, env: runtime.env, logger, fetchImpl };
    const t0 = new Date('2026-11-13T00:00:00.000Z');
    const first = await ensureSponsorIndex(deps, t0);
    expect(first?.byKey.size).toBeGreaterThan(1000);
    await ensureSponsorIndex(deps, new Date(t0.getTime() + 60 * 60 * 1000));
    expect(calls).toHaveLength(2); // page + csv, once
    await ensureSponsorIndex(deps, new Date(t0.getTime() + 13 * 60 * 60 * 1000));
    expect(calls).toHaveLength(4); // refreshed after the window
    await runtime.store.close();
  });

  it('backs off an hour after a failure and keeps no half-read index', async () => {
    const runtime = makeTestRuntime();
    const { fetchImpl, calls } = registerFetch(registerCsv(), { pageStatus: 503 });
    const deps = { store: runtime.store, env: runtime.env, logger, fetchImpl };
    const t0 = new Date('2026-11-13T00:00:00.000Z');
    expect(await ensureSponsorIndex(deps, t0)).toBeUndefined();
    expect(calls).toHaveLength(1);
    expect(await ensureSponsorIndex(deps, new Date(t0.getTime() + 30 * 60 * 1000))).toBeUndefined();
    expect(calls).toHaveLength(1); // still backing off
    await runtime.store.close();
  });

  it('refuses a register that is too small to be the register', async () => {
    const runtime = makeTestRuntime();
    const tiny = 'Organisation Name,Town/City,County,Type & Rating,Route\nOnly One Ltd,London,,Worker (A rating),Skilled Worker';
    const { fetchImpl } = registerFetch(tiny);
    const deps = { store: runtime.store, env: runtime.env, logger, fetchImpl };
    expect(await ensureSponsorIndex(deps, new Date('2026-11-13T00:00:00.000Z'))).toBeUndefined();
    await runtime.store.close();
  });
});

describe('visa sponsor matching', () => {
  async function setup() {
    const runtime = makeTestRuntime({ RADAR_PUBLIC_READ: true });
    const source = await runtime.store.createSource({ kind: 'rss', title: 'Лента', config: {}, enabled: true });
    const board = await runtime.store.createSource({ kind: 'ats', title: 'Monzo Bank Ltd', config: {}, enabled: true });
    const insert = (id: string, over: Partial<Lead> = {}) => runtime.store.insertLead({
      id, sourceId: source.id, type: 'job', title: `Role ${id}`, text: 'We are hiring engineers.', url: `https://example.test/${id}`,
      fingerprint: `fp-${id}`, titleKey: `key-${id}`, status: 'new', score: 50, reasons: [], skills: [],
      createdAt: new Date(Date.now() - 2 * 86_400_000).toISOString(), ...over,
    } as Lead);
    return { runtime, source, board, insert };
  }

  it('matches employers and board owners, never guesses a negative', async () => {
    const { runtime, board, insert } = await setup();
    await insert('monzo', { company: 'Monzo Bank Ltd' });
    await insert('deliveroo', { company: 'Deliveroo' });
    await insert('unknown', { company: 'Nobody Heard Ltd' });
    await insert('board-job', { sourceId: board.id });
    await insert('gig', { type: 'gig', company: 'Monzo Bank Ltd' } as Partial<Lead>);
    await insert('old', { company: 'Monzo Bank Ltd', createdAt: new Date(Date.now() - 30 * 86_400_000).toISOString() });
    const { fetchImpl } = registerFetch(registerCsv());
    const summary = await runVisaSponsors({ store: runtime.store, env: runtime.env, logger, fetchImpl });
    expect(summary).toEqual({ checked: 4, matched: 3 });

    const monzo = await runtime.store.getLead('monzo');
    expect((monzo?.metadata as Record<string, any>).visaSponsor).toMatchObject({ register: 'uk', name: 'Monzo Bank Ltd', route: 'Skilled Worker', matched: 'employer', registerDate: '2026-11-12' });
    const deliveroo = await runtime.store.getLead('deliveroo');
    expect((deliveroo?.metadata as Record<string, any>).visaSponsor.name).toBe('Roofoods Ltd t/a Deliveroo');
    const boardJob = await runtime.store.getLead('board-job');
    expect((boardJob?.metadata as Record<string, any>).visaSponsor.matched).toBe('board');
    // Absence from the register is not a verdict: no note, no "does not sponsor".
    const unknown = await runtime.store.getLead('unknown');
    expect((unknown?.metadata as Record<string, any>)?.visaSponsor).toBeUndefined();
    const gig = await runtime.store.getLead('gig');
    expect((gig?.metadata as Record<string, any>)?.visaSponsor).toBeUndefined();

    // A second round re-checks only the unmatched: the matched notes are left alone.
    const again = await runVisaSponsors({ store: runtime.store, env: runtime.env, logger, fetchImpl });
    expect(again).toEqual({ checked: 1, matched: 0 });
    await runtime.store.close();
  });

  it('does nothing when the register cannot be read', async () => {
    const { runtime, insert } = await setup();
    await insert('monzo', { company: 'Monzo Bank Ltd' });
    const { fetchImpl } = registerFetch(registerCsv(), { csvStatus: 500 });
    const summary = await runVisaSponsors({ store: runtime.store, env: runtime.env, logger, fetchImpl });
    expect(summary).toEqual({ checked: 0, matched: 0 });
    expect(((await runtime.store.getLead('monzo'))?.metadata as Record<string, any>)?.visaSponsor).toBeUndefined();
    await runtime.store.close();
  });
});

describe('visa sponsor projection', () => {
  const note = { register: 'uk', name: 'Monzo Bank Ltd', route: 'Skilled Worker', city: 'London', registerDate: '2026-11-12', checkedAt: '2026-11-13T00:00:00.000Z', matched: 'employer' } as const;

  function lead(over: Partial<Lead> = {}): Lead {
    return {
      id: 'l1', sourceId: 's1', type: 'job', title: 'Backend engineer', text: 'Build payments.', url: 'https://example.test/j1',
      fingerprint: 'fp1', titleKey: 'backend engineer', status: 'new', score: 60, reasons: [], skills: [],
      createdAt: new Date().toISOString(), company: 'Monzo Bank Ltd', ...over,
    } as Lead;
  }

  it('shows the register fact on the lead page, with the caveat', () => {
    const html = renderLeadPage({ lead: lead({ metadata: { visaSponsor: note } }), version: 'test', lang: 'ru' });
    expect(html).toContain('Визовое спонсорство');
    expect(html).toContain('Monzo Bank Ltd');
    expect(html).toContain('Skilled Worker');
    expect(html).toContain('не обещание спонсорства');
    expect(html).toContain('https://www.gov.uk/government/publications/register-of-licensed-sponsors-workers');
    const en = renderLeadPage({ lead: lead({ metadata: { visaSponsor: note } }), version: 'test', lang: 'en' });
    expect(en).toContain('Visa sponsorship');
    expect(en).toContain('not a promise that this role is sponsored');
    // No note, no row; gigs never show it.
    expect(renderLeadPage({ lead: lead(), version: 'test', lang: 'ru' })).not.toContain('Визовое спонсорство');
    expect(renderLeadPage({ lead: lead({ type: 'gig', metadata: { visaSponsor: note } }), version: 'test', lang: 'ru' })).not.toContain('Визовое спонсорство');
  });

  it('escapes a hostile register name', () => {
    const evil = { ...note, name: '<script>alert(1)</script>' };
    const html = renderLeadPage({ lead: lead({ metadata: { visaSponsor: evil } }), version: 'test', lang: 'ru' });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('exposes the note through the public API and only its own fields', async () => {
    const runtime = makeTestRuntime({ RADAR_PUBLIC_READ: true });
    const app = createApp(runtime);
    const source = await runtime.store.createSource({ kind: 'rss', title: 'Feed', config: {}, enabled: true });
    // Old enough to pass the guest tier delay.
    await runtime.store.insertLead(lead({ sourceId: source.id, createdAt: new Date(Date.now() - 3 * 86_400_000).toISOString() }));
    await runtime.store.saveLeadVisaSponsor!('l1', { ...note });
    const list = (await (await app.request('/api/leads')).json()) as Array<Record<string, any>>;
    expect(list[0]?.visaSponsor).toMatchObject({ register: 'uk', name: 'Monzo Bank Ltd', matched: 'employer' });
    const one = (await (await app.request('/api/leads/l1')).json()) as Record<string, any>;
    expect(one.visaSponsor.route).toBe('Skilled Worker');
    // A malformed note never reaches the public projection.
    await runtime.store.saveLeadVisaSponsor!('l1', { register: 'xx', name: 42 } as never);
    const after = (await (await app.request('/api/leads/l1')).json()) as Record<string, any>;
    expect(after.visaSponsor).toBeUndefined();
    await runtime.store.close();
  });
});
