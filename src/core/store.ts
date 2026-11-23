import type { LeadReview, ReviewBucket } from './reviews.ts';
import type { LabelledDecision, ModelDecision } from './decisions.ts';
import type { SourceQualityInput } from './source-quality.ts';
import type { SourceFlowStats } from './source-health.ts';
import type { PageFacts } from '../research/facts.ts';
import type { WorkplaceType } from './text.ts';
import type { SubscriptionRecord } from './subscriptions.ts';
import type { VisaSponsorNote } from '../research/visa-sponsors.ts';
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
export type LeadSort = 'new' | 'score' | 'budget' | 'relevance';

/**
 * «Сначала лучшие»: a lead's score loses this many points per hour of age, so a strong lead
 * from today beats an equally strong one from last week and a weak fresh one alike.
 */
export const SCORE_DECAY_PER_HOUR = 1 / 6;

/**
 * How much of a lead's text the research report reads (listLeadsForResearch): company
 * career pages (ATS) are many and long and only their head matters. Cold compaction cuts
 * text to exactly this head, so research gives the same answer for a compacted lead —
 * both use this one constant and must never drift apart.
 */
export const RESEARCH_TEXT_HEAD = { ats: 600, other: 3000 } as const;

/** The research head of a lead's text for a source of this kind (see RESEARCH_TEXT_HEAD). */
export function researchTextHead(text: string, sourceKind: string | undefined): string {
  return text.slice(0, sourceKind === 'ats' ? RESEARCH_TEXT_HEAD.ats : RESEARCH_TEXT_HEAD.other);
}

/** Metadata keys cold compaction drops: free-form prose no research or scoring path reads. */
export const COMPACT_DROP_METADATA_KEYS = ['summary', 'retitle_from'] as const;

