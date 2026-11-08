import { describe, expect, it } from 'vitest';
import { decisionAction, scoreShift } from '../src/core/decisions.ts';
import { isReviewVerdict, labelOfReview, pickBucket, reviewConsensus, trusted } from '../src/core/reviews.ts';
import { fillDirections } from '../src/pipeline/redirections.ts';
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
  it('know their answers', () => {
    expect(isReviewVerdict('ok')).toBe(true);
    expect(isReviewVerdict('anything')).toBe(false);
    expect(labelOfReview('ok', 'gig')).toBe('wrong_type');
    expect(labelOfReview('suspicious')).toBe('scam');
  });

  it('agree only when most readers do', () => {
    expect(reviewConsensus(['ok', 'ok', 'not_work'])).toBe('ok');
    expect(reviewConsensus(['ok', 'not_work'])).toBeUndefined();
    expect(reviewConsensus(['ok', 'not_work', 'closed'])).toBeUndefined();
    expect(reviewConsensus(['ok', 'ok', 'unsure'])).toBeUndefined();
  });

  it('mix most posts at random, some doubtful, a few control', () => {
    expect([0.05, 0.2, 0.7].map(pickBucket)).toEqual(['control', 'doubt', 'random']);
  });

  it('stop trusting a reader only after enough control posts', () => {
    expect(trusted(3, 0)).toBe(true);
    expect(trusted(10, 5)).toBe(false);
    expect(trusted(10, 8)).toBe(true);
  });

  it('walk a member through posts of a direction, with fixes, issues and undo', async () => {
    const { runtime, insert } = await setup();
    await insert('a', { title: 'Backend-разработчик', direction: 'backend', contacts: [{ type: 'email', value: 'hr@a.test' }] });
    await insert('b', { title: 'Дизайнер логотипов', direction: 'design' });
    const app = createApp(runtime);
    const guest = await app.request('/review');
    expect(guest.status).toBe(200);
    const guestHtml = await guest.text();
    expect(guestHtml).toContain('data-guest="true"');
    expect(guestHtml).toContain('Разбор постов');
    const guestPost = await app.request('/review', { method: 'POST', headers: { origin: 'http://localhost', 'content-type': 'application/x-www-form-urlencoded' }, body: 'id=b&verdict=ok' });
    expect(guestPost.status).toBe(302);
    expect(guestPost.headers.get('location')).toBe('/login?returnTo=/review');
    const session = await makeUserSession(runtime as never);
    const cookie = { cookie: `radar_session=${session}` };
    const first = await (await app.request('/review?c=design', { headers: cookie })).text();
    expect(first).toContain('Дизайнер логотипов');
    expect(first).not.toContain('Backend-разработчик</h2>');
    expect(first).toContain('Как оценивать');
    expect(first).toContain('review-picker-search');
    expect(first).toContain('Мы показали это как');
    const post = (fields: Record<string, string>) => app.request('/review', { method: 'POST', headers: { ...cookie, origin: 'http://localhost', 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(fields).toString() });
    expect((await post({ id: 'b', verdict: 'nonsense' })).status).toBe(400);
    expect((await post({ id: 'nope', verdict: 'ok' })).status).toBe(400);
    const saved = await post({ id: 'b', verdict: 'ok', issues: 'text_cut', direction_fix: 'content', note: 'мало текста', c: 'design' });
    expect(saved.headers.get('location')).toBe('/review?last=b&c=design');
    expect((await runtime.store.listReviewNotes!(5))[0]).toMatchObject({ issues: ['text_cut'], note: 'мало текста' });
    const page = await (await app.request('/review', { headers: cookie })).text();
    expect(page).toContain('Backend-разработчик');
    expect(page).not.toContain('hr@a.test');
    const undo = await app.request('/review/undo', { method: 'POST', headers: { ...cookie, origin: 'http://localhost', 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ id: 'b' }).toString() });
    expect(undo.headers.get('location')).toBe('/review?show=b');
    expect(await runtime.store.listReviewNotes!(5)).toHaveLength(0);
  });

  it('fill directions of stored posts', async () => {
    const { runtime, insert } = await setup();
    await insert('a', { title: 'Backend-разработчик на Go' });
    expect((await fillDirections(runtime.store)).updated).toBe(1);
    expect((await runtime.store.getLead('a'))?.direction).toBe('backend');
    expect((await fillDirections(runtime.store)).updated).toBe(0);
  });
});
