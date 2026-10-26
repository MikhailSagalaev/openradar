import type { Env, Lead, Logger, SinkAdapter } from '../core/types.ts';
import { consoleSink } from './console.ts';
import { telegramSink } from './telegram.ts';
import { webhookSink } from './webhook.ts';
import { hubSink } from './hub.ts';

export interface DeliveryResult {
  sink: string;
  ok: boolean;
  error?: string;
}

export class SinkRegistry {
  private readonly sinks: SinkAdapter[] = [];

  register(sink: SinkAdapter): this {
    this.sinks.push(sink);
    return this;
  }

  list(): SinkAdapter[] {
    return [...this.sinks];
  }

  async deliverTo(
    sinkKind: string,
    lead: Lead,
    ctx: { env: Env; logger: Logger; fetchImpl: typeof fetch }
  ): Promise<DeliveryResult> {
    const sink = this.sinks.find((s) => s.kind === sinkKind);
    if (!sink) {
      return { sink: sinkKind, ok: false, error: `Sink ${sinkKind} not registered` };
    }
    try {
      await sink.deliver(lead, {
        env: ctx.env,
        logger: ctx.logger.child(sink.kind),
        fetchImpl: ctx.fetchImpl,
      });
      return { sink: sink.kind, ok: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      ctx.logger.warn('sink delivery failed', { sink: sink.kind, error: message });
      return { sink: sink.kind, ok: false, error: message };
    }
  }

  async deliver(
    lead: Lead,
    ctx: { env: Env; logger: Logger; fetchImpl: typeof fetch },
    kinds?: string[],
  ): Promise<DeliveryResult[]> {
    const results: DeliveryResult[] = [];
    for (const sink of this.sinks) {
      if (kinds && !kinds.includes(sink.kind)) continue;
      try {
        await sink.deliver(lead, {
          env: ctx.env,
          logger: ctx.logger.child(sink.kind),
          fetchImpl: ctx.fetchImpl,
        });
        results.push({ sink: sink.kind, ok: true });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        ctx.logger.warn('sink delivery failed', { sink: sink.kind, error: message });
        results.push({ sink: sink.kind, ok: false, error: message });
      }
    }
    return results;
  }
}

export function createSinkRegistry(env: Env): SinkRegistry {
  const registry = new SinkRegistry();
  if (env.RADAR_CONSOLE_SINK) registry.register(consoleSink);
  if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) registry.register(telegramSink);
  if (env.WEBHOOK_URL) registry.register(webhookSink);
  if (env.RADAR_MODE === 'node' && env.RADAR_HUB_URL && env.RADAR_NODE_KEY) registry.register(hubSink);
  return registry;
}
