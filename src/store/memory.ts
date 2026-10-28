import { randomUUID } from 'node:crypto';
import { recalculateVoteScoreAndStatus } from '../core/rules.ts';
import { isRemoteLead, normalizeTechTokens } from '../core/text.ts';
import { contactKey, mergeContacts } from '../core/contacts.ts';
import type {
  ContactFlag,
  LeadDecision,
  LedgerEntry,
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
  AdminStats,
} from '../core/store.ts';
import type { LeadFactsFill } from '../core/store.ts';
import type { PageFacts } from '../research/facts.ts';
import { lastDays } from '../core/store.ts';
import type {
  Contact,
  Lead,
  LeadState,
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
  private userVotes = new Map<string, LeadVoteSignal>();
  private sessions = new Map<string, { id: string; expiresAt: string; userId?: number }>();

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

  async mergeLeadContacts(leadId: string, contacts: Contact[]): Promise<void> {
    const lead = this.leads.get(leadId);
    if (lead && contacts.length) lead.contacts = mergeContacts(lead.contacts ?? [], contacts);
  }

  async findLeadByCanonicalUrl(canonicalUrl: string): Promise<Lead | null> {
    for (const lead of this.leads.values()) if (lead.canonicalUrl === canonicalUrl) return { ...lead };
    return null;
  }

  async listRecentSketches(sinceIso: string, limit: number): Promise<Array<{ id: string; createdAt: string; minhash: string }>> {
    return [...this.leads.values()]
      .filter((l) => l.minhash_sketch && l.createdAt >= sinceIso)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .slice(-limit)
      .map((l) => ({ id: l.id, createdAt: l.createdAt, minhash: l.minhash_sketch! }));
  }

  async findRecentByContacts(contacts: Contact[], sinceIso: string, limit = 20): Promise<Lead[]> {
    if (!contacts.length) return [];
    const wanted = new Set(contacts.map(contactKey));
    const since = Date.parse(sinceIso);
    return [...this.leads.values()]
      .filter((l) => Date.parse(l.createdAt) >= since && (l.contacts ?? []).some((c) => wanted.has(contactKey(c))))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
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
      state: lead.state ?? 'active',
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

  async updateLeadScore(id: string, baseScore: number): Promise<number | undefined> {
    const lead = this.leads.get(id);
    if (!lead) return undefined;
    const { score } = recalculateVoteScoreAndStatus(lead.status, baseScore, {
      useful: lead.votes_up ?? 0,
      junk: lead.votes_down ?? 0,
      scam: lead.votes_scam ?? 0,
      closed: lead.votes_closed ?? 0,
    });
    (lead as any).baseScore = baseScore;
    lead.score = score;
    return score;
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

  async markLeadConfirmed(id: string, at: string): Promise<void> {
    const lead = this.leads.get(id);
    if (lead && !lead.confirmedAt) lead.confirmedAt = at;
  }

  private checkedAt = new Map<string, number>();

  async listLeadsToCheck(options: { hosts: string[]; limit: number; createdAfter: string; now?: Date }): Promise<Array<Pick<Lead, 'id' | 'url' | 'createdAt' | 'type'>>> {
    const now = (options.now ?? new Date()).getTime();
    const hosts = new Set(options.hosts);
    const hour = 3600_000;
    return Array.from(this.leads.values())
      .filter((l) => {
        if ((l.state ?? 'active') !== 'active' || !l.url || l.createdAt < options.createdAfter) return false;
        let host: string;
        try {
          host = new URL(l.url).hostname.toLowerCase();
        } catch {
          return false;
        }
        if (!hosts.has(host)) return false;
        const checked = this.checkedAt.get(l.id);
        if (checked === undefined) return true;
        const age = now - Date.parse(l.createdAt);
        const every = age < 48 * hour ? 6 * hour : age < 7 * 24 * hour ? 24 * hour : 72 * hour;
        return now - checked >= every;
      })
      .sort((a, b) => (this.checkedAt.get(a.id) ?? -1) - (this.checkedAt.get(b.id) ?? -1) || b.createdAt.localeCompare(a.createdAt))
      .slice(0, options.limit)
      .map((l) => ({ id: l.id, url: l.url, createdAt: l.createdAt, type: l.type }));
  }

  async markLeadChecked(id: string, at: Date = new Date()): Promise<void> {
    this.checkedAt.set(id, at.getTime());
  }

  async updateLeadState(id: string, state: LeadState): Promise<void> {
    const lead = this.leads.get(id);
    if (lead) {
      lead.state = state;
    }
  }

  async saveLeadFacts(id: string, facts: PageFacts, fill: LeadFactsFill): Promise<void> {
    const lead = this.leads.get(id);
    if (!lead) return;
    lead.metadata = { ...(lead.metadata ?? {}), facts };
    if (!lead.author && fill.author) lead.author = fill.author;
    const hasPay = fill.normalizedUsdMin !== undefined || fill.normalizedUsdMax !== undefined;
    if (hasPay && lead.normalizedUsdMin === undefined && lead.normalizedUsdMax === undefined) {
      Object.assign(lead, {
        budget: fill.budget,
        currency: fill.currency ?? 'RUB',
        paymentPeriod: fill.paymentPeriod ?? 'monthly',
        rawSalary: fill.rawSalary,
        normalizedUsdMin: fill.normalizedUsdMin,
        normalizedUsdMax: fill.normalizedUsdMax,
      });
    }
  }

  async listLeadsForResearch(options: { from: string; to: string; limit: number }): Promise<Lead[]> {
    return Array.from(this.leads.values())
      .filter((l) => {
        const at = l.publishedAt ?? l.createdAt;
        return at >= options.from && at < options.to
          && l.state !== 'hidden_junk' && l.state !== 'hidden_scam'
          && l.status !== 'rejected' && l.status !== 'failed';
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, options.limit)
      .map((l) => ({ ...l, text: l.text.slice(0, 3000) }));
  }

  async listLeadsForModel(options: { limit: number; since: string; version: number }): Promise<Array<Pick<Lead, 'id' | 'title' | 'text' | 'type'>>> {
    const version = (l: Lead): number => Number((l.metadata?.model as { v?: number } | undefined)?.v ?? 0);
    const noPay = (l: Lead): number => (l.normalizedUsdMin === undefined && l.normalizedUsdMax === undefined ? 1 : 0);
    return Array.from(this.leads.values())
      .filter((l) => l.createdAt >= options.since && l.state !== 'hidden_junk' && l.state !== 'hidden_scam'
        && l.status !== 'rejected' && l.status !== 'failed' && version(l) < options.version)
      .sort((a, b) => noPay(b) - noPay(a) || b.createdAt.localeCompare(a.createdAt))
      .slice(0, options.limit)
      .map((l) => ({ id: l.id, title: l.title, text: l.text.slice(0, 2500), type: l.type }));
  }

  async saveLeadModelFacts(id: string, stored: unknown): Promise<void> {
    const lead = this.leads.get(id);
    if (lead) lead.metadata = { ...(lead.metadata ?? {}), model: stored };
  }

  private researchSnapshots = new Map<string, { report: unknown; createdAt: string }>();

  async getResearchSnapshot(period: string): Promise<{ report: unknown; createdAt: string } | null> {
    return this.researchSnapshots.get(period) ?? null;
  }

  async saveResearchSnapshot(period: string, report: unknown): Promise<void> {
    this.researchSnapshots.set(period, { report, createdAt: new Date().toISOString() });
  }

  async listResearchSnapshots(): Promise<Array<{ period: string; createdAt: string }>> {
    return Array.from(this.researchSnapshots, ([period, v]) => ({ period, createdAt: v.createdAt })).sort((a, b) => b.period.localeCompare(a.period));
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
    return this.queryLeads(options);
  }

  private queryLeads(options: FeedOptions, feedOnly = false): Lead[] {
    let result = Array.from(this.leads.values());
    if (feedOnly) {
      // Leads rejected by the pipeline rules stay with the operator, not in the public feed.
      result = result.filter((l) => (l.state ?? 'active') === 'active' && l.status !== 'rejected');
      if (options.createdBefore) {
        const cutoff = options.createdBefore;
        result = result.filter((l) => l.createdAt <= cutoff);
      }
      if (options.maxAgeDays) {
        const { gig, job } = options.maxAgeDays;
        const now = Date.now();
        result = result.filter((l) => now - Date.parse(l.createdAt) <= (l.type === 'job' ? job : gig) * 86_400_000);
      }
      if (options.after) {
        const { createdAt, id } = options.after;
        result = result.filter((l) => l.createdAt > createdAt || (l.createdAt === createdAt && l.id > id));
      }
    }
    if (options.status) {
      result = result.filter((l) => l.status === options.status);
    }
    if (options.sourceId) {
      result = result.filter((l) => l.sourceId === options.sourceId);
    }
    if (options.type) {
      result = result.filter((l) => (l.type ?? 'gig') === options.type);
    }
    if (typeof options.minBudgetUsd === 'number' && options.minBudgetUsd > 0) {
      const min = options.minBudgetUsd;
      result = result.filter((l) => (l.normalizedUsdMax ?? l.normalizedUsdMin ?? 0) >= min);
    }
    if (options.remote) {
      result = result.filter((l) => isRemoteLead(l));
    }
    if (options.skill?.trim()) {
      const skill = options.skill.trim().toLowerCase();
      result = result.filter((l) => (l.skills ?? []).some((s) => s.toLowerCase() === skill));
    }
    if (options.language) {
      const russian = options.language === 'ru';
      result = result.filter((l) => /[А-Яа-яЁё]/.test(l.title) === russian);
    }
    if (options.createdAfter) {
      const since = options.createdAfter;
      result = result.filter((l) => l.createdAt >= since);
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

    const ascending = feedOnly && Boolean(options.after);
    const usd = (l: Lead): number => l.normalizedUsdMax ?? l.normalizedUsdMin ?? -1;
    result.sort((a, b) => {
      const order = a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
      if (ascending) return order;
      if (options.sort === 'score' && a.score !== b.score) return b.score - a.score;
      if (options.sort === 'budget' && usd(a) !== usd(b)) return usd(b) - usd(a);
      return -order;
    });
    const limit = Math.max(1, Math.min(options.limit ?? 50, 5000));
    const offset = Math.max(0, Math.min(Math.floor(options.offset ?? 0), 10_000));
    return result.slice(offset, offset + limit).map((l) => ({
      ...l,
      votes_up: l.votes_up ?? 0,
      votes_down: l.votes_down ?? 0,
      votes_scam: l.votes_scam ?? 0,
      votes_closed: l.votes_closed ?? 0,
    }));
  }

  async getAdminStats(days = 14): Promise<AdminStats> {
    const week = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const leads = Array.from(this.leads.values());
    const sources = Array.from(this.sources.values());
    return {
      days: lastDays(days).map((day) => {
        const today = leads.filter((l) => l.createdAt.slice(0, 10) === day);
        return {
          day,
          gigs: today.filter((l) => (l.type ?? 'gig') === 'gig' && l.status !== 'rejected').length,
          jobs: today.filter((l) => l.type === 'job' && l.status !== 'rejected').length,
          rejected: today.filter((l) => l.status === 'rejected').length,
        };
      }),
      sources: sources
        .map((s) => {
          const recent = leads.filter((l) => l.sourceId === s.id && l.createdAt > week);
          return {
            sourceId: s.id,
            title: s.title,
            enabled: s.enabled,
            inserted7d: recent.filter((l) => l.status !== 'rejected').length,
            rejected7d: recent.filter((l) => l.status === 'rejected').length,
          };
        })
        .sort((a, b) => b.inserted7d - a.inserted7d || a.title.localeCompare(b.title)),
      users: this.users.size,
      usersNew7d: Array.from(this.users.values()).filter((u) => u.createdAt > week).length,
      votes: this.userVotes.size,
      votes7d: this.userVotes.size,
      participants: this.participants.size,
      observations7d: this.observations.filter((o) => o.receivedAt > week).length,
    };
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
      const updated: UserRecord = { ...existing, handle: input.handle, githubCreatedAt: input.githubCreatedAt ?? existing.githubCreatedAt };
      this.users.set(existingId, updated);
      return updated;
    }
    const user: UserRecord = {
      id: this.nextUserId++,
      githubId: input.githubId,
      handle: input.handle,
      role: 'participant',
      createdAt: new Date().toISOString(),
      githubCreatedAt: input.githubCreatedAt,
    };
    this.users.set(user.id, user);
    this.usersByGithubId.set(input.githubId, user.id);
    return user;
  }

  private extensionTokens = new Map<string, number>();

  async saveExtensionToken(tokenHash: string, userId: number): Promise<void> {
    this.extensionTokens.set(tokenHash, userId);
  }

  async getUserByExtensionToken(tokenHash: string): Promise<UserRecord | null> {
    const userId = this.extensionTokens.get(tokenHash);
    return userId === undefined ? null : this.users.get(userId) ?? null;
  }

  async deleteExtensionToken(tokenHash: string): Promise<void> {
    this.extensionTokens.delete(tokenHash);
  }

  async getUserBySession(sessionId: string): Promise<UserRecord | null> {
    const session = this.sessions.get(sessionId);
    if (!session || session.userId === undefined) return null;
    if (session.expiresAt <= new Date().toISOString()) return null;
    return this.users.get(session.userId) ?? null;
  }

  async getUserVote(leadId: string, userId: number): Promise<LeadVoteSignal | null> {
    return this.userVotes.get(`${userId}:${leadId}`) ?? null;
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

    const voteKey = `${userId}:${leadId}`;
    const previousVote = this.userVotes.get(voteKey);

    const decrementSignal = (sig: LeadVoteSignal) => {
      if (sig === 'useful') lead.votes_up = Math.max(0, (lead.votes_up ?? 0) - 1);
      else if (sig === 'junk') lead.votes_down = Math.max(0, (lead.votes_down ?? 0) - 1);
      else if (sig === 'scam') lead.votes_scam = Math.max(0, (lead.votes_scam ?? 0) - 1);
      else if (sig === 'closed') lead.votes_closed = Math.max(0, (lead.votes_closed ?? 0) - 1);
    };

    const incrementSignal = (sig: LeadVoteSignal) => {
      if (sig === 'useful') lead.votes_up = (lead.votes_up ?? 0) + 1;
      else if (sig === 'junk') lead.votes_down = (lead.votes_down ?? 0) + 1;
      else if (sig === 'scam') lead.votes_scam = (lead.votes_scam ?? 0) + 1;
      else if (sig === 'closed') lead.votes_closed = (lead.votes_closed ?? 0) + 1;
    };

    let activeVote: LeadVoteSignal | null = signal;

    if (previousVote === signal) {
      // Toggle off / cancel vote
      decrementSignal(signal);
      this.userVotes.delete(voteKey);
      activeVote = null;
    } else {
      if (previousVote) {
        decrementSignal(previousVote);
      }
      incrementSignal(signal);
      this.userVotes.set(voteKey, signal);
    }

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
      myVote: activeVote,
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

  async cleanupRuns(retentionDays: number): Promise<number> {
    const cutoff = new Date(Date.now() - retentionDays * 24 * 3600 * 1000).toISOString();
    const before = this.runs.length;
    this.runs = this.runs.filter((run) => run.startedAt >= cutoff);
    return before - this.runs.length;
  }

  async getLeadsForFeed(options: FeedOptions = {}): Promise<Lead[]> {
    return this.queryLeads(options, true);
  }

  // --- radar/2 hub ---
  private participants = new Map<string, ParticipantRecord>();
  private events = new Map<string, StoredEvent>();
  private observations: ObservationRecord[] = [];
  private signals = new Map<string, SignalRecord>();
  private authReplay = new Map<string, string>();

  async touchParticipant(pubkey: string): Promise<ParticipantRecord> {
    const now = new Date().toISOString();
    const existing = this.participants.get(pubkey);
    if (existing) {
      existing.lastSeenAt = now;
      return { ...existing };
    }
    const created: ParticipantRecord = { pubkey, profile: {}, createdAt: now, lastSeenAt: now, rating: 0 };
    this.participants.set(pubkey, created);
    return { ...created };
  }

  async getParticipant(pubkey: string): Promise<ParticipantRecord | null> {
    const p = this.participants.get(pubkey);
    return p ? { ...p } : null;
  }

  async setParticipantProfile(pubkey: string, profile: Record<string, unknown>): Promise<void> {
    await this.touchParticipant(pubkey);
    this.participants.get(pubkey)!.profile = profile;
  }

  async insertEvent(event: StoredEvent): Promise<boolean> {
    if (this.events.has(event.id)) return false;
    this.events.set(event.id, { ...event });
    return true;
  }

  async addObservation(record: ObservationRecord): Promise<void> {
    if (this.observations.some((o) => o.eventId === record.eventId)) return;
    this.observations.push({ ...record });
  }

  async listObservations(leadId: string): Promise<ObservationRecord[]> {
    return this.observations
      .filter((o) => o.leadId === leadId && this.leads.has(o.leadId))
      .sort((a, b) => a.receivedAt.localeCompare(b.receivedAt))
      .map((o) => ({ ...o }));
  }

  async findObservationsByPost(platform: string, channel: string, messageId: string): Promise<ObservationRecord[]> {
    return this.observations
      .filter((o) => o.platform === platform && o.channel === channel && o.messageId === messageId && this.leads.has(o.leadId))
      .map((o) => ({ ...o }));
  }

  async upsertSignal(record: SignalRecord): Promise<void> {
    this.signals.set(`${record.leadId}\u0000${record.pubkey}`, { ...record });
  }

  async deleteSignal(leadId: string, pubkey: string): Promise<void> {
    this.signals.delete(`${leadId}\u0000${pubkey}`);
  }

  async listSignals(leadId: string): Promise<SignalRecord[]> {
    return [...this.signals.values()].filter((s) => s.leadId === leadId && this.leads.has(s.leadId)).map((s) => ({ ...s }));
  }

  async rememberAuth(id: string, expiresAt: string): Promise<boolean> {
    const now = new Date().toISOString();
    for (const [key, exp] of this.authReplay) if (exp < now) this.authReplay.delete(key);
    if (this.authReplay.has(id)) return false;
    this.authReplay.set(id, expiresAt);
    return true;
  }

  // --- rating and moderation ---
  private ledger: LedgerEntry[] = [];
  private decisions = new Map<string, LeadDecision>();
  private contactFlags = new Map<string, ContactFlag>();

  async getUserById(id: number): Promise<UserRecord | null> {
    const user = this.users.get(id);
    return user ? { ...user } : null;
  }

  async linkParticipantGithub(pubkey: string, userId: number): Promise<void> {
    await this.touchParticipant(pubkey);
    for (const p of this.participants.values()) if (p.githubUserId === userId) p.githubUserId = undefined;
    this.participants.get(pubkey)!.githubUserId = userId;
  }

  async getParticipantByGithubUser(userId: number): Promise<ParticipantRecord | null> {
    for (const p of this.participants.values()) if (p.githubUserId === userId) return { ...p };
    return null;
  }

  async banParticipant(pubkey: string, reason: string | null): Promise<void> {
    await this.touchParticipant(pubkey);
    const p = this.participants.get(pubkey)!;
    p.bannedAt = reason === null ? undefined : new Date().toISOString();
    p.bannedReason = reason ?? undefined;
  }

  async setParticipantRatings(ratings: Map<string, number>): Promise<void> {
    for (const p of this.participants.values()) p.rating = ratings.get(p.pubkey) ?? 0;
  }

  async listObservationsSince(sinceIso: string): Promise<ObservationRecord[]> {
    return this.observations
      .filter((o) => o.receivedAt >= sinceIso && this.leads.has(o.leadId))
      .sort((a, b) => a.receivedAt.localeCompare(b.receivedAt))
      .map((o) => ({ ...o }));
  }

  async replaceLedger(leadIds: string[], entries: LedgerEntry[]): Promise<void> {
    const ids = new Set(leadIds);
    this.ledger = [...this.ledger.filter((e) => !ids.has(e.leadId)), ...entries.map((e) => ({ ...e }))];
  }

  async sumLedger(sinceIso: string): Promise<Map<string, number>> {
    const sums = new Map<string, number>();
    for (const e of this.ledger) {
      if (e.createdAt < sinceIso || !this.leads.has(e.leadId)) continue;
      sums.set(e.pubkey, (sums.get(e.pubkey) ?? 0) + e.points);
    }
    return sums;
  }

  async listLedger(pubkey: string, sinceIso: string, limit: number): Promise<LedgerEntry[]> {
    return this.ledger
      .filter((e) => e.pubkey === pubkey && e.createdAt >= sinceIso && this.leads.has(e.leadId))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit)
      .map((e) => ({ ...e }));
  }

  async getLeadDecision(leadId: string): Promise<LeadDecision | null> {
    const d = this.decisions.get(leadId);
    return d && this.leads.has(leadId) ? { ...d } : null;
  }

  async setLeadDecision(leadId: string, decision: Omit<LeadDecision, 'leadId' | 'decidedAt'> | null): Promise<void> {
    if (decision === null) this.decisions.delete(leadId);
    else this.decisions.set(leadId, { ...decision, leadId, decidedAt: new Date().toISOString() });
  }

  async setContactFlag(contact: Contact, flag: Omit<ContactFlag, 'type' | 'value' | 'createdAt'> | null): Promise<void> {
    const key = contactKey(contact);
    if (flag === null) this.contactFlags.delete(key);
    else this.contactFlags.set(key, { ...flag, type: contact.type, value: contact.value, createdAt: new Date().toISOString() });
  }

  async getContactFlags(contacts: Contact[]): Promise<ContactFlag[]> {
    return contacts.map((c) => this.contactFlags.get(contactKey(c))).filter((f): f is ContactFlag => Boolean(f)).map((f) => ({ ...f }));
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
