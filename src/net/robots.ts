import { assertSafeUrl, safeFetchImpl } from '../core/ssrf.ts';

/**
 * robots.txt by RFC 9309: may our crawler fetch this URL? openradar does not get round a site's
 * protection: a source whose robots.txt disallows the address we poll is set aside, not tricked.
 *
 * - Groups are matched by product token, case-insensitively (`User-agent: RadarBot`); without
 *   one, the `*` group applies.
 * - Within a group the longest matching rule wins; on a tie `Allow` wins. `*` matches any run of
 *   characters, `$` ends the pattern.
 * - 4xx (no robots.txt) allows everything. 5xx or no answer is «unknown»: RFC 9309 would treat
 *   it as disallow-all, but a site that is down for an hour is not a decision about crawlers.
 */

export interface RobotsRule {
  allow: boolean;
  path: string;
}

export interface RobotsVerdict {
  url: string;
  verdict: 'allowed' | 'disallowed' | 'unknown';
  /** The rule that decided, e.g. `Disallow: /rss`; empty when nothing matched. */
  rule?: string;
  /** Why the answer is «unknown»: HTTP status or the network error. */
  reason?: string;
}

/** Rules of the group that applies to `token`, from the text of a robots.txt. */
export function rulesFor(robotsTxt: string, token: string): RobotsRule[] {
  const wanted = token.toLowerCase();
  const groups: Array<{ agents: string[]; rules: RobotsRule[] }> = [];
  let current: { agents: string[]; rules: RobotsRule[] } | undefined;
  let lastWasAgent = false;
  for (const raw of robotsTxt.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim();
    const match = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(line);
    if (!match) continue;
    const key = match[1]!.toLowerCase();
    const value = match[2]!.trim();
    if (key === 'user-agent') {
      // Consecutive User-agent lines open one group.
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else if ((key === 'allow' || key === 'disallow') && current) {
      // An empty Disallow allows everything: it adds no rule.
      if (value) current.rules.push({ allow: key === 'allow', path: value });
      lastWasAgent = false;
    } else {
      lastWasAgent = false;
    }
  }
  const own = groups.filter((g) => g.agents.includes(wanted));
  const chosen = own.length ? own : groups.filter((g) => g.agents.includes('*'));
  return chosen.flatMap((g) => g.rules);
}

function patternMatches(pattern: string, path: string): boolean {
  const anchored = pattern.endsWith('$');
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const regex = body.split('*').map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*');
  return new RegExp(`^${regex}${anchored ? '$' : ''}`).test(path);
}

/** Whether `pathAndQuery` (e.g. `/rss/all.xml?category=5`) is allowed by these rules. */
export function isAllowed(rules: RobotsRule[], pathAndQuery: string): { allowed: boolean; rule?: RobotsRule } {
  let best: RobotsRule | undefined;
  for (const rule of rules) {
    if (!patternMatches(rule.path, pathAndQuery)) continue;
    const longer = !best || rule.path.length > best.path.length;
    const tieAllow = best && rule.path.length === best.path.length && rule.allow && !best.allow;
    if (longer || tieAllow) best = rule;
  }
  // /robots.txt itself is always allowed.
  if (pathAndQuery === '/robots.txt') return { allowed: true };
  return { allowed: best ? best.allow : true, rule: best };
}

/** The product token of our User-Agent: `RadarBot` in `RadarBot/0.12.0 (+https://…)`. */
export function productToken(userAgent: string): string {
  return /^[A-Za-z0-9_-]+/.exec(userAgent.trim())?.[0] ?? '*';
}

const cache = new Map<string, { at: number; text?: string; status?: number; error?: string }>();
const CACHE_MS = 24 * 3600_000;
const MAX_ROBOTS_BYTES = 512 * 1024;

async function fetchRobots(origin: string, userAgent: string, fetchImpl?: typeof fetch): Promise<{ text?: string; status?: number; error?: string }> {
  const hit = cache.get(origin);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit;
  let result: { text?: string; status?: number; error?: string };
  try {
    let url = `${origin}/robots.txt`;
    let response: Response | undefined;
    // RFC 9309: follow at least five redirects.
    for (let hop = 0; hop <= 5; hop += 1) {
      await assertSafeUrl(url);
      response = await safeFetchImpl(fetchImpl)(url, { redirect: 'manual', headers: { 'User-Agent': userAgent }, signal: AbortSignal.timeout(10_000) });
      const location = response.headers.get('location');
      if (response.status >= 300 && response.status < 400 && location) {
        url = new URL(location, url).toString();
        continue;
      }
      break;
    }
    const status = response?.status ?? 0;
    result = status >= 200 && status < 300 ? { status, text: (await response!.text()).slice(0, MAX_ROBOTS_BYTES) } : { status };
  } catch (error) {
    result = { error: error instanceof Error ? error.message : String(error) };
  }
  cache.set(origin, { at: Date.now(), ...result });
  return result;
}

/** May a crawler with this User-Agent fetch `url`? */
export async function checkRobots(url: string, userAgent: string, fetchImpl?: typeof fetch): Promise<RobotsVerdict> {
  const parsed = new URL(url);
  const robots = await fetchRobots(parsed.origin, userAgent, fetchImpl);
  if (robots.error) return { url, verdict: 'unknown', reason: robots.error };
  if (robots.status !== undefined && robots.status >= 400 && robots.status < 500) return { url, verdict: 'allowed', reason: `robots.txt: HTTP ${robots.status}` };
  if (robots.text === undefined) return { url, verdict: 'unknown', reason: `robots.txt: HTTP ${robots.status}` };
  const { allowed, rule } = isAllowed(rulesFor(robots.text, productToken(userAgent)), `${parsed.pathname}${parsed.search}`);
  return { url, verdict: allowed ? 'allowed' : 'disallowed', rule: rule ? `${rule.allow ? 'Allow' : 'Disallow'}: ${rule.path}` : undefined };
}

/** For tests: forget fetched robots.txt files. */
export function clearRobotsCache(): void {
  cache.clear();
}
