import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createSourceRegistry } from '../../src/sources/index.ts';
import { makeSource, pollContext } from '../helpers.ts';

function fixture(name: string): string {
  return readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8');
}

const ENV = { RADAR_ADZUNA_APP_ID: 'test-app-id', RADAR_ADZUNA_APP_KEY: 'test-app-key' };

function withAdzunaEnv<T>(fn: () => Promise<T>): Promise<T> {
  const previous = { id: process.env.RADAR_ADZUNA_APP_ID, key: process.env.RADAR_ADZUNA_APP_KEY };
  process.env.RADAR_ADZUNA_APP_ID = ENV.RADAR_ADZUNA_APP_ID;
  process.env.RADAR_ADZUNA_APP_KEY = ENV.RADAR_ADZUNA_APP_KEY;
  return fn().finally(() => {
    if (previous.id === undefined) delete process.env.RADAR_ADZUNA_APP_ID;
    else process.env.RADAR_ADZUNA_APP_ID = previous.id;
    if (previous.key === undefined) delete process.env.RADAR_ADZUNA_APP_KEY;
    else process.env.RADAR_ADZUNA_APP_KEY = previous.key;
  });
}

describe('Adzuna Source Adapter', () => {
  const registry = createSourceRegistry();

  it('is registered in the source registry', () => {
    const adapter = registry.get('adzuna');
    expect(adapter).toBeDefined();
    expect(adapter?.kind).toBe('adzuna');
    expect(adapter?.access).toBe('official');
    expect(adapter?.poll).toBeTypeOf('function');
  });

  it('fails with a clear error when the keys are not in the environment', async () => {
    const adapter = registry.get('adzuna');
    const previous = { id: process.env.RADAR_ADZUNA_APP_ID, key: process.env.RADAR_ADZUNA_APP_KEY };
    delete process.env.RADAR_ADZUNA_APP_ID;
    delete process.env.RADAR_ADZUNA_APP_KEY;
    try {
      await expect(adapter!.poll!(makeSource({ kind: 'adzuna', config: {} }), pollContext('{}'))).rejects.toThrow(
        /RADAR_ADZUNA_APP_ID/,
      );
    } finally {
      if (previous.id) process.env.RADAR_ADZUNA_APP_ID = previous.id;
      if (previous.key) process.env.RADAR_ADZUNA_APP_KEY = previous.key;
    }
  });

  it('parses jobs, keeps real salaries only and reads the country currency', async () => {
    const adapter = registry.get('adzuna');
    let capturedUrl = '';
    const ctx = {
      ...pollContext(fixture('adzuna.json')),
      fetchImpl: async (input: RequestInfo | URL) => {
        capturedUrl = input.toString();
        return new Response(fixture('adzuna.json'), { status: 200 });
      },
    };

    const source = makeSource({
      kind: 'adzuna',
      config: { country: 'us', what: 'backend', limit: 50, maxDaysOld: 7 },
    });

    const leads = await withAdzunaEnv(() => adapter!.poll!(source, ctx));

    expect(capturedUrl).toContain('/v1/api/jobs/us/search/1');
    expect(capturedUrl).toContain('app_id=test-app-id');
    expect(capturedUrl).toContain('what=backend');
    expect(capturedUrl).toContain('max_days_old=7');
    expect(leads).toHaveLength(3);

    const senior = leads.find((lead) => lead.externalId === 'adzuna:4419291727')!;
    expect(senior.title).toBe('Senior Backend Engineer');
    expect(senior.author).toBe('Payflow Inc');
    expect(senior.budget).toBe(150000);
    expect(senior.currency).toBe('USD');
    expect(senior.rawSalary).toBe('150000 - 190000 USD per year');
    expect(senior.isRemote).toBe(false);
    expect(senior.city).toBe('New York, NY');
    expect(senior.text).toContain('Build');
    expect(senior.text).toContain('payments');
    expect(senior.text).toContain('infrastructure');
    expect(senior.text).not.toContain('<b>');

    // part_time with a real salary: stays priced, but as fixed pay (not annual).
    const support = leads.find((lead) => lead.externalId === 'adzuna:4419292000')!;
    expect(support.budget).toBe(30000);
    expect(support.currency).toBe('USD');
    expect(support.rawSalary).toBe('30000 USD');

    // The board guessed this one: it must not enter the feed as a real figure.
    const guessed = leads.find((lead) => lead.externalId === 'adzuna:4419293000')!;
    expect(guessed.budget).toBeUndefined();
    expect(guessed.isRemote).toBe(true);
  });

  it('returns no leads and does not throw on broken JSON', async () => {
    const adapter = registry.get('adzuna');
    const ctx = {
      ...pollContext('not json'),
      fetchImpl: async () => new Response('not json', { status: 200 }),
    };
    const source = makeSource({ kind: 'adzuna', config: {} });
    const leads = await withAdzunaEnv(() => adapter!.poll!(source, ctx));
    expect(leads).toEqual([]);
  });
});
