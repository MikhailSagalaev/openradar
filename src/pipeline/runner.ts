import { applyDecisions, decisionsEnabled, runDecisions } from './decide.ts';
import { runEnrichment } from './enrich.ts';
import { webPubkey } from '../hub/web-key.ts';
import type { Logger } from '../core/types.ts';
import { pollAll, type PollDeps } from './poll.ts';
import { processOutbox } from './outbox.ts';
import { runDigestIfDue } from './digest.ts';
import type { SubscriptionRound } from './subscriptions.ts';
import { notifyPoints } from './points-notify.ts';
import { auditSourceRobotsIfDue } from './robots-audit.ts';
import { checkLeadsLiveness } from './liveness.ts';
import { recomputeRatings } from '../hub/rating.ts';
import { parseModerators } from '../hub/service.ts';
import { ensureMonthlySnapshot, liveReport } from '../research/service.ts';
import { ensureDailyCounts, openradarIndex } from '../research/index.ts';
import { ensureFxRates } from '../research/fx.ts';
import { extractionEnabled, runModelExtraction } from '../research/model.ts';
import type { UserTelegramRound } from './user-telegram.ts';

const MAINTENANCE_INTERVAL_MS = 60 * 60 * 1000;
const BACKGROUND_INTERVAL_MS = 60 * 1000;
const LIVENESS_INTERVAL_MS = 5 * 60 * 1000;
const EXTRACTION_INTERVAL_MS = 10 * 60 * 1000;
const USER_TELEGRAM_CHECK_MS = 5 * 60 * 1000;

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
  private decisionsRunning = false;
  private nextDecisionsAt = 0;
  private enrichmentRunning = false;
  private nextEnrichmentAt = 0;
  private lastUserTelegramAt = 0;
  private userTelegramRunning = false;

  constructor(
    private readonly deps: PollDeps,
    private readonly intervalSec: number,
    private readonly logger: Logger,
    /** Saved-search delivery, given by the server (it knows each user's tier). */
    private readonly deliverSubscriptions?: () => Promise<SubscriptionRound>,
    /** Members' own Telegram folders and chats, given by the server when RADAR_USER_TELEGRAM is on. */
    private readonly pollUserTelegram?: () => Promise<UserTelegramRound>,
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
      this.runDecisionsIfDue();
      this.runEnrichmentIfDue();
      this.runUserTelegramIfDue();
      // Keeps the live research report built, so no visitor waits the seconds it takes.
      const useModel = this.deps.env.RADAR_EXTRACT_APPLY;
      void ensureFxRates(this.deps.store)
        .catch((error: unknown) => {
          // The reference rates stand in until the Bank of Russia answers.
          this.logger.warn('Bank of Russia rates not saved', { error: error instanceof Error ? error.message : String(error) });
        })
        .then(() => liveReport(this.deps.store, new Date(), { useModel }))
        .then(() => openradarIndex(this.deps.store, new Date(), { useModel }))
        .catch((error: unknown) => {
          this.logger.warn('research report build failed', { error: error instanceof Error ? error.message : String(error) });
        });

      if (this.deliverSubscriptions) {
        try {
          const round = await this.deliverSubscriptions();
          if (round.sent || round.failed) this.logger.info('subscription delivery finished', { ...round });
        } catch (error) {
          this.logger.warn('subscription delivery failed', { error: error instanceof Error ? error.message : String(error) });
        }
      }

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

  /** Personal Telegram sources: each is read every quarter of an hour, the check runs every five minutes. */
  private runUserTelegramIfDue(): void {
    if (!this.pollUserTelegram || this.userTelegramRunning) return;
    if (Date.now() - this.lastUserTelegramAt < USER_TELEGRAM_CHECK_MS) return;
    this.lastUserTelegramAt = Date.now();
    this.userTelegramRunning = true;
    void this.pollUserTelegram()
      .then((round) => {
        if (round.sources) this.logger.info('personal Telegram sources read', { ...round });
      })
      .catch((error) => {
        this.logger.warn('personal Telegram sources failed', { error: error instanceof Error ? error.message : String(error) });
      })
      .finally(() => {
        this.userTelegramRunning = false;
      });
  }

  /** Pages of short posts, every ten minutes, sized to RADAR_ENRICH_PER_HOUR. */
  private runEnrichmentIfDue(): void {
    const env = this.deps.env;
    const perHour = env.RADAR_ENRICH_PER_HOUR ?? 0;
    if (perHour <= 0 || this.enrichmentRunning || Date.now() < this.nextEnrichmentAt) return;
    this.nextEnrichmentAt = Date.now() + EXTRACTION_INTERVAL_MS;
    this.enrichmentRunning = true;
    void runEnrichment({ store: this.deps.store, env, logger: this.deps.logger.child('enrich'), fetchImpl: fetch }, Math.max(1, Math.round(perHour / 6)))
      .then((summary) => {
        if (summary.checked) this.logger.info('pages read', { ...summary });
      })
      .catch((error) => {
        this.logger.warn('page reading failed', { error: error instanceof Error ? error.message : String(error) });
      })
      .finally(() => {
        this.enrichmentRunning = false;
      });
  }

  /** A batch of decisions every ten minutes, sized to RADAR_DECIDE_PER_HOUR. */
  private runDecisionsIfDue(): void {
    const env = this.deps.env;
    const perHour = env.RADAR_DECIDE_PER_HOUR ?? 0;
    if (!decisionsEnabled(env) || this.decisionsRunning || perHour <= 0) return;
    if (Date.now() < this.nextDecisionsAt) return;
    this.nextDecisionsAt = Date.now() + EXTRACTION_INTERVAL_MS;
    this.decisionsRunning = true;
    void runDecisions({ store: this.deps.store, env, logger: this.deps.logger.child('decide'), fetchImpl: fetch }, Math.max(1, Math.round(perHour / 6)))
      .then((summary) => {
        if (summary.asked) this.logger.info('decisions finished', { ...summary });
        return applyDecisions({ store: this.deps.store, env, logger: this.deps.logger.child('decide'), fetchImpl: fetch }, 500).then((done) => {
          if (done.hidden || done.closed || done.moved) this.logger.info('decisions applied', { ...done });
          return summary;
        });
      })
      .then((summary) => {
        // No credits or too many requests: an hour's pause, not a request every ten minutes.
        if (summary.stopped) this.nextDecisionsAt = Date.now() + 60 * 60 * 1000;
      })
      .catch((error) => {
        this.logger.warn('decisions failed', { error: error instanceof Error ? error.message : String(error) });
      })
      .finally(() => {
        this.decisionsRunning = false;
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
        if (summary.asked) this.logger.info('model extraction finished', { asked: summary.asked, saved: summary.saved, failed: summary.failed });
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
        const secret = this.deps.env.RADAR_WEB_KEY_SECRET || this.deps.env.RADAR_ADMIN_TOKEN;
        const rating = await recomputeRatings(store, parseModerators(this.deps.env.RADAR_MODERATORS), new Date(), secret ? (id) => webPubkey(secret, id) : undefined);
        this.logger.info('rating recomputed', { ...rating });
        // Fresh credits go to their owners in Telegram right after the recompute.
        const notices = await notifyPoints({
          store,
          env: this.deps.env,
          logger: this.logger.child('points'),
          fetchImpl: this.deps.fetchImpl,
          pubkeysForUser: async (userId) => {
            const linked = await store.getParticipantByGithubUser(userId);
            return [...new Set([secret ? webPubkey(secret, userId) : undefined, linked?.pubkey].filter((k): k is string => Boolean(k)))];
          },
        });
        if (notices.sent) this.logger.info('points notices sent', { ...notices });
      }
      // Last month's market report is frozen once, early in the next month.
      const snapshot = await ensureMonthlySnapshot(store, new Date(), { useModel: this.deps.env.RADAR_EXTRACT_APPLY });
      if (snapshot) this.logger.info('research snapshot saved', { period: snapshot });
      // The days that are over join the openradar index.
      const days = await ensureDailyCounts(store, new Date(), { useModel: this.deps.env.RADAR_EXTRACT_APPLY });
      if (days.length) this.logger.info('research daily counts saved', { from: days[0], to: days.at(-1) });
      // Once a day: what robots.txt says about each source's address (report only, nothing is switched off).
      const robots = await auditSourceRobotsIfDue(
        (await store.listSources()).filter((s) => s.enabled),
        this.deps.sources,
        this.deps.env.RADAR_USER_AGENT,
        this.deps.fetchImpl,
      );
      const disallowed = robots?.filter((item) => item.robots?.verdict === 'disallowed') ?? [];
      if (disallowed.length) {
        this.logger.warn('robots.txt disallows polled addresses', { sources: disallowed.map((item) => `${item.source.title}: ${item.robots?.rule}`) });
      }
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
