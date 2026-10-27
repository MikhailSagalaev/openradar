/**
 * Closed-post checks. Boards close orders and archive vacancies without telling anyone, so
 * the node revisits the source page of each active lead now and then and closes the lead
 * when the board shows it as closed or removed. Posts that cannot be checked (Telegram,
 * boards that block bots) expire by age instead: see feedMaxAge.
 *
 * The markers below were taken from real closed and open pages of each board.
 */
import { assertSafeUrl } from '../core/ssrf.ts';
import type { Store } from '../core/store.ts';
import type { Env, Logger } from '../core/types.ts';
import { readTextLimited } from '../net/body.ts';

export type Liveness = 'open' | 'closed' | 'unknown';

export interface FetchedPage {
  status: number;
  body: string;
}

interface BoardRule {
  hosts: string[];
  check(page: FetchedPage): Liveness;
}

const gone = (page: FetchedPage): boolean => page.status === 404 || page.status === 410;

export const BOARD_RULES: BoardRule[] = [
  {
    // The project card carries wantData.status: "active" while it takes offers; "stop",
    // "user_stop" or "archived" once closed.
    hosts: ['kwork.ru'],
    check(page) {
      if (gone(page)) return 'closed';
      const status = page.body.match(/"wantData":\{"id":\d+,"status":"([a-z_]+)"/)?.[1];
      if (!status) return 'unknown';
      return status === 'active' ? 'open' : 'closed';
    },
  },
  {
    // A deleted project answers 404; a closed one shows ico_closed.gif and "Заказ находится в архиве".
    hosts: ['www.fl.ru', 'fl.ru'],
    check(page) {
      if (gone(page)) return 'closed';
      if (page.body.includes('ico_closed.gif') || page.body.includes('Заказ находится в архиве')) return 'closed';
      return page.body.includes('id="prj_name_') ? 'open' : 'unknown';
    },
  },
  {
    // The vacancy JSON on the page has "archived": true|false.
    hosts: ['career.habr.com'],
    check(page) {
      if (gone(page)) return 'closed';
      return archivedFlag(page.body);
    },
  },
  {
    // Same flag, HTML-escaped inside the page state.
    hosts: ['hh.ru'],
    check(page) {
      if (gone(page)) return 'closed';
      return archivedFlag(page.body.replaceAll('&#34;', '"').replaceAll('&quot;', '"'));
    },
  },
  {
    // No reliable marker on the page: a removed post answers 404 or 410.
    hosts: ['weworkremotely.com', 'jobicy.com', 'remoteok.com', 'trudvsem.ru'],
    check(page) {
      return gone(page) ? 'closed' : 'unknown';
    },
  },
];

function archivedFlag(body: string): Liveness {
  const flag = body.match(/"archived":(true|false)/)?.[1];
  if (flag === 'true') return 'closed';
  if (flag === 'false') return 'open';
  return 'unknown';
}

export const CHECKED_HOSTS = BOARD_RULES.flatMap((rule) => rule.hosts);

export function ruleFor(url: string): BoardRule | undefined {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return undefined;
  }
  return BOARD_RULES.find((rule) => rule.hosts.includes(host));
}

/** Feed age limits from the environment; undefined when both are off. */
export function feedMaxAge(env: Pick<Env, 'RADAR_GIG_TTL_DAYS' | 'RADAR_JOB_TTL_DAYS'>): { gig: number; job: number } | undefined {
  const gig = env.RADAR_GIG_TTL_DAYS;
  const job = env.RADAR_JOB_TTL_DAYS;
  if (!gig && !job) return undefined;
  // 0 turns a limit off: a large number keeps one query shape.
  return { gig: gig || 36_500, job: job || 36_500 };
}

const PAGE_MAX_BYTES = 3 * 1024 * 1024;

/** GET with SSRF checks on every hop; any status comes back, network errors throw. */
export async function fetchPage(url: string, deps: { fetchImpl: typeof fetch; userAgent: string; timeoutMs: number }): Promise<FetchedPage> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deps.timeoutMs);
  try {
    let current = url;
    for (let hop = 0; hop <= 5; hop++) {
      await assertSafeUrl(current);
      const response = await deps.fetchImpl(current, {
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          'User-Agent': deps.userAgent,
          Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'ru-RU,ru;q=0.9,en;q=0.8',
        },
      });
      const location = response.headers.get('location');
      if ([301, 302, 303, 307, 308].includes(response.status) && location) {
        await response.body?.cancel().catch(() => {});
        current = new URL(location, current).toString();
        continue;
      }
      const body = response.ok ? await readTextLimited(response, PAGE_MAX_BYTES) : '';
      if (!response.ok) await response.body?.cancel().catch(() => {});
      return { status: response.status, body };
    }
    throw new Error('Too many redirects');
  } finally {
    clearTimeout(timer);
  }
}

export interface LivenessDeps {
  store: Store;
  env: Env;
  logger: Logger;
  fetchImpl?: typeof fetch;
}

export interface LivenessSummary {
  checked: number;
  closed: number;
  open: number;
  unknown: number;
  failed: number;
}

/**
 * Checks a batch of leads that are due. Boards are checked in parallel, the pages of one
 * board one by one with a pause, so no board sees more than one request every few seconds.
 */
export async function checkLeadsLiveness(
  deps: LivenessDeps,
  options: { limit?: number; perHostDelayMs?: number; now?: Date } = {},
): Promise<LivenessSummary> {
  const summary: LivenessSummary = { checked: 0, closed: 0, open: 0, unknown: 0, failed: 0 };
  const store = deps.store;
  if (!store.listLeadsToCheck || !store.markLeadChecked || !store.updateLeadState) return summary;

  const now = options.now ?? new Date();
  const maxAge = Math.max(deps.env.RADAR_GIG_TTL_DAYS || 0, deps.env.RADAR_JOB_TTL_DAYS || 0) || 30;
  const leads = await store.listLeadsToCheck({
    hosts: CHECKED_HOSTS,
    limit: options.limit ?? 120,
    createdAfter: new Date(now.getTime() - maxAge * 86_400_000).toISOString(),
    now,
  });

  const byHost = new Map<string, typeof leads>();
  for (const lead of leads) {
    if (!lead.url) continue;
    const host = new URL(lead.url).hostname.toLowerCase();
    byHost.set(host, [...(byHost.get(host) ?? []), lead]);
  }

  const delay = options.perHostDelayMs ?? 3000;
  const fetchDeps = {
    fetchImpl: deps.fetchImpl ?? fetch,
    userAgent: deps.env.RADAR_USER_AGENT,
    timeoutMs: deps.env.RADAR_HTTP_TIMEOUT_MS,
  };
  await Promise.all(
    [...byHost.values()].map(async (hostLeads) => {
      for (const [i, lead] of hostLeads.entries()) {
        if (i > 0 && delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
        const rule = ruleFor(lead.url!);
        if (!rule) continue;
        summary.checked++;
        try {
          const result = rule.check(await fetchPage(lead.url!, fetchDeps));
          summary[result]++;
          if (result === 'closed') {
            await store.setLeadDecision(lead.id, { state: 'closed', decidedBy: 'source', reason: 'closed on the board' });
            await store.updateLeadState!(lead.id, 'closed');
          }
        } catch (error) {
          // A network error or a block says nothing about the post: try again on the next round.
          summary.failed++;
          deps.logger.debug('liveness check failed', {
            url: lead.url,
            error: error instanceof Error ? error.message : String(error),
          });
        }
        await store.markLeadChecked!(lead.id, new Date());
      }
    }),
  );
  return summary;
}
