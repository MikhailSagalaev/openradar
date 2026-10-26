import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { recalculateVoteScoreAndStatus } from '../core/rules.ts';
import { normalizeTechTokens } from '../core/text.ts';
import { mergeContacts } from '../core/contacts.ts';
import type {
  Contact,
  Lead,
  LeadState,
  LeadStatus,
  LeadVoteSignal,
  RunRecord,
  SourceConfig,
  SourceHealth,
  SourceKind,
  SourceRecord,
  SourceVisibility,
  Stats,
} from '../core/types.ts';
import type {
  ObservationRecord,
  ParticipantRecord,
  SignalRecord,
  StoredEvent,
  CreateSourceInput,
  FeedOptions,
  LeadDeliveryRecord,
  ListLeadsOptions,
  Store,
  UpdateSourceInput,
  UpsertGitHubUserInput,
  UserRecord,
  UserVoteResult,
} from '../core/store.ts';

import { checkMigrations } from './migrator.ts';

const { Pool } = pg;

export class PostgresStore implements Store {
  private pool: pg.Pool;

  constructor(connectionString: string) {
    this.pool = new Pool({
      connectionString,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });
  }

  async init(): Promise<void> {
    const { ok, pending } = await checkMigrations(this.pool);
    if (!ok) {
      throw new Error(
        `Database schema is not up to date! Pending migrations: ${pending.join(', ')}. ` +
        `Please run 'radar migrate' before starting the application.`
      );
    }
  }

