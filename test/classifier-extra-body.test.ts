import { afterEach, describe, expect, it, vi } from 'vitest';
import { OpenAiClassifier } from '../src/classifier/openai.ts';

const logger = { info() {}, warn() {}, error() {}, debug() {}, child() { return logger; } } as never;

// The classifier calls the global fetch: stub it, or the tests would hit the network.
afterEach(() => vi.unstubAllGlobals());

const verdictBody = JSON.stringify({
  choices: [{ message: { content: '{"isLead":true,"confidence":1,"summary":"Builds a thing","skills":["React"]}' } }],
});

describe('OpenAiClassifier OPENAI_EXTRA_BODY', () => {
  it('merges the verbatim JSON into every request', async () => {
    const bodies: Array<Record<string, unknown>> = [];
    const fetchImpl = vi.fn(async (_url: unknown, init?: { body?: string }) => {
      bodies.push(JSON.parse(init?.body ?? '{}') as Record<string, unknown>);
      return new Response(verdictBody, { status: 200 });
    });
    vi.stubGlobal('fetch', fetchImpl);
    const env = {
      OPENAI_API_KEY: 'k', OPENAI_BASE_URL: 'https://llm.test/v1', OPENAI_MODEL: 'qwen3.6-flash',
      OPENAI_EXTRA_BODY: '{"enable_thinking":false}',
    } as never;
    const classifier = new OpenAiClassifier(env, logger);
    const verdict = await classifier.classify({ title: 't', text: 'Build a thing' });
    expect(bodies[0]?.enable_thinking).toBe(false);
    expect(bodies[0]?.response_format).toEqual({ type: 'json_object' });
    expect(bodies[0]?.messages).toHaveLength(2);
    expect(verdict?.isLead).toBe(true);
  });

  it('keeps the request clean when the variable is absent', async () => {
    const bodies: Array<Record<string, unknown>> = [];
    const fetchImpl = vi.fn(async (_url: unknown, init?: { body?: string }) => {
      bodies.push(JSON.parse(init?.body ?? '{}') as Record<string, unknown>);
      return new Response(verdictBody, { status: 200 });
    });
    vi.stubGlobal('fetch', fetchImpl);
    const env = { OPENAI_API_KEY: 'k', OPENAI_BASE_URL: 'https://llm.test/v1', OPENAI_MODEL: 'm' } as never;
    const classifier = new OpenAiClassifier(env, logger);
    await classifier.classify({ title: 't', text: 'Build a thing' });
    expect('enable_thinking' in (bodies[0] ?? {})).toBe(false);
  });

  it('ignores an invalid JSON value instead of breaking requests', async () => {
    const bodies: Array<Record<string, unknown>> = [];
    const fetchImpl = vi.fn(async (_url: unknown, init?: { body?: string }) => {
      bodies.push(JSON.parse(init?.body ?? '{}') as Record<string, unknown>);
      return new Response(verdictBody, { status: 200 });
    });
    vi.stubGlobal('fetch', fetchImpl);
    const env = { OPENAI_API_KEY: 'k', OPENAI_BASE_URL: 'https://llm.test/v1', OPENAI_MODEL: 'm', OPENAI_EXTRA_BODY: '{oops' } as never;
    const classifier = new OpenAiClassifier(env, logger);
    const verdict = await classifier.classify({ title: 't', text: 'Build a thing' });
    expect(bodies[0]?.enable_thinking).toBeUndefined();
    expect(verdict?.isLead).toBe(true);
  });
});
