import type { Env, Logger } from '../core/types.ts';
import type { Store } from '../core/store.ts';
import type { SinkRegistry } from '../sinks/index.ts';

export interface OutboxDeps {
  store: Store;
  sinks: SinkRegistry;
  env: Env;
  logger: Logger;
  fetchImpl?: typeof fetch;
}

export interface OutboxProcessSummary {
  processed: number;
  succeeded: number;
  failed: number;
}

export async function processOutbox(deps: OutboxDeps, limit = 50): Promise<OutboxProcessSummary> {
  if (!deps.store.getPendingDeliveries || !deps.store.updateLeadDelivery) {
    return { processed: 0, succeeded: 0, failed: 0 };
  }

  const pending = await deps.store.getPendingDeliveries(limit);
  if (pending.length === 0) {
    return { processed: 0, succeeded: 0, failed: 0 };
  }

  let succeeded = 0;
  let failed = 0;

  for (const item of pending) {
    const lead = await deps.store.getLead(item.leadId);
    if (!lead) {
      // Lead no longer exists, mark as sent/failed to avoid infinite loop
      await deps.store.updateLeadDelivery(item.leadId, item.sink, 'failed', 'Lead not found');
      failed++;
      continue;
    }

    const result = await deps.sinks.deliverTo(item.sink, lead, {
      env: deps.env,
      logger: deps.logger,
      fetchImpl: deps.fetchImpl ?? fetch,
    });

    if (result.ok) {
      await deps.store.updateLeadDelivery(item.leadId, item.sink, 'sent');
      await deps.store.recordDelivery(item.leadId, item.sink, 'sent');
      succeeded++;

      if (deps.store.getLeadDeliveries) {
        const allDeliveries = await deps.store.getLeadDeliveries(item.leadId);
        if (allDeliveries.length > 0 && allDeliveries.every((d) => d.status === 'sent')) {
          await deps.store.updateLeadStatus(item.leadId, 'delivered', new Date().toISOString());
        }
      }
    } else {
      const delaySec = Math.min(3600, Math.pow(2, item.attempts) * 10);
      const nextAttempt = new Date(Date.now() + delaySec * 1000).toISOString();
      await deps.store.updateLeadDelivery(item.leadId, item.sink, 'failed', result.error, nextAttempt);
      await deps.store.recordDelivery(item.leadId, item.sink, 'failed', result.error);
      failed++;
    }
  }

  return {
    processed: pending.length,
    succeeded,
    failed,
  };
}
