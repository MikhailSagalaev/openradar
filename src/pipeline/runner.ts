import type { Logger } from '../core/types.ts';
import { pollAll, type PollDeps } from './poll.ts';
import { processOutbox } from './outbox.ts';
import { runDigestIfDue } from './digest.ts';

const MAINTENANCE_INTERVAL_MS = 60 * 60 * 1000;

export class PollRunner {
  private timer: NodeJS.Timeout | undefined;
  private running = false;
  private lastMaintenanceAt = 0;

  constructor(
    private readonly deps: PollDeps,
    private readonly intervalSec: number,
    private readonly logger: Logger,
  ) {}

  start(): void {
    const tick = (): void => {
      if (this.running) {
        this.logger.debug('poll tick skipped: previous run is still active');
        return;
      }
      this.running = true;
      void (async () => {
        try {
          const summaries = await pollAll(this.deps);
          if (summaries.length) {
            this.logger.info('scheduled poll finished', {
              sources: summaries.length,
              delivered: summaries.reduce((sum, item) => sum + item.delivered, 0),
              errors: summaries.filter((item) => item.error).length,
            });
          }

          // Запуск обработки отложенной Outbox-доставки
          const outboxRes = await processOutbox({
            store: this.deps.store,
            sinks: this.deps.sinks,
            env: this.deps.env,
            logger: this.deps.logger,
            fetchImpl: this.deps.fetchImpl,
          });
          if (outboxRes.processed > 0) {
            this.logger.info('outbox delivery batch finished', outboxRes);
          }

          await this.runMaintenanceIfDue();

          try {
            await runDigestIfDue({
              store: this.deps.store,
              env: this.deps.env,
              logger: this.deps.logger.child('digest'),
              fetchImpl: this.deps.fetchImpl ?? fetch,
            });
          } catch (error) {
            this.logger.warn('digest job failed', {
              error: error instanceof Error ? error.message : String(error),
            });
          }
        } catch (error) {
          this.logger.error('scheduled cycle failed', {
            error: error instanceof Error ? error.message : String(error),
          });
        } finally {
          this.running = false;
        }
      })();
    };

    tick();
    this.timer = setInterval(tick, Math.max(10, this.intervalSec) * 1000);
  }

  private async runMaintenanceIfDue(): Promise<void> {
    if (Date.now() - this.lastMaintenanceAt < MAINTENANCE_INTERVAL_MS) return;
    this.lastMaintenanceAt = Date.now();

    const store = this.deps.store;
    try {
      const leads = await store.cleanupOldLeads?.(this.deps.env.RADAR_RETENTION_DAYS);
      // Голоса-события и история запусков нужны для health (24ч) и аудита;
      // храним их 30 дней, чтобы таблицы не росли бесконечно.
      const outbox = await store.cleanupOutboxEvents?.(30);
      const runs = await store.cleanupRuns?.(30);
      const sessions = await store.purgeExpiredSessions?.();
      if (leads || outbox || runs || sessions) {
        this.logger.info('maintenance cleanup finished', {
          leads,
          outboxEvents: outbox,
          runs,
          sessions,
        });
      }
    } catch (error) {
      this.logger.warn('maintenance cleanup failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }
}
