import { describe, expect, it } from 'vitest';
import { DEFAULT_TIER_DELAY_MIN } from '../src/core/access.ts';
import { DEFAULT_TTL_ENV, indexableMinScore, isIndexable, NODE_INDEX_POLICY } from '../src/core/indexable.ts';
import { leadQuality, statedDeadline } from '../src/core/lead-quality.ts';
import { isPublicCard, selectPublicSimilar } from '../src/core/public-similar.ts';
import type { Lead } from '../src/core/types.ts';
import { getTranslations } from '../src/server/i18n.ts';
import {
  assembleSitemaps,
  catalogFactsParagraph,
  findCatalogEntry,
  renderCatalogIndex,
  renderCatalogPage,
  renderReviewPage,
} from '../src/server/seo.ts';
import { renderLeadPage } from '../src/server/ui.ts';

const NOW = Date.parse('2026-11-16T12:00:00.000Z');
const hub = { mode: 'hub' as const, delays: { ...DEFAULT_TIER_DELAY_MIN } };
const node = { mode: 'node' as const, delays: { ...DEFAULT_TIER_DELAY_MIN } };

function card(over: Partial<Lead> & { sourceKind?: string; atsCompanies?: string[] } = {}): Lead & { sourceKind?: string; atsCompanies?: string[] } {
  return {
    id: 'card',
    sourceId: 'src-1',
    title: 'Разработчик API',
    text: 'Короткий текст',
    fingerprint: 'fp',
    titleKey: 'key',
    status: 'new',
    score: 10,
    reasons: [],
    createdAt: '2026-11-15T00:00:00.000Z',
    type: 'job',
    company: 'Acme',
    budget: 10000,
    currency: 'RUB',
    skills: ['Python', 'Django'],
    city: 'Казань',
    ...over,
  };
}

const empty = {
  company: undefined,
  author: undefined,
  budget: undefined,
  skills: [] as string[],
  city: undefined,
  isRemote: false,
  workplaceType: undefined,
};

describe('leadQuality', () => {
  it('counts employer, budget, skills and place, and ignores a channel author', () => {
    expect(leadQuality(card()).score).toBe(4);
    expect(leadQuality(card())).toEqual(leadQuality(card()));
    expect(leadQuality(card(empty)).score).toBe(0);
    expect(leadQuality(card({ ...empty, author: 'Вакансии Frontend', sourceKind: 'telegram' })).checks.employer).toBe(false);
    expect(leadQuality(card({ ...empty, skills: ['Python'], text: 'Компания: Яндекс' })).checks.employer).toBe(false);
    expect(leadQuality(card({ ...empty, skills: ['Python'], metadata: { facts: { company: 'Яндекс' } } })).score).toBe(1);
    expect(leadQuality(card({ ...empty, author: 'Acme GmbH', sourceKind: 'hh' })).checks.employer).toBe(true);
    expect(leadQuality(card({ ...empty, company: 'acme', sourceKind: 'ats', atsCompanies: ['acme'] })).checks.employer).toBe(false);
    expect(leadQuality(card({ ...empty, author: 'Acme GmbH', sourceKind: 'ats', atsCompanies: ['acme=Acme GmbH'] })).checks.employer).toBe(true);
    expect(leadQuality(card({ ...empty, city: 'Онлайн', isRemote: true })).checks.place).toBe(true);
    expect(leadQuality(card({ ...empty, workplaceType: 'onsite' })).checks.place).toBe(false);
    expect(indexableMinScore(DEFAULT_TTL_ENV)).toBe(2);
    expect(isIndexable(card(), DEFAULT_TTL_ENV, NODE_INDEX_POLICY, NOW)).toBe(true);
    expect(isIndexable(card(empty), DEFAULT_TTL_ENV, NODE_INDEX_POLICY, NOW)).toBe(false);
    expect(isIndexable(card({ ...empty, city: 'Москва' }), DEFAULT_TTL_ENV, NODE_INDEX_POLICY, NOW)).toBe(false);
  });

  it('reads the threshold from the env object and still drops closed and expired leads when the gate is off', () => {
    const off = { ...DEFAULT_TTL_ENV, RADAR_INDEXABLE_MIN_QUALITY: 0 };
    expect(indexableMinScore(off)).toBe(0);
    expect(isIndexable(card(empty), off, NODE_INDEX_POLICY, NOW)).toBe(true);
    expect(isIndexable(card({ state: 'closed' }), off, NODE_INDEX_POLICY, NOW)).toBe(false);
    expect(isIndexable(card({ type: 'gig', createdAt: '2026-10-01T00:00:00.000Z' }), off, NODE_INDEX_POLICY, NOW)).toBe(false);
    expect(indexableMinScore({ RADAR_INDEXABLE_MIN_QUALITY: 9 })).toBe(2);
  });

  it('reads a deadline only when the lead already states one', () => {
    expect(statedDeadline({ text: 'Срок: 2 недели' })).toBe('2 недели');
    expect(statedDeadline({ metadata: { deadline: 'до пятницы' } })).toBe('до пятницы');
    expect(statedDeadline({ text: 'без срока' })).toBeUndefined();
  });
});