  private closed = false;

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    await this.pool.end();
  }

  async truncate(): Promise<void> {
    await this.pool.query('TRUNCATE TABLE deliveries, runs, leads, sources CASCADE');
  }

  async listSources(): Promise<SourceRecord[]> {
    const res = await this.pool.query(
      `SELECT id, kind, title, enabled, config_json, created_at, updated_at FROM sources ORDER BY created_at ASC`
    );
    return res.rows.map(r => ({
      id: r.id,
      kind: r.kind,
      title: r.title,
      enabled: Boolean(r.enabled),
      config: r.config_json || {},
      createdAt: new Date(r.created_at).toISOString(),
      updatedAt: new Date(r.updated_at).toISOString(),
    }));
  }

  async getSource(id: string): Promise<SourceRecord | null> {
    const res = await this.pool.query(
      `SELECT id, kind, title, enabled, config_json, created_at, updated_at FROM sources WHERE id = $1`,
      [id]
    );
    if (!res.rows[0]) return null;
    const r = res.rows[0];
    return {
      id: r.id,
      kind: r.kind,
      title: r.title,
      enabled: Boolean(r.enabled),
      config: r.config_json || {},
      createdAt: new Date(r.created_at).toISOString(),
      updatedAt: new Date(r.updated_at).toISOString(),
    };
  }

  async createSource(input: CreateSourceInput): Promise<SourceRecord> {
    const id = input.id ?? randomUUID();
    const now = new Date().toISOString();
    const enabled = input.enabled ?? true;
    const config = JSON.stringify(input.config ?? {});

    await this.pool.query(
      `INSERT INTO sources (id, kind, title, enabled, config_json, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)`,
      [id, input.kind, input.title, enabled, config, now, now]
    );

    return {
      id,
      kind: input.kind,
      title: input.title,
      enabled,
      config: input.config ?? {},
      createdAt: now,
      updatedAt: now,
    };
  }

  async updateSource(id: string, patch: UpdateSourceInput): Promise<SourceRecord | null> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const res = await client.query<{
        id: string;
        kind: SourceKind;
        title: string;
        enabled: boolean;
        config_json: unknown;
        created_at: string;
        updated_at: string;
      }>(`SELECT * FROM sources WHERE id = $1 FOR UPDATE`, [id]);

      const current = res.rows[0];
      if (!current) {
        await client.query('ROLLBACK');
        return null;
      }

      const parsedConfig =
        typeof current.config_json === 'string'
          ? JSON.parse(current.config_json)
          : (current.config_json as Record<string, unknown>) ?? {};

      const title = patch.title ?? current.title;
      const enabled = patch.enabled ?? current.enabled;
      const newConfig = patch.config ? { ...parsedConfig, ...patch.config } : parsedConfig;
      const now = new Date().toISOString();

      const updateRes = await client.query<{
        id: string;
        kind: SourceKind;
        title: string;
        enabled: boolean;
        config_json: unknown;
        created_at: string;
        updated_at: string;
      }>(
        `UPDATE sources SET title = $1, enabled = $2, config_json = $3::jsonb, updated_at = $4 WHERE id = $5 RETURNING *`,
        [title, enabled, JSON.stringify(newConfig), now, id],
      );

      await client.query('COMMIT');

      const updated = updateRes.rows[0]!;
      return {
        id: updated.id,
        kind: updated.kind,
        title: updated.title,
        enabled: Boolean(updated.enabled),
        config: (typeof updated.config_json === 'string' ? JSON.parse(updated.config_json) : updated.config_json) as Record<string, unknown>,
        createdAt: new Date(updated.created_at).toISOString(),
        updatedAt: new Date(updated.updated_at).toISOString(),
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async deleteSource(id: string): Promise<boolean> {
    const res = await this.pool.query(`DELETE FROM sources WHERE id = $1`, [id]);
    return (res.rowCount ?? 0) > 0;
  }

  async findLeadByFingerprint(fingerprint: string): Promise<Lead | null> {
    const res = await this.pool.query(`SELECT * FROM leads WHERE fingerprint = $1`, [fingerprint]);
    return res.rows[0] ? this.rowToLead(res.rows[0]) : null;
  }

  async getLead(id: string): Promise<Lead | null> {
    const res = await this.pool.query(`SELECT * FROM leads WHERE id = $1`, [id]);
    return res.rows[0] ? this.rowToLead(res.rows[0]) : null;
  }

  async findRecentByTitleKey(titleKey: string, city: string | undefined, sinceIso: string): Promise<Lead | null> {
    const query = city
      ? `SELECT * FROM leads WHERE title_key = $1::text AND city = $2::text AND created_at >= $3::timestamptz ORDER BY created_at DESC LIMIT 1`
      : `SELECT * FROM leads WHERE title_key = $1::text AND created_at >= $2::timestamptz ORDER BY created_at DESC LIMIT 1`;
    const params = city ? [titleKey, city, sinceIso] : [titleKey, sinceIso];
    const res = await this.pool.query(query, params);
    return res.rows[0] ? this.rowToLead(res.rows[0]) : null;
  }

  async insertLead(lead: Lead): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const res = await client.query(
        `INSERT INTO leads (
          id, source_id, external_id, url, canonical_url, title, text,
          author, city, budget, currency, category, skills_json, is_remote,
          metadata_json, published_at, fingerprint, title_key, status, score,
          reasons_json, created_at, delivered_at, type,
          votes_up, votes_down, votes_scam, votes_closed, quality_score,
          raw_salary, payment_period, normalized_usd_min, normalized_usd_max,
          minhash_sketch, state, contacts_json,
          source_platform, source_channel, source_channel_title, source_visibility, source_message_id
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7,
          $8, $9, $10, $11, $12, $13::jsonb, $14,
          $15::jsonb, $16, $17, $18, $19, $20,
          $21::jsonb, $22, $23, $24,
          $25, $26, $27, $28, $29,
          $30, $31, $32, $33,
          $34, $35, $36::jsonb,
          $37, $38, $39, $40, $41
        ) ON CONFLICT DO NOTHING`,
        [
          lead.id,
          lead.sourceId,
          lead.externalId ?? null,
          lead.url ?? null,
          lead.canonicalUrl ?? null,
          lead.title,
          lead.text,
          lead.author ?? null,
          lead.city ?? null,
          lead.budget ?? null,
          lead.currency ?? 'RUB',
          lead.category ?? null,
          JSON.stringify(lead.skills ?? []),
          lead.isRemote ?? true,
          JSON.stringify(lead.metadata ?? {}),
          lead.publishedAt ? new Date(lead.publishedAt) : null,
          lead.fingerprint,
          lead.titleKey,
          lead.status,
          lead.score,
          JSON.stringify(lead.reasons ?? []),
          new Date(lead.createdAt),
          lead.deliveredAt ? new Date(lead.deliveredAt) : null,
          lead.type ?? 'gig',
          lead.votes_up ?? 0,
          lead.votes_down ?? 0,
          lead.votes_scam ?? 0,
          lead.votes_closed ?? 0,
          lead.score,
          lead.rawSalary ?? null,
          lead.paymentPeriod ?? 'fixed',
          lead.normalizedUsdMin ?? null,
          lead.normalizedUsdMax ?? null,
          lead.minhash_sketch ? Buffer.from(lead.minhash_sketch, 'base64url') : null,
          lead.state ?? 'active',
          JSON.stringify(lead.contacts ?? []),
          lead.sourceRef?.platform ?? null,
          lead.sourceRef?.channel ?? null,
          lead.sourceRef?.channelTitle ?? null,
          lead.sourceRef?.visibility ?? null,
          lead.sourceRef?.messageId ?? null,
        ]
      );

      const inserted = (res.rowCount ?? 0) > 0;

      if (inserted && lead.contacts?.length) {
        await client.query(
          `INSERT INTO lead_contacts (lead_id, type, value)
           SELECT $1, c->>'type', c->>'value' FROM jsonb_array_elements($2::jsonb) AS c
           ON CONFLICT DO NOTHING`,
          [lead.id, JSON.stringify(lead.contacts)]
        );
      }

      // Transactional Outbox: публикуем событие о новом лиде
      if (inserted) {
        await client.query(
          `INSERT INTO outbox_events (event_type, payload) VALUES ($1, $2::jsonb)`,
          ['lead.created', JSON.stringify({ leadId: lead.id, status: lead.status, score: lead.score })]
        );
      }

      await client.query('COMMIT');
      return inserted;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async updateLeadStatus(id: string, status: LeadStatus, deliveredAt?: string, scoreDelta?: number): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      if (typeof scoreDelta === 'number') {
        await client.query(
          `UPDATE leads SET status = $1, delivered_at = $2, score = score + $3 WHERE id = $4`,
          [status, deliveredAt ? new Date(deliveredAt) : null, scoreDelta, id]
        );
      } else {
        await client.query(
          `UPDATE leads SET status = $1, delivered_at = $2 WHERE id = $3`,
          [status, deliveredAt ? new Date(deliveredAt) : null, id]
        );
      }
      await client.query(
        `INSERT INTO outbox_events (event_type, payload) VALUES ($1, $2::jsonb)`,
        ['lead.status_updated', JSON.stringify({ leadId: id, status, deliveredAt, scoreDelta })]
      );
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async recordVote(
    leadId: string,
    signal: 'useful' | 'junk' | 'scam' | 'closed',
    weight = 1.0,
    subnet?: string,
  ): Promise<{
    votes_up: number;
    votes_down: number;
    votes_scam: number;
    votes_closed: number;
    score: number;
  }> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const res = await client.query('SELECT * FROM leads WHERE id = $1 FOR UPDATE', [leadId]);
      const row = res.rows[0];
      if (!row) {
        await client.query('ROLLBACK');
        throw new Error(`Lead not found: ${leadId}`);
      }

      let meta = typeof row.metadata_json === 'object' && row.metadata_json !== null
        ? row.metadata_json
        : JSON.parse(row.metadata_json || '{}');

      // Anti-snipe: single /24 subnet can only strike scam once
      if (signal === 'scam' && subnet) {
        const scamSubnets: string[] = Array.isArray(meta.scam_subnets) ? meta.scam_subnets : [];
        if (scamSubnets.includes(subnet)) {
          await client.query('ROLLBACK');
          return {
            votes_up: Number(row.votes_up) || 0,
            votes_down: Number(row.votes_down) || 0,
            votes_scam: Number(row.votes_scam) || 0,
            votes_closed: Number(row.votes_closed) || 0,
            score: Number(row.score) || 0,
          };
        }
        scamSubnets.push(subnet);
        meta = { ...meta, scam_subnets: scamSubnets };
      }

      const w = typeof weight === 'number' && Number.isFinite(weight) && weight > 0 ? weight : 1.0;
      let votes_up = Number(row.votes_up) || 0;
      let votes_down = Number(row.votes_down) || 0;
      let votes_scam = Number(row.votes_scam) || 0;
      let votes_closed = Number(row.votes_closed) || 0;

      if (signal === 'useful') votes_up += w;
      else if (signal === 'junk') votes_down += w;
      else if (signal === 'scam') votes_scam += w;
      else if (signal === 'closed') votes_closed += w;

      votes_up = Number(votes_up.toFixed(4));
      votes_down = Number(votes_down.toFixed(4));
      votes_scam = Number(votes_scam.toFixed(4));
      votes_closed = Number(votes_closed.toFixed(4));

      const baseScore =
        row.quality_score !== null && row.quality_score !== undefined && Number(row.quality_score) > 0
          ? Number(row.quality_score)
          : Number(row.score) || 0;

      const { score: newScore, status: newStatus } = recalculateVoteScoreAndStatus(
        row.status as LeadStatus,
        baseScore,
        { useful: votes_up, junk: votes_down, scam: votes_scam, closed: votes_closed },
      );

      await client.query(
        `UPDATE leads
         SET votes_up = $1,
             votes_down = $2,
             votes_scam = $3,
             votes_closed = $4,
             score = $5,
             status = $6,
             quality_score = COALESCE(quality_score, $7),
             metadata_json = $8::jsonb
         WHERE id = $9`,
        [votes_up, votes_down, votes_scam, votes_closed, newScore, newStatus, baseScore, JSON.stringify(meta), leadId],
      );

      await client.query(
        `INSERT INTO outbox_events (event_type, payload) VALUES ($1, $2::jsonb)`,
        ['lead.voted', JSON.stringify({ leadId, signal, weight: w, score: newScore, status: newStatus })],
      );

      await client.query('COMMIT');

      return {
        votes_up,
        votes_down,
        votes_scam,
        votes_closed,
        score: newScore,
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async listLeads(options: ListLeadsOptions = {}): Promise<Lead[]> {
    return this.queryLeads(options, false);
  }

  async getLeadsForFeed(options: FeedOptions = {}): Promise<Lead[]> {
    return this.queryLeads(options, true);
  }

  private async queryLeads(options: FeedOptions, feedOnly: boolean): Promise<Lead[]> {
    const limit = Math.max(1, Math.min(options.limit ?? 50, 5000));
    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (feedOnly) {
      conditions.push(`state = 'active'`);
      if (options.createdBefore) {
        conditions.push(`created_at <= $${idx++}::timestamptz`);
        params.push(options.createdBefore);
      }
      if (options.after) {
        conditions.push(`(created_at, id) > ($${idx}::timestamptz, $${idx + 1})`);
        params.push(options.after.createdAt, options.after.id);
        idx += 2;
      }
    }
    if (options.status) {
      conditions.push(`status = $${idx++}`);
      params.push(options.status);
    }
    if (options.sourceId) {
      conditions.push(`source_id = $${idx++}`);
      params.push(options.sourceId);
    }
    if (options.type) {
      conditions.push(`type = $${idx++}`);
      params.push(options.type);
    }
    if (options.query && options.query.trim().length > 0) {
      const trimmed = options.query.trim();
      const normQuery = normalizeTechTokens(trimmed);
      // ILIKE wildcards in user input are literal characters, not patterns.
      const like = `%${trimmed.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
      if (trimmed.length >= 2) {
        conditions.push(`(
          (to_tsvector('russian', title || ' ' || text) || to_tsvector('english', title || ' ' || text))
          @@ (websearch_to_tsquery('russian', $${idx}) || websearch_to_tsquery('english', $${idx}))
          OR title ILIKE $${idx + 1}
          OR text ILIKE $${idx + 1}
          OR city ILIKE $${idx + 1}
          OR category ILIKE $${idx + 1}
          OR skills_json::text ILIKE $${idx + 1}
        )`);
        params.push(normQuery);
        params.push(like);
        idx += 2;
      } else {
        conditions.push(`(
          title ILIKE $${idx} OR
          text ILIKE $${idx} OR
          city ILIKE $${idx} OR
          category ILIKE $${idx} OR
          title_key ILIKE $${idx} OR
          skills_json::text ILIKE $${idx}
        )`);
        params.push(like);
        idx++;
      }
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(limit);
    const order = feedOnly && options.after ? 'created_at ASC, id ASC' : 'created_at DESC, id DESC';
    const query = `SELECT * FROM leads ${whereClause} ORDER BY ${order} LIMIT $${idx}`;

    const res = await this.pool.query(query, params);
    return res.rows.map((r) => this.rowToLead(r));
  }

  async getStats(): Promise<Stats> {
    const one = async (sql: string, params: any[] = []): Promise<number> => {
      const res = await this.pool.query(sql, params);
      return parseInt(res.rows[0]?.count, 10) || 0;
    };
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

    const [sources, enabledSources, leads, newLeads, deliveredLeads, rejectedLeads, last24h] =
      await Promise.all([
        one('SELECT COUNT(*) AS count FROM sources'),
        one('SELECT COUNT(*) AS count FROM sources WHERE enabled = TRUE'),
        one('SELECT COUNT(*) AS count FROM leads'),
        one("SELECT COUNT(*) AS count FROM leads WHERE status = 'new'"),
        one("SELECT COUNT(*) AS count FROM leads WHERE status = 'delivered'"),
        one("SELECT COUNT(*) AS count FROM leads WHERE status = 'rejected'"),
        one('SELECT COUNT(*) AS count FROM leads WHERE created_at >= $1::timestamptz', [since]),
      ]);

    return {
      sources,
      enabledSources,
      leads,
      newLeads,
      deliveredLeads,
      rejectedLeads,
      last24h,
    };
  }

  async getSourceHealth(): Promise<SourceHealth[]> {
    const sources = await this.listSources();
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

    const aggregateRes = await this.pool.query(
      `SELECT source_id,
              COALESCE(SUM(found), 0) AS found,
              COALESCE(SUM(inserted), 0) AS inserted,
              COALESCE(SUM(duplicates), 0) AS duplicates,
              COALESCE(SUM(rejected), 0) AS rejected,
              COALESCE(SUM(delivered), 0) AS delivered,
              COALESCE(SUM(CASE WHEN error IS NOT NULL THEN 1 ELSE 0 END), 0) AS errors,
              COUNT(*) AS runs
       FROM runs
       WHERE started_at >= $1::timestamptz
       GROUP BY source_id`,
      [since]
    );

    const aggregate = new Map(aggregateRes.rows.map(r => [r.source_id, r]));

    const lastRunsRes = await this.pool.query(
      `SELECT r.* FROM runs r
       JOIN (
         SELECT source_id, MAX(started_at) AS max_started
         FROM runs GROUP BY source_id
       ) latest
         ON latest.source_id = r.source_id AND latest.max_started = r.started_at`
    );

    const lastBySource = new Map(lastRunsRes.rows.map(r => [r.source_id, this.rowToRun(r)]));

    return sources.map((source) => {
      const row = aggregate.get(source.id);
      const runs = parseInt(row?.runs, 10) || 0;
      const errors = parseInt(row?.errors, 10) || 0;
      return {
        source,
        lastRun: lastBySource.get(source.id),
        last24h: {
          found: parseInt(row?.found, 10) || 0,
          inserted: parseInt(row?.inserted, 10) || 0,
          duplicates: parseInt(row?.duplicates, 10) || 0,
          rejected: parseInt(row?.rejected, 10) || 0,
          delivered: parseInt(row?.delivered, 10) || 0,
          errors,
          runs,
        },
        successRate: runs === 0 ? 0 : Math.round(((runs - errors) / runs) * 100),
      };
    });
  }

  async recordDelivery(leadId: string, sink: string, status: 'sent' | 'failed', error?: string): Promise<void> {
    await this.pool.query(
      `INSERT INTO deliveries (id, lead_id, sink, status, error)
       VALUES ($1, $2, $3, $4, $5)`,
      [randomUUID(), leadId, sink, status, error ?? null]
    );
  }

  async recordRun(run: RunRecord): Promise<void> {
    await this.pool.query(
      `INSERT INTO runs (id, source_id, started_at, finished_at, found, inserted, duplicates, rejected, delivered, error)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        run.id,
        run.sourceId,
        new Date(run.startedAt),
        run.finishedAt ? new Date(run.finishedAt) : null,
        run.found,
        run.inserted,
        run.duplicates,
        run.rejected,
        run.delivered,
        run.error ?? null,
      ]
    );
  }

  async listRuns(limit = 20, sourceId?: string): Promise<RunRecord[]> {
    const query = sourceId
      ? `SELECT * FROM runs WHERE source_id = $1 ORDER BY started_at DESC LIMIT $2`
      : `SELECT * FROM runs ORDER BY started_at DESC LIMIT $1`;
    const params = sourceId ? [sourceId, limit] : [limit];
    const res = await this.pool.query(query, params);

    return res.rows.map(r => this.rowToRun(r));
  }

  private rowToRun(r: any): RunRecord {
    return {
      id: r.id,
      sourceId: r.source_id,
      startedAt: new Date(r.started_at).toISOString(),
      finishedAt: r.finished_at ? new Date(r.finished_at).toISOString() : undefined,
      found: parseInt(r.found, 10) || 0,
      inserted: parseInt(r.inserted, 10) || 0,
      duplicates: parseInt(r.duplicates, 10) || 0,
      rejected: parseInt(r.rejected, 10) || 0,
      delivered: parseInt(r.delivered, 10) || 0,
      error: r.error || undefined,
    };
  }

  private rowToLead(r: any): Lead {
    return {
      id: r.id,
      sourceId: r.source_id,
      externalId: r.external_id || undefined,
      url: r.url || undefined,
      canonicalUrl: r.canonical_url || undefined,
      title: r.title,
      text: r.text,
      author: r.author || undefined,
      city: r.city || undefined,
      budget: r.budget !== null ? Number(r.budget) : undefined,
      currency: r.currency || 'RUB',
      category: r.category || undefined,
      skills: Array.isArray(r.skills_json) ? r.skills_json : (typeof r.skills_json === 'string' ? JSON.parse(r.skills_json) : []),
      isRemote: r.is_remote !== null ? Boolean(r.is_remote) : true,
      metadata: typeof r.metadata_json === 'object' && r.metadata_json !== null ? r.metadata_json : JSON.parse(r.metadata_json || '{}'),
      publishedAt: r.published_at ? new Date(r.published_at).toISOString() : undefined,
      fingerprint: r.fingerprint,
      titleKey: r.title_key,
      status: r.status as LeadStatus,
      score: r.score,
      reasons: Array.isArray(r.reasons_json) ? r.reasons_json : JSON.parse(r.reasons_json || '[]'),
      createdAt: new Date(r.created_at).toISOString(),
      deliveredAt: r.delivered_at ? new Date(r.delivered_at).toISOString() : undefined,
      type: r.type === 'job' ? 'job' : 'gig',
      rawSalary: r.raw_salary || undefined,
      paymentPeriod: r.payment_period || undefined,
      normalizedUsdMin: r.normalized_usd_min !== null && r.normalized_usd_min !== undefined ? Number(r.normalized_usd_min) : undefined,
      normalizedUsdMax: r.normalized_usd_max !== null && r.normalized_usd_max !== undefined ? Number(r.normalized_usd_max) : undefined,
      votes_up: r.votes_up !== null && r.votes_up !== undefined ? Number(r.votes_up) : 0,
      votes_down: r.votes_down !== null && r.votes_down !== undefined ? Number(r.votes_down) : 0,
      votes_scam: r.votes_scam !== null && r.votes_scam !== undefined ? Number(r.votes_scam) : 0,
      votes_closed: r.votes_closed !== null && r.votes_closed !== undefined ? Number(r.votes_closed) : 0,
      minhash_sketch: r.minhash_sketch
        ? (Buffer.isBuffer(r.minhash_sketch)
            ? r.minhash_sketch.toString('base64url')
            : String(r.minhash_sketch))
        : undefined,
      state: (r.state as LeadState) || 'active',
      contacts: parseJsonArray(r.contacts_json),
      sourceRef: r.source_platform && r.source_channel
        ? {
            platform: r.source_platform,
            channel: r.source_channel,
            channelTitle: r.source_channel_title || undefined,
            visibility: (r.source_visibility as SourceVisibility) || 'public',
            messageId: r.source_message_id || undefined,
          }
        : undefined,
    };
  }

  async mergeLeadContacts(leadId: string, contacts: Contact[]): Promise<void> {
    if (!contacts.length) return;
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const res = await client.query(`SELECT contacts_json FROM leads WHERE id = $1 FOR UPDATE`, [leadId]);
      if (!res.rows[0]) {
        await client.query('ROLLBACK');
        return;
      }
      const merged = mergeContacts(parseJsonArray(res.rows[0].contacts_json), contacts);
      await client.query(`UPDATE leads SET contacts_json = $2::jsonb WHERE id = $1`, [leadId, JSON.stringify(merged)]);
      await client.query(
        `INSERT INTO lead_contacts (lead_id, type, value)
         SELECT $1, c->>'type', c->>'value' FROM jsonb_array_elements($2::jsonb) AS c
         ON CONFLICT DO NOTHING`,
        [leadId, JSON.stringify(merged)],
      );
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async findLeadByCanonicalUrl(canonicalUrl: string): Promise<Lead | null> {
    const res = await this.pool.query(
      `SELECT * FROM leads WHERE canonical_url = $1 ORDER BY created_at ASC LIMIT 1`,
      [canonicalUrl],
    );
    return res.rows[0] ? this.rowToLead(res.rows[0]) : null;
  }

  async listRecentSketches(sinceIso: string, limit: number): Promise<Array<{ id: string; createdAt: string; minhash: string }>> {
    const res = await this.pool.query(
      `SELECT id, created_at, minhash_sketch FROM (
         SELECT id, created_at, minhash_sketch FROM leads
         WHERE created_at >= $1 AND minhash_sketch IS NOT NULL
         ORDER BY created_at DESC LIMIT $2
       ) recent ORDER BY created_at ASC`,
      [new Date(sinceIso), limit],
    );
    return res.rows.map((r) => ({
      id: r.id,
      createdAt: new Date(r.created_at).toISOString(),
      minhash: Buffer.isBuffer(r.minhash_sketch) ? r.minhash_sketch.toString('base64url') : String(r.minhash_sketch),
    }));
  }

  async findRecentByContacts(contacts: Contact[], sinceIso: string, limit = 20): Promise<Lead[]> {
    if (!contacts.length) return [];
    const res = await this.pool.query(
      `SELECT l.* FROM leads l
       WHERE l.created_at >= $2 AND EXISTS (
         SELECT 1 FROM lead_contacts lc
         JOIN jsonb_to_recordset($1::jsonb) AS c(type TEXT, value TEXT) ON lc.type = c.type AND lc.value = c.value
         WHERE lc.lead_id = l.id
       )
       ORDER BY l.created_at DESC LIMIT $3`,
      [JSON.stringify(contacts.map((c) => ({ type: c.type, value: c.value }))), new Date(sinceIso), limit]
    );
    return res.rows.map((r) => this.rowToLead(r));
  }

  async initLeadDeliveries(leadId: string, sinks: string[]): Promise<void> {
    for (const sink of sinks) {
      await this.pool.query(
        `INSERT INTO lead_deliveries (lead_id, sink, status, attempts, next_attempt_at, created_at, updated_at)
         VALUES ($1, $2, 'pending', 0, NOW(), NOW(), NOW())
         ON CONFLICT (lead_id, sink) DO NOTHING`,
        [leadId, sink]
      );
    }
  }

  async updateLeadDelivery(
    leadId: string,
    sink: string,
    status: 'sent' | 'failed',
    error?: string,
    nextAttemptAt?: string
  ): Promise<void> {
    await this.pool.query(
      `UPDATE lead_deliveries
       SET status = $3,
           attempts = attempts + 1,
           last_error = $4,
           next_attempt_at = COALESCE($5::timestamptz, NOW()),
           updated_at = NOW()
       WHERE lead_id = $1 AND sink = $2`,
      [leadId, sink, status, error || null, nextAttemptAt || null]
    );
  }

  async getPendingDeliveries(limit = 50): Promise<LeadDeliveryRecord[]> {
    const res = await this.pool.query(
      `SELECT lead_id, sink, status, attempts, next_attempt_at, last_error, created_at, updated_at
       FROM lead_deliveries
       WHERE status != 'sent' AND attempts < 5 AND next_attempt_at <= NOW()
       ORDER BY next_attempt_at ASC
       LIMIT $1
       FOR UPDATE SKIP LOCKED`,
      [limit]
    );
    return res.rows.map((r: any) => ({
      leadId: r.lead_id,
      sink: r.sink,
      status: r.status,
      attempts: parseInt(r.attempts, 10) || 0,
      nextAttemptAt: new Date(r.next_attempt_at).toISOString(),
      lastError: r.last_error || undefined,
      createdAt: new Date(r.created_at).toISOString(),
      updatedAt: new Date(r.updated_at).toISOString(),
    }));
  }

  async getLeadDeliveries(leadId: string): Promise<LeadDeliveryRecord[]> {
    const res = await this.pool.query(
      `SELECT lead_id, sink, status, attempts, next_attempt_at, last_error, created_at, updated_at
       FROM lead_deliveries
       WHERE lead_id = $1
       ORDER BY sink ASC`,
      [leadId]
    );
    return res.rows.map((r: any) => ({
      leadId: r.lead_id,
      sink: r.sink,
      status: r.status,
      attempts: parseInt(r.attempts, 10) || 0,
      nextAttemptAt: new Date(r.next_attempt_at).toISOString(),
      lastError: r.last_error || undefined,
      createdAt: new Date(r.created_at).toISOString(),
      updatedAt: new Date(r.updated_at).toISOString(),
    }));
  }

  async createSession(sessionId: string, expiresAt: string, userId?: number): Promise<void> {
    await this.pool.query(
      `INSERT INTO sessions (id, expires_at, user_id)
       VALUES ($1, $2::timestamptz, $3)
       ON CONFLICT (id) DO UPDATE SET expires_at = $2::timestamptz, user_id = $3`,
      [sessionId, expiresAt, userId ?? null]
    );
  }

  /** Admin sessions (token login) have user_id = NULL; GitHub sessions carry a user. */
  async validateSession(sessionId: string): Promise<boolean> {
    const res = await this.pool.query(
      `SELECT 1 FROM sessions WHERE id = $1 AND user_id IS NULL AND expires_at > NOW()`,
      [sessionId]
    );
    return (res.rowCount ?? 0) > 0;
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.pool.query(`DELETE FROM sessions WHERE id = $1`, [sessionId]);
  }

  async purgeExpiredSessions(): Promise<number> {
    const res = await this.pool.query(`DELETE FROM sessions WHERE expires_at < NOW()`);
    return res.rowCount ?? 0;
  }

  async upsertGitHubUser(input: UpsertGitHubUserInput): Promise<UserRecord> {
    const res = await this.pool.query(
      `INSERT INTO app_users (github_id, handle, role)
       VALUES ($1, $2, 'participant')
       ON CONFLICT (github_id) DO UPDATE SET handle = EXCLUDED.handle
       RETURNING id, github_id, handle, role, created_at`,
      [input.githubId, input.handle]
    );
    const r = res.rows[0]!;
    return {
      id: Number(r.id),
      githubId: Number(r.github_id),
      handle: r.handle,
      role: r.role,
      createdAt: new Date(r.created_at).toISOString(),
    };
  }

  async getUserBySession(sessionId: string): Promise<UserRecord | null> {
    const res = await this.pool.query(
      `SELECT u.id, u.github_id, u.handle, u.role, u.created_at
       FROM sessions s
       JOIN app_users u ON u.id = s.user_id
       WHERE s.id = $1 AND s.expires_at > NOW()`,
      [sessionId]
    );
    if (!res.rows[0]) return null;
    const r = res.rows[0];
    return {
      id: Number(r.id),
      githubId: Number(r.github_id),
      handle: r.handle,
      role: r.role,
      createdAt: new Date(r.created_at).toISOString(),
    };
  }

  async getUserVote(leadId: string, userId: number): Promise<LeadVoteSignal | null> {
    const res = await this.pool.query(
      'SELECT signal FROM lead_votes WHERE user_id = $1 AND lead_id = $2 LIMIT 1',
      [userId, leadId],
    );
    return (res.rows[0]?.signal as LeadVoteSignal) ?? null;
  }

  async recordUserVote(
    leadId: string,
    userId: number,
    signal: LeadVoteSignal,
  ): Promise<UserVoteResult> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const res = await client.query('SELECT * FROM leads WHERE id = $1 FOR UPDATE', [leadId]);
      const row = res.rows[0];
      if (!row) {
        await client.query('ROLLBACK');
        throw new Error(`Lead not found: ${leadId}`);
      }

      // Check existing vote
      const existingRes = await client.query(
        'SELECT signal FROM lead_votes WHERE user_id = $1 AND lead_id = $2 LIMIT 1',
        [userId, leadId],
      );
      const existingSignal = existingRes.rows[0]?.signal as LeadVoteSignal | undefined;

      let votes_up = Number(row.votes_up) || 0;
      let votes_down = Number(row.votes_down) || 0;
      let votes_scam = Number(row.votes_scam) || 0;
      let votes_closed = Number(row.votes_closed) || 0;

      const decrement = (sig: LeadVoteSignal) => {
        if (sig === 'useful') votes_up = Math.max(0, votes_up - 1);
        else if (sig === 'junk') votes_down = Math.max(0, votes_down - 1);
        else if (sig === 'scam') votes_scam = Math.max(0, votes_scam - 1);
        else if (sig === 'closed') votes_closed = Math.max(0, votes_closed - 1);
      };
      const increment = (sig: LeadVoteSignal) => {
        if (sig === 'useful') votes_up += 1;
        else if (sig === 'junk') votes_down += 1;
        else if (sig === 'scam') votes_scam += 1;
        else if (sig === 'closed') votes_closed += 1;
      };

      let activeVote: LeadVoteSignal | null = signal;

      if (existingSignal === signal) {
        // Cancel / toggle off vote
        await client.query(
          'DELETE FROM lead_votes WHERE user_id = $1 AND lead_id = $2',
          [userId, leadId],
        );
        decrement(signal);
        activeVote = null;
      } else {
        if (existingSignal) {
          await client.query(
            'DELETE FROM lead_votes WHERE user_id = $1 AND lead_id = $2',
            [userId, leadId],
          );
          decrement(existingSignal);
        }
        await client.query(
          `INSERT INTO lead_votes (user_id, lead_id, signal, weight, counted_at)
           VALUES ($1, $2, $3, 1.0, NOW())`,
          [userId, leadId, signal],
        );
        increment(signal);
      }

      const baseScore =
        row.quality_score !== null && row.quality_score !== undefined && Number(row.quality_score) > 0
          ? Number(row.quality_score)
          : Number(row.score) || 0;

      const { score: newScore, status: newStatus } = recalculateVoteScoreAndStatus(
        row.status as LeadStatus,
        baseScore,
        { useful: votes_up, junk: votes_down, scam: votes_scam, closed: votes_closed },
      );

      await client.query(
        `UPDATE leads
         SET votes_up = $1, votes_down = $2, votes_scam = $3, votes_closed = $4,
             score = $5, status = $6, quality_score = COALESCE(quality_score, $7)
         WHERE id = $8`,
        [votes_up, votes_down, votes_scam, votes_closed, newScore, newStatus, baseScore, leadId]
      );

      await client.query(
        `INSERT INTO outbox_events (event_type, payload) VALUES ($1, $2::jsonb)`,
        ['lead.voted', JSON.stringify({ leadId, userId, signal, weight: 1.0, score: newScore, status: newStatus, myVote: activeVote })]
      );

      await client.query('COMMIT');
      return {
        votes_up,
        votes_down,
        votes_scam,
        votes_closed,
        score: newScore,
        status: newStatus,
        alreadyVoted: false,
        myVote: activeVote,
      };

      return {
        votes_up,
        votes_down,
        votes_scam,
        votes_closed,
        score: newScore,
        status: newStatus,
        alreadyVoted: false,
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async deleteLead(id: string): Promise<boolean> {
    const res = await this.pool.query(`DELETE FROM leads WHERE id = $1`, [id]);
    return (res.rowCount ?? 0) > 0;
  }

  async cleanupOldLeads(retentionDays: number): Promise<number> {
    const res = await this.pool.query(
      `DELETE FROM leads WHERE created_at < NOW() - ($1 || ' days')::interval`,
      [retentionDays]
    );
    return res.rowCount ?? 0;
  }

  async cleanupOutboxEvents(retentionDays: number): Promise<number> {
    const res = await this.pool.query(
      `DELETE FROM outbox_events WHERE created_at < NOW() - ($1 || ' days')::interval`,
      [retentionDays]
    );
    return res.rowCount ?? 0;
  }

  async cleanupRuns(retentionDays: number): Promise<number> {
    const res = await this.pool.query(
      `DELETE FROM runs WHERE started_at < NOW() - ($1 || ' days')::interval`,
      [retentionDays]
    );
    return res.rowCount ?? 0;
  }

  // --- radar/2 hub ---

  async touchParticipant(pubkey: string): Promise<ParticipantRecord> {
    const res = await this.pool.query(
      `INSERT INTO participants (pubkey) VALUES ($1)
       ON CONFLICT (pubkey) DO UPDATE SET last_seen_at = NOW()
       RETURNING *`,
      [pubkey],
    );
    return rowToParticipant(res.rows[0]);
  }

  async getParticipant(pubkey: string): Promise<ParticipantRecord | null> {
    const res = await this.pool.query(`SELECT * FROM participants WHERE pubkey = $1`, [pubkey]);
    return res.rows[0] ? rowToParticipant(res.rows[0]) : null;
  }

  async setParticipantProfile(pubkey: string, profile: Record<string, unknown>): Promise<void> {
    await this.pool.query(
      `INSERT INTO participants (pubkey, profile_json) VALUES ($1, $2::jsonb)
       ON CONFLICT (pubkey) DO UPDATE SET profile_json = EXCLUDED.profile_json, last_seen_at = NOW()`,
      [pubkey, JSON.stringify(profile)],
    );
  }

  async insertEvent(event: StoredEvent): Promise<boolean> {
    const res = await this.pool.query(
      `INSERT INTO events (id, pubkey, kind, created_at, tags_json, content, sig)
       VALUES ($1, $2, $3, to_timestamp($4), $5::jsonb, $6, $7)
       ON CONFLICT (id) DO NOTHING`,
      [event.id, event.pubkey, event.kind, event.createdAt, JSON.stringify(event.tags), event.content, event.sig],
    );
    return (res.rowCount ?? 0) > 0;
  }

  async addObservation(r: ObservationRecord): Promise<void> {
    await this.pool.query(
      `INSERT INTO observations
         (event_id, lead_id, pubkey, platform, channel, channel_title, visibility, message_id, is_first, archived, received_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (event_id) DO NOTHING`,
      [r.eventId, r.leadId, r.pubkey, r.platform, r.channel, r.channelTitle ?? null, r.visibility, r.messageId ?? null,
        r.isFirst, r.archived, new Date(r.receivedAt)],
    );
  }

  async listObservations(leadId: string): Promise<ObservationRecord[]> {
    const res = await this.pool.query(
      `SELECT * FROM observations WHERE lead_id = $1 ORDER BY received_at ASC`,
      [leadId],
    );
    return res.rows.map(rowToObservation);
  }

  async findObservationsByPost(platform: string, channel: string, messageId: string): Promise<ObservationRecord[]> {
    const res = await this.pool.query(
      `SELECT * FROM observations WHERE platform = $1 AND channel = $2 AND message_id = $3 ORDER BY received_at ASC`,
      [platform, channel, messageId],
    );
    return res.rows.map(rowToObservation);
  }

  async upsertSignal(r: SignalRecord): Promise<void> {
    await this.pool.query(
      `INSERT INTO signals (lead_id, pubkey, signal, comment, event_id, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (lead_id, pubkey) DO UPDATE
         SET signal = EXCLUDED.signal, comment = EXCLUDED.comment, event_id = EXCLUDED.event_id, created_at = EXCLUDED.created_at`,
      [r.leadId, r.pubkey, r.signal, r.comment, r.eventId ?? null, new Date(r.createdAt)],
    );
  }

  async listSignals(leadId: string): Promise<SignalRecord[]> {
    const res = await this.pool.query(`SELECT * FROM signals WHERE lead_id = $1 ORDER BY created_at ASC`, [leadId]);
    return res.rows.map((r) => ({
      leadId: r.lead_id,
      pubkey: r.pubkey,
      signal: r.signal,
      comment: r.comment ?? '',
      eventId: r.event_id || undefined,
      createdAt: new Date(r.created_at).toISOString(),
    }));
  }

  async rememberAuth(id: string, expiresAt: string): Promise<boolean> {
    await this.pool.query(`DELETE FROM auth_replay WHERE expires_at < NOW()`);
    const res = await this.pool.query(
      `INSERT INTO auth_replay (id, expires_at) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING`,
      [id, new Date(expiresAt)],
    );
    return (res.rowCount ?? 0) > 0;
  }

  async updateLeadState(id: string, state: LeadState): Promise<void> {
    await this.pool.query(`UPDATE leads SET state = $1 WHERE id = $2`, [state, id]);
  }

}

function parseJsonArray(value: unknown): any[] {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string' && value) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function rowToParticipant(r: any): ParticipantRecord {
  return {
    pubkey: r.pubkey,
    githubUserId: r.github_user_id !== null && r.github_user_id !== undefined ? Number(r.github_user_id) : undefined,
    profile: r.profile_json && typeof r.profile_json === 'object' ? r.profile_json : {},
    bannedAt: r.banned_at ? new Date(r.banned_at).toISOString() : undefined,
    bannedReason: r.banned_reason || undefined,
    createdAt: new Date(r.created_at).toISOString(),
    lastSeenAt: new Date(r.last_seen_at).toISOString(),
  };
}

function rowToObservation(r: any): ObservationRecord {
  return {
    eventId: r.event_id,
    leadId: r.lead_id,
    pubkey: r.pubkey,
    platform: r.platform,
    channel: r.channel,
    channelTitle: r.channel_title || undefined,
    visibility: r.visibility,
    messageId: r.message_id || undefined,
    isFirst: Boolean(r.is_first),
    archived: Boolean(r.archived),
    receivedAt: new Date(r.received_at).toISOString(),
  };
}
