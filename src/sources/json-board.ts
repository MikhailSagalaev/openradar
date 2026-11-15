import type { PollContext, RawLead, SourceAdapter, SourceRecord } from '../core/types.ts';
import { stripHtml } from '../core/text.ts';
import { fetchText } from './http.ts';

/**
 * A career site whose pages are drawn in the browser from its own public JSON. The source says
 * where the list is and which fields mean what, so a new site is a few lines of settings and
 * no code. Only addresses the site keeps open and robots.txt allows: nothing here signs in,
 * sends a browser's tokens or works around a refusal.
 */

const MAX_TEXT = 8000;

export interface JsonBoardConfig {
  /** The list; `{offset}` and `{page}` mark where a page number goes. */
  url: string;
  /** Path to the array in the answer: `data.items`. Empty when the answer is the array. */
  list?: string;
  pageSize?: number;
  /** Pages read per poll besides the first, which always holds the newest. */
  pagesPerPoll?: number;
  id: string;
  title: string;
  /** Fields of the post, in reading order. */
  text: string[];
  /** Address of the vacancy for people: `https://site/vacancies/{id}`. */
  link: string;
  /** Address of one vacancy's JSON, for a list that holds only titles. */
  detail?: string;
  /** Path to the vacancy in that answer. */
  detailRoot?: string;
  /** Details read per poll: each is a request. */
  perPoll?: number;
  delayMs?: number;
  company?: string;
  city?: string;
  published?: string;
  salaryMin?: string;
  salaryMax?: string;
  /** Field with the pay as published («$20 – $30/hr»): kept verbatim, wins over salaryMin/Max. */
  salary?: string;
  currency?: string;
  /** Field with the pay period (`year`/`annual`, `month`, `hour`). Without it the board's pay is monthly. */
  salaryPeriod?: string;
  /** Field that says the format; a mention of remote work in it counts. */
  format?: string;
  maxAgeDays?: number;
  /** Title/text keywords the pipeline requires (rules.ts); presets may narrow a mixed feed. */
  includeKeywords?: string[];
}

