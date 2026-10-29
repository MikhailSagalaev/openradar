import { createHash } from 'node:crypto';
import type { AccessKind, Contact, Lead, LeadVoteSignal, RunRecord, SourceHealth, SourceRecord, Stats } from '../core/types.ts';
import { escapeHtml, firstLine, jsonForScript } from '../core/text.ts';
import { type SupportedLang, getTranslations } from './i18n.ts';
import { renderLogo } from './logo.ts';
import { type AnalyticsConfig, analyticsBody, analyticsHead } from './analytics.ts';
import { formatLeadText } from './format.ts';
import { BUDGET_STEPS_RUB, type FeedFilters, hasActiveFilters } from './filters.ts';
import { SEO_CATALOG } from './seo.ts';
import type { SourcePreset } from '../sources/presets.ts';

export interface AuthDisplay {
  /** GitHub handle when the session belongs to a registered user. */
  handle?: string;
  isAdmin?: boolean;
}

export interface LeadsPageData {
  stats: Stats;
  health: SourceHealth[];
  leads: Lead[];
  query: string;
  status: string;
  type?: string;
  version: string;
  auth?: AuthDisplay;
  lang?: SupportedLang;
  /** Feed delay for this viewer in minutes (hub mode); 0 = real time. */
  delayMinutes?: number;
  /** Operator view: pipeline statuses and their filters. Everyone else sees the public feed. */
  isAdmin?: boolean;
  /** GitHub sign-in is configured: the guest intro links to it. */
  githubEnabled?: boolean;
  filters?: FeedFilters;
  /** Most frequent skills of the last week, for search suggestions. */
  popularSkills?: Array<{ name: string; count: number }>;
  /** No lead matched the whole query; these match some of its words. */
  partialMatch?: boolean;
  /** 1-based page of the feed and whether another page follows. */
  page?: number;
  hasMore?: boolean;
}

export interface SourcesPageData {
  health: SourceHealth[];
  version: string;
  auth?: AuthDisplay;
  lang?: SupportedLang;
  isAdmin?: boolean;
}

export interface SourceCatalogPageData {
  items: Array<{ preset: SourcePreset; sourceId?: string; enabled?: boolean }>;
  version: string;
  auth?: AuthDisplay;
  lang?: SupportedLang;
}

export interface SourcePageData {
  source: SourceRecord;
  health: SourceHealth;
  leads: Lead[];
  runs: RunRecord[];
  version: string;
  notice?: string;
  auth?: AuthDisplay;
  lang?: SupportedLang;
  isAdmin?: boolean;
}

export interface LeadPageData {
  lead: Lead;
  source?: SourceRecord;
  version: string;
  auth?: AuthDisplay;
  lang?: SupportedLang;
  myVote?: LeadVoteSignal | null;
  /** The viewer is a guest: contacts were removed from the lead. */
  contactsHidden?: boolean;
  /** A few leads like this one, already filtered for the viewer. */
  similar?: Lead[];
  /** Older than the feed keeps leads of its type. */
  expired?: boolean;
}

export interface SourceFormValues {
  kind: string;
  title: string;
  url: string;
  channel: string;
  categoryId: string;
  city: string;
  includeKeywords: string;
  excludeKeywords: string;
  minBudget: string;
  limit: string;
  host: string;
  port: string;
  user: string;
  passwordEnv: string;
  mailbox: string;
  sinceDays: string;
  subjectIncludes: string;
  chats: string;
  folder: string;
  sessionEnv: string;
  /** Search query: hh.ru, Работа России, RemoteOK tag. */
  query: string;
  /** hh.ru region id. */
  area: string;
  /** Remotive category. */
  remotiveCategory: string;
  /** ATS: greenhouse, lever or ashby. */
  provider: string;
  /** ATS: company slugs, "slug" or "slug=Name". */
  companies: string;
  /** Sitemap: regex that picks vacancy pages. */
  pattern: string;
  /** Send leads of this source to the hub. */
  share?: boolean;
}

export interface NewSourcePageData {
  version: string;
  kinds: string[];
  values: SourceFormValues;
  mode: 'create' | 'edit';
  action: string;
  submitLabel: string;
  sourceId?: string;
  error?: string;
  auth?: AuthDisplay;
  lang?: SupportedLang;
}

export interface CreatedSourcePageData {
  version: string;
  source: SourceRecord;
  token: string;
  lang?: SupportedLang;
}

export interface ExtensionPageData {
  version: string;
  /** Version of the extension this server hands out (extension/manifest.json). */
  extensionVersion?: string;
  webhookSources: SourceRecord[];
  auth?: AuthDisplay;
  lang?: SupportedLang;
  isAuthed?: boolean;
}

const REPO_URL = 'https://github.com/MikhailSagalaev/openradar';

const KIND_LABELS: Record<string, string> = {
  rss: 'RSS / Atom',
  telegram: 'Telegram',
  'telegram-account': 'Telegram (свой аккаунт)',
  kwork: 'Kwork',
  imap: 'IMAP',
  webhook: 'Webhook',
  trudvsem: 'Работа России',
  hh: 'HeadHunter',
  remoteok: 'RemoteOK',
  remotive: 'Remotive',
  arbeitnow: 'Arbeitnow',
  hn: 'Hacker News — Who is hiring',
  ats: 'Карьерные страницы компаний',
  sitemap: 'Карта сайта (JobPosting)',
};

/**
 * How each source type reaches its posts, as its adapter declares `access` in src/sources.
 * A static copy so the page renderer does not pull in every adapter; a test keeps it in step.
 */
export const KIND_ACCESS: Record<string, AccessKind> = {
  rss: 'official',
  telegram: 'public',
  'telegram-account': 'user-provided',
  kwork: 'public',
  imap: 'user-provided',
  webhook: 'user-provided',
  trudvsem: 'official',
  hh: 'official',
  remoteok: 'official',
  remotive: 'official',
  arbeitnow: 'official',
  hn: 'official',
  ats: 'official',
  sitemap: 'public',
};

/** A webhook counts as a direct channel only when the operator trusts it this much. */
const DIRECT_WEBHOOK_TRUST = 8;

/**
 * «Прямой заказчик»: the post comes from the one who hires, not from a reposter.
 * Boards and APIs publish what the employer filed there; the operator's own mailbox and
 * Telegram account are channels they picked. Scraped public pages repost anyone, and a
 * webhook takes whatever is sent to it unless the operator marked it trusted.
 * No source (similar-lead lists) means no claim.
 */
export function isDirectEmployerSource(source?: Pick<SourceRecord, 'kind' | 'config'>): boolean {
  if (!source) return false;
  if (source.kind === 'webhook') return Number(source.config?.trust ?? 0) >= DIRECT_WEBHOOK_TRUST;
  const access = KIND_ACCESS[source.kind];
  return access === 'official' || access === 'user-provided';
}

export type ScoreBand = 'strong' | 'good' | 'weak' | 'noise';

/** The word beside a score: 80+ strong, 60–79 good, 40–59 weak, below 40 noise. */
export function scoreBand(score: number): ScoreBand {
  if (score >= 80) return 'strong';
  if (score >= 60) return 'good';
  if (score >= 40) return 'weak';
  return 'noise';
}

function scoreWithBand(score: number, lang: SupportedLang): string {
  const t = getTranslations(lang);
  const band = scoreBand(score);
  const label = { strong: t.bandStrong, good: t.bandGood, weak: t.bandWeak, noise: t.bandNoise }[band];
  return `<span class="score-wrap"><span class="score" title="${escapeHtml(t.scoreHint)}">${score}</span><span class="band band-${band}">${escapeHtml(label)}</span></span>`;
}

/** What each source type is for, one line on its card in the type picker. */
const KIND_HINTS: Record<string, string> = {
  rss: 'Лента RSS или Atom: биржа, блог, поиск hh.ru или Хабр Карьеры',
  telegram: 'Публичный канал, читается без аккаунта',
  'telegram-account': 'Закрытые каналы и группы через ваш аккаунт',
  imap: 'Почтовый ящик с рассылками заказов',
  webhook: 'Приём от расширения, скрипта или другого узла',
  kwork: 'Заказы Kwork, все или одной рубрики',
  hh: 'Вакансии hh.ru по поисковому запросу',
  trudvsem: 'Открытый API портала «Работа России»',
  remoteok: 'Удалённые вакансии RemoteOK',
  remotive: 'Удалённые вакансии Remotive',
  arbeitnow: 'Вакансии Германии и ЕС',
  hn: 'Ежемесячный тред «Who is hiring?»',
  ats: 'Компании на Greenhouse, Lever или Ashby',
  sitemap: 'Страницы вакансий с разметкой JobPosting',
};
const KIND_GROUPS: Array<{ title: string; kinds: string[] }> = [
  { title: 'Ленты и каналы', kinds: ['rss', 'telegram', 'telegram-account', 'imap', 'webhook'] },
  { title: 'Биржи и сайты вакансий', kinds: ['kwork', 'hh', 'trudvsem', 'remoteok', 'remotive', 'arbeitnow', 'hn'] },
  { title: 'Сайты компаний', kinds: ['ats', 'sitemap'] },
];

const STATUS_LABELS: Record<string, string> = {
  new: 'новый',
  interesting: 'интересно',
  applied: 'откликнулся',
  in_work: 'в работе',
  delivered: 'доставлен',
  rejected: 'отклонён',
  failed: 'ошибка',
};

