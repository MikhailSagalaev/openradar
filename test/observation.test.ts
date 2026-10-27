import { Readable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { createApp, parseObservationBody } from '../src/server/app.ts';
import { observationToRawLead, parseObservation, postKeyOf } from '../src/core/observation.ts';
import { pushLocal, pushRemote } from '../src/cli/push.ts';
import { makeTestRuntime, makeUserSession, type TestRuntime } from './helpers.ts';

const TOKEN = 'source-token-for-tests-0123456789';

function obs(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schema: 'radar/2.observation',
    source: { platform: 'telegram', channel: '-1001234567890', channel_title: 'Frontend jobs', visibility: 'private', message_id: '48213' },
    posted_at: new Date().toISOString(),
    author: { name: 'Ирина', handle: '@Irina_HR' },
    text: 'Ищем React-разработчика в продуктовую команду. TypeScript, Next.js, удалённо. Зарплата 250 000 ₽. Пишите @irina_hr',
    type: 'job',
    budget: { min: 200000, max: 300000, currency: 'RUB', period: 'month' },
    skills: ['react', 'typescript'],
    location: { remote: true },
    ...overrides,
  };
}

async function hookRuntime(env: Record<string, string> = {}): Promise<{ runtime: TestRuntime; sourceId: string }> {
  const runtime = makeTestRuntime({ RADAR_ADMIN_TOKEN: 'admin-secret-token-0123456789abcdef', ...env } as never);
  const source = await runtime.store.createSource({ kind: 'webhook', title: 'Parser', config: { token: TOKEN } });
  return { runtime, sourceId: source.id };
}