export interface ListLeadsOptions {
  limit?: number;
  /** Only leads first seen at or before this instant (tier delay, walking a long window). */
  createdBefore?: string;
  status?: LeadStatus;
  sourceId?: string;
  query?: string;
  type?: LeadType;
  /** Only leads with a known budget of at least this many USD. */
  minBudgetUsd?: number;
  /** Only leads that can be done remotely. */
  remote?: boolean;
  /** Only leads with this workplace arrangement (remote, hybrid, onsite). */
  workplaceType?: WorkplaceType;
  /** Only leads tagged with this skill (case-insensitive). */
  skill?: string;
  /** Only leads tagged with at least one of these skills (case-insensitive): the «IT» chip. */
  skillsAny?: string[];
  /** Only leads first seen at or after this instant. */
  createdAfter?: string;
  /**
   * Only leads published at or after this instant (the source's own date, falling back to the
   * first-seen time when the source gave none). A board re-listed into the base today keeps
   * its old publish date and does not pass a «last 7 days» filter.
   */
  publishedAfter?: string;
  /** Only leads whose research direction (role) is one of these: catalog pages and role filters. */
  directionsAny?: string[];
  /** Only leads with this seniority grade (intern, junior, middle, senior, lead). */
  grade?: string;
  sort?: LeadSort;
  /** Only leads whose title is in Russian (Cyrillic) or in English (no Cyrillic). */
  language?: 'ru' | 'en';
  /** Leads to skip, for paging the HTML feed (the v2 API pages with a cursor). */
  offset?: number;
  /**
   * Only leads whose ISCO-08 occupation (classifyIsco08) starts with one of these 2–4 digit
   * codes. Applied before LIMIT/OFFSET/cursor, so pages stay full when matches are sparse.
   */
  occupationCodes?: string[];
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
  /** While set and in the future, the row is claimed by a worker and skipped by others. */
  leasedUntil?: string;
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

/** Who is on the service: sign-ups, their activity, and the delivery consumers. */
export interface AdminUsersData {
  totals: { users: number; new30d: number; sessions: number; reviewers: number; voters: number; deliveries7d: number };
  users: Array<{
    id: number;
    handle: string;
    role: string;
    reputation: number | null;
    createdAt?: string;
    banned: boolean;
    votes: number;
    reviews: number;
    labels: number;
  }>;
  subscriptions: Array<{ id: string; name: string; channel: string; paused: boolean; lastSentAt?: string }>;
}

/** One aggregated counter cell for agent analytics: day × surface × route/tool × tier × client × source. */
export interface ApiUsageDim {
  /** UTC date, YYYY-MM-DD. */
  day: string;
  surface: 'api' | 'mcp' | 'research';
  /** Path template (`/api/leads/{id}`), MCP tool or method name, or the research file name. */
  detail: string;
  tier: 'guest' | 'member' | 'admin' | 'token';
  /** User-Agent class: claude, codex, cursor, browser, bot, other. Never the raw string. */
  client: string;
  /** Attribution label from the whitelist ('' = direct/unknown). */
  via: string;
}

/** The /admin/analytics view: counters and token actives, oldest day first, no gaps. */
export interface AgentUsageStats {
  days: Array<{ day: string; api: number; mcp: number; research: number }>;
  details: Array<{ surface: string; detail: string; calls: number }>;
  tokens: Array<{ day: string; active: number }>;
  via: Array<{ via: string; calls: number }>;
  clients: Array<{ client: string; calls: number }>;
}

/** The data-goods metric (план D3): per day, how many leads carry model facts and model pay. */
export interface ModelPayDay {
  day: string;
  leads: number;
  withFacts: number;
  withPay: number;
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
  /** False when the person left the public rating. */
  publicProfile?: boolean;
}

export interface UserTelegramAccountRecord {
  id: string;
  userId: number;
  tgUserId: number;
  tgUsername: string | null;
  displayName: string | null;
  phone: string | null;
  sessionEncrypted: string;
  iv: string;
  tag: string;
  status: 'active' | 'auth_error' | 'revoked';
  lastPolledAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UserTelegramAccountInput {
  userId: number;
  tgUserId: number;
  tgUsername?: string | null;
  displayName?: string | null;
  phone?: string | null;
  sessionEncrypted: string;
  iv: string;
  tag: string;
  status?: 'active' | 'auth_error' | 'revoked';
}

export interface UserSourceRecord {
  id: string;
  userId: number;
  accountId: string;
  title: string;
  folder: string | null;
  chats: string[];
  cursors: Record<string, number>;
  shareToNetwork: boolean;
  enabled: boolean;
  lastPolledAt: string | null;
  /** Why the last read failed, or which chats it skipped; null when it went fine. */
  lastError: string | null;
  /** Posts the last read found. */
  lastCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface UserSourceInput {
  userId: number;
  accountId: string;
  title: string;
  folder?: string | null;
  chats?: string[];
  cursors?: Record<string, number>;
  shareToNetwork?: boolean;
  enabled?: boolean;
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

/** A lead row small enough to build the sitemap without loading the post body. */
export interface SitemapLeadRef {
  id: string;
  createdAt: string;
  type?: LeadType;
  state?: LeadState;
  status?: LeadStatus;
  score?: number;
}

export interface FeedOptions extends ListLeadsOptions {
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
  decidedBy: 'moderator' | 'author' | 'source' | 'model';
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
  countObservationsByPubkey(pubkey: string): Promise<number>;
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
  getUserByHandle?(handle: string): Promise<UserRecord | null>;
  listUsers?(limit: number): Promise<UserRecord[]>;
  setUserPublic?(id: number, value: boolean): Promise<void>;
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

export type { SourceQualityInput } from './source-quality.ts';

export interface EmployerSummary {
  key: string;
  name: string;
  active: number;
  lastAt: string;
}

/** What the employer rule reads of a stored lead. */
export interface EmployerRow {
  id: string;
  type: string;
  author?: string;
  text?: string;
  sourceKind?: string;
  company?: string;
  companyKey?: string;
}

/** Pay and employer taken from the page when the post itself had none. */
/** Posts of one day by type, platform, role and market scope (the index's raw material). */
export interface ResearchDailyRow {
  /** Of `n`, the fresh posts seen by the index's fixed feeds. */
  panelN?: number;
  day: string;
  type: string;
  platform: string;
  role: string;
  scope: string;
  n: number;
}

export interface SourceActivity {
  title?: string;
  day: number;
  week: number;
  total: number;
  lastAt?: string;
}

export interface LeadMoney {
  budget?: number;
  currency?: string;
  paymentPeriod?: string;
  rawSalary?: string;
  normalizedUsdMin?: number;
  normalizedUsdMax?: number;
  skills: string[];
  city?: string;
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

export interface LeadSighting {
  leadId: string;
  url: string;
  sourceId: string;
  /** Which merge rule found it: url, title, title_company, contact, similar. */
  method: string;
  similarity: number;
  seenAt?: string;
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
  /** Leads with this title key since `sinceIso`, newest first: the title-and-company rule compares their employers. */
  listRecentByTitleKey?(titleKey: string, sinceIso: string, limit: number): Promise<Lead[]>;
  /** MinHash LSH bands of a stored lead (migration 027), the shared near-duplicate index. */
  saveLeadBands?(leadId: string, bands: string[], createdAt: string): Promise<void>;
  /** Leads since `sinceIso` sharing at least one band, with their sketches. */
  findBandCandidates?(bands: string[], sinceIso: string, limit: number): Promise<Array<{ id: string; minhash: string }>>;
  /** Drops bands of leads created before `beforeIso`; returns how many rows went. */
  pruneLeadBands?(beforeIso: string): Promise<number>;
  /** True once any band is stored: the index needs no backfill. */
  hasLeadBands?(): Promise<boolean>;
  /** A copy of a stored lead seen at another address or source (migration 027). */
  addLeadSighting?(sighting: LeadSighting): Promise<void>;
  listLeadSightings?(leadId: string): Promise<LeadSighting[]>;
  /** Bank of Russia rates by month (migration 028). */
  listFxRates?(): Promise<Record<string, Record<string, number>>>;
  saveFxRates?(month: string, rates: Record<string, number>): Promise<void>;
  updateLeadStatus(id: string, status: LeadStatus, deliveredAt?: string, scoreDelta?: number): Promise<void>;
  /** Retroactive spam rejection: status and the door reasons together (the refilter pass). */
  updateLeadStatusAndReasons?(id: string, status: LeadStatus, reasons: string[]): Promise<void>;
  /** Per-source poll flow over the last `days` and the `days` before them (silent-drop alert). */
  getFlowStats?(days: number): Promise<SourceFlowStats[]>;
  /** Sets a recomputed base score; the stored score is the base plus the community vote adjustment. */
  updateLeadScore?(id: string, baseScore: number): Promise<number | undefined>;
  /** Leads whose stored title still opens with channel hashtags — the retitle pass's input. */
  listHashTitledLeads?(limit: number): Promise<Lead[]>;
  /** Retitles a stored lead and rebuilds its dedup key; the old title goes to metadata. */
  updateLeadTitle?(id: string, title: string, titleKey: string, previousTitle: string): Promise<boolean>;
  /** Id, title and dedup key of stored leads with id above `afterId`, by id — the rekey pass's pages. */
  listTitleKeys?(afterId: string | null, limit: number): Promise<Array<{ id: string; title: string; titleKey: string }>>;
  updateLeadTitleKey?(id: string, titleKey: string): Promise<void>;
  /** Counters behind each source's score, over the last `days`. */
  getSourceQuality?(days: number): Promise<Map<string, SourceQualityInput>>;
  /** The next post to check by hand: from the source with the fewest answers so far. */
  nextLeadToLabel?(): Promise<Lead | null>;
  saveLeadLabel?(id: string, verdict: string, userId?: number, note?: string): Promise<void>;
  labelStats?(): Promise<Record<string, number>>;
  /** New posts the model has not answered yet. Posts of private channels are left out. */
  listLeadsToDecide?(limit: number): Promise<Array<{ id: string; title: string; text: string }>>;
  saveModelDecision?(decision: ModelDecision): Promise<void>;
  decisionStats?(): Promise<{ total: number; tokens: number; byKind: Record<string, number>; closed: number; scam: number; lastAt?: string }>;
  /** Answers not acted on yet, with the post's score. */
  listDecisionsToApply?(limit: number): Promise<Array<{ decision: ModelDecision; score: number }>>;
  markDecisionApplied?(leadId: string, applied: string): Promise<void>;
  /** Fills empty/other research direction from a sure model answer: data, not a feed action. */
  applyLeadDirection?(leadId: string, direction: string): Promise<void>;
  /** Fills seniority grade when column is empty or from model decision. */
  applyLeadGrade?(leadId: string, grade: string): Promise<void>;
  /** Fills workplace only when the column is still empty (rules win when they already wrote one). */
  applyLeadWorkplace?(leadId: string, workplaceType: 'remote' | 'hybrid' | 'onsite', isRemote: boolean): Promise<void>;
  /** Backfill: copy sure SubQ directions onto leads still stuck on empty/other. */
  applyDirectionsFromDecisions?(minConfidence?: number): Promise<number>;
  /** Backfill: copy detected model grades onto leads where grade is still null. */
  applyGradesFromDecisions?(): Promise<number>;
  /** Posts the model took off the feed, the newest first. */
  listAppliedDecisions?(limit: number): Promise<Array<{ lead: Lead; decision: ModelDecision }>>;
  /** A person says the model was wrong: the post comes back and counts as a good one. */
  overruleDecision?(leadId: string, userId?: number): Promise<void>;
  /** Short posts of these hosts, not read yet. */
  listLeadsToEnrich?(limit: number, hosts: string[], shortText: number): Promise<Array<{ id: string; url: string; text: string }>>;
  saveLeadEnrichment?(id: string, text?: string): Promise<void>;
  /** The next post for a signed-in reader, of a direction if chosen. */
  nextLeadToReview?(userId: number, options: { direction?: string; bucket: ReviewBucket }): Promise<Lead | null>;
  saveLeadReview?(review: LeadReview): Promise<void>;
  deleteLeadReview?(leadId: string, userId: number): Promise<void>;
  /** Directions with open posts, the fullest first. */
  listDirections?(): Promise<Array<{ slug: string; total: number }>>;
  /** Seniority grades across active posts with counts, fullest first. */
  listGrades?(): Promise<Array<{ slug: string; total: number }>>;
  /** Top skills across active posts, most popular first. */
  listTopSkills?(limit?: number): Promise<Array<{ name: string; total: number }>>;
  listLeadsForDirections?(afterId: string | null, limit: number): Promise<Lead[]>;
  setLeadDirection?(id: string, direction: string): Promise<void>;
  /** Posts readers finished, with the answers of those who still count. */
  listReviewedLeads?(limit: number): Promise<Array<{ lead: Lead; verdicts: string[] }>>;
  /** What readers said is wrong with what we collected, by source. */
  reviewIssuesBySource?(): Promise<Map<string, number>>;
  listReviewNotes?(limit: number): Promise<Array<{ leadId: string; title: string; source: string; issues: string[]; note?: string }>>;
  reviewStats?(userId?: number): Promise<{ total: number; reviewers: number; mine: number }>;
  /** Posts where the model and the node differ, the surest first. */
  listDecisionDisagreements?(limit: number): Promise<Array<{ lead: Lead; decision: ModelDecision; reason: string }>>;
  /** Decisions of posts a person checked. */
  listLabelledDecisions?(): Promise<LabelledDecision[]>;
  /** Employers with open vacancies, the busiest first. */
  listEmployers?(options: { limit: number; minPosts: number; query?: string }): Promise<EmployerSummary[]>;
  listEmployerLeads?(key: string, limit: number): Promise<Lead[]>;
  countEmployerLeads?(key: string): Promise<number>;
  /** The employer's name, open vacancies or not. */
  employerName?(key: string): Promise<string | null>;
  listLeadsForEmployers?(afterId: string | null, limit: number): Promise<EmployerRow[]>;
  setLeadEmployer?(id: string, company: string | undefined, companyKey: string | undefined): Promise<void>;
  /** Stores the quality stage's verdict: the corrected type and the flags (metadata.qualityFlags). */
  updateLeadQuality?(id: string, type: LeadType, flags: string[]): Promise<void>;
  /** Stores pay and skills worked out again from the post's text; undefined fields are cleared. */
  updateLeadMoney?(id: string, money: LeadMoney): Promise<void>;
  /** How many posts a source brought; with byChannel, one row per Telegram channel. */
  sourceActivity?(options: { sourceId: string; byChannel?: boolean }): Promise<SourceActivity[]>;
  updateLeadState?(id: string, state: LeadState): Promise<void>;
  /**
   * Leads of one ATS board (plan 021B): every state, so the poll can diff the board's live
   * job set against what is stored — soft-close removed jobs, reopen returned ones. Bounded.
   */
  listBoardLeads?(options: { sourceId: string; externalIdPrefix: string; createdAfter: string; limit: number }): Promise<Array<Pick<Lead, 'id' | 'externalId' | 'state'>>>;
  /** Active leads on these hosts whose page is due for a closed-post check, oldest check first. */
  listLeadsToCheck?(options: { hosts: string[]; limit: number; createdAfter: string; now?: Date }): Promise<Array<Pick<Lead, 'id' | 'url' | 'createdAt' | 'type'>>>;
  /** Remembers that the lead's page was checked just now. */
  markLeadChecked?(id: string, at?: Date): Promise<void>;
  /**
   * Stores facts read from the lead's source page (metadata.facts) and fills pay and the
   * employer when the lead has none yet.
   */
  saveLeadFacts?(id: string, facts: PageFacts, fill: LeadFactsFill): Promise<void>;
  /** A public-register visa sponsorship note for a vacancy (plan 021D). */
  saveLeadVisaSponsor?(id: string, note: VisaSponsorNote): Promise<void>;
  /** Leads published in [from, to) for the market report: text cut to its head, junk and scam left out. */
  /** In id order; `afterId` continues from the last lead of the previous page. */
  listLeadsForResearch?(options: { from: string; to: string; limit: number; afterId?: string }): Promise<Lead[]>;
  /** Replaces the daily counts of one day (YYYY-MM-DD). */
  saveResearchDaily?(day: string, rows: ResearchDailyRow[]): Promise<void>;
  listResearchDaily?(from: string, to: string): Promise<ResearchDailyRow[]>;
  /** The last day with saved counts, if any. */
  lastResearchDay?(): Promise<string | undefined>;
  /** Newest posts with no model answer of this version yet, those without pay first (or with pay first, to calibrate). */
  listLeadsForModel?(options: { limit: number; since: string; version: number; withPayFirst?: boolean }): Promise<Array<Pick<Lead, 'id' | 'title' | 'text' | 'type'>>>;
  /** Stores the model's answer as metadata.model. */
  saveLeadModelFacts?(id: string, stored: unknown, options?: { applyToLead?: boolean }): Promise<void>;
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

  // Saved searches (src/core/subscriptions.ts).
  createSubscription?(subscription: SubscriptionRecord): Promise<void>;
  listSubscriptions?(userId: number): Promise<SubscriptionRecord[]>;
  getSubscription?(id: string): Promise<SubscriptionRecord | null>;
  updateSubscription?(id: string, patch: Partial<Omit<SubscriptionRecord, 'id' | 'userId' | 'createdAt'>>): Promise<void>;
  deleteSubscription?(id: string, userId: number): Promise<boolean>;
  /** Active subscriptions not checked since `checkedBefore`, never checked first. */
  listDueSubscriptions?(checkedBefore: string, limit: number): Promise<SubscriptionRecord[]>;
  /** Every not-paused subscription: closure events are pushed the moment they happen. */
  listActiveSubscriptions?(limit: number): Promise<SubscriptionRecord[]>;
  /** Stores a one-time code that links the user's Telegram chat; replaces an older code. */
  setTelegramLinkCode?(userId: number, code: string, expiresAt: string): Promise<void>;
  /** Links the chat that sent a valid code; returns the user, or null for an unknown or expired code. */
  linkTelegramChat?(code: string, chatId: string, now: string): Promise<number | null>;
  getTelegramChat?(userId: number): Promise<string | null>;
  /** Forgets a chat (the user blocked the bot or sent /stop); returns the user it belonged to. */
  unlinkTelegramChat?(chatId: string): Promise<number | null>;
  /** Users with a linked Telegram chat, and when they linked it. */
  listTelegramLinks?(): Promise<Array<{ userId: number; chatId: string; linkedAt: string }>>;
  /** Keys `leadId:kind` of the rating credits this user was already told about. */
  listLedgerNotices?(userId: number): Promise<Set<string>>;
  addLedgerNotices?(userId: number, entries: Array<{ leadId: string; kind: string }>): Promise<void>;
  /** Stores the user's agent token (its SHA-256), replacing an older one. */
  setAgentToken?(userId: number, tokenHash: string): Promise<void>;
  getUserByAgentToken?(tokenHash: string): Promise<UserRecord | null>;
  hasAgentToken?(userId: number): Promise<boolean>;
  deleteAgentToken?(userId: number): Promise<void>;
  getAdminStats?(days?: number): Promise<AdminStats>;
  /** Operator view of the people on the service: who signed up, who acts, who consumes. */
  adminUsersOverview?(): Promise<AdminUsersData>;
  /** Agent analytics: one aggregated counter upsert — never a per-call row, never an IP. */
  bumpApiUsage?(dim: ApiUsageDim, calls?: number): Promise<void>;
  /** Marks that this agent-token holder was active on the day (one row per token-day). */
  touchTokenDay?(userId: number, day?: string): Promise<void>;
  /** The /admin/analytics view over the counters for the last `days` days. */
  agentUsageStats?(days?: number): Promise<AgentUsageStats>;
  /** The extract-goods view (план D3): leads with model facts and model pay per day. */
  modelPayStats?(days?: number): Promise<ModelPayDay[]>;
  /** Browser extension tokens, stored as SHA-256 hashes. */
  saveExtensionToken?(tokenHash: string, userId: number): Promise<void>;
  getUserByExtensionToken?(tokenHash: string): Promise<UserRecord | null>;
  deleteExtensionToken?(tokenHash: string): Promise<void>;

  // User-connected Telegram accounts and personal sources
  upsertTelegramAccount?(input: UserTelegramAccountInput): Promise<UserTelegramAccountRecord>;
  listTelegramAccounts?(userId: number): Promise<UserTelegramAccountRecord[]>;
  getTelegramAccount?(id: string, userId?: number): Promise<UserTelegramAccountRecord | null>;
  deleteTelegramAccount?(id: string, userId: number): Promise<boolean>;
  setTelegramAccountStatus?(id: string, status: UserTelegramAccountRecord['status']): Promise<void>;
  /** Enabled personal sources of active accounts not read since `beforeIso`, least recent first. */
  listDueUserSources?(beforeIso: string, limit: number): Promise<UserSourceRecord[]>;

  createUserSource?(input: UserSourceInput): Promise<UserSourceRecord>;
  listUserSources?(userId: number): Promise<UserSourceRecord[]>;
  getUserSource?(id: string, userId?: number): Promise<UserSourceRecord | null>;
  updateUserSource?(id: string, userId: number, patch: Partial<Omit<UserSourceRecord, 'id' | 'userId' | 'accountId' | 'createdAt'>>): Promise<UserSourceRecord | null>;
  deleteUserSource?(id: string, userId: number): Promise<boolean>;

  recordRun(run: RunRecord): Promise<void>;
  listRuns(limit?: number, sourceId?: string): Promise<RunRecord[]>;
  recordDelivery(leadId: string, sink: string, status: 'sent' | 'failed', error?: string): Promise<void>;

  initLeadDeliveries?(leadId: string, sinks: string[]): Promise<void>;
  updateLeadDelivery?(leadId: string, sink: string, status: 'sent' | 'failed', error?: string, nextAttemptAt?: string): Promise<void>;
  /** Read-only peek at due deliveries (admin views). Does not claim rows. */
  getPendingDeliveries?(limit?: number): Promise<LeadDeliveryRecord[]>;
  /** Atomically claims due deliveries for `leaseMs`; claimed rows are skipped by other callers until the lease expires or the row is updated. */
  claimPendingDeliveries?(limit: number, leaseMs: number): Promise<LeadDeliveryRecord[]>;
  /** Atomically claims one lead's pending deliveries (the inline ingest path) so the outbox worker cannot race it. */
  claimLeadDeliveries?(leadId: string, leaseMs: number): Promise<LeadDeliveryRecord[]>;
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

  /**
   * Every lead that is not closed and was created at or after `createdAfter`, without the
   * feed's page size. The sitemap applies `isIndexable` itself (expiry differs by type).
   */
  listLeadsForSitemap?(options?: { createdAfter?: string; createdBefore?: string }): Promise<SitemapLeadRef[]>;

  /**
   * How many leads match these options, without loading them: the same filters as
   * `listLeads`/`getLeadsForFeed`, counted by the store (SELECT count(*) in PostgreSQL).
   * `limit` caps the count like the listing's LIMIT would; sorting is irrelevant.
   */
  countLeads?(options: FeedOptions & { feedOnly?: boolean }): Promise<number>;

  deleteLead?(id: string): Promise<boolean>;
  /**
   * Legacy retention (RADAR_RETENTION_MODE=delete): hard-deletes leads older than
   * retentionDays, cascading their ledger, deliveries and sightings. With archiveDir only
   * leads whose month file already exists there (see exportArchivedLeads) are deleted.
   */
  cleanupOldLeads?(retentionDays: number, archiveDir?: string): Promise<number>;
  cleanupRuns?(retentionDays: number): Promise<number>;
  /** Prunes delivered outbox queue rows older than retentionDays (safe retention window for in-flight retries). */
  cleanupLeadDeliveries?(retentionDays: number): Promise<number>;
  /** Compacts dead rows and updates BM25 statistics on the leads table. */
  vacuumLeads?(): Promise<void>;
  /** Lead lifecycle, step 1 (warm): leads older than hotDays hide from feed/API (archived_at);
   * the full row stays. Batched. Nothing is deleted. */
  archiveOldLeads?(hotDays: number): Promise<number>;
  /** Step 2: monthly gz JSONL export (`leads-YYYY-MM.jsonl.gz`, UTC months) of fully-archived
   * months not exported yet; returns the files written. */
  exportArchivedLeads?(dir: string, hotDays: number): Promise<string[]>;
  /**
   * Step 3 (cold, RADAR_RETENTION_MODE=compact): leads older than retentionDays whose month
   * file already exists in archiveDir shrink in place — text cut to the research head
   * (researchTextHead), contacts and the embedding cleared, bulky metadata dropped,
   * compacted_at set. Ids, votes, rating, sightings and deliveries stay. Idempotent.
   */
  compactOldLeads?(retentionDays: number, archiveDir: string): Promise<number>;

  close(): Promise<void>;
}