const STYLE = `
:root {
  --bg: #ffffff;
  --surface: #fafafa;
  --surface-hover: #f4f4f5;
  --ink: #09090b;
  --muted: #71717a;
  --line: #e4e4e7;
  --line-strong: #d4d4d8;
  --soft: #f4f4f5;
  --emerald: #10b981;
  --rose: #ef4444;
  --amber: #f59e0b;
  /* Score band pills: a pale fill with dark text, at least 7:1 */
  --emerald-soft: #d1fae5;
  --emerald-ink: #065f46;
  --blue-soft: #dbeafe;
  --blue-ink: #1e40af;
  --amber-soft: #fef3c7;
  --amber-ink: #92400e;
  --neutral-soft: #f4f4f5;
  --neutral-ink: #52525b;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #09090b;
    --surface: #121215;
    --surface-hover: #1c1c22;
    --ink: #f4f4f5;
    --muted: #a1a1aa;
    --line: #27272a;
    --line-strong: #3f3f46;
    --soft: #18181b;
    --emerald: #34d399;
    --rose: #f87171;
    --amber: #fbbf24;
    --emerald-soft: #052e22;
    --emerald-ink: #6ee7b7;
    --blue-soft: #172554;
    --blue-ink: #93c5fd;
    --amber-soft: #451a03;
    --amber-ink: #fcd34d;
    --neutral-soft: #27272a;
    --neutral-ink: #d4d4d8;
  }
}
* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; color-scheme: light dark; }
body {
  margin: 0;
  background: var(--bg);
  color: var(--ink);
  font: 14px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PT Sans", "Noto Sans", "DejaVu Sans", "Helvetica Neue", Arial, sans-serif;
  letter-spacing: -0.01em;
  -webkit-font-smoothing: antialiased;
  font-variant-numeric: tabular-nums;
}
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(3px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes pulse-dot {
  0% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.45); }
  70% { box-shadow: 0 0 0 5px rgba(16, 185, 129, 0); }
  100% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
}
main {
  max-width: 1040px;
  margin: 0 auto;
  padding: 0 24px 80px;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  animation: fadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}
.top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 18px 0;
  margin-bottom: 20px;
}
.top-brand-group {
  display: inline-flex;
  align-items: center;
  gap: 10px;
}
.brand {
  text-decoration: none;
  color: var(--ink);
  display: inline-flex;
  align-items: center;
  gap: 6px;
  transition: opacity 0.15s ease;
}
.brand:hover { opacity: 0.8; }
.brand-logo-svg {
  height: 24px;
  width: auto;
  display: block;
}
}
.source-error-tooltip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  color: #ef4444;
  background: rgba(239, 68, 68, 0.08);
  border: 1px solid rgba(239, 68, 68, 0.25);
  border-radius: 3px;
  padding: 2px 6px;
  margin-top: 4px;
  cursor: help;
  max-width: 100%;
}
.source-error-tooltip .info-icon {
  font-weight: 700;
  border: 1px solid currentColor;
  border-radius: 50%;
  width: 12px;
  height: 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 9px;
  line-height: 1;
}
.nav { display: flex; gap: 20px; margin-left: 12px; align-items: center; }
.nav a {
  font-size: 13.5px;
  font-weight: 500;
  color: var(--muted);
  text-decoration: none;
  padding: 1px 0 2px;
  border-bottom: 2px solid transparent;
  transition: color 0.15s ease, border-color 0.15s ease;
}
.nav a:hover { color: var(--ink); text-decoration: none; }
.nav a.active { color: var(--ink); border-color: var(--ink); }
.actions { margin-left: auto; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.auth-handle { font-size: 12.5px; font-weight: 600; color: var(--ink); }
.user-menu-wrap {
  position: relative;
  display: inline-flex;
  align-items: center;
}
.user-pill {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 5px 14px 5px 6px;
  background: var(--surface);
  border: 1px solid var(--line-strong);
  border-radius: 9999px;
  color: var(--ink);
  cursor: pointer;
  font: inherit;
  font-size: 12.5px;
  font-weight: 500;
  transition: background 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
}
.user-pill:hover, .user-pill[aria-expanded="true"] {
  border-color: var(--ink);
  background: var(--bg);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.05);
}
.user-avatar-badge {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--ink);
  color: var(--bg);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
}
.user-handle-text {
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.chevron-svg {
  color: var(--muted);
  transition: transform 0.15s ease;
}
.user-pill[aria-expanded="true"] .chevron-svg {
  transform: rotate(180deg);
}
.user-menu-dropdown {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  min-width: 220px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 6px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.12);
  z-index: 100;
}
.user-menu-info {
  padding: 8px 10px;
}
.user-menu-name {
  font-weight: 600;
  font-size: 13px;
  color: var(--ink);
}
.user-menu-role {
  font-size: 11px;
  color: var(--muted);
  margin-top: 2px;
}
.user-menu-sep {
  height: 1px;
  background: var(--line);
  margin: 4px 0;
}
.user-menu-link {
  display: block;
  padding: 7px 10px;
  border-radius: 5px;
  font-size: 12.5px;
  color: var(--ink);
  text-decoration: none;
  transition: background 0.1s ease;
}
.user-menu-link:hover {
  background: var(--surface-hover);
  text-decoration: none;
}
.user-menu-link.danger {
  color: #ef4444;
}
.user-menu-link.danger:hover {
  background: rgba(239, 68, 68, 0.08);
}
.auth-signin-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 16px;
  border-radius: 9999px;
  font-size: 12.5px;
  font-weight: 500;
}
.page-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 24px;
}
h1 {
  font-size: 26px;
  line-height: 1.2;
  letter-spacing: -0.03em;
  margin: 0 0 4px;
  font-weight: 600;
}
h2 {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--muted);
  margin: 0 0 10px;
  font-weight: 600;
}
p { margin: 0; }
a { color: var(--ink); text-decoration: none; transition: color 0.15s ease; }
a:hover { text-decoration: underline; }
.muted { color: var(--muted); }
.small { font-size: 12px; }
.filters {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin: 0 0 20px;
  min-width: 0;
}
.metrics { display: flex; flex-wrap: wrap; gap: 32px; margin: 0 0 32px; }
.metric b {
  display: block;
  font-size: 24px;
  line-height: 1.15;
  letter-spacing: -0.03em;
  font-weight: 700;
}
.metric span { font-size: 12px; color: var(--muted); margin-top: 2px; display: block; }
.inline { display: inline; }
.chips { display: flex; gap: 14px; flex-wrap: wrap; min-width: 0; align-items: center; }
.chip {
  font-size: 12px;
  font-weight: 500;
  border: none;
  border-radius: 0;
  padding: 2px 0;
  text-decoration: none;
  color: var(--muted);
  background: transparent;
  white-space: nowrap;
  transition: color 0.15s ease;
}
.chip:hover {
  color: var(--ink);
  text-decoration: underline;
  text-underline-offset: 3px;
  background: transparent;
}
.chip:active { transform: none; }
.chip.active {
  background: transparent;
  color: var(--ink);
  border: none;
  font-weight: 600;
  text-decoration: underline;
  text-underline-offset: 3px;
  box-shadow: none;
}
.search { display: flex; gap: 6px; margin-left: auto; }
.search input {
  width: 200px;
  min-width: 0;
  padding: 6px 10px;
  border: 1px solid var(--line);
  border-radius: 6px;
  font: inherit;
  font-size: 12.5px;
  background: var(--bg);
  color: var(--ink);
  transition: all 0.15s ease;
}
.search input:focus {
  outline: 0;
  border-color: var(--ink);
  box-shadow: 0 0 0 1px var(--ink), 0 1px 2px rgba(0, 0, 0, 0.04);
}
.search button { flex: 0 0 auto; }
@keyframes rowEntrance {
  from {
    opacity: 0;
    transform: translateY(-8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
@keyframes skeletonShimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
.skeleton {
  background: linear-gradient(90deg, var(--line) 25%, var(--surface-hover) 50%, var(--line) 75%);
  background-size: 200% 100%;
  animation: skeletonShimmer 1.5s ease-in-out infinite;
  border-radius: 4px;
}
dialog[open] {
  animation: modalEntrance 0.18s cubic-bezier(0.16, 1, 0.3, 1);
}
@keyframes modalEntrance {
  from {
    opacity: 0;
    transform: scale(0.97) translateY(-6px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}
dialog::backdrop {
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(2px);
}
.list { border-top: 1px solid var(--line); }
.row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 20px;
  padding: 16px 0;
  border-bottom: 1px solid var(--line);
  text-decoration: none;
  color: inherit;
  transition: opacity 0.15s ease, transform 0.15s ease;
  animation: rowEntrance 0.3s cubic-bezier(0.16, 1, 0.3, 1) both;
}
.row:nth-child(1) { animation-delay: 0.02s; }
.row:nth-child(2) { animation-delay: 0.04s; }
.row:nth-child(3) { animation-delay: 0.06s; }
.row:nth-child(4) { animation-delay: 0.08s; }
.row:nth-child(5) { animation-delay: 0.10s; }
.row:nth-child(6) { animation-delay: 0.12s; }
.row:nth-child(7) { animation-delay: 0.14s; }
.row:nth-child(8) { animation-delay: 0.16s; }
.row:nth-child(9) { animation-delay: 0.18s; }
.row:nth-child(10) { animation-delay: 0.20s; }
.row:nth-child(n+11) { animation-delay: 0.22s; }
.row:hover {
  text-decoration: none;
  opacity: 0.72;
}
.row:hover .row-title { text-decoration: underline; }
.row-title {
  font-weight: 600;
  font-size: 14.5px;
  line-height: 1.35;
  letter-spacing: -0.015em;
}
.row-meta {
  color: var(--muted);
  font-size: 12px;
  margin-top: 3px;
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.row-side {
  display: flex;
  align-items: center;
  gap: 14px;
  font-size: 12px;
  color: var(--muted);
  white-space: nowrap;
}
.score {
  font-weight: 700;
  color: var(--ink);
  font-size: 13.5px;
  font-variant-numeric: tabular-nums;
}
.score-wrap { display: inline-flex; align-items: center; gap: 6px; }
.band {
  display: inline-block;
  padding: 1px 7px;
  border-radius: 9999px;
  font-size: 11px;
  font-weight: 600;
  line-height: 1.5;
  letter-spacing: 0;
  white-space: nowrap;
}
.band-strong { background: var(--emerald-soft); color: var(--emerald-ink); }
.band-good { background: var(--blue-soft); color: var(--blue-ink); }
.band-weak { background: var(--amber-soft); color: var(--amber-ink); }
.band-noise { background: var(--neutral-soft); color: var(--neutral-ink); }
.dot {
  display: inline-block;
  width: 6.5px;
  height: 6.5px;
  border-radius: 50%;
  margin-right: 6px;
  vertical-align: 1px;
  background: #a1a1aa;
}
.dot.ok {
  background: var(--emerald);
  animation: pulse-dot 2.4s infinite cubic-bezier(0.45, 0, 0.55, 1);
}
.dot.err {
  background: var(--rose);
  box-shadow: 0 0 0 2px rgba(239, 68, 68, 0.2);
}
.dot.warn { background: var(--amber); }
.dot.info { background: #3b82f6; }
.search-hero {
  margin: 12px 0 24px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.search-form {
  width: 100%;
}
.search-bar {
  display: flex;
  align-items: center;
  position: relative;
  width: 100%;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 9999px;
  padding: 5px 6px 5px 8px;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.search-bar:focus-within {
  border-color: var(--ink);
  box-shadow: 0 0 0 1px var(--ink), 0 2px 6px rgba(0, 0, 0, 0.05);
}
.search-input-wrap {
  position: relative;
  flex: 1 1 auto;
  display: flex;
  align-items: center;
}
.search-input-wrap input {
  width: 100%;
  padding: 8px 36px 8px 36px;
  border: none;
  border-radius: 9999px;
  font: inherit;
  font-size: 13.5px;
  background: transparent;
  color: var(--ink);
  outline: none;
}
.search-icon-svg {
  position: absolute;
  left: 10px;
  color: var(--muted);
  pointer-events: none;
}
.search-kbd {
  position: absolute;
  right: 8px;
  font-family: inherit;
  font-size: 11px;
  font-weight: 500;
  color: var(--muted);
  background: var(--bg);
  border: 1px solid var(--line);
  border-radius: 9999px;
  padding: 1px 7px;
  pointer-events: none;
  line-height: 1.4;
}
.search-clear-btn {
  position: absolute;
  right: 6px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  color: var(--muted);
  text-decoration: none;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s ease;
}
.search-clear-btn:hover {
  color: var(--ink);
  background: var(--surface-hover);
  text-decoration: none;
}
.search-actions-inside {
  display: flex;
  align-items: center;
  gap: 6px;
  padding-right: 2px;
}
.search-btn-inside {
  padding: 6px 16px;
  font-size: 12.5px;
  border-radius: 9999px;
  white-space: nowrap;
}
.search-rss-inside {
  padding: 6px 14px;
  font-size: 12px;
  border-radius: 9999px;
  white-space: nowrap;
}
.search-meta-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12.5px;
  padding: 6px 2px 2px;
  color: var(--muted);
}
.search-meta-bar strong {
  color: var(--ink);
}
.search-meta-clear {
  color: var(--muted);
  font-size: 12px;
  text-decoration: underline;
  margin-left: auto;
}
.search-meta-clear:hover {
  color: var(--ink);
}
.search-suggestions {
  display: none;
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  right: 0;
  background: var(--bg);
  border: 1px solid var(--line);
  border-radius: 16px;
  padding: 12px 14px;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.12);
  z-index: 90;
}
.search-suggestions.active {
  display: block;
}
.suggestions-header {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--muted);
  margin-bottom: 8px;
  padding: 0 4px;
}
.suggestions-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.suggestions-group + .suggestions-group { margin-top: 12px; }
.sug-count { color: var(--muted); font-size: 11px; }
.sug-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 5px 12px;
  background: var(--surface);
  border: 1px solid var(--line-strong);
  border-radius: 9999px;
  font-size: 12px;
  color: var(--ink);
  text-decoration: none;
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease;
}
.sug-chip:hover {
  background: var(--bg);
  border-color: var(--ink);
  text-decoration: none;
}
.funnel-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 16px;
  padding: 14px 0;
  border-top: 1px solid var(--line);
  border-bottom: 1px solid var(--line);
  background: transparent;
  margin-bottom: 28px;
}
.funnel-btn {
  background: transparent;
  border: 1px solid var(--line-strong);
  border-radius: 9999px;
  padding: 5px 14px;
  font-size: 12px;
  font-weight: 500;
  color: var(--muted);
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
}
.funnel-btn:hover {
  color: var(--ink);
  border-color: var(--ink);
}
.funnel-btn.active {
  background: var(--surface);
  color: var(--ink);
  border-color: var(--ink);
  font-weight: 600;
}
.type-tabs {
  display: flex;
  gap: 20px;
  align-items: center;
  width: 100%;
  margin-bottom: 2px;
}
.type-tab {
  font-size: 13.5px;
  font-weight: 500;
  color: var(--muted);
  text-decoration: none;
  padding: 4px 0;
  transition: color 0.15s ease;
}
.type-tab:hover {
  color: var(--ink);
  text-decoration: underline;
  text-underline-offset: 4px;
}
.mesh-lag-notice {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  background: var(--bg);
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 10px 16px;
  margin: 0;
  font-size: 13px;
  color: var(--muted);
}
.mesh-lag-notice strong {
  color: var(--ink);
}
.type-tab.active {
  color: var(--ink);
  font-weight: 600;
  text-decoration: underline;
  text-underline-offset: 4px;
}
.community-votes {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}
.vote-btn {
  background: transparent;
  border: 1px solid var(--line-strong);
  border-radius: 9999px;
  padding: 5px 14px;
  font: inherit;
  font-size: 12px;
  font-weight: 500;
  color: var(--ink);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  transition: background 0.15s ease, border-color 0.15s ease;
}
.vote-btn:hover {
  background: var(--bg);
  border-color: var(--ink);
}
.vote-btn:active {
  transform: scale(0.97);
}
.vote-btn .vote-count {
  font-variant-numeric: tabular-nums;
  color: var(--muted);
  font-size: 11px;
}
.vote-btn-danger:hover {
  border-color: var(--rose);
  color: var(--rose);
}
.vote-btn.active {
  background: var(--ink);
  color: var(--bg);
  border-color: var(--ink);
}
.vote-btn.active .vote-count {
  color: var(--bg);
  opacity: 0.85;
}
.vote-btn-danger.active {
  background: #dc2626;
  color: #fff;
  border-color: #dc2626;
}
.vote-btn-danger.active .vote-count {
  color: #fff;
  opacity: 0.85;
}
.feed-title {
  font-size: 22px;
  font-weight: 700;
  letter-spacing: -0.01em;
  line-height: 1.25;
  margin: 0;
}
.intro {
  position: relative;
  display: grid;
  gap: 12px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--surface);
  padding: 16px 18px;
  margin-bottom: 8px;
}
.intro p {
  margin: 0;
  padding-right: 56px;
  max-width: 720px;
  font-size: 13.5px;
  line-height: 1.55;
  color: var(--muted);
}
.intro-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.intro-action {
  display: inline-flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 12px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--bg);
  color: var(--ink);
  font-size: 13px;
  font-weight: 600;
  text-decoration: none;
}
.intro-action:hover { border-color: var(--line-strong); background: var(--surface-hover); }
.intro-action span { font-size: 12px; font-weight: 400; color: var(--muted); }
.intro-action.primary { background: var(--ink); border-color: var(--ink); color: var(--bg); }
.intro-action.primary span { color: inherit; opacity: 0.75; }
.intro-close {
  position: absolute;
  top: 12px;
  right: 14px;
  background: none;
  border: none;
  padding: 0;
  font: inherit;
  font-size: 12px;
  color: var(--muted);
  cursor: pointer;
}
.intro-close:hover { color: var(--ink); }
.score-legend { margin: 0; font-size: 12px; color: var(--muted); }
.feed-meta { margin: 0; font-size: 13px; color: var(--muted); }
.feed-meta strong { color: var(--ink); }
.feed-meta a { color: var(--muted); text-decoration: underline; text-underline-offset: 3px; }
.score-help { font-size: 12px; color: var(--muted); }
.score-help summary { cursor: pointer; width: max-content; }
.score-help p { margin: 6px 0 0; max-width: 720px; }
.profile { max-width: 760px; display: grid; gap: 14px; }
.profile h2 { font-size: 15px; margin: 10px 0 0; }
.profile-tier { font-size: 15px; margin: 0; }
.profile-steps { margin: 0; padding-left: 20px; display: grid; gap: 6px; font-size: 13.5px; }
.tier-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.tier-table th, .tier-table td { text-align: left; padding: 8px 10px; border-bottom: 1px solid var(--line); }
.tier-table th { color: var(--muted); font-weight: 500; }
.tier-table tr.current td { font-weight: 600; background: var(--surface); }
.sources-intro { max-width: 720px; margin: 0 0 18px; color: var(--muted); font-size: 13.5px; line-height: 1.6; }
.source-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; }
.source-card { border: 1px solid var(--line); border-radius: 10px; padding: 14px 16px; display: grid; gap: 6px; }
.source-card-head { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
.source-card-title { font-weight: 600; color: var(--ink); text-decoration: none; }
.source-card-title:hover { text-decoration: underline; }
.source-scope { font-size: 12px; color: var(--muted); white-space: nowrap; }
.source-card-meta { font-size: 12.5px; color: var(--muted); }
.source-card-meta strong { color: var(--ink); }
.source-card-meta a { color: var(--muted); }
.sources-cta { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 20px; }
.admin-tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 12px; }
.admin-tile { border: 1px solid var(--line); border-radius: 10px; padding: 12px 14px; }
.admin-tile-label { font-size: 12px; color: var(--muted); }
.admin-tile-value { font-size: 24px; font-weight: 700; letter-spacing: -0.02em; margin-top: 2px; }
.admin-tile-hint { font-size: 12px; color: var(--muted); }
.admin-section { margin-top: 32px; }
.admin-section h2 { font-size: 15px; margin: 0 0 10px; }
.admin-chart { display: flex; align-items: flex-end; gap: 6px; height: 180px; padding-top: 8px; border-bottom: 1px solid var(--line); }
.admin-bar { flex: 1; display: flex; flex-direction: column; align-items: center; height: 100%; }
.admin-bar-stack { flex: 1; width: 100%; display: flex; flex-direction: column; justify-content: flex-end; }
.admin-bar-day { font-size: 11px; color: var(--muted); margin-top: 4px; }
.seg { display: block; width: 100%; }
.seg.gigs { background: var(--ink); }
.seg.jobs { background: var(--muted); }
.seg.rejected { background: var(--rose); opacity: 0.6; }
.admin-legend { display: flex; gap: 10px; align-items: center; font-size: 12px; color: var(--muted); margin-bottom: 6px; }
.admin-legend .seg { width: 10px; height: 10px; border-radius: 2px; display: inline-block; }
.admin-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.admin-table th, .admin-table td { text-align: left; padding: 8px 10px; border-bottom: 1px solid var(--line); }
.admin-table th { color: var(--muted); font-weight: 500; }
.admin-table .num { text-align: right; font-variant-numeric: tabular-nums; }
.admin-links { display: flex; flex-wrap: wrap; gap: 8px; }
.connect-card { max-width: 520px; margin: 40px auto; border: 1px solid var(--line); border-radius: 12px; padding: 24px; display: grid; gap: 10px; }
.connect-card h1 { font-size: 20px; margin: 0; }
.connect-card p { margin: 0; line-height: 1.6; }
.similar { margin-top: 40px; }
.similar h2 { font-size: 15px; margin: 0 0 4px; }
.load-more a.loading { opacity: 0.5; pointer-events: none; }
.load-more { display: flex; justify-content: center; padding: 20px 0 8px; }
.btn-plus { display: none; }
.filters > summary { display: none; }
.filter-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 10px; }
.filter-bar select {
  height: 34px;
  padding: 0 28px 0 10px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--bg) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M1 1l4 4 4-4' fill='none' stroke='%2371717a' stroke-width='1.5'/%3E%3C/svg%3E") no-repeat right 10px center;
  color: var(--ink);
  font: inherit;
  font-size: 13px;
  appearance: none;
  cursor: pointer;
}
.filter-bar select:hover, .filter-bar select:focus { border-color: var(--line-strong); }
.filter-check { display: inline-flex; align-items: center; gap: 6px; height: 34px; font-size: 13px; color: var(--ink); cursor: pointer; }
.filter-check input { margin: 0; accent-color: var(--ink); }
.filter-reset { font-size: 13px; color: var(--muted); }
@media (max-width: 640px) {
  .filter-bar select { flex: 1 1 calc(50% - 4px); min-width: 0; height: 40px; }
  .filter-check { height: 40px; }
}
.score[title] { cursor: help; }
/* Keyboard focus is always visible; the search pill shows it on the whole bar instead. */
a:focus-visible, button:focus-visible, input:focus-visible, select:focus-visible, textarea:focus-visible, summary:focus-visible {
  outline: 2px solid var(--ink);
  outline-offset: 2px;
}
.search-input-wrap input:focus-visible { outline: none; }
.skip-link {
  position: absolute;
  left: 16px;
  top: -48px;
  z-index: 1000;
  padding: 8px 14px;
  border-radius: 6px;
  background: var(--ink);
  color: var(--bg);
  font-weight: 600;
  text-decoration: none;
}
.skip-link:focus { top: 12px; }
.main-content { display: flex; flex-direction: column; }
.main-content:focus { outline: none; }
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
.icon-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
}
.icon-btn svg {
  flex-shrink: 0;
}
.icon-btn.icon-only {
  width: 36px;
  height: 36px;
  padding: 0;
  justify-content: center;
}
.lead-actions { display: flex; flex-direction: row; align-items: center; gap: 8px; flex-wrap: nowrap; }
.lead-actions .btn { white-space: nowrap; }
.icon-btn.done {
  color: var(--emerald);
  border-color: var(--emerald);
}
.text-warn {
  color: var(--rose);
  font-weight: 500;
}
.text-ok {
  color: #16a34a;
  font-weight: 500;
}
.row-sub {
  color: var(--muted);
  font-size: 12px;
  line-height: 1.4;
  margin-top: 4px;
}
.caution-banner {
  border-left: 2px solid var(--rose);
  padding: 8px 12px;
  color: var(--rose);
  font-size: 13px;
  margin: 16px 0;
  background: transparent;
  display: flex;
  align-items: center;
  gap: 8px;
}
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--surface);
  color: var(--ink);
  border: 1px solid var(--line-strong);
  border-radius: 9999px;
  padding: 6px 16px;
  font: inherit;
  font-size: 12.5px;
  font-weight: 500;
  letter-spacing: -0.01em;
  cursor: pointer;
  text-decoration: none;
  line-height: 1.4;
  box-shadow: none;
  transition: background 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
}
.btn:hover {
  background: var(--bg);
  border-color: var(--ink);
  color: var(--ink);
  text-decoration: none;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.05);
}
.btn:active { transform: scale(0.97); }
.btn.btn-sm {
  padding: 4px 12px;
  font-size: 11.5px;
}
.btn.ghost {
  background: transparent;
  color: var(--ink);
  border: 1px solid var(--line-strong);
  box-shadow: none;
}
.btn.ghost:hover {
  background: var(--surface-hover);
  border-color: var(--ink);
  color: var(--ink);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.04);
}
.btn.ghost:active { transform: scale(0.97); }
.btn.danger { border-style: dashed; }
.btn.danger:hover { border-color: var(--rose); color: var(--rose); }
.btn:disabled { opacity: 0.4; cursor: default; }
.empty {
  border: 1px dashed var(--line);
  border-radius: 4px;
  padding: 44px 20px;
  text-align: center;
  color: var(--muted);
  background: transparent;
}
.empty h2 {
  color: var(--ink);
  font-size: 15px;
  text-transform: none;
  letter-spacing: -0.01em;
  margin-bottom: 6px;
}
.empty p { max-width: 460px; margin: 0 auto 16px; font-size: 13px; }
.crumbs { font-size: 12.5px; color: var(--muted); margin-bottom: 10px; }
.crumbs a { color: var(--muted); }
.prose { max-width: 720px; margin-top: 36px; }
.prose h2 { font-size: 17px; text-transform: none; letter-spacing: -0.01em; color: var(--ink); margin: 28px 0 8px; }
.prose p, .prose li { font-size: 14px; line-height: 1.65; color: var(--ink); }
.prose p { margin: 0 0 12px; }
.prose ul { margin: 0 0 12px; padding-left: 20px; }
.faq details { border-bottom: 1px solid var(--line); padding: 12px 0; }
.faq summary { cursor: pointer; font-weight: 600; font-size: 14px; }
.faq details p { margin: 8px 0 0; }
.chip-links { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
.chip-links a { border: 1px solid var(--line); border-radius: 9999px; padding: 5px 12px; font-size: 13px; color: var(--ink); text-decoration: none; }
.chip-links a:hover { background: var(--surface-hover); }
.catalog-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 12px; margin-top: 12px; }
.catalog-card { border: 1px solid var(--line); border-radius: 8px; padding: 14px 16px; color: var(--ink); text-decoration: none; display: block; }
.catalog-card:hover { background: var(--surface-hover); }
.catalog-card b { display: block; font-size: 14px; margin-bottom: 4px; }
.catalog-card span { font-size: 12.5px; color: var(--muted); line-height: 1.5; }
.rs-kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; margin: 8px 0 8px; }
.rs-kpi { border: 1px solid var(--line); border-radius: 8px; padding: 14px 16px; }
.rs-kpi b { display: block; font-size: 22px; letter-spacing: -0.02em; color: var(--ink); }
.rs-kpi span { font-size: 12.5px; color: var(--muted); }
.rs-section { margin-top: 36px; }
.rs-section > h2 { font-size: 17px; text-transform: none; letter-spacing: -0.01em; color: var(--ink); margin-bottom: 6px; }
.rs-chart { margin-top: 12px; }
.rs-row { display: grid; grid-template-columns: minmax(110px, 30%) 1fr minmax(96px, auto); align-items: center; gap: 12px; padding: 7px 0; border-bottom: 1px solid var(--line); }
.rs-label { font-size: 13px; line-height: 1.3; overflow-wrap: anywhere; }
.rs-label a { color: var(--ink); }
.rs-track { position: relative; height: 12px; background: var(--soft); border-radius: 9999px; }
.rs-band { position: absolute; top: 0; bottom: 0; background: color-mix(in srgb, var(--emerald) 35%, transparent); border-radius: 9999px; }
.rs-fill { position: absolute; left: 0; top: 0; bottom: 0; background: color-mix(in srgb, var(--emerald) 55%, transparent); border-radius: 9999px; }
.rs-dot { position: absolute; top: 50%; width: 12px; height: 12px; margin: -6px 0 0 -6px; background: var(--emerald); border: 2px solid var(--bg); border-radius: 50%; box-sizing: border-box; }
.rs-val { text-align: right; font-size: 13px; white-space: nowrap; }
.rs-val b { display: block; color: var(--ink); }
.rs-n { font-size: 11.5px; color: var(--muted); }
.rs-legend { font-size: 12px; color: var(--muted); margin-top: 8px; }
.rs-dot-key, .rs-band-key { display: inline-block; vertical-align: middle; margin: 0 4px 0 8px; }
.rs-dot-key { width: 9px; height: 9px; border-radius: 50%; background: var(--emerald); }
.rs-band-key { width: 22px; height: 9px; border-radius: 9999px; background: color-mix(in srgb, var(--emerald) 35%, transparent); }
.rs-hist { display: flex; align-items: flex-end; gap: 4px; height: 180px; margin-top: 12px; }
.rs-hist-col { flex: 1; display: flex; flex-direction: column; justify-content: flex-end; align-items: center; height: 100%; min-width: 0; }
.rs-hist-bar { width: 100%; background: color-mix(in srgb, var(--emerald) 55%, transparent); border-radius: 3px 3px 0 0; min-height: 1px; }
.rs-hist-n { font-size: 11px; color: var(--muted); margin-bottom: 3px; }
.rs-hist-x { font-size: 11px; color: var(--muted); margin-top: 4px; }
.rs-findings { list-style: none; padding: 0; margin: 10px 0; }
.rs-findings li { display: flex; gap: 12px; align-items: baseline; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid var(--line); font-size: 14px; line-height: 1.5; }
.rs-quote { flex: none; border: 1px solid var(--line); background: transparent; color: var(--muted); border-radius: 9999px; padding: 3px 10px; font-size: 12px; cursor: pointer; }
.rs-quote:hover { color: var(--ink); background: var(--surface-hover); }
.rs-cite code { font-size: 12.5px; overflow-wrap: anywhere; }
@media (max-width: 600px) {
  .rs-row { grid-template-columns: 1fr minmax(84px, auto); }
  .rs-track { grid-column: 1 / -1; grid-row: 2; }
  .rs-findings li { flex-direction: column; }
  .rs-hist-n { display: none; }
}
.detail-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 260px;
  gap: 36px;
  margin-top: 26px;
}
.lead-text {
  font-size: 15px;
  line-height: 1.7;
  margin: 10px 0 0;
  color: var(--ink);
  max-width: 72ch;
  overflow-wrap: anywhere;
}
.lead-text p { margin: 0 0 12px; }
.lead-text ul { margin: 0 0 12px; padding-left: 20px; }
.lead-text li { margin: 2px 0; }
.lead-text a { color: var(--ink); text-decoration: underline; text-underline-offset: 3px; }
.lead-text .lead-heading { margin-bottom: 4px; font-weight: 600; }
.lead-text .redacted { padding: 0 6px; border-radius: 4px; background: var(--soft); color: var(--muted); font-size: 13px; }
.lead-tags { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px; }
.lead-tags .tag { padding: 2px 8px; border: 1px solid var(--line); border-radius: 999px; font-size: 12.5px; color: var(--muted); }
.meta-list { margin: 0; }
.meta-list div {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding: 8px 0;
  border-bottom: 1px solid var(--line);
  font-size: 13px;
}
.meta-list dt { color: var(--muted); }
.meta-list dd { margin: 0; text-align: right; word-break: break-word; font-weight: 500; }
.meta-list a { color: var(--ink); }
.reasons { margin: 8px 0 0; padding-left: 18px; font-size: 12px; color: var(--muted); }
.reasons li { margin: 3px 0; }
section { margin-bottom: 32px; }
table { width: 100%; border-collapse: collapse; font-size: 13px; }
th {
  text-align: left;
  font-size: 10.5px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--muted);
  font-weight: 600;
  padding: 0 10px 10px;
  border-bottom: 1px solid var(--line);
  white-space: nowrap;
}
td { padding: 10px 10px; border-bottom: 1px solid var(--line); vertical-align: top; }
tr:last-child td { border-bottom: 0; }
table a { color: inherit; text-decoration: none; }
table a:hover { text-decoration: underline; }
.error { color: var(--rose); font-weight: 600; }
.back {
  display: inline-block;
  margin-bottom: 16px;
  color: var(--muted);
  font-size: 12.5px;
  font-weight: 500;
  transition: all 0.15s ease;
}
.back:hover { color: var(--ink); text-decoration: none; transform: translateX(-2px); }
.form { display: grid; gap: 14px; max-width: 720px; }
.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.field { display: grid; gap: 5px; color: var(--muted); font-size: 12px; }
.field input, .field select {
  width: 100%;
  padding: 7px 10px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: var(--bg);
  color: var(--ink);
  font: inherit;
  font-size: 13px;
  transition: all 0.15s ease;
}
.field input:focus, .field select:focus {
  outline: 0;
  border-color: var(--ink);
  box-shadow: 0 0 0 1px var(--ink), 0 1px 2px rgba(0, 0, 0, 0.04);
}
.field input:disabled, .field select:disabled { background: var(--soft); color: var(--muted); }
fieldset {
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 16px;
  margin: 0;
  display: grid;
  gap: 12px;
  background: var(--surface);
}
legend {
  font-size: 10.5px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--muted);
  font-weight: 600;
  padding: 0 6px;
}
.hint { color: var(--muted); font-size: 12px; }
.kind-picker { display: grid; gap: 14px; }
.profile-progress { border: 1px solid var(--line); border-radius: 10px; padding: 14px; margin-bottom: 16px; background: var(--surface); }
.profile-progress-head { margin-bottom: 8px; }
.profile-bar { height: 6px; border-radius: 3px; background: var(--soft); overflow: hidden; }
.profile-bar span { display: block; height: 100%; background: var(--ink); }
.profile-table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
.profile-table td { padding: 8px 6px; border-top: 1px solid var(--line); vertical-align: top; }
.profile-points { font-weight: 600; white-space: nowrap; width: 48px; }
.profile-points.neg { color: var(--danger, #b42318); }
.profile-status.credited { color: var(--ok, #127a3a); }
.profile-status.hidden { color: var(--danger, #b42318); }
.catalog-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 10px; }
.catalog-card { display: flex; gap: 12px; align-items: flex-start; justify-content: space-between; padding: 14px; border: 1px solid var(--line); border-radius: 10px; background: var(--surface); }
.catalog-card-body { min-width: 0; }
.catalog-card-title { font-weight: 600; }
.catalog-card-meta { font-size: 12px; color: var(--muted); margin-top: 2px; }
.catalog-card-desc { font-size: 13px; color: var(--muted); margin: 6px 0 0; line-height: 1.45; }
.catalog-card-side { flex: none; }
.kind-group-title { font-size: 11px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: var(--muted); margin-bottom: 6px; }
.kind-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 8px; }
.kind-card { position: relative; display: grid; gap: 3px; padding: 10px 12px 10px 34px; border: 1px solid var(--line); border-radius: 10px; background: var(--surface); cursor: pointer; }
.kind-card:hover { border-color: var(--muted); }
.kind-card:has(input:checked) { border-color: var(--ink); box-shadow: 0 0 0 1px var(--ink); }
.kind-card input { position: absolute; left: 12px; top: 12px; margin: 0; accent-color: var(--ink); }
.kind-card-name { font-weight: 600; font-size: 13.5px; color: var(--ink); }
.kind-card-hint { font-size: 12px; color: var(--muted); line-height: 1.4; }
.type-selector {
  display: inline-flex;
  gap: 16px;
  align-items: center;
}
.radio-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 500;
  color: var(--ink);
  cursor: pointer;
  user-select: none;
}
.radio-label input[type="radio"] {
  width: auto;
  margin: 0;
  accent-color: var(--ink);
  cursor: pointer;
}
.preview-card {
  border-top: 1px solid var(--line);
  border-bottom: 1px solid var(--line);
  background: transparent;
  padding: 24px 0 32px;
  display: grid;
  gap: 16px;
  margin-top: 16px;
  margin-bottom: 48px;
}
.error-box {
  border: 1px solid var(--rose);
  background: rgba(239, 68, 68, 0.06);
  padding: 10px 12px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 600;
  color: var(--rose);
}
.lead-state-notice { margin: 12px 0 0; }
/* Extension page */
.ext-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; flex-wrap: wrap; }
.ext-head .muted { margin: 6px 0 0; max-width: 620px; }
.ext-version { margin: 8px 0 0; }
.ext-download { display: inline-flex; align-items: center; gap: 7px; font-weight: 600; text-decoration: none; }
.install-steps { list-style: none; margin: 0 0 16px; padding: 0; }
.install-step { position: relative; display: flex; gap: 16px; padding-bottom: 28px; }
.install-step:last-child { padding-bottom: 0; }
.install-step:not(:last-child)::before {
  content: ''; position: absolute; left: 11.5px; top: 30px; bottom: 6px; width: 1px; background: var(--line);
}
.install-step-num {
  flex: none; width: 24px; height: 24px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center;
  border: 1px solid var(--line); background: var(--surface); color: var(--ink); font-weight: 600; font-size: 12px;
}
.install-step-body { padding-top: 2px; min-width: 0; }
.install-step-title { font-weight: 600; margin-bottom: 4px; }
.ext-features { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin-bottom: 28px; }
@media (max-width: 640px) { .ext-features { grid-template-columns: 1fr; } }
.ext-feature { border: 1px solid var(--line); border-radius: 10px; padding: 14px; background: var(--surface); }
.ext-feature-title { font-weight: 600; margin-bottom: 4px; }
.ext-privacy { margin: 0 0 28px; }
.ext-ping { font-size: 12px; font-weight: 600; color: var(--muted); margin: 10px 0 4px; }
.ext-ping.ok { color: #059669; }
.ext-subhead { font-size: 13px; margin: 18px 0 0; }
.ext-source { border-top: 1px solid var(--line); padding: 12px 0; display: grid; gap: 6px; min-width: 0; }
.ext-source-title { font-weight: 600; font-size: 13px; }
.ext-source-id { display: block; font-size: 12px; padding: 6px 8px; border-radius: 6px; overflow-wrap: anywhere; word-break: break-all; }
.ext-copy { justify-self: start; font-size: 12px; padding: 5px 12px; text-decoration: none; }
.notice {
  border: 1px solid var(--line);
  background: var(--surface);
  padding: 12px 14px;
  border-radius: 6px;
  font-size: 13px;
  margin-bottom: 20px;
}
.ai-box {
  background: transparent;
  border-left: 2px solid var(--ink);
  padding: 2px 0 2px 16px;
  margin-bottom: 28px;
}
.tag,
.tag-inline {
  display: inline;
  font-style: italic;
  color: var(--muted);
  font-size: 12.5px;
}
pre.token {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 6px;
  padding: 12px;
  overflow: auto;
  font: 12px/1.5 ui-monospace, SFMono-Regular, Consolas, monospace;
  color: var(--ink);
}
[hidden] { display: none !important; }
footer {
  color: var(--muted);
  font-size: 12px;
  line-height: 1.6;
  margin-top: auto;
  padding-top: 72px;
  padding-bottom: 32px;
}
.footer-wrap {
  display: grid;
  grid-template-columns: 1.1fr 1.8fr 0.9fr 0.9fr;
  gap: 36px;
  align-items: flex-start;
}
@media (max-width: 900px) {
  .footer-wrap {
    grid-template-columns: 1fr;
    gap: 28px;
  }
}
.footer-bottom {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  margin-top: 40px;
  font-size: 12px;
  color: var(--muted);
}
.footer-lang { display: inline-flex; gap: 6px; align-items: center; }
.footer-lang a { color: var(--muted); text-decoration: none; }
.footer-lang a.current { color: var(--ink); font-weight: 600; }
.footer-col-brand {
  max-width: 320px;
}
.footer-brand {
  margin: 0 0 4px;
  color: var(--ink);
  font-size: 13px;
  line-height: 1.45;
}
.footer-col-title {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-weight: 600;
  color: var(--ink);
  margin-bottom: 12px;
}
.footer-catalog-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px 24px;
}
@media (max-width: 600px) {
  .footer-catalog-grid {
    grid-template-columns: 1fr;
  }
}
.footer-links-grid {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.footer-catalog-grid a, .footer-links-grid a {
  color: var(--muted);
  text-decoration: none;
  font-size: 12.5px;
  transition: color 0.15s ease;
  line-height: 1.45;
}
.footer-catalog-grid a:hover, .footer-links-grid a:hover {
  color: var(--ink);
  text-decoration: underline;
}
@media (prefers-reduced-motion: reduce) {
  *, ::before, ::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
@media (max-width: 700px) {
  main { padding: 0 16px 56px; }
  .top { flex-wrap: wrap; gap: 12px; }
  .nav { order: 3; width: 100%; margin-left: 0; padding-top: 8px; border-top: 1px solid var(--line); gap: 16px; }
  .actions { margin-left: auto; }
  .page-head { flex-direction: column; align-items: flex-start; gap: 14px; }
  .lead-actions { width: 100%; display: flex; gap: 8px; }
  .lead-actions .btn { flex: 1 1 auto; text-align: center; padding: 8px 12px; }
  .lead-actions .icon-only { flex: 0 0 40px; height: 40px; padding: 0; }
  .detail-grid { grid-template-columns: 1fr; gap: 28px; }
  .grid { grid-template-columns: 1fr; }
  .search-hero { margin: 8px 0 20px; gap: 12px; }
  .intro { padding: 12px 14px; gap: 10px; }
  .intro p { font-size: 13px; padding-right: 48px; }
  .intro-action { flex: 1 1 auto; padding: 8px 10px; }
  .intro-action span { display: none; }
  .type-tab, .chip { min-height: 40px; display: inline-flex; align-items: center; }
  .btn-submit .btn-label { display: none; }
  .filters > summary { display: block; width: max-content; margin-top: 2px; font-size: 13px; color: var(--ink); cursor: pointer; }
  .btn-submit .btn-plus { display: inline; font-size: 18px; line-height: 1; }
  .search-bar { width: 100%; }
  .search-bar input { flex: 1 1 0; min-width: 0; }
  .type-tabs { overflow-x: auto; -webkit-overflow-scrolling: touch; padding-bottom: 4px; }
  .chips { overflow-x: auto; -webkit-overflow-scrolling: touch; flex-wrap: nowrap; padding-bottom: 4px; width: 100%; }
  .chip { white-space: nowrap; }
  .row { grid-template-columns: 1fr; gap: 6px; padding: 14px 0; }
  .row-side { justify-content: flex-start; }
  .funnel-bar { flex-direction: column; align-items: stretch; gap: 12px; }
  .community-votes { overflow-x: auto; -webkit-overflow-scrolling: touch; flex-wrap: nowrap; padding-bottom: 4px; }
}
`;