function post(app: ReturnType<typeof createApp>, sourceId: string, body: string, headers: Record<string, string> = {}) {
  return app.request(`/api/v2/ingest/${sourceId}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-radar-token': TOKEN, ...headers },
    body,
  });
}

describe('radar/2 observation schema', () => {
  it('requires platform, channel and text, and normalises the author handle into a contact', () => {
    expect(parseObservation({ source: { platform: 'tg', channel: 'x' } }).ok).toBe(false);
    expect(parseObservation({ source: { platform: 'Bad Platform!', channel: 'x' }, text: 'hi' }).ok).toBe(false);
    const parsed = parseObservation(obs());
    expect(parsed.ok).toBe(true);
    const raw = observationToRawLead(parsed.observation!, 'src');
    expect(raw.externalId).toBe('telegram:-1001234567890:48213');
    expect(raw.contacts).toEqual([{ type: 'telegram', value: '@irina_hr' }]);
    expect(raw.sourceRef).toMatchObject({ platform: 'telegram', visibility: 'private', messageId: '48213' });
    expect(raw.paymentPeriod).toBe('monthly');
    expect(raw.budget).toBe(300000);
    expect(postKeyOf({ platform: 'rss', channel: 'x' })).toBeUndefined();
  });

  it('accepts a JSON array, an {observations} object and NDJSON', () => {
    expect(parseObservationBody('[{"a":1},{"a":2}]')).toHaveLength(2);
    expect(parseObservationBody('{"observations":[{"a":1}]}')).toHaveLength(1);
    expect(parseObservationBody('{"a":1}\n{"a":2}\n', 'application/x-ndjson')).toHaveLength(2);
    expect(parseObservationBody('{"a":1}\n{"a":2}')).toHaveLength(2);
    expect(parseObservationBody('{"a":1}\nnot json')).toBeNull();
  });
});

describe('POST /api/v2/ingest/:sourceId', () => {
  it('requires the source token', async () => {
    const { runtime, sourceId } = await hookRuntime();
    const app = createApp(runtime);
    const res = await post(app, sourceId, JSON.stringify([obs()]), { 'x-radar-token': 'wrong' });
    expect(res.status).toBe(401);
  });

  it('ingests observations, stores contacts and source, and reports each outcome', async () => {
    const { runtime, sourceId } = await hookRuntime();
    const app = createApp(runtime);
    const res = await post(app, sourceId, JSON.stringify([obs(), { source: { platform: 'tg' } }]));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { accepted: number; rejected: number; outcomes: Array<{ status: string; leadId?: string; reasons: string[] }> };
    expect(body.accepted).toBe(1);
    expect(body.rejected).toBe(1);
    expect(body.outcomes[1]!.reasons[0]).toMatch(/^invalid:/);

    const lead = await runtime.store.getLead(body.outcomes[0]!.leadId!);
    expect(lead?.contacts).toEqual(expect.arrayContaining([{ type: 'telegram', value: '@irina_hr' }]));
    expect(lead?.sourceRef).toMatchObject({ platform: 'telegram', channel: '-1001234567890', channelTitle: 'Frontend jobs', visibility: 'private', messageId: '48213' });
    expect(lead?.minhash_sketch).toBeTruthy();
  });

  it('merges the same post seen twice and a cross-post by the same contact', async () => {
    const { runtime, sourceId } = await hookRuntime();
    const app = createApp(runtime);
    const first = (await (await post(app, sourceId, JSON.stringify([obs()]))).json()) as { outcomes: Array<{ leadId: string }> };
    const leadId = first.outcomes[0]!.leadId;

    const again = (await (await post(app, sourceId, JSON.stringify([obs()]))).json()) as { duplicate: number };
    expect(again.duplicate).toBe(1);

    const crossPost = obs({
      source: { platform: 'telegram', channel: '-1009999999999', message_id: '7' },
      author: { handle: '@irina_hr' },
      text: 'Ищем React-разработчика в продуктовую команду! TypeScript, Next.js, работа удалённо. Зарплата 250 000 ₽. Пишите @irina_hr',
    });
    const cross = (await (await post(app, sourceId, JSON.stringify([crossPost]))).json()) as {
      duplicate: number;
      outcomes: Array<{ leadId: string; reasons: string[] }>;
    };
    expect(cross.duplicate).toBe(1);
    expect(cross.outcomes[0]!.leadId).toBe(leadId);

    const unrelated = obs({
      source: { platform: 'telegram', channel: '-1009999999999', message_id: '8' },
      text: 'Нужен дизайнер логотипа для кофейни, бюджет 15 000 ₽, срок неделя. Пишите @irina_hr',
      type: 'gig',
      budget: { max: 15000, currency: 'RUB', period: 'fixed' },
    });
    const other = (await (await post(app, sourceId, JSON.stringify([unrelated]))).json()) as { accepted: number };
    expect(other.accepted).toBe(1);
  });

  it('rejects more than 500 observations in one request', async () => {
    const { runtime, sourceId } = await hookRuntime();
    const app = createApp(runtime);
    const res = await post(app, sourceId, JSON.stringify(Array.from({ length: 501 }, () => obs())));
    expect(res.status).toBe(400);
  });

  it('shows contacts and the channel on the lead page, and hides contacts from guests on the hub', async () => {
    const { runtime, sourceId } = await hookRuntime({ RADAR_PUBLIC_READ: 'true', RADAR_MODE: 'hub', RADAR_TIER_DELAYS: 'guest=0,member=0' });
    const app = createApp(runtime);
    const body = (await (await post(app, sourceId, JSON.stringify([obs()]))).json()) as { outcomes: Array<{ leadId: string }> };
    const leadId = body.outcomes[0]!.leadId;

    const guest = await (await app.request(`/leads/${leadId}`)).text();
    expect(guest).not.toContain('@irina_hr');
    expect(guest).toContain('/login');
    expect(guest).toContain('Frontend jobs');

    const session = await makeUserSession(runtime);
    const member = await (await app.request(`/leads/${leadId}`, { headers: { cookie: `radar_session=${session}` } })).text();
    expect(member).toContain('href="https://t.me/irina_hr"');
  });
});

describe('radar push', () => {
  it('ingests NDJSON into the local store and counts outcomes', async () => {
    const { runtime, sourceId } = await hookRuntime();
    const source = (await runtime.store.getSource(sourceId))!;
    const input = Readable.from([`${JSON.stringify(obs())}\n`, 'not json\n', '\n', `${JSON.stringify(obs())}\n`]);
    const summary = await pushLocal(input, source, {
      store: runtime.store,
      sinks: runtime.sinks,
      logger: runtime.logger,
      env: runtime.env,
    });
    expect(summary).toMatchObject({ received: 3, accepted: 1, duplicate: 1, rejected: 1 });
    expect(summary.errors[0]).toContain('line 2');
  });

  it('sends batches to a remote node with the source token', async () => {
    const { runtime, sourceId } = await hookRuntime();
    const app = createApp(runtime);
    const calls: string[] = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      calls.push(url);
      return app.request(new URL(url).pathname, init);
    }) as unknown as typeof fetch;
    const summary = await pushRemote(Readable.from([`${JSON.stringify(obs())}\n`]), {
      url: 'https://node.example',
      sourceId,
      token: TOKEN,
      fetchImpl,
    });
    expect(calls).toEqual([`https://node.example/api/v2/ingest/${sourceId}`]);
    expect(summary).toMatchObject({ received: 1, accepted: 1 });
  });
});
