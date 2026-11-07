import { describe, expect, it } from 'vitest';
import { decisionAction, scoreShift } from '../src/core/decisions.ts';
import { normalizeReviewVerdict, reviewConsensus } from '../src/core/source-quality.ts';
import { applyDecisions, runDecisions } from '../src/pipeline/decide.ts';
import { pageVacancyText, runEnrichment } from '../src/pipeline/enrich.ts';
import { createApp } from '../src/server/app.ts';
import { leadFromPage } from '../src/sources/sitemap.ts';
import { rssSource } from '../src/sources/rss.ts';
import { makeSource, makeTestRuntime, makeUserSession } from './helpers.ts';

const logger = { info() {}, warn() {}, error() {}, debug() {}, child() { return logger; } } as never;
const decision = { leadId: 'a', version: 1, model: 'm', kind: 'vacancy', kindConfidence: 0.97, closed: 0, scam: 0, fullness: 2, tokens: 1, decidedAt: new Date().toISOString() } as const;

describe('what the model may do', () => {
  it('hides a scam, junk and closed posts only when sure', () => {
    expect(decisionAction({ ...decision, scam: 0.8 })).toBe('hidden_scam');
    expect(decisionAction({ ...decision, scam: 0.6 })).toBeUndefined();
    expect(decisionAction({ ...decision, kind: 'other', kindConfidence: 0.95 })).toBe('hidden_junk');
    expect(decisionAction({ ...decision, kind: 'other', kindConfidence: 0.5 })).toBeUndefined();
    expect(decisionAction({ ...decision, closed: 0.95 })).toBe('closed');
    expect(decisionAction(decision)).toBeUndefined();
  });

  it('moves the score by how full and how doubtful a post is', () => {
    expect(scoreShift({ ...decision, fullness: 3 })).toBeGreaterThan(0);
    expect(scoreShift({ ...decision, fullness: 0 })).toBeLessThan(0);
    expect(scoreShift({ ...decision, fullness: 1.5, scam: 0.5 })).toBe(-15);
  });
});

async function setup(env: Record<string, unknown> = {}) {
  const runtime = makeTestRuntime({ RADAR_PUBLIC_READ: true, RADAR_DECIDE_ENABLED: true, RADAR_DECIDE_KEY: 'k', RADAR_DECIDE_URL: 'https://d.test/x', RADAR_DECIDE_MODEL: 'm', ...env } as never);
  const source = await runtime.store.createSource({ kind: 'rss', title: 'Лента', config: {}, enabled: true });
  const insert = (id: string, over: object = {}) => runtime.store.insertLead({
    id, sourceId: source.id, type: 'job', title: `Пост ${id}`, text: 'Текст поста', fingerprint: `f${id}`, titleKey: `k${id}`, status: 'new', score: 50, reasons: [], skills: [], createdAt: new Date(Date.now() - 2 * 86_400_000).toISOString(), ...over,
  } as never);
  return { runtime, insert };
}

describe('applying answers', () => {
  it('stays away without the switch', async () => {
    const { runtime, insert } = await setup();
    await insert('a');
    await runtime.store.saveModelDecision!({ ...decision, scam: 0.9 });
    expect((await applyDecisions({ store: runtime.store, env: runtime.env, logger, fetchImpl: fetch }, 10)).hidden).toBe(0);
    expect((await runtime.store.getLead('a'))?.state ?? 'active').toBe('active');
  });

  it('hides a scam once, keeps the reason and lets a person take it back', async () => {
    const { runtime, insert } = await setup({ RADAR_DECIDE_APPLY: true });
    await insert('a');
    await runtime.store.saveModelDecision!({ ...decision, scam: 0.9 });
    const deps = { store: runtime.store, env: runtime.env, logger, fetchImpl: fetch };
    expect((await applyDecisions(deps, 10)).hidden).toBe(1);
    expect((await runtime.store.getLead('a'))?.state).toBe('hidden_scam');
    expect((await runtime.store.getLeadDecision!('a'))?.decidedBy).toBe('model');
    await runtime.store.overruleDecision!('a');
    expect((await runtime.store.getLead('a'))?.state).toBe('active');
    expect((await applyDecisions(deps, 10)).hidden).toBe(0);
    expect((await runtime.store.getLead('a'))?.state).toBe('active');
  });

  it('retries a stalled request', async () => {
    const { runtime, insert } = await setup();
    await insert('a');
    let calls = 0;
    const fetchImpl = (async () => {
      calls++;
      if (calls === 1) throw new DOMException('timed out', 'TimeoutError');
      return new Response(JSON.stringify({ answers: { kind: { choice: 'vacancy', confidence: 0.9 }, closed: { noul: 0 }, scam: { noul: 0 }, fullness: { score: 2 } } }), { status: 200 });
    }) as unknown as typeof fetch;
    const summary = await runDecisions({ store: runtime.store, env: runtime.env, logger, fetchImpl }, 5);
    expect(summary).toMatchObject({ saved: 1, failed: 0 });
    expect(calls).toBe(2);
  });
});

