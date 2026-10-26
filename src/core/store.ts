import type {
  Contact,
  Lead,
  LeadState,
  LeadStatus,
  LeadType,
  LeadVoteSignal,
  RunRecord,
  SourceConfig,
  SourceHealth,
  SourceKind,
  SourceRecord,
  Stats,
} from './types.ts';

export interface CreateSourceInput {
  id?: string;
  kind: SourceKind;
  title: string;
  config?: SourceConfig;
  enabled?: boolean;
}

export interface UpdateSourceInput {
  title?: string;
  enabled?: boolean;
  config?: SourceConfig;
}

export interface ListLeadsOptions {
  limit?: number;
  status?: LeadStatus;
  sourceId?: string;
  query?: string;
  type?: LeadType;
}

export interface LeadDeliveryRecord {
  leadId: string;
  sink: string;
  status: 'pending' | 'sent' | 'failed';
  attempts: number;
  nextAttemptAt: string;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertGitHubUserInput {
  githubId: number;
  handle: string;
}

export interface UserRecord {
  id: number;
  githubId: number;
  handle: string;
  role: string;
  createdAt: string;
}

export interface UserVoteResult {
  votes_up: number;
  votes_down: number;
  votes_scam: number;
  votes_closed: number;
  score: number;
  status: LeadStatus;
  alreadyVoted: boolean;
  myVote?: LeadVoteSignal | null;
}

export interface FeedOptions extends ListLeadsOptions {
  /** Only leads first seen at or before this instant (tier delay). */
  createdBefore?: string;
}

export interface Store {
  init?(): Promise<void>;
  listSources(): Promise<SourceRecord[]>;
  getSource(id: string): Promise<SourceRecord | null>;
  createSource(input: CreateSourceInput): Promise<SourceRecord>;
  updateSource(id: string, patch: UpdateSourceInput): Promise<SourceRecord | null>;
  deleteSource(id: string): Promise<boolean>;

  findLeadByFingerprint(fingerprint: string): Promise<Lead | null>;
  getLead(id: string): Promise<Lead | null>;
  findRecentByTitleKey(titleKey: string, city: string | undefined, sinceIso: string): Promise<Lead | null>;
  insertLead(lead: Lead): Promise<boolean>;
  /** Recent leads (created at or after `sinceIso`) sharing at least one normalised contact, newest first. */
  findRecentByContacts?(contacts: Contact[], sinceIso: string, limit?: number): Promise<Lead[]>;
  updateLeadStatus(id: string, status: LeadStatus, deliveredAt?: string, scoreDelta?: number): Promise<void>;
  updateLeadState?(id: string, state: LeadState): Promise<void>;
  recordVote(
    leadId: string,
    signal: 'useful' | 'junk' | 'scam' | 'closed',
    weight?: number,
    subnet?: string,
  ): Promise<{
    votes_up: number;
    votes_down: number;
    votes_scam: number;
    votes_closed: number;
    score: number;
  }>;
  listLeads(options?: ListLeadsOptions): Promise<Lead[]>;
  getStats(): Promise<Stats>;
  getSourceHealth(): Promise<SourceHealth[]>;

  recordRun(run: RunRecord): Promise<void>;
  listRuns(limit?: number, sourceId?: string): Promise<RunRecord[]>;
  recordDelivery(leadId: string, sink: string, status: 'sent' | 'failed', error?: string): Promise<void>;

  initLeadDeliveries?(leadId: string, sinks: string[]): Promise<void>;
  updateLeadDelivery?(leadId: string, sink: string, status: 'sent' | 'failed', error?: string, nextAttemptAt?: string): Promise<void>;
  getPendingDeliveries?(limit?: number): Promise<LeadDeliveryRecord[]>;
  getLeadDeliveries?(leadId: string): Promise<LeadDeliveryRecord[]>;

  createSession?(sessionId: string, expiresAt: string, userId?: number): Promise<void>;
  /** True only for admin sessions (created by the token login, without a user). */
  validateSession?(sessionId: string): Promise<boolean>;
  deleteSession?(sessionId: string): Promise<void>;

  upsertGitHubUser?(input: UpsertGitHubUserInput): Promise<UserRecord>;
  getUserBySession?(sessionId: string): Promise<UserRecord | null>;
  /** Records or toggles a user vote. Clicking same signal cancels; clicking different switches vote. */
  recordUserVote?(leadId: string, userId: number, signal: LeadVoteSignal): Promise<UserVoteResult>;
  getUserVote?(leadId: string, userId: number): Promise<LeadVoteSignal | null>;
  purgeExpiredSessions?(): Promise<number>;

  /** Leads visible in the public feed: state `active`, optionally first seen before a cutoff. */
  getLeadsForFeed(options?: FeedOptions): Promise<Lead[]>;

  deleteLead?(id: string): Promise<boolean>;
  cleanupOldLeads?(retentionDays: number): Promise<number>;
  cleanupOutboxEvents?(retentionDays: number): Promise<number>;
  cleanupRuns?(retentionDays: number): Promise<number>;

  close(): Promise<void>;
}
