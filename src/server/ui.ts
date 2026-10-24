import type { Lead, RunRecord, SourceHealth, SourceRecord, Stats } from '../core/types.ts';
import { escapeHtml, firstLine } from '../core/text.ts';
import { type SupportedLang, getTranslations } from './i18n.ts';

export interface AuthDisplay {
  /** GitHub handle when the session belongs to a registered user. */
  handle?: string;
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
}

export interface SourcesPageData {
  health: SourceHealth[];
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
}

export interface LeadPageData {
  lead: Lead;
  source?: SourceRecord;
  version: string;
  auth?: AuthDisplay;
  lang?: SupportedLang;
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
  webhookSources: SourceRecord[];
  auth?: AuthDisplay;
  lang?: SupportedLang;
  isAuthed?: boolean;
}

const KIND_LABELS: Record<string, string> = {
  rss: 'RSS / Atom',
  telegram: 'Telegram',
  kwork: 'Kwork',
  imap: 'IMAP',
  webhook: 'Webhook',
};

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
  }
}
* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; color-scheme: light dark; }
body {
  margin: 0;
  background: var(--bg);
  color: var(--ink);
  font: 14px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  letter-spacing: -0.01em;
  -webkit-font-smoothing: antialiased;
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
  border-bottom: 1px solid var(--line);
  margin-bottom: 32px;
}
.top-brand-group {
  display: inline-flex;
  align-items: center;
  gap: 10px;
}
.lang-switch {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  padding: 2px 6px;
  border: 1px solid var(--line);
  border-radius: 4px;
  color: var(--muted);
  text-decoration: none;
  transition: all 0.15s ease;
}
.lang-switch:hover {
  color: var(--ink);
  border-color: var(--ink);
  text-decoration: none;
}
.brand {
  font-weight: 700;
  letter-spacing: -0.03em;
  text-decoration: none;
  color: var(--ink);
  font-size: 16px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  transition: opacity 0.15s ease;
}
.brand:hover { opacity: 0.8; }
.version {
  color: var(--muted);
  font-size: 11px;
  font-weight: 500;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 4px;
  padding: 1px 5px;
}
.nav { display: flex; gap: 20px; margin-left: 12px; }
.nav a {
  font-size: 13px;
  font-weight: 500;
  color: var(--muted);
  text-decoration: none;
  padding: 4px 0;
  border-bottom: 1.5px solid transparent;
  transition: color 0.15s ease, border-color 0.15s ease;
}
.nav a:hover { color: var(--ink); text-decoration: none; }
.nav a.active { color: var(--ink); border-color: var(--ink); }
.actions { margin-left: auto; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.auth-handle { font-size: 12.5px; font-weight: 600; color: var(--ink); }
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
.search-bar {
  display: flex;
  gap: 8px;
  width: 100%;
}
.search-bar input {
  flex: 1;
  padding: 10px 14px;
  border: 1px solid var(--line);
  border-radius: 8px;
  font: inherit;
  font-size: 13.5px;
  background: var(--bg);
  color: var(--ink);
  transition: all 0.15s ease;
}
.search-bar input:focus {
  outline: 0;
  border-color: var(--ink);
  box-shadow: 0 0 0 1px var(--ink), 0 2px 4px rgba(0, 0, 0, 0.04);
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
  border: 1px solid var(--line);
  border-radius: 4px;
  padding: 5px 10px;
  font-size: 12px;
  font-weight: 500;
  color: var(--muted);
  cursor: pointer;
  transition: all 0.15s ease;
}
.funnel-btn:hover {
  color: var(--ink);
  border-color: var(--ink);
}
.funnel-btn.active {
  background: var(--ink);
  color: var(--bg);
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
  border: 1px solid var(--line);
  border-radius: 4px;
  padding: 5px 11px;
  font: inherit;
  font-size: 12px;
  font-weight: 500;
  color: var(--ink);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  transition: all 0.15s ease;
}
.vote-btn:hover {
  background: var(--surface-hover);
  border-color: var(--ink);
  transform: translateY(-1px);
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
  background: var(--ink);
  color: var(--bg);
  border: 1px solid var(--ink);
  border-radius: 4px;
  padding: 6px 14px;
  font: inherit;
  font-size: 12.5px;
  font-weight: 500;
  letter-spacing: -0.01em;
  cursor: pointer;
  text-decoration: none;
  line-height: 1.4;
  transition: all 0.15s cubic-bezier(0.16, 1, 0.3, 1);
}
.btn:hover {
  opacity: 0.9;
  text-decoration: none;
  transform: translateY(-1px);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.08);
}
.btn:active { transform: scale(0.97); }
.btn.ghost {
  background: transparent;
  color: var(--ink);
  border: 1px solid var(--line-strong);
  box-shadow: none;
}
.btn.ghost:hover {
  background: var(--surface-hover);
  border-color: var(--ink);
  opacity: 1;
  transform: translateY(-1px);
}
.btn.ghost:active { transform: scale(0.97); }
.btn.danger { border-style: dashed; }
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
.detail-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 260px;
  gap: 36px;
  margin-top: 26px;
}
.lead-text {
  white-space: pre-wrap;
  font-size: 14.5px;
  line-height: 1.65;
  margin: 10px 0 0;
  color: var(--ink);
}
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
.tag {
  display: inline-flex;
  align-items: center;
  background: var(--bg);
  border: 1px solid var(--line);
  border-radius: 5px;
  padding: 2px 8px;
  font-size: 11.5px;
  font-weight: 500;
  color: var(--ink);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.03);
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
  padding-top: 56px;
  padding-bottom: 40px;
  border-top: 1px solid var(--line);
}
.footer-wrap {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 24px;
}
.footer-brand {
  margin: 0 0 4px;
  color: var(--ink);
  font-size: 13px;
}
.footer-nav {
  display: flex;
  gap: 18px;
  flex-wrap: wrap;
  font-size: 12px;
}
.footer-nav a {
  color: var(--muted);
  text-decoration: none;
  transition: color 0.15s ease;
}
.footer-nav a:hover {
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
  .detail-grid { grid-template-columns: 1fr; gap: 28px; }
  .grid { grid-template-columns: 1fr; }
  .search-hero { margin: 8px 0 20px; gap: 12px; }
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

export function layout(input: {
  title: string;
  version: string;
  active?: 'leads' | 'sources' | 'extension';
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
  const nav = (key: 'leads' | 'sources' | 'extension', label: string, href: string): string =>
    `<a href="${href}"${input.active === key ? ' class="active"' : ''}>${label}</a>`;

  const authChip = input.auth
    ? input.auth.handle
      ? `<span class="auth-handle">${escapeHtml(input.auth.handle)}</span><a class="chip" href="/logout">${escapeHtml(t.signOut)}</a>`
      : `<a class="chip" href="/logout">${escapeHtml(t.signOut)}</a>`
    : `<a class="chip" href="/login">${escapeHtml(t.signIn)}</a>`;

  const nextLang = lang === 'ru' ? 'en' : 'ru';
  const langTitle = lang === 'ru' ? 'Switch to English' : 'Переключить на русский';
  const langToggle = `<a class="lang-switch" href="/lang/${nextLang}" title="${langTitle}">${nextLang.toUpperCase()}</a>`;

  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(input.title)} · OpenRadar</title>
${input.head ?? ''}
<style>${STYLE}</style>
</head>
<body>
<main>
<header class="top">
  <div class="top-brand-group">
    <a class="brand" href="/">OpenRadar</a>
    <span class="version">v${escapeHtml(input.version)}</span>
    ${langToggle}
  </div>
  <nav class="nav">
    ${nav('leads', t.navLeads, '/')}
    ${nav('sources', t.navSources, '/sources')}
  </nav>
  <div class="actions">${input.actions ?? ''}${authChip}</div>
</header>
${input.body}
<footer>
  <div class="footer-wrap">
    <div>
      <p class="footer-brand"><b>OpenRadar</b> — ${escapeHtml(t.footerDesc)}</p>
      <p class="muted" style="margin:0">${escapeHtml(t.footerLicense)}</p>
    </div>
    <div class="footer-nav">
      <a href="/extension">${escapeHtml(t.extensionGuide)}</a>
      <a href="https://github.com/MikhailSagalaev/radar-oss" target="_blank" rel="noopener noreferrer">GitHub</a>
      <a href="https://github.com/MikhailSagalaev/radar-oss/blob/main/LICENSE" target="_blank" rel="noopener noreferrer">${escapeHtml(t.licenseLink)}</a>
      <a href="/feed.rss">${escapeHtml(t.rssFeed)}</a>
      <a href="/api/delta">${escapeHtml(t.s3Delta)}</a>
      <a href="/health">${escapeHtml(t.systemStatus)}</a>
    </div>
  </div>
</footer>
</main>
<dialog id="auth-vote-dialog" style="border:1px solid var(--line);border-radius:10px;background:var(--bg);color:var(--ink);padding:24px;max-width:440px;width:calc(100vw - 32px);box-shadow:0 16px 40px rgba(0,0,0,0.2)">
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
    <h3 style="margin:0;font-size:16px;font-weight:600">${escapeHtml(t.voteAuthTitle)}</h3>
    <button type="button" onclick="document.getElementById('auth-vote-dialog').close()" style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:22px;line-height:1;padding:0">&times;</button>
  </div>
  <p class="muted" style="font-size:13px;line-height:1.6;margin:0 0 20px">
    ${escapeHtml(t.voteAuthDesc)}
  </p>
  <div style="display:flex;justify-content:flex-end;gap:10px">
    <button class="btn ghost" type="button" onclick="document.getElementById('auth-vote-dialog').close()">${escapeHtml(t.cancel)}</button>
    <a class="btn" href="/auth/github">${escapeHtml(t.signInGithub)}</a>
  </div>
</dialog>
<script>
function openAuthVoteModal() {
  const dlg = document.getElementById('auth-vote-dialog');
  if (dlg && typeof dlg.showModal === 'function') {
    dlg.showModal();
  } else {
    window.location.href = '/login';
  }
}
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

function formatBudget(value: number | undefined): string {
  if (typeof value !== 'number') return '—';
  return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(value)} ₽`;
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

function metric(value: string | number, label: string): string {
  return `<div class="metric"><b>${escapeHtml(String(value))}</b><span>${escapeHtml(label)}</span></div>`;
}

function metricRow(values: Array<{ value: string | number; label: string }>): string {
  return `<div class="metrics">${values.map((item) => metric(item.value, item.label)).join('')}</div>`;
}

function leadTitle(lead: Lead): string {
  return lead.title.trim() || firstLine(lead.text, 100) || 'Без заголовка';
}

function leadRow(lead: Lead, source?: SourceRecord, lang: SupportedLang = 'ru'): string {
  const t = getTranslations(lang);
  const meta = [
    lead.type === 'job' ? t.jobType : t.gigType,
    source?.title,
    lead.category,
    lead.city ?? (lead.isRemote !== false ? t.remote : undefined),
    lead.rawSalary || (typeof lead.budget === 'number' ? formatBudget(lead.budget) : undefined),
    formatRelative(lead.createdAt, lang),
  ]
    .filter(Boolean)
    .join(' · ');

  const signals: string[] = [];
  if (lead.score >= 80) {
    signals.push(t.signalHighScore);
  }
  if (lead.normalizedUsdMin || lead.budget || lead.rawSalary) {
    signals.push(t.signalMarketBudget);
  }
  if (lead.reasons?.some((r) => r.includes('direct') || r.includes('employer')) || (lead.author && !lead.author.toLowerCase().includes('агентство'))) {
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
    details.push(escapeHtml(lead.skills.slice(0, 5).join(', ')));
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
      <span class="score">${lead.score}</span>
      <span>${statusDot(lead.status, lang)}</span>
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
        <td class="small">${formatBudget(lead.budget)}</td>
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
  const sourceById = new Map(health.map((item) => [item.source.id, item.source]));

  const typeTabs: Array<{ key: string; label: string }> = [
    { key: '', label: t.all },
    { key: 'gig', label: t.gigs },
    { key: 'job', label: t.jobs },
  ];

  const statusFilters: Array<{ key: string; label: string }> = [
    { key: '', label: t.statusAll },
    { key: 'new', label: t.statusNew },
    { key: 'interesting', label: t.statusInteresting },
    { key: 'applied', label: t.statusApplied },
    { key: 'in_work', label: t.statusInWork },
    { key: 'delivered', label: t.statusDelivered },
    { key: 'rejected', label: t.statusRejected },
  ];

  const hrefForType = (nextType: string): string => {
    const params = new URLSearchParams();
    if (nextType) params.set('type', nextType);
    if (status) params.set('status', status);
    if (query) params.set('q', query);
    const suffix = params.toString();
    return suffix ? `/?${suffix}` : '/';
  };

  const hrefForStatus = (nextStatus: string): string => {
    const params = new URLSearchParams();
    if (type) params.set('type', type);
    if (nextStatus) params.set('status', nextStatus);
    if (query) params.set('q', query);
    const suffix = params.toString();
    return suffix ? `/?${suffix}` : '/';
  };

  const rssParams = new URLSearchParams();
  if (type) rssParams.set('type', type);
  if (status) rssParams.set('status', status);
  if (query) rssParams.set('q', query);
  const rssSuffix = rssParams.toString();
  const rssHref = rssSuffix ? `/feed.rss?${rssSuffix}` : '/feed.rss';

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

  const rows = leads.map((lead) => leadRow(lead, sourceById.get(lead.sourceId), lang)).join('');

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
          <button class="btn" data-poll="/api/poll">${escapeHtml(t.pollAll)}</button>
        </div>`;

  const body = `
<div class="search-hero">
  <div class="type-tabs">${tabs}</div>
  <form class="search-form" method="get" action="/">
    ${type ? `<input type="hidden" name="type" value="${escapeHtml(type)}">` : ''}
    ${status ? `<input type="hidden" name="status" value="${escapeHtml(status)}">` : ''}
    <div class="search-bar">
      <input name="q" id="search-input" value="${escapeHtml(query)}" placeholder="${escapeHtml(t.searchPlaceholder)}" aria-label="${escapeHtml(t.searchBtn)}">
      <button class="btn" type="submit">${escapeHtml(t.searchBtn)}</button>
      <a class="btn ghost" href="${escapeHtml(rssHref)}" target="_blank" rel="noopener" title="RSS">RSS</a>
    </div>
  </form>
  <div class="chips">${chips}</div>
</div>

<div class="list">${rows || empty}</div>`;

  const searchHotkeyScript = `
${POLL_SCRIPT}
<script>
window.addEventListener('keydown', (e) => {
  if (e.key === '/' && document.activeElement?.tagName !== 'INPUT') {
    e.preventDefault();
    document.getElementById('search-input')?.focus();
  }
});
</script>`;

  const pageTitle = query
    ? `${query} — ${t.searchBtn}`
    : type === 'job'
    ? t.jobs
    : type === 'gig'
    ? t.gigs
    : t.navLeads;

  return layout({
    title: pageTitle,
    version,
    active: 'leads',
    body,
    actions: `<a class="btn" href="/submit">${escapeHtml(t.submitByUrl)}</a>`,
    script: searchHotkeyScript,
    auth: data.auth,
    lang,
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
document.getElementById('copy-lead')?.addEventListener('click', async (event) => {
  const button = event.currentTarget;
  try {
    await navigator.clipboard.writeText(document.getElementById('lead-text')?.innerText ?? '');
    const prev = button.textContent;
    button.textContent = '${escapeHtml(t.copied)}';
    setTimeout(() => { button.textContent = prev; }, 2000);
  } catch {
    button.textContent = '${escapeHtml(t.copyFailed)}';
  }
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

  const salaryDisplay = lead.rawSalary
    ? escapeHtml(lead.rawSalary)
    : formatBudget(lead.budget);
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

  const voteControls = isUser
    ? `<form method="post" action="/leads/${escapeHtml(lead.id)}/vote" class="community-votes">
    <span class="small muted" style="margin-right:4px">${escapeHtml(t.community)}:</span>
    <button name="signal" value="useful" class="vote-btn" type="submit">${escapeHtml(t.useful)} <span class="vote-count">${lead.votes_up ?? 0}</span></button>
    <button name="signal" value="junk" class="vote-btn" type="submit">${escapeHtml(t.junk)} <span class="vote-count">${lead.votes_down ?? 0}</span></button>
    <button name="signal" value="scam" class="vote-btn vote-btn-danger" type="submit">${escapeHtml(t.scam)} <span class="vote-count">${lead.votes_scam ?? 0}</span></button>
    <button name="signal" value="closed" class="vote-btn" type="submit">${escapeHtml(t.closed)} <span class="vote-count">${lead.votes_closed ?? 0}</span></button>
  </form>`
    : `<div class="community-votes">
    <span class="small muted" style="margin-right:4px">${escapeHtml(t.community)}:</span>
    <button type="button" class="vote-btn" onclick="openAuthVoteModal()">${escapeHtml(t.useful)} <span class="vote-count">${lead.votes_up ?? 0}</span></button>
    <button type="button" class="vote-btn" onclick="openAuthVoteModal()">${escapeHtml(t.junk)} <span class="vote-count">${lead.votes_down ?? 0}</span></button>
    <button type="button" class="vote-btn vote-btn-danger" onclick="openAuthVoteModal()">${escapeHtml(t.scam)} <span class="vote-count">${lead.votes_scam ?? 0}</span></button>
    <button type="button" class="vote-btn" onclick="openAuthVoteModal()">${escapeHtml(t.closed)} <span class="vote-count">${lead.votes_closed ?? 0}</span></button>
    <button type="button" class="chip" onclick="openAuthVoteModal()">${escapeHtml(t.signInToVote)}</button>
  </div>`;

  const body = `
<a class="back" href="/">${escapeHtml(t.backToLeads)}</a>
<div class="page-head">
  <div>
    <h1>${escapeHtml(leadTitle(lead))}</h1>
    <p class="muted small">${statusDot(lead.status, lang)} · ${formatRelative(lead.createdAt, lang)}</p>
  </div>
  <div class="actions lead-actions">
    ${cleanUrl ? `<a class="btn" href="${escapeHtml(cleanUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(t.openOriginal)}</a>` : ''}
    <button class="btn ghost" id="copy-lead" type="button">${escapeHtml(t.copyText)}</button>
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
    <p class="lead-text" id="lead-text">${escapeHtml(lead.text)}</p>
    ${lead.reasons.length ? `<h2 style="margin-top:26px">${escapeHtml(t.scoreReasons)}</h2><ul class="reasons">${lead.reasons.map((reason) => `<li>${escapeHtml(reason)}</li>`).join('')}</ul>` : ''}
  </section>
  <aside>
    <h2>${escapeHtml(t.details)}</h2>
    <dl class="meta-list">
      <div><dt>${escapeHtml(t.type)}</dt><dd>${lead.type === 'job' ? escapeHtml(t.jobType) : escapeHtml(t.gigType)}</dd></div>
      <div><dt>${escapeHtml(t.votes)}</dt><dd>+${lead.votes_up ?? 0} / -${lead.votes_down ?? 0} / ${escapeHtml(t.scam)}: ${lead.votes_scam ?? 0} / ${escapeHtml(t.closed)}: ${lead.votes_closed ?? 0}</dd></div>
      <div><dt>${escapeHtml(t.source)}</dt><dd>${source ? `<a href="/sources/${escapeHtml(source.id)}">${escapeHtml(source.title)}</a>` : escapeHtml(lead.sourceId)}</dd></div>
      ${lead.category ? `<div><dt>${escapeHtml(t.category)}</dt><dd><b>${escapeHtml(lead.category)}</b></dd></div>` : ''}
      <div><dt>${escapeHtml(t.location)}</dt><dd>${escapeHtml(lead.city ?? (lead.isRemote !== false ? t.remote : '—'))}</dd></div>
      <div><dt>${escapeHtml(t.format)}</dt><dd>${lead.isRemote !== false ? escapeHtml(t.remoteFormat) : escapeHtml(t.onsiteFormat)}</dd></div>
      <div><dt>${escapeHtml(t.budget)}</dt><dd>${salaryDisplay}${usdEstimate}</dd></div>
      <div><dt>${escapeHtml(t.score)}</dt><dd>${lead.score}</dd></div>
      <div><dt>${escapeHtml(t.published)}</dt><dd>${formatDate(lead.publishedAt, lang)}</dd></div>
      <div><dt>${escapeHtml(t.added)}</dt><dd>${formatDate(lead.createdAt, lang)}</dd></div>
      ${lead.author ? `<div><dt>${escapeHtml(t.author)}</dt><dd>${escapeHtml(lead.author)}</dd></div>` : ''}
    </dl>
    ${lead.skills?.length ? `
      <h2 style="margin-top:20px">${escapeHtml(t.skills)}</h2>
      <p class="small muted" style="line-height:1.6;margin-top:6px">
        ${escapeHtml(lead.skills.join(', '))}
      </p>` : ''}
  </aside>
</div>`;

  return layout({
    title: leadTitle(lead),
    version,
    active: 'leads',
    body,
    script: copyScript,
    auth: data.auth,
    lang,
  });
}

export function renderSourcesPage(data: SourcesPageData): string {
  const { health, version, lang = 'ru' } = data;
  const t = getTranslations(lang);
  const rows = health
    .map((item) => {
      const status = healthStatus(item);
      const error = item.lastRun?.error;
      return `<a class="row" href="/sources/${escapeHtml(item.source.id)}">
        <div>
          <div class="row-title">${escapeHtml(item.source.title)}</div>
          <div class="row-meta">${escapeHtml(KIND_LABELS[item.source.kind] ?? item.source.kind)} · <span class="dot ${status.dot}"></span>${status.label} · ${formatRelative(item.lastRun?.startedAt, lang)}</div>
          ${error ? `<div class="row-meta error">${escapeHtml(error)}</div>` : ''}
        </div>
        <div class="row-side">${item.last24h.found} / ${item.last24h.inserted} / ${item.last24h.delivered}</div>
      </a>`;
    })
    .join('');

  const empty = `<div class="empty">
    <h2>Источников пока нет</h2>
    <p>Начните с готового набора популярных бирж (FL.ru, Хабр, Kwork, Telegram) или добавьте свой источник вручную.</p>
    <div style="display:flex;gap:8px;justify-content:center;margin-top:14px">
      <form method="post" action="/sources/presets">
        <button class="btn" type="submit">Загрузить популярные биржи</button>
      </form>
      <a class="btn ghost" href="/sources/new">Добавить вручную</a>
    </div>
  </div>`;

  const body = `
<div class="page-head">
  <div>
    <h1>${escapeHtml(t.navSources)}</h1>
    <p class="muted small">${health.length} ${plural(health.length, ['источник', 'источника', 'источников'])} · ${health.filter((item) => item.source.enabled).length} активных · 24ч: найдено / новых / доставлено</p>
  </div>
</div>
<div class="list">${rows || empty}</div>`;

  return layout({
    title: t.navSources,
    version,
    active: 'sources',
    body,
    actions:
      `<form method="post" action="/sources/presets" style="display:inline"><button class="btn ghost" type="submit">Загрузить биржи</button></form><a class="btn" href="/sources/new">${escapeHtml(t.addSource)}</a>`,
    auth: data.auth,
    lang,
  });
}

export function renderSourcePage(data: SourcePageData): string {
  const { source, health, leads, runs, version, notice, lang = 'ru' } = data;
  const t = getTranslations(lang);
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
    actions: `<button class="btn" data-poll="/api/sources/${escapeHtml(source.id)}/poll">Опросить</button>
      <a class="btn ghost" href="/sources/${escapeHtml(source.id)}/edit">Редактировать</a>
      <form class="inline" method="post" action="/sources/${escapeHtml(source.id)}/toggle">
        <button class="btn ghost" type="submit">${source.enabled ? 'Выключить' : 'Включить'}</button>
      </form>
      <form class="inline" method="post" action="/sources/${escapeHtml(source.id)}/delete" onsubmit="return confirm('Удалить источник?')">
        <button class="btn ghost danger" type="submit">Удалить</button>
      </form>`,
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
  const options = kinds
    .map(
      (kind) =>
        `<option value="${escapeHtml(kind)}"${kind === values.kind ? ' selected' : ''}>${escapeHtml(KIND_LABELS[kind] ?? kind)}</option>`,
    )
    .join('');

  const body = `
<a class="back" href="${editing && sourceId ? `/sources/${escapeHtml(sourceId)}` : '/sources'}">← Источники</a>
<div class="page-head">
  <div>
    <h1>${editing ? 'Редактировать источник' : 'Новый источник'}</h1>
    <p class="muted small">${editing ? 'Название и фильтры можно менять. Тип источника фиксирован.' : 'RSS и IMAP — самые устойчивые. Telegram и Kwork зависят от публичной вёрстки. Webhook принимает данные от расширения или другого сервиса.'}</p>
  </div>
</div>
${error ? `<div class="error-box" style="margin-bottom:16px">${escapeHtml(error)}</div>` : ''}

<form class="form" method="post" action="${escapeHtml(action)}">
  <div class="grid">
    <label class="field">Тип
      <select name="${editing ? 'kind-disabled' : 'kind'}" id="kind"${editing ? ' disabled' : ''}>${options}</select>
      ${editing ? `<input type="hidden" name="kind" value="${escapeHtml(values.kind)}">` : ''}
    </label>
    <label class="field">Название
      <input name="title" value="${escapeHtml(values.title)}" placeholder="Например, Городские чаты" required>
    </label>
  </div>

  <div data-kind="rss">
    ${textField('url', 'URL фида', values.url, 'https://example.com/rss', 'url', 'RSS или Atom. Самый безопасный источник.')}
  </div>

  <div data-kind="telegram">
    ${textField('channel', 'Публичный канал', values.channel, 'stavropol_jobs', 'text', 'Без @. Читается только публичный preview t.me/s/.')}
  </div>

  <div data-kind="kwork">
    ${textField('categoryId', 'ID рубрики Kwork', values.categoryId, '11', 'text', 'Необязательно. Пусто — все проекты.')}
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
  </fieldset>

  <div>
    <button class="btn" type="submit">${escapeHtml(submitLabel)}</button>
  </div>
</form>

<script>
const kind = document.getElementById('kind');
function syncKind() {
  if (!kind) return;
  for (const group of document.querySelectorAll('[data-kind]')) {
    group.hidden = group.dataset.kind !== kind.value;
  }
}
kind?.addEventListener('change', syncKind);
syncKind();
</script>`;

  return layout({
    title: editing ? 'Редактировать источник' : 'Новый источник',
    version,
    active: 'sources',
    body,
    actions: '<a class="btn ghost" href="/sources">Отмена</a>',
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

export function renderNotFound(version: string, lang: SupportedLang = 'ru'): string {
  const t = getTranslations(lang);
  return layout({
    title: t.emptyTitle,
    version,
    body: `<div class="page-head"><div><h1>${escapeHtml(t.emptyTitle)}</h1><p class="muted small">${escapeHtml(t.emptyDesc)}</p></div></div><a class="btn" href="/">${escapeHtml(t.backToLeads)}</a>`,
    lang,
  });
}

export function renderExtensionPage(data: ExtensionPageData): string {
  const { version, webhookSources, auth, lang, isAuthed } = data;
  const script = `<script>
document.addEventListener('DOMContentLoaded', () => {
  const urlEl = document.getElementById('detected-url');
  if (urlEl) urlEl.textContent = window.location.origin;

  fetch('/api/ping')
    .then((r) => r.json())
    .then((d) => {
      const pingEl = document.getElementById('ping-status');
      if (pingEl && d.ok) {
        pingEl.textContent = 'Сервер онлайн (v' + (d.version || '') + ')';
        pingEl.style.color = '#059669';
      }
    })
    .catch(() => {});

  document.querySelectorAll('[data-copy]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const targetId = btn.getAttribute('data-copy');
      const target = document.getElementById(targetId);
      if (target) {
        await navigator.clipboard.writeText(target.textContent || target.value || '');
        const prev = btn.textContent;
        btn.textContent = 'Скопировано!';
        setTimeout(() => { btn.textContent = prev; }, 2000);
      }
    });
  });
});
</script>`;

  const sourcesList = isAuthed
    ? (webhookSources.length
        ? webhookSources
            .map(
              (s) => `
          <div style="background:var(--surface);border:1px solid var(--line);border-radius:6px;padding:12px;display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
            <div>
              <div style="font-weight:600;font-size:13px">${escapeHtml(s.title)}</div>
              <div class="muted small">ID: <code id="src-id-${escapeHtml(s.id)}">${escapeHtml(s.id)}</code></div>
            </div>
            <button class="btn ghost" data-copy="src-id-${escapeHtml(s.id)}" type="button" style="font-size:11px;padding:4px 8px">Копировать ID</button>
          </div>`
            )
            .join('')
        : `<div class="empty" style="padding:20px 14px">
            <div style="font-weight:600;margin-bottom:4px">Нет активного Webhook-источника</div>
            <div class="muted small" style="margin-bottom:12px">Создайте источник типа Webhook, чтобы принимать лиды из браузера.</div>
            <a class="btn" href="/sources/new">Создать источник Webhook</a>
          </div>`)
    : `<div style="background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:14px">
        <div style="font-weight:600;font-size:12.5px;margin-bottom:4px">Параметры источников</div>
        <div class="muted small" style="margin-bottom:12px">Чтобы увидеть список ваших Webhook-источников и скопировать их ID, войдите в панель управления.</div>
        <a class="btn ghost" href="/login" style="font-size:12px;padding:5px 12px;text-decoration:none">Войти в систему →</a>
      </div>`;

  const body = `
<div class="page-head" style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap">
  <div>
    <h1>Расширение для браузера</h1>
    <p class="muted small">Захват вакансий и заказов в один клик с любых сайтов, бирж и чатов прямо в вашу базу OpenRadar.</p>
  </div>
  <div style="display:flex;gap:10px;align-items:center">
    <a class="btn primary" href="/extension/download" style="display:inline-flex;align-items:center;gap:7px;font-weight:600;text-decoration:none">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
      Скачать extension.zip
    </a>
  </div>
</div>

<div class="detail-grid">
  <section>
    <h2>Быстрая установка (Manifest V3)</h2>
    <div style="display:grid;gap:12px;margin-bottom:28px">
      <div style="background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:14px">
        <div style="font-weight:600;margin-bottom:4px">1. Скачайте и распакуйте архив</div>
        <div class="muted small">Нажмите кнопку <b>«Скачать extension.zip»</b> выше или возьмите готовую папку <code>extension/</code> из репозитория проекта. Распакуйте её в удобное место на диске.</div>
      </div>
      <div style="background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:14px">
        <div style="font-weight:600;margin-bottom:4px">2. Откройте управление расширениями в браузере</div>
        <div class="muted small">В адресной строке Chrome, Edge, Яндекс.Браузера или Brave введите: <code>chrome://extensions/</code> и включите тумблер <b>«Режим разработчика»</b> (в правом верхнем углу).</div>
      </div>
      <div style="background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:14px">
        <div style="font-weight:600;margin-bottom:4px">3. Загрузите распакованное расширение</div>
        <div class="muted small">Нажмите <b>«Загрузить распакованное расширение»</b> (Load unpacked) и выберите распакованную папку. На панели появится иконка OpenRadar!</div>
      </div>
      <div style="background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:14px">
        <div style="font-weight:600;margin-bottom:4px">4. Настройте адрес сервера и токен</div>
        <div class="muted small">Кликните по иконке OpenRadar → раскройте <b>«Настройки подключения»</b>. Скопируйте адрес сервера и ID источника из блока справа, введите секретный токен источника и нажмите <b>«Проверить»</b>.</div>
      </div>
    </div>

    <h2>Как пользоваться расширением</h2>
    <div style="display:grid;gap:12px;margin-bottom:28px">
      <div style="background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:14px">
        <div style="font-weight:600;margin-bottom:4px">⚡ Отправка всей страницы (горячие клавиши Alt+Shift+R)</div>
        <div class="muted small">Находясь на любой странице с вакансией или заказом, нажмите <b>Alt+Shift+R</b> или иконку на панели. Расширение автоматически считает заголовок, URL и описание. Если на сайте есть разметка <code>schema.org/JobPosting</code> (HH, SuperJob, LinkedIn), расширение автоматически определит зарплату, компанию, город и стек навыков!</div>
      </div>
      <div style="background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:14px">
        <div style="font-weight:600;margin-bottom:4px">✂️ Отправка фрагмента текста (Контекстное меню)</div>
        <div class="muted small">Выделите мышью любой текст на бирже (Kwork, FL, Habr Freelance, Telegram Web, Avito, чаты) → Нажмите правую кнопку мыши:
          <ul style="margin:6px 0 0 16px;padding:0">
            <li><b>«Отправить заказ в Radar»</b> — сохранит лид с типом «Заказ» (Gig).</li>
            <li><b>«Отправить вакансию в Radar»</b> — сохранит лид с типом «Вакансия» (Job).</li>
          </ul>
        После отправки в браузере появится уведомление, по клику на которое сразу откроется карточка лида!</div>
      </div>
      <div style="background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:14px">
        <div style="font-weight:600;margin-bottom:4px">🏷 Подпись и авторство лидов</div>
        <div class="muted small">В поле «Ваш никнейм (@telegram)» укажите свой ник. Все переданные вами лиды будут сохранены с подписью контрибьютора комьюнити, что позволяет отслеживать активность команды.</div>
      </div>
    </div>

    <h2>Безопасность и приватность</h2>
    <div style="background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:14px">
      <div class="muted small">Расширение полностью локальное и Open Source. Токен и настройки хранятся только в защищённом хранилище вашего браузера (<code>chrome.storage.local</code>) и отправляются исключительно на ваш собственный сервер OpenRadar. Расширение не собирает историю посещений и активно только при нажатии горячих клавиш или выборе в меню.</div>
    </div>
  </section>

  <aside>
    <h2>Параметры для настройки</h2>
    <div id="ping-status" style="font-size:12px;font-weight:600;color:var(--muted);margin-bottom:12px">Проверка доступности сервера...</div>

    <dl class="meta-list" style="margin-bottom:16px">
      <div>
        <dt>Адрес сервера OpenRadar</dt>
        <dd><code id="detected-url">http://127.0.0.1:8787</code></dd>
      </div>
    </dl>
    <button class="btn ghost" style="width:100%;margin-bottom:24px" data-copy="detected-url" type="button">Копировать адрес сервера</button>

    <h2>Источники Webhook</h2>
    <div class="muted small" style="margin-bottom:10px">Выберите подходящий источник и скопируйте его ID в расширение:</div>
    ${sourcesList}

    <div style="margin-top:24px;padding:14px;background:var(--surface);border:1px solid var(--line);border-radius:8px">
      <div style="font-weight:600;font-size:12px;margin-bottom:4px">Где взять токен источника?</div>
      <div class="muted small">Токен источника генерируется один раз при создании источника командой CLI:<br>
      <code>node bin/radar.js source add --kind webhook --title "Browser"</code><br>
      Если вы забыли токен, создайте новый источник Webhook в панели управления.</div>
    </div>
  </aside>
</div>`;

  return layout({
    title: 'Расширение для браузера',
    version,
    active: 'extension',
    body,
    script,
    auth,
    lang,
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
  <div style="display:flex;gap:10px;align-items:flex-start">
    <div style="flex:1">
      <input id="url-input" name="url" type="url" placeholder="${escapeHtml(t.urlPlaceholder)}" required autofocus style="width:100%;padding:10px 14px;border:1px solid var(--line);border-radius:6px;background:var(--bg);color:var(--ink);font:inherit;font-size:13.5px">
      <div id="fetch-status" class="hint" style="margin-top:6px;min-height:18px"></div>
    </div>
    <button id="fetch-btn" type="button" class="btn" style="padding:10px 18px;white-space:nowrap">${escapeHtml(t.fetchData)}</button>
  </div>

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

