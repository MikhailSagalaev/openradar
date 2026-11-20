import { applyDecisions, decisionsEnabled, newDecisionKeys, newDecisionReplay, runDecisions, type DecisionKeyPool } from './decide.ts';
import { runEnrichment } from './enrich.ts';
import { runVisaSponsors } from '../research/visa-sponsors.ts';
import { webPubkey } from '../hub/web-key.ts';
import type { Logger } from '../core/types.ts';
import { pollAll, type PollDeps } from './poll.ts';
import { processOutbox } from './outbox.ts';
import { runDigestIfDue } from './digest.ts';
import type { SubscriptionRound } from './subscriptions.ts';
import { notifyPoints } from './points-notify.ts';
import { auditSourceRobotsIfDue } from './robots-audit.ts';
import { reportSilentDrops } from '../core/source-health.ts';
import { checkLeadsLiveness } from './liveness.ts';
import { recomputeRatings } from '../hub/rating.ts';
import { parseModerators } from '../hub/service.ts';
import { ensureMonthlySnapshot, liveReport } from '../research/service.ts';
import { ensureDailyCounts, openradarIndex } from '../research/index.ts';
import { ensureFxRates } from '../research/fx.ts';
import { extractionEnabled, runModelExtraction } from '../research/model.ts';
import { newExtractProviders, type ExtractProviderPool } from '../research/providers.ts';
import type { UserTelegramRound } from './user-telegram.ts';

const MAINTENANCE_INTERVAL_MS = 60 * 60 * 1000;
/** The silent-drop check scans two weeks of runs; every six hours is plenty. */
const FLOW_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const BACKGROUND_INTERVAL_MS = 60 * 1000;
const LIVENESS_INTERVAL_MS = 5 * 60 * 1000;
const EXTRACTION_INTERVAL_MS = 2 * 60 * 1000;
/** Batches per hour at EXTRACTION_INTERVAL_MS: keep decide/enrich/extract caps honest. */
const BATCHES_PER_HOUR = 30;
const USER_TELEGRAM_CHECK_MS = 5 * 60 * 1000;
/**
 * The UK register refreshes at most twice a day and a lead unmatched today is retried
 * tomorrow, so re-scanning the last 500 vacancies every minute is pure cost: a round
 * every 15 minutes sees every new lead long before the register could change.
 */
const VISA_SPONSORS_INTERVAL_MS = 15 * 60 * 1000;
/** The Bank of Russia publishes once a day; the rates of a month never change after it. */
const FX_RATES_CHECK_MS = 60 * 60 * 1000;

export class PollRunner {
  private timer: NodeJS.Timeout | undefined;
  private running = false;
  private backgroundTimer: NodeJS.Timeout | undefined;
  private backgroundRunning = false;
  private lastLivenessAt = 0;
  private livenessRunning = false;
  private lastMaintenanceAt = 0;
  private lastFlowCheckAt = 0;
  private lastExtractionAt = 0;
  private extractionRunning = false;
  private decisionsRunning = false;
  private nextDecisionsAt = 0;
  /** Shared idempotency cache for the paid model call across rounds (plan 021E). */
  private decisionReplay = newDecisionReplay();
  /** Shared key pool: an exhausted key stays parked across rounds until its cooldown passes. */
  private decisionKeys: DecisionKeyPool | undefined;
  /** Shared extract provider pool: an exhausted endpoint stays parked across rounds. */
  private extractProviderPool: ExtractProviderPool | undefined;
  private enrichmentRunning = false;
  private nextEnrichmentAt = 0;
  private visaSponsorsRunning = false;
  private lastVisaSponsorsAt = 0;
  private lastFxCheckAt = 0;
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
      this.runVisaSponsorsIfDue();
      this.runUserTelegramIfDue();
      // Keeps the live research report built, so no visitor waits the seconds it takes.
      // The rates check is hourly: the Bank of Russia answers once a day, and a missing
      // month is retried on the next check, not on every background minute.
      const useModel = this.deps.env.RADAR_EXTRACT_APPLY;
      const fxCheckDue = Date.now() - this.lastFxCheckAt >= FX_RATES_CHECK_MS;
      if (fxCheckDue) {
        this.lastFxCheckAt = Date.now();
        void ensureFxRates(this.deps.store, new Date(), this.deps.fetchImpl ?? fetch).catch((error: unknown) => {
          // The reference rates stand in until the Bank of Russia answers.
          this.logger.warn('Bank of Russia rates not saved', { error: error instanceof Error ? error.message : String(error) });
        });
      }
      void liveReport(this.deps.store, new Date(), { useModel })
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

