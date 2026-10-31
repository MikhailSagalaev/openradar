import { beforeEach, describe, expect, it } from 'vitest';
import { checkRobots, clearRobotsCache, isAllowed, productToken, rulesFor } from '../src/net/robots.ts';

const ROBOTS = `
# comment
User-agent: Googlebot
Disallow: /

User-agent: *
Disallow: /private
Allow: /private/open
Disallow: /*.pdf$
Disallow: /search?

User-agent: RadarBot
User-agent: OtherBot
Disallow: /rss
`;

describe('robots.txt', () => {
  beforeEach(() => clearRobotsCache());

  it('picks our own group, else the star group', () => {
    expect(rulesFor(ROBOTS, 'RadarBot')).toEqual([{ allow: false, path: '/rss' }]);
    expect(rulesFor(ROBOTS, 'radarbot')).toHaveLength(1);
    expect(rulesFor(ROBOTS, 'SomeBot').map((r) => r.path)).toEqual(['/private', '/private/open', '/*.pdf$', '/search?']);
    expect(rulesFor('', 'RadarBot')).toEqual([]);
  });

  it('lets the longest rule win, Allow on a tie, with * and $', () => {
    const rules = rulesFor(ROBOTS, 'SomeBot');
    expect(isAllowed(rules, '/private/x').allowed).toBe(false);
    expect(isAllowed(rules, '/private/open/feed').allowed).toBe(true);
    expect(isAllowed(rules, '/docs/a.pdf').allowed).toBe(false);
    expect(isAllowed(rules, '/docs/a.pdf?x=1').allowed).toBe(true);
    expect(isAllowed(rules, '/search?q=go').allowed).toBe(false);
    expect(isAllowed(rules, '/robots.txt').allowed).toBe(true);
    expect(isAllowed([{ allow: false, path: '/a' }, { allow: true, path: '/a' }], '/a').allowed).toBe(true);
  });

  it('reads the product token of our User-Agent', () => {
    expect(productToken('RadarBot/0.12.0 (+https://github.com/MikhailSagalaev/openradar)')).toBe('RadarBot');
  });

  it('checks a URL over HTTP: disallowed, missing robots.txt, server down', async () => {
    const respond = (status: number, body = '') => (async () => new Response(body, { status })) as unknown as typeof fetch;
    const ua = 'RadarBot/1.0';
    expect(await checkRobots('https://a.example/rss/all.xml', ua, respond(200, ROBOTS))).toMatchObject({ verdict: 'disallowed', rule: 'Disallow: /rss' });
    expect(await checkRobots('https://b.example/rss', ua, respond(404))).toMatchObject({ verdict: 'allowed' });
    expect(await checkRobots('https://c.example/rss', ua, respond(503))).toMatchObject({ verdict: 'unknown', reason: 'robots.txt: HTTP 503' });
    // Cached for a day: the second check does not ask again.
    expect(await checkRobots('https://a.example/jobs', ua, respond(500))).toMatchObject({ verdict: 'allowed' });
  });
});
