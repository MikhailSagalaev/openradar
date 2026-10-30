import type { PageFacts } from '../research/facts.ts';
import type {
  Contact,
  SourceVisibility,
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

/** Feed order: newest first, by score, or by budget (USD-normalised). */
export type LeadSort = 'new' | 'score' | 'budget';

/**
 * «Сначала лучшие»: a lead's score loses this many points per hour of age, so a strong lead
 * from today beats an equally strong one from last week and a weak fresh one alike.
 */
export const SCORE_DECAY_PER_HOUR = 1 / 6;

export interface ListLeadsOptions {
  limit?: number;
  status?: LeadStatus;
  sourceId?: string;
  query?: string;
  type?: LeadType;
  /** Only leads with a known budget of at least this many USD. */
  minBudgetUsd?: number;
  /** Only leads that can be done remotely. */
  remote?: boolean;
  /** Only leads tagged with this skill (case-insensitive). */
  skill?: string;
  /** Only leads tagged with at least one of these skills (case-insensitive): the «IT» chip. */
  skillsAny?: string[];
  /** Only leads first seen at or after this instant. */
  createdAfter?: string;
  sort?: LeadSort;
  /** Only leads whose title is in Russian (Cyrillic) or in English (no Cyrillic). */
  language?: 'ru' | 'en';
  /** Leads to skip, for paging the HTML feed (the v2 API pages with a cursor). */
  offset?: number;
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
  /** GitHub account creation time (from the GitHub API); sets the base signal weight. */
  githubCreatedAt?: string;
}

/** Operator dashboard numbers (/admin). Days are UTC dates, oldest first, without gaps. */
export interface AdminStats {
  days: Array<{ day: string; gigs: number; jobs: number; rejected: number }>;
  sources: Array<{ sourceId: string; title: string; enabled: boolean; inserted7d: number; rejected7d: number }>;
  users: number;
  usersNew7d: number;
  votes: number;
  votes7d: number;
  participants: number;
  observations7d: number;
}

/** The last `count` UTC dates ending today, oldest first. */
export function lastDays(count: number, now: Date = new Date()): string[] {
  const out: string[] = [];
  for (let i = count - 1; i >= 0; i -= 1) out.push(new Date(now.getTime() - i * 86_400_000).toISOString().slice(0, 10));
  return out;
}

export interface UserRecord {
  id: number;
  githubId: number;
  handle: string;
  role: string;
  createdAt: string;
  githubCreatedAt?: string;
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
  /** Leads older than this many days drop out of the feed: orders and vacancies expire. */
  maxAgeDays?: { gig: number; job: number };
  /** Cursor: only leads after this (created_at, id) pair, oldest first. */
  after?: { createdAt: string; id: string };
}

export interface ParticipantRecord {
  pubkey: string;
  githubUserId?: number;
  profile: Record<string, unknown>;
  bannedAt?: string;
  bannedReason?: string;
  createdAt: string;
  lastSeenAt: string;
  /** Cached 30-day rating R, refreshed by the rating job. */
  rating: number;
}

export interface LedgerEntry {
  pubkey: string;
  leadId: string;
  kind: 'first' | 'confirm' | 'signal_match' | 'hidden_first' | 'hidden_confirm';
  points: number;
  /** Lead creation time: the entry counts for 30 days from it. */
  createdAt: string;
}

export interface LeadDecision {
  leadId: string;
  state: 'active' | 'hidden_junk' | 'hidden_scam' | 'closed';
  /** `source`: the board itself shows the post as closed or removed (liveness check). */
  decidedBy: 'moderator' | 'author' | 'source';
  pubkey?: string;
  reason: string;
  decidedAt: string;
}

export interface ContactFlag {
  type: string;
  value: string;
  flag: 'scam';
  pubkey?: string;
  reason: string;
  createdAt: string;
}

export interface StoredEvent {
  id: string;
  pubkey: string;
  kind: number;
  createdAt: number;
  tags: string[][];
  content: string;
  sig: string;
}

export interface ObservationRecord {
  eventId: string;
  leadId: string;
  pubkey: string;
  platform: string;
  channel: string;
  channelTitle?: string;
  visibility: SourceVisibility;
  messageId?: string;
  isFirst: boolean;
  archived: boolean;
  receivedAt: string;
}

export interface SignalRecord {
  leadId: string;
  pubkey: string;
  signal: 'useful' | 'junk' | 'scam' | 'closed';
  comment: string;
  eventId?: string;
  createdAt: string;
}

/** radar/2 hub tables (migration 012). */
export interface HubStore {
  /** Creates the participant on first sight and bumps last_seen_at. */
  touchParticipant(pubkey: string): Promise<ParticipantRecord>;
  getParticipant(pubkey: string): Promise<ParticipantRecord | null>;
  setParticipantProfile(pubkey: string, profile: Record<string, unknown>): Promise<void>;
  /** false when the event id is already stored. */
  insertEvent(event: StoredEvent): Promise<boolean>;
  addObservation(record: ObservationRecord): Promise<void>;
  listObservations(leadId: string): Promise<ObservationRecord[]>;
  /** Latest observations of one participant, newest first. */
  listObservationsByPubkey(pubkey: string, limit: number): Promise<ObservationRecord[]>;
  /** Observations of one post (platform + channel + message id). */
  findObservationsByPost(platform: string, channel: string, messageId: string): Promise<ObservationRecord[]>;
  /** One signal per participant and lead; a new one replaces the old. */
  upsertSignal(record: SignalRecord): Promise<void>;
  listSignals(leadId: string): Promise<SignalRecord[]>;
  deleteSignal(leadId: string, pubkey: string): Promise<void>;
  /** Replay cache for HTTP auth: false when `id` was already used and has not expired. */
  rememberAuth(id: string, expiresAt: string): Promise<boolean>;

  // --- rating and moderation (migration 013) ---
  getUserById(id: number): Promise<UserRecord | null>;
  linkParticipantGithub(pubkey: string, userId: number): Promise<void>;
  getParticipantByGithubUser(userId: number): Promise<ParticipantRecord | null>;
  /** `reason` null lifts the ban. */
  banParticipant(pubkey: string, reason: string | null): Promise<void>;
  /** Sets the cached rating of the listed participants and 0 for everyone else. */
  setParticipantRatings(ratings: Map<string, number>): Promise<void>;
  /** Hub observations received since `sinceIso`, oldest first. */
  listObservationsSince(sinceIso: string): Promise<ObservationRecord[]>;
  /** Replaces all ledger entries of these leads. */
  replaceLedger(leadIds: string[], entries: LedgerEntry[]): Promise<void>;
  /** Sum of points per participant for entries created since `sinceIso`. */
  sumLedger(sinceIso: string): Promise<Map<string, number>>;
  listLedger(pubkey: string, sinceIso: string, limit: number): Promise<LedgerEntry[]>;
  getLeadDecision(leadId: string): Promise<LeadDecision | null>;
  /** null removes the decision. */
  setLeadDecision(leadId: string, decision: Omit<LeadDecision, 'leadId' | 'decidedAt'> | null): Promise<void>;
  setContactFlag(contact: Contact, flag: Omit<ContactFlag, 'type' | 'value' | 'createdAt'> | null): Promise<void>;
  /** Flags of the given contacts that exist. */
  getContactFlags(contacts: Contact[]): Promise<ContactFlag[]>;
}

/** Pay and employer taken from the page when the post itself had none. */
/** Posts of one day by type, platform, role and market scope (the index's raw material). */
export interface ResearchDailyRow {
  day: string;
  type: string;
  platform: string;
  role: string;
  scope: string;
  n: number;
}

export interface LeadFactsFill {
  budget?: number;
  currency?: string;
  paymentPeriod?: 'monthly' | 'hourly' | 'fixed';
  rawSalary?: string;
  normalizedUsdMin?: number;
  normalizedUsdMax?: number;
  author?: string;
}

export interface Store extends HubStore {
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
  /** Adds contacts seen in a later observation of the same lead (at most 20 in total). */
  mergeLeadContacts(leadId: string, contacts: Contact[]): Promise<void>;
  /** Lead with this canonical URL (rule 2 of the merge rules). */
  findLeadByCanonicalUrl(canonicalUrl: string): Promise<Lead | null>;
  /** Id, creation time and MinHash sketch of leads created since `sinceIso`, oldest first. */
  listRecentSketches(sinceIso: string, limit: number): Promise<Array<{ id: string; createdAt: string; minhash: string }>>;
  updateLeadStatus(id: string, status: LeadStatus, deliveredAt?: string, scoreDelta?: number): Promise<void>;
  /** Sets a recomputed base score; the stored score is the base plus the community vote adjustment. */
  updateLeadScore?(id: string, baseScore: number): Promise<number | undefined>;
  /** Stores the quality stage's verdict: the corrected type and the flags (metadata.qualityFlags). */
  updateLeadQuality?(id: string, type: LeadType, flags: string[]): Promise<void>;
  updateLeadState?(id: string, state: LeadState): Promise<void>;
  /** Active leads on these hosts whose page is due for a closed-post check, oldest check first. */
  listLeadsToCheck?(options: { hosts: string[]; limit: number; createdAfter: string; now?: Date }): Promise<Array<Pick<Lead, 'id' | 'url' | 'createdAt' | 'type'>>>;
  /** Remembers that the lead's page was checked just now. */
  markLeadChecked?(id: string, at?: Date): Promise<void>;
  /**
   * Stores facts read from the lead's source page (metadata.facts) and fills pay and the
   * employer when the lead has none yet.
   */
  saveLeadFacts?(id: string, facts: PageFacts, fill: LeadFactsFill): Promise<void>;
  /** Leads published in [from, to) for the market report: text cut to its head, junk and scam left out. */
  listLeadsForResearch?(options: { from: string; to: string; limit: number }): Promise<Lead[]>;
  /** Replaces the daily counts of one day (YYYY-MM-DD). */
  saveResearchDaily?(day: string, rows: ResearchDailyRow[]): Promise<void>;
  listResearchDaily?(from: string, to: string): Promise<ResearchDailyRow[]>;
  /** The last day with saved counts, if any. */
  lastResearchDay?(): Promise<string | undefined>;
  /** Newest posts with no model answer of this version yet, those without pay first (or with pay first, to calibrate). */
  listLeadsForModel?(options: { limit: number; since: string; version: number; withPayFirst?: boolean }): Promise<Array<Pick<Lead, 'id' | 'title' | 'text' | 'type'>>>;
  /** Stores the model's answer as metadata.model. */
  saveLeadModelFacts?(id: string, stored: unknown): Promise<void>;
  getResearchSnapshot?(period: string): Promise<{ report: unknown; createdAt: string } | null>;
  saveResearchSnapshot?(period: string, report: unknown): Promise<void>;
  listResearchSnapshots?(): Promise<Array<{ period: string; createdAt: string }>>;
  /** Hub: marks a lead confirmed once; later calls keep the first time. */
  markLeadConfirmed?(id: string, at: string): Promise<void>;
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
  /**
   * Median monthly vacancy pay in USD by role over every vacancy since `createdAfter`
   * (see salary-sanity.ts): `*` for all vacancies, roles with fewer than `minSample` left out.
   */
  salaryMedians?(createdAfter: string, floorUsd: number, minSample: number): Promise<Map<string, number>>;
  getAdminStats?(days?: number): Promise<AdminStats>;
  /** Browser extension tokens, stored as SHA-256 hashes. */
  saveExtensionToken?(tokenHash: string, userId: number): Promise<void>;
  getUserByExtensionToken?(tokenHash: string): Promise<UserRecord | null>;
  deleteExtensionToken?(tokenHash: string): Promise<void>;

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
  cleanupRuns?(retentionDays: number): Promise<number>;

  close(): Promise<void>;
}
