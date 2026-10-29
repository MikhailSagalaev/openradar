import { Hono } from 'hono';
import type { Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { escapeHtml, extractTechSkills } from '../core/text.ts';
import { renderRssFeed } from './feed.ts';
import type { ParticipantRecord, UserRecord } from '../core/store.ts';
import type { Lead, LeadStatus, LeadType, RawLead, SourceConfig, SourceKind, SourceRecord, Viewer, VoteSignal } from '../core/types.ts';
import type { ListLeadsOptions } from '../core/store.ts';
import { pollAll, pollSource } from '../pipeline/poll.ts';
import { ingestRawLead, type IngestDeps } from '../pipeline/ingest.ts';
import { fetchSafeHttp } from '../pipeline/preview.ts';
import { feedMaxAge } from '../pipeline/liveness.ts';
import type { Runtime } from '../runtime.ts';
import { SOURCE_PRESETS, presetSource } from '../sources/presets.ts';
import { IMAP_PASSWORD_ENV_RE } from '../sources/imap.ts';
import { DEFAULT_SESSION_ENV, TELEGRAM_SESSION_ENV_RE } from '../sources/telegram-account.ts';
import { VERSION } from '../version.ts';
import { githubOAuthConfigured, startGitHubOAuth, handleGitHubCallback } from './auth.ts';
import { renderAdminPage } from './admin.ts';
import { analyticsFromEnv, contentSecurityPolicy } from './analytics.ts';
import { filterOptions, parseFeedFilters } from './filters.ts';
import { estimateMarket } from '../core/market.ts';
import { rateLimit } from './ratelimit.ts';
import { indexCsv, openradarIndex } from '../research/index.ts';
import { renderIndexPage } from '../research/index-page.ts';
import { renderIndexPageEn, renderMethodologyPageEn, renderReportPageEn } from '../research/pages-en.ts';
import {
  renderExtensionPage,
  renderLeadPage,
  renderLeadsPage,
  renderNewSourcePage,
  renderNotFound,
  renderExtensionConnectPage,
  renderProfilePage,
  setAnalytics,
  setPublicBaseUrl,
  renderSourceCreatedPage,
  renderSourcePage,
  renderSourcesPage,
  renderSourceCatalogPage,
  renderSubmitPage,
  STYLE,
  type AuthDisplay,
  STYLE_PATH,
  type SourceFormValues,
} from './ui.ts';
import { resolveLang, type SupportedLang } from './i18n.ts';
import { canSeeContacts, delayMinutes, viewerCanSeeLead, visibleBefore } from '../core/access.ts';
import { redactLead } from '../core/contacts.ts';
import { observationToRawLead, parseObservation } from '../core/observation.ts';
import { isNostrAuthHeader, verifyHttpAuth } from '../net/protocol.ts';
import { parseModerators } from '../hub/service.ts';
import { evaluateLeadState, RATING_WINDOW_MS, tierFor, WeightResolver, WEB_SIGNAL_PREFIX } from '../hub/rating.ts';
import { recordWebObservation, webPubkey } from '../hub/web-key.ts';
import { registerV2Routes } from './v2.ts';
import {
  SEO_CATALOG,
  findCatalogEntry,
  renderAboutPage,
  renderCatalogIndex,
  renderCatalogPage,
  renderFaqPage,
  renderLlmsTxt,
  renderRobotsTxt,
  renderSitemapXml,
} from './seo.ts';
import { datasetCsv, liveReport, monthSnapshot } from '../research/service.ts';
import { renderMethodologyPage, renderReportPage, renderRolePage } from '../research/pages.ts';
import { extractPreviewFromHtml, validateSubmissionUrl } from './preview.ts';
import { renderLogo, LOGO_SVG, LOGO_ASSET_PATH, FAVICON_SVG } from './logo.ts';

/** The market estimate looks at the last 90 days of priced leads. */
const MARKET_WINDOW_MS = 90 * 24 * 3600 * 1000;

function tokenFromRequest(c: Context): string | undefined {
  const authorization = c.req.header('authorization');
  if (authorization?.toLowerCase().startsWith('bearer ')) {
    return authorization.slice(7).trim();
  }
  const headerToken = c.req.header('x-radar-token');
  if (headerToken) return headerToken;
  return undefined;
}

function safeEqual(left: string | undefined, right: string): boolean {
  if (!left) return false;
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * GitHub accounts with admin rights (RADAR_ADMIN_GITHUB): numeric ids, or logins.
 * Ids are safer: a login can be renamed and later taken by someone else.
 */
function isGitHubAdmin(user: UserRecord | undefined, runtime: Runtime): boolean {
  const list = runtime.env.RADAR_ADMIN_GITHUB;
  if (!user || !list) return false;
  return list
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
    .some((entry) => (/^\d+$/.test(entry) ? Number(entry) === user.githubId : entry === user.handle.toLowerCase()));
}

async function isAdmin(c: Context, runtime: Runtime): Promise<boolean> {
  const env = runtime.env;
  if (env.RADAR_ADMIN_GITHUB && isGitHubAdmin(await currentUser(c, runtime), runtime)) return true;
  if (!env.RADAR_ADMIN_TOKEN) return false;

  const headerToken = tokenFromRequest(c);
  if (headerToken && safeEqual(headerToken, env.RADAR_ADMIN_TOKEN)) {
    return true;
  }

  const sessionId = getCookie(c, 'radar_session');
  if (sessionId && runtime.store.validateSession) {
    const valid = await runtime.store.validateSession(sessionId);
    if (valid) return true;
  }

  return false;
}

async function canRead(c: Context, runtime: Runtime): Promise<boolean> {
  if (runtime.env.RADAR_PUBLIC_READ) return true;
  // A logged-in GitHub user always keeps read access, public read or not.
  if (await currentUser(c, runtime)) return true;
  return isAdmin(c, runtime);
}

/** GitHub-authenticated user of this session, if any. */
async function currentUser(c: Context, runtime: Runtime): Promise<UserRecord | undefined> {
  const sessionId = getCookie(c, 'radar_session');
  if (!sessionId || !runtime.store.getUserBySession) return undefined;
  const user = await runtime.store.getUserBySession(sessionId);
  return user ?? undefined;
}


async function getAuthDisplay(c: Context, runtime: Runtime): Promise<AuthDisplay | undefined> {
  const user = await currentUser(c, runtime);
  if (user) return { handle: user.handle, isAdmin: isGitHubAdmin(user, runtime) };
  const sessionId = getCookie(c, 'radar_session');
  if (sessionId && (await runtime.store.validateSession?.(sessionId))) return { isAdmin: true };
  return undefined;
}

function loginPage(error?: string, githubEnabled = false, returnTo?: string): string {
  const ghHref = returnTo && returnTo.startsWith('/') && !returnTo.startsWith('//')
    ? `/auth/github?returnTo=${encodeURIComponent(returnTo)}`
    : '/auth/github';
  const githubButton = githubEnabled
    ? `<a class="github-btn" href="${escapeHtml(ghHref)}">Войти через GitHub</a>
<div class="divider"><span>или</span></div>`
    : '';
  const githubStyle = githubEnabled
    ? `.github-btn{display:block;width:100%;box-sizing:border-box;padding:10px;border:1px solid var(--line);border-radius:6px;background:var(--surface);color:var(--ink);font:inherit;font-size:13px;font-weight:500;text-align:center;text-decoration:none;transition:border-color .15s ease}
.github-btn:hover{border-color:var(--ink);text-decoration:none}
.divider{display:flex;align-items:center;gap:10px;color:var(--muted);font-size:11px;margin:14px 0}
.divider::before,.divider::after{content:'';flex:1;height:1px;background:var(--line)}`
    : '';
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>openradar — вход</title>
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<style>
:root{--bg:#ffffff;--surface:#ffffff;--ink:#09090b;--muted:#71717a;--line:#e4e4e7;--btn:#09090b;--btn-text:#ffffff;--error:#ef4444}
@media (prefers-color-scheme: dark){:root{--bg:#09090b;--surface:#121215;--ink:#f4f4f5;--muted:#a1a1aa;--line:#27272a;--btn:#f4f4f5;--btn-text:#09090b;--error:#f87171}}
body{font:14px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;letter-spacing:-0.01em;background:var(--bg);color:var(--ink);display:grid;place-items:center;min-height:100vh;margin:0}
form{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:28px 24px;width:min(360px,90vw);box-shadow:0 4px 20px rgba(0,0,0,0.04)}
.login-logo{margin-bottom:14px;color:var(--ink);display:flex;align-items:center}
h1{font-size:22px;letter-spacing:-0.03em;margin:0 0 6px;font-weight:600}p{color:var(--muted);font-size:13px;margin:0 0 20px}
input{width:100%;box-sizing:border-box;padding:9px 14px;border:1px solid var(--line);border-radius:8px;font:inherit;font-size:13px;background:var(--bg);color:var(--ink);margin-bottom:14px;transition:all .15s ease}
input:focus{outline:0;border-color:var(--ink);box-shadow:0 0 0 1px var(--ink),0 1px 2px rgba(0,0,0,.04)}
button{width:100%;padding:10px;border:0;border-radius:6px;background:var(--btn);color:var(--btn-text);font:inherit;font-size:13px;font-weight:500;cursor:pointer;transition:opacity .15s ease,transform .1s ease}
button:hover{opacity:0.9}button:active{transform:scale(0.98)}
.error{color:var(--error);font-size:12.5px;font-weight:500;margin-bottom:12px;background:rgba(239,68,68,0.08);padding:6px 10px;border-radius:5px}
${githubStyle}
</style></head>
<body>
<form method="post" action="/login">
<div class="login-logo">${renderLogo({ height: 32 })}</div>
<p>Голосование и добавление заказов — после входа. Токен администратора — для управления источниками.</p>
${error ? `<div class="error">${escapeHtml(error)}</div>` : ''}
${githubButton}
<label style="display:contents"><input name="token" type="password" autofocus autocomplete="current-password" placeholder="Токен администратора"></label>
<button type="submit">Войти по токену</button>
</form></body></html>`;
}

function deps(runtime: Runtime): IngestDeps {
  return {
    store: runtime.store,
    sinks: runtime.sinks,
    classifier: runtime.classifier,
    logger: runtime.logger,
    env: runtime.env,
    fetchImpl: runtime.fetchImpl,
    similar: runtime.similar,
  };
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

/**
 * Config keys that may be shown to non-admin readers of /api/sources.
 * Everything else (tokens, passwords, proxy credentials, future connector secrets)
 * is masked: an allowlist stays safe when a connector gains a new sensitive key.
 */
const PUBLIC_CONFIG_KEYS = new Set([
  'url', 'channel', 'chat', 'username', 'board', 'query', 'tag', 'tags',
  'language', 'lang', 'city', 'category', 'feed', 'topic', 'topics', 'workdir',
]);

function redactSource<T extends { config: Record<string, unknown> }>(source: T): T {
  const config: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source.config)) {
    config[key] = PUBLIC_CONFIG_KEYS.has(key) ? value : '***';
  }
  return { ...source, config };
}

/** Proxy settings must be a credential-less http(s) URL; anything else is rejected. */
function invalidProxyUrl(config: Record<string, unknown>): string | null {
  const raw = config.proxyUrl;
  if (raw === undefined || raw === null || raw === '') return null;
  if (typeof raw !== 'string') return 'proxyUrl must be a string';
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return 'proxyUrl must be a valid URL';
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return 'proxyUrl must use http or https';
  }
  if (parsed.username || parsed.password) {
    return 'proxyUrl must not embed credentials; use an IP-authenticated proxy';
  }
  return null;
}

/**
 * Viewer of every lead-reading endpoint (pages, API, RSS, catalog, MCP).
 * Admin sees everything; a logged-in GitHub user is a member; everyone else
 * is a guest. In hub mode the tier sets the feed delay; guests never see contacts.
 */
async function viewerFromRequest(c: Context, runtime: Runtime): Promise<Viewer> {
  if (await isAdmin(c, runtime)) return { tier: 'admin' };
  const moderators = parseModerators(runtime.env.RADAR_MODERATORS);
  const nostr = await nostrAuthOf(c, runtime);
  if (nostr.pubkey && nostr.participant) {
    const tier = tierFor({
      rating: nostr.participant.rating,
      moderator: moderators.has(nostr.pubkey),
      githubLinked: Boolean(nostr.participant.githubUserId),
    });
    return { tier, pubkey: nostr.pubkey };
  }
  const user = await currentUser(c, runtime);
  if (user) {
    // A web user linked to a participant key gets that key's tier (never below member).
    const linked = runtime.access.mode === 'hub' ? await runtime.store.getParticipantByGithubUser(user.id) : null;
    if (linked && !linked.bannedAt) {
      const tier = tierFor({ rating: await accountRating(runtime, user.id, linked), moderator: moderators.has(linked.pubkey), githubLinked: true });
      return { tier, userId: user.id, pubkey: linked.pubkey };
    }
    return { tier: 'member', userId: user.id };
  }
  return { tier: 'guest' };
}

/** Secret for web participant keys; the admin token when no dedicated one is set. */
export function webKeySecret(runtime: Runtime): string | undefined {
  return runtime.env.RADAR_WEB_KEY_SECRET || runtime.env.RADAR_ADMIN_TOKEN || undefined;
}

/** Rating of an account: its linked key plus its web key, when they differ. */
export async function accountRating(runtime: Runtime, userId: number, linked: ParticipantRecord | null): Promise<number> {
  const secret = webKeySecret(runtime);
  const web = secret ? webPubkey(secret, userId) : undefined;
  let rating = linked?.rating ?? 0;
  if (web && web !== linked?.pubkey) rating += (await runtime.store.getParticipant(web))?.rating ?? 0;
  return rating;
}

interface NostrAuthState {
  pubkey?: string;
  participant?: ParticipantRecord;
  error?: string;
}

const nostrAuthPending = new WeakMap<Request, Promise<NostrAuthState>>();
const nostrAuthDone = new WeakMap<Request, NostrAuthState>();

/** URL the client must have signed: RADAR_PUBLIC_URL (behind a proxy) or the request URL. */
function signedRequestUrl(c: Context, runtime: Runtime): string {
  const base = runtime.env.RADAR_PUBLIC_URL?.replace(/\/+$/, '');
  if (!base) return c.req.url;
  const url = new URL(c.req.url);
  return `${base}${url.pathname}${url.search}`;
}

/**
 * Participant key from `Authorization: Nostr <event>` (hub mode only). Verified once per
 * request: the auth event id is single-use, so a second check would look like a replay.
 */
function nostrAuthOf(c: Context, runtime: Runtime): Promise<NostrAuthState> {
  const header = c.req.header('authorization');
  if (runtime.access.mode !== 'hub' || !isNostrAuthHeader(header)) return Promise.resolve({});
  let pending = nostrAuthPending.get(c.req.raw);
  if (!pending) {
    pending = (async (): Promise<NostrAuthState> => {
      const method = c.req.method.toUpperCase();
      const body = method === 'GET' || method === 'HEAD' ? undefined : await c.req.text();
      const result = verifyHttpAuth(header, { url: signedRequestUrl(c, runtime), method, body });
      if (!result.ok || !result.pubkey || !result.eventId || !result.expiresAt) return { error: result.error ?? 'invalid' };
      const fresh = await runtime.store.rememberAuth(result.eventId, new Date(result.expiresAt * 1000).toISOString());
      if (!fresh) return { error: 'replay' };
      const participant = await runtime.store.touchParticipant(result.pubkey);
      if (participant.bannedAt) return { error: 'banned' };
      return { pubkey: result.pubkey, participant };
    })().then((state) => {
      nostrAuthDone.set(c.req.raw, state);
      return state;
    });
    nostrAuthPending.set(c.req.raw, pending);
  }
  return pending;
}

/** Mirrors a web vote into the weighted signals that decide whether a lead is hidden. */
async function recordWebSignal(runtime: Runtime, leadId: string, userId: number, vote: VoteSignal | null): Promise<void> {
  const signer = `${WEB_SIGNAL_PREFIX}${userId}`;
  if (vote) {
    await runtime.store.upsertSignal({ leadId, pubkey: signer, signal: vote, comment: '', createdAt: new Date().toISOString() });
  } else {
    await runtime.store.deleteSignal(leadId, signer);
  }
  const lead = await runtime.store.getLead(leadId);
  if (lead) {
    await evaluateLeadState(runtime.store, lead, new WeightResolver(runtime.store, parseModerators(runtime.env.RADAR_MODERATORS)));
  }
}

/** Guests never see contacts: they are cut out of every lead they receive. */
function projectContacts(lead: Lead, viewer: Viewer): Lead {
  return canSeeContacts(viewer) ? lead : redactLead(lead);
}

/** The public feed for a viewer (active leads only, after the viewer's delay), contacts projected. */
/** Older than the feed keeps leads of its type (RADAR_GIG_TTL_DAYS / RADAR_JOB_TTL_DAYS). */
function isExpired(lead: Lead, env: Runtime['env']): boolean {
  const maxAge = feedMaxAge(env);
  if (!maxAge) return false;
  return Date.now() - Date.parse(lead.createdAt) > (lead.type === 'job' ? maxAge.job : maxAge.gig) * 86_400_000;
}

async function feedFor(runtime: Runtime, viewer: Viewer, options: ListLeadsOptions): Promise<Lead[]> {
  const leads = await runtime.store.getLeadsForFeed({ maxAgeDays: feedMaxAge(runtime.env), ...options, createdBefore: visibleBefore(viewer, runtime.access) });
  return leads.map((lead) => projectContacts(lead, viewer));
}

/**
 * Absolute base URL for links in feeds, sitemaps and OAuth. RADAR_PUBLIC_URL wins:
 * the Host header is client-controlled and must not decide where links point.
 */
function publicBaseUrl(c: Context, runtime: Runtime): string {
  const configured = runtime.env.RADAR_PUBLIC_URL?.replace(/\/+$/, '');
  if (configured) return configured;
  const host = c.req.header('host') || '127.0.0.1:8787';
  const proto = c.req.header('x-forwarded-proto') === 'https' ? 'https' : 'http';
  return `${proto}://${host}`;
}

/** Leads for a viewer: admins see the whole store, everyone else the active feed after their delay. */
async function leadsFor(runtime: Runtime, viewer: Viewer, options: ListLeadsOptions): Promise<Lead[]> {
  if (viewer.tier === 'admin') return runtime.store.listLeads(options);
  return runtime.store.getLeadsForFeed({ maxAgeDays: feedMaxAge(runtime.env), ...options, createdBefore: visibleBefore(viewer, runtime.access) });
}

/**
 * Lead projection for non-admin API consumers: keeps the public marketplace fields,
 * drops pipeline internals (fingerprints, dedup keys, external ids, delivery state,
 * raw metadata) that only operators and the ingest pipeline need.
 */
const PUBLIC_LEAD_KEYS = [
  'id', 'type', 'title', 'text', 'url', 'canonicalUrl', 'author', 'city',
  'budget', 'currency', 'paymentPeriod', 'rawSalary', 'normalizedUsdMin', 'normalizedUsdMax',
  'category', 'skills', 'isRemote', 'publishedAt', 'createdAt',
  'votes_up', 'votes_down', 'votes_scam', 'votes_closed', 'contacts', 'sourceRef',
] as const;

function toPublicLead(lead: Lead): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const record = lead as unknown as Record<string, unknown>;
  for (const key of PUBLIC_LEAD_KEYS) {
    const value = record[key];
    if (value !== undefined) out[key] = value;
  }
  return out;
}

function formString(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  return typeof value === 'string' ? value.trim() : '';
}

function parseList(value: string): string[] {
  return value
    .split(/[,;\n]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function sameOrigin(c: Context): boolean {
  const origin = c.req.header('origin') ?? c.req.header('referer');
  if (!origin) return false;
  let host = c.req.header('host');
  if (!host) {
    try {
      host = new URL(c.req.url).host;
    } catch {
      return false;
    }
  }
  if (!host) return false;
  try {
    const originHost = new URL(origin).host.toLowerCase();
    const hostHeader = host.toLowerCase();
    return (
      originHost === hostHeader ||
      originHost.startsWith('127.0.0.1:') ||
      originHost.startsWith('localhost:') ||
      originHost === '127.0.0.1' ||
      originHost === 'localhost'
    );
  } catch {
    return false;
  }
}

function formValues(body: Record<string, unknown>): SourceFormValues {
  return {
    kind: formString(body, 'kind') || 'rss',
    title: formString(body, 'title'),
    url: formString(body, 'url'),
    channel: formString(body, 'channel'),
    categoryId: formString(body, 'categoryId'),
    city: formString(body, 'city'),
    includeKeywords: formString(body, 'includeKeywords'),
    excludeKeywords: formString(body, 'excludeKeywords'),
    minBudget: formString(body, 'minBudget'),
    limit: formString(body, 'limit'),
    host: formString(body, 'host'),
    port: formString(body, 'port'),
    user: formString(body, 'user'),
    passwordEnv: formString(body, 'passwordEnv'),
    mailbox: formString(body, 'mailbox'),
    sinceDays: formString(body, 'sinceDays'),
    subjectIncludes: formString(body, 'subjectIncludes'),
    chats: formString(body, 'chats'),
    folder: formString(body, 'folder'),
    sessionEnv: formString(body, 'sessionEnv'),
    query: formString(body, 'query'),
    area: formString(body, 'area'),
    remotiveCategory: formString(body, 'remotiveCategory'),
    provider: formString(body, 'provider'),
    companies: formString(body, 'companies'),
    pattern: formString(body, 'pattern'),
    share: formString(body, 'share') === 'on',
  };
}

function formValuesFromSource(source: SourceRecord): SourceFormValues {
  const config = source.config;
  const text = (value: unknown): string => {
    if (typeof value === 'string') return value;
    if (typeof value === 'number') return String(value);
    if (Array.isArray(value)) return value.join(', ');
    return '';
  };
  return {
    kind: source.kind,
    title: source.title,
    url: text(config.url),
    channel: text(config.channel),
    categoryId: text(config.categoryId),
    city: text(config.city),
    includeKeywords: text(config.includeKeywords),
    excludeKeywords: text(config.excludeKeywords),
    minBudget: text(config.minBudget),
    limit: text(config.limit),
    host: text(config.host),
    port: text(config.port),
    user: text(config.user),
    passwordEnv: text(config.passwordEnv),
    mailbox: text(config.mailbox),
    sinceDays: text(config.sinceDays),
    subjectIncludes: text(config.subjectIncludes),
    chats: text(config.chats),
    folder: text(config.folder),
    sessionEnv: text(config.sessionEnv),
    query: text(config.query ?? config.text ?? config.tag),
    area: text(config.area),
    remotiveCategory: source.kind === 'remotive' ? text(config.category) : '',
    provider: text(config.provider),
    companies: text(config.companies),
    pattern: text(config.pattern),
    share: config.share === true,
  };
}

/** Config keys the source form sets; everything else is kept as it was. */
const FORM_CONFIG_KEYS = new Set([
  'share', 'city', 'includeKeywords', 'excludeKeywords', 'minBudget', 'limit', 'url', 'channel', 'chats', 'folder',
  'sessionEnv', 'categoryId', 'token', 'host', 'user', 'passwordEnv', 'port', 'mailbox', 'sinceDays', 'subjectIncludes',
  'query', 'text', 'tag', 'area', 'category', 'provider', 'companies', 'pattern',
]);

function buildSourceConfig(
  kind: SourceKind,
  body: Record<string, unknown>,
  existing?: SourceRecord,
): { config: SourceConfig; error?: string } {
  // Settings the form does not show (proxy, perPoll, maxAgeDays...) survive an edit.
  const config: SourceConfig = {};
  for (const [key, value] of Object.entries(existing?.config ?? {})) {
    if (!FORM_CONFIG_KEYS.has(key)) config[key] = value;
  }
  if (formString(body, 'share') === 'on') config.share = true;
  const city = formString(body, 'city');
  if (city) config.city = city;

  const include = parseList(formString(body, 'includeKeywords'));
  if (include.length) config.includeKeywords = include;
  const exclude = parseList(formString(body, 'excludeKeywords'));
  if (exclude.length) config.excludeKeywords = exclude;

  const minBudget = asNumber(formString(body, 'minBudget'));
  if (minBudget !== undefined) {
    if (minBudget < 0 || isNaN(minBudget)) return { config, error: 'Минимальный бюджет должен быть положительным числом.' };
    config.minBudget = minBudget;
  }
  const limit = asNumber(formString(body, 'limit'));
  if (limit !== undefined) {
    if (limit <= 0 || isNaN(limit) || limit > 500) return { config, error: 'Лимит должен быть от 1 до 500.' };
    config.limit = limit;
  }

  if (kind === 'rss') {
    const url = formString(body, 'url');
    if (!url) return { config, error: 'Для RSS нужен URL фида.' };
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return { config, error: 'Разрешены только http:// и https:// ссылки.' };
      }
      if (['localhost', '127.0.0.1', '0.0.0.0', '::1'].includes(parsed.hostname)) {
        return { config, error: 'Локальные адреса запрещены.' };
      }
    } catch {
      return { config, error: 'Некорректный URL фида.' };
    }
    config.url = url;
  }

  if (kind === 'telegram') {
    const channel = formString(body, 'channel').replace(/^@/, '');
    if (!channel || !/^[a-zA-Z0-9_]{4,32}$/.test(channel)) {
      return { config, error: 'Укажите корректный публичный канал Telegram (4-32 символов a-z, 0-9, _).' };
    }
    config.channel = channel;
  }

  if (kind === 'telegram-account') {
    const chats = parseList(formString(body, 'chats'));
    const folder = formString(body, 'folder').trim();
    if (folder.length > 64) return { config, error: 'Название папки — не длиннее 64 символов.' };
    if (!chats.length && !folder) return { config, error: 'Укажите папку Telegram или хотя бы один канал или чат.' };
    if (chats.length > 50) return { config, error: 'Не больше 50 чатов в одном источнике.' };
    const bad = chats.find((chat) => !/^(?:@?[a-zA-Z0-9_]{4,32}|https?:\/\/t\.me\/[a-zA-Z0-9_]{4,32}|-?\d{5,20})$/.test(chat));
    if (bad) return { config, error: `Не похоже на канал или чат Telegram: ${bad}` };
    const sessionEnv = formString(body, 'sessionEnv') || DEFAULT_SESSION_ENV;
    if (!TELEGRAM_SESSION_ENV_RE.test(sessionEnv)) {
      return { config, error: 'Переменная с сессией: RADAR_TELEGRAM_SESSION или RADAR_TELEGRAM_SESSION_ИМЯ.' };
    }
    config.chats = chats;
    if (folder) config.folder = folder;
    config.sessionEnv = sessionEnv;
  }

  if (kind === 'kwork') {
    const categoryId = formString(body, 'categoryId');
    if (categoryId && !/^\d{1,8}$/.test(categoryId)) {
      return { config, error: 'ID категории Kwork должен быть числовым.' };
    }
    if (categoryId) config.categoryId = categoryId;
  }

  if (kind === 'webhook') {
    const existingToken =
      typeof existing?.config.token === 'string' ? existing.config.token : undefined;
    config.token = existingToken ?? randomBytes(16).toString('hex');
  }

  if (kind === 'hh' || kind === 'trudvsem' || kind === 'remoteok') {
    const query = formString(body, 'query').trim();
    if (query.length > 200) return { config, error: 'Поисковый запрос — не длиннее 200 символов.' };
    if (query) config.query = query;
  }

  if (kind === 'hh') {
    const area = formString(body, 'area').trim();
    if (area && !/^\d{1,6}$/.test(area)) return { config, error: 'Регион hh.ru — числовой ID, например 113.' };
    if (area) config.area = area;
  }

  if (kind === 'remotive') {
    const category = formString(body, 'remotiveCategory').trim();
    if (category && !/^[a-z0-9-]{2,40}$/.test(category)) return { config, error: 'Категория Remotive — латиница и дефисы, например software-dev.' };
    if (category) config.category = category;
  }

  if (kind === 'ats') {
    const provider = formString(body, 'provider');
    if (!['greenhouse', 'lever', 'ashby'].includes(provider)) return { config, error: 'Выберите систему найма: Greenhouse, Lever или Ashby.' };
    const companies = parseList(formString(body, 'companies'));
    if (!companies.length) return { config, error: 'Укажите хотя бы одну компанию.' };
    if (companies.length > 300) return { config, error: 'Не больше 300 компаний в одном источнике.' };
    const bad = companies.find((company) => !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,80}(=.{1,80})?$/.test(company));
    if (bad) return { config, error: `Не похоже на компанию доски: ${bad}` };
    config.provider = provider;
    config.companies = companies;
  }

  if (kind === 'sitemap') {
    const url = formString(body, 'url');
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return { config, error: 'Разрешены только http:// и https:// ссылки.' };
    } catch {
      return { config, error: 'Укажите адрес карты сайта.' };
    }
    const pattern = formString(body, 'pattern');
    if (!pattern) return { config, error: 'Укажите шаблон адресов вакансий.' };
    try {
      new RegExp(pattern);
    } catch {
      return { config, error: 'Шаблон страниц — некорректное регулярное выражение.' };
    }
    config.url = url;
    config.pattern = pattern;
  }

  if (kind === 'imap') {
    const host = formString(body, 'host');
    const user = formString(body, 'user');
    const passwordEnv = formString(body, 'passwordEnv');
    if (!host || !user || !passwordEnv) {
      return {
        config,
        error: 'Для IMAP нужны хост, пользователь и имя переменной с паролем.',
      };
    }
    if (!IMAP_PASSWORD_ENV_RE.test(passwordEnv)) {
      return { config, error: 'Имя переменной с паролем должно начинаться с RADAR_IMAP_ (например, RADAR_IMAP_PASSWORD).' };
    }
    config.host = host;
    config.user = user;
    config.passwordEnv = passwordEnv;
    const port = asNumber(formString(body, 'port'));
    if (port !== undefined) config.port = port;
    const mailbox = formString(body, 'mailbox');
    if (mailbox) config.mailbox = mailbox;
    const sinceDays = asNumber(formString(body, 'sinceDays'));
    if (sinceDays !== undefined) config.sinceDays = sinceDays;
    const subjectIncludes = parseList(formString(body, 'subjectIncludes'));
    if (subjectIncludes.length) config.subjectIncludes = subjectIncludes;
  }

  return { config };
}

function toRawLead(body: Record<string, unknown>, sourceId: string): RawLead | null {
  const text = asString(body.text);
  const title = asString(body.title);
  if (!text && !title) return null;
  const skills = Array.isArray(body.skills)
    ? body.skills.filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
    : undefined;
  const metadata =
    typeof body.metadata === 'object' && body.metadata !== null
      ? (body.metadata as Record<string, unknown>)
      : undefined;

  let url = asString(body.url);
  if (url) {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        url = undefined;
      }
    } catch {
      url = undefined;
    }
  }

  const rawType = asString(body.type);
  const type: LeadType | undefined = rawType === 'job' || rawType === 'gig' ? rawType : undefined;

  return {
    sourceId,
    type,
    externalId: asString(body.externalId),
    url,
    title: title ?? text ?? '',
    text: text ?? title ?? '',
    author: asString(body.author),
    city: asString(body.city),
    budget: asNumber(body.budget),
    currency: asString(body.currency) ?? 'RUB',
    category: asString(body.category),
    skills,
    isRemote: typeof body.isRemote === 'boolean' ? body.isRemote : true,
    metadata,
    publishedAt: asString(body.publishedAt),
    raw: body,
  };
}

