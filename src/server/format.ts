import type { SupportedLang } from './i18n.ts';
import { CONTACT_PLACEHOLDER } from '../core/contacts.ts';
import { escapeHtml } from '../core/text.ts';

export interface FormattedText {
  html: string;
  /** Hashtags from a «Требуемые навыки: #a, #b» line or Freelancer «(Budget: …, Jobs: …)», shown as tags instead. */
  tags: string[];
}

const URL_RE = /\bhttps?:\/\/[^\s<>"«»]+[^\s<>"«».,;:!?)\]]/giu;
const SKILLS_LINE_RE = /(?:Требуемые\s+навыки|Ключевые\s+навыки|Навыки|Skills|Tags)\s*:\s*((?:#[\p{L}\p{N}_+.\/-]+[,;\s]*)+)\.?/giu;
const FREELANCER_TRAILER_RE = /\s*\(\s*Budget\s*:[^,]+,\s*Jobs\s*:\s*(.+)\)\s*$/isu;
const HASHTAG_RE = /#([\p{L}\p{N}_+.\/-]{2,40})/gu;
const BULLET_RE = /^\s*(?:[-–—•*·▪●]|\d{1,2}[.)])\s+/u;
const MD_HEADING_RE = /^#{1,6}\s+(.+)$/u;
const BOLD_HEADING_RE = /^\*\*([^*\n]{2,75})\*\*:?\s*$/u;
const ADAPTER_HEADER_LINE_RE = /^(?:Вакансия\s+компании|Создана|Регион|Предполагаемый\s+уровень\s+месячного\s+дохода|Компания|Город|Работодатель|Company|Location|City|Department|Team|Type|Category|Model)\s*:\s*[^\n]{1,140}$/iu;
const STANDALONE_REMOTE_LINE_RE = /^(?:Удалённо|Удаленно|Remote)$/iu;

/** A wall of text longer than this, with no line breaks, is split into paragraphs. */
const WALL_LENGTH = 420;
const PARAGRAPH_TARGET = 280;

function formatEscapedSegment(raw: string): string {
  return escapeHtml(raw).replace(/\*\*([^*\n]{1,120})\*\*/g, '<strong>$1</strong>');
}

/** Escapes text, turns URLs into links, renders **bold**, and turns the contact placeholder into a muted label. */
function inline(text: string, lang: SupportedLang = 'ru'): string {
  let out = '';
  let last = 0;
  for (const match of text.matchAll(URL_RE)) {
    const index = match.index ?? 0;
    out += formatEscapedSegment(text.slice(last, index));
    const url = match[0];
    const label = url.length > 60 ? `${url.slice(0, 57)}…` : url;
    out += `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer nofollow ugc">${escapeHtml(label)}</a>`;
    last = index + url.length;
  }
  out += formatEscapedSegment(text.slice(last));
  return out.replaceAll(
    escapeHtml(CONTACT_PLACEHOLDER),
    `<button type="button" class="redacted-btn" onclick="openLoginModal()" title="${lang === 'en' ? 'Sign in to see contacts' : 'Войдите, чтобы увидеть контакты'}">${escapeHtml(CONTACT_PLACEHOLDER)}</button>`,
  );
}

/** Splits a one-line wall of text on sentence ends into paragraphs of a readable size. */
function splitWall(block: string): string[] {
  const sentences = block.split(/(?<=[.!?…])\s+(?=[«"(]?[A-ZА-ЯЁ0-9])/u);
  const paragraphs: string[] = [];
  let current = '';
  for (const sentence of sentences) {
    current = current ? `${current} ${sentence}` : sentence;
    if (current.length >= PARAGRAPH_TARGET) {
      paragraphs.push(current);
      current = '';
    }
  }
  if (current) paragraphs.push(current);
  return paragraphs;
}

function normalizeTitleCompare(s: string): string {
  return s.trim().toLowerCase().replace(/[\s.,;:!?…—–-]+$/g, '');
}

/**
 * Strips redundant adapter-injected header lines at the top of lead.text (duplicate title,
 * «Вакансия компании:», «Создана:», «Регион:», «Предполагаемый уровень месячного дохода:»,
 * «Компания:», «Город:», «Company:», «Location:», «Department:», «Type:») when body text follows.
 */
export function stripLeadingMetadata(text: string, title?: string): string {
  const lines = text.split('\n');
  const normTitle = title ? normalizeTitleCompare(title) : '';
  let idx = 0;
  let strippedAny = false;
  while (idx < lines.length && idx < 10) {
    const trimmed = lines[idx]!.trim();
    if (!trimmed) {
      idx += 1;
      continue;
    }
    const normLine = normalizeTitleCompare(trimmed);
    const isDupTitle = Boolean(normTitle && normLine && (normLine === normTitle || (normTitle.length >= 25 && normLine.startsWith(normTitle.slice(0, 35)))));
    if (isDupTitle || ADAPTER_HEADER_LINE_RE.test(trimmed) || (strippedAny && STANDALONE_REMOTE_LINE_RE.test(trimmed))) {
      strippedAny = true;
      idx += 1;
      continue;
    }
    break;
  }
  if (!strippedAny) return text;
  const rest = lines.slice(idx).join('\n').trim();
  return rest.length >= 15 ? rest : text;
}

function renderLine(line: string, lang: SupportedLang): string {
  const mdMatch = MD_HEADING_RE.exec(line.trim());
  if (mdMatch?.[1]) {
    return `<strong>${inline(mdMatch[1].trim(), lang)}</strong>`;
  }
  const boldMatch = BOLD_HEADING_RE.exec(line.trim());
  if (boldMatch?.[1]) {
    return `<strong>${inline(boldMatch[1].trim(), lang)}</strong>`;
  }
  if (line.length < 70 && /:\s*$/.test(line)) {
    return `<strong>${inline(line, lang)}</strong>`;
  }
  return inline(line, lang);
}

function renderBlock(block: string, lang: SupportedLang = 'ru'): string {
  const lines = block.split('\n').map((line) => line.trimEnd()).filter((line) => line.trim());
  if (!lines.length) return '';
  const bullets = lines.filter((line) => BULLET_RE.test(line));
  // A list: every line after an optional heading is a bullet.
  if (bullets.length >= 2 && bullets.length >= lines.length - 1) {
    const first = lines[0]!.trim().replace(MD_HEADING_RE, '$1').replace(BOLD_HEADING_RE, '$1');
    const heading = BULLET_RE.test(lines[0]!) ? '' : `<p class="lead-heading">${inline(first, lang)}</p>`;
    return `${heading}<ul>${bullets.map((line) => `<li>${inline(line.replace(BULLET_RE, ''), lang)}</li>`).join('')}</ul>`;
  }
  if (lines.length === 1) {
    const single = lines[0]!.trim();
    const mdHeading = MD_HEADING_RE.exec(single);
    if (mdHeading?.[1] && mdHeading[1].length < 90) {
      return `<p class="lead-heading">${inline(mdHeading[1].trim(), lang)}</p>`;
    }
    const boldHeading = BOLD_HEADING_RE.exec(single);
    if (boldHeading?.[1]) {
      return `<p class="lead-heading">${inline(boldHeading[1].trim(), lang)}</p>`;
    }
    if (single.length > WALL_LENGTH) {
      return splitWall(single).map((p) => `<p>${inline(p, lang)}</p>`).join('');
    }
  }
  return `<p>${lines.map((line) => renderLine(line, lang)).join('<br>')}</p>`;
}

/** Lead text as readable HTML: paragraphs, lists, links; skill hashtags lifted into tags. */
export function formatLeadText(text: string, lang: SupportedLang = 'ru', title?: string): FormattedText {
  const tags: string[] = [];
  let cleaned = (text || '').replace(/\r\n?/g, '\n');
  cleaned = stripLeadingMetadata(cleaned, title);
  cleaned = cleaned.replace(SKILLS_LINE_RE, (_all, list: string) => {
    for (const match of list.matchAll(HASHTAG_RE)) tags.push(match[1]!.replace(/[.,;\/-]+$/, ''));
    return '';
  });
  cleaned = cleaned.replace(FREELANCER_TRAILER_RE, (_all, jobsList: string) => {
    for (const item of jobsList.split(',')) {
      const tag = item.trim();
      if (tag && tag.length <= 40 && tags.length < 8) tags.push(tag);
    }
    return '';
  });
  const blocks = cleaned.trim().split(/\n\s*\n/);
  return { html: blocks.map((b) => renderBlock(b, lang)).join(''), tags: Array.from(new Set(tags)) };
}
