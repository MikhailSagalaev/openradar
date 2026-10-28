import type { Logger } from '../core/types.ts';
import { pollAll, type PollDeps } from './poll.ts';
import { processOutbox } from './outbox.ts';
import { runDigestIfDue } from './digest.ts';
import { checkLeadsLiveness } from './liveness.ts';
import { recomputeRatings } from '../hub/rating.ts';
import { parseModerators } from '../hub/service.ts';
import { ensureMonthlySnapshot } from '../research/service.ts';
import { extractionEnabled, runModelExtraction } from '../research/model.ts';

const MAINTENANCE_INTERVAL_MS = 60 * 60 * 1000;
const BACKGROUND_INTERVAL_MS = 60 * 1000;
const LIVENESS_INTERVAL_MS = 5 * 60 * 1000;
const EXTRACTION_INTERVAL_MS = 10 * 60 * 1000;

export class PollRunner {
  private timer: NodeJS.Timeout | undefined;
  private running = false;
  private backgroundTimer: NodeJS.Timeout | undefined;
  private backgroundRunning = false;
  private lastLivenessAt = 0;
  private livenessRunning = false;
  private lastMaintenanceAt = 0;
  private lastExtractionAt = 0;
  private extractionRunning = false;

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
          // A run longer than the tick stops starting sources, so the schedule holds.
          const deadline = Date.now() + Math.max(10, this.intervalSec) * 1000;
          const summaries = await pollAll(this.deps, { deadline });
          if (summaries.length) {
            this.logger.info('scheduled poll finished', {
              sources: summaries.length,
              delivered: summaries.reduce((sum, item) => sum + item.delivered, 0),
              errors: summaries.filter((item) => item.error).length,
            });
          }
        } catch (error) {
          this.logger.error('scheduled poll failed', {
            error: error instanceof Error ? error.message : String(error),
          });
        } finally {
          this.running = false;
        }
      })();
    };

    tick();
    this.timer = setInterval(tick, Math.max(10, this.intervalSec) * 1000);
    // Delivery, digests and maintenance run on their own loop: a slow poll does not hold them.
    void this.background();
    this.backgroundTimer = setInterval(() => void this.background(), BACKGROUND_INTERVAL_MS);
  }

  private async background(): Promise<void> {
    if (this.backgroundRunning) return;
    this.backgroundRunning = true;
    try {
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
      await this.runLivenessIfDue();
      this.runExtractionIfDue();

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
      this.logger.error('background cycle failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      this.backgroundRunning = false;
    }
  }

  /** Starts a closed-post round when one is due; it paces itself, so the loop does not wait. */
  private async runLivenessIfDue(): Promise<void> {
    if (!this.deps.env.RADAR_CHECK_CLOSED || this.livenessRunning) return;
    if (Date.now() - this.lastLivenessAt < LIVENESS_INTERVAL_MS) return;
    this.lastLivenessAt = Date.now();
    this.livenessRunning = true;
    void checkLeadsLiveness(this.deps)
      .then((summary) => {
        if (summary.checked) this.logger.info('closed-post check finished', { ...summary });
      })
      .catch((error) => {
        this.logger.warn('closed-post check failed', {
          error: error instanceof Error ? error.message : String(error),
        });
      })
      .finally(() => {
        this.livenessRunning = false;
      });
  }

  /** A batch of model extraction every ten minutes, sized to RADAR_EXTRACT_PER_HOUR. */
  private runExtractionIfDue(): void {
    const env = this.deps.env;
    if (!extractionEnabled(env) || this.extractionRunning || env.RADAR_EXTRACT_PER_HOUR <= 0) return;
    if (Date.now() - this.lastExtractionAt < EXTRACTION_INTERVAL_MS) return;
    this.lastExtractionAt = Date.now();
    this.extractionRunning = true;
    const limit = Math.max(1, Math.round(env.RADAR_EXTRACT_PER_HOUR / 6));
    void runModelExtraction({ store: this.deps.store, env, logger: this.deps.logger.child('extract'), fetchImpl: this.deps.fetchImpl }, { limit })
      .then((summary) => {
        if (summary.asked) this.logger.info('model extraction finished', { ...summary });
      })
      .catch((error) => {
        this.logger.warn('model extraction failed', { error: error instanceof Error ? error.message : String(error) });
      })
      .finally(() => {
        this.extractionRunning = false;
      });
  }

  private async runMaintenanceIfDue(): Promise<void> {
    if (Date.now() - this.lastMaintenanceAt < MAINTENANCE_INTERVAL_MS) return;
    this.lastMaintenanceAt = Date.now();

    const store = this.deps.store;
    try {
      const leads = await store.cleanupOldLeads?.(this.deps.env.RADAR_RETENTION_DAYS);
      // Голоса-события и история запусков нужны для health (24ч) и аудита;
      // храним их 30 дней, чтобы таблицы не росли бесконечно.
      const runs = await store.cleanupRuns?.(30);
      const sessions = await store.purgeExpiredSessions?.();
      if (this.deps.env.RADAR_MODE === 'hub') {
        const rating = await recomputeRatings(store, parseModerators(this.deps.env.RADAR_MODERATORS));
        this.logger.info('rating recomputed', { ...rating });
      }
      // Last month's market report is frozen once, early in the next month.
      const snapshot = await ensureMonthlySnapshot(store);
      if (snapshot) this.logger.info('research snapshot saved', { period: snapshot });
      if (leads || runs || sessions) {
        this.logger.info('maintenance cleanup finished', {
          leads,
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
    if (this.backgroundTimer) clearInterval(this.backgroundTimer);
    this.timer = undefined;
    this.backgroundTimer = undefined;
  }
}
