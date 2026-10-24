import { describe, expect, it } from 'vitest';
import { MemoryStore } from '../src/store/memory.ts';
import { handleMcpRequest, MCP_TOOLS } from '../src/mcp/server.ts';
import type { Lead } from '../src/core/types.ts';

function createSampleLeads(): Lead[] {
  return [
    {
      id: 'lead-mcp-1',
      sourceId: 'mesh',
      type: 'job',
      title: 'Senior Golang Engineer',
      text: 'Microservices with Go, Kafka, PostgreSQL in Highload FinTech',
      url: 'https://example.com/jobs/go',
      canonicalUrl: 'https://example.com/jobs/go',
      fingerprint: 'fp-mcp-1',
      titleKey: 'senior golang engineer',
      status: 'new',
      score: 90,
      budget: 450000,
      currency: 'RUB',
      skills: ['Golang', 'Kafka', 'PostgreSQL'],
      reasons: [],
      createdAt: new Date().toISOString(),
      verification_state: 'verified_active',
    },
    {
      id: 'lead-mcp-2',
      sourceId: 'kwork',
      type: 'gig',
      title: 'Landing Page in Next.js and Tailwind',
      text: 'Need a fast modern landing page with clean animations',
      url: 'https://example.com/gigs/landing',
      canonicalUrl: 'https://example.com/gigs/landing',
      fingerprint: 'fp-mcp-2',
      titleKey: 'landing page in nextjs',
      status: 'new',
      score: 70,
      budget: 50000,
      currency: 'RUB',
      skills: ['React', 'Next.js', 'Tailwind'],
      reasons: [],
      createdAt: new Date().toISOString(),
      verification_state: 'unverified',
    },
  ];
}

describe('Model Context Protocol (MCP) Server for AI Agents', () => {
  it('handles MCP initialize handshake compliant with protocol version', async () => {
    const store = new MemoryStore();
    const resp = await handleMcpRequest(
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'claude-desktop', version: '0.1' },
        },
      },
      store,
    );

    expect(resp.jsonrpc).toBe('2.0');
    expect(resp.id).toBe(1);
    expect(resp.result?.serverInfo?.name).toBe('openradar-mcp');
    expect(resp.result?.capabilities?.tools).toBeDefined();
  });

  it('lists all 4 standardized tools via tools/list', async () => {
    const store = new MemoryStore();
    const resp = await handleMcpRequest(
      {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
      },
      store,
    );

    expect(resp.result?.tools).toHaveLength(4);
    const toolNames = resp.result.tools.map((t: any) => t.name);
    expect(toolNames).toContain('search_leads');
    expect(toolNames).toContain('get_lead_details');
    expect(toolNames).toContain('verify_lead_url');
    expect(toolNames).toContain('get_market_analytics');
  });

  it('executes search_leads with semantic and parametric filters', async () => {
    const store = new MemoryStore();
    const leads = createSampleLeads();
    for (const l of leads) await store.insertLead(l);

    // Filter by query and min_budget
    const resp = await handleMcpRequest(
      {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: {
          name: 'search_leads',
          arguments: {
            query: 'Golang',
            min_budget: 100000,
            only_verified: true,
          },
        },
      },
      store,
    );

    expect(resp.result?.content?.[0]?.type).toBe('text');
    const parsed = JSON.parse(resp.result.content[0].text);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].id).toBe('lead-mcp-1');
    expect(parsed[0].title).toBe('Senior Golang Engineer');
  });

  it('executes get_lead_details returning complete verified metadata', async () => {
    const store = new MemoryStore();
    const leads = createSampleLeads();
    for (const l of leads) await store.insertLead(l);

    const resp = await handleMcpRequest(
      {
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: {
          name: 'get_lead_details',
          arguments: {
            id: 'lead-mcp-1',
          },
        },
      },
      store,
    );

    expect(resp.result?.content?.[0]?.type).toBe('text');
    const lead = JSON.parse(resp.result.content[0].text);
    expect(lead.id).toBe('lead-mcp-1');
    expect(lead.skills).toContain('Kafka');
    expect(lead.verification_state).toBe('verified_active');
  });

  it('executes verify_lead_url triggering immediate arbiter inspection', async () => {
    const store = new MemoryStore();
    const leads = createSampleLeads();
    for (const l of leads) await store.insertLead(l);

    const resp = await handleMcpRequest(
      {
        jsonrpc: '2.0',
        id: 5,
        method: 'tools/call',
        params: {
          name: 'verify_lead_url',
          arguments: {
            lead_id: 'lead-mcp-2',
          },
        },
      },
      store,
    );

    expect(resp.result?.content?.[0]?.type).toBe('text');
    const verdict = JSON.parse(resp.result.content[0].text);
    expect(verdict.lead_id).toBe('lead-mcp-2');
    expect(verdict.verdict).toBeDefined();
  });

  it('executes get_market_analytics returning skill counts and median budget', async () => {
    const store = new MemoryStore();
    const leads = createSampleLeads();
    for (const l of leads) await store.insertLead(l);

    const resp = await handleMcpRequest(
      {
        jsonrpc: '2.0',
        id: 6,
        method: 'tools/call',
        params: {
          name: 'get_market_analytics',
          arguments: {},
        },
      },
      store,
    );

    expect(resp.result?.content?.[0]?.type).toBe('text');
    const analytics = JSON.parse(resp.result.content[0].text);
    expect(analytics.total_analyzed_leads).toBe(2);
    expect(analytics.top_skills.length).toBeGreaterThan(0);
    expect(analytics.median_budget).toBeGreaterThan(0);
  });
});
