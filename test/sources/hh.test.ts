import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createSourceRegistry } from '../../src/sources/index.ts';
import { makeSource, pollContext } from '../helpers.ts';

function fixture(name: string): string {
  return readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8');
}

describe('HeadHunter (HH.ru) Source Adapter', () => {
  const registry = createSourceRegistry();

  it('is registered in the source registry', () => {
    const adapter = registry.get('hh');
    expect(adapter).toBeDefined();
    expect(adapter?.kind).toBe('hh');
    expect(adapter?.access).toBe('official');
    expect(adapter?.poll).toBeTypeOf('function');
  });

  it('parses HH vacancies and maps to RawLeads keeping contacts in the text', async () => {
    const adapter = registry.get('hh');
    expect(adapter?.poll).toBeDefined();

    let capturedHeaders: Record<string, string> | undefined;
    let capturedUrl: string | undefined;

    const baseCtx = pollContext(fixture('hh.json'));
    const ctx = {
      ...baseCtx,
      fetchImpl: async (input: RequestInfo | URL, init?: RequestInit) => {
        capturedUrl = input.toString();
        capturedHeaders = (init?.headers ?? {}) as Record<string, string>;
        return new Response(fixture('hh.json'), { status: 200 });
      },
    };

    const source = makeSource({
      kind: 'hh',
      config: {
        url: 'https://api.hh.ru/vacancies',
        text: 'golang',
        limit: 10,
      },
    });

    const leads = await adapter!.poll!(source, ctx);

    // Verify User-Agent header and URL query parameters
    expect(capturedUrl).toContain('text=golang');
    expect(capturedUrl).toContain('per_page=10');
    // The adapter must honor the operator-configured User-Agent, not a hardcoded one
    expect(capturedHeaders?.['User-Agent']).toBe('radar-test');

    // Verify items count
    expect(leads).toHaveLength(3);

    // Item 1: Senior Go developer with from/to salary in RUR
    const first = leads[0]!;
    expect(first.type).toBe('job');
    expect(first.title).toBe('Senior Go / Golang Backend Developer');
    expect(first.externalId).toBe('hh:11223344');
    expect(first.url).toBe('https://hh.ru/vacancy/11223344');
    expect(first.author).toBe('HeadHunter Digital');
    expect(first.city).toBe('Москва');
    expect(first.budget).toBe(280000);
    expect(first.currency).toBe('RUB'); // RUR normalized to RUB
    expect(first.rawSalary).toBe('от 280000 до 380000 RUB');
    expect(first.isRemote).toBe(true);
    expect(first.skills).toContain('Go');
    expect(first.skills).toContain('PostgreSQL');
    expect(first.skills).toContain('Docker');
    expect(first.skills).toContain('Kubernetes');

    // Item 2: Frontend developer with from-only salary
    const second = leads[1]!;
    expect(second.type).toBe('job');
    expect(second.title).toBe('Frontend Разработчик (TypeScript, React)');
    expect(second.externalId).toBe('hh:55667788');
    expect(second.budget).toBe(180000);
    expect(second.currency).toBe('RUB');
    expect(second.city).toBe('Санкт-Петербург');
    expect(second.skills).toContain('TypeScript');
    expect(second.skills).toContain('React');

    // Item 3: 1C developer with to-only salary
    const third = leads[2]!;
    expect(third.type).toBe('job');
    expect(third.title).toBe('Программист 1С');
    expect(third.externalId).toBe('hh:99887766');
    expect(third.budget).toBe(150000);
    expect(third.currency).toBe('RUB');
    expect(third.skills).toContain('1С');

    // Direct contacts are preserved as-is for community reach
    expect(leads[0]?.text).toContain('+7 (495) 123-45-67');
    expect(leads[0]?.text).toContain('hr@company.ru');
  });
});
