/**
 * OpenRadar Model Context Protocol (MCP) Server.
 * Exposes standardized AI Agent tools for desktop agents, IDE assistants, and automated SDRs.
 * Compliant with MCP JSON-RPC 2.0 specification.
 */

import { createInterface } from 'node:readline';
import type { Store, ViewerAccessContext } from '../core/store.ts';
import type { Lead, LeadType } from '../core/types.ts';
import { arbitrateLead } from '../pipeline/arbiter.ts';
import { viewerCanSeeLead } from '../core/access-tier.ts';

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
    description: 'Search vacancies and gig orders with semantic, stack, and budget filters.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search keywords or tech stack (e.g. "Golang Kafka")' },
        type: { type: 'string', enum: ['job', 'gig'], description: 'Filter by job (full-time) or gig (freelance/order)' },
        skills: { type: 'array', items: { type: 'string' }, description: 'Required skills list' },
        min_budget: { type: 'number', description: 'Minimum salary / budget filter' },
        currency: { type: 'string', description: 'Target currency code (USD, RUB, EUR)' },
        only_verified: { type: 'boolean', description: 'Show only arbiter-verified or attested leads' },
        limit: { type: 'number', description: 'Maximum number of results to return (default: 20)' },
      },
    },
  },
  {
    name: 'get_lead_details',
    description: 'Retrieve full cleaned lead text, verified channel handle, corporate career URL, and arbiter status.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Unique lead ID' },
      },
      required: ['id'],
    },
  },
  {
    name: 'verify_lead_url',
    description: 'Trigger an immediate on-demand arbiter check of the source URL via SSRF Guard.',
    inputSchema: {
      type: 'object',
      properties: {
        lead_id: { type: 'string', description: 'Lead ID to verify' },
      },
      required: ['lead_id'],
    },
  },
  {
    name: 'get_market_analytics',
    description: 'Returns 7-day market analytics: top demanded skills and median budget distributions.',
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['job', 'gig'], description: 'Optional filter by type' },
      },
    },
  },
];

export interface McpRequest {
  jsonrpc: '2.0';
  id?: string | number | null;
  method: string;
  params?: Record<string, any>;
}

export interface McpResponse {
  jsonrpc: '2.0';
  id?: string | number | null;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

/**
 * Handles incoming MCP JSON-RPC 2.0 messages.
 * The viewer's access tier applies everywhere: search, details and analytics
 * hide mesh-exclusive and still-locked (12h lag) leads from non-privileged keys.
 */
export async function handleMcpRequest(
  req: McpRequest,
  store: Store,
  viewer: ViewerAccessContext = { isAdmin: true },
): Promise<McpResponse> {
  const id = req.id ?? null;

  if (req.method === 'initialize') {
    return {
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: {
          tools: {},
        },
        serverInfo: {
          name: 'openradar-mcp',
          version: '1.0.0',
        },
      },
    };
  }

  if (req.method === 'tools/list') {
    return {
      jsonrpc: '2.0',
      id,
      result: {
        tools: MCP_TOOLS,
      },
    };
  }

