/**
 * OpenRadar Model Context Protocol (MCP) server.
 * A free machine interface over the same feed people read: the caller's tier
 * (delay, contacts) is applied by the backend it is given, never here.
 */

import { createInterface } from 'node:readline';
import type { ListLeadsOptions } from '../core/store.ts';
import type { Lead, LeadType } from '../core/types.ts';

export interface McpBackend {
  /** Feed leads as this caller may see them (already delayed and contact-projected). */
  listLeads(options: ListLeadsOptions): Promise<Lead[]>;
  /** One lead, or null when it does not exist or is not visible to this caller. */
  getLead(id: string): Promise<Lead | null>;
}

export interface McpTool {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export const MCP_TOOLS: McpTool[] = [
  {
    name: 'search_leads',
    description: 'Search job vacancies and freelance orders by keywords, type, skills and minimum budget.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Keywords or tech stack, e.g. "Golang Kafka"' },
        type: { type: 'string', enum: ['job', 'gig'], description: 'job = employment, gig = freelance order' },
        skills: { type: 'array', items: { type: 'string' }, description: 'At least one of these skills' },
        min_budget: { type: 'number', description: 'Minimum budget or salary in the lead currency' },
        limit: { type: 'number', description: 'Maximum results, 1-100 (default 20)' },
      },
    },
  },
  {
    name: 'get_lead_details',
    description: 'Full text, contacts (when the caller may see them), source and budget of one lead.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'Lead id from search_leads' } },
      required: ['id'],
    },
  },
  {
    name: 'get_market_analytics',
    description: 'Top requested skills and the median budget over the latest 200 visible leads.',
    inputSchema: {
      type: 'object',
      properties: { type: { type: 'string', enum: ['job', 'gig'] } },
    },
  },
];

const SUPPORTED_PROTOCOLS = ['2025-06-18', '2025-03-26', '2024-11-05'];

export interface McpRequest {
  jsonrpc: '2.0';
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

export interface McpResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

function text(id: McpResponse['id'], value: unknown): McpResponse {
  return { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] } };
}

function fail(id: McpResponse['id'], code: number, message: string): McpResponse {
  return { jsonrpc: '2.0', id, error: { code, message } };
}

function leadSummary(lead: Lead): Record<string, unknown> {
  return {
    id: lead.id,
    type: lead.type,
    title: lead.title,
    budget: lead.budget,
    currency: lead.currency,
    city: lead.city,
    remote: lead.isRemote,
    skills: lead.skills,
    url: lead.canonicalUrl || lead.url,
    published_at: lead.publishedAt || lead.createdAt,
  };
}

function leadDetails(lead: Lead): Record<string, unknown> {
  return {
    ...leadSummary(lead),
    text: lead.text,
    author: lead.author,
    contacts: lead.contacts ?? [],
    source: lead.sourceRef
      ? { platform: lead.sourceRef.platform, channel: lead.sourceRef.channelTitle ?? lead.sourceRef.channel, visibility: lead.sourceRef.visibility }
      : undefined,
    payment_period: lead.paymentPeriod,
    votes: { useful: lead.votes_up ?? 0, junk: lead.votes_down ?? 0, scam: lead.votes_scam ?? 0, closed: lead.votes_closed ?? 0 },
  };
}

function asType(value: unknown): LeadType | undefined {
  return value === 'job' || value === 'gig' ? value : undefined;
}

/**
 * Handles one JSON-RPC 2.0 message. Notifications (no `id`) get no response: null.
 */
export async function handleMcpRequest(req: McpRequest, backend: McpBackend): Promise<McpResponse | null> {
  const isNotification = req.id === undefined;
  const id = req.id ?? null;
  if (req?.jsonrpc !== '2.0' || typeof req.method !== 'string') {
    return isNotification ? null : fail(id, -32600, 'Invalid Request');
  }
  if (isNotification) return null;

  if (req.method === 'initialize') {
    const requested = typeof req.params?.protocolVersion === 'string' ? req.params.protocolVersion : '';
    return {
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: SUPPORTED_PROTOCOLS.includes(requested) ? requested : SUPPORTED_PROTOCOLS[0],
        capabilities: { tools: {} },
        serverInfo: { name: 'openradar-mcp', version: '2.0.0' },
      },
    };
  }
  if (req.method === 'ping') return { jsonrpc: '2.0', id, result: {} };
  if (req.method === 'tools/list') return { jsonrpc: '2.0', id, result: { tools: MCP_TOOLS } };
  if (req.method !== 'tools/call') return fail(id, -32601, `Unsupported method: ${req.method}`);

  const name = req.params?.name;
  const args = (req.params?.arguments ?? {}) as Record<string, unknown>;
  try {
    if (name === 'search_leads') {
      const limit = Math.max(1, Math.min(Number(args.limit) || 20, 100));
      let leads = await backend.listLeads({
        query: typeof args.query === 'string' ? args.query : undefined,
        type: asType(args.type),
        limit: 200,
      });
      const minBudget = Number(args.min_budget);
      if (Number.isFinite(minBudget) && minBudget > 0) {
        leads = leads.filter((lead) => (lead.budget ?? 0) >= minBudget);
      }
      if (Array.isArray(args.skills) && args.skills.length > 0) {
        const wanted = new Set(args.skills.filter((s): s is string => typeof s === 'string').map((s) => s.toLowerCase()));
        leads = leads.filter((lead) => (lead.skills ?? []).some((skill) => wanted.has(skill.toLowerCase())));
      }
      return text(id, leads.slice(0, limit).map(leadSummary));
    }

    if (name === 'get_lead_details') {
      const lead = typeof args.id === 'string' ? await backend.getLead(args.id) : null;
      if (!lead) return fail(id, -32602, `Lead not found: ${String(args.id)}`);
      return text(id, leadDetails(lead));
    }

    if (name === 'get_market_analytics') {
      const leads = await backend.listLeads({ type: asType(args.type), limit: 200 });
      const skills = new Map<string, number>();
      const budgets: number[] = [];
      for (const lead of leads) {
        for (const skill of lead.skills ?? []) {
          const key = skill.toLowerCase();
          skills.set(key, (skills.get(key) ?? 0) + 1);
        }
        if (typeof lead.budget === 'number' && lead.budget > 0) budgets.push(lead.budget);
      }
      budgets.sort((a, b) => a - b);
      return text(id, {
        total_analyzed_leads: leads.length,
        top_skills: [...skills.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([skill, count]) => ({ skill, count })),
        median_budget: budgets.length ? budgets[Math.floor(budgets.length / 2)] : 0,
        budget_samples_count: budgets.length,
      });
    }

    return fail(id, -32601, `Unknown tool: ${String(name)}`);
  } catch (err) {
    return fail(id, -32603, err instanceof Error ? err.message : String(err));
  }
}

/**
 * stdio transport for `radar mcp`: the local operator's console, full access.
 * Resolves when stdin closes.
 */
export function startMcpStdio(backend: McpBackend): Promise<void> {
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: false });
  rl.on('line', async (line: string) => {
    if (!line.trim()) return;
    let parsed: McpRequest;
    try {
      parsed = JSON.parse(line) as McpRequest;
    } catch {
      process.stdout.write(`${JSON.stringify(fail(null, -32700, 'Parse error: invalid JSON'))}\n`);
      return;
    }
    const resp = await handleMcpRequest(parsed, backend);
    if (resp) process.stdout.write(`${JSON.stringify(resp)}\n`);
  });
  return new Promise((resolve) => rl.on('close', () => resolve()));
}
