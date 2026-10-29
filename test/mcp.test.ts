import { describe, expect, it } from 'vitest';
import { handleMcpRequest, MCP_TOOLS, sinceInstant, type McpBackend } from '../src/mcp/server.ts';
import type { ListLeadsOptions } from '../src/core/store.ts';
import type { Lead } from '../src/core/types.ts';

function lead(overrides: Partial<Lead>): Lead {
  return {
    id: 'lead',
    sourceId: 'src',
    type: 'job',
    title: 'Title',
    text: 'Text',
    fingerprint: `fp-${overrides.id ?? 'lead'}`,
    titleKey: 'title',
    status: 'new',
    score: 50,
    reasons: [],
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

const LEADS: Lead[] = [
  lead({
    id: 'lead-go',
    type: 'job',
    title: 'Senior Golang Engineer',
    text: 'Microservices with Go, Kafka, PostgreSQL',
    budget: 450000,
    currency: 'RUB',
    skills: ['Golang', 'Kafka', 'PostgreSQL'],
    contacts: [{ type: 'telegram', value: '@hr_go' }],
  }),
  lead({
    id: 'lead-landing',
    type: 'gig',
    title: 'Landing Page in Next.js',
    text: 'Fast landing page with animations',
    budget: 50000,
    currency: 'RUB',
    skills: ['React', 'Next.js'],
  }),
];

const backend: McpBackend = {
  async listLeads(options) {
    return LEADS.filter((l) => !options.type || l.type === options.type)
      .filter((l) => !options.query || `${l.title} ${l.text}`.toLowerCase().includes(options.query.toLowerCase()));
  },
  async getLead(id) {
    return LEADS.find((l) => l.id === id) ?? null;
  },
};

type Content = { result?: { content?: Array<{ text: string }>; [key: string]: unknown }; error?: { code: number } };

async function call(name: string, args: Record<string, unknown> = {}): Promise<Content> {
  return (await handleMcpRequest(
    { jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name, arguments: args } },
    backend,
  )) as Content;
}

function parsed(resp: Content): any {
  return JSON.parse(resp.result?.content?.[0]?.text ?? 'null');
}

describe('MCP server', () => {
  it('answers initialize with a supported protocol version and tools capability', async () => {
    const resp = (await handleMcpRequest(
      { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05' } },
      backend,
    )) as Content;
    expect(resp.result?.protocolVersion).toBe('2024-11-05');
    expect(resp.result?.capabilities).toEqual({ tools: {} });
  });

  it('does not answer notifications', async () => {
    expect(await handleMcpRequest({ jsonrpc: '2.0', method: 'notifications/initialized' }, backend)).toBeNull();
  });

  it('lists the three tools', async () => {
    const resp = (await handleMcpRequest({ jsonrpc: '2.0', id: 2, method: 'tools/list' }, backend)) as Content;
    expect((resp.result?.tools as unknown[]).length).toBe(MCP_TOOLS.length);
    expect(MCP_TOOLS.map((t) => t.name)).toEqual(['search_leads', 'get_lead_details', 'get_market_analytics']);
  });

  it('searches by query, skills and minimum budget', async () => {
    const ids = async (args: Record<string, unknown>) => parsed(await call('search_leads', args)).results.map((l: Lead) => l.id);
    expect(await ids({ query: 'golang' })).toEqual(['lead-go']);
    expect(await ids({ skills: ['react', 'vue'] })).toEqual(['lead-landing']);
    expect(await ids({ min_budget: 100000 })).toEqual(['lead-go']);
  });

  it('hands the filters to the database and pages with next_offset', async () => {
    const seen: ListLeadsOptions[] = [];
    const many = Array.from({ length: 12 }, (_, i) => lead({ id: `l${i}`, title: `Разработчик ${i}`, isRemote: true }));
    const paging: McpBackend = {
      async listLeads(options) {
        seen.push(options);
        return many.slice(options.offset ?? 0, (options.offset ?? 0) + (options.limit ?? 50));
      },
      async getLead() {
        return null;
      },
    };
    const first = JSON.parse((await handleMcpRequest(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'search_leads', arguments: { market: 'ru', remote: true, skills: ['Python'], min_budget_rub: 100000, since: '24h' } } },
      paging,
    ) as Content).result!.content![0]!.text);
    expect(first.results).toHaveLength(10);
    expect(first.results[0]).toMatchObject({ id: 'l0', market: 'ru', where: 'remote' });
    expect(first.next_offset).toBe(10);
    expect(seen[0]).toMatchObject({ language: 'ru', remote: true, skill: 'Python', limit: 11, offset: 0 });
    expect(seen[0]!.minBudgetUsd).toBeGreaterThan(0);
    expect(Date.now() - Date.parse(seen[0]!.createdAfter!)).toBeLessThan(24 * 3_600_000 + 60_000);
    expect(sinceInstant('7d', new Date('2026-10-29T00:00:00Z'))).toBe('2026-10-22T00:00:00.000Z');
    expect(sinceInstant('nonsense')).toBeUndefined();
  });

  it('returns details with contacts as the backend provides them, and -32602 for unknown ids', async () => {
    const details = parsed(await call('get_lead_details', { id: 'lead-go' }));
    expect(details.contacts).toEqual([{ type: 'telegram', value: '@hr_go' }]);
    expect((await call('get_lead_details', { id: 'missing' })).error?.code).toBe(-32602);
  });

  it('computes market analytics', async () => {
    const stats = parsed(await call('get_market_analytics'));
    expect(stats.total_analyzed_leads).toBe(2);
    expect(stats.budget_samples_count).toBe(2);
    expect(stats.top_skills.length).toBeGreaterThan(0);
  });

  it('rejects unknown tools and methods', async () => {
    expect((await call('verify_lead_url', { lead_id: 'lead-go' })).error?.code).toBe(-32601);
    const resp = (await handleMcpRequest({ jsonrpc: '2.0', id: 3, method: 'resources/list' }, backend)) as Content;
    expect(resp.error?.code).toBe(-32601);
  });
});
