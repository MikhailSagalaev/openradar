import { randomUUID } from 'node:crypto';
import { recalculateVoteScoreAndStatus } from '../core/rules.ts';
import { normalizeTechTokens } from '../core/text.ts';
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
import type {
  Lead,
  LeadStatus,
  LeadVoteSignal,
  RunRecord,
  SourceHealth,
  SourceRecord,
  Stats,
} from '../core/types.ts';

export class MemoryStore implements Store {
  private sources = new Map<string, SourceRecord>();
  private leads = new Map<string, Lead>();
  private leadsByFingerprint = new Map<string, string>();
  private leadsByExternal = new Map<string, string>();
  private runs: RunRecord[] = [];
  private deliveries: Array<{ id: string; leadId: string; sink: string; status: string; error?: string; createdAt: string }> = [];
  private leadDeliveries = new Map<string, LeadDeliveryRecord>();
  private users = new Map<number, UserRecord>();
  private usersByGithubId = new Map<number, number>();
  private nextUserId = 1;
  private userVotes = new Set<string>();
  private sessions = new Map<string, { id: string; expiresAt: string; userId?: number }>();
  private meshNodes = new Map<string, MeshNodeRecord>();
  private attestations: LeadAttestationRecord[] = [];
  private arbiterQueue = new Map<string, { triggerReason: string; attempts: number; nextRunAt: string; lastError?: string; createdAt: string }>();

  async init(): Promise<void> {}

