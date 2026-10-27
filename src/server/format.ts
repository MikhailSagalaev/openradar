import { CONTACT_PLACEHOLDER } from '../core/contacts.ts';
import { escapeHtml } from '../core/text.ts';

export interface FormattedText {
  html: string;
  /** Hashtags from a «Требуемые навыки: #a, #b» line, shown as tags instead. */
  tags: string[];
}

const URL_RE = /\bhttps?:\/\/[^\s<>"«»]+[^\s<>"«».,;:!?)\]]/giu;
const SKILLS_LINE_RE = /(?:Требуемые\s+навыки|Ключевые\s+навыки|Навыки|Skills|Tags)\s*:\s*((?:#[\p{L}\p{N}_+./-]+[,;\s]*)+)\.?/giu;
const HASHTAG_RE = /#([\p{L}\p{N}_+./-]{2,40})/gu;
const BULLET_RE = /^\s*(?:[-–—•*·▪●]|\d{1,2}[.)])\s+/u;
/** A wall of text longer than this, with no line breaks, is split into paragraphs. */
const WALL_LENGTH = 420;
const PARAGRAPH_TARGET = 280;

/** Escapes text, turns URLs into links and the contact placeholder into a muted label. */
function inline(text: string): string {
  let out = '';
  let last = 0;
  for (const match of text.matchAll(URL_RE)) {
    const index = match.index ?? 0;
    out += escapeHtml(text.slice(last, index));
    const url = match[0];
    const label = url.length > 60 ? `${url.slice(0, 57)}…` : url;
    out += `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer nofollow ugc">${escapeHtml(label)}</a>`;
    last = index + url.length;
  }
  out += escapeHtml(text.slice(last));
  return out.replaceAll(escapeHtml(CONTACT_PLACEHOLDER), `<span class="redacted">${escapeHtml(CONTACT_PLACEHOLDER.slice(1, -1))}</span>`);
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

function renderBlock(block: string): string {
  const lines = block.split('\n').map((line) => line.trimEnd()).filter((line) => line.trim());
  if (!lines.length) return '';
  const bullets = lines.filter((line) => BULLET_RE.test(line));
  // A list: every line after an optional heading is a bullet.
  if (bullets.length >= 2 && bullets.length >= lines.length - 1) {
    const heading = BULLET_RE.test(lines[0]!) ? '' : `<p class="lead-heading">${inline(lines[0]!)}</p>`;
    return `${heading}<ul>${bullets.map((line) => `<li>${inline(line.replace(BULLET_RE, ''))}</li>`).join('')}</ul>`;
  }
  if (lines.length === 1 && lines[0]!.length > WALL_LENGTH) {
    return splitWall(lines[0]!).map((p) => `<p>${inline(p)}</p>`).join('');
  }
  return `<p>${lines
    .map((line) => (line.length < 70 && /:\s*$/.test(line) ? `<strong>${inline(line)}</strong>` : inline(line)))
    .join('<br>')}</p>`;
}

/** Lead text as readable HTML: paragraphs, lists, links; skill hashtags lifted into tags. */
export function formatLeadText(text: string): FormattedText {
  const tags: string[] = [];
  const withoutSkills = (text || '').replace(/\r\n?/g, '\n').replace(SKILLS_LINE_RE, (_all, list: string) => {
    for (const match of list.matchAll(HASHTAG_RE)) tags.push(match[1]!.replace(/[.,;/-]+$/, ''));
    return '';
  });
  const blocks = withoutSkills.trim().split(/\n\s*\n/);
  return { html: blocks.map(renderBlock).join(''), tags: Array.from(new Set(tags)) };
}