describe('public similar leads', () => {
  it('uses isIndexable, so a guest does not see fresh, thin, rejected or closed cards', () => {
    const now = new Date(NOW);
    const oldEnough = new Date(NOW - 13 * 3600_000).toISOString();
    const tooFresh = new Date(NOW - 60_000).toISOString();
    const candidates = [
      card({ id: 'self' }),
      card({ id: 'fresh', createdAt: tooFresh }),
      card({ id: 'old', createdAt: oldEnough, title: 'Старый подходящий' }),
      card({ id: 'thin', createdAt: oldEnough, ...empty }),
      card({ id: 'rejected', createdAt: oldEnough, status: 'rejected' }),
      card({ id: 'junk', createdAt: oldEnough, state: 'hidden_junk' }),
      card({ id: 'closed', createdAt: oldEnough, state: 'closed' }),
    ];
    expect(selectPublicSimilar(candidates, 'self', { env: DEFAULT_TTL_ENV, policy: hub, now, limit: 6 }).map((lead) => lead.id)).toEqual(['old']);
    expect(selectPublicSimilar(candidates, 'self', { env: DEFAULT_TTL_ENV, policy: node, now, limit: 6 }).map((lead) => lead.id)).toEqual(['fresh', 'old']);
    expect(isPublicCard(card({ id: 'thin', ...empty }), node, DEFAULT_TTL_ENV, now)).toBe(false);
  });
});

describe('lead card blocks', () => {
  const ru = getTranslations('ru');

  it('renders facts and origin from real fields and hides empty blocks', () => {
    const html = renderLeadPage({
      lead: card({
        id: 'self',
        url: 'https://example.com/order/1',
        text: 'Срок: 2 недели',
        sourceKind: 'hh',
      }),
      source: {
        id: 'src-1',
        kind: 'hh',
        title: 'Доска',
        enabled: true,
        config: {},
        createdAt: card().createdAt,
        updatedAt: card().createdAt,
      },
      version: 'test',
      indexEnv: DEFAULT_TTL_ENV,
      similar: [card({ id: 'old', title: 'Похожий заказ' })],
    });
    expect(html).toContain(ru.atAGlance);
    expect(html).toContain('<dt>Срок</dt><dd>2 недели</dd>');
    expect(html).toContain('Python');
    expect(html).toContain(ru.originHeading);
    expect(html).toContain('href="/leads/old"');
    expect(html).toContain('Похожие заказы');
    expect(html).not.toContain('Похожие лиды');
    expect(html).not.toContain('GigaChat');
    expect(html).not.toContain('gpt-4');
    expect(html).not.toContain('OpenAI');
    expect(html).not.toContain('noindex');
    expect(html).toContain('JobPosting');

    const bare = renderLeadPage({
      lead: card({ ...empty, sourceId: '', url: undefined, text: 'Коротко' }),
      version: 'test',
      similar: [],
    });
    expect(bare).not.toContain('class="lead-origin"');
    expect(bare).not.toContain('class="similar"');
    expect(bare).toContain('<meta name="robots" content="noindex">');
    expect(bare).not.toContain('JobPosting');
  });
});

describe('catalog facts', () => {
  const entry = findCatalogEntry('zakazy-na-razrabotku')!;

  it('counts skills from the sample and skips a budget range until there are five sums in one currency', () => {
    const sample = [
      card({ id: 'a', skills: ['Python', 'Django'], budget: 10000, currency: 'RUB' }),
      card({ id: 'b', skills: ['Python'], budget: 40000, currency: 'RUB' }),
      card({ id: 'c', skills: ['Go'], budget: 90000, currency: 'USD' }),
    ];
    const paragraph = catalogFactsParagraph({ openCount: 10, sample }, entry, 'ru');
    expect(paragraph).toContain('Сейчас открыто 10 заказов.');
    expect(paragraph).toContain('Среди 3 свежих карточек чаще всего: Python (2).');
    expect(paragraph).not.toContain('Бюджет');
    expect(paragraph).not.toContain('Django');
    expect(catalogFactsParagraph({ openCount: 0, sample }, entry, 'ru')).toBe('');

    const many = [10000, 20000, 30000, 80000, 90000].map((budget, index) => card({
      id: `p${index}`,
      skills: ['Python'],
      budget,
      currency: 'RUB',
    }));
    const ranged = catalogFactsParagraph({ openCount: 5, sample: many }, entry, 'ru');
    expect(ranged).toContain('RUB');
    expect(ranged).toMatch(/14[\s\u00a0\u202f]*000/);
    expect(ranged).toMatch(/86[\s\u00a0\u202f]*000/);
    expect(ranged).not.toMatch(/90[\s\u00a0\u202f]*000/);

    const html = renderCatalogPage({
      entry,
      leads: sample.slice(0, 20),
      baseUrl: 'https://openradar.fun',
      version: 'test',
      facts: { openCount: 10, sample },
    });
    expect(html).toContain('class="catalog-facts"');
    expect(html).toContain('href="https://openradar.fun/leads/a"');

    const index = renderCatalogIndex({
      baseUrl: 'https://openradar.fun',
      version: 'test',
      openCount: 4,
      fresh: [card({ id: 'fresh-1', title: 'Свежий заказ' })],
    });
    expect(index).toContain('Сейчас открыто 4 публикаций.');
    expect(index).toContain('href="/leads/fresh-1"');
    const plain = renderCatalogIndex({ baseUrl: 'https://openradar.fun', version: 'test' });
    expect(plain).not.toContain('Сейчас открыто');

    const review = renderReviewPage({ version: 'test', directions: [], direction: '', mine: 0 });
    expect(review).toContain('<meta name="robots" content="noindex">');
  });

  it('leaves a lead with no real signals out of the sitemap', () => {
    const bundle = assembleSitemaps({
      baseUrl: 'https://openradar.fun',
      env: DEFAULT_TTL_ENV,
      now: new Date(NOW),
      leads: [
        card({ id: 'good', createdAt: '2026-11-10T08:00:00.000Z' }),
        card({ id: 'thin', createdAt: '2026-11-10T08:00:00.000Z', ...empty }),
      ],
    });
    const xml = [...bundle.files.values()].join('\n');
    expect(xml).toContain('/leads/good');
    expect(xml).not.toContain('/leads/thin');
    expect(xml).not.toContain('/review');
  });
});
