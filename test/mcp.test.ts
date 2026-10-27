import { describe, expect, it } from 'vitest';
import { handleMcpRequest, MCP_TOOLS, type McpBackend } from '../src/mcp/server.ts';
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
    expect(parsed(await call('search_leads', { query: 'golang' })).map((l: Lead) => l.id)).toEqual(['lead-go']);
    expect(parsed(await call('search_leads', { skills: ['react'] })).map((l: Lead) => l.id)).toEqual(['lead-landing']);
    expect(parsed(await call('search_leads', { min_budget: 100000 })).map((l: Lead) => l.id)).toEqual(['lead-go']);
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
