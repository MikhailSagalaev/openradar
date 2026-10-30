/**
 * OpenAPI 3.1 description of the public read API, plus an RFC 9727 API catalog
 * pointing at it. Written against the public lead projection (see toPublicLead
 * in app.ts): what is not in the projection is not in the schema.
 */

export function renderOpenApi(baseUrl: string): Record<string, unknown> {
  const lead = leadSchema();
  return {
    openapi: '3.1.0',
    info: {
      title: 'openradar public API',
      version: '1.0.0',
      description:
        'Read-only access to the openradar feed: job vacancies and freelance orders merged ' +
        'from boards, RSS and Telegram. Free, no key. Guests see the feed with a delay and ' +
        'without contact details; that is the same projection the web site shows. ' +
        'Attribution when you republish: openradar.fun (CC BY 4.0 for research data).',
      license: { name: 'AGPL-3.0 (code) / CC BY 4.0 (research data)', identifier: 'AGPL-3.0-only' },
    },
    servers: [{ url: baseUrl }],
    paths: {
      '/health': {
        get: {
          summary: 'Service health and version',
          responses: { '200': { description: 'Current version and source counters', content: { 'application/json': { schema: { type: 'object' } } } } },
        },
      },
      '/api/leads': {
        get: {
          summary: 'Search the lead feed',
          description: 'The same filters the web feed uses. `sort=score` and `sort=budget` look at the last 7 days only.',
          parameters: [
            q(), type(), { name: 'skill', in: 'query', schema: { type: 'string' }, description: 'Dictionary skill, exact match' },
            { name: 'budget', in: 'query', schema: { type: 'number' }, description: 'Minimum budget in roubles; converted to USD internally' },
            { name: 'language', in: 'query', schema: { type: 'string', enum: ['ru', 'en'] }, description: 'Title language' },
            { name: 'remote', in: 'query', schema: { type: 'string', enum: ['1'] }, description: 'Remote only' },
            { name: 'it', in: 'query', schema: { type: 'string', enum: ['1'] }, description: 'IT and adjacent trades only' },
            { name: 'sort', in: 'query', schema: { type: 'string', enum: ['new', 'score', 'budget'] } },
            { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 500, default: 50 } },
            { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1 } },
          ],
          responses: {
            '200': {
              description: 'Leads, newest first by default',
              content: { 'application/json': { schema: { type: 'array', items: lead } } },
            },
            '401': { $ref: '#/components/responses/Unauthorized' },
          },
        },
      },
      '/api/leads/{id}': {
        get: {
          summary: 'One lead card',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            '200': { description: 'The lead', content: { 'application/json': { schema: lead } } },
            '404': { description: 'Not found, or not yet visible to your tier' },
          },
        },
      },
      '/api/market': {
        get: {
          summary: 'Market pay estimate',
          description: 'Percentiles of pay for similar priced leads over the last 90 days, over what a guest may already see.',
          parameters: [
            { name: 'title', in: 'query', required: true, schema: { type: 'string', minLength: 3, maxLength: 300 }, description: 'What the client needs, e.g. "лендинг на Tilda"' },
            type(),
            { name: 'skills', in: 'query', schema: { type: 'string' }, description: 'Comma-separated skills, up to 12' },
          ],
          responses: {
            '200': {
              description: 'Estimate with the basis used',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: ['basis', 'count', 'type', 'period', 'skills'],
                    properties: {
                      basis: { type: 'string', enum: ['similar', 'skills', 'type', 'none'] },
                      count: { type: 'integer' },
                      type: { type: 'string', enum: ['job', 'gig'] },
                      period: { type: 'string', enum: ['month', 'project'] },
                      skills: { type: 'array', items: { type: 'string' } },
                      usd: rangeSchema(),
                      rub: rangeSchema(),
                      examples: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, title: { type: 'string' }, usd: { type: 'number' } } } },
                    },
                  },
                },
              },
            },
            '400': { description: 'title shorter than 3 characters' },
          },
        },
      },
      '/api/delta': {
        get: {
          summary: 'Changes since a moment, for synchronising tools',
          parameters: [
            { name: 'since', in: 'query', schema: { type: 'string', format: 'date-time' } },
            { name: 'limit', in: 'query', schema: { type: 'integer', maximum: 1000, default: 200 } },
            { name: 'format', in: 'query', schema: { type: 'string', enum: ['json', 'ndjson'] } },
          ],
          responses: { '200': { description: 'Lead changes', content: { 'application/json': { schema: { type: 'object' } }, 'application/x-ndjson': { schema: { type: 'string' } } } } },
        },
      },
      '/v2/feed': {
        get: {
          summary: 'radar/2 feed with cursor pagination',
          description: 'Cursor walks forward in time with `sort=new` (the default). Sends `x-radar-delay-minutes` and `x-radar-cursor` headers.',
          parameters: [
            { name: 'cursor', in: 'query', schema: { type: 'string' }, description: 'From x-radar-cursor of the previous page' },
            { name: 'limit', in: 'query', schema: { type: 'integer', maximum: 200, default: 50 } },
            q(), type(),
          ],
          responses: {
            '200': { description: 'Feed page and cursor', content: { 'application/json': { schema: { type: 'object' } }, 'application/x-ndjson': { schema: { type: 'string' } } } },
            '401': { $ref: '#/components/responses/Unauthorized' },
          },
        },
      },
      '/v2/stream': {
        get: {
          summary: 'Server-sent events stream of new leads',
          description: 'SSE; event `lead`, the payload is the lead projection. Guests receive leads after their tier delay.',
          responses: { '200': { description: 'text/event-stream', content: { 'text/event-stream': { schema: { type: 'string' } } } } },
        },
      },
      '/mcp': {
        get: {
          summary: 'Model Context Protocol server',
          description: 'Streamable HTTP MCP with tools search_leads, get_lead_details, get_market_stats. Keyless guest access; a signed participant key raises the tier.',
          responses: { '200': { description: 'JSON-RPC over MCP; see https://modelcontextprotocol.io' } },
        },
      },
    },
    components: {
      responses: {
        Unauthorized: { description: 'The hub is not in public-read mode' },
      },
      schemas: { Lead: lead, UsdRange: rangeSchema() },
    },
  };
}