export function createApp(runtime: Runtime): Hono {
  const app = new Hono();
  setPublicBaseUrl(runtime.env.RADAR_PUBLIC_URL);

  // Security Headers: Clickjacking, MIME-sniffing, XSS, CSRF
  const analytics = analyticsFromEnv(runtime.env);
  setAnalytics(analytics);
  const csp = contentSecurityPolicy(analytics);
  // Request bodies are read into memory, so every route has a ceiling: 10 MB where nodes
  // send batches, 1 MB for forms and JSON everywhere else.
  const largeBodyLimit = bodyLimit({ maxSize: MAX_BATCH_BODY_BYTES, onError: (c) => c.json({ error: 'payload_too_large' }, 413) });
  const smallBodyLimit = bodyLimit({ maxSize: MAX_BODY_BYTES, onError: (c) => c.json({ error: 'payload_too_large' }, 413) });
  app.use('*', async (c, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(c.req.method.toUpperCase())) return next();
    const path = c.req.path;
    const batch = path.startsWith('/api/ingest/') || path.startsWith('/api/v2/ingest/') || path === '/v2/events';
    return (batch ? largeBodyLimit : smallBodyLimit)(c, next);
  });

  app.use('*', async (c, next) => {
    // frame-ancestors governs framing; X-Frame-Options only when nothing may frame us.
    if (!analytics.yandexMetrikaId) c.header('X-Frame-Options', 'DENY');
    c.header('X-Content-Type-Options', 'nosniff');
    // Pages follow the visitor's language: a cookie or the browser's Accept-Language.
    c.header('Vary', 'Accept-Language, Cookie');
    c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
    c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    // The dashboard uses inline scripts and styles, hence 'unsafe-inline'.
    c.header('Content-Security-Policy', csp);

    const method = c.req.method.toUpperCase();
    if (['POST', 'PATCH', 'DELETE'].includes(method)) {
      const isIngest =
        c.req.path.startsWith('/api/ingest') ||
        c.req.path.startsWith('/api/v2/ingest') ||
        c.req.path === '/v2/events' ||
        c.req.path === '/api/preview' ||
        c.req.path === '/api/submit' ||
        c.req.path === '/mcp';
      const hasBearerAuth = Boolean(c.req.header('authorization') || c.req.header('x-radar-token'));
      if (!isIngest && !hasBearerAuth) {
        if (!sameOrigin(c)) {
          return c.text('Forbidden: cross-origin or missing Origin header', 403);
        }
      }
    }

    await next();
  });

  app.notFound((c) => {
    const p = c.req.path;
    const wantsJson = p.startsWith('/api') || p.startsWith('/v2') || p === '/mcp' || !c.req.header('accept')?.includes('text/html');
    if (wantsJson) return c.json({ error: 'not_found' }, 404);
    return c.html(renderNotFound(VERSION, resolveLang(c)), 404);
  });

  app.onError((error, c) => {
    runtime.logger.error('http handler failed', {
      error: error instanceof Error ? error.message : String(error),
      path: c.req.path,
    });
    return c.json({ error: 'internal_error' }, 500);
  });

  registerV2Routes(app, runtime, {
    viewerFromRequest: (c) => viewerFromRequest(c, runtime),
    authError: (c) => nostrAuthDone.get(c.req.raw)?.error,
    projectLead: (lead, viewer) => toPublicLead(projectContacts(lead, viewer)),
    ingestDeps: () => deps(runtime),
    currentUserId: async (c) => (await currentUser(c, runtime))?.id,
  });

  app.get('/health', async (c) => {
    const stats = await runtime.store.getStats();
    return c.json({
      ok: true,
      version: VERSION,
      uptimeSec: Math.round(process.uptime()),
      sources: stats.sources,
      // Disabled sources stay in the count above; this is what is actually polled.
      enabledSources: stats.enabledSources,
      last24h: stats.last24h,
    });
  });

  app.get('/logo.svg', (c) => {
    return new Response(LOGO_SVG, {
      headers: {
        'content-type': 'image/svg+xml; charset=utf-8',
        'cache-control': 'public, max-age=86400',
      },
    });
  });

  // Social preview card; read once, missing on a checkout without assets/.
  const ogImage = (() => {
    try {
      return fs.readFileSync(path.resolve(process.cwd(), 'assets/og.png'));
    } catch {
      return undefined;
    }
  })();
  app.get('/og.png', (c) => {
    if (!ogImage) return c.notFound();
    return new Response(ogImage, { headers: { 'content-type': 'image/png', 'cache-control': 'public, max-age=86400' } });
  });

  app.get(LOGO_ASSET_PATH, () => {
    return new Response(LOGO_SVG, {
      headers: {
        'content-type': 'image/svg+xml; charset=utf-8',
        'cache-control': 'public, max-age=31536000, immutable',
      },
    });
  });

  app.get(STYLE_PATH, () => {
    return new Response(STYLE, {
      headers: {
        'content-type': 'text/css; charset=utf-8',
        'cache-control': 'public, max-age=31536000, immutable',
      },
    });
  });

  app.get('/favicon.svg', (c) => {
    return new Response(FAVICON_SVG, {
      headers: {
        'content-type': 'image/svg+xml; charset=utf-8',
        'cache-control': 'public, max-age=86400',
      },
    });
  });

  app.get('/favicon.ico', (c) => {
    return new Response(FAVICON_SVG, {
      headers: {
        'content-type': 'image/svg+xml; charset=utf-8',
        'cache-control': 'public, max-age=86400',
      },
    });
  });

  app.get('/assets/:file', async (c) => {
    const file = c.req.param('file');
    if (!/^[a-zA-Z0-9_.-]+$/.test(file)) return c.text('Not found', 404);
    const filePath = path.resolve(process.cwd(), 'assets', file);
    try {
      if (fs.existsSync(filePath)) {
        const contentType = file.endsWith('.svg')
          ? 'image/svg+xml'
          : file.endsWith('.png')
          ? 'image/png'
          : 'application/octet-stream';
        const data = await fs.promises.readFile(filePath);
        return new Response(data, {
          headers: {
            'content-type': contentType,
            'cache-control': 'public, max-age=86400',
          },
        });
      }
    } catch {}
    return c.text('Not found', 404);
  });

  app.get('/login', async (c) => {
    if (!runtime.env.RADAR_ADMIN_TOKEN && !githubOAuthConfigured(runtime)) {
      // Redirecting to / would loop back here when the feed is not public.
      if (await canRead(c, runtime)) return c.redirect('/');
      return c.text('Вход не настроен: задайте RADAR_ADMIN_TOKEN или GitHub OAuth в .env', 503);
    }
    if (await isAdmin(c, runtime)) return c.redirect('/');
    if (await currentUser(c, runtime)) return c.redirect('/');
    return c.html(loginPage(c.req.query('error'), githubOAuthConfigured(runtime), c.req.query('returnTo')));
  });

  app.get('/auth/github', (c) => startGitHubOAuth(c, runtime));
  app.get('/auth/github/callback', (c) => handleGitHubCallback(c, runtime));

  app.post('/login', rateLimit({ windowMs: 15 * 60_000, max: 10 }), async (c) => {
    const expected = runtime.env.RADAR_ADMIN_TOKEN;
    if (!expected) return c.redirect('/');
    const body = await c.req.parseBody();
    const token = typeof body.token === 'string' ? body.token : '';
    if (!safeEqual(token, expected)) return c.html(loginPage('Неверный токен'), 401);

    const sessionId = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
    if (runtime.store.createSession) {
      await runtime.store.createSession(sessionId, expiresAt);
    }

    setCookie(c, 'radar_session', sessionId, {
      httpOnly: true,
      sameSite: 'Lax',
      secure: c.req.header('x-forwarded-proto') === 'https',
      path: '/',
      maxAge: 7 * 24 * 3600,
    });
    return c.redirect('/');
  });

  app.get('/logout', async (c) => {
    const sessionId = getCookie(c, 'radar_session');
    if (sessionId && runtime.store.deleteSession) {
      await runtime.store.deleteSession(sessionId);
    }
    deleteCookie(c, 'radar_session', { path: '/' });
    return c.redirect('/login');
  });

  app.get('/lang/:lang', (c) => {
    const raw = c.req.param('lang');
    const target: SupportedLang = raw === 'en' ? 'en' : 'ru';
    setCookie(c, 'openradar_lang', target, {
      path: '/',
      maxAge: 31536000,
      sameSite: 'Lax',
    });
    const returnUrl = c.req.query('return') || c.req.header('referer') || '/';
    let safeReturn = '/';
    try {
      // The referer is a full URL; only its path on this site is followed.
      const parsed = new URL(returnUrl, 'http://local');
      if (parsed.host === 'local' || parsed.host === new URL(c.req.url).host) safeReturn = `${parsed.pathname}${parsed.search}`;
    } catch {}
    if (safeReturn.startsWith('//')) safeReturn = '/';
    // English research pages live under /en; Russian ones under the bare path.
    if (target === 'ru' && /^\/en\/research(\/|$|\?)/.test(safeReturn)) safeReturn = safeReturn.slice(3);
    if (target === 'en' && /^\/research(\/index|\/methodology|\/\d{4}-\d{2})?(\?|$)/.test(safeReturn)) safeReturn = `/en${safeReturn}`;
    return c.redirect(safeReturn);
  });

  // Search suggestions: dictionary skills of the last week's leads, refreshed every 10 minutes.
  let popularCache: { at: number; items: Array<{ name: string; count: number }> } | undefined;
  const popularSkills = async (): Promise<Array<{ name: string; count: number }>> => {
    if (popularCache && Date.now() - popularCache.at < 10 * 60_000) return popularCache.items;
    const recent = await runtime.store.getLeadsForFeed({
      limit: 1500,
      createdAfter: new Date(Date.now() - 7 * 24 * 3600_000).toISOString(),
    });
    const counts = new Map<string, number>();
    for (const lead of recent) {
      for (const skill of extractTechSkills(`${lead.title}\n${lead.text}`)) counts.set(skill, (counts.get(skill) ?? 0) + 1);
    }
    const items = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, count]) => ({ name, count }));
    popularCache = { at: Date.now(), items };
    return items;
  };

  // Public feeds: generous per-IP limits, so a scraper loop cannot pin the database.
  const feedLimit = rateLimit({ windowMs: 60_000, max: 120 });
  app.get('/', feedLimit, async (c) => {
    if (!await canRead(c, runtime)) return c.redirect('/login');
    const lang = resolveLang(c);
    const rawStatus = c.req.query('status') ?? '';
    const status = [
      'new',
      'interesting',
      'applied',
      'in_work',
      'delivered',
      'rejected',
      'failed',
    ].includes(rawStatus)
      ? (rawStatus as LeadStatus)
      : '';
    const rawType = (c.req.query('type') ?? '').trim();
    const type: LeadType | undefined = rawType === 'job' || rawType === 'gig' ? rawType : undefined;
    const query = (c.req.query('q') ?? '').trim();
    const filters = parseFeedFilters(c);
    const page = Math.max(1, Math.min(Math.floor(Number(c.req.query('page')) || 1), 100));
    const pageSize = 50;

    const viewer = await viewerFromRequest(c, runtime);
    const [stats, health, fetched] = await Promise.all([
      runtime.store.getStats(),
      runtime.store.getSourceHealth(),
      // One extra lead tells whether a next page exists.
      leadsFor(runtime, viewer, {
        limit: pageSize + 1,
        offset: (page - 1) * pageSize,
        status: status || undefined,
        query: query || undefined,
        type,
        ...filterOptions(filters),
      }),
    ]);
    let leads = fetched.slice(0, pageSize);
    let partialMatch = false;
    let hasMore = fetched.length > pageSize;
    // Nothing for the whole phrase: show leads matching any of its words, marked as partial.
    const words = query.split(/\s+/).filter((word) => word.length >= 3).slice(0, 4);
    if (!leads.length && page === 1 && words.length >= 2) {
      const seen = new Map<string, Lead>();
      for (const word of words) {
        for (const lead of await leadsFor(runtime, viewer, { limit: pageSize, status: status || undefined, query: word, type, ...filterOptions(filters) })) {
          seen.set(lead.id, lead);
        }
      }
      leads = [...seen.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, pageSize);
      partialMatch = leads.length > 0;
      hasMore = false;
    }

    return c.html(
      renderLeadsPage({
        stats,
        health,
        leads: leads.map((lead) => projectContacts(lead, viewer)),
        page,
        hasMore,
        partialMatch,
        popularSkills: await popularSkills(),
        query,
        status,
        type: type ?? '',
        filters,
        version: VERSION,
        auth: await getAuthDisplay(c, runtime),
        lang,
        delayMinutes: delayMinutes(viewer, runtime.access),
        isAdmin: viewer.tier === 'admin',
        githubEnabled: githubOAuthConfigured(runtime),
      }),
    );
  });

  app.get('/admin', async (c) => {
    if (!await isAdmin(c, runtime)) return c.redirect('/login?returnTo=/admin');
    const [stats, health, admin] = await Promise.all([
      runtime.store.getStats(),
      runtime.store.getSourceHealth(),
      runtime.store.getAdminStats ? runtime.store.getAdminStats(14) : undefined,
    ]);
    if (!admin) return c.text('This store has no admin statistics', 501);
    return c.html(
      renderAdminPage({
        version: VERSION,
        auth: await getAuthDisplay(c, runtime),
        lang: resolveLang(c),
        stats,
        health,
        admin,
        analytics: analyticsFromEnv(runtime.env),
      }),
    );
  });

  app.get('/me', async (c) => {
    const viewer = await viewerFromRequest(c, runtime);
    if (viewer.tier === 'guest') return c.redirect('/login?returnTo=/me');
    const participant = viewer.pubkey ? await runtime.store.getParticipant(viewer.pubkey) : null;
    const { admin: _admin, ...delays } = runtime.access.delays;
    // The account's keys: the linked one and its web key, when they differ.
    const secret = webKeySecret(runtime);
    const pubkeys = [...new Set([viewer.pubkey, viewer.userId && secret ? webPubkey(secret, viewer.userId) : undefined].filter((k): k is string => Boolean(k)))];
    const since = new Date(Date.now() - RATING_WINDOW_MS).toISOString();
    const ledger = (await Promise.all(pubkeys.map((k) => runtime.store.listLedger(k, since, 50)))).flat();
    const observations = (await Promise.all(pubkeys.map((k) => runtime.store.listObservationsByPubkey(k, 20)))).flat()
      .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))
      .slice(0, 20);
    const titles = new Map<string, Lead>();
    for (const id of new Set([...ledger.map((e) => e.leadId), ...observations.map((o) => o.leadId)])) {
      const lead = await runtime.store.getLead(id);
      if (lead) titles.set(id, lead);
    }
    const rating = viewer.userId ? await accountRating(runtime, viewer.userId, participant) : participant?.rating;
    return c.html(
      renderProfilePage({
        version: VERSION,
        auth: await getAuthDisplay(c, runtime),
        lang: resolveLang(c),
        tier: viewer.tier,
        delays,
        hubMode: runtime.access.mode === 'hub',
        pubkey: viewer.pubkey,
        rating,
        ledger: ledger
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .slice(0, 30)
          .map((entry) => ({ ...entry, title: titles.get(entry.leadId)?.title })),
        posts: observations.map((o) => {
          const lead = titles.get(o.leadId);
          const credited = ledger.some((e) => e.leadId === o.leadId && e.points > 0);
          const hidden = lead?.state && lead.state !== 'active' && lead.state !== 'closed';
          return {
            leadId: o.leadId,
            title: lead?.title ?? o.leadId,
            receivedAt: o.receivedAt,
            first: o.isFirst,
            status: hidden ? 'hidden' as const : credited ? 'credited' as const : 'waiting' as const,
          };
        }),
      }),
    );
  });

  // The version of the extension this server hands out, shown on /extension.
  const extensionVersion = (() => {
    try {
      return String(JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'extension/manifest.json'), 'utf8')).version ?? '');
    } catch {
      return '';
    }
  })();

  app.get('/extension', async (c) => {
    const lang = resolveLang(c);
    // Webhook sources are the operator's setup: guests on a public hub do not see them.
    const isAuthed = await isAdmin(c, runtime);
    let webhookSources: SourceRecord[] = [];
    if (isAuthed) {
      const allSources = await runtime.store.listSources();
      webhookSources = allSources.filter((s) => s.kind === 'webhook' && s.enabled);
    }
    return c.html(
      renderExtensionPage({
        version: VERSION,
        extensionVersion: extensionVersion || undefined,
        webhookSources,
        auth: await getAuthDisplay(c, runtime),
        lang,
        isAuthed,
      }),
    );
  });

  app.get('/extension/download', async (c) => {
    const zipPath = path.resolve(process.cwd(), 'extension.zip');
    try {
      if (fs.existsSync(zipPath)) {
        const data = await fs.promises.readFile(zipPath);
        return new Response(data, {
          headers: {
            'content-type': 'application/zip',
            'content-disposition': 'attachment; filename="openradar-extension.zip"',
            'cache-control': 'public, max-age=300',
          },
        });
      }
    } catch {}
    return c.text('Extension archive not found', 404);
  });

  app.get('/submit', async (c) => {
    if (!await canRead(c, runtime)) return c.redirect('/login');
    const lang = resolveLang(c);
    const user = await currentUser(c, runtime);
    return c.html(
      renderSubmitPage({
        version: VERSION,
        auth: await getAuthDisplay(c, runtime),
        userHandle: user?.handle,
        githubEnabled: githubOAuthConfigured(runtime),
        lang,
      }),
    );
  });

  /** On a hub, what a signed-in person adds counts to their rating through their web key. */
  const creditWebUser = async (userId: number, outcome: { status: string; lead?: Lead }): Promise<void> => {
    const secret = webKeySecret(runtime);
    if (runtime.access.mode !== 'hub' || !secret || !outcome.lead || outcome.status === 'rejected') return;
    try {
      await recordWebObservation(runtime.store, secret, userId, outcome.lead, outcome.status !== 'duplicate');
    } catch (error) {
      runtime.logger.warn('web observation failed', { leadId: outcome.lead.id, error: String(error) });
    }
  };

  app.post('/submit', rateLimit({ windowMs: 10 * 60_000, max: 30 }), async (c) => {
    const user = await currentUser(c, runtime);
    if (!user) return c.redirect('/login');
    const body = await c.req.parseBody();
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    const text = typeof body.text === 'string' ? body.text.trim() : '';
    const url = typeof body.url === 'string' ? body.url.trim() : '';
    const rawType = typeof body.leadType === 'string' ? body.leadType.trim() : '';
    const type: LeadType = rawType === 'job' || rawType === 'gig' ? rawType : 'gig';
    const author = typeof body.author === 'string' ? body.author.trim() : undefined;
    const category = typeof body.category === 'string' && body.category.trim() ? body.category.trim() : undefined;
    const city = typeof body.city === 'string' ? body.city.trim() : undefined;
    const budget = asNumber(body.budget);
    const currency = typeof body.currency === 'string' && body.currency.trim() ? body.currency.trim() : 'RUB';
    const rawSkills = typeof body.skills === 'string' ? body.skills : '';
    const skills = rawSkills ? rawSkills.split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean) : undefined;
    const isRemote = body.isRemote === 'false' ? false : true;

    if (!title && !text) return c.redirect('/submit');

    const sources = await runtime.store.listSources();
    let source =
      sources.find((s) => s.kind === 'webhook' && s.enabled) ??
      sources.find((s) => s.kind === 'webhook');
    if (!source) {
      source = await runtime.store.createSource({
        kind: 'webhook',
        title: 'Ручное добавление',
        config: {},
        enabled: true,
      });
    }

    const rawLead: RawLead = {
      sourceId: source.id,
      type,
      title: title || text,
      text: text || title,
      url: url || undefined,
      author: author || user.handle,
      category,
      city,
      budget,
      currency,
      skills,
      isRemote,
      externalId: url ? `url:${url}` : `manual:${Date.now()}`,
      raw: body,
    };

    const outcome = await ingestRawLead(rawLead, source, deps(runtime));
    await creditWebUser(user.id, outcome);
    if (outcome.lead?.id) {
      return c.redirect(`/leads/${outcome.lead.id}`);
    }
    return c.redirect('/');
  });

  app.get('/sources', async (c) => {
    if (!await canRead(c, runtime)) return c.redirect('/login');
    const lang = resolveLang(c);
    const admin = await isAdmin(c, runtime);
    return c.html(
      renderSourcesPage({
        health: await runtime.store.getSourceHealth(),
        version: VERSION,
        auth: await getAuthDisplay(c, runtime),
        lang,
        isAdmin: admin,
      }),
    );
  });

  app.get('/sources/catalog', async (c) => {
    if (!await isAdmin(c, runtime)) return c.redirect('/login');
    const existing = await runtime.store.listSources();
    const items = SOURCE_PRESETS.map((preset) => {
      const source = presetSource(preset, existing);
      return { preset, sourceId: source?.id, enabled: source?.enabled };
    });
    return c.html(renderSourceCatalogPage({ items, version: VERSION, auth: await getAuthDisplay(c, runtime), lang: resolveLang(c) }));
  });

  app.post('/sources/catalog/:id', async (c) => {
    if (!await isAdmin(c, runtime)) return c.redirect('/login');
    if (!sameOrigin(c)) return c.text('Forbidden', 403);
    const preset = SOURCE_PRESETS.find((item) => item.id === c.req.param('id'));
    if (!preset) return c.redirect('/sources/catalog');
    const existing = presetSource(preset, await runtime.store.listSources());
    if (existing) return c.redirect(`/sources/${existing.id}`);
    const source = await runtime.store.createSource({ kind: preset.kind, title: preset.title, config: preset.config, enabled: true });
    void pollSource(source, { ...deps(runtime), sources: runtime.sources }).catch((error: unknown) =>
      runtime.logger.warn('first poll of a preset failed', { sourceId: source.id, error: String(error) }),
    );
    return c.redirect('/sources/catalog');
  });

  app.post('/sources/presets', async (c) => {
    if (!await isAdmin(c, runtime)) return c.redirect('/login');
    if (!sameOrigin(c)) return c.text('Forbidden', 403);
    const existing = await runtime.store.listSources();
    const created: SourceRecord[] = [];
    for (const preset of SOURCE_PRESETS) {
      if (presetSource(preset, existing)) continue;
      created.push(await runtime.store.createSource({
        kind: preset.kind,
        title: preset.title,
        config: preset.config,
        enabled: true,
      }));
    }
    // Poll the new sources right away instead of waiting for the next scheduler tick,
    // so a fresh node shows leads within seconds.
    void (async () => {
      for (const source of created) {
        try {
          await pollSource(source, { ...deps(runtime), sources: runtime.sources });
        } catch (error) {
          runtime.logger.warn('first poll of a preset failed', { sourceId: source.id, error: String(error) });
        }
      }
    })();
    return c.redirect('/sources');
  });

  app.get('/sources/new', async (c) => {
    if (!await isAdmin(c, runtime)) return c.redirect('/login');
    const lang = resolveLang(c);
    return c.html(
      renderNewSourcePage({
        version: VERSION,
        kinds: runtime.sources.list().map((adapter) => adapter.kind),
        values: formValues({}),
        mode: 'create',
        action: '/sources',
        submitLabel: 'Создать источник',
        auth: await getAuthDisplay(c, runtime),
        lang,
      }),
    );
  });

  app.get('/sources/:id/edit', async (c) => {
    if (!await isAdmin(c, runtime)) return c.redirect('/login');
    const lang = resolveLang(c);
    const source = await runtime.store.getSource(c.req.param('id'));
    if (!source) return c.html(renderNotFound(VERSION, lang), 404);
    return c.html(
      renderNewSourcePage({
        version: VERSION,
        kinds: runtime.sources.list().map((adapter) => adapter.kind),
        values: formValuesFromSource(source),
        mode: 'edit',
        action: `/sources/${source.id}`,
        submitLabel: 'Сохранить',
        sourceId: source.id,
        auth: await getAuthDisplay(c, runtime),
        lang,
      }),
    );
  });

  app.post('/sources', async (c) => {
    if (!await isAdmin(c, runtime)) return c.redirect('/login');
    if (!sameOrigin(c)) return c.text('Forbidden', 403);

    const body = (await c.req.parseBody()) as Record<string, unknown>;
    const values = formValues(body);
    const kind = values.kind as SourceKind;

    const fail = (error: string): Response =>
      c.html(
        renderNewSourcePage({
          version: VERSION,
          kinds: runtime.sources.list().map((adapter) => adapter.kind),
          values,
          error,
          mode: 'create',
          action: '/sources',
          submitLabel: 'Создать источник',
        }),
        400,
      );

    if (!runtime.sources.get(kind)) return fail('Неизвестный тип источника.');
    if (!values.title) return fail('Название источника обязательно.');

    const built = buildSourceConfig(kind, body);
    if (built.error) return fail(built.error);

    const created = await runtime.store.createSource({
      kind,
      title: values.title,
      config: built.config,
    });

    if (kind === 'webhook') {
      return c.html(
        renderSourceCreatedPage({
          version: VERSION,
          source: created,
          token: String(created.config.token ?? ''),
        }),
      );
    }

    return c.redirect(`/sources/${created.id}?created=1`);
  });

  app.post('/sources/:id', async (c) => {
    if (!await isAdmin(c, runtime)) return c.redirect('/login');
    if (!sameOrigin(c)) return c.text('Forbidden', 403);
    const source = await runtime.store.getSource(c.req.param('id'));
    if (!source) return c.html(renderNotFound(VERSION), 404);

    const body = (await c.req.parseBody()) as Record<string, unknown>;
    const values = formValues(body);
    values.kind = source.kind;

    const fail = (error: string): Response =>
      c.html(
        renderNewSourcePage({
          version: VERSION,
          kinds: runtime.sources.list().map((adapter) => adapter.kind),
          values,
          error,
          mode: 'edit',
          action: `/sources/${source.id}`,
          submitLabel: 'Сохранить',
          sourceId: source.id,
        }),
        400,
      );

    if (!values.title) return fail('Название источника обязательно.');
    const built = buildSourceConfig(source.kind, body, source);
    if (built.error) return fail(built.error);

    await runtime.store.updateSource(source.id, {
      title: values.title,
      config: built.config,
    });
    return c.redirect(`/sources/${source.id}?updated=1`);
  });

  app.get('/sources/:id', async (c) => {
    if (!await canRead(c, runtime)) return c.redirect('/login');
    const lang = resolveLang(c);
    const source = await runtime.store.getSource(c.req.param('id'));
    if (!source) return c.html(renderNotFound(VERSION, lang), 404);
    const viewer = await viewerFromRequest(c, runtime);
    const allHealth = await runtime.store.getSourceHealth();
    const health = allHealth.find((item) => item.source.id === source.id) ?? {
      source,
      last24h: {
        found: 0,
        inserted: 0,
        duplicates: 0,
        rejected: 0,
        delivered: 0,
        errors: 0,
        runs: 0,
      },
      successRate: 0,
    };
    const [leads, runs] = await Promise.all([
      leadsFor(runtime, viewer, { sourceId: source.id, limit: 20 }),
      runtime.store.listRuns(20, source.id),
    ]);
    const admin = await isAdmin(c, runtime);
    return c.html(
      renderSourcePage({
        source,
        health,
        leads: leads.map((lead) => projectContacts(lead, viewer)),
        runs,
        version: VERSION,
        notice:
          c.req.query('created') === '1'
            ? 'Источник создан.'
            : c.req.query('updated') === '1'
              ? 'Изменения сохранены.'
              : undefined,
        auth: await getAuthDisplay(c, runtime),
        lang,
        isAdmin: admin,
      }),
    );
  });

  app.get('/leads/:id', async (c) => {
    if (!await canRead(c, runtime)) return c.redirect('/login');
    const lang = resolveLang(c);
    const viewer = await viewerFromRequest(c, runtime);
    const stored = await runtime.store.getLead(c.req.param('id'));
    if (!stored || !viewerCanSeeLead(viewer, stored, runtime.access)) return c.html(renderNotFound(VERSION, lang), 404);
    const lead = projectContacts(stored, viewer);
    const source = await runtime.store.getSource(lead.sourceId);
    const user = await currentUser(c, runtime);
    const myVote = (user && runtime.store.getUserVote)
      ? await runtime.store.getUserVote(lead.id, user.id)
      : null;
    // Similar: same type and main skill, best of the last week, as this viewer may see them.
    const similar = (await feedFor(runtime, viewer, {
      limit: 5,
      type: lead.type,
      skill: lead.skills?.[0],
      ...filterOptions({ sort: 'score', remote: false }),
    })).filter((item) => item.id !== lead.id).slice(0, 4);
    return c.html(
      renderLeadPage({
        similar,
        lead,
        source: source ?? undefined,
        version: VERSION,
        auth: await getAuthDisplay(c, runtime),
        lang,
        myVote: myVote ?? undefined,
        contactsHidden: !canSeeContacts(viewer),
        expired: isExpired(lead, runtime.env),
      }),
    );
  });

  app.post('/leads/:id/status', async (c) => {
    if (!await isAdmin(c, runtime)) return c.redirect('/login');
    const id = c.req.param('id');
    const body = await c.req.parseBody();
    const rawStatus = typeof body.status === 'string' ? body.status : '';
    const validStatuses: LeadStatus[] = ['new', 'interesting', 'applied', 'in_work', 'rejected', 'delivered', 'failed'];
    if (validStatuses.includes(rawStatus as LeadStatus)) {
      await runtime.store.updateLeadStatus(id, rawStatus as LeadStatus);
      // Implicit positive community signal (+0.25 useful)
      if (['interesting', 'applied', 'in_work'].includes(rawStatus)) {
        await runtime.store.recordVote(id, 'useful', 0.25).catch(() => {});
      }
    }
    return c.redirect(`/leads/${id}`);
  });

  app.post('/leads/:id/feedback', async (c) => {
    if (!await isAdmin(c, runtime)) return c.redirect('/login');
    const id = c.req.param('id');
    const body = await c.req.parseBody();
    const feedback = typeof body.feedback === 'string' ? body.feedback : '';
    if (feedback === 'up') {
      await runtime.store.updateLeadStatus(id, 'interesting', undefined, 10);
    } else if (feedback === 'down') {
      await runtime.store.updateLeadStatus(id, 'rejected', undefined, -20);
    }
    return c.redirect(`/leads/${id}`);
  });

  app.post('/leads/:id/vote', rateLimit({ windowMs: 60_000, max: 30 }), async (c) => {
    const user = await currentUser(c, runtime);
    const contentType = c.req.header('content-type') || '';
    if (!user) {
      if (contentType.includes('application/json') || c.req.header('accept')?.includes('application/json')) {
        return c.json({ error: 'login_required' }, 401);
      }
      return c.redirect(`/leads/${c.req.param('id')}?login_required=1`);
    }
    const id = c.req.param('id') as string;
    let signal: string | undefined;
    if (contentType.includes('application/json')) {
      const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
      signal = typeof body?.signal === 'string' ? body.signal : undefined;
    } else {
      const body = await c.req.parseBody();
      signal = typeof body.signal === 'string' ? body.signal : undefined;
    }
    const validSignals: VoteSignal[] = ['useful', 'junk', 'scam', 'closed'];
    if (!signal || !validSignals.includes(signal as VoteSignal)) {
      if (contentType.includes('application/json')) {
        return c.json({ error: 'invalid_signal', valid: validSignals }, 400);
      }
      return c.redirect(`/leads/${id}`);
    }

    try {
      const result = await runtime.store.recordUserVote?.(id, user.id, signal as VoteSignal);
      if (result) await recordWebSignal(runtime, id, user.id, result.myVote ?? null);
      if (!result) {
        return c.json({ error: 'votes_not_supported' }, 500);
      }
      if (contentType.includes('application/json') || c.req.header('accept')?.includes('application/json')) {
        return c.json({ ok: true, id, ...result });
      }
      return c.redirect(`/leads/${id}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('not found')) {
        if (contentType.includes('application/json')) {
          return c.json({ error: 'lead_not_found' }, 404);
        }
        return c.html(renderNotFound(VERSION), 404);
      }
      throw err;
    }
  });

  app.patch('/api/leads/:id/status', async (c) => {
    if (!await isAdmin(c, runtime)) return c.json({ error: 'unauthorized' }, 401);
    const id = c.req.param('id');
    const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
    const status = typeof body?.status === 'string' ? (body.status as LeadStatus) : undefined;
    const scoreDelta = typeof body?.scoreDelta === 'number' ? body.scoreDelta : undefined;
    if (!status) return c.json({ error: 'status_required' }, 400);
    await runtime.store.updateLeadStatus(id, status, undefined, scoreDelta);
    // Implicit positive community signal (+0.25 useful) when moved to funnel without manual delta
    if (typeof scoreDelta !== 'number' && ['interesting', 'applied', 'in_work'].includes(status)) {
      await runtime.store.recordVote(id, 'useful', 0.25).catch(() => {});
    }
    return c.json({ ok: true, id, status });
  });

  app.post('/api/leads/:id/vote', rateLimit({ windowMs: 60_000, max: 30 }), async (c) => {
    const user = await currentUser(c, runtime);
    if (!user) return c.json({ error: 'login_required' }, 401);
    const id = c.req.param('id') as string;
    const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
    const signal = typeof body?.signal === 'string' ? body.signal : undefined;
    const validSignals: VoteSignal[] = ['useful', 'junk', 'scam', 'closed'];
    if (!signal || !validSignals.includes(signal as VoteSignal)) {
      return c.json({ error: 'invalid_signal', valid: validSignals }, 400);
    }

    try {
      const result = await runtime.store.recordUserVote?.(id, user.id, signal as VoteSignal);
      if (result) await recordWebSignal(runtime, id, user.id, result.myVote ?? null);
      if (!result) {
        return c.json({ error: 'votes_not_supported' }, 500);
      }
      return c.json({ ok: true, id, ...result });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('not found')) {
        return c.json({ error: 'lead_not_found' }, 404);
      }
      throw err;
    }
  });

  app.post('/sources/:id/toggle', async (c) => {
    if (!await isAdmin(c, runtime)) return c.redirect('/login');
    if (!sameOrigin(c)) return c.text('Forbidden', 403);
    const source = await runtime.store.getSource(c.req.param('id'));
    if (!source) return c.html(renderNotFound(VERSION), 404);
    await runtime.store.updateSource(source.id, { enabled: !source.enabled });
    return c.redirect(`/sources/${source.id}`);
  });

  app.post('/sources/:id/delete', async (c) => {
    if (!await isAdmin(c, runtime)) return c.redirect('/login');
    if (!sameOrigin(c)) return c.text('Forbidden', 403);
    const source = await runtime.store.getSource(c.req.param('id'));
    if (!source) return c.html(renderNotFound(VERSION), 404);
    await runtime.store.deleteSource(source.id);
    return c.redirect('/sources');
  });

  app.get('/api/ping', (c) => {
    return c.json({ ok: true, version: VERSION, service: 'radar' });
  });

  app.get('/api/sources/health', async (c) => {
    if (!await canRead(c, runtime)) return c.json({ error: 'unauthorized' }, 401);
    const health = await runtime.store.getSourceHealth();
    return c.json(
      health.map((item) => ({
        ...item,
        source: redactSource(item.source),
      })),
    );
  });

  app.get('/api/stats', async (c) => {
    if (!await canRead(c, runtime)) return c.json({ error: 'unauthorized' }, 401);
    return c.json(await runtime.store.getStats());
  });

  app.get('/api/sources', async (c) => {
    if (!await canRead(c, runtime)) return c.json({ error: 'unauthorized' }, 401);
    const sources = await runtime.store.listSources();
    return c.json(sources.map(redactSource));
  });

  app.post('/api/sources', async (c) => {
    if (!await isAdmin(c, runtime)) return c.json({ error: 'unauthorized' }, 401);
    const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return c.json({ error: 'invalid_json' }, 400);

    const kind = asString(body.kind) as SourceKind | undefined;
    if (!kind || !runtime.sources.get(kind)) {
      return c.json({ error: 'unknown_kind', available: runtime.sources.list().map((a) => a.kind) }, 400);
    }
    const title = asString(body.title);
    if (!title) return c.json({ error: 'title_required' }, 400);

    const config =
      body.config && typeof body.config === 'object' && !Array.isArray(body.config)
        ? (body.config as Record<string, unknown>)
        : {};
    const proxyError = invalidProxyUrl(config);
    if (proxyError) return c.json({ error: 'invalid_config', detail: proxyError }, 400);
    const created = await runtime.store.createSource({
      kind,
      title,
      config,
      enabled: body.enabled === false ? false : true,
    });
    return c.json(created, 201);
  });

  app.patch('/api/sources/:id', async (c) => {
    if (!await isAdmin(c, runtime)) return c.json({ error: 'unauthorized' }, 401);
    const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return c.json({ error: 'invalid_json' }, 400);
    const existing = await runtime.store.getSource(c.req.param('id'));
    if (!existing) return c.json({ error: 'not_found' }, 404);
    let config: Record<string, unknown> | undefined;
    if (body.config && typeof body.config === 'object' && !Array.isArray(body.config)) {
      config = { ...body.config as Record<string, unknown> };
      // A masked value round-tripped from the redacted list must never overwrite the real secret.
      for (const [key, value] of Object.entries(config)) {
        if (value === '***' && existing.config[key] !== undefined) {
          config[key] = existing.config[key];
        }
      }
      const proxyError = invalidProxyUrl(config);
      if (proxyError) return c.json({ error: 'invalid_config', detail: proxyError }, 400);
    }
    const updated = await runtime.store.updateSource(existing.id, {
      title: asString(body.title),
      enabled: typeof body.enabled === 'boolean' ? body.enabled : undefined,
      config,
    });
    if (!updated) return c.json({ error: 'not_found' }, 404);
    return c.json(redactSource(updated));
  });

  app.delete('/api/sources/:id', async (c) => {
    if (!await isAdmin(c, runtime)) return c.json({ error: 'unauthorized' }, 401);
    return (await runtime.store.deleteSource(c.req.param('id')))
      ? c.json({ ok: true })
      : c.json({ error: 'not_found' }, 404);
  });

  // Market estimate for the browser extension: aggregates only, over leads a guest may
  // already see, so it reveals nothing the public feed does not.
  app.get('/api/market', rateLimit({ windowMs: 60_000, max: 60 }), async (c) => {
    c.header('Access-Control-Allow-Origin', '*');
    if (!await canRead(c, runtime)) return c.json({ error: 'unauthorized' }, 401);
    const title = (c.req.query('title') ?? '').trim().slice(0, 300);
    if (title.length < 3) return c.json({ error: 'title_required' }, 400);
    const type: LeadType = c.req.query('type') === 'job' ? 'job' : 'gig';
    const skills = (c.req.query('skills') ?? '').split(',').map((s) => s.trim().slice(0, 40)).filter(Boolean).slice(0, 12);
    const now = new Date();
    const leads = await runtime.store.getLeadsForFeed({
      type,
      minBudgetUsd: 1,
      limit: 3000,
      createdAfter: new Date(now.getTime() - MARKET_WINDOW_MS).toISOString(),
      createdBefore: visibleBefore({ tier: 'guest' }, runtime.access, now),
    });
    c.header('Cache-Control', 'public, max-age=600');
    return c.json(estimateMarket({ title, type, skills }, leads));
  });

  app.get('/api/leads', feedLimit, async (c) => {
    if (!await canRead(c, runtime)) return c.json({ error: 'unauthorized' }, 401);
    const limit = Math.max(1, Math.min(Number(c.req.query('limit') ?? 50) || 50, 500));
    const status = c.req.query('status') as LeadStatus | undefined;
    const rawType = c.req.query('type')?.trim();
    const type: LeadType | undefined = rawType === 'job' || rawType === 'gig' ? rawType : undefined;
    const sourceId = c.req.query('source') || undefined;
    const query = c.req.query('q')?.trim() || undefined;
    // The viewer's tier (delay, contacts) applies to the API just like the UI.
    const viewer = await viewerFromRequest(c, runtime);
    const leads = await leadsFor(runtime, viewer, { limit, status, sourceId, query, type, ...filterOptions(parseFeedFilters(c)) });
    if (viewer.tier === 'admin') return c.json(leads);
    return c.json(leads.map((lead) => toPublicLead(projectContacts(lead, viewer))));
  });

  // Streamable HTTP without a server-sent stream: GET and DELETE answer 405, as the spec asks.
  app.on(['GET', 'DELETE'], '/mcp', (c) => c.body(null, 405, { allow: 'POST' }));

  app.post('/mcp', rateLimit({ windowMs: 60_000, max: 60 }), async (c) => {
    // MCP is a free machine interface over the same feed: same tier, same delay,
    // same contact rules as the HTTP API.
    if (!await canRead(c, runtime)) {
      return c.json({ jsonrpc: '2.0', id: null, error: { code: -32000, message: 'Unauthorized' } }, 401);
    }
    const body = await c.req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return c.json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }, 400);
    }
    const { handleMcpRequest } = await import('../mcp/server.ts');
    const viewer = await viewerFromRequest(c, runtime);
    const resp = await handleMcpRequest(body, {
      listLeads: async (options) => (await leadsFor(runtime, viewer, options)).map((lead) => projectContacts(lead, viewer)),
      getLead: async (id) => {
        const lead = await runtime.store.getLead(id);
        return lead && viewerCanSeeLead(viewer, lead, runtime.access) ? projectContacts(lead, viewer) : null;
      },
    });
    if (resp === null) return c.body(null, 202);
    return c.json(resp);
  });

  app.delete('/api/leads/:id', async (c) => {
    if (!await isAdmin(c, runtime)) return c.json({ error: 'unauthorized' }, 401);
    const id = c.req.param('id');
    const deleted = runtime.store.deleteLead ? await runtime.store.deleteLead(id) : false;
    if (!deleted) return c.json({ error: 'not_found' }, 404);
    return c.json({ ok: true, deleted: id });
  });

  app.get('/api/runs', async (c) => {
    if (!await canRead(c, runtime)) return c.json({ error: 'unauthorized' }, 401);
    return c.json(await runtime.store.listRuns(Number(c.req.query('limit') ?? 20) || 20));
  });

  app.post('/api/poll', async (c) => {
    if (!await isAdmin(c, runtime)) return c.json({ error: 'unauthorized' }, 401);
    const summaries = await pollAll({
      ...deps(runtime),
      sources: runtime.sources,
    });
    return c.json({ summaries });
  });

  app.post('/api/sources/:id/poll', async (c) => {
    if (!await isAdmin(c, runtime)) return c.json({ error: 'unauthorized' }, 401);
    const source = await runtime.store.getSource(c.req.param('id'));
    if (!source) return c.json({ error: 'not_found' }, 404);
    const summary = await pollSource(source, {
      ...deps(runtime),
      sources: runtime.sources,
    });
    return c.json(summary);
  });

  app.post('/api/ingest/:sourceId', rateLimit({ windowMs: 60_000, max: 120 }), async (c) => {
    const source = await runtime.store.getSource(c.req.param('sourceId') as string);
    if (!source) return c.json({ error: 'not_found' }, 404);

    const sourceToken =
      typeof source.config.token === 'string' ? source.config.token : undefined;
    const provided = c.req.header('x-radar-token');
    const allowed =
      (await isAdmin(c, runtime)) || Boolean(sourceToken && safeEqual(provided, sourceToken));
    if (!allowed) return c.json({ error: 'unauthorized' }, 401);

    const body = (await c.req.json().catch(() => null)) as
      | Record<string, unknown>
      | Array<Record<string, unknown>>
      | null;
    if (!body) return c.json({ error: 'invalid_json' }, 400);

    const items = Array.isArray(body)
      ? body
      : Array.isArray((body as Record<string, unknown>).items)
        ? ((body as Record<string, unknown>).items as Array<Record<string, unknown>>)
        : [body as Record<string, unknown>];

    if (items.length === 0) return c.json({ error: 'no_items' }, 400);
    if (items.length > 100) return c.json({ error: 'too_many_items' }, 400);

    const outcomes = [];
    for (const item of items) {
      const raw = toRawLead(item, source.id);
      if (!raw) {
        outcomes.push({ status: 'rejected', reasons: ['missing_text'] });
        continue;
      }
      outcomes.push(await ingestRawLead(raw, source, deps(runtime)));
    }
    return c.json({ sourceId: source.id, accepted: outcomes.length, outcomes });
  });

  // radar/2 observations (docs/PROTOCOL.md): JSON array, {"observations": [...]} or NDJSON.
  app.post('/api/v2/ingest/:sourceId', rateLimit({ windowMs: 60_000, max: 120 }), async (c) => {
    const source = await runtime.store.getSource(c.req.param('sourceId') as string);
    if (!source) return c.json({ error: 'not_found' }, 404);
    const sourceToken = typeof source.config.token === 'string' ? source.config.token : undefined;
    const provided = c.req.header('x-radar-token');
    const allowed = (await isAdmin(c, runtime)) || Boolean(sourceToken && safeEqual(provided, sourceToken));
    if (!allowed) return c.json({ error: 'unauthorized' }, 401);

    const length = Number(c.req.header('content-length') ?? 0);
    if (length > MAX_V2_INGEST_BYTES) return c.json({ error: 'payload_too_large' }, 413);
    const bodyText = await c.req.text();
    if (bodyText.length > MAX_V2_INGEST_BYTES) return c.json({ error: 'payload_too_large' }, 413);

    const items = parseObservationBody(bodyText, c.req.header('content-type'));
    if (!items) return c.json({ error: 'invalid_json' }, 400);
    if (items.length === 0) return c.json({ error: 'no_items' }, 400);
    if (items.length > MAX_V2_INGEST_ITEMS) return c.json({ error: 'too_many_items', max: MAX_V2_INGEST_ITEMS }, 400);

    const outcomes: Array<{ status: string; leadId?: string; reasons: string[] }> = [];
    for (const item of items) {
      const parsed = parseObservation(item);
      if (!parsed.ok || !parsed.observation) {
        outcomes.push({ status: 'rejected', reasons: [`invalid:${parsed.error}`] });
        continue;
      }
      const result = await ingestRawLead(observationToRawLead(parsed.observation, source.id), source, deps(runtime));
      outcomes.push({ status: result.status, leadId: result.lead?.id, reasons: result.reasons ?? [] });
    }
    const count = (status: string) => outcomes.filter((o) => o.status === status).length;
    const duplicate = count('duplicate');
    const rejected = count('rejected');
    return c.json({
      sourceId: source.id,
      received: items.length,
      accepted: outcomes.length - duplicate - rejected,
      duplicate,
      rejected,
      outcomes,
    });
  });

  app.post('/api/preview', rateLimit({ windowMs: 10 * 60_000, max: 30 }), async (c) => {
    if (!await canRead(c, runtime)) return c.json({ error: 'unauthorized' }, 401);
    const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
    const url = asString(body?.url);
    if (!url) return c.json({ error: 'url_required' }, 400);

    const valid = validateSubmissionUrl(url);
    if (!valid.valid) return c.json({ error: valid.error || 'invalid_url' }, 400);

    try {
      // fetchSafeHttp resolves DNS and blocks private/metadata IPs on every redirect hop
      const html = await fetchSafeHttp(url, {
        timeoutMs: 10_000,
        userAgent: runtime.env.RADAR_USER_AGENT,
        fetchImpl: runtime.fetchImpl,
      });
      const preview = extractPreviewFromHtml(html, url);
      return c.json({ ok: true, preview });
    } catch (err) {
      return c.json(
        { error: 'preview_failed', message: err instanceof Error ? err.message : String(err) },
        500,
      );
    }
  });

  // A lead added by a signed-in person: from the site (/api/submit) or the extension (/api/ext/submit).
  const submitForUser = async (
    user: UserRecord,
    body: Record<string, unknown>,
  ): Promise<{ status: 200 | 400; json: Record<string, unknown> }> => {

    const title = asString(body.title);
    const text = asString(body.text);
    if (!title && !text) return { status: 400, json: { error: 'title_or_text_required' } };

    const url = asString(body.url);
    const rawType = asString(body.type);
    const type: LeadType = rawType === 'job' || rawType === 'gig' ? rawType : 'gig';

    const sources = await runtime.store.listSources();
    let source =
      sources.find((s) => s.kind === 'webhook' && s.enabled) ??
      sources.find((s) => s.kind === 'webhook');
    if (!source) {
      source = await runtime.store.createSource({
        kind: 'webhook',
        title: 'Ручное добавление',
        config: {},
        enabled: true,
      });
    }

    const rawLead: RawLead = {
      sourceId: source.id,
      type,
      title: title ?? text ?? '',
      text: text ?? title ?? '',
      url,
      author: asString(body.author) || user.handle,
      category: asString(body.category),
      city: asString(body.city),
      budget: asNumber(body.budget),
      currency: asString(body.currency) ?? 'RUB',
      skills: Array.isArray(body.skills)
        ? (body.skills as string[]).map((s) => String(s).trim()).filter(Boolean)
        : typeof body.skills === 'string'
        ? (body.skills as string).split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean)
        : undefined,
      isRemote: typeof body.isRemote === 'boolean' ? body.isRemote : true,
      externalId: url ? `url:${url}` : `manual:${Date.now()}`,
      raw: body,
    };

    const outcome = await ingestRawLead(rawLead, source, deps(runtime));
    await creditWebUser(user.id, outcome);
    return {
      status: 200,
      json: {
        ok: outcome.status === 'inserted' || outcome.status === 'duplicate' || outcome.status === 'delivered',
        status: outcome.status,
        lead: outcome.lead,
        leadId: outcome.lead?.id,
        reasons: outcome.reasons,
      },
    };
  };

  app.post('/api/submit', rateLimit({ windowMs: 10 * 60_000, max: 30 }), async (c) => {
    const user = await currentUser(c, runtime);
    if (!user) return c.json({ error: 'login_required' }, 401);
    const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return c.json({ error: 'invalid_json' }, 400);
    const result = await submitForUser(user, body);
    return c.json(result.json, result.status);
  });

  // Browser extension sign-in. The extension opens /extension/connect with chrome.identity;
  // after GitHub sign-in and consent the token goes back to its chromiumapp.org redirect.
  // Either the chrome.identity window (chromiumapp.org) or, where that API is missing, the
  // extension's own connected.html opened in a tab. Both reach only the extension itself.
  const EXTENSION_REDIRECT_RE = /^(?:https:\/\/[a-p]{32}\.chromiumapp\.org\/[\w./-]*|chrome-extension:\/\/[a-p]{32}\/connected\.html)$/;
  const extensionUser = async (c: Context): Promise<{ user: UserRecord; hash: string } | null> => {
    const header = c.req.header('authorization') ?? '';
    const token = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
    if (!token.startsWith('ext_') || !runtime.store.getUserByExtensionToken) return null;
    const hash = createHash('sha256').update(token).digest('hex');
    const user = await runtime.store.getUserByExtensionToken(hash);
    return user ? { user, hash } : null;
  };
  const extensionCors = (c: Context): void => {
    c.header('Access-Control-Allow-Origin', '*');
    c.header('Access-Control-Allow-Headers', 'authorization, content-type');
    c.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  };

  app.get('/extension/connect', async (c) => {
    const redirectUri = c.req.query('redirect_uri') ?? '';
    if (!EXTENSION_REDIRECT_RE.test(redirectUri)) return c.text('Bad redirect_uri', 400);
    if (!githubOAuthConfigured(runtime) || !runtime.store.saveExtensionToken) return c.text('GitHub sign-in is not configured on this server', 501);
    const user = await currentUser(c, runtime);
    if (!user) {
      const back = `/extension/connect?redirect_uri=${encodeURIComponent(redirectUri)}`;
      return c.redirect(`/auth/github?returnTo=${encodeURIComponent(back)}`);
    }
    return c.html(renderExtensionConnectPage({ version: VERSION, lang: resolveLang(c), auth: await getAuthDisplay(c, runtime), handle: user.handle, redirectUri }));
  });

  app.post('/extension/connect', rateLimit({ windowMs: 10 * 60_000, max: 10 }), async (c) => {
    const user = await currentUser(c, runtime);
    if (!user || !runtime.store.saveExtensionToken) return c.redirect('/login');
    const form = await c.req.parseBody();
    const redirectUri = typeof form.redirect_uri === 'string' ? form.redirect_uri : '';
    if (!EXTENSION_REDIRECT_RE.test(redirectUri)) return c.text('Bad redirect_uri', 400);
    const token = `ext_${randomBytes(32).toString('hex')}`;
    await runtime.store.saveExtensionToken(createHash('sha256').update(token).digest('hex'), user.id);
    const fragment = new URLSearchParams({ token, handle: user.handle, base: publicBaseUrl(c, runtime) });
    return c.redirect(`${redirectUri}#${fragment.toString()}`);
  });

  app.options('/api/ext/*', (c) => {
    extensionCors(c);
    return c.body(null, 204);
  });

  // The extension compares this with its own version and offers the update.
  app.get('/api/ext/version', (c) => {
    extensionCors(c);
    c.header('cache-control', 'public, max-age=3600');
    return c.json({ version: extensionVersion || null, url: `${publicBaseUrl(c, runtime)}/extension` });
  });

  app.get('/api/ext/me', async (c) => {
    extensionCors(c);
    const auth = await extensionUser(c);
    if (!auth) return c.json({ error: 'unauthorized' }, 401);
    return c.json({ handle: auth.user.handle });
  });

  app.post('/api/ext/submit', rateLimit({ windowMs: 10 * 60_000, max: 60 }), async (c) => {
    extensionCors(c);
    const auth = await extensionUser(c);
    if (!auth) return c.json({ error: 'unauthorized' }, 401);
    const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return c.json({ error: 'invalid_json' }, 400);
    // Leads from the extension are signed by the connected GitHub account, whatever it sends.
    delete body.author;
    const result = await submitForUser(auth.user, body);
    return c.json(result.json, result.status);
  });

  app.delete('/api/ext/token', async (c) => {
    extensionCors(c);
    const auth = await extensionUser(c);
    if (auth) await runtime.store.deleteExtensionToken?.(auth.hash);
    return c.json({ ok: true });
  });

  const serveFeed = async (c: Context) => {
    if (!await canRead(c, runtime)) return c.text('Unauthorized', 401);
    const q = (c.req.query('q') ?? '').trim();
    const rawType = (c.req.query('type') ?? '').trim();
    const type: LeadType | undefined = rawType === 'job' || rawType === 'gig' ? rawType : undefined;
    const rawStatus = (c.req.query('status') ?? '').trim();
    const status = ['new', 'interesting', 'applied', 'in_work', 'delivered'].includes(rawStatus)
      ? (rawStatus as LeadStatus)
      : undefined;

    const leads = await feedFor(runtime, await viewerFromRequest(c, runtime), {
      limit: 50,
      query: q || undefined,
      type,
      status,
      ...filterOptions(parseFeedFilters(c)),
    });

    const baseUrl = publicBaseUrl(c, runtime);
    // Build the self URL from the proxy-aware baseUrl: c.req.url is the
    // internal http hop and would advertise http:// in atom:link.
    const feedPath = new URL(c.req.url).pathname + new URL(c.req.url).search;
    const feedUrl = `${baseUrl}${feedPath}`;
    const feedTitle = q ? `openradar — Поиск: ${q}` : 'openradar — Свежие заказы и вакансии';

    const xml = renderRssFeed({
      leads,
      title: feedTitle,
      baseUrl,
      feedUrl,
    });

    return c.text(xml, 200, {
      'content-type': 'application/rss+xml; charset=utf-8',
    });
  };

  app.get('/feed.rss', feedLimit, serveFeed);
  app.get('/feed.xml', serveFeed);
  app.get('/api/feed.rss', serveFeed);

  const seoBaseUrl = (c: Context): string => publicBaseUrl(c, runtime);

  // Yandex Webmaster ownership check: /yandex_<code>.html with the code in the body.
  if (analytics.yandexVerification) {
    const code = analytics.yandexVerification;
    app.get(`/yandex_${code}.html`, (c) =>
      c.html(`<html>
    <head>
        <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
    </head>
    <body>Verification: ${code}</body>
</html>
`),
    );
  }

  app.get('/robots.txt', (c) => {
    return c.text(renderRobotsTxt(seoBaseUrl(c)), 200, {
      'content-type': 'text/plain; charset=utf-8',
    });
  });

  app.get('/sitemap.xml', async (c) => {
    // Only what a guest may open: delayed, active, not rejected.
    const leads = runtime.env.RADAR_PUBLIC_READ ? await feedFor(runtime, { tier: 'guest' }, { limit: 1000 }) : [];
    const roles = runtime.env.RADAR_PUBLIC_READ
      ? ['/research/index', '/en/research', '/en/research/index', '/en/research/methodology', ...(await liveReport(runtime.store, new Date(), { useModel: runtime.env.RADAR_EXTRACT_APPLY })).report.jobs.roles.map((r) => `/research/roles/${r.slug}`)]
      : [];
    return c.text(renderSitemapXml(seoBaseUrl(c), leads, new Date(), roles), 200, {
      'content-type': 'application/xml; charset=utf-8',
    });
  });

  // Market research: the live report, frozen monthly reports, role pages, methodology and data.
  // A private node keeps its figures to itself: the section opens to whoever may read the feed.
  const researchGate = async (c: Context, next: () => Promise<void>): Promise<Response | void> => {
    if (!await canRead(c, runtime)) return c.redirect('/login?returnTo=/research');
    await next();
  };
  app.use('/research', researchGate);
  app.use('/research/*', researchGate);
  app.use('/en/research', researchGate);
  app.use('/en/research/*', researchGate);
  const researchSnapshots = async (): Promise<Array<{ period: string }>> => (await runtime.store.listResearchSnapshots?.()) ?? [];
  // Research pages with an English twin send English readers there.
  const toEnglish = (c: Context, path: string): Response | undefined =>
    resolveLang(c) === 'en' ? c.redirect(`/en${path}`) : undefined;
  app.get('/research', async (c) => {
    const english = toEnglish(c, '/research');
    if (english) return english;
    const { report } = await liveReport(runtime.store, new Date(), { useModel: runtime.env.RADAR_EXTRACT_APPLY });
    return c.html(renderReportPage({ report, baseUrl: seoBaseUrl(c), version: VERSION, snapshots: await researchSnapshots(), auth: await getAuthDisplay(c, runtime) }));
  });
  app.get('/research/index', async (c) => {
    const english = toEnglish(c, '/research/index');
    if (english) return english;
    const index = await openradarIndex(runtime.store, new Date(), { useModel: runtime.env.RADAR_EXTRACT_APPLY });
    return c.html(renderIndexPage({ index, baseUrl: seoBaseUrl(c), version: VERSION, auth: await getAuthDisplay(c, runtime) }));
  });
  app.get('/research/index.json', async (c) => {
    const index = await openradarIndex(runtime.store, new Date(), { useModel: runtime.env.RADAR_EXTRACT_APPLY });
    return c.json(index, 200, { 'access-control-allow-origin': '*' });
  });
  app.get('/research/index.csv', async (c) => {
    const index = await openradarIndex(runtime.store, new Date(), { useModel: runtime.env.RADAR_EXTRACT_APPLY });
    return c.body(indexCsv(index), 200, {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': 'attachment; filename="openradar-index.csv"',
      'access-control-allow-origin': '*',
    });
  });
  app.get('/en/research', async (c) => {
    const { report } = await liveReport(runtime.store, new Date(), { useModel: runtime.env.RADAR_EXTRACT_APPLY });
    return c.html(renderReportPageEn({ report, baseUrl: seoBaseUrl(c), version: VERSION, snapshots: await researchSnapshots(), auth: await getAuthDisplay(c, runtime) }));
  });
  app.get('/en/research/index', async (c) => {
    const index = await openradarIndex(runtime.store, new Date(), { useModel: runtime.env.RADAR_EXTRACT_APPLY });
    return c.html(renderIndexPageEn({ index, baseUrl: seoBaseUrl(c), version: VERSION, auth: await getAuthDisplay(c, runtime) }));
  });
  app.get('/en/research/methodology', async (c) => c.html(renderMethodologyPageEn({ baseUrl: seoBaseUrl(c), version: VERSION, auth: await getAuthDisplay(c, runtime) })));
  app.get('/en/research/:period{[0-9]{4}-[0-9]{2}}', async (c) => {
    const report = await monthSnapshot(runtime.store, c.req.param('period'));
    if (!report) return c.html(renderNotFound(VERSION), 404);
    return c.html(renderReportPageEn({ report, baseUrl: seoBaseUrl(c), version: VERSION, snapshots: await researchSnapshots(), auth: await getAuthDisplay(c, runtime) }));
  });
  app.get('/research/methodology', async (c) => toEnglish(c, '/research/methodology') ?? c.html(renderMethodologyPage({ baseUrl: seoBaseUrl(c), version: VERSION, auth: await getAuthDisplay(c, runtime) })));
  app.get('/research/report.json', async (c) => {
    const { report } = await liveReport(runtime.store, new Date(), { useModel: runtime.env.RADAR_EXTRACT_APPLY });
    return c.json(report, 200, { 'access-control-allow-origin': '*' });
  });
  app.get('/research/dataset.csv', async (c) => {
    const { records } = await liveReport(runtime.store, new Date(), { useModel: runtime.env.RADAR_EXTRACT_APPLY });
    return c.body(datasetCsv(records), 200, {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': 'attachment; filename="openradar-dataset.csv"',
      'access-control-allow-origin': '*',
    });
  });
  app.get('/research/roles/:slug', async (c) => {
    const { report } = await liveReport(runtime.store, new Date(), { useModel: runtime.env.RADAR_EXTRACT_APPLY });
    const detail = report.jobs.roles.find((r) => r.slug === c.req.param('slug'));
    if (!detail) return c.html(renderNotFound(VERSION), 404);
    return c.html(renderRolePage({ detail, report, baseUrl: seoBaseUrl(c), version: VERSION, auth: await getAuthDisplay(c, runtime) }));
  });
  app.get('/research/:period{[0-9]{4}-[0-9]{2}(\.json)?}', async (c) => {
    const param = c.req.param('period');
    const slug = param.slice(0, 7);
    const report = await monthSnapshot(runtime.store, slug);
    if (!report) return c.html(renderNotFound(VERSION), 404);
    if (param.endsWith('.json')) return c.json(report, 200, { 'access-control-allow-origin': '*' });
    const english = toEnglish(c, `/research/${slug}`);
    if (english) return english;
    return c.html(renderReportPage({ report, baseUrl: seoBaseUrl(c), version: VERSION, snapshots: await researchSnapshots(), auth: await getAuthDisplay(c, runtime) }));
  });

  app.get('/llms.txt', (c) =>
    c.text(renderLlmsTxt(seoBaseUrl(c)), 200, { 'content-type': 'text/plain; charset=utf-8' }),
  );
  app.get('/about', async (c) => c.html(renderAboutPage({ baseUrl: seoBaseUrl(c), version: VERSION, auth: await getAuthDisplay(c, runtime), lang: resolveLang(c) })));
  app.get('/faq', async (c) => c.html(renderFaqPage({ baseUrl: seoBaseUrl(c), version: VERSION, auth: await getAuthDisplay(c, runtime), lang: resolveLang(c) })));
  app.get('/catalog', async (c) => c.html(renderCatalogIndex({ baseUrl: seoBaseUrl(c), version: VERSION, auth: await getAuthDisplay(c, runtime), lang: resolveLang(c) })));

  // Search-driven landing pages: indexable, each one doubles as an RSS subscription.
  app.get('/catalog/:slug', async (c) => {
    const entry = findCatalogEntry(c.req.param('slug') as string);
    if (!entry) return c.html(renderNotFound(VERSION), 404);

    const leads = (await feedFor(runtime, await viewerFromRequest(c, runtime), {
      limit: 30,
      query: entry.q,
      type: entry.type,
    })).filter((lead) => lead.status !== 'rejected' && lead.status !== 'failed').slice(0, 20);

    return c.html(
      renderCatalogPage({
        entry,
        leads: await canRead(c, runtime) ? leads : [],
        baseUrl: seoBaseUrl(c),
        version: VERSION,
        auth: await getAuthDisplay(c, runtime),
        lang: resolveLang(c),
      }),
    );
  });

  app.get('/api/delta', feedLimit, async (c) => {
    if (!await canRead(c, runtime)) return c.json({ error: 'unauthorized' }, 401);
    const sinceParam = c.req.query('since');
    const since = sinceParam && Number.isFinite(Date.parse(sinceParam))
      ? new Date(sinceParam).toISOString()
      : new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const limit = Math.max(1, Math.min(Number(c.req.query('limit') ?? 200) || 200, 1000));
    const leads = await feedFor(runtime, await viewerFromRequest(c, runtime), { limit, createdAfter: since });
    const delta = leads
      .map((lead) => ({
        id: lead.id,
        type: lead.type,
        title: lead.title,
        text: lead.text.slice(0, 1500),
        url: lead.url,
        budget: lead.budget,
        currency: lead.currency,
        paymentPeriod: lead.paymentPeriod,
        normalizedUsdMin: lead.normalizedUsdMin,
        normalizedUsdMax: lead.normalizedUsdMax,
        city: lead.city,
        skills: lead.skills,
        isRemote: lead.isRemote,
        score: lead.score,
        status: lead.status,
        votes: {
          up: lead.votes_up ?? 0,
          down: lead.votes_down ?? 0,
          scam: lead.votes_scam ?? 0,
          closed: lead.votes_closed ?? 0,
        },
        createdAt: lead.createdAt,
      }));

    if (c.req.query('format') === 'ndjson' || c.req.header('accept')?.includes('application/x-ndjson')) {
      const ndjson = delta.map((item) => JSON.stringify(item)).join('\n');
      return c.text(ndjson, 200, { 'content-type': 'application/x-ndjson; charset=utf-8' });
    }

    return c.json({
      since,
      count: delta.length,
      items: delta,
    });
  });

  return app;
}

const MAX_V2_INGEST_ITEMS = 500;
const MAX_V2_INGEST_BYTES = 10 * 1024 * 1024;
const MAX_BATCH_BODY_BYTES = MAX_V2_INGEST_BYTES;
const MAX_BODY_BYTES = 1024 * 1024;

/** Observations from a JSON array, `{observations: [...]}`, a single object, or NDJSON. */
export function parseObservationBody(body: string, contentType?: string): unknown[] | null {
  const trimmed = body.trim();
  if (!trimmed) return [];
  const ndjson = (contentType ?? '').includes('ndjson');
  if (!ndjson) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (Array.isArray(parsed)) return parsed;
      if (parsed && typeof parsed === 'object') {
        const list = (parsed as Record<string, unknown>).observations;
        return Array.isArray(list) ? list : [parsed];
      }
      return null;
    } catch {
      // fall through: a body of several JSON lines is NDJSON even without the header
    }
  }
  const out: unknown[] = [];
  for (const line of trimmed.split('\n')) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line));
    } catch {
      return null;
    }
  }
  return out;
}