  async listSources(): Promise<SourceRecord[]> {
    return Array.from(this.sources.values()).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async getSource(id: string): Promise<SourceRecord | null> {
    return this.sources.get(id) ?? null;
  }

  async createSource(input: CreateSourceInput): Promise<SourceRecord> {
    const now = new Date().toISOString();
    const id = input.id?.trim() || `${input.kind}_${randomUUID().slice(0, 8)}`;
    const record: SourceRecord = {
      id,
      kind: input.kind,
      title: input.title.trim(),
      enabled: input.enabled ?? true,
      config: input.config ?? {},
      createdAt: now,
      updatedAt: now,
    };
    this.sources.set(id, record);
    return record;
  }

  async updateSource(id: string, patch: UpdateSourceInput): Promise<SourceRecord | null> {
    const current = this.sources.get(id);
    if (!current) return null;
    const updated: SourceRecord = {
      ...current,
      title: patch.title?.trim() || current.title,
      enabled: patch.enabled ?? current.enabled,
      config: patch.config ?? current.config,
      updatedAt: new Date().toISOString(),
    };
    this.sources.set(id, updated);
    return updated;
  }

  async deleteSource(id: string): Promise<boolean> {
    return this.sources.delete(id);
  }

  async findLeadByFingerprint(fingerprint: string): Promise<Lead | null> {
    const id = this.leadsByFingerprint.get(fingerprint);
    if (!id) return null;
    return this.getLead(id);
  }

  async getLead(id: string): Promise<Lead | null> {
    const lead = this.leads.get(id);
    if (!lead) return null;
    return {
      ...lead,
      votes_up: lead.votes_up ?? 0,
      votes_down: lead.votes_down ?? 0,
      votes_scam: lead.votes_scam ?? 0,
      votes_closed: lead.votes_closed ?? 0,
    };
  }

  async findRecentByTitleKey(titleKey: string, city: string | undefined, sinceIso: string): Promise<Lead | null> {
    const candidates = Array.from(this.leads.values())
      .filter((lead) => {
        if (lead.titleKey !== titleKey) return false;
        if (city && lead.city !== city) return false;
        if (!city && lead.city !== null && lead.city !== undefined) return false;
        return lead.createdAt >= sinceIso;
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const cand = candidates[0];
    if (!cand) return null;
    return {
      ...cand,
      votes_up: cand.votes_up ?? 0,
      votes_down: cand.votes_down ?? 0,
      votes_scam: cand.votes_scam ?? 0,
      votes_closed: cand.votes_closed ?? 0,
    };
  }

  async insertLead(lead: Lead): Promise<boolean> {
    if (this.leadsByFingerprint.has(lead.fingerprint)) {
      return false;
    }
    if (lead.externalId && this.leadsByExternal.has(`${lead.sourceId}:${lead.externalId}`)) {
      return false;
    }
    const storedLead: Lead = {
      ...lead,
      votes_up: lead.votes_up ?? 0,
      votes_down: lead.votes_down ?? 0,
      votes_scam: lead.votes_scam ?? 0,
      votes_closed: lead.votes_closed ?? 0,
    };
    (storedLead as any).baseScore = lead.score;
    this.leads.set(lead.id, storedLead);
    this.leadsByFingerprint.set(lead.fingerprint, lead.id);
    if (lead.externalId) {
      this.leadsByExternal.set(`${lead.sourceId}:${lead.externalId}`, lead.id);
    }
    return true;
  }

  async updateLeadStatus(id: string, status: LeadStatus, deliveredAt?: string, scoreDelta?: number): Promise<void> {
    const lead = this.leads.get(id);
    if (lead) {
      lead.status = status;
      if (deliveredAt !== undefined) {
        lead.deliveredAt = deliveredAt;
      }
      if (typeof scoreDelta === 'number') {
        lead.score += scoreDelta;
        (lead as any).baseScore = lead.score;
      }
    }
  }

  async updateLeadVerification(id: string, verificationState: import('../core/types.ts').VerificationState): Promise<void> {
    const lead = this.leads.get(id);
    if (lead) {
      lead.verification_state = verificationState;
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
    const lead = this.leads.get(leadId);
    if (!lead) {
      throw new Error(`Lead not found: ${leadId}`);
    }

    // Anti-snipe: single /24 subnet can only strike scam once
    if (signal === 'scam' && subnet) {
      const meta = lead.metadata ?? {};
      const scamSubnets = Array.isArray(meta.scam_subnets) ? (meta.scam_subnets as string[]) : [];
      if (scamSubnets.includes(subnet)) {
        return {
          votes_up: lead.votes_up ?? 0,
          votes_down: lead.votes_down ?? 0,
          votes_scam: lead.votes_scam ?? 0,
          votes_closed: lead.votes_closed ?? 0,
          score: lead.score,
        };
      }
      scamSubnets.push(subnet);
      lead.metadata = { ...meta, scam_subnets: scamSubnets };
    }

    const w = typeof weight === 'number' && Number.isFinite(weight) && weight > 0 ? weight : 1.0;
    let votes_up = lead.votes_up ?? 0;
    let votes_down = lead.votes_down ?? 0;
    let votes_scam = lead.votes_scam ?? 0;
    let votes_closed = lead.votes_closed ?? 0;

    if (signal === 'useful') votes_up += w;
    else if (signal === 'junk') votes_down += w;
    else if (signal === 'scam') votes_scam += w;
    else if (signal === 'closed') votes_closed += w;

    votes_up = Number(votes_up.toFixed(4));
    votes_down = Number(votes_down.toFixed(4));
    votes_scam = Number(votes_scam.toFixed(4));
    votes_closed = Number(votes_closed.toFixed(4));

    const baseScore = (lead as any).baseScore ?? lead.score;
    const { score: newScore, status: newStatus } = recalculateVoteScoreAndStatus(
      lead.status,
      baseScore,
      { useful: votes_up, junk: votes_down, scam: votes_scam, closed: votes_closed },
    );

    lead.votes_up = votes_up;
    lead.votes_down = votes_down;
    lead.votes_scam = votes_scam;
    lead.votes_closed = votes_closed;
    lead.score = newScore;
    lead.status = newStatus;

    return {
      votes_up,
      votes_down,
      votes_scam,
      votes_closed,
      score: newScore,
    };
  }

  async listLeads(options: ListLeadsOptions = {}): Promise<Lead[]> {
    let result = Array.from(this.leads.values());
    if (options.status) {
      result = result.filter((l) => l.status === options.status);
    }
    if (options.sourceId) {
      result = result.filter((l) => l.sourceId === options.sourceId);
    }
    if (options.type) {
      result = result.filter((l) => (l.type ?? 'gig') === options.type);
    }
    if (options.query?.trim()) {
      const q = options.query.trim().toLowerCase();
      const normQ = normalizeTechTokens(q).toLowerCase();
      result = result.filter((l) => {
        const rawText = `${l.title} ${l.text} ${l.author ?? ''} ${l.city ?? ''} ${(l.skills ?? []).join(' ')}`.toLowerCase();
        const normText = normalizeTechTokens(rawText).toLowerCase();
        return rawText.includes(q) || normText.includes(normQ);
      });
    }

    result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const limit = Math.max(1, Math.min(options.limit ?? 50, 5000));
    return result.slice(0, limit).map((l) => ({
      ...l,
      votes_up: l.votes_up ?? 0,
      votes_down: l.votes_down ?? 0,
      votes_scam: l.votes_scam ?? 0,
      votes_closed: l.votes_closed ?? 0,
    }));
  }

  async getStats(): Promise<Stats> {
    const all = Array.from(this.leads.values());
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    return {
      sources: this.sources.size,
      enabledSources: Array.from(this.sources.values()).filter((s) => s.enabled).length,
      leads: all.length,
      newLeads: all.filter((l) => l.status === 'new').length,
      deliveredLeads: all.filter((l) => l.status === 'delivered').length,
      rejectedLeads: all.filter((l) => l.status === 'rejected').length,
      last24h: all.filter((l) => l.createdAt >= since).length,
    };
  }

  async getSourceHealth(): Promise<SourceHealth[]> {
    const sources = await this.listSources();
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

    return sources.map((source) => {
      const sourceRuns = this.runs.filter((r) => r.sourceId === source.id);
      const recentRuns = sourceRuns.filter((r) => r.startedAt >= since);
      const errors = recentRuns.filter((r) => Boolean(r.error)).length;
      const lastRun = sourceRuns[0];

      return {
        source,
        lastRun,
        last24h: {
          found: recentRuns.reduce((acc, r) => acc + r.found, 0),
          inserted: recentRuns.reduce((acc, r) => acc + r.inserted, 0),
          duplicates: recentRuns.reduce((acc, r) => acc + r.duplicates, 0),
          rejected: recentRuns.reduce((acc, r) => acc + r.rejected, 0),
          delivered: recentRuns.reduce((acc, r) => acc + r.delivered, 0),
          errors,
          runs: recentRuns.length,
        },
        successRate: recentRuns.length > 0 ? Math.round(((recentRuns.length - errors) / recentRuns.length) * 100) : 0,
      };
    });
  }

  async recordRun(run: RunRecord): Promise<void> {
    this.runs.unshift(run);
  }

  async listRuns(limit = 20, sourceId?: string): Promise<RunRecord[]> {
    let filtered = this.runs;
    if (sourceId) {
      filtered = filtered.filter((r) => r.sourceId === sourceId);
    }
    return filtered.slice(0, limit);
  }

  async recordDelivery(leadId: string, sink: string, status: 'sent' | 'failed', error?: string): Promise<void> {
    this.deliveries.unshift({
      id: randomUUID(),
      leadId,
      sink,
      status,
      error,
      createdAt: new Date().toISOString(),
    });
  }

  async initLeadDeliveries(leadId: string, sinks: string[]): Promise<void> {
    const now = new Date().toISOString();
    for (const sink of sinks) {
      const key = `${leadId}:${sink}`;
      if (!this.leadDeliveries.has(key)) {
        this.leadDeliveries.set(key, {
          leadId,
          sink,
          status: 'pending',
          attempts: 0,
          nextAttemptAt: now,
          createdAt: now,
          updatedAt: now,
        });
      }
    }
  }

  async updateLeadDelivery(
    leadId: string,
    sink: string,
    status: 'sent' | 'failed',
    error?: string,
    nextAttemptAt?: string
  ): Promise<void> {
    const key = `${leadId}:${sink}`;
    const current = this.leadDeliveries.get(key);
    const now = new Date().toISOString();
    if (current) {
      current.status = status;
      current.attempts += 1;
      current.lastError = error;
      current.nextAttemptAt = nextAttemptAt ?? now;
      current.updatedAt = now;
    } else {
      this.leadDeliveries.set(key, {
        leadId,
        sink,
        status,
        attempts: 1,
        nextAttemptAt: nextAttemptAt ?? now,
        lastError: error,
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  async getPendingDeliveries(limit = 50): Promise<LeadDeliveryRecord[]> {
    const now = new Date().toISOString();
    const pending = Array.from(this.leadDeliveries.values())
      .filter((d) => d.status !== 'sent' && d.attempts < 5 && d.nextAttemptAt <= now)
      .sort((a, b) => a.nextAttemptAt.localeCompare(b.nextAttemptAt));
    return pending.slice(0, limit);
  }

  async getLeadDeliveries(leadId: string): Promise<LeadDeliveryRecord[]> {
    return Array.from(this.leadDeliveries.values())
      .filter((d) => d.leadId === leadId)
      .sort((a, b) => a.sink.localeCompare(b.sink));
  }

  async createSession(sessionId: string, expiresAt: string, userId?: number): Promise<void> {
    this.sessions.set(sessionId, { id: sessionId, expiresAt, userId });
  }

  /** Admin sessions (token login) have no user; GitHub sessions carry one. */
  async validateSession(sessionId: string): Promise<boolean> {
    const s = this.sessions.get(sessionId);
    if (!s) return false;
    return s.userId === undefined && s.expiresAt > new Date().toISOString();
  }

  async deleteSession(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId);
  }

  async purgeExpiredSessions(): Promise<number> {
    const now = new Date().toISOString();
    let removed = 0;
    for (const [id, session] of this.sessions.entries()) {
      if (session.expiresAt <= now) {
        this.sessions.delete(id);
        removed++;
      }
    }
    return removed;
  }

  async upsertGitHubUser(input: UpsertGitHubUserInput): Promise<UserRecord> {
    const existingId = this.usersByGithubId.get(input.githubId);
    if (existingId !== undefined) {
      const existing = this.users.get(existingId)!;
      const updated: UserRecord = { ...existing, handle: input.handle };
      this.users.set(existingId, updated);
      return updated;
    }
    const user: UserRecord = {
      id: this.nextUserId++,
      githubId: input.githubId,
      handle: input.handle,
      role: 'participant',
      createdAt: new Date().toISOString(),
    };
    this.users.set(user.id, user);
    this.usersByGithubId.set(input.githubId, user.id);
    return user;
  }

  async getUserBySession(sessionId: string): Promise<UserRecord | null> {
    const session = this.sessions.get(sessionId);
    if (!session || session.userId === undefined) return null;
    if (session.expiresAt <= new Date().toISOString()) return null;
    return this.users.get(session.userId) ?? null;
  }

  async recordUserVote(
    leadId: string,
    userId: number,
    signal: LeadVoteSignal,
  ): Promise<UserVoteResult> {
    const lead = this.leads.get(leadId);
    if (!lead) {
      throw new Error(`Lead not found: ${leadId}`);
    }

    const voteKey = `${userId}:${leadId}:${signal}`;
    if (this.userVotes.has(voteKey)) {
      return {
        votes_up: lead.votes_up ?? 0,
        votes_down: lead.votes_down ?? 0,
        votes_scam: lead.votes_scam ?? 0,
        votes_closed: lead.votes_closed ?? 0,
        score: lead.score,
        status: lead.status,
        alreadyVoted: true,
      };
    }
    this.userVotes.add(voteKey);

    if (signal === 'useful') lead.votes_up = (lead.votes_up ?? 0) + 1;
    else if (signal === 'junk') lead.votes_down = (lead.votes_down ?? 0) + 1;
    else if (signal === 'scam') lead.votes_scam = (lead.votes_scam ?? 0) + 1;
    else lead.votes_closed = (lead.votes_closed ?? 0) + 1;

    const baseScore = (lead as any).baseScore ?? lead.score;
    const { score: newScore, status: newStatus } = recalculateVoteScoreAndStatus(
      lead.status,
      baseScore,
      {
        useful: lead.votes_up ?? 0,
        junk: lead.votes_down ?? 0,
        scam: lead.votes_scam ?? 0,
        closed: lead.votes_closed ?? 0,
      },
    );
    lead.score = newScore;
    lead.status = newStatus;

    return {
      votes_up: lead.votes_up ?? 0,
      votes_down: lead.votes_down ?? 0,
      votes_scam: lead.votes_scam ?? 0,
      votes_closed: lead.votes_closed ?? 0,
      score: newScore,
      status: newStatus,
      alreadyVoted: false,
    };
  }

  async deleteLead(id: string): Promise<boolean> {
    const lead = this.leads.get(id);
    if (lead) {
      this.leadsByFingerprint.delete(lead.fingerprint);
      if (lead.externalId) {
        this.leadsByExternal.delete(`${lead.sourceId}:${lead.externalId}`);
      }
    }
    return this.leads.delete(id);
  }

  async cleanupOldLeads(retentionDays: number): Promise<number> {
    const cutoff = new Date(Date.now() - retentionDays * 24 * 3600 * 1000).toISOString();
    let removed = 0;
    for (const [id, lead] of this.leads.entries()) {
      if (lead.createdAt < cutoff) {
        this.leadsByFingerprint.delete(lead.fingerprint);
        if (lead.externalId) {
          this.leadsByExternal.delete(`${lead.sourceId}:${lead.externalId}`);
        }
        this.leads.delete(id);
        removed++;
      }
    }
    return removed;
  }

  async cleanupOutboxEvents(_retentionDays: number): Promise<number> {
    // The memory store keeps no outbox_events copy; delivery state lives in leadDeliveries.
    return 0;
  }

  async cleanupRuns(retentionDays: number): Promise<number> {
    const cutoff = new Date(Date.now() - retentionDays * 24 * 3600 * 1000).toISOString();
    const before = this.runs.length;
    this.runs = this.runs.filter((run) => run.startedAt >= cutoff);
    return before - this.runs.length;
  }

  async upsertMeshNode(node: MeshNodeInput): Promise<MeshNodeRecord> {
    const existing = this.meshNodes.get(node.pubkey);
    const now = new Date().toISOString();
    if (existing) {
      const updated: MeshNodeRecord = {
        ...existing,
        github_username: node.github_username ?? existing.github_username,
        github_gist_url: node.github_gist_url ?? existing.github_gist_url,
        github_verified_at: node.github_verified_at ?? existing.github_verified_at,
        nip05_domain: node.nip05_domain ?? existing.nip05_domain,
        trust_score: node.trust_score ?? existing.trust_score,
        is_banned: node.is_banned !== undefined ? node.is_banned : existing.is_banned,
        false_reports_count: node.false_reports_count ?? existing.false_reports_count,
        valid_leads_7d: node.valid_leads_7d ?? existing.valid_leads_7d,
        last_seen_at: now,
      };
      this.meshNodes.set(node.pubkey, updated);
      return updated;
    }
    const created: MeshNodeRecord = {
      pubkey: node.pubkey,
      npub: node.npub,
      github_username: node.github_username,
      github_gist_url: node.github_gist_url,
      github_verified_at: node.github_verified_at,
      nip05_domain: node.nip05_domain,
      trust_score: node.trust_score ?? 0.05,
      valid_leads_7d: 0,
      valid_attestations_24h: 0,
      false_reports_count: node.false_reports_count ?? 0,
      is_banned: node.is_banned ?? false,
      created_at: now,
      last_seen_at: now,
    };
    this.meshNodes.set(node.pubkey, created);
    return created;
  }

  async getMeshNode(pubkey: string): Promise<MeshNodeRecord | null> {
    return this.meshNodes.get(pubkey) ?? null;
  }

  async recordAttestation(attestation: LeadAttestationInput): Promise<LeadAttestationRecord> {
    const record: LeadAttestationRecord = {
      ...attestation,
      created_at: new Date().toISOString(),
    };
    this.attestations.push(record);
    const lead = this.leads.get(attestation.lead_id);
    if (lead) {
      lead.attestation_count = (lead.attestation_count ?? 0) + 1;
      if (
        attestation.kind === 30405 &&
        attestation.signal_or_status === 'verified' &&
        (!lead.verification_state || lead.verification_state === 'unverified')
      ) {
        lead.verification_state = 'attested';
      }
    }
    return record;
  }

  async enqueueArbiterCheck(leadId: string, triggerReason: string): Promise<void> {
    const now = new Date().toISOString();
    this.arbiterQueue.set(leadId, {
      triggerReason,
      attempts: 0,
      nextRunAt: now,
      createdAt: now,
    });
    const lead = this.leads.get(leadId);
    if (lead && lead.verification_state !== 'killed_scam' && lead.verification_state !== 'killed_closed') {
      lead.verification_state = 'under_review';
    }
  }

  async getLeadsForFeed(viewerContext: ViewerAccessContext, options?: ListLeadsOptions): Promise<Lead[]> {
    const all = await this.listLeads(options);
    const now = new Date().toISOString();
    const isPrivileged =
      viewerContext.isAdmin ||
      viewerContext.isRealtime ||
      viewerContext.hasValidAttestations24h ||
      (viewerContext.trustScore ?? 0) >= 0.2;

    return all.filter((l) => {
      // Exclude killed leads from feed
      if (l.verification_state === 'killed_scam' || l.verification_state === 'killed_closed') {
        return false;
      }
      // Privileged nodes see everything in real time
      if (isPrivileged) {
        return true;
      }
      // Free-riders / guest viewers: cannot see mesh-exclusive or future-unlocked leads (12h lag)
      if (l.is_mesh_exclusive) {
        return false;
      }
      if (l.unlocked_at && l.unlocked_at > now) {
        return false;
      }
      return true;
    });
  }

  async close(): Promise<void> {
    this.sources.clear();
    this.leads.clear();
    this.leadsByFingerprint.clear();
    this.leadsByExternal.clear();
    this.runs = [];
    this.deliveries = [];
    this.leadDeliveries.clear();
    this.users.clear();
    this.usersByGithubId.clear();
    this.userVotes.clear();
    this.sessions.clear();
  }
}