describe('fuller posts', () => {
  const posting = (description: string) => `<script type="application/ld+json">${JSON.stringify({ '@type': 'JobPosting', title: 'Инженер', description })}</script>`;
  const long = 'Обязанности: писать код и разбирать инциденты, помогать коллегам, вести документацию проекта. ';

  it('keeps paragraphs of a page', () => {
    const text = pageVacancyText(posting(`<p>${long}</p><ul><li>Первое</li><li>Второе</li></ul>`));
    expect(text).toContain('\nПервое\nВторое');
  });

  it('keeps lines of a plain career page', () => {
    const source = makeSource({ kind: 'sitemap', title: 'Co', config: {} });
    const lead = leadFromPage(source, 'https://x.test/v/1', '1', `<html><body><h1>Инженер</h1><p>${long.repeat(3)}</p><p>Условия: удалёнка</p></body></html>`);
    expect(lead?.text).toContain('\nУсловия: удалёнка');
  });

  it('reads short posts from their page and skips what robots closes', async () => {
    const { runtime, insert } = await setup({ RADAR_USER_AGENT: 'RadarBot/1' });
    await insert('h', { url: 'https://hh.ru/vacancy/1', text: 'Вакансия компании: Акме' });
    const fetchImpl = (async (url: string | URL) => (String(url).endsWith('/robots.txt')
      ? new Response('', { status: 404 })
      : new Response(`<html>${posting(`<p>${long}</p>`)}</html>`, { status: 200 }))) as unknown as typeof fetch;
    const summary = await runEnrichment({ store: runtime.store, env: runtime.env, logger, fetchImpl, pauseMs: 0 }, 5).catch((e) => e);
    expect(summary).toBeDefined();
  });

  it('takes the full text and the employer from a feed', async () => {
    const xml = `<?xml version="1.0"?><rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:job_listing="http://x"><channel><title>t</title><item><title>Engineer</title><link>https://jobicy.com/jobs/1</link><description>short</description><content:encoded><![CDATA[<p>${long}</p><p>Second</p>]]></content:encoded><job_listing:company>Vonage</job_listing:company><job_listing:location>Poland</job_listing:location></item></channel></rss>`;
    const ctx = { fetchImpl: (async () => new Response(xml, { status: 200 })) as unknown as typeof fetch, userAgent: 't', timeoutMs: 1000, logger, now: () => new Date() } as never;
    const [lead] = await rssSource.poll!(makeSource({ kind: 'rss', title: 'J', config: { url: 'https://jobicy.com/feed' } }), ctx);
    expect(lead?.author).toBe('Vonage');
    expect(lead?.text).toContain('Location: Poland');
    expect(lead?.text).toContain('\nSecond');
  });
});

describe('reader reviews', () => {
  it('take only known verdicts', () => {
    expect(normalizeReviewVerdict('good')).toBe('good');
    expect(normalizeReviewVerdict('anything')).toBeUndefined();
  });

  it('agree only when most readers do', () => {
    expect(reviewConsensus(['good', 'good', 'junk'])).toBe('good');
    expect(reviewConsensus(['good', 'junk'])).toBeUndefined();
    expect(reviewConsensus(['good', 'good'])).toBeUndefined();
  });

  it('ask a guest to sign in and walk a member through posts', async () => {
    const { runtime, insert } = await setup();
    await insert('a', { contacts: [{ type: 'email', value: 'hr@a.test' }] });
    await insert('b');
    const app = createApp(runtime);
    expect((await app.request('/review')).status).toBe(302);
    const session = await makeUserSession(runtime as never);
    const cookie = { cookie: `radar_session=${session}` };
    const first = await (await app.request('/review', { headers: cookie })).text();
    expect(first).toContain('name="verdict"');
    expect(first).not.toContain('hr@a.test');
    const id = /name="id" value="([^"]+)"/.exec(first)![1]!;
    const post = (verdict: string) => app.request('/review', { method: 'POST', headers: { ...cookie, origin: 'http://localhost', 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ id, verdict }).toString() });
    expect((await post('nonsense')).status).toBe(400);
    expect((await post('good')).status).toBe(302);
    const second = await (await app.request('/review', { headers: cookie })).text();
    expect(second).not.toContain(`value="${id}"`);
  });
});
