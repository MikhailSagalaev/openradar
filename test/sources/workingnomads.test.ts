import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createSourceRegistry } from '../../src/sources/index.ts';
import { makeSource, pollContext } from '../helpers.ts';

describe('Working Nomads source adapter', () => {
  const adapter = createSourceRegistry().get('workingnomads')!;
  const body = readFileSync(new URL('../fixtures/workingnomads.json', import.meta.url), 'utf8');

  it('reads remote jobs with company, tags and plain text', async () => {
    const ctx = { ...pollContext(''), fetchImpl: async () => new Response(body, { status: 200 }) };
    const leads = await adapter.poll!(makeSource({ kind: 'workingnomads', config: {} }), ctx);
    expect(leads).toHaveLength(2);
    expect(leads[0]).toMatchObject({ type: 'job', isRemote: true, city: 'Онлайн' });
    expect(leads[0]!.url).toMatch(/^https:\/\/www\.workingnomads\.com\/job\/go\/\d+\/$/);
    expect(leads[0]!.author).toBeTruthy();
    expect(leads[0]!.text).toContain('Company: ');
    expect(leads[0]!.text).not.toMatch(/<p>/);
    expect(leads[0]!.skills).not.toContain('english');
  });
});
