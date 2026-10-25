import type {
  Lead,
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
}

export interface MeshNodeRecord {
  pubkey: string;
  npub: string;
  github_username?: string;
  github_gist_url?: string;
  github_verified_at?: string;
  nip05_domain?: string;
  trust_score: number;
  valid_leads_7d: number;
  valid_attestations_24h: number;
  false_reports_count: number;
  is_banned?: boolean;
  created_at: string;
  last_seen_at: string;
}

export interface MeshNodeInput {
  pubkey: string;
  npub: string;
  github_username?: string;
  github_gist_url?: string;
  github_verified_at?: string;
  nip05_domain?: string;
  trust_score?: number;
  is_banned?: boolean;
  false_reports_count?: number;
  valid_leads_7d?: number;
}

export interface LeadAttestationRecord {
  id?: number;
  nostr_event_id: string;
  lead_id: string;
  signer_pubkey: string;
  kind: 30404 | 30405;
  signal_or_status: string;
  recomputed_hash?: string;
  confidence?: number;
  raw_event: Record<string, unknown>;
  created_at?: string;
}

export interface LeadAttestationInput {
  nostr_event_id: string;
  lead_id: string;
  signer_pubkey: string;
  kind: 30404 | 30405;
  signal_or_status: string;
  recomputed_hash?: string;
  confidence?: number;
  raw_event: Record<string, unknown>;
}

export interface ViewerAccessContext {
  pubkey?: string;
  trustScore?: number;
  hasValidAttestations24h?: boolean;
  isAdmin?: boolean;
  /** Active-contributor tier (access-tier engine): real-time, no 12h lag. */
  isRealtime?: boolean;
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
  updateLeadStatus(id: string, status: LeadStatus, deliveredAt?: string, scoreDelta?: number): Promise<void>;
  updateLeadVerification?(id: string, verificationState: import('./types.ts').VerificationState): Promise<void>;
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
  /** One vote per user per signal; repeated votes of the same signal are ignored. */
  recordUserVote?(leadId: string, userId: number, signal: LeadVoteSignal): Promise<UserVoteResult>;
  purgeExpiredSessions?(): Promise<number>;

  // Mesh Network and AI Arbiter methods (radar/1)
  upsertMeshNode(node: MeshNodeInput): Promise<MeshNodeRecord>;
  getMeshNode?(pubkey: string): Promise<MeshNodeRecord | null>;
  recordAttestation(attestation: LeadAttestationInput): Promise<LeadAttestationRecord>;
  enqueueArbiterCheck(leadId: string, triggerReason: string): Promise<void>;
  getLeadsForFeed(viewerContext: ViewerAccessContext, options?: ListLeadsOptions): Promise<Lead[]>;

  deleteLead?(id: string): Promise<boolean>;
  cleanupOldLeads?(retentionDays: number): Promise<number>;
  cleanupOutboxEvents?(retentionDays: number): Promise<number>;
  cleanupRuns?(retentionDays: number): Promise<number>;

  close(): Promise<void>;
}
