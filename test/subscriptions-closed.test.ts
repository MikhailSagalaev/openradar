import { describe, expect, it } from 'vitest';
import type { SubscriptionRecord } from '../src/core/subscriptions.ts';
import type { Lead } from '../src/core/types.ts';
import { deliverLeadClosedToSubscriptions, type SubscriptionDeps } from '../src/pipeline/subscriptions.ts';
import { matchesSavedFilters } from '../src/server/filters.ts';
import { createTestStore, makeTestRuntime } from './helpers.ts';
import { MemoryStore } from '../src/store/memory.ts';

const T0 = new Date('2026-10-30T12:00:00.000Z');

function lead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: 'lead-1', sourceId: 's', title: 'Бот на Python', text: 'Подробности в посте', fingerprint: 'fp',
    titleKey: 'бот на python', status: 'new', score: 60, reasons: [], createdAt: new Date(T0.getTime() - 3600_000).toISOString(),
    budget: 30_000, currency: 'RUB', type: 'gig', skills: ['Python'],
    ...overrides,
  } as Lead;
}

function subscription(overrides: Partial<SubscriptionRecord> = {}): SubscriptionRecord {
  return {
    id: 'sub1', userId: 7, name: 'Python', filters: { skill: 'Python' }, channel: 'webhook',
    target: 'https://93.184.215.14/hook', secret: 'key', paused: false, cursorAt: T0.toISOString(),
    failures: 0, createdAt: T0.toISOString(), ...overrides,
  };
}

function world(options: { until?: Date } = {}) {
  const base = makeTestRuntime({ TELEGRAM_BOT_TOKEN: 'bot-token', RADAR_SUBSCRIPTION_BOT: true, RADAR_PUBLIC_URL: 'https://hub.example' });
  const store = new MemoryStore();
  const calls: Array<{ url: string; body: string; signature: string | undefined }> = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({ url: String(url), body: String(init.body), signature: (init.headers as Record<string, string>)['x-openradar-signature'] });
    return new Response('ok', { status: 200 });
  }) as typeof fetch;
  const deps: SubscriptionDeps = {
    store,
    env: base.env,
    logger: base.logger,
    fetchImpl,
    async leadsForUser() {
      // `until` is the instant the user's view reaches: the tier delay in one number.
      return { leads: [], until: (options.until ?? T0).toISOString() };
    },
    projectLead: (lead) => ({ id: lead.id, title: lead.title }),
  };
  return { deps, store, calls };
}

describe('matchesSavedFilters', () => {
  it('narrows by type, skill, IT set, language, budget and query words', () => {
    const probe = lead();
    expect(matchesSavedFilters(probe, { skill: 'python' })).toBe(true);
    expect(matchesSavedFilters(probe, { skill: 'Figma' })).toBe(false);
    expect(matchesSavedFilters(probe, { type: 'job' })).toBe(false);
    expect(matchesSavedFilters(probe, { it: true })).toBe(true);
    expect(matchesSavedFilters(probe, { it: true, type: 'job' })).toBe(false);
    expect(matchesSavedFilters(lead({ skills: ['Тексты'] }), { it: true })).toBe(false);
    expect(matchesSavedFilters(probe, { q: 'python бот' })).toBe(true);
    expect(matchesSavedFilters(probe, { q: 'python лендинг' })).toBe(false);
    expect(matchesSavedFilters(lead({ title: 'Ищем Golang-разработчика' }), { language: 'en' })).toBe(false);
    expect(matchesSavedFilters(lead({ title: 'Backend developer', budget: 3000, currency: 'USD', normalizedUsdMin: 3000 }), { budgetRub: 200000 })).toBe(true);
    expect(matchesSavedFilters(lead({ budget: 3000, currency: 'RUB' }), { budgetRub: 200000 })).toBe(false);
  });
});

describe('deliverLeadClosedToSubscriptions', () => {
  it('pushes a signed lead.closed webhook to every matching subscriber', async () => {
    const { deps, store, calls } = world();
    const owner = await store.upsertGitHubUser!({ githubId: 701, handle: 'subscriber' });
    await store.createSubscription!(subscription({ userId: owner.id }));
    await store.createSubscription!(subscription({ id: 'sub2', userId: owner.id, name: 'Другое', filters: { skill: 'Figma' } }));

    const round = await deliverLeadClosedToSubscriptions(deps, lead(), 'closed');

    expect(round).toEqual({ checked: 1, sent: 1, failed: 0 });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe('https://93.184.215.14/hook');
    expect(calls[0]!.signature).toBeTruthy();
    const payload = JSON.parse(calls[0]!.body) as any;
    expect(payload.event).toBe('lead.closed');
    expect(payload.reason).toBe('closed');
    expect(payload.lead.id).toBe('lead-1');
    expect(payload.lead.state).toBe('closed');
    expect(payload.closedAt).toBeTruthy();
  });

  it('does not announce a lead the subscriber could not see yet (tier delay)', async () => {
    const { deps, store, calls } = world({ until: new Date(T0.getTime() - 6 * 3600_000) });
    const owner = await store.upsertGitHubUser!({ githubId: 702, handle: 'late' });
    await store.createSubscription!(subscription({ userId: owner.id }));

    const round = await deliverLeadClosedToSubscriptions(deps, lead(), 'closed');

    // The lead is an hour old, the guest view reaches six hours back: nothing to announce.
    expect(round.checked).toBe(1);
    expect(round.sent).toBe(0);
    expect(calls).toHaveLength(0);
  });

  it('skips paused subscriptions and counts failures toward the pause threshold', async () => {
    const { deps, store, calls } = world();
    const owner = await store.upsertGitHubUser!({ githubId: 703, handle: 'paused' });
    await store.createSubscription!(subscription({ userId: owner.id, paused: true }));

    await deliverLeadClosedToSubscriptions(deps, lead(), 'closed');
    expect(calls).toHaveLength(0);

    const failing = world();
    await failing.store.upsertGitHubUser!({ githubId: 704, handle: 'failing' });
    const sub = subscription({ id: 'sub9', userId: 704, failures: 9 });
    await failing.store.createSubscription!(sub);
    failing.deps.fetchImpl = (async () => new Response('nope', { status: 500 })) as typeof fetch;
    const round = await deliverLeadClosedToSubscriptions(failing.deps, lead(), 'hidden_scam');
    expect(round.failed).toBe(1);
    const after = await failing.store.getSubscription!(sub.id);
    expect(after?.paused).toBe(true);
  });
});
