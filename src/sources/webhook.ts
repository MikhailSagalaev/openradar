import type { SourceAdapter } from '../core/types.ts';

/**
 * A webhook source has no poll function. The operator (or a browser
 * extension, an n8n flow, a mail hook) posts a raw lead to
 * POST /api/ingest/:sourceId and the same pipeline runs.
 */
export const webhookSource: SourceAdapter = {
  kind: 'webhook',
  access: 'user-provided',
  description: 'Inbound JSON lead. The data is supplied by the operator, not scraped.',
  risks: [],
};