/** Analytics tags for every page; empty unless the deployment configures counters. */
let analyticsHeadHtml = '';
let analyticsBodyHtml = '';
export function setAnalytics(config: AnalyticsConfig): void {
  analyticsHeadHtml = analyticsHead(config);
  analyticsBodyHtml = analyticsBody(config);
}

/** Absolute public URL (RADAR_PUBLIC_URL) for og:image and og:url; unset on a private node. */
let publicBaseUrl: string | undefined;
export function setPublicBaseUrl(url: string | undefined): void {
  publicBaseUrl = url?.replace(/\/+$/, '') || undefined;
}

/** The footer lists the first catalog pages; the rest are one click away on /catalog. */
const FOOTER_CATALOG_SIZE = 12;

/** Quick searches under the search box. */
const QUICK_QUERIES: Record<SupportedLang, string[]> = {
  ru: ['Парсер', 'Telegram-бот', 'Лендинг', 'Дизайн', 'Тексты', 'Видео'],
  en: ['Parser', 'Telegram bot', 'Landing page', 'Design', 'Copywriting', 'Video'],
};

/** Skills offered in the feed filter: canonical names from extractTechSkills(). */
const FILTER_SKILLS = ['Python', 'JavaScript', 'TypeScript', 'React', 'Node.js', 'PHP', 'Java', 'Golang', '1С', 'Битрикс', 'WordPress', 'Tilda', 'Figma', 'SQL', 'Telegram Bot', 'Нейросети'];

/** The stylesheet is served from a content-hashed path so browsers cache it across pages. */
export const STYLE_PATH = `/assets/app.${createHash('sha256').update(STYLE).digest('hex').slice(0, 10)}.css`;
export { STYLE };

export function layout(input: {
  title: string;
  version: string;
  active?: 'leads' | 'sources' | 'extension' | 'research';
  body: string;
  actions?: string;
  script?: string;
  auth?: AuthDisplay;
  lang?: SupportedLang;
  /** Extra <head> content: canonical, meta description, feed discovery. */
  head?: string;
}): string {
  const lang = input.lang ?? 'ru';
  const t = getTranslations(lang);
  const nav = (key: 'leads' | 'sources' | 'extension' | 'research', label: string, href: string): string =>
    `<a href="${href}"${input.active === key ? ' class="active"' : ''}>${label}</a>`;

  const isMember = Boolean(input.auth?.handle || input.auth?.isAdmin);
  const authWidget = input.auth
    ? `
      <div class="user-menu-wrap">
        <button type="button" class="user-pill" id="user-menu-trigger" aria-haspopup="true" aria-expanded="false" onclick="
          const m = document.getElementById('user-menu-dropdown');
          if (m) {
            const exp = m.style.display !== 'none';
            m.style.display = exp ? 'none' : 'block';
            this.setAttribute('aria-expanded', String(!exp));
          }
        ">
          <span class="user-avatar-badge">${escapeHtml((input.auth.handle || 'A').slice(0, 1).toUpperCase())}</span>
          <span class="user-handle-text">${escapeHtml(input.auth.handle ? '@' + input.auth.handle : 'Admin')}</span>
          <svg class="chevron-svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m6 9 6 6 6-6"/></svg>
        </button>
        <div class="user-menu-dropdown" id="user-menu-dropdown" style="display:none">
          <div class="user-menu-info">
            <div class="user-menu-name">${escapeHtml(input.auth.handle ? '@' + input.auth.handle : 'Администратор')}</div>
            <div class="user-menu-role">${input.auth.isAdmin ? (lang === 'ru' ? 'Администратор' : 'Administrator') : lang === 'ru' ? 'Участник' : 'Member'}</div>
          </div>
          <div class="user-menu-sep"></div>
          ${input.auth.isAdmin ? `<a class="user-menu-link" href="/admin">${escapeHtml(lang === 'ru' ? 'Админка' : 'Admin')}</a>` : ''}
          <a class="user-menu-link" href="/me">${escapeHtml(t.navProfile)}</a>
          <a class="user-menu-link" href="/submit">${escapeHtml(lang === 'ru' ? 'Добавить по ссылке' : 'Submit by URL')}</a>
          <a class="user-menu-link" href="/extension">${escapeHtml(lang === 'ru' ? 'Браузерное расширение' : 'Browser Extension')}</a>
          <div class="user-menu-sep"></div>
          <a class="user-menu-link danger" href="/logout">${escapeHtml(t.signOut)}</a>
        </div>
      </div>
    `
    : `<button type="button" class="btn auth-signin-btn" onclick="openLoginModal()">${escapeHtml(t.signIn)}</button>`;

  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(input.title)} · openradar</title>
<meta property="og:site_name" content="openradar">
<meta property="og:title" content="${escapeHtml(input.title)} · openradar">
<meta property="og:type" content="website">
${publicBaseUrl ? `<meta property="og:image" content="${escapeHtml(publicBaseUrl)}/og.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${escapeHtml(publicBaseUrl)}/og.png">` : '<meta name="twitter:card" content="summary">'}
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
${input.head ?? ''}
<link rel="stylesheet" href="${STYLE_PATH}">
${analyticsHeadHtml}
</head>
<body>
<a class="skip-link" href="#main">${escapeHtml(t.skipToFeed)}</a>
${analyticsBodyHtml}
<main>
<header class="top">
  <div class="top-brand-group">
    <a class="brand" href="/" aria-label="openradar">${renderLogo({ height: 24 })}</a>
  </div>
  <nav class="nav">
    ${nav('leads', t.navLeads, '/')}
    ${nav('research', lang === 'ru' ? 'Исследования' : 'Research', '/research')}
    ${nav('sources', t.navSources, '/sources')}
  </nav>
  <div class="actions">${input.actions ?? ''}${authWidget}</div>
</header>
<div class="main-content" id="main" tabindex="-1">
${input.body}
</div>
<footer>
  <div class="footer-wrap">
    <div class="footer-col footer-col-brand">
      <p class="footer-brand"><a href="/" aria-label="openradar">${renderLogo({ height: 16 })}</a></p>
      <p style="margin:8px 0 0">${escapeHtml(t.footerDesc)}</p>
    </div>
    <div class="footer-col">
      <div class="footer-col-title">${escapeHtml(lang === 'ru' ? 'Категории' : 'Categories')}</div>
      <div class="footer-catalog-grid">
        ${SEO_CATALOG.slice(0, FOOTER_CATALOG_SIZE).map((entry) => `<a href="/catalog/${escapeHtml(entry.slug)}">${escapeHtml((entry.title.split('—')[0] ?? entry.h1).trim())}</a>`).join('')}
        <a href="/catalog">${escapeHtml(lang === 'ru' ? 'Все категории →' : 'All categories →')}</a>
      </div>
    </div>
    <div class="footer-col">
      <div class="footer-col-title">${escapeHtml(lang === 'ru' ? 'Проект' : 'Project')}</div>
      <div class="footer-links-grid">
        <a href="${REPO_URL}/blob/main/docs/GETTING_STARTED.md" target="_blank" rel="noopener noreferrer">${escapeHtml(t.guideLink)}</a>
        <a href="/research">${escapeHtml(lang === 'ru' ? 'Исследования рынка' : 'Market research')}</a>
        <a href="/about">${escapeHtml(lang === 'ru' ? 'О проекте' : 'About')}</a>
        <a href="/faq">${escapeHtml(lang === 'ru' ? 'Вопросы и ответы' : 'FAQ')}</a>
        <a href="/extension">${escapeHtml(t.extensionGuide)}</a>
        <a href="/sources">${escapeHtml(t.navSources)}</a>
        <a href="/feed.rss">${escapeHtml(t.rssFeed)}</a>
        <a href="${REPO_URL}/blob/main/docs/PROTOCOL.md" target="_blank" rel="noopener noreferrer">${escapeHtml(t.protocolLink)}</a>
      </div>
    </div>
    <div class="footer-col">
      <div class="footer-col-title">${escapeHtml(lang === 'ru' ? 'Участвовать' : 'Contribute')}</div>
      <div class="footer-links-grid">
        <a href="${REPO_URL}" target="_blank" rel="noopener noreferrer">GitHub</a>
        <a href="${REPO_URL}/blob/main/docs/GETTING_STARTED.md#2-узел-на-своём-компьютере" target="_blank" rel="noopener noreferrer">${escapeHtml(lang === 'ru' ? 'Запустить свой узел' : 'Run your own node')}</a>
        <a href="${REPO_URL}/issues/new?template=source-request.yml" target="_blank" rel="noopener noreferrer">${escapeHtml(lang === 'ru' ? 'Предложить источник' : 'Suggest a source')}</a>
        <a href="${REPO_URL}/issues" target="_blank" rel="noopener noreferrer">${escapeHtml(lang === 'ru' ? 'Сообщить о проблеме' : 'Report a problem')}</a>
      </div>
    </div>
  </div>
  <div class="footer-bottom">
    <span>${escapeHtml(t.footerLicense)}</span>
    <span class="footer-lang">
      <a href="/lang/ru"${lang === 'ru' ? ' class="current"' : ''}>RU</a>
      <span aria-hidden="true">/</span>
      <a href="/lang/en"${lang === 'en' ? ' class="current"' : ''}>EN</a>
    </span>
  </div>
</footer>
</main>
<dialog id="auth-vote-dialog" style="border:1px solid var(--line);border-radius:12px;background:var(--bg);color:var(--ink);padding:24px;max-width:400px;width:calc(100vw - 32px);box-shadow:0 16px 40px rgba(0,0,0,0.22)">
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
    <div style="display:inline-flex;align-items:center">${renderLogo({ height: 28 })}</div>
    <button type="button" onclick="document.getElementById('auth-vote-dialog').close()" style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:22px;line-height:1;padding:0">&times;</button>
  </div>
  <p class="muted" style="font-size:13px;line-height:1.55;margin:0 0 20px">
    ${escapeHtml(lang === 'ru' ? 'Войдите через GitHub для голосования, оценки качества и участия в сети.' : 'Sign in with GitHub to vote, curate leads and see contacts.')}
  </p>
  <div style="display:grid;gap:12px">
    <a class="btn primary" id="auth-vote-github-btn" href="/auth/github" style="display:flex;align-items:center;justify-content:center;gap:8px;padding:10px 14px;font-size:13.5px;font-weight:600;text-decoration:none">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/></svg>
      <span>${escapeHtml(t.signInGithub)}</span>
    </a>
  </div>
  <details style="margin-top:16px">
    <summary class="muted" style="cursor:pointer;font-size:12px;user-select:none">${escapeHtml(lang === 'ru' ? 'Вход для администратора по токену' : 'Admin token sign-in')}</summary>
    <form method="post" action="/login" style="margin-top:10px;display:grid;gap:8px">
      <input type="password" name="token" placeholder="${escapeHtml(lang === 'ru' ? 'Токен администратора' : 'Admin token')}" style="padding:8px 10px;border:1px solid var(--line);border-radius:6px;background:var(--bg);color:var(--ink);font:inherit;font-size:13px">
      <button class="btn" type="submit">${escapeHtml(lang === 'ru' ? 'Войти по токену' : 'Sign in with token')}</button>
    </form>
  </details>
