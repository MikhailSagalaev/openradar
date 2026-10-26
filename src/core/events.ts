import { EventEmitter } from 'node:events';
import type { Lead } from './types.ts';

/**
 * In-process bus for lead lifecycle events. The pipeline publishes, transports
 * (SSE stream, node->hub outbox) subscribe. Listeners must not throw.
 */
export const leadEvents = new EventEmitter();
leadEvents.setMaxListeners(0);

export function emitLeadCreated(lead: Lead): void {
  try {
    leadEvents.emit('lead.created', lead);
  } catch {
    // A failing listener must never break ingestion.
  }
}
