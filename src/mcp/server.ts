/**
 * openradar Model Context Protocol (MCP) server.
 * A free machine interface over the same feed people read: the caller's tier
 * (delay, contacts) is applied by the backend it is given, never here.
 */

import { createInterface } from 'node:readline';
import type { LeadSort, ListLeadsOptions } from '../core/store.ts';
import { rubToUsd } from '../core/salary.ts';
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
    description:
      'Find job vacancies and freelance orders. Returns the best few in a compact form, newest or best first, with a next_offset to page on; ' +
      'call get_lead_details for the full text and contacts of the ones that fit. Narrow with market, remote, since and skills instead of reading many pages.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Keywords or tech stack, e.g. "Golang Kafka"' },
        type: { type: 'string', enum: ['job', 'gig'], description: 'job = employment, gig = freelance order' },
        market: { type: 'string', enum: ['ru', 'intl'], description: 'ru = Russian-language boards and channels, intl = the rest' },
        remote: { type: 'boolean', description: 'Only work that can be done remotely' },
        skills: { type: 'array', items: { type: 'string' }, description: 'At least one of these skills, e.g. ["Python", "Django"]' },
        min_budget_rub: { type: 'number', description: 'Minimum budget or monthly pay, in roubles (other currencies are converted)' },
        min_budget: { type: 'number', description: 'Minimum budget in the lead\'s own currency (prefer min_budget_rub)' },
        since: { type: 'string', description: 'Only posts newer than this: "24h", "7d" or an ISO date' },
        sort: { type: 'string', enum: ['new', 'score', 'budget'], description: 'new (default), score = best described first, budget = highest pay first; score and budget look at the last 7 days' },
        limit: { type: 'number', description: 'Results per call, 1-50 (default 10)' },
        offset: { type: 'number', description: 'next_offset from the previous call, to read the next page' },
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

/** Russian-language boards write titles in Cyrillic; the same rule as the feed's language filter. */
function marketOf(lead: Lead): 'ru' | 'intl' {
  return /[А-Яа-яЁё]/.test(lead.title) ? 'ru' : 'intl';
}

/** What an agent needs to pick a lead, a few lines each; the text comes with get_lead_details. */
function leadCompact(lead: Lead): Record<string, unknown> {
  return {
    id: lead.id,
    type: lead.type,
    title: lead.title,
    budget: lead.budget,
    currency: lead.budget !== undefined ? lead.currency : undefined,
    market: marketOf(lead),
    where: lead.isRemote ? 'remote' : lead.city,
    skills: lead.skills?.slice(0, 6),
    score: lead.score,
    url: lead.canonicalUrl || lead.url,
    published_at: lead.publishedAt || lead.createdAt,
  };
}

/** "24h", "7d" or an ISO date, as an ISO instant; undefined when it is none of these. */
export function sinceInstant(value: unknown, now: Date = new Date()): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const relative = value.trim().match(/^(\d{1,4})\s*([hd])$/i);
  if (relative) {
    const hours = Number(relative[1]) * (relative[2]!.toLowerCase() === 'd' ? 24 : 1);
    return new Date(now.getTime() - hours * 3_600_000).toISOString();
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : undefined;
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
      const limit = Math.max(1, Math.min(Number(args.limit) || 10, 50));
      const offset = Math.max(0, Math.min(Math.floor(Number(args.offset) || 0), 1000));
      const skills = Array.isArray(args.skills)
        ? args.skills.filter((s): s is string => typeof s === 'string' && s.trim().length > 0).map((s) => s.trim())
        : [];
      const minBudget = Number(args.min_budget);
      const minRub = Number(args.min_budget_rub);
      const sort: LeadSort = args.sort === 'score' || args.sort === 'budget' ? args.sort : 'new';
      const since = sinceInstant(args.since);
      // One skill and the rouble floor go to the database; several skills and a floor in the
      // lead's own currency are checked here, so a wider page is read for them.
      const filteredHere = skills.length > 1 || (Number.isFinite(minBudget) && minBudget > 0);
      const options: ListLeadsOptions = {
        query: typeof args.query === 'string' && args.query.trim() ? args.query.trim() : undefined,
        type: asType(args.type),
        language: args.market === 'ru' ? 'ru' : args.market === 'intl' ? 'en' : undefined,
        remote: args.remote === true || undefined,
        skill: skills.length === 1 ? skills[0] : undefined,
        minBudgetUsd: Number.isFinite(minRub) && minRub > 0 ? rubToUsd(minRub) : undefined,
        sort,
        createdAfter: since ?? (sort === 'new' ? undefined : new Date(Date.now() - 7 * 86_400_000).toISOString()),
        offset: filteredHere ? 0 : offset,
        limit: filteredHere ? 500 : limit + 1,
      };
      let leads = await backend.listLeads(options);
      if (Number.isFinite(minBudget) && minBudget > 0) {
        leads = leads.filter((lead) => (lead.budget ?? 0) >= minBudget);
      }
      if (skills.length > 1) {
        const wanted = new Set(skills.map((s) => s.toLowerCase()));
        leads = leads.filter((lead) => (lead.skills ?? []).some((skill) => wanted.has(skill.toLowerCase())));
      }
      const page = filteredHere ? leads.slice(offset, offset + limit + 1) : leads;
      const more = page.length > limit;
      return text(id, {
        results: page.slice(0, limit).map(leadCompact),
        next_offset: more ? offset + limit : undefined,
      });
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