/** The value at `a.b.c`, or at `a.0.b` in an array. */
export function valueAt(node: unknown, path: string | undefined): unknown {
  if (!path) return node;
  let current = node;
  for (const key of path.split('.')) {
    if (current === null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

/** A field as text: a string, a number, or a list of strings and named items. */
function textOf(value: unknown): string {
  if (typeof value === 'string') return stripHtml(value).trim();
  if (typeof value === 'number') return String(value);
  if (Array.isArray(value)) {
    return value.map((item) => (item && typeof item === 'object' ? textOf((item as Record<string, unknown>).name ?? (item as Record<string, unknown>).title) : textOf(item))).filter(Boolean).join(', ');
  }
  return '';
}

/** Fills `{field}` marks of an address from a vacancy. */
export function fillTemplate(template: string, item: unknown): string {
  return template.replace(/\{([\w.]+)\}/g, (_match, path: string) => encodeURI(textOf(valueAt(item, path))));
}

const REMOTE = /удал[её]нн|remote/i;

function payText(min: unknown, max: unknown, currency: string, period?: unknown): string | undefined {
  if (!min && !max) return undefined;
  const range = min && max ? `${min}–${max}` : min ? `от ${min}` : `до ${max}`;
  // The board names the period itself (Dreamwork: annual USD). Only an explicit marker changes
  // the wording — everything else keeps the monthly default Russian boards publish.
  const p = String(period ?? '').toLowerCase();
  if (/^(?:year|yr|annual|yearly|per[- ]?year|год|годовая|ежегодн)/.test(p)) return `${range} ${currency} per year`;
  if (/^(?:hour|hr|hourly|per[- ]?hour|час|почасов)/.test(p)) return `${range} ${currency} per hour`;
  return `${range} ${currency} в месяц`;
}

export function leadFromItem(source: SourceRecord, config: JsonBoardConfig, item: unknown, host: string): RawLead | undefined {
  const id = textOf(valueAt(item, config.id));
  const title = textOf(valueAt(item, config.title));
  if (!id || !title) return undefined;
  const parts = config.text.map((path) => textOf(valueAt(item, path))).filter(Boolean);
  const city = config.city ? textOf(valueAt(item, config.city)).replace(/^г\.?\s+/, '') : '';
  const remote = config.format ? REMOTE.test(textOf(valueAt(item, config.format))) : false;
  const min = config.salaryMin ? valueAt(item, config.salaryMin) : undefined;
  const max = config.salaryMax ? valueAt(item, config.salaryMax) : undefined;
  const period = config.salaryPeriod ? valueAt(item, config.salaryPeriod) : undefined;
  // A board that publishes pay as one string («$20 – $30/hr») keeps it verbatim: hourly rates
  // under 100 must not be dropped by the numeric range parser.
  const publishedPay = config.salary ? textOf(valueAt(item, config.salary)) : '';
  const published = config.published ? valueAt(item, config.published) : undefined;
  return {
    sourceId: source.id,
    type: 'job',
    externalId: `json:${host}:${id}`,
    url: fillTemplate(config.link, item),
    title,
    text: [title, ...parts].join('\n\n').slice(0, MAX_TEXT),
    author: config.company,
    city: remote ? 'Онлайн' : city || undefined,
    isRemote: remote,
    // A board that states its currency (Dreamwork: USD) says so on the lead itself;
    // without it the pipeline detects the currency from the text as before.
    ...(config.currency ? { currency: config.currency } : {}),
    rawSalary: publishedPay || payText(min, max, config.currency ?? 'RUB', period),
    publishedAt: typeof published === 'string' ? published : undefined,
    raw: { json: true },
  };
}

/** Where each source goes on in its list, and what it has read in detail. */
const cursors = new Map<string, number>();
const seen = new Map<string, Set<string>>();
const SEEN_MAX = 20_000;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export const jsonBoardSource: SourceAdapter = {
  kind: 'json',
  access: 'public',
  description: 'Открытый JSON карьерного сайта: откуда брать список и какие поля что значат, задаётся в настройках источника.',
  risks: [
    'Адрес не описан в документации сайта и может поменяться: следите за состоянием источника.',
    'Добавляйте только адреса, которые открыты без входа и разрешены robots.txt.',
  ],

  async poll(source: SourceRecord, ctx: PollContext): Promise<RawLead[]> {
    const config = source.config as unknown as JsonBoardConfig;
    if (!config.url || !config.id || !config.title || !config.link) throw new Error('JSON source requires config.url, id, title and link');
    const host = new URL(config.url).host;
    const pageSize = Math.max(1, Number(config.pageSize ?? 50));
    const extra = Math.max(0, Math.min(Number(config.pagesPerPoll ?? 2), 10));
    const paged = /\{(?:offset|page)\}/.test(config.url);
    const start = cursors.get(source.id) ?? 1;
    const pages = paged ? [0, ...Array.from({ length: extra }, (_unused, i) => start + i)] : [0];

    const items: unknown[] = [];
    let last = 0;
    for (const page of pages) {
      const url = config.url.replace('{offset}', String(page * pageSize)).replace('{page}', String(page + 1));
      const found = valueAt(JSON.parse(await fetchText(ctx, url, { Accept: 'application/json' })), config.list);
      if (!Array.isArray(found)) throw new Error(`JSON source: no list at ${config.list ?? 'the top'}`);
      last = found.length;
      items.push(...found);
      if (!found.length) break;
    }
    if (paged) cursors.set(source.id, last ? start + extra : 1);

    const unique = [...new Map(items.map((item) => [textOf(valueAt(item, config.id)), item])).values()];
    const maxAgeDays = Math.max(1, Number(config.maxAgeDays ?? 30));
    const since = new Date(ctx.now().getTime() - maxAgeDays * 86_400_000).toISOString();
    const fresh = (lead: RawLead | undefined): lead is RawLead => Boolean(lead) && (!lead!.publishedAt || new Date(lead!.publishedAt).toISOString() >= since);

    if (!config.detail) return unique.map((item) => leadFromItem(source, config, item, host)).filter(fresh);

    const done = seen.get(source.id) ?? new Set<string>();
    seen.set(source.id, done);
    const perPoll = Math.max(1, Math.min(Number(config.perPoll ?? 15), 50));
    const delayMs = Math.max(0, Number(config.delayMs ?? 500));
    const queue = unique.filter((item) => !done.has(textOf(valueAt(item, config.id)))).slice(0, perPoll);
    const leads: RawLead[] = [];
    for (const [index, item] of queue.entries()) {
      if (index > 0 && delayMs) await sleep(delayMs);
      const id = textOf(valueAt(item, config.id));
      done.add(id);
      if (done.size > SEEN_MAX) done.delete(done.values().next().value!);
      try {
        const answer = JSON.parse(await fetchText(ctx, fillTemplate(config.detail, item), { Accept: 'application/json' }));
        const full = { ...(item as object), ...(valueAt(answer, config.detailRoot) as object) };
        const lead = leadFromItem(source, config, full, host);
        if (fresh(lead)) leads.push(lead);
      } catch (error) {
        ctx.logger.warn('JSON vacancy failed', { id, error: error instanceof Error ? error.message : String(error) });
      }
    }
    return leads;
  },
};