function q(): Record<string, unknown> {
  return { name: 'q', in: 'query', schema: { type: 'string' }, description: 'Full-text search over title and text' };
}

function type(): Record<string, unknown> {
  return { name: 'type', in: 'query', schema: { type: 'string', enum: ['job', 'gig'] }, description: 'job = employment, gig = an order' };
}

function leadSchema(): Record<string, unknown> {
  return {
    type: 'object',
    description: 'A merged vacancy or order. Fields the viewer may not see (contacts for guests, pipeline internals) are absent.',
    properties: {
      id: { type: 'string' },
      type: { type: 'string', enum: ['job', 'gig'] },
      title: { type: 'string' },
      text: { type: 'string', description: 'Up to 20 000 characters, contacts included for signed-in viewers' },
      url: { type: 'string', format: 'uri' },
      canonicalUrl: { type: 'string', format: 'uri' },
      author: { type: 'string' },
      city: { type: 'string' },
      budget: { type: 'number' },
      currency: { type: 'string', description: 'ISO 4217-ish: RUB, USD, EUR, GBP, PLN, KZT, BYN, UAH, CHF, CAD, AUD' },
      paymentPeriod: { type: 'string', description: 'fixed, monthly or hourly' },
      rawSalary: { type: 'string', description: 'The pay as written in the post' },
      normalizedUsdMin: { type: 'number' },
      normalizedUsdMax: { type: 'number' },
      category: { type: 'string' },
      skills: { type: 'array', items: { type: 'string' } },
      isRemote: { type: 'boolean' },
      publishedAt: { type: 'string', format: 'date-time' },
      createdAt: { type: 'string', format: 'date-time' },
      votes_up: { type: 'integer' },
      votes_down: { type: 'integer' },
      votes_scam: { type: 'integer' },
      votes_closed: { type: 'integer' },
      contacts: { type: 'array', items: { type: 'object', properties: { type: { type: 'string' }, value: { type: 'string' } } }, description: 'Only for viewers whose tier shows contacts' },
      sourceRef: { type: 'object', description: 'Where the post was seen: platform, channel, visibility', properties: { platform: { type: 'string' }, channel: { type: 'string' }, channelTitle: { type: 'string' }, visibility: { type: 'string' }, messageId: { type: 'string' } } },
    },
  };
}

function rangeSchema(): Record<string, unknown> {
  return {
    type: 'object',
    properties: { p25: { type: 'number' }, median: { type: 'number' }, p75: { type: 'number' } },
  };
}

/** RFC 9727 API catalog: machines discover the spec here. */
export function renderApiCatalog(baseUrl: string): Record<string, unknown> {
  return {
    title: 'openradar public API',
    description: 'Read-only feed API of the openradar network. See the OpenAPI description for endpoints and schemas.',
    links: [{ rel: 'describedby', href: `${baseUrl}/openapi.json`, type: 'application/openapi+json' }],
    spec: [{ name: 'openradar', url: `${baseUrl}/openapi.json`, format: 'application/openapi+json' }],
  };
}
