import { afterEach, describe, expect, it } from 'vitest';
import { refilterLeads } from '../src/pipeline/refilter.ts';
import type { Runtime } from '../src/runtime.ts';
import { makeTestRuntime } from './helpers.ts';

const openRuntimes: Runtime[] = [];
afterEach(async () => {
  for (const runtime of openRuntimes.splice(0)) await runtime.store.close().catch(() => undefined);
});

function makeRuntime(): Runtime {
  const base = makeTestRuntime();
  const runtime = base as unknown as Runtime;
  openRuntimes.push(runtime);
  return runtime;
}

describe('refilter pass', () => {
  it('dry-run reports matches without changing status; apply rejects only the new matches', async () => {
    const runtime = makeRuntime();
    const src = await runtime.store.createSource({ kind: 'rss', title: 'S' });
    const now = new Date();
    const insert = (id: string, title: string, text: string, status: 'new' | 'rejected' = 'new') =>
      runtime.store.insertLead({
        id, sourceId: src.id, type: 'gig', title, text,
        url: `https://example.com/${id}`, externalId: `x-${id}`, fingerprint: `f-${id}`, titleKey: `k-${id}`,
        status, score: 50, reasons: status === 'rejected' ? ['spam:JOB_SEEKER'] : [], skills: [],
        createdAt: now.toISOString(),
      } as never);
    await insert('spam', 'массовая отправка личных сообщений в социальной сети', 'нужно помощь в массой отправке сообщений, база 10к');
    await insert('recovery', 'Recuperación Urgente de Instagram Bloqueado', 'recuperación de cuentas de Instagram bloqueadas');
    await insert('clean', 'Нужен лендинг на Tilda', 'Сверстать лендинг для кофейни, бюджет 30000 ₽');
    await insert('old', 'Ищу работу менеджером', '#помогу #резюме', 'rejected');

    const dry = await refilterLeads(runtime.store, { days: 30, now });
    expect(dry.matched).toBe(2);
    expect(dry.rejected).toBe(0);
    expect((await runtime.store.getLead('spam'))?.status).toBe('new');

    const applied = await refilterLeads(runtime.store, { days: 30, now, apply: true });
    expect(applied.rejected).toBe(2);
    const spam = await runtime.store.getLead('spam');
    expect(spam?.status).toBe('rejected');
    expect(spam?.reasons).toContain('spam:MASS_MESSAGING');
    expect((await runtime.store.getLead('recovery'))?.status).toBe('rejected');
    expect((await runtime.store.getLead('clean'))?.status).toBe('new');
    // The already-rejected lead is left alone, never restored.
    expect((await runtime.store.getLead('old'))?.status).toBe('rejected');
  });
});