  /** Pages of short posts, every two minutes, sized to RADAR_ENRICH_PER_HOUR. */
  private runEnrichmentIfDue(): void {
    const env = this.deps.env;
    const perHour = env.RADAR_ENRICH_PER_HOUR ?? 0;
    if (perHour <= 0 || this.enrichmentRunning || Date.now() < this.nextEnrichmentAt) return;
    this.nextEnrichmentAt = Date.now() + EXTRACTION_INTERVAL_MS;
    this.enrichmentRunning = true;
    void runEnrichment({ store: this.deps.store, env, logger: this.deps.logger.child('enrich'), fetchImpl: this.deps.fetchImpl ?? fetch }, Math.max(1, Math.round(perHour / BATCHES_PER_HOUR)))
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

  /**
   * UK sponsor-register matching (plan 021D). The round itself decides when the register
   * needs a re-read (twice a day); this guard keeps one round at a time and paces rounds
   * to every 15 minutes — the register and the retry window move far slower than a minute.
   */
  private runVisaSponsorsIfDue(): void {
    const env = this.deps.env;
    if (env.RADAR_VISA_SPONSORS === false || this.visaSponsorsRunning || !this.deps.store.saveLeadVisaSponsor) return;
    if (Date.now() - this.lastVisaSponsorsAt < VISA_SPONSORS_INTERVAL_MS) return;
    this.lastVisaSponsorsAt = Date.now();
    this.visaSponsorsRunning = true;
    void runVisaSponsors({ store: this.deps.store, env, logger: this.deps.logger.child('visa'), fetchImpl: this.deps.fetchImpl ?? fetch })
      .then((summary) => {
        if (summary.matched) this.logger.info('visa sponsors matched', { ...summary });
      })
      .catch((error) => {
        this.logger.warn('visa sponsor matching failed', { error: error instanceof Error ? error.message : String(error) });
      })
      .finally(() => {
        this.visaSponsorsRunning = false;
      });
  }

  /** A batch of decisions every two minutes, sized to RADAR_DECIDE_PER_HOUR. */
  private runDecisionsIfDue(): void {
    const env = this.deps.env;
    const perHour = env.RADAR_DECIDE_PER_HOUR ?? 0;
    if (!decisionsEnabled(env) || this.decisionsRunning || perHour <= 0) return;
    if (Date.now() < this.nextDecisionsAt) return;
    this.nextDecisionsAt = Date.now() + EXTRACTION_INTERVAL_MS;
    this.decisionsRunning = true;
    this.decisionKeys ??= newDecisionKeys(env);
    void runDecisions({ store: this.deps.store, env, logger: this.deps.logger.child('decide'), fetchImpl: this.deps.fetchImpl ?? fetch, replay: this.decisionReplay, keys: this.decisionKeys }, Math.max(1, Math.round(perHour / BATCHES_PER_HOUR)))
      .then((summary) => {
        if (summary.asked) this.logger.info('decisions finished', { ...summary });
        if (this.deps.services) {
          if (summary.stopped) {
            const isQuota = summary.stopped === 402;
            const isAuth = summary.stopped === 401;
            const isForbidden = summary.stopped === 403;
            const isRateLimit = summary.stopped === 429;
            const label = isQuota
              ? 'HTTP 402 Insufficient credits (баланс исчерпан)'
              : isAuth
              ? 'HTTP 401 Unauthorized (недействительный ключ)'
              : isForbidden
              ? 'HTTP 403 Forbidden (доступ запрещен)'
              : isRateLimit
              ? 'HTTP 429 Too Many Requests (превышен лимит)'
              : `HTTP ${summary.stopped}`;
            this.deps.services.record('subq', 'SubQ AI (классификация)', 'error', {
              error: label,
              httpStatus: summary.stopped,
            });
          } else if (summary.asked > 0 && summary.failed === 0) {
            this.deps.services.record('subq', 'SubQ AI (классификация)', 'ok');
          }
        }
        return applyDecisions({ store: this.deps.store, env, logger: this.deps.logger.child('decide'), fetchImpl: this.deps.fetchImpl ?? fetch }, 500).then((done) => {
          if (done.hidden || done.closed || done.moved || done.directed) this.logger.info('decisions applied', { ...done });
          return summary;
        });
      })
      .then((summary) => {
        // No credits or too many requests: an hour's pause, not a request every two minutes.
        if (summary.stopped) this.nextDecisionsAt = Date.now() + 60 * 60 * 1000;
      })
      .catch((error) => {
        this.logger.warn('decisions failed', { error: error instanceof Error ? error.message : String(error) });
      })
      .finally(() => {
        this.decisionsRunning = false;
      });
  }

  /** A batch of model extraction every two minutes, sized to RADAR_EXTRACT_PER_HOUR. */
  private runExtractionIfDue(): void {
    const env = this.deps.env;
    if (!extractionEnabled(env) || this.extractionRunning || env.RADAR_EXTRACT_PER_HOUR <= 0) return;
    if (Date.now() - this.lastExtractionAt < EXTRACTION_INTERVAL_MS) return;
    this.lastExtractionAt = Date.now();
    this.extractionRunning = true;
    this.extractProviderPool ??= newExtractProviders(env);
    const providers = this.extractProviderPool.size > 0 ? this.extractProviderPool : undefined;
    const limit = Math.max(1, Math.min(25, Math.round(env.RADAR_EXTRACT_PER_HOUR / BATCHES_PER_HOUR)));
    void runModelExtraction({ store: this.deps.store, env, logger: this.deps.logger.child('extract'), fetchImpl: this.deps.fetchImpl, providers }, { limit })
      .then((summary) => {
        if (summary.asked) this.logger.info('model extraction finished', { asked: summary.asked, saved: summary.saved, failed: summary.failed, stopped: summary.stopped });
        if (summary.pausedMs) this.lastExtractionAt = Date.now() + summary.pausedMs - EXTRACTION_INTERVAL_MS;
        if (summary.stopped) this.lastExtractionAt = Date.now() + 60 * 60 * 1000 - EXTRACTION_INTERVAL_MS;
        if (this.deps.services) {
          if (summary.stopped) {
            this.deps.services.record('extract', 'LLM (аналитика зарплат)', 'error', {
              error: `HTTP ${summary.stopped}`,
              httpStatus: summary.stopped,
            });
          } else if (summary.pausedMs) {
            this.deps.services.record('extract', 'LLM (аналитика зарплат)', 'degraded', {
              error: 'Rate limit / Busy (HTTP 429)',
              httpStatus: 429,
            });
          } else if (summary.asked > 0 && summary.saved > 0) {
            this.deps.services.record('extract', 'LLM (аналитика зарплат)', 'ok');
          } else if (summary.asked > 0 && summary.failed === summary.asked) {
            this.deps.services.record('extract', 'LLM (аналитика зарплат)', 'degraded', {
              error: 'Запросы к модели завершились ошибкой',
            });
          }
        }
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
      // Lead lifecycle: hot (0..HOT_DAYS) — в фиде; warm — archived_at, скрыт из фида/API,
      // строка целиком; месяц, целиком ушедший в warm, выгружается в RADAR_ARCHIVE_DIR
      // (leads-YYYY-MM.jsonl.gz). Cold (> RETENTION_DAYS) — только для уже выгруженных
      // месяцев: compact (по умолчанию) сжимает строку на месте — id, голоса, рейтинг,
      // показы и доставки остаются для статистики; delete (явный выбор) удаляет строки
      // каскадом вместе с гроссбухом и доставками; off — ничего не делает.
      // Its own try/catch: an unwritable archive dir (EACCES on a root-owned ./data bind mount)
      // used to abort the whole pass — rating recompute, research daily counts and robots audit
      // below were skipped every hour. Archiving, export and retention fail alone now.
      const env = this.deps.env;
      let leads: number | undefined;
      try {
        const hotDays = env.RADAR_LEADS_HOT_DAYS ?? 60;
        const archiveDir = env.RADAR_ARCHIVE_DIR ?? 'data/archives';
        const retentionMode = env.RADAR_RETENTION_MODE ?? 'compact';
        if (retentionMode !== 'off' && hotDays >= env.RADAR_RETENTION_DAYS) {
          this.logger.warn('RADAR_LEADS_HOT_DAYS >= RADAR_RETENTION_DAYS: leads reach retention only once archived and exported', {
            hotDays,
            retentionDays: env.RADAR_RETENTION_DAYS,
          });
        }
        const archived = await store.archiveOldLeads?.(hotDays);
        if (archived) this.logger.info('leads archived', { archived });
        const exported = await store.exportArchivedLeads?.(archiveDir, hotDays);
        if (exported?.length) this.logger.info('archive exported', { files: exported });
        if (retentionMode === 'compact') {
          const compacted = await store.compactOldLeads?.(env.RADAR_RETENTION_DAYS, archiveDir);
          if (compacted) this.logger.info('leads compacted', { compacted });
        } else if (retentionMode === 'delete') {
          // Only months already exported: the archive file keeps the full copy.
          leads = await store.cleanupOldLeads?.(env.RADAR_RETENTION_DAYS, archiveDir);
        }
      } catch (error) {
        this.logger.warn('lead lifecycle failed', { error: error instanceof Error ? error.message : String(error) });
      }
      // Голоса-события и история запусков нужны для health (24ч) и аудита;
      // храним их 30 дней, чтобы таблицы не росли бесконечно.
      const runs = await store.cleanupRuns?.(30);
      const sessions = await store.purgeExpiredSessions?.();
      // A source that still answers but stopped bringing posts (a drifted feed URL) is invisible
      // to the error-based hygiene: surface it separately, at most once every six hours.
      if (Date.now() - this.lastFlowCheckAt >= FLOW_CHECK_INTERVAL_MS) {
        this.lastFlowCheckAt = Date.now();
        await reportSilentDrops(store, this.deps.services, this.logger).catch((error) => {
          this.logger.warn('silent-drop check failed', { error: error instanceof Error ? error.message : String(error) });
        });
      }
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
      // Sure SubQ directions onto leads still stuck on empty/other (ingest always wrote a slug).
      // Its own try/catch: a slow backfill must not skip the research steps below it.
      try {
        if (this.deps.env.RADAR_DECIDE_APPLY && store.applyDirectionsFromDecisions) {
          const directed = await store.applyDirectionsFromDecisions(0.8);
          if (directed) this.logger.info('directions backfilled from decisions', { directed });
        }
      } catch (error) {
        this.logger.warn('directions backfill failed', { error: error instanceof Error ? error.message : String(error) });
      }
      // Last month's market report is frozen once, early in the next month.
      try {
        const snapshot = await ensureMonthlySnapshot(store, new Date(), { useModel: this.deps.env.RADAR_EXTRACT_APPLY });
        if (snapshot) this.logger.info('research snapshot saved', { period: snapshot });
        // The days that are over join the openradar index.
        const days = await ensureDailyCounts(store, new Date(), { useModel: this.deps.env.RADAR_EXTRACT_APPLY });
        if (days.length) this.logger.info('research daily counts saved', { from: days[0], to: days.at(-1) });
      } catch (error) {
        this.logger.warn('research maintenance failed', { error: error instanceof Error ? error.message : String(error) });
      }
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