</dialog>
<script>
function openLoginModal() {
  const dlg = document.getElementById('auth-vote-dialog');
  const btn = document.getElementById('auth-vote-github-btn');
  if (btn) {
    btn.href = '/auth/github?returnTo=' + encodeURIComponent(window.location.pathname + window.location.search);
  }
  if (dlg && typeof dlg.showModal === 'function') {
    dlg.showModal();
  } else {
    window.location.href = '/login?returnTo=' + encodeURIComponent(window.location.pathname + window.location.search);
  }
}
function openAuthVoteModal() {
  openLoginModal();
}
function setupBackdropClose(id) {
  const dlg = document.getElementById(id);
  if (!dlg) return;
  dlg.addEventListener('click', function(e) {
    const rect = dlg.getBoundingClientRect();
    const inDialog = (
      rect.top <= e.clientY &&
      e.clientY <= rect.top + rect.height &&
      rect.left <= e.clientX &&
      e.clientX <= rect.left + rect.width
    );
    if (!inDialog) dlg.close();
  });
}
setupBackdropClose('auth-vote-dialog');
setupBackdropClose('add-source-dialog');
document.addEventListener('click', function(e) {
  const trigger = document.getElementById('user-menu-trigger');
  const menu = document.getElementById('user-menu-dropdown');
  if (trigger && menu && !trigger.contains(e.target) && !menu.contains(e.target)) {
    menu.style.display = 'none';
    trigger.setAttribute('aria-expanded', 'false');
  }
});
</script>
<dialog id="add-source-dialog" style="border:1px solid var(--line);border-radius:10px;background:var(--bg);color:var(--ink);padding:24px;max-width:480px;width:calc(100vw - 32px);box-shadow:0 16px 40px rgba(0,0,0,0.18)">
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px">
    <h3 style="margin:0;font-size:16px;font-weight:600">${escapeHtml(t.addSource)}</h3>
    <button type="button" onclick="document.getElementById('add-source-dialog').close()" style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:18px;line-height:1">&times;</button>
  </div>
  <form method="post" action="/sources" style="display:grid;gap:14px">
    <div style="display:grid;gap:5px">
      <label style="font-size:12px;color:var(--muted)">${escapeHtml(t.protocol)}</label>
      <select name="kind" id="dlg-kind" style="padding:7px 10px;border:1px solid var(--line);border-radius:6px;background:var(--bg);color:var(--ink);font:inherit" onchange="
        const val = this.value;
        document.getElementById('dlg-url-grp').style.display = val === 'rss' ? 'grid' : 'none';
        document.getElementById('dlg-tg-grp').style.display = val === 'telegram' ? 'grid' : 'none';
      ">
        <option value="rss">RSS / Atom</option>
        <option value="webhook">Webhook</option>
        <option value="telegram">Telegram</option>
        <option value="imap">IMAP</option>
      </select>
    </div>
    <div style="display:grid;gap:5px">
      <label style="font-size:12px;color:var(--muted)">${escapeHtml(t.sourceName)}</label>
      <input name="title" required placeholder="Например: Мой блог или Закрытая рассылка" style="padding:7px 10px;border:1px solid var(--line);border-radius:6px;background:var(--bg);color:var(--ink);font:inherit">
    </div>
    <div id="dlg-url-grp" style="display:grid;gap:5px">
      <label style="font-size:12px;color:var(--muted)">${escapeHtml(t.urlFeed)}</label>
      <input name="url" placeholder="https://example.com/feed.xml" style="padding:7px 10px;border:1px solid var(--line);border-radius:6px;background:var(--bg);color:var(--ink);font:inherit">
    </div>
    <div id="dlg-tg-grp" style="display:none;gap:5px">
      <label style="font-size:12px;color:var(--muted)">${escapeHtml(t.channelTelegram)}</label>
      <input name="channel" placeholder="freelance_orders" style="padding:7px 10px;border:1px solid var(--line);border-radius:6px;background:var(--bg);color:var(--ink);font:inherit">
    </div>
    <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:8px">
      <button class="btn ghost" type="button" onclick="document.getElementById('add-source-dialog').close()">${escapeHtml(t.cancel)}</button>
      <button class="btn" type="submit">${escapeHtml(t.createSource)}</button>
    </div>
  </form>
</dialog>
${input.script ?? ''}
</body>
</html>`;
}

const POLL_SCRIPT = `<script>
async function poll(url, button) {
  if (!button) return;
  button.disabled = true;
  try {
    const response = await fetch(url, { method: 'POST', headers: { accept: 'application/json' } });
    if (!response.ok) {
      alert('Ошибка: ' + (await response.text()).slice(0, 300));
      return;
    }
    location.reload();
  } finally {
    button.disabled = false;
  }
}
document.querySelectorAll('[data-poll]').forEach((button) => {
  button.addEventListener('click', () => poll(button.dataset.poll, button));
});
</script>`;

function formatRelative(value: string | undefined, lang: SupportedLang = 'ru'): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const diffSec = Math.max(0, Math.round((Date.now() - date.getTime()) / 1000));
  const t = getTranslations(lang);
  if (diffSec < 60) return t.justNow;
  if (diffSec < 3600) return t.minsAgo(Math.floor(diffSec / 60));
  if (diffSec < 86_400) return t.hoursAgo(Math.floor(diffSec / 3600));
  return t.daysAgo(Math.floor(diffSec / 86_400));
}

function formatDate(value: string | undefined, lang: SupportedLang = 'ru'): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(lang === 'en' ? 'en-US' : 'ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

const CURRENCY_SIGNS: Record<string, string> = { RUB: '₽', RUR: '₽', USD: '$', EUR: '€', GBP: '£', UAH: '₴', KZT: '₸', BYN: 'Br' };

function formatBudget(value: number | undefined, currency = 'RUB'): string {
  if (typeof value !== 'number') return '—';
  const code = currency.toUpperCase();
  return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(value)} ${CURRENCY_SIGNS[code] ?? code}`;
}

function plural(value: number, forms: [string, string, string]): string {
  const mod10 = value % 10;
  const mod100 = value % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return forms[1];
  return forms[2];
}

function statusLabel(status: string, lang: SupportedLang = 'ru'): string {
  const t = getTranslations(lang);
  switch (status) {
    case 'new': return t.statusNew;
    case 'interesting': return t.statusInteresting;
    case 'applied': return t.statusApplied;
    case 'in_work': return t.statusInWork;
    case 'delivered': return t.statusDelivered;
    case 'rejected': return t.statusRejected;
    case 'failed': return t.statusFailed;
    default: return STATUS_LABELS[status] ?? status;
  }
}

function statusDot(status: string, lang: SupportedLang = 'ru'): string {
  const cls =
    status === 'in_work' || status === 'delivered'
      ? 'ok'
      : status === 'interesting' || status === 'applied'
        ? 'info'
        : status === 'failed'
          ? 'warn'
          : status === 'rejected'
            ? 'err'
            : '';
  return `<span class="dot ${cls}"></span>${escapeHtml(statusLabel(status, lang))}`;
}

function healthStatus(health: SourceHealth): { dot: string; label: string } {
  if (!health.source.enabled) return { dot: '', label: 'выключен' };
  if (health.lastRun?.error) return { dot: 'err', label: 'ошибка' };
  if (health.lastRun) return { dot: 'ok', label: 'работает' };
  if (health.source.kind === 'webhook') return { dot: '', label: 'ожидает данных' };
  return { dot: '', label: 'нет запусков' };
}

/**
 * Source state for readers who are not the operator: no raw errors, and a source that
 * runs but brings nothing (a blocked API, an empty feed) is not reported as working.
 */
function publicHealthStatus(health: SourceHealth): { dot: string; label: string } {
  if (health.lastRun?.error) return { dot: 'warn', label: 'временно недоступен' };
  if (health.last24h.runs > 0 && health.last24h.found === 0) return { dot: '', label: 'нет новых данных' };
  if (health.lastRun) return { dot: 'ok', label: 'работает' };
  if (health.source.kind === 'webhook') return { dot: '', label: 'принимает данные' };
  return { dot: '', label: 'ожидает первого опроса' };
}

function newLeadsLabel(count: number): string {
  return `${count} ${plural(count, ['новый', 'новых', 'новых'])} за 24 ч`;
}

function metric(value: string | number, label: string): string {
  return `<div class="metric"><b>${escapeHtml(String(value))}</b><span>${escapeHtml(label)}</span></div>`;
}

function metricRow(values: Array<{ value: string | number; label: string }>): string {
  return `<div class="metrics">${values.map((item) => metric(item.value, item.label)).join('')}</div>`;
}

function leadTitle(lead: Lead): string {
  return lead.title.trim() || firstLine(lead.text, 100) || 'Без заголовка';
}

function leadRow(lead: Lead, source?: SourceRecord, lang: SupportedLang = 'ru', admin = true): string {
  const t = getTranslations(lang);
  const meta = [
    lead.type === 'job' ? t.jobType : t.gigType,
    source?.title,
    lead.category,
    lead.city ?? (lead.isRemote !== false ? t.remote : undefined),
    typeof lead.budget === 'number' ? formatBudget(lead.budget, lead.currency) : lead.rawSalary,
    formatRelative(lead.createdAt, lang),
  ]
    .filter(Boolean)
    .join(' · ');

  const signals: string[] = [];
  if (lead.normalizedUsdMin || lead.budget || lead.rawSalary) {
    signals.push(t.signalMarketBudget);
  }
  if (isDirectEmployerSource(source)) {
    signals.push(t.signalDirectEmployer);
  }
  if ((lead.votes_scam ?? 0) >= 1 && lead.status !== 'rejected') {
    signals.push(`<span class="text-warn">${escapeHtml(t.signalPossibleScam)}</span>`);
  }

  const details: string[] = [];
  if (signals.length) {
    details.push(signals.join(', '));
  }
  if (lead.skills?.length) {
    details.push(`<span class="tag-inline">${escapeHtml(lead.skills.slice(0, 5).join(', '))}</span>`);
  }

  const subLine = details.length
    ? `<div class="row-sub">${details.join(' · ')}</div>`
    : '';

  return `<a class="row" href="/leads/${escapeHtml(lead.id)}">
    <div>
      <div class="row-title">${escapeHtml(leadTitle(lead))}</div>
      <div class="row-meta">${escapeHtml(meta)}</div>
      ${subLine}
    </div>
    <div class="row-side">
      ${scoreWithBand(lead.score, lang)}
      ${admin ? `<span>${statusDot(lead.status, lang)}</span>` : ''}
    </div>
  </a>`;
}

function leadsTable(leads: Lead[], sourceById?: Map<string, SourceRecord>, lang: SupportedLang = 'ru'): string {
  const t = getTranslations(lang);
  if (!leads.length) return `<div class="empty">${escapeHtml(t.emptyTitle)}</div>`;
  const rows = leads
    .map((lead) => {
      const source = sourceById?.get(lead.sourceId);
      return `<tr>
        <td class="muted">${lead.score}</td>
        <td><a href="/leads/${escapeHtml(lead.id)}">${escapeHtml(leadTitle(lead))}</a>
          <div class="small muted">${escapeHtml([source?.title, lead.city].filter(Boolean).join(' · '))}</div>
        </td>
        <td class="small">${formatBudget(lead.budget, lead.currency)}</td>
        <td class="small">${statusDot(lead.status, lang)}</td>
        <td class="small muted">${formatRelative(lead.createdAt, lang)}</td>
      </tr>`;
    })
    .join('');
  return `<table>
    <thead><tr><th>${escapeHtml(t.score)}</th><th>${escapeHtml(t.gigType)}</th><th>${escapeHtml(t.budget)}</th><th>Статус</th><th>${escapeHtml(t.published)}</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function runsTable(
  runs: RunRecord[],
  sourceById?: Map<string, SourceRecord>,
  showSource = true,
  lang: SupportedLang = 'ru',
): string {
  const t = getTranslations(lang);
  if (!runs.length) return '<div class="empty">Запусков ещё не было.</div>';
  const rows = runs
    .map((run) => {
      const source = sourceById?.get(run.sourceId);
      return `<tr>
        ${showSource ? `<td>${source ? escapeHtml(source.title) : escapeHtml(run.sourceId)}</td>` : ''}
        <td>${run.found}</td>
        <td>${run.inserted}</td>
        <td>${run.duplicates}</td>
        <td>${run.rejected}</td>
        <td>${run.delivered}</td>
        <td class="small muted">${formatRelative(run.startedAt, lang)}</td>
        <td class="small error">${escapeHtml(run.error ?? '')}</td>
      </tr>`;
    })
    .join('');
  return `<table>
    <thead><tr>${showSource ? `<th>${escapeHtml(t.source)}</th>` : ''}<th>Найдено</th><th>Новых</th><th>Дубли</th><th>Отклонено</th><th>Доставлено</th><th>Когда</th><th>Ошибка</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

export function renderLeadsPage(data: LeadsPageData): string {
  const { stats, health, leads, query, status, type = '', version, lang = 'ru' } = data;
  const t = getTranslations(lang);
  const admin = data.isAdmin === true;
  const sourceById = new Map(health.map((item) => [item.source.id, item.source]));

  const typeTabs: Array<{ key: string; label: string }> = [
    { key: '', label: t.all },
    { key: 'gig', label: t.gigs },
    { key: 'job', label: t.jobs },
  ];

  // Pipeline statuses are the operator's working state: only the admin filters by them.
  const statusFilters: Array<{ key: string; label: string }> = !admin
    ? []
    : [
        { key: '', label: t.statusAll },
        { key: 'new', label: t.statusNew },
        { key: 'interesting', label: t.statusInteresting },
        { key: 'applied', label: t.statusApplied },
        { key: 'in_work', label: t.statusInWork },
        { key: 'delivered', label: t.statusDelivered },
        { key: 'rejected', label: t.statusRejected },
      ];

  const filters: FeedFilters = data.filters ?? { sort: 'new', remote: false };
  const popular = data.popularSkills ?? [];
  // One builder for every link on the page, so switching a tab keeps the search and filters.
  const hrefWith = (overrides: Record<string, string | undefined>, base = '/'): string => {
    const values: Record<string, string | undefined> = {
      type,
      status,
      q: query,
      sort: filters.sort === 'new' ? undefined : filters.sort,
      budget: filters.budgetRub ? String(filters.budgetRub) : undefined,
      skill: filters.skill,
      language: filters.language,
      remote: filters.remote ? '1' : undefined,
      ...overrides,
    };
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(values)) if (value) params.set(key, value);
    const suffix = params.toString();
    return suffix ? `${base}?${suffix}` : base;
  };
  const hrefForType = (nextType: string): string => hrefWith({ type: nextType });
  const hrefForStatus = (nextStatus: string): string => hrefWith({ status: nextStatus });
  const hrefForQuery = (nextQ: string): string => hrefWith({ q: nextQ });
  const rssHref = hrefWith({ sort: undefined }, '/feed.rss');

  const option = (value: string, label: string, selected: boolean): string =>
    `<option value="${escapeHtml(value)}"${selected ? ' selected' : ''}>${escapeHtml(label)}</option>`;
  const sortSelect = `<select name="sort" aria-label="${escapeHtml(t.sortNew)}" onchange="this.form.submit()">
      ${option('', t.sortNew, filters.sort === 'new')}
      ${option('score', t.sortScore, filters.sort === 'score')}
      ${option('budget', t.sortBudget, filters.sort === 'budget')}
    </select>`;
  const budgetSelect = `<select name="budget" aria-label="${escapeHtml(t.budgetAny)}" onchange="this.form.submit()">
      ${option('', t.budgetAny, !filters.budgetRub)}
      ${BUDGET_STEPS_RUB.map((rub) => option(String(rub), t.budgetFrom.replace('{n}', formatBudget(rub).replace(/\s*₽$/, '')), filters.budgetRub === rub)).join('')}
      ${filters.budgetRub && !(BUDGET_STEPS_RUB as readonly number[]).includes(filters.budgetRub) ? option(String(filters.budgetRub), t.budgetFrom.replace('{n}', formatBudget(filters.budgetRub).replace(/\s*₽$/, '')), true) : ''}
    </select>`;
  const skills = filters.skill && !FILTER_SKILLS.some((name) => name.toLowerCase() === filters.skill!.toLowerCase())
    ? [...FILTER_SKILLS, filters.skill]
    : FILTER_SKILLS;
  const skillSelect = `<select name="skill" aria-label="${escapeHtml(t.skillAny)}" onchange="this.form.submit()">
      ${option('', t.skillAny, !filters.skill)}
      ${skills.map((name) => option(name, name, filters.skill?.toLowerCase() === name.toLowerCase())).join('')}
    </select>`;
  const languageSelect = `<select name="language" aria-label="${escapeHtml(t.langAny)}" onchange="this.form.submit()">
      ${option('', t.langAny, !filters.language)}
      ${option('ru', t.langRu, filters.language === 'ru')}
      ${option('en', t.langEn, filters.language === 'en')}
    </select>`;
  // On phones the filters fold under one button unless some are set (see the script below).
  const filterBar = `<details class="filters" id="feed-filters" open><summary>${escapeHtml(t.filtersTitle)}${hasActiveFilters(filters) ? ' •' : ''}</summary><div class="filter-bar">
    ${sortSelect}${budgetSelect}${skillSelect}${languageSelect}
    <label class="filter-check"><input type="checkbox" name="remote" value="1"${filters.remote ? ' checked' : ''} onchange="this.form.submit()">${escapeHtml(t.remoteOnly)}</label>
    ${hasActiveFilters(filters) ? `<a class="filter-reset" href="${escapeHtml(hrefWith({ sort: undefined, budget: undefined, skill: undefined, language: undefined, remote: undefined }))}">${escapeHtml(t.resetFilters)}</a>` : ''}
  </div></details>
  ${filters.sort !== 'new' ? `<p class="score-legend">${escapeHtml(t.rankedWindow)}</p>` : ''}
  ${hasActiveFilters(filters) ? '' : `<script>try{if(matchMedia('(max-width: 700px)').matches){document.getElementById('feed-filters').open=false}}catch(e){}</script>`}`;

  const tabs = typeTabs
    .map(
      (item) =>
        `<a class="type-tab${item.key === type ? ' active' : ''}" href="${escapeHtml(hrefForType(item.key))}">${item.label}</a>`,
    )
    .join('');

  const chips = statusFilters
    .map(
      (item) =>
        `<a class="chip${item.key === status ? ' active' : ''}" href="${escapeHtml(hrefForStatus(item.key))}">${item.label}</a>`,
    )
    .join('');

  const rows = leads.map((lead) => leadRow(lead, sourceById.get(lead.sourceId), lang, admin)).join('');

  const empty =
    stats.sources === 0
      ? `<div class="empty">
          <h2>${escapeHtml(t.emptyTitle)}</h2>
          <p>${escapeHtml(t.emptyDesc)}</p>
          <button class="btn" type="button" onclick="document.getElementById('add-source-dialog')?.showModal()">${escapeHtml(t.addSource)}</button>
        </div>`
      : `<div class="empty">
          <h2>${escapeHtml(t.emptyTitle)}</h2>
          <p>${escapeHtml(t.emptyDesc)}</p>
          ${admin ? `<button class="btn" data-poll="/api/poll">${escapeHtml(t.pollAll)}</button>` : ''}
        </div>`;

  const delay = data.delayMinutes ?? 0;
  const delayLabel = delay >= 60 ? `${Math.round(delay / 60)} ${lang === 'ru' ? 'ч' : 'h'}` : `${delay} ${lang === 'ru' ? 'мин' : 'min'}`;
  // One quiet line instead of a banner: today's volume, and the viewer's delay if any.
  const feedMeta = [
    t.feedFoundToday.replace('{n}', `<strong>${new Intl.NumberFormat('ru-RU').format(stats.last24h)}</strong>`),
    delay > 0 ? escapeHtml(t.feedDelayNote.replace('{d}', delayLabel)) + (data.auth ? '' : `, ${escapeHtml(t.contactsHiddenShort)}`) : '',
    delay > 0 ? `<a href="${REPO_URL}/blob/main/docs/GETTING_STARTED.md#5-делиться-с-хабом-и-получать-рейтинг" target="_blank" rel="noopener noreferrer">${escapeHtml(t.removeDelay)}</a>` : '',
  ].filter(Boolean).join(' · ');
  const pageNo = data.page ?? 1;
  const loadMore = data.hasMore
    ? `<div class="load-more"><a class="btn ghost" href="${escapeHtml(hrefWith({ page: String(pageNo + 1) }))}">${escapeHtml(t.loadMore)}</a></div>`
    : '';

  // First visit without an account: what this is and how to take part. Hidden once dismissed.
  const githubHref = data.githubEnabled ? '/auth/github' : undefined;
  const intro = data.auth || admin
    ? ''
    : `<section class="intro" id="feed-intro">
  <button type="button" class="intro-close" onclick="try{localStorage.setItem('openradar_intro_hidden','1')}catch(e){};this.parentElement.remove()">${escapeHtml(t.heroDismiss)}</button>
  <p>${escapeHtml(t.heroText)}</p>
  <div class="intro-actions">
    ${githubHref ? `<a class="intro-action primary" href="${githubHref}">${escapeHtml(t.heroSignIn)}<span>${escapeHtml(t.heroSignInHint)}</span></a>` : ''}
    <a class="intro-action" href="${REPO_URL}/blob/main/docs/GETTING_STARTED.md" target="_blank" rel="noopener noreferrer">${escapeHtml(t.heroNode)}<span>${escapeHtml(t.heroNodeHint)}</span></a>
    <a class="intro-action" href="${REPO_URL}/blob/main/docs/PROTOCOL.md" target="_blank" rel="noopener noreferrer">${escapeHtml(t.heroSend)}<span>${escapeHtml(t.heroSendHint)}</span></a>
  </div>
</section>
<script>try{if(localStorage.getItem('openradar_intro_hidden')==='1'){document.getElementById('feed-intro')?.remove()}}catch(e){}</script>`;

  const body = `
${intro}
<div class="search-hero">
  <h1 class="feed-title">${escapeHtml(delay > 0 ? t.heroTitleDelayed : t.heroTitle)}</h1>
  <div class="type-tabs">${tabs}</div>
  <p class="feed-meta">${feedMeta}</p>
  <form class="search-form" method="get" action="/">
    ${type ? `<input type="hidden" name="type" value="${escapeHtml(type)}">` : ''}
    ${status ? `<input type="hidden" name="status" value="${escapeHtml(status)}">` : ''}
    <div class="search-bar" id="search-bar-wrap">
      <div class="search-input-wrap">
        <svg class="search-icon-svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
        <input name="q" id="search-input" value="${escapeHtml(query)}" placeholder="${escapeHtml(t.searchPlaceholder)}" aria-label="${escapeHtml(t.searchBtn)}" autocomplete="off">
        ${query ? `<a class="search-clear-btn" href="${escapeHtml(hrefForQuery(''))}" aria-label="${escapeHtml(t.resetSearch)}" title="${escapeHtml(t.resetSearch)}">✕</a>` : `<kbd class="search-kbd">/</kbd>`}
      </div>
      <div class="search-actions-inside">
        <button class="btn search-btn-inside" type="submit">${escapeHtml(t.searchBtn)}</button>
        <a class="btn ghost search-rss-inside" href="${escapeHtml(rssHref)}" target="_blank" rel="noopener" title="RSS">RSS</a>
      </div>
      <div class="search-suggestions" id="search-suggestions">
        <div class="suggestions-group" id="recent-searches" hidden>
          <div class="suggestions-header">${escapeHtml(t.recentSearches)}</div>
          <div class="suggestions-chips" id="recent-chips"></div>
        </div>
        ${popular.length ? `<div class="suggestions-group">
          <div class="suggestions-header">${escapeHtml(t.popularSkills)}</div>
          <div class="suggestions-chips">
            ${popular.map((item) => `<a class="sug-chip" href="${escapeHtml(hrefWith({ skill: item.name, page: undefined }))}">${escapeHtml(item.name)} <span class="sug-count">${item.count}</span></a>`).join('')}
          </div>
        </div>` : ''}
        <div class="suggestions-group">
          <div class="suggestions-header">${escapeHtml(t.suggestionsTitle)}</div>
          <div class="suggestions-chips">
            <a class="sug-chip" href="${escapeHtml(hrefWith({ remote: '1' }))}">${escapeHtml(t.remoteOnly)}</a>
            ${QUICK_QUERIES[lang].map((q) => `<a class="sug-chip" href="${escapeHtml(hrefWith({ q }))}">${escapeHtml(q)}</a>`).join('')}
          </div>
        </div>
      </div>
    </div>
    ${filterBar}
    ${query ? `
    <div class="search-meta-bar">
      ${data.partialMatch ? `<span>${escapeHtml(t.partialMatch)}</span>` : ''}
      <span>${escapeHtml(t.foundCount)}: <strong>${leads.length}${data.hasMore ? '+' : ''}</strong></span>
      <span>${escapeHtml(t.forQuery)} «<strong>${escapeHtml(query)}</strong>»</span>
      <a class="search-meta-clear" href="${escapeHtml(hrefForQuery(''))}">✕ ${escapeHtml(t.resetSearch)}</a>
    </div>` : ''}
  </form>
  ${chips ? `<div class="chips">${chips}</div>` : `<details class="score-help"><summary>${escapeHtml(t.scoreWhat)}</summary><p>${escapeHtml(t.scoreHint)}</p></details>`}
</div>

<div class="list">${rows || empty}</div>
${loadMore}`;

  const searchHotkeyScript = `
${POLL_SCRIPT}
<script>
(function() {
  const input = document.getElementById('search-input');
  const bar = document.getElementById('search-bar-wrap');
  const suggestions = document.getElementById('search-suggestions');

  // «Показать ещё» appends the next page in place; without JS it stays a plain link.
  document.addEventListener('click', async (event) => {
    const link = event.target instanceof Element ? event.target.closest('.load-more a') : null;
    if (!link) return;
    event.preventDefault();
    const box = link.closest('.load-more');
    const list = document.querySelector('.list');
    link.setAttribute('aria-busy', 'true');
    link.classList.add('loading');
    try {
      const res = await fetch(link.href, { headers: { accept: 'text/html' } });
      if (!res.ok) throw new Error(String(res.status));
      const next = new DOMParser().parseFromString(await res.text(), 'text/html');
      const rows = next.querySelector('.list');
      if (!rows || !list) throw new Error('no list');
      list.append(...Array.from(rows.children).filter((row) => !row.classList.contains('empty')));
      const more = next.querySelector('.load-more');
      if (more) box.replaceWith(more); else box.remove();
    } catch (e) {
      window.location.href = link.href;
    }
  });

  // Recent searches live only in this browser.
  const RECENT_KEY = 'openradar_recent_searches';
  const readRecent = () => { try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch (e) { return []; } };
  const recent = readRecent();
  const recentBox = document.getElementById('recent-searches');
  const recentChips = document.getElementById('recent-chips');
  if (recent.length && recentBox && recentChips) {
    for (const q of recent) {
      const a = document.createElement('a');
      a.className = 'sug-chip';
      a.href = '/?q=' + encodeURIComponent(q);
      a.textContent = q;
      recentChips.append(a);
    }
    recentBox.hidden = false;
  }
  input?.form?.addEventListener('submit', () => {
    const q = input.value.trim();
    if (!q) return;
    try { localStorage.setItem(RECENT_KEY, JSON.stringify([q, ...readRecent().filter((x) => x !== q)].slice(0, 6))); } catch (e) {}
  });

  if (input && suggestions && bar) {
    input.addEventListener('focus', () => {
      suggestions.classList.add('active');
    });

    document.addEventListener('click', (e) => {
      if (!bar.contains(e.target)) {
        suggestions.classList.remove('active');
      }
    });
  }

  window.addEventListener('keydown', (e) => {
    if (e.key === '/' && document.activeElement?.tagName !== 'INPUT') {
      e.preventDefault();
      input?.focus();
      input?.select();
      suggestions?.classList.add('active');
    } else if (e.key === 'Escape' && document.activeElement === input) {
      suggestions?.classList.remove('active');
      input?.blur();
    }
  });
})();
</script>`;

  const pageTitle = query
    ? `${query} — ${t.searchBtn}`
    : type === 'job'
    ? t.jobs
    : type === 'gig'
    ? t.gigs
    : lang === 'ru'
    ? 'Заказы и вакансии для фрилансеров и IT — открытая лента'
    : 'Freelance orders and IT jobs — an open feed';

  const typeParam = type ? `?type=${encodeURIComponent(type)}` : '';
  return layout({
    title: pageTitle,
    version,
    active: 'leads',
    body,
    actions: `<a class="btn btn-submit" href="/submit" aria-label="${escapeHtml(t.submitByUrl)}" title="${escapeHtml(t.submitByUrl)}"><span class="btn-plus" aria-hidden="true">+</span><span class="btn-label">${escapeHtml(t.submitByUrl)}</span></a>`,
    script: searchHotkeyScript,
    auth: data.auth,
    lang,
    head: `<link rel="canonical" href="${escapeHtml(publicBaseUrl ?? 'https://openradar.fun')}/${typeParam}">
<meta name="description" content="openradar — открытая база заказов и вакансий: свежие проекты с бирж и Telegram-каналов, вилки зарплат, фильтры по стеку и RSS на любой запрос.">`,
  });
}

function safeHttpUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.href;
    }
  } catch {}
  return undefined;
}

export function renderLeadPage(data: LeadPageData): string {
  const { lead, source, version, auth, lang = 'ru' } = data;
  const t = getTranslations(lang);
  const isUser = Boolean(auth?.handle);
  const isAdminSession = Boolean(auth) && !auth?.handle;
  const copyScript = `<script>
// Icon buttons confirm with a colour flash and a changed tooltip; the icon stays.
function flashDone(button, label) {
  button.classList.add('done');
  button.title = label;
  setTimeout(() => { button.classList.remove('done'); button.title = button.dataset.title; }, 1600);
}
document.getElementById('copy-lead')?.addEventListener('click', async (event) => {
  const button = event.currentTarget;
  try {
    await navigator.clipboard.writeText(document.getElementById('lead-text')?.innerText ?? '');
    flashDone(button, '${escapeHtml(t.copied)}');
  } catch {
    flashDone(button, '${escapeHtml(t.copyFailed)}');
  }
});
document.getElementById('share-lead')?.addEventListener('click', async (event) => {
  const button = event.currentTarget;
  const url = window.location.href;
  try {
    if (navigator.share) {
      await navigator.share({ title: document.title, url });
      return;
    }
    await navigator.clipboard.writeText(url);
    flashDone(button, '${escapeHtml(t.linkCopied)}');
  } catch {}
});
</script>`;

  const aiSummary = lead.reasons.find((r) => r.startsWith('llm:summary:'))?.slice(12);
  const aiCategory = lead.reasons.find((r) => r.startsWith('llm:category:'))?.slice(13);
  const aiSkills = lead.reasons.find((r) => r.startsWith('llm:skills:'))?.slice(11);
  const aiUrgency = lead.reasons.find((r) => r.startsWith('llm:urgency:'))?.slice(12);
  const aiConfidence = lead.reasons.find((r) => r.startsWith('llm:lead:'))?.slice(9);

  const aiBox = (aiSummary || aiCategory || aiSkills)
    ? `<div class="ai-box">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px">
          <span style="font-weight:700;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)">${escapeHtml(t.aiAnalysis)}</span>
          ${aiConfidence ? `<span class="muted small">${Math.round(Number(aiConfidence) * 100)}% ${escapeHtml(t.aiMatch)}</span>` : ''}
        </div>
        ${aiSummary ? `<p style="font-weight:600;margin:0 0 10px">${escapeHtml(aiSummary)}</p>` : ''}
        <div class="muted small" style="margin-top:6px;line-height:1.5">
          ${[
            aiCategory ? `${escapeHtml(t.category)}: <b style="color:var(--ink)">${escapeHtml(aiCategory)}</b>` : '',
            aiUrgency ? `${escapeHtml(t.urgency)}: <b style="color:var(--ink)">${escapeHtml(aiUrgency)}</b>` : '',
            aiSkills ? `${escapeHtml(t.stack)}: ${escapeHtml(aiSkills.split(',').map((s) => s.trim()).join(', '))}` : '',
          ].filter(Boolean).join(' · ')}
        </div>
      </div>`
    : '';

  const cleanUrl = safeHttpUrl(lead.url);

  const cautionBanner = ((lead.votes_scam ?? 0) >= 1 && lead.status !== 'rejected')
    ? `<div class="caution-banner">
        ${escapeHtml(t.cautionFlag)}
      </div>`
    : '';

  const salaryDisplay = typeof lead.budget === 'number'
    ? formatBudget(lead.budget, lead.currency)
    : lead.rawSalary ? escapeHtml(lead.rawSalary) : '—';
  const usdEstimate = lead.normalizedUsdMin
    ? ` <span class="muted small">(≈ $${lead.normalizedUsdMin}${lead.normalizedUsdMax && lead.normalizedUsdMax !== lead.normalizedUsdMin ? `–$${lead.normalizedUsdMax}` : ''})</span>`
    : '';

  const adminControls = isAdminSession
    ? `<form method="post" action="/leads/${escapeHtml(lead.id)}/status" style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
    <span class="small muted" style="margin-right:4px">${escapeHtml(t.details)}:</span>
    <button name="status" value="new" class="funnel-btn ${lead.status === 'new' ? 'active' : ''}">${escapeHtml(t.statusNew)}</button>
    <button name="status" value="interesting" class="funnel-btn ${lead.status === 'interesting' ? 'active' : ''}">${escapeHtml(t.statusInteresting)}</button>
    <button name="status" value="applied" class="funnel-btn ${lead.status === 'applied' ? 'active' : ''}">${escapeHtml(t.statusApplied)}</button>
    <button name="status" value="in_work" class="funnel-btn ${lead.status === 'in_work' ? 'active' : ''}">${escapeHtml(t.statusInWork)}</button>
    <button name="status" value="rejected" class="funnel-btn ${lead.status === 'rejected' ? 'active' : ''}">${escapeHtml(t.statusRejected)}</button>
  </form>
  <form method="post" action="/leads/${escapeHtml(lead.id)}/feedback" style="display:flex;gap:6px;align-items:center">
    <span class="small muted" style="margin-right:4px">${escapeHtml(t.score)}:</span>
    <button name="feedback" value="up" class="btn ghost small" title="Подходит">+10</button>
    <button name="feedback" value="down" class="btn ghost small" title="Мусор">-20</button>
  </form>`
    : '';

  const formatted = formatLeadText(lead.text);
  const myVote = data.myVote;
  const voteControls = isUser
    ? `<form method="post" action="/leads/${escapeHtml(lead.id)}/vote" class="community-votes">
    <button name="signal" value="useful" class="vote-btn ${myVote === 'useful' ? 'active' : ''}" type="submit" title="${myVote === 'useful' ? 'Нажмите, чтобы отменить свой голос' : ''}">${escapeHtml(t.useful)} <span class="vote-count">${lead.votes_up ?? 0}</span></button>
    <button name="signal" value="junk" class="vote-btn ${myVote === 'junk' ? 'active' : ''}" type="submit" title="${myVote === 'junk' ? 'Нажмите, чтобы отменить свой голос' : ''}">${escapeHtml(t.junk)} <span class="vote-count">${lead.votes_down ?? 0}</span></button>
    <button name="signal" value="scam" class="vote-btn vote-btn-danger ${myVote === 'scam' ? 'active' : ''}" type="submit" title="${myVote === 'scam' ? 'Нажмите, чтобы отменить свой голос' : ''}">${escapeHtml(t.scam)} <span class="vote-count">${lead.votes_scam ?? 0}</span></button>
    <button name="signal" value="closed" class="vote-btn ${myVote === 'closed' ? 'active' : ''}" type="submit" title="${myVote === 'closed' ? 'Нажмите, чтобы отменить свой голос' : ''}">${escapeHtml(t.closed)} <span class="vote-count">${lead.votes_closed ?? 0}</span></button>
  </form>`
    : `<div class="community-votes" title="${escapeHtml(t.signInToVote)}">
    <button type="button" class="vote-btn" onclick="openAuthVoteModal()">${escapeHtml(t.useful)} <span class="vote-count">${lead.votes_up ?? 0}</span></button>
    <button type="button" class="vote-btn" onclick="openAuthVoteModal()">${escapeHtml(t.junk)} <span class="vote-count">${lead.votes_down ?? 0}</span></button>
    <button type="button" class="vote-btn vote-btn-danger" onclick="openAuthVoteModal()">${escapeHtml(t.scam)} <span class="vote-count">${lead.votes_scam ?? 0}</span></button>
    <button type="button" class="vote-btn" onclick="openAuthVoteModal()">${escapeHtml(t.closed)} <span class="vote-count">${lead.votes_closed ?? 0}</span></button>
  </div>`;

  const body = `
<a class="back" href="/">${escapeHtml(t.backToLeads)}</a>
<div class="page-head">
  <div>
    <h1>${escapeHtml(leadTitle(lead))}</h1>
    <p class="muted small">${isAdminSession ? `${statusDot(lead.status, lang)} · ` : ''}${formatRelative(lead.createdAt, lang)}</p>
    ${lead.state === 'closed' ? `<p class="notice lead-state-notice">${escapeHtml(t.leadClosedNotice)}</p>` : data.expired ? `<p class="notice lead-state-notice">${escapeHtml(t.leadExpiredNotice)}</p>` : ''}
  </div>
  <div class="actions lead-actions">
    ${cleanUrl ? `<a class="btn" href="${escapeHtml(cleanUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(t.openOriginal)}</a>` : ''}
    <button class="btn icon-btn icon-only" id="copy-lead" type="button" title="${escapeHtml(t.copyText)}" aria-label="${escapeHtml(t.copyText)}" data-title="${escapeHtml(t.copyText)}">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
    </button>
    <button class="btn icon-btn icon-only" id="share-lead" type="button" title="${escapeHtml(t.shareLead)}" aria-label="${escapeHtml(t.shareLead)}" data-title="${escapeHtml(t.shareLead)}">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"></path><polyline points="16 6 12 2 8 6"></polyline><line x1="12" y1="2" x2="12" y2="15"></line></svg>
    </button>
  </div>
</div>

<div class="funnel-bar">
  ${adminControls}
  ${voteControls}
</div>

${cautionBanner}

<div class="detail-grid">
  <section>
    ${aiBox}
    <h2>${escapeHtml(t.leadDescription)}</h2>
    <div class="lead-text" id="lead-text">${formatted.html}</div>
    ${formatted.tags.length ? `<div class="lead-tags">${formatted.tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join('')}</div>` : ''}
    ${isAdminSession && lead.reasons.length ? `<h2 style="margin-top:26px">${escapeHtml(t.scoreReasons)}</h2><ul class="reasons">${lead.reasons.map((reason) => `<li>${escapeHtml(reason)}</li>`).join('')}</ul>` : ''}
  </section>
  <aside>
    <h2>${escapeHtml(t.details)}</h2>
    <dl class="meta-list">
      <div><dt>${escapeHtml(t.type)}</dt><dd>${lead.type === 'job' ? escapeHtml(t.jobType) : escapeHtml(t.gigType)}</dd></div>
      <div><dt>${escapeHtml(t.source)}</dt><dd>${source ? `<a href="/sources/${escapeHtml(source.id)}">${escapeHtml(source.title)}</a>` : escapeHtml(lead.sourceId)}</dd></div>
      ${lead.category ? `<div><dt>${escapeHtml(t.category)}</dt><dd><b>${escapeHtml(lead.category)}</b></dd></div>` : ''}
      <div><dt>${escapeHtml(t.location)}</dt><dd>${escapeHtml(lead.city ?? (lead.isRemote !== false ? t.remote : '—'))}</dd></div>
      <div><dt>${escapeHtml(t.format)}</dt><dd>${lead.isRemote !== false ? escapeHtml(t.remoteFormat) : escapeHtml(t.onsiteFormat)}</dd></div>
      <div><dt>${escapeHtml(t.budget)}</dt><dd>${salaryDisplay}${usdEstimate}</dd></div>
      <div><dt>${escapeHtml(t.score)}</dt><dd>${scoreWithBand(lead.score, lang)}</dd></div>
      <div><dt>${escapeHtml(t.published)}</dt><dd>${formatDate(lead.publishedAt, lang)}</dd></div>
      ${Math.abs(Date.parse(lead.createdAt) - Date.parse(lead.publishedAt ?? lead.createdAt)) > 30 * 60_000 ? `<div><dt>${escapeHtml(t.added)}</dt><dd>${formatDate(lead.createdAt, lang)}</dd></div>` : ''}
      ${lead.author ? `<div><dt>${escapeHtml(t.author)}</dt><dd>${escapeHtml(lead.author)}</dd></div>` : ''}
      ${lead.sourceRef ? `<div><dt>${escapeHtml(t.channel)}</dt><dd>${escapeHtml(lead.sourceRef.channelTitle || lead.sourceRef.channel)}${lead.sourceRef.visibility !== 'public' ? ` (${escapeHtml(t.privateChannel)})` : ''}</dd></div>` : ''}
      ${data.contactsHidden
        ? `<div><dt>${escapeHtml(t.contacts)}</dt><dd><a href="/login">${escapeHtml(t.contactsHidden)}</a></dd></div>`
        : lead.contacts?.length
          ? `<div><dt>${escapeHtml(t.contacts)}</dt><dd>${lead.contacts.map(renderContact).join('<br>')}</dd></div>`
          : ''}
    </dl>
    <details class="score-help" style="margin-top:10px"><summary>${escapeHtml(t.scoreWhat)}</summary><p>${escapeHtml(t.scoreHint)}</p></details>
    ${lead.skills?.length ? `
      <h2 style="margin-top:20px">${escapeHtml(t.skills)}</h2>
      <div style="margin-top:8px;line-height:1.6">
        ${lead.skills.map((s) => `<span class="tag">${escapeHtml(s)}</span>`).join(', ')}
      </div>` : ''}
  </aside>
</div>
${data.similar?.length ? `<section class="similar">
  <h2>${escapeHtml(t.similarLeads)}</h2>
  <div class="list">${data.similar.map((item) => leadRow(item, undefined, lang, false)).join('')}</div>
</section>` : ''}`;

  const cleanText = (lead.text || '').replace(/\s+/g, ' ').trim().slice(0, 160);
  // A closed or expired lead stays readable by link but leaves the search index.
  const gone = lead.state === 'closed' || Boolean(data.expired);
  const posted = lead.publishedAt || lead.createdAt;
  const headExtra = `
<meta name="description" content="${escapeHtml(cleanText)}">
${publicBaseUrl ? `<link rel="canonical" href="${escapeHtml(publicBaseUrl)}/leads/${escapeHtml(lead.id)}">` : ''}
${gone ? '<meta name="robots" content="noindex">' : ''}
<meta property="og:title" content="${escapeHtml(leadTitle(lead))} · openradar">
<meta property="og:description" content="${escapeHtml(cleanText)}">
<meta property="og:type" content="article">
${publicBaseUrl ? `<meta property="og:url" content="${escapeHtml(publicBaseUrl)}/leads/${escapeHtml(lead.id)}">` : ''}
<meta name="twitter:title" content="${escapeHtml(leadTitle(lead))}">
<meta name="twitter:description" content="${escapeHtml(cleanText)}">
<script type="application/ld+json">
${jsonForScript({
  '@context': 'https://schema.org',
  '@type': lead.type === 'job' ? 'JobPosting' : 'CreativeWork',
  ...(lead.type === 'job' ? { title: lead.title } : { name: lead.title }),
  description: lead.text,
  url: publicBaseUrl ? `${publicBaseUrl}/leads/${lead.id}` : undefined,
  ...(lead.type === 'job'
    ? {
        datePosted: posted,
        validThrough: new Date(Date.parse(posted) + 30 * 86_400_000).toISOString(),
        jobLocationType: lead.isRemote !== false && !lead.city ? 'TELECOMMUTE' : undefined,
      }
    : { datePublished: posted }),
  hiringOrganization: lead.author ? { '@type': 'Organization', name: lead.author } : undefined,
  jobLocation: lead.city ? { '@type': 'Place', address: { '@type': 'PostalAddress', addressLocality: lead.city } } : undefined,
  baseSalary: typeof lead.budget === 'number' ? {
    '@type': 'MonetaryAmount',
    currency: lead.currency || 'RUB',
    value: { '@type': 'QuantitativeValue', value: lead.budget, unitText: 'MONTH' },
  } : undefined,
})}
</script>`;

  return layout({
    title: leadTitle(lead),
    version,
    active: 'leads',
    body,
    head: headExtra,
    script: copyScript,
    auth: data.auth,
    lang,
  });
}

function formatSourceError(errStr: string, kind: string): string {
  if (!errStr) return '';
  const lower = errStr.toLowerCase();
  let explanation = '';
  let hint = '';

  if (kind === 'telegram' || lower.includes('telegram') || lower.includes('fetch failed')) {
    if (lower.includes('fetch failed') || lower.includes('econnreset') || lower.includes('etimedout')) {
      explanation = 'Сбой сети или ограничение Telegram API';
      hint = 'Канал временно недоступен или IP-сервера временно ограничен со стороны Telegram. Рекомендуется повторить опрос через 5-10 минут или проверить доступность канала.';
    } else if (lower.includes('flood') || lower.includes('429')) {
      explanation = 'Превышен лимит запросов (Rate Limit)';
      hint = 'Telegram временно ограничил частые обращения (FLOOD_WAIT). Подождите несколько минут перед повторным опросом.';
    } else {
      explanation = errStr.length > 50 ? `${errStr.slice(0, 48)}...` : errStr;
      hint = errStr;
    }
  } else if (lower.includes('404') || lower.includes('not found')) {
    explanation = 'Адрес не найден (404 Not Found)';
    hint = 'Удаленная страница или RSS-фид удален или перемещен. Проверьте правильность URL в настройках.';
  } else if (lower.includes('403') || lower.includes('401') || lower.includes('forbidden')) {
    explanation = 'Доступ запрещен (WAF / Cloudflare или неверный токен)';
    hint = 'Сайт заблокировал обращение сервера через защитный экран Cloudflare/WAF. Рекомендуется отправлять лиды через браузерное расширение.';
  } else {
    explanation = errStr.length > 50 ? `${errStr.slice(0, 48)}...` : errStr;
    hint = errStr;
  }

  return `<div class="source-error-tooltip" title="${escapeHtml(hint)}"><span class="info-icon">?</span> <span>${escapeHtml(explanation)}</span></div>`;
}

/** Public home of a source: the board itself, not our feed URL. */
function sourceHomepage(source: SourceRecord): string | undefined {
  const config = source.config;
  if (source.kind === 'telegram' && typeof config.channel === 'string') return `https://t.me/s/${config.channel}`;
  const fixed: Partial<Record<string, string>> = {
    kwork: 'https://kwork.ru/projects', trudvsem: 'https://trudvsem.ru', hh: 'https://hh.ru', remoteok: 'https://remoteok.com',
  };
  if (fixed[source.kind]) return fixed[source.kind];
  if (typeof config.url === 'string') {
    try {
      return new URL(config.url).origin;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

/** Where leads come from, for readers: boards, what part of each, how much today. */
function renderPublicSources(data: SourcesPageData, health: SourceHealth[]): string {
  const lang = data.lang ?? 'ru';
  const t = getTranslations(lang);
  const ru = lang === 'ru';
  const sorted = [...health].sort((a, b) => b.last24h.inserted - a.last24h.inserted);
  const total = sorted.reduce((sum, item) => sum + item.last24h.inserted, 0);
  const cards = sorted
    .map((item) => {
      const [platform, scope] = item.source.title.split(/\s+—\s+/, 2);
      const fromPeople = item.source.kind === 'webhook';
      const home = fromPeople ? undefined : sourceHomepage(item.source);
      const down = Boolean(item.lastRun?.error);
      return `<div class="source-card">
        <div class="source-card-head">
          <a class="source-card-title" href="/sources/${escapeHtml(item.source.id)}">${escapeHtml(platform ?? item.source.title)}</a>
          ${scope ? `<span class="source-scope">${escapeHtml(scope)}</span>` : fromPeople ? `<span class="source-scope">${ru ? 'от участников' : 'from participants'}</span>` : ''}
        </div>
        <div class="source-card-meta">
          <strong>${item.last24h.inserted}</strong> ${ru ? plural(item.last24h.inserted, ['новый', 'новых', 'новых']) + ' за сутки' : 'new in 24 h'}
          ${down ? ` · <span class="text-warn">${ru ? 'временно недоступен' : 'temporarily unavailable'}</span>` : ''}
          ${home ? ` · <a href="${escapeHtml(home)}" target="_blank" rel="noopener noreferrer">${escapeHtml(new URL(home).hostname.replace(/^www\./, ''))} ↗</a>` : ''}
        </div>
      </div>`;
    })
    .join('');
  const body = `
<div class="page-head">
  <div>
    <h1>${ru ? 'Откуда заказы' : 'Where leads come from'}</h1>
    <p class="muted small">${sorted.length} ${ru ? plural(sorted.length, ['источник', 'источника', 'источников']) : 'sources'} · ${total} ${ru ? plural(total, ['новый', 'новых', 'новых']) + ' за сутки' : 'new in 24 h'}</p>
  </div>
</div>
<p class="sources-intro">${ru
    ? 'Хаб сам читает открытые ленты бирж — заказы и вакансии всех направлений, от разработки до дизайна, текстов и маркетинга, — а участники присылают заказы со своих узлов и парсеров. Дубли с разных площадок склеиваются в один заказ.'
    : 'The hub reads open board feeds itself, gigs and jobs of every trade from development to design, writing and marketing, and participants send leads from their nodes and parsers. Duplicates across boards are merged into one lead.'}</p>
<div class="source-grid">${cards}</div>
<div class="sources-cta">
  <a class="btn ghost" href="${REPO_URL}/issues/new?template=source-request.yml" target="_blank" rel="noopener noreferrer">${ru ? 'Предложить источник' : 'Suggest a source'}</a>
  <a class="btn ghost" href="${REPO_URL}/blob/main/docs/GETTING_STARTED.md#5-делиться-с-хабом-и-получать-рейтинг" target="_blank" rel="noopener noreferrer">${ru ? 'Подключить свой узел или парсер' : 'Connect your node or parser'}</a>
</div>`;
  return layout({ title: t.navSources, version: data.version, active: 'sources', body, auth: data.auth, lang });
}

/** Russian-language boards; the rest of the boards are foreign. */
const RU_PRESETS = new Set(['fl-all', 'habr-career', 'kwork-all', 'trudvsem-remote', 'hh-it', 'hh-remote-project', 'freelancehunt', 'getmatch']);
const CATALOG_GROUPS: Array<{ title: string; test: (preset: SourcePreset) => boolean }> = [
  { title: 'Российские биржи и вакансии', test: (preset) => RU_PRESETS.has(preset.id) },
  { title: 'Зарубежные доски', test: (preset) => !RU_PRESETS.has(preset.id) && preset.kind !== 'ats' },
  { title: 'Карьерные страницы компаний', test: (preset) => preset.kind === 'ats' },
];

/** Ready-made platforms: what each one is and whether this node already reads it. */
export function renderSourceCatalogPage(data: SourceCatalogPageData): string {
  const missing = data.items.filter((item) => !item.sourceId).length;
  const groups = CATALOG_GROUPS.map((group) => ({
    title: group.title,
    items: data.items.filter((item) => group.test(item.preset)),
  })).filter((group) => group.items.length);
  const card = (item: SourceCatalogPageData['items'][number]): string => `<div class="catalog-card">
    <div class="catalog-card-body">
      <div class="catalog-card-title">${escapeHtml(item.preset.title)}</div>
      <div class="catalog-card-meta">${escapeHtml(KIND_LABELS[item.preset.kind] ?? item.preset.kind)}</div>
      <p class="catalog-card-desc">${escapeHtml(item.preset.description)}</p>
    </div>
    <div class="catalog-card-side">${item.sourceId
      ? `<a class="btn ghost" href="/sources/${escapeHtml(item.sourceId)}">${item.enabled ? 'Подключено' : 'Выключено'}</a>`
      : `<form method="post" action="/sources/catalog/${escapeHtml(item.preset.id)}"><button class="btn" type="submit">Подключить</button></form>`}</div>
  </div>`;
  const body = `
<a class="back" href="/sources">← Источники</a>
<div class="page-head">
  <div>
    <h1>Каталог площадок</h1>
    <p class="muted small">Готовые настройки проверенных бирж и досок. Подключённая площадка становится источником этого узла и опрашивается сразу.</p>
  </div>
  ${missing ? `<div class="actions"><form method="post" action="/sources/presets"><button class="btn ghost" type="submit">Подключить все (${missing})</button></form></div>` : ''}
</div>
${groups.map((group) => `<section><h2>${escapeHtml(group.title)}</h2><div class="catalog-grid">${group.items.map(card).join('')}</div></section>`).join('')}`;
  return layout({ title: 'Каталог площадок', version: data.version, active: 'sources', body, auth: data.auth, lang: data.lang });
}

export function renderSourcesPage(data: SourcesPageData): string {
  const { version, lang = 'ru', isAdmin } = data;
  const t = getTranslations(lang);
  // Readers see the sources that work for the feed; disabled ones are the operator's business.
  const health = isAdmin ? data.health : data.health.filter((item) => item.source.enabled);
  if (!isAdmin) return renderPublicSources(data, health);
  const rows = health
    .map((item) => {
      const status = healthStatus(item);
      const error = item.lastRun?.error;
      return `<a class="row" href="/sources/${escapeHtml(item.source.id)}">
        <div>
          <div class="row-title">${escapeHtml(item.source.title)}</div>
          <div class="row-meta">${escapeHtml(KIND_LABELS[item.source.kind] ?? item.source.kind)} · <span class="dot ${status.dot}"></span>${status.label} · ${formatRelative(item.lastRun?.startedAt, lang)}</div>
          ${error ? formatSourceError(error, item.source.kind) : ''}
        </div>
        <div class="row-side">${item.last24h.found} / ${item.last24h.inserted} / ${item.last24h.delivered}</div>
      </a>`;
    })
    .join('');
  const newTotal = health.reduce((sum, item) => sum + item.last24h.inserted, 0);
  const subtitle = isAdmin
    ? `${health.length} ${plural(health.length, ['источник', 'источника', 'источников'])} · ${health.filter((item) => item.source.enabled).length} активных · 24ч: найдено / новых / доставлено`
    : `${health.length} ${plural(health.length, ['источник', 'источника', 'источников'])} · ${newLeadsLabel(newTotal)}`;

  const empty = `<div class="empty">
    <h2>Источников пока нет</h2>
    <p>Подключите площадки из каталога (FL.ru, Хабр Карьера, Kwork, hh.ru, зарубежные доски) или добавьте свой источник вручную.</p>
    <div style="display:flex;gap:8px;justify-content:center;margin-top:14px">
      <a class="btn" href="/sources/catalog">Открыть каталог</a>
      <a class="btn ghost" href="/sources/new">Добавить вручную</a>
    </div>
  </div>`;

  const body = `
<div class="page-head">
  <div>
    <h1>${escapeHtml(t.navSources)}</h1>
    <p class="muted small">${subtitle}</p>
  </div>
  <div class="actions"><a class="btn ghost" href="/sources/catalog">Каталог площадок</a><a class="btn" href="/sources/new">${escapeHtml(t.addSource)}</a></div>
</div>
<div class="list">${rows || empty}</div>`;

  return layout({
    title: t.navSources,
    version,
    active: 'sources',
    body,
    auth: data.auth,
    lang,
  });
}

export function renderSourcePage(data: SourcePageData): string {
  const { source, health, leads, runs, version, notice, lang = 'ru' } = data;
  const t = getTranslations(lang);
  if (!data.isAdmin) {
    const publicStatus = publicHealthStatus(health);
    const rows = leads.map((lead) => leadRow(lead, source, lang, false)).join('');
    return layout({
      title: source.title,
      version,
      active: 'sources',
      body: `
<a class="back" href="/sources">← ${escapeHtml(t.navSources)}</a>
<div class="page-head">
  <div>
    <h1>${escapeHtml(source.title)}</h1>
    <p class="muted small">${escapeHtml(KIND_LABELS[source.kind] ?? source.kind)} · <span class="dot ${publicStatus.dot}"></span>${publicStatus.label} · ${newLeadsLabel(health.last24h.inserted)}</p>
  </div>
</div>
<div class="list">${rows || `<div class="empty">${escapeHtml(t.emptyTitle)}</div>`}</div>`,
      auth: data.auth,
      lang,
    });
  }
  const status = healthStatus(health);
  const config = configEntries(source.config)
    .map(([key, value]) => `<div><dt>${escapeHtml(key)}</dt><dd>${escapeHtml(value)}</dd></div>`)
    .join('');

  const webhook = source.kind === 'webhook'
    ? `<p class="hint" style="margin-top:12px">Приём: <code>POST /api/ingest/${escapeHtml(source.id)}</code> с заголовком <code>x-radar-token</code>.</p>`
    : '';

  const body = `
<a class="back" href="/sources">← ${escapeHtml(t.navSources)}</a>
${notice ? `<div class="notice">${escapeHtml(notice)}</div>` : ''}
<div class="page-head">
  <div>
    <h1>${escapeHtml(source.title)}</h1>
    <p class="muted small">${escapeHtml(KIND_LABELS[source.kind] ?? source.kind)} · ${source.enabled ? 'включён' : 'выключен'} · <span class="dot ${status.dot}"></span>${status.label}</p>
  </div>
  <div class="actions">
    <button class="btn" data-poll="/api/sources/${escapeHtml(source.id)}/poll">Опросить</button>
    <a class="btn ghost" href="/sources/${escapeHtml(source.id)}/edit">Редактировать</a>
    <form class="inline" method="post" action="/sources/${escapeHtml(source.id)}/toggle">
      <button class="btn ghost" type="submit">${source.enabled ? 'Выключить' : 'Включить'}</button>
    </form>
    <form class="inline" method="post" action="/sources/${escapeHtml(source.id)}/delete" onsubmit="return confirm('Удалить источник?')">
      <button class="btn ghost danger" type="submit">Удалить</button>
    </form>
  </div>
</div>

${metricRow([
  { value: health.last24h.found, label: 'найдено за 24ч' },
  { value: health.last24h.inserted, label: 'новых' },
  { value: health.last24h.delivered, label: 'доставлено' },
  { value: health.last24h.rejected, label: 'отклонено' },
  { value: `${health.successRate}%`, label: 'успешных запусков' },
  { value: formatRelative(health.lastRun?.startedAt, lang), label: 'последний запуск' },
])}

<section>
  <h2>Конфигурация</h2>
  <dl class="meta-list">${config || '<div><dt>—</dt><dd>пусто</dd></div>'}</dl>
  ${webhook}
</section>

<section>
  <h2>Лиды источника</h2>
  ${leadsTable(leads, undefined, lang)}
</section>

<section>
  <h2>Запуски</h2>
  ${runsTable(runs, undefined, false, lang)}
</section>`;

  return layout({
    title: source.title,
    version,
    active: 'sources',
    body,
    script: POLL_SCRIPT,
    auth: data.auth,
    lang,
  });
}

function configEntries(config: SourceRecord['config']): Array<[string, string]> {
  const hidden = new Set(['token', 'password', 'pass', 'secret']);
  return Object.entries(config)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => {
      if (hidden.has(key)) return [key, 'скрыто'];
      if (key === 'passwordEnv') return [key, `env: ${String(value)}`];
      if (Array.isArray(value)) return [key, value.join(', ')];
      if (typeof value === 'object') return [key, JSON.stringify(value)];
      if (typeof value === 'boolean') return [key, value ? 'да' : 'нет'];
      return [key, String(value)];
    });
}

function textField(
  name: string,
  label: string,
  value: string,
  placeholder = '',
  type = 'text',
  hint?: string,
  disabled = false,
): string {
  return `<label class="field">${escapeHtml(label)}
    <input type="${escapeHtml(type)}" name="${escapeHtml(name)}" value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}"${disabled ? ' disabled' : ''}>
    ${hint ? `<span class="hint">${escapeHtml(hint)}</span>` : ''}
  </label>`;
}

export function renderNewSourcePage(data: NewSourcePageData): string {
  const { kinds, values, error, version, mode, action, submitLabel, sourceId } = data;
  const editing = mode === 'edit';
  const known = new Set(KIND_GROUPS.flatMap((group) => group.kinds));
  const groups = [...KIND_GROUPS, { title: 'Другие', kinds: kinds.filter((kind) => !known.has(kind)) }]
    .map((group) => ({ ...group, kinds: group.kinds.filter((kind) => kinds.includes(kind) && (!editing || kind === values.kind)) }))
    .filter((group) => group.kinds.length);
  const picker = groups
    .map((group) => `<div class="kind-group">
      ${editing ? '' : `<div class="kind-group-title">${escapeHtml(group.title)}</div>`}
      <div class="kind-grid">${group.kinds
        .map((kind) => `<label class="kind-card">
          <input type="radio" name="kind" value="${escapeHtml(kind)}"${kind === values.kind ? ' checked' : ''}${editing ? ' readonly' : ''}>
          <span class="kind-card-name">${escapeHtml(KIND_LABELS[kind] ?? kind)}</span>
          ${KIND_HINTS[kind] ? `<span class="kind-card-hint">${escapeHtml(KIND_HINTS[kind]!)}</span>` : ''}
        </label>`)
        .join('')}</div>
    </div>`)
    .join('');

  const body = `
<a class="back" href="${editing && sourceId ? `/sources/${escapeHtml(sourceId)}` : '/sources'}">← Источники</a>
<div class="page-head">
  <div>
    <h1>${editing ? 'Редактировать источник' : 'Новый источник'}</h1>
    <p class="muted small">${editing ? 'Название и фильтры можно менять. Тип источника фиксирован.' : 'Источник опрашивается этим узлом, и найденное попадает в его ленту. Известные биржи и доски уже настроены в <a href="/sources/catalog">каталоге площадок</a>: там их подключают одной кнопкой.'}</p>
  </div>
</div>
${error ? `<div class="error-box" style="margin-bottom:16px">${escapeHtml(error)}</div>` : ''}

<form class="form" method="post" action="${escapeHtml(action)}">
  <fieldset class="kind-picker">
    <legend>Тип</legend>
    ${picker}
  </fieldset>
  <label class="field">Название
    <input name="title" value="${escapeHtml(values.title)}" placeholder="Например, Городские чаты" required>
  </label>

  <div data-kind="rss">
    ${textField('url', 'URL фида', values.url, 'https://example.com/rss', 'url', 'RSS или Atom. Самый безопасный источник.')}
  </div>

  <div data-kind="telegram">
    ${textField('channel', 'Публичный канал', values.channel, 'stavropol_jobs', 'text', 'Без @. Читается только публичный preview t.me/s/.')}
  </div>

  <div data-kind="telegram-account">
    <fieldset>
      <legend>Telegram через свой аккаунт</legend>
      <p class="hint">Читает каналы и чаты, где состоит аккаунт, в том числе закрытые. Один раз выполните на сервере <code>radar telegram login</code> и положите сессию в <code>.env</code>; список чатов покажет <code>radar telegram chats</code>. Посты из закрытых чатов станут видны в ленте этого узла: добавляйте только чаты для заказов и вакансий.</p>
      ${textField('folder', 'Папка Telegram', values.folder, 'openradar', 'text', 'Удобнее всего: создайте в Telegram папку и перетаскивайте в неё рабочие каналы и группы — источник сам подхватит их в течение получаса. Личные переписки не читаются, даже если лежат в папке.')}
      ${textField('chats', 'Каналы и чаты', values.chats, '@freelance_jobs, -1001234567890', 'text', 'Необязательно, если указана папка. Через запятую: @имя, ссылка t.me или числовой ID.')}
      ${textField('sessionEnv', 'Переменная с сессией', values.sessionEnv || 'RADAR_TELEGRAM_SESSION', 'RADAR_TELEGRAM_SESSION', 'text', 'Для второго аккаунта — RADAR_TELEGRAM_SESSION_ИМЯ латиницей.')}
    </fieldset>
  </div>

  <div data-kind="kwork">
    ${textField('categoryId', 'ID рубрики Kwork', values.categoryId, '11', 'text', 'Необязательно. Пусто — все проекты.')}
  </div>

  <div data-kind="hh">
    <div class="grid">
      ${textField('query', 'Поисковый запрос', values.query, 'python OR golang', 'text', 'Как в поиске hh.ru. Пусто — все вакансии.')}
      ${textField('area', 'Регион', values.area, '113', 'text', 'ID региона hh.ru: 113 — Россия, 1 — Москва, 2 — Санкт-Петербург.')}
    </div>
  </div>

  <div data-kind="trudvsem">
    ${textField('query', 'Поисковый запрос', values.query, 'программист', 'text', 'Пусто — все вакансии портала.')}
  </div>

  <div data-kind="remoteok">
    ${textField('query', 'Тег', values.query, 'dev', 'text', 'Тег RemoteOK, например dev, design, marketing. Пусто — все вакансии.')}
  </div>

  <div data-kind="remotive">
    ${textField('remotiveCategory', 'Категория', values.remotiveCategory, 'software-dev', 'text', 'Категория Remotive, например software-dev, design. Пусто — все.')}
  </div>

  <div data-kind="arbeitnow">
    <p class="hint">Настраивать нечего: источник читает свежие вакансии открытого API Arbeitnow.</p>
  </div>

  <div data-kind="hn">
    <p class="hint">Настраивать нечего: источник находит тред текущего месяца и читает его комментарии.</p>
  </div>

  <div data-kind="ats">
    <label class="field">Система найма
      <select name="provider">
        ${['greenhouse', 'lever', 'ashby'].map((provider) => `<option value="${provider}"${values.provider === provider ? ' selected' : ''}>${provider[0]!.toUpperCase()}${provider.slice(1)}</option>`).join('')}
      </select>
    </label>
    ${textField('companies', 'Компании', values.companies, 'gitlab=GitLab, cloudflare=Cloudflare', 'text', 'Через запятую: имя компании в адресе её доски (boards.greenhouse.io/gitlab → gitlab), после «=» — название для ленты. За опрос читается несколько компаний по кругу.')}
  </div>

  <div data-kind="sitemap">
    ${textField('url', 'Адрес карты сайта', values.url, 'https://example.com/sitemap.xml', 'url', 'sitemap.xml площадки; вложенные карты читаются тоже.')}
    ${textField('pattern', 'Шаблон страниц вакансий', values.pattern, '/vacancies/(\\d+)', 'text', 'Регулярное выражение для адресов вакансий; группа в скобках — номер вакансии. Новые страницы читаются с паузой, разметка JobPosting даёт зарплату и компанию.')}
  </div>

  <div data-kind="webhook">
    <p class="hint">${editing ? 'Токен источника не меняется. Он остался тем же, что был при создании.' : 'Токен источника будет сгенерирован автоматически и показан один раз после создания.'}</p>
  </div>

  <div data-kind="imap">
    <fieldset>
      <legend>IMAP</legend>
      <div class="grid">
        ${textField('host', 'Хост', values.host, 'imap.example.com')}
        ${textField('port', 'Порт', values.port || '993', '993', 'number')}
        ${textField('user', 'Пользователь', values.user, 'radar@example.com')}
        ${textField('passwordEnv', 'Переменная с паролем', values.passwordEnv, 'RADAR_IMAP_PASSWORD', 'text', 'Имя env-переменной, не сам пароль.')}
        ${textField('mailbox', 'Папка', values.mailbox || 'INBOX', 'INBOX')}
        ${textField('sinceDays', 'Дней назад', values.sinceDays || '7', '7', 'number')}
      </div>
      ${textField('subjectIncludes', 'Фильтр по теме', values.subjectIncludes, 'заказ, срочно', 'text', 'Через запятую. Пусто — все письма.')}
    </fieldset>
  </div>

  <fieldset>
    <legend>Общие фильтры</legend>
    <div class="grid">
      ${textField('city', 'Город', values.city, 'Ставрополь')}
      ${textField('minBudget', 'Минимальный бюджет, ₽', values.minBudget, '1000', 'number')}
      ${textField('limit', 'Лимит за опрос', values.limit, '20', 'number')}
    </div>
    ${textField('includeKeywords', 'Обязательные слова', values.includeKeywords, 'сантехник, электрик', 'text', 'Через запятую. Лид без них будет отклонён.')}
    ${textField('excludeKeywords', 'Стоп-слова', values.excludeKeywords, 'бесплатно, вакансия', 'text', 'Через запятую.')}
    <label class="field" style="display:flex;gap:8px;align-items:center">
      <input type="checkbox" name="share" value="on"${values.share ? ' checked' : ''} style="accent-color:var(--ink);width:16px;height:16px">
      <span>Отправлять лиды в хаб (нужны RADAR_HUB_URL и RADAR_NODE_KEY)</span>
    </label>
  </fieldset>

  <div>
    <button class="btn" type="submit">${escapeHtml(submitLabel)}</button>
  </div>
</form>

<script>
function syncKind() {
  const kind = document.querySelector('input[name="kind"]:checked')?.value;
  for (const group of document.querySelectorAll('[data-kind]')) {
    group.hidden = group.dataset.kind !== kind;
    // Several types share field names (url, query): only the shown group is sent.
    for (const field of group.querySelectorAll('input, select')) field.disabled = group.hidden;
  }
}
for (const radio of document.querySelectorAll('input[name="kind"]')) radio.addEventListener('change', syncKind);
syncKind();
</script>`;

  return layout({
    title: editing ? 'Редактировать источник' : 'Новый источник',
    version,
    active: 'sources',
    body,
    auth: data.auth,
    lang: data.lang,
  });
}

export function renderSourceCreatedPage(data: CreatedSourcePageData): string {
  const { source, token, version, lang } = data;
  const body = `
<a class="back" href="/sources">← Источники</a>
<div class="page-head">
  <div>
    <h1>Источник создан</h1>
    <p class="muted small">Токен показывается один раз. Сохраните его — он понадобится расширению или внешнему сервису.</p>
  </div>
</div>
<pre class="token">${escapeHtml(token)}</pre>
<p style="margin-top:16px"><a class="btn" href="/sources/${escapeHtml(source.id)}">Открыть источник</a></p>`;

  return layout({
    title: 'Источник создан',
    version,
    active: 'sources',
    body,
    lang,
  });
}

export interface ProfilePageData {
  version: string;
  auth?: AuthDisplay;
  lang?: SupportedLang;
  tier: 'guest' | 'member' | 'active' | 'core' | 'admin';
  /** Feed delay per tier in minutes (hub mode); empty on a node without delays. */
  delays: Partial<Record<'guest' | 'member' | 'active' | 'core', number>>;
  hubMode: boolean;
  pubkey?: string;
  rating?: number;
  /** Points of the last 30 days, newest first. */
  ledger?: Array<{ leadId: string; kind: string; points: number; createdAt: string; title?: string }>;
  /** What the account brought, newest first. */
  posts?: Array<{ leadId: string; title: string; receivedAt: string; first: boolean; status: 'credited' | 'waiting' | 'hidden' }>;
}

/** People see points: the rating ×10, whole numbers. */
const POINTS_SCALE = 10;
const LEDGER_LABELS: Record<SupportedLang, Record<string, string>> = {
  ru: { first: 'найдено первым', confirm: 'подтверждение', signal_match: 'верный голос', hidden_first: 'скрыто как мусор', hidden_confirm: 'подтвердили мусор' },
  en: { first: 'found first', confirm: 'confirmation', signal_match: 'vote matched', hidden_first: 'hidden as junk', hidden_confirm: 'confirmed junk' },
};

const TIER_NAMES: Record<SupportedLang, Record<ProfilePageData['tier'], string>> = {
  ru: { guest: 'Гость', member: 'Участник', active: 'Активный', core: 'Ядро', admin: 'Администратор' },
  en: { guest: 'Guest', member: 'Member', active: 'Active', core: 'Core', admin: 'Administrator' },
};

/** Who I am in the network: tier, delay, rating and how to move up. */
export function renderProfilePage(data: ProfilePageData): string {
  const lang = data.lang ?? 'ru';
  const t = getTranslations(lang);
  const ru = lang === 'ru';
  const names = TIER_NAMES[lang];
  const delay = (minutes: number | undefined): string =>
    !minutes ? (ru ? 'без задержки' : 'no delay') : minutes >= 60 ? `${Math.round(minutes / 60)} ${ru ? 'ч' : 'h'}` : `${minutes} ${ru ? 'мин' : 'min'}`;
  const rows: Array<['guest' | 'member' | 'active' | 'core', string]> = [
    ['guest', ru ? 'не вошли' : 'not signed in'],
    ['member', ru ? 'вход через GitHub или рейтинг от 1' : 'GitHub sign-in or rating 1+'],
    ['active', ru ? 'рейтинг от 10 за 30 дней' : 'rating 10+ over 30 days'],
    ['core', ru ? 'рейтинг от 50 или модератор' : 'rating 50+ or moderator'],
  ];
  const table = data.hubMode
    ? `<table class="tier-table"><thead><tr><th>${ru ? 'Уровень' : 'Tier'}</th><th>${ru ? 'Как получить' : 'How'}</th><th>${ru ? 'Задержка' : 'Delay'}</th><th>${ru ? 'Контакты' : 'Contacts'}</th></tr></thead><tbody>
      ${rows.map(([tier, how]) => `<tr${tier === data.tier ? ' class="current"' : ''}><td>${escapeHtml(names[tier])}</td><td>${escapeHtml(how)}</td><td>${escapeHtml(delay(data.delays[tier]))}</td><td>${tier === 'guest' ? '—' : '✓'}</td></tr>`).join('')}
    </tbody></table>`
    : '';
  const keyBlock = data.pubkey
    ? `<p>${ru ? 'Ключ участника' : 'Participant key'}: <code>${escapeHtml(data.pubkey.slice(0, 12))}…${escapeHtml(data.pubkey.slice(-6))}</code> · ${ru ? 'рейтинг за 30 дней' : '30-day rating'}: <strong>${(data.rating ?? 0).toFixed(1)}</strong></p>`
    : `<p class="muted">${ru
        ? 'Ключ участника к аккаунту не привязан: рейтинг копится на ключе, которым подписаны ваши наблюдения.'
        : 'No participant key is linked to this account: rating accrues to the key that signs your observations.'}</p>`;
  const rating = data.rating ?? 0;
  const points = Math.round(rating * POINTS_SCALE);
  const next = data.tier === 'core' || data.tier === 'admin' ? undefined
    : data.tier === 'active' ? { name: names.core, at: 50, delay: data.delays.core }
    : { name: names.active, at: 10, delay: data.delays.active };
  const progress = data.hubMode && next ? `<div class="profile-progress">
    <div class="profile-progress-head"><strong>${points} ${ru ? plural(points, ['очко', 'очка', 'очков']) : 'points'}</strong> ${ru ? 'за 30 дней' : 'over 30 days'}
      <span class="muted">· ${ru ? `ещё ${Math.max(0, next.at * POINTS_SCALE - points)} до уровня «${escapeHtml(next.name)}»` : `${Math.max(0, next.at * POINTS_SCALE - points)} more to ${escapeHtml(next.name)}`}${next.delay !== undefined ? ` (${ru ? 'задержка' : 'delay'} ${escapeHtml(delay(next.delay))})` : ''}</span></div>
    <div class="profile-bar"><span style="width:${Math.min(100, Math.round((rating / next.at) * 100))}%"></span></div>
  </div>` : '';
  const ledgerRows = (data.ledger ?? []).map((entry) => `<tr>
      <td class="profile-points ${entry.points < 0 ? 'neg' : ''}">${entry.points > 0 ? '+' : ''}${Math.round(entry.points * POINTS_SCALE)}</td>
      <td><a href="/leads/${escapeHtml(entry.leadId)}">${escapeHtml(entry.title ?? entry.leadId)}</a><div class="muted small">${escapeHtml(LEDGER_LABELS[lang][entry.kind] ?? entry.kind)}</div></td>
      <td class="muted small">${formatRelative(entry.createdAt, lang)}</td>
    </tr>`).join('');
  const statusLabel = (status: 'credited' | 'waiting' | 'hidden'): string =>
    status === 'credited' ? (ru ? 'очки начислены' : 'credited') : status === 'hidden' ? (ru ? 'скрыт' : 'hidden') : (ru ? 'ждёт подтверждения' : 'awaiting confirmation');
  const postRows = (data.posts ?? []).map((post) => `<tr>
      <td><a href="/leads/${escapeHtml(post.leadId)}">${escapeHtml(post.title)}</a>${post.first ? '' : `<div class="muted small">${ru ? 'уже был в базе' : 'already in the base'}</div>`}</td>
      <td class="small"><span class="profile-status ${post.status}">${statusLabel(post.status)}</span></td>
      <td class="muted small">${formatRelative(post.receivedAt, lang)}</td>
    </tr>`).join('');
  const activity = data.hubMode ? `
  <h2>${ru ? 'Начисления' : 'Points'}</h2>
  ${ledgerRows ? `<table class="profile-table">${ledgerRows}</table>` : `<p class="muted">${ru ? 'Пока пусто. Очки приходят, когда добавленный вами заказ подтверждают другие участники или он сутки висит без жалоб.' : 'Nothing yet. Points come when others confirm a lead you added, or it stays a day without complaints.'}</p>`}
  <h2>${ru ? 'Ваши публикации' : 'Your posts'}</h2>
  ${postRows ? `<table class="profile-table">${postRows}</table>` : `<p class="muted">${ru ? 'Добавьте заказ <a href="/submit">по ссылке</a> или через <a href="/extension">расширение</a> — он появится здесь.' : 'Add a lead <a href="/submit">by link</a> or with the <a href="/extension">extension</a> and it shows up here.'}</p>`}` : '';
  const body = `
<div class="page-head"><div><h1>${escapeHtml(t.profileTitle)}</h1>
  <p class="muted small">${escapeHtml(data.auth?.handle ? '@' + data.auth.handle : names[data.tier])}</p></div></div>
<section class="profile">
  ${progress}
  <p class="profile-tier">${ru ? 'Уровень' : 'Tier'}: <strong>${escapeHtml(names[data.tier])}</strong>${data.hubMode && data.tier !== 'admin' ? ` · ${ru ? 'задержка ленты' : 'feed delay'}: <strong>${escapeHtml(delay(data.delays[data.tier]))}</strong>` : ''}</p>
  ${activity}
  ${table}
  <h2>${ru ? 'Как получить очки' : 'How to earn points'}</h2>
  <ol class="profile-steps">
    <li>${ru ? 'Добавляйте заказы и вакансии <a href="/submit">по ссылке</a> или через <a href="/extension">расширение</a>: +10 очков за подтверждённый заказ, который вы принесли первым.' : 'Add leads <a href="/submit">by link</a> or with the <a href="/extension">extension</a>: +10 points for a confirmed lead you brought first.'}</li>
    <li>${ru ? 'Из закрытых каналов очков в полтора раза больше: подключите свой узел с Telegram и включите «делиться».' : 'Private channels earn half as much again: run your node with Telegram and turn on sharing.'}</li>
    <li>${ru ? 'Голосуйте «полезно», «мусор», «закрыто»: голос, совпавший с итогом, даёт +1. Мусор и скам отнимают очки.' : 'Vote useful, junk, closed: a vote that matches the outcome gives +1. Junk and scam cost points.'}</li>
    <li>${ru ? 'Очки считаются за 30 дней: уровень держится, пока вы приносите заказы.' : 'Points count over 30 days: the tier holds while you keep bringing leads.'}</li>
  </ol>
  ${keyBlock}
  <p><a href="${REPO_URL}/blob/main/docs/GETTING_STARTED.md#5-делиться-с-хабом-и-получать-рейтинг" target="_blank" rel="noopener noreferrer">${ru ? 'Подробно — в руководстве' : 'Step by step in the guide'}</a></p>
</section>`;
  return layout({ title: t.profileTitle, version: data.version, body, auth: data.auth, lang });
}

/** Consent before the browser extension gets a token that submits leads as this user. */
export function renderExtensionConnectPage(data: {
  version: string;
  lang?: SupportedLang;
  auth?: AuthDisplay;
  handle: string;
  redirectUri: string;
}): string {
  const lang = data.lang ?? 'ru';
  const ru = lang === 'ru';
  const body = `
<div class="connect-card">
  <h1>${ru ? 'Подключить расширение' : 'Connect the extension'}</h1>
  <p>${ru
    ? `Расширение openradar сможет добавлять заказы от имени <strong>@${escapeHtml(data.handle)}</strong>. Других прав у него не будет: ни голосования, ни настроек, ни доступа к аккаунту GitHub.`
    : `The openradar extension will add leads as <strong>@${escapeHtml(data.handle)}</strong>. Nothing else: no voting, no settings, no access to your GitHub account.`}</p>
  <p class="muted small">${ru ? 'Отключить можно в самом расширении кнопкой «Выйти».' : 'Disconnect it in the extension with «Выйти».'}</p>
  <form method="post" action="/extension/connect">
    <input type="hidden" name="redirect_uri" value="${escapeHtml(data.redirectUri)}">
    <button class="btn" type="submit">${ru ? 'Разрешить' : 'Allow'}</button>
  </form>
</div>`;
  return layout({ title: ru ? 'Подключить расширение' : 'Connect the extension', version: data.version, body, auth: data.auth, lang });
}

export function renderNotFound(version: string, lang: SupportedLang = 'ru'): string {
  const t = getTranslations(lang);
  return layout({
    title: t.notFoundTitle,
    version,
    body: `<div class="page-head"><div><h1>${escapeHtml(t.notFoundTitle)}</h1><p class="muted small">${escapeHtml(t.notFoundDesc)}</p></div></div><div><a class="btn" href="/">${escapeHtml(t.backToLeads)}</a></div>`,
    lang,
  });
}

export function renderExtensionPage(data: ExtensionPageData): string {
  const { version, webhookSources, auth, lang = 'ru', isAuthed } = data;
  const isEn = lang === 'en';

  const texts = isEn
    ? {
        title: 'Browser extension',
        subtitle: 'Send a vacancy or an order from any site to openradar in one click, and see what similar work pays.',
        downloadZip: 'Download extension.zip',
        current: 'Current version',
        updateNote: 'When a newer version is out, the extension says so at the top of its window.',
        installTitle: 'Install in four steps',
        steps: [
          ['Download and unpack', 'Press <b>Download extension.zip</b> and unpack the archive into a folder you will keep.'],
          ['Turn on developer mode', 'Open <code>chrome://extensions</code> (Yandex Browser: <code>browser://extensions</code>) and switch on <b>Developer mode</b> in the corner.'],
          ['Load the folder', 'Press <b>Load unpacked</b> and pick the unpacked folder. Pin the openradar icon to the toolbar.'],
          ['Sign in with GitHub', 'Click the icon, press <b>Sign in with GitHub</b> and allow the extension. Nothing to type: leads go to the shared base under your GitHub name.'],
        ],
        storeSoon: 'Coming to the Chrome Web Store: one-click install and automatic updates.',
        usageTitle: 'What it does',
        features: [
          ['Send the page', 'On a vacancy or an order press <b>Alt+Shift+R</b> or the toolbar icon. Title, link and text are read from the page; with <code>schema.org/JobPosting</code> markup also salary, company, city and skills.'],
          ['Send a selection', 'Select text in a chat or on a board, right-click and choose <b>Send order to openradar</b> or <b>Send vacancy to openradar</b>. A notification links to the new lead.'],
          ['Market pay', '<b>Estimate market pay</b> shows the median and the middle half of pay for similar leads over 90 days, and whether the pay on the page is below, within or above it.'],
          ['Updates', 'A newer version shows a bar at the top of the extension window: <b>Update</b> for a store install, <b>Download</b> for an unpacked one.'],
        ],
        privacyTitle: 'Privacy',
        privacyDesc: 'Nothing is read or sent while you browse: only the open tab and only on your click or shortcut. The market estimate sends only the title, the type and the skills. No analytics. <a href="https://github.com/MikhailSagalaev/openradar/blob/main/extension/PRIVACY.md" target="_blank" rel="noopener">Privacy policy</a>.',
        nodeTitle: 'Your own node (optional)',
        nodeDesc: 'Leads go to the shared hub by default. To send them to your own openradar server, open <b>Your own node</b> in the extension and enter the address and a webhook source.',
        pingChecking: 'Checking the server...',
        serverUrl: 'Server address',
        copyUrl: 'Copy address',
        webhookSourcesTitle: 'Webhook sources',
        copyId: 'Copy ID',
        noSourcesTitle: 'No webhook source yet',
        noSourcesDesc: 'Create one to receive leads from the extension on this server.',
        createSource: 'Create a webhook source',
        authRequiredDesc: 'Sign in as the operator to see webhook sources and their IDs.',
        signInLink: 'Sign in →',
        whereTokenTitle: 'Source token',
        whereTokenDesc: 'Shown once when the source is created. Lost it? Create a new webhook source.',
        copied: 'Copied',
      }
    : {
        title: 'Расширение для браузера',
        subtitle: 'Отправляет вакансию или заказ с любого сайта в openradar в один клик и показывает, сколько платят за такую работу.',
        downloadZip: 'Скачать extension.zip',
        current: 'Актуальная версия',
        updateNote: 'Когда выйдет новая версия, расширение само скажет об этом вверху своего окна.',
        installTitle: 'Установка в четыре шага',
        steps: [
          ['Скачайте и распакуйте', 'Нажмите <b>«Скачать extension.zip»</b> и распакуйте архив в папку, которую не будете удалять.'],
          ['Включите режим разработчика', 'Откройте <code>chrome://extensions</code> (в Яндекс Браузере — <code>browser://extensions</code>) и включите <b>«Режим разработчика»</b> в углу страницы.'],
          ['Загрузите папку', 'Нажмите <b>«Загрузить распакованное расширение»</b> и выберите распакованную папку. Закрепите значок openradar на панели.'],
          ['Войдите через GitHub', 'Нажмите на значок, затем <b>«Войти через GitHub»</b> и разрешите расширение. Ничего вводить не нужно: заказы добавляются в общую базу от вашего имени на GitHub.'],
        ],
        storeSoon: 'Скоро в Chrome Web Store: установка в один клик и обновления без переустановки.',
        usageTitle: 'Что умеет',
        features: [
          ['Отправить страницу', 'На странице вакансии или заказа нажмите <b>Alt+Shift+R</b> или значок на панели. Заголовок, ссылка и текст берутся со страницы, а при разметке <code>schema.org/JobPosting</code> — ещё зарплата, компания, город и навыки.'],
          ['Отправить фрагмент', 'Выделите текст в чате или на бирже, нажмите правой кнопкой и выберите <b>«Отправить заказ в openradar»</b> или <b>«Отправить вакансию в openradar»</b>. Уведомление откроет новую карточку.'],
          ['Оплата на рынке', '<b>«Оценить оплату на рынке»</b> показывает медиану и середину разброса оплаты по похожим заказам за 90 дней и где оплата на странице: ниже рынка, в рынке или выше.'],
          ['Обновления', 'Если вышла новая версия, вверху окна расширения появится плашка: <b>«Обновить»</b> для версии из магазина, <b>«Скачать»</b> для распакованной.'],
        ],
        privacyTitle: 'Приватность',
        privacyDesc: 'Пока вы просто листаете сайты, расширение ничего не читает и не отправляет: только открытую вкладку и только по вашему клику или сочетанию клавиш. Для оценки оплаты уходят лишь заголовок, тип и навыки. Без аналитики. <a href="https://github.com/MikhailSagalaev/openradar/blob/main/extension/PRIVACY.md" target="_blank" rel="noopener">Политика конфиденциальности</a>.',
        nodeTitle: 'Свой узел (необязательно)',
        nodeDesc: 'По умолчанию заказы уходят в общий хаб. Чтобы отправлять их на свой сервер openradar, откройте в расширении <b>«Свой узел»</b> и укажите адрес и webhook-источник.',
        pingChecking: 'Проверяем сервер...',
        serverUrl: 'Адрес сервера',
        copyUrl: 'Скопировать адрес',
        webhookSourcesTitle: 'Webhook-источники',
        copyId: 'Скопировать ID',
        noSourcesTitle: 'Webhook-источника пока нет',
        noSourcesDesc: 'Создайте его, чтобы принимать заказы из расширения на этом сервере.',
        createSource: 'Создать webhook-источник',
        authRequiredDesc: 'Список webhook-источников и их ID видит оператор сервера после входа.',
        signInLink: 'Войти →',
        whereTokenTitle: 'Токен источника',
        whereTokenDesc: 'Показывается один раз при создании источника. Потеряли — создайте новый webhook-источник.',
        copied: 'Скопировано',
      };

  const script = `<script>
document.addEventListener('DOMContentLoaded', () => {
  const urlEl = document.getElementById('detected-url');
  if (urlEl) urlEl.textContent = window.location.origin;

  fetch('/api/ping')
    .then((r) => r.json())
    .then((d) => {
      const pingEl = document.getElementById('ping-status');
      if (pingEl && d.ok) {
        pingEl.textContent = '${isEn ? 'Server online (v' : 'Сервер онлайн (v'}' + (d.version || '') + ')';
        pingEl.classList.add('ok');
      }
    })
    .catch(() => {});

  document.querySelectorAll('[data-copy]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const target = document.getElementById(btn.getAttribute('data-copy'));
      if (!target) return;
      await navigator.clipboard.writeText(target.textContent || '');
      const prev = btn.textContent;
      btn.textContent = '${texts.copied}';
      setTimeout(() => { btn.textContent = prev; }, 1600);
    });
  });
});
</script>`;

  const steps = texts.steps
    .map(
      ([title, desc], i) => `
      <li class="install-step">
        <span class="install-step-num" aria-hidden="true">${i + 1}</span>
        <div class="install-step-body">
          <div class="install-step-title">${escapeHtml(title ?? "")}</div>
          <div class="muted small">${desc ?? ""}</div>
        </div>
      </li>`,
    )
    .join('');

  const features = texts.features
    .map(
      ([title, desc]) => `
      <div class="ext-feature">
        <div class="ext-feature-title">${escapeHtml(title ?? "")}</div>
        <div class="muted small">${desc ?? ""}</div>
      </div>`,
    )
    .join('');

  const sourcesList = isAuthed
    ? webhookSources.length
      ? webhookSources
          .map(
            (s) => `
        <div class="ext-source">
          <div class="ext-source-title">${escapeHtml(s.title)}</div>
          <code class="ext-source-id" id="src-id-${escapeHtml(s.id)}">${escapeHtml(s.id)}</code>
          <button class="btn ghost ext-copy" data-copy="src-id-${escapeHtml(s.id)}" type="button">${escapeHtml(texts.copyId)}</button>
        </div>`,
          )
          .join('')
      : `<div class="ext-source">
          <div class="ext-source-title">${escapeHtml(texts.noSourcesTitle)}</div>
          <div class="muted small">${escapeHtml(texts.noSourcesDesc)}</div>
          <a class="btn ghost ext-copy" href="/sources/new">${escapeHtml(texts.createSource)}</a>
        </div>`
    : `<div class="ext-source">
        <div class="muted small">${escapeHtml(texts.authRequiredDesc)}</div>
        <a class="btn ghost ext-copy" href="/login">${escapeHtml(texts.signInLink)}</a>
      </div>`;

  const body = `
<div class="page-head ext-head">
  <div>
    <h1>${escapeHtml(texts.title)}</h1>
    <p class="muted">${escapeHtml(texts.subtitle)}</p>
    ${data.extensionVersion ? `<p class="small ext-version">${escapeHtml(texts.current)}: <strong>${escapeHtml(data.extensionVersion)}</strong>. ${escapeHtml(texts.updateNote)}</p>` : ''}
  </div>
  <a class="btn primary ext-download" href="/extension/download">
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
    ${escapeHtml(texts.downloadZip)}
  </a>
</div>

<div class="detail-grid">
  <section>
    <h2>${escapeHtml(texts.installTitle)}</h2>
    <ol class="install-steps">${steps}</ol>
    <p class="notice">${escapeHtml(texts.storeSoon)}</p>

    <h2>${escapeHtml(texts.usageTitle)}</h2>
    <div class="ext-features">${features}</div>

    <h2>${escapeHtml(texts.privacyTitle)}</h2>
    <p class="muted small ext-privacy">${texts.privacyDesc}</p>
  </section>

  <aside>
    <h2>${escapeHtml(texts.nodeTitle)}</h2>
    <p class="muted small">${texts.nodeDesc}</p>
    <div id="ping-status" class="ext-ping">${escapeHtml(texts.pingChecking)}</div>
    <div class="ext-source">
      <div class="ext-source-title">${escapeHtml(texts.serverUrl)}</div>
      <code class="ext-source-id" id="detected-url">http://127.0.0.1:8787</code>
      <button class="btn ghost ext-copy" data-copy="detected-url" type="button">${escapeHtml(texts.copyUrl)}</button>
    </div>
    <h3 class="ext-subhead">${escapeHtml(texts.webhookSourcesTitle)}</h3>
    ${sourcesList}
    <div class="ext-source">
      <div class="ext-source-title">${escapeHtml(texts.whereTokenTitle)}</div>
      <div class="muted small">${escapeHtml(texts.whereTokenDesc)}</div>
    </div>
  </aside>
</div>`;

  return layout({
    title: texts.title,
    version,
    active: 'extension',
    body,
    script,
    auth,
    lang,
    head: `<meta name="description" content="${escapeHtml(texts.subtitle)}">
${publicBaseUrl ? `<link rel="canonical" href="${escapeHtml(publicBaseUrl)}/extension">` : ''}`,
  });
}

export interface SubmitPageData {
  version: string;
  auth?: AuthDisplay;
  userHandle?: string;
  githubEnabled?: boolean;
  lang?: SupportedLang;
}

export function renderSubmitPage(data: SubmitPageData): string {
  const { version, userHandle, githubEnabled, lang = 'ru' } = data;
  const t = getTranslations(lang);

  if (!userHandle) {
    const githubButton = githubEnabled
      ? `<a class="btn" href="/auth/github">${escapeHtml(t.signInGithub)}</a>`
      : `<p class="muted small">${escapeHtml(t.noOAuthConfig)}</p>`;
    const guestBody = `
<a class="back" href="/">${escapeHtml(t.backToLeads)}</a>
<div class="empty" style="margin-top:24px">
  <h2>${escapeHtml(t.submitGuestTitle)}</h2>
  <p>${escapeHtml(t.submitGuestDesc)}</p>
  <div style="display:flex;gap:8px;justify-content:center;margin-top:14px">${githubButton}</div>
</div>`;
    return layout({
      title: t.submitTitle,
      version,
      active: 'leads',
      body: guestBody,
      auth: data.auth,
      lang,
    });
  }

  const body = `
<a class="back" href="/">${escapeHtml(t.backToLeads)}</a>
<div class="page-head">
  <div>
    <h1>${escapeHtml(t.submitTitle)}</h1>
    <p class="muted small">${escapeHtml(t.submitSubtitle)}</p>
  </div>
</div>

<form id="submit-form" method="post" action="/submit" class="form" style="max-width:760px">
  <div class="search-bar">
    <div class="search-input-wrap">
      <svg class="search-icon-svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
      <input id="url-input" name="url" type="url" placeholder="${escapeHtml(t.urlPlaceholder)}" aria-label="${escapeHtml(t.urlPlaceholder)}" required autofocus autocomplete="off">
    </div>
    <div class="search-actions-inside">
      <button id="fetch-btn" type="button" class="btn search-btn-inside">${escapeHtml(t.fetchData)}</button>
    </div>
  </div>
  <div id="fetch-status" class="hint" style="margin:6px 0 0 16px;min-height:18px"></div>

  <div id="preview-skeleton" style="display:none;padding:24px 0 32px;border-top:1px solid var(--line);border-bottom:1px solid var(--line)">
    <div class="skeleton" style="height:18px;width:30%;margin-bottom:18px"></div>
    <div class="skeleton" style="height:36px;width:100%;margin-bottom:14px"></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px">
      <div class="skeleton" style="height:34px;width:100%"></div>
      <div class="skeleton" style="height:34px;width:100%"></div>
    </div>
    <div class="skeleton" style="height:100px;width:100%"></div>
  </div>

  <div id="preview-card" class="preview-card">
    <div style="display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--line);padding-bottom:12px">
      <span style="font-size:11px;text-transform:uppercase;letter-spacing:0.08em;font-weight:600;color:var(--muted)">${escapeHtml(t.previewHeader)}</span>
      <div class="type-selector">
        <label class="radio-label">
          <input type="radio" name="leadType" value="gig" id="type-gig" checked>
          <span>${escapeHtml(t.gigType)}</span>
        </label>
        <label class="radio-label">
          <input type="radio" name="leadType" value="job" id="type-job">
          <span>${escapeHtml(t.jobType)}</span>
        </label>
      </div>
    </div>

    <div class="field">
      <label for="title-input">${escapeHtml(t.titleLabel)}</label>
      <input id="title-input" name="title" required placeholder="Например, Разработчик веб-интерфейсов">
    </div>

    <div class="grid">
      <div class="field">
        <label for="author-input">${escapeHtml(t.authorLabel)}</label>
        <input id="author-input" name="author" placeholder="Компания или заказчик">
      </div>
      <div class="field">
        <label for="category-input">${escapeHtml(t.categoryLabel)}</label>
        <input id="category-input" name="category" placeholder="Например: Разработка и IT, Дизайн, Маркетинг...">
      </div>
    </div>

    <div class="grid">
      <div class="field">
        <label for="city-input">${escapeHtml(t.locationLabel)}</label>
        <input id="city-input" name="city" placeholder="Москва, Ставрополь или Удалённо">
      </div>
      <div class="field" style="display:flex;align-items:center;padding-top:20px">
        <label class="radio-label" style="font-size:13px;cursor:pointer">
          <input type="checkbox" id="is-remote-input" name="isRemote" value="true" checked style="accent-color:var(--ink);width:16px;height:16px">
          <span>${escapeHtml(t.isRemoteLabel)}</span>
        </label>
      </div>
    </div>

    <div class="grid">
      <div class="field">
        <label for="budget-input">${escapeHtml(t.budgetLabel)}</label>
        <input id="budget-input" name="budget" type="number" placeholder="Например, 150000">
      </div>
      <div class="field">
        <label for="currency-input">${escapeHtml(t.currencyLabel)}</label>
        <input id="currency-input" name="currency" value="RUB" placeholder="RUB, USD, EUR">
      </div>
    </div>

    <div class="field">
      <label for="skills-input">${escapeHtml(t.skillsLabel)}</label>
      <input id="skills-input" name="skills" placeholder="TypeScript, React, Node.js, PostgreSQL...">
    </div>

    <div class="field">
      <label for="text-input">${escapeHtml(t.descLabel)}</label>
      <textarea id="text-input" name="text" rows="8" required placeholder="Описание вакансии или проекта..." style="width:100%;padding:10px 12px;border:1px solid var(--line);border-radius:6px;background:var(--bg);color:var(--ink);font:inherit;font-size:13px;line-height:1.5;resize:vertical"></textarea>
    </div>

    <div style="display:flex;align-items:center;justify-content:space-between;padding-top:16px;margin-top:12px">
      <div id="submit-status" style="font-size:12px;color:var(--muted)"></div>
      <button id="submit-btn" type="button" class="btn" style="padding:10px 24px;font-size:13.5px">${escapeHtml(t.publish)}</button>
    </div>
  </div>
</form>`;

  const script = `<script>
(function() {
  const urlInput = document.getElementById('url-input');
  const fetchBtn = document.getElementById('fetch-btn');
  const fetchStatus = document.getElementById('fetch-status');
  const previewCard = document.getElementById('preview-card');
  const previewSkeleton = document.getElementById('preview-skeleton');
  const titleInput = document.getElementById('title-input');
  const authorInput = document.getElementById('author-input');
  const categoryInput = document.getElementById('category-input');
  const cityInput = document.getElementById('city-input');
  const isRemoteInput = document.getElementById('is-remote-input');
  const budgetInput = document.getElementById('budget-input');
  const currencyInput = document.getElementById('currency-input');
  const skillsInput = document.getElementById('skills-input');
  const textInput = document.getElementById('text-input');
  const typeJob = document.getElementById('type-job');
  const typeGig = document.getElementById('type-gig');
  const submitBtn = document.getElementById('submit-btn');
  const submitStatus = document.getElementById('submit-status');

  let lastUrl = '';
  let fetching = false;

  async function fetchPreview(manualUrl) {
    const raw = (manualUrl || urlInput.value || '').trim();
    if (!raw || fetching) return;
    if (!/^https?:\\/\\//i.test(raw)) {
      fetchStatus.textContent = 'Укажите ссылку, начиная с http:// или https://';
      fetchStatus.style.color = 'var(--rose)';
      return;
    }
    if (raw === lastUrl) return;

    fetching = true;
    lastUrl = raw;
    fetchBtn.disabled = true;
    fetchStatus.textContent = '${escapeHtml(t.fetching)}';
    fetchStatus.style.color = 'var(--muted)';
    if (previewSkeleton) previewSkeleton.style.display = 'block';
    if (previewCard) previewCard.style.opacity = '0.5';

    try {
      const res = await fetch('/api/preview', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: raw }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'fetch_failed' }));
        throw new Error(err.error || ('HTTP ' + res.status));
      }
      const data = await res.json();
      const p = data.preview || data;
      if (p.type === 'job') {
        typeJob.checked = true;
      } else if (p.type === 'gig') {
        typeGig.checked = true;
      }
      if (p.title) titleInput.value = p.title;
      if (p.author || p.company) authorInput.value = p.author || p.company;
      if (p.category) categoryInput.value = p.category;
      if (p.city) cityInput.value = p.city;
      if (typeof p.isRemote === 'boolean') isRemoteInput.checked = p.isRemote;
      if (p.budget !== undefined && p.budget !== null) budgetInput.value = p.budget;
      if (p.currency) currencyInput.value = p.currency;
      if (Array.isArray(p.skills) && p.skills.length) skillsInput.value = p.skills.join(', ');
      if (p.text) textInput.value = p.text;

      fetchStatus.textContent = 'Данные успешно загружены.';
      fetchStatus.style.color = 'var(--emerald)';
    } catch (err) {
      fetchStatus.textContent = 'Не удалось извлечь данные: ' + err.message;
      fetchStatus.style.color = 'var(--rose)';
    } finally {
      fetching = false;
      fetchBtn.disabled = false;
      if (previewSkeleton) previewSkeleton.style.display = 'none';
      if (previewCard) previewCard.style.opacity = '1';
    }
  }

  fetchBtn.addEventListener('click', () => fetchPreview());

  urlInput.addEventListener('paste', () => {
    setTimeout(() => fetchPreview(), 50);
  });

  urlInput.addEventListener('blur', () => {
    if (urlInput.value.trim() && urlInput.value.trim() !== lastUrl) {
      fetchPreview();
    }
  });

  urlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      fetchPreview();
    }
  });

  async function submitLead() {
    const url = urlInput.value.trim();
    const title = titleInput.value.trim();
    const text = textInput.value.trim();

    if (!url) {
      submitStatus.textContent = 'Введите URL.';
      submitStatus.style.color = 'var(--rose)';
      urlInput.focus();
      return;
    }
    if (!title) {
      submitStatus.textContent = 'Укажите заголовок.';
      submitStatus.style.color = 'var(--rose)';
      titleInput.focus();
      return;
    }
    if (!text) {
      submitStatus.textContent = 'Укажите описание.';
      submitStatus.style.color = 'var(--rose)';
      textInput.focus();
      return;
    }

    submitBtn.disabled = true;
    submitStatus.textContent = '${escapeHtml(t.publishing)}';
    submitStatus.style.color = 'var(--muted)';

    const payload = {
      url,
      title,
      text,
      type: typeJob.checked ? 'job' : 'gig',
      author: authorInput.value.trim() || undefined,
      category: categoryInput.value.trim() || undefined,
      city: cityInput.value.trim() || undefined,
      budget: budgetInput.value ? Number(budgetInput.value) : undefined,
      currency: currencyInput.value.trim() || 'RUB',
      skills: skillsInput.value.trim() ? skillsInput.value.split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean) : undefined,
      isRemote: isRemoteInput.checked,
    };

    try {
      const res = await fetch('/api/submit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'submit_failed' }));
        throw new Error(err.error || ('HTTP ' + res.status));
      }
      const data = await res.json();
      const leadId = data.leadId || data.lead?.id || data.id;
      if (leadId) {
        window.location.href = '/leads/' + encodeURIComponent(leadId);
      } else {
        window.location.href = '/';
      }
    } catch (err) {
      submitStatus.textContent = 'Ошибка публикации: ' + err.message;
      submitStatus.style.color = 'var(--rose)';
      submitBtn.disabled = false;
    }
  }

  submitBtn.addEventListener('click', submitLead);
  document.getElementById('submit-form').addEventListener('submit', (e) => {
    e.preventDefault();
    submitLead();
  });
})();
</script>`;

  return layout({
    title: t.submitTitle,
    version,
    active: 'leads',
    body,
    script,
    auth: data.auth,
    lang,
  });
}

/** One contact as a link where the scheme is safe, otherwise as text. */
function renderContact(contact: Contact): string {
  const value = escapeHtml(contact.value);
  switch (contact.type) {
    case 'telegram':
      return /^@[a-z0-9_]{3,64}$/.test(contact.value)
        ? `<a href="https://t.me/${escapeHtml(contact.value.slice(1))}" rel="nofollow noopener" target="_blank">${value}</a>`
        : value;
    case 'email':
      return `<a href="mailto:${encodeURIComponent(contact.value).replace(/%40/g, '@')}">${value}</a>`;
    case 'phone':
      return /^\+\d{7,15}$/.test(contact.value) ? `<a href="tel:${escapeHtml(contact.value)}">${value}</a>` : value;
    case 'url':
      return /^https?:\/\//i.test(contact.value)
        ? `<a href="${value}" rel="nofollow noopener ugc" target="_blank">${value}</a>`
        : value;
    default:
      return `${escapeHtml(contact.type)}: ${value}`;
  }
}