  if (req.method === 'tools/call') {
    const toolName = req.params?.name;
    const args = req.params?.arguments || {};

    try {
      if (toolName === 'search_leads') {
        const leads = await store.getLeadsForFeed(viewer, {
          query: args.query,
          type: args.type as LeadType,
          limit: Math.min(100, Number(args.limit) || 20),
        });

        let filtered = leads;
        if (args.min_budget) {
          const minB = Number(args.min_budget);
          filtered = filtered.filter((l) => (l.budget ?? l.normalizedUsdMin ?? 0) >= minB);
        }
        if (args.only_verified) {
          filtered = filtered.filter(
            (l) => l.verification_state === 'attested' || l.verification_state === 'verified_active',
          );
        }
        if (Array.isArray(args.skills) && args.skills.length > 0) {
          const reqSkills = args.skills.map((s: string) => s.toLowerCase());
          filtered = filtered.filter((l) =>
            l.skills?.some((sk) => reqSkills.includes(sk.toLowerCase())),
          );
        }

        const simplified = filtered.map((l) => ({
          id: l.id,
          title: l.title,
          type: l.type,
          budget: l.budget,
          currency: l.currency,
          skills: l.skills,
          verification_state: l.verification_state || 'unverified',
          url: l.canonicalUrl || l.url,
          published_at: l.publishedAt || l.createdAt,
        }));

        return {
          jsonrpc: '2.0',
          id,
          result: {
            content: [
              {
                type: 'text',
                text: JSON.stringify(simplified, null, 2),
              },
            ],
          },
        };
      }

      if (toolName === 'get_lead_details') {
        const lead = await store.getLead(args.id);
        if (!lead || !viewerCanSeeLead(viewer, lead)) {
          return {
            jsonrpc: '2.0',
            id,
            error: { code: -32602, message: `Lead not found: ${args.id}` },
          };
        }

        return {
          jsonrpc: '2.0',
          id,
          result: {
            content: [
              {
                type: 'text',
                text: JSON.stringify(lead, null, 2),
              },
            ],
          },
        };
      }

      if (toolName === 'verify_lead_url') {
        const lead = await store.getLead(args.lead_id);
        if (!lead) {
          return {
            jsonrpc: '2.0',
            id,
            error: { code: -32602, message: `Lead not found: ${args.lead_id}` },
          };
        }

        const evaluation = await arbitrateLead(lead.id, { store });
        return {
          jsonrpc: '2.0',
          id,
          result: {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    lead_id: lead.id,
                    verdict: evaluation.verdict,
                    confidence: evaluation.confidence,
                    reason: evaluation.reason,
                    httpCode: evaluation.httpCode,
                  },
                  null,
                  2,
                ),
              },
            ],
          },
        };
      }

      if (toolName === 'get_market_analytics') {
        const leads = await store.getLeadsForFeed(viewer, {
          type: args.type as LeadType,
          limit: 200,
        });

        const skillCounts: Record<string, number> = {};
        const budgets: number[] = [];

        for (const l of leads) {
          if (l.skills && Array.isArray(l.skills)) {
            for (const s of l.skills) {
              const lower = s.toLowerCase();
              skillCounts[lower] = (skillCounts[lower] || 0) + 1;
            }
          }
          if (typeof l.budget === 'number' && l.budget > 0) {
            budgets.push(l.budget);
          }
        }

        const sortedSkills = Object.entries(skillCounts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 15)
          .map(([skill, count]) => ({ skill, count }));

        budgets.sort((a, b) => a - b);
        const medianBudget = budgets.length > 0 ? budgets[Math.floor(budgets.length / 2)] : 0;

        return {
          jsonrpc: '2.0',
          id,
          result: {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    total_analyzed_leads: leads.length,
                    top_skills: sortedSkills,
                    median_budget: medianBudget,
                    budget_samples_count: budgets.length,
                  },
                  null,
                  2,
                ),
              },
            ],
          },
        };
      }

      return {
        jsonrpc: '2.0',
        id,
        error: { code: -32601, message: `Method or tool not found: ${toolName}` },
      };
    } catch (err) {
      return {
        jsonrpc: '2.0',
        id,
        error: {
          code: -32603,
          message: err instanceof Error ? err.message : String(err),
        },
      };
    }
  }

  return {
    jsonrpc: '2.0',
    id,
    error: { code: -32601, message: `Unsupported method: ${req.method}` },
  };
}

/**
 * Runs the MCP stdio transport loop for CLI `radar mcp`.
 */
export function startMcpStdio(store: Store): void {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false,
  });

  rl.on('line', async (line: string) => {
    if (!line.trim()) return;
    try {
      const parsed = JSON.parse(line) as McpRequest;
      // stdio transport is the local operator's console: full access.
      const resp = await handleMcpRequest(parsed, store, { isAdmin: true });
      process.stdout.write(JSON.stringify(resp) + '\n');
    } catch {
      process.stdout.write(
        JSON.stringify({
          jsonrpc: '2.0',
          id: null,
          error: { code: -32700, message: 'Parse error: invalid JSON' },
        }) + '\n',
      );
    }
  });
}
