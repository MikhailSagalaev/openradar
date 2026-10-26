import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { recalculateVoteScoreAndStatus } from '../core/rules.ts';
import { normalizeTechTokens } from '../core/text.ts';
import type {
  Lead,
  LeadStatus,
  LeadVoteSignal,
  RunRecord,
  SourceConfig,
  SourceHealth,
  SourceKind,
  SourceRecord,
  Stats,
} from '../core/types.ts';
import type {
  CreateSourceInput,
  LeadAttestationInput,
  LeadAttestationRecord,
  LeadDeliveryRecord,
  ListLeadsOptions,
  MeshNodeInput,
  MeshNodeRecord,
  Store,
  UpdateSourceInput,
  UpsertGitHubUserInput,
  UserRecord,
  UserVoteResult,
  ViewerAccessContext,
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
          publisher_pubkey, nostr_event_id, minhash_sketch, verification_state,
          attestation_count, is_mesh_exclusive, unlocked_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7,
          $8, $9, $10, $11, $12, $13::jsonb, $14,
          $15::jsonb, $16, $17, $18, $19, $20,
          $21::jsonb, $22, $23, $24,
          $25, $26, $27, $28, $29,
          $30, $31, $32, $33,
          $34, $35, $36, $37,
          $38, $39, COALESCE($40, NOW())
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
          lead.publisher_pubkey ?? null,
          lead.nostr_event_id ?? null,
          lead.minhash_sketch ? Buffer.from(lead.minhash_sketch, 'base64url') : null,
          lead.verification_state ?? 'unverified',
          lead.attestation_count ?? 0,
          lead.is_mesh_exclusive ?? false,
          lead.unlocked_at ? new Date(lead.unlocked_at) : null,
        ]
      );

      const inserted = (res.rowCount ?? 0) > 0;

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
    const limit = options.limit ?? 50;
    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;

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
        params.push(`%${trimmed}%`);
        idx += 2;
      } else {
        const q = `%${trimmed}%`;
        conditions.push(`(
          title ILIKE $${idx} OR
          text ILIKE $${idx} OR
          city ILIKE $${idx} OR
          category ILIKE $${idx} OR
          title_key ILIKE $${idx} OR
          skills_json::text ILIKE $${idx}
        )`);
        params.push(q);
        idx++;
      }
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(limit);
    const query = `SELECT * FROM leads ${whereClause} ORDER BY created_at DESC LIMIT $${idx}`;

    const res = await this.pool.query(query, params);
    return res.rows.map(r => this.rowToLead(r));
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
      publisher_pubkey: r.publisher_pubkey || undefined,
      nostr_event_id: r.nostr_event_id || undefined,
      minhash_sketch: r.minhash_sketch
        ? (Buffer.isBuffer(r.minhash_sketch)
            ? r.minhash_sketch.toString('base64url')
            : String(r.minhash_sketch))
        : undefined,
      verification_state: r.verification_state || 'unverified',
      attestation_count: r.attestation_count !== null && r.attestation_count !== undefined ? Number(r.attestation_count) : 0,
      is_mesh_exclusive: Boolean(r.is_mesh_exclusive),
      unlocked_at: r.unlocked_at ? new Date(r.unlocked_at).toISOString() : undefined,
    };
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

  async upsertMeshNode(node: MeshNodeInput): Promise<MeshNodeRecord> {
    const res = await this.pool.query(
      `INSERT INTO mesh_nodes (
        pubkey, npub, github_username, github_gist_url, github_verified_at, nip05_domain, trust_score, is_banned, false_reports_count, valid_leads_7d, last_seen_at
      ) VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, 0.05), COALESCE($8, FALSE), COALESCE($9, 0), COALESCE($10, 0), NOW())
      ON CONFLICT (pubkey) DO UPDATE SET
        github_username = COALESCE(EXCLUDED.github_username, mesh_nodes.github_username),
        github_gist_url = COALESCE(EXCLUDED.github_gist_url, mesh_nodes.github_gist_url),
        github_verified_at = COALESCE(EXCLUDED.github_verified_at, mesh_nodes.github_verified_at),
        nip05_domain = COALESCE(EXCLUDED.nip05_domain, mesh_nodes.nip05_domain),
        trust_score = COALESCE(EXCLUDED.trust_score, mesh_nodes.trust_score),
        is_banned = COALESCE(EXCLUDED.is_banned, mesh_nodes.is_banned),
        false_reports_count = COALESCE(EXCLUDED.false_reports_count, mesh_nodes.false_reports_count),
        valid_leads_7d = COALESCE(EXCLUDED.valid_leads_7d, mesh_nodes.valid_leads_7d),
        last_seen_at = NOW()
      RETURNING *`,
      [
        node.pubkey.toLowerCase(),
        node.npub,
        node.github_username ?? null,
        node.github_gist_url ?? null,
        node.github_verified_at ? new Date(node.github_verified_at) : null,
        node.nip05_domain ?? null,
        node.trust_score ?? null,
        node.is_banned ?? null,
        node.false_reports_count ?? null,
        node.valid_leads_7d ?? null,
      ]
    );
    const r = res.rows[0];
    return {
      pubkey: r.pubkey,
      npub: r.npub,
      github_username: r.github_username || undefined,
      github_gist_url: r.github_gist_url || undefined,
      github_verified_at: r.github_verified_at ? new Date(r.github_verified_at).toISOString() : undefined,
      nip05_domain: r.nip05_domain || undefined,
      trust_score: Number(r.trust_score),
      valid_leads_7d: Number(r.valid_leads_7d),
      valid_attestations_24h: Number(r.valid_attestations_24h),
      false_reports_count: Number(r.false_reports_count),
      is_banned: Boolean(r.is_banned),
      created_at: new Date(r.created_at).toISOString(),
      last_seen_at: new Date(r.last_seen_at).toISOString(),
    };
  }

  async updateLeadVerification(id: string, verificationState: import('../core/types.ts').VerificationState): Promise<void> {
    await this.pool.query(`UPDATE leads SET verification_state = $1 WHERE id = $2`, [verificationState, id]);
  }

  async getMeshNode(pubkey: string): Promise<MeshNodeRecord | null> {
    const res = await this.pool.query(`SELECT * FROM mesh_nodes WHERE pubkey = $1`, [pubkey.toLowerCase()]);
    if (!res.rows[0]) return null;
    const r = res.rows[0];
    return {
      pubkey: r.pubkey,
      npub: r.npub,
      github_username: r.github_username || undefined,
      github_gist_url: r.github_gist_url || undefined,
      github_verified_at: r.github_verified_at ? new Date(r.github_verified_at).toISOString() : undefined,
      nip05_domain: r.nip05_domain || undefined,
      trust_score: Number(r.trust_score),
      valid_leads_7d: Number(r.valid_leads_7d),
      valid_attestations_24h: Number(r.valid_attestations_24h),
      false_reports_count: Number(r.false_reports_count),
      is_banned: Boolean(r.is_banned),
      created_at: new Date(r.created_at).toISOString(),
      last_seen_at: new Date(r.last_seen_at).toISOString(),
    };
  }

  async recordAttestation(attestation: LeadAttestationInput): Promise<LeadAttestationRecord> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const res = await client.query(
        `INSERT INTO lead_attestations (
          nostr_event_id, lead_id, signer_pubkey, kind, signal_or_status, recomputed_hash, confidence, raw_event
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
        ON CONFLICT (lead_id, signer_pubkey, kind) DO UPDATE SET
          signal_or_status = EXCLUDED.signal_or_status,
          recomputed_hash = EXCLUDED.recomputed_hash,
          confidence = EXCLUDED.confidence,
          raw_event = EXCLUDED.raw_event
        RETURNING *`,
        [
          attestation.nostr_event_id,
          attestation.lead_id,
          attestation.signer_pubkey.toLowerCase(),
          attestation.kind,
          attestation.signal_or_status,
          attestation.recomputed_hash ?? null,
          attestation.confidence ?? 1.0,
          JSON.stringify(attestation.raw_event),
        ]
      );

      if (attestation.kind === 30405 && attestation.signal_or_status === 'verified') {
        await client.query(
          `UPDATE leads SET attestation_count = attestation_count + 1, verification_state = 'attested'
           WHERE id = $1 AND verification_state = 'unverified'`,
          [attestation.lead_id]
        );
      } else {
        await client.query(
          `UPDATE leads SET attestation_count = attestation_count + 1 WHERE id = $1`,
          [attestation.lead_id]
        );
      }
      await client.query('COMMIT');
      const r = res.rows[0];
      return {
        id: Number(r.id),
        nostr_event_id: r.nostr_event_id,
        lead_id: r.lead_id,
        signer_pubkey: r.signer_pubkey,
        kind: r.kind,
        signal_or_status: r.signal_or_status,
        recomputed_hash: r.recomputed_hash || undefined,
        confidence: Number(r.confidence),
        raw_event: r.raw_event,
        created_at: new Date(r.created_at).toISOString(),
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async enqueueArbiterCheck(leadId: string, triggerReason: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO arbiter_queue (lead_id, trigger_reason, attempts, next_run_at)
         VALUES ($1, $2, 0, NOW())
         ON CONFLICT (lead_id) DO UPDATE SET trigger_reason = $2, next_run_at = NOW()`,
        [leadId, triggerReason]
      );
      await client.query(
        `UPDATE leads SET verification_state = 'under_review'
         WHERE id = $1 AND verification_state NOT IN ('killed_scam', 'killed_closed')`,
        [leadId]
      );
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async getLeadsForFeed(viewerContext: ViewerAccessContext, options: ListLeadsOptions = {}): Promise<Lead[]> {
    const limit = options.limit || 50;
    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;

    conditions.push(`verification_state NOT IN ('killed_scam', 'killed_closed')`);

    const isPrivileged =
      viewerContext.isAdmin ||
      viewerContext.isRealtime ||
      viewerContext.hasValidAttestations24h ||
      (viewerContext.trustScore ?? 0) >= 0.2;

    if (!isPrivileged) {
      conditions.push(`is_mesh_exclusive = FALSE`);
      conditions.push(`unlocked_at <= NOW()`);
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
        params.push(`%${trimmed}%`);
        idx += 2;
      } else {
        const q = `%${trimmed}%`;
        conditions.push(`(
          title ILIKE $${idx} OR
          text ILIKE $${idx} OR
          city ILIKE $${idx} OR
          category ILIKE $${idx} OR
          title_key ILIKE $${idx} OR
          skills_json::text ILIKE $${idx}
        )`);
        params.push(q);
        idx += 1;
      }
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;
    params.push(limit);
    const query = `SELECT * FROM leads ${whereClause} ORDER BY created_at DESC LIMIT $${idx}`;

    const res = await this.pool.query(query, params);
    return res.rows.map((r) => this.rowToLead(r));
  }
}
