import type { Store } from '../core/store.ts';
import { normalizeWhitespace, stripHtml } from '../core/text.ts';
import type { Env, Logger } from '../core/types.ts';
import { checkRobots } from '../net/robots.ts';
import { extractPageFacts, hasFacts, isType, jsonLdObjects } from '../research/facts.ts';
import { factsFill, fetchPage } from './liveness.ts';

/**
 * Feeds of some boards carry only a title and a line. The full vacancy sits on its page in
 * schema.org markup, the form boards publish for search engines. This reads it for short
 * posts, a page at a time and only where robots.txt allows.
 */

/** Boards whose pages carry JobPosting and answer the hub. */
export const ENRICH_HOSTS = ['hh.ru', 'dribbble.com', 'jobicy.com'];
/** A post longer than this already says enough. */
export const SHORT_TEXT = 600;
const PAUSE_MS = 5000;
const MAX_TEXT = 8000;

export interface EnrichDeps {
  store: Store;
  env: Env;
  logger: Logger;
  fetchImpl: typeof fetch;
  pauseMs?: number;
}

/** The vacancy text of a page, with its paragraphs and lists. */
export function pageVacancyText(html: string): string | undefined {
  const posting = jsonLdObjects(html).find((node) => isType(node, 'JobPosting'));
  const description = typeof posting?.description === 'string' ? posting.description : '';
  const text = normalizeWhitespace(stripHtml(stripHtml(description)));
  return text.length >= 100 ? text.slice(0, MAX_TEXT) : undefined;
}

export async function runEnrichment(deps: EnrichDeps, limit: number): Promise<{ checked: number; filled: number }> {
  const summary = { checked: 0, filled: 0 };
  const { store, env } = deps;
  if (!store.listLeadsToEnrich || !store.saveLeadEnrichment) return summary;
  const pause = deps.pauseMs ?? PAUSE_MS;
  const fetchDeps = { fetchImpl: deps.fetchImpl, userAgent: env.RADAR_USER_AGENT, timeoutMs: env.RADAR_HTTP_TIMEOUT_MS };
  for (const [i, lead] of (await store.listLeadsToEnrich(limit, ENRICH_HOSTS, SHORT_TEXT)).entries()) {
    if (i > 0 && pause) await new Promise((resolve) => setTimeout(resolve, pause));
    summary.checked++;
    try {
      const robots = await checkRobots(lead.url, env.RADAR_USER_AGENT, deps.fetchImpl);
      if (robots.verdict === 'disallowed') {
        await store.saveLeadEnrichment(lead.id);
        continue;
      }
      const page = await fetchPage(lead.url, fetchDeps);
      const text = page.status === 200 ? pageVacancyText(page.body) : undefined;
      if (text) {
        await store.saveLeadEnrichment(lead.id, `${lead.text}\n\n${text}`.slice(0, MAX_TEXT));
        summary.filled++;
        const facts = extractPageFacts(page.body);
        if (hasFacts(facts) && store.saveLeadFacts) await store.saveLeadFacts(lead.id, facts, factsFill(facts, 'job'));
      } else {
        await store.saveLeadEnrichment(lead.id);
      }
    } catch (error) {
      // A network error says nothing about the page: the post waits for the next round.
      deps.logger.warn('page not read', { error: error instanceof Error ? error.message : String(error) });
    }
  }
  return summary;
}
