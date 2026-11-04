import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { companyKeyOf } from '../src/core/company.ts';
import { ingestRawLead } from '../src/pipeline/ingest.ts';
import { SimilarIndex } from '../src/pipeline/similar.ts';
import { makeTestRuntime } from './helpers.ts';

describe('company key', () => {
  it('reads the employer from aggregator and ATS addresses alike', () => {
    expect(companyKeyOf({ url: 'https://himalayas.app/companies/binance/jobs/rwa-growth-specialist' })).toBe('binance');
    expect(companyKeyOf({ url: 'https://job-boards.eu.greenhouse.io/binance/jobs/5013604101' })).toBe('binance');
    expect(companyKeyOf({ url: 'https://himalayas.app/companies/robots-pencils/jobs/x' })).toBe(companyKeyOf({ author: 'Robots & Pencils' }));
    expect(companyKeyOf({ author: 'ООО «Ромашка»' })).toBe('ромашка');
    expect(companyKeyOf({ author: '@channel' })).toBeUndefined();
  });
});

describe('cross-board duplicates', () => {
  function deps() {
    const runtime = makeTestRuntime();
    return { runtime, ingest: { store: runtime.store, sinks: runtime.sinks, logger: runtime.logger, env: runtime.env, similar: new SimilarIndex(runtime.store) } };
  }

  it('joins an aggregator copy to the company page and keeps where it was seen', async () => {
    const { runtime, ingest } = deps();
    const run = randomUUID().slice(0, 8);
    const ats = await runtime.store.createSource({ kind: 'ats', title: 'Greenhouse' });
    const agg = await runtime.store.createSource({ kind: 'rss', title: 'Himalayas' });
    const title = `RWA Growth Specialist ${run}`;
    const first = await ingestRawLead({ sourceId: '', type: 'job', title, text: 'Grow real-world asset products across markets. Remote.', url: `https://job-boards.eu.greenhouse.io/binance/jobs/${run}`, author: 'Binance' }, ats, ingest);
    expect(first.status).not.toBe('duplicate');
    // Two days later: past the one-day title rule, the employer joins them.
    const later = { ...ingest, now: () => new Date(Date.now() + 2 * 86_400_000) };
    const copy = await ingestRawLead({ sourceId: '', type: 'job', title, text: 'Binance is hiring. A different summary written by the aggregator for this role.', url: `https://himalayas.app/companies/binance/jobs/rwa-${run}` }, agg, later);
    expect(copy).toMatchObject({ status: 'duplicate', reasons: ['duplicate:title_company'] });
    expect(copy.lead?.id).toBe(first.lead?.id);
    const sightings = await runtime.store.listLeadSightings!(first.lead!.id);
    expect(sightings).toMatchObject([{ url: `https://himalayas.app/companies/binance/jobs/rwa-${run}`, sourceId: agg.id, method: 'title_company' }]);
  });

  it('keeps the same title at another company as its own vacancy', async () => {
    const { runtime, ingest } = deps();
    const run = randomUUID().slice(0, 8);
    const ats = await runtime.store.createSource({ kind: 'ats', title: 'Ashby' });
    const title = `IT Support Engineer ${run}`;
    await ingestRawLead({ sourceId: '', type: 'job', title, text: 'Support our offices.', url: `https://jobs.ashbyhq.com/elevenlabs/${run}`, author: 'ElevenLabs', city: 'London' }, ats, ingest);
    const other = await ingestRawLead({ sourceId: '', type: 'job', title, text: 'Help desk for a fintech.', url: `https://jobs.ashbyhq.com/socure/${run}`, author: 'Socure', city: 'Boston' }, ats, ingest);
    expect(other.status).not.toBe('duplicate');
  });

  it('joins a vacancy by title only at the same employer, also when the feed names it in the text', async () => {
    const { runtime, ingest } = deps();
    const run = randomUUID().slice(0, 8);
    const hh = await runtime.store.createSource({ kind: 'rss', title: 'hh' });
    const title = `Программист 1С ${run}`;
    const vacancy = (id: number, company: string, more = '') => ({ sourceId: '', type: 'job' as const, title, text: `Вакансия компании: ${company}
Создана: 04.11.2026${more}`, url: `https://hh.ru/vacancy/${id}` });
    await ingestRawLead(vacancy(1, 'Инструмент-д'), hh, ingest);
    expect((await ingestRawLead(vacancy(2, 'Рога и копыта'), hh, ingest)).status).not.toBe('duplicate');
    expect(await ingestRawLead(vacancy(3, 'Инструмент-д'), hh, ingest)).toMatchObject({ status: 'duplicate', reasons: ['duplicate:title_company'] });
  });

  it('notes another feed reading the same page, and nothing for a re-read', async () => {
    const { runtime, ingest } = deps();
    const run = randomUUID().slice(0, 8);
    const one = await runtime.store.createSource({ kind: 'rss', title: 'One' });
    const two = await runtime.store.createSource({ kind: 'rss', title: 'Two' });
    const raw = { sourceId: '', type: 'job' as const, title: `Аналитик ${run}`, text: 'Вакансия компании: Альфа', url: `https://hh.ru/vacancy/9${run.replace(/\D/g, '')}` };
    const first = await ingestRawLead(raw, one, ingest);
    await ingestRawLead(raw, one, ingest);
    expect(await runtime.store.listLeadSightings!(first.lead!.id)).toHaveLength(0);
    await ingestRawLead(raw, two, ingest);
    expect(await runtime.store.listLeadSightings!(first.lead!.id)).toMatchObject([{ sourceId: two.id, url: raw.url }]);
  });

  it('finds near-duplicate texts through the stored band index', async () => {
    const { runtime, ingest } = deps();
    const run = randomUUID().slice(0, 8);
    const source = await runtime.store.createSource({ kind: 'telegram', title: 'Chat' });
    const text = `Ищем опытного Senior Go разработчика ${run} в распределённую команду финтеха. Требования: от четырёх лет коммерческой разработки на Go, PostgreSQL, Kafka, RabbitMQ, Docker, Kubernetes. Полная удалёнка, вилка от 400 000 до 550 000 рублей на руки.`;
    const first = await ingestRawLead({ sourceId: '', type: 'job', title: `Senior Go ${run}`, text, url: `https://t.me/a/${run}` }, source, ingest);
    const copy = await ingestRawLead({ sourceId: '', type: 'job', title: `Go-разработчик в финтех ${run}`, text: `${text} Ждём отклики!`, url: `https://t.me/b/${run}` }, source, ingest);
    expect(copy).toMatchObject({ status: 'duplicate', reasons: ['duplicate:similar'] });
    expect(copy.lead?.id).toBe(first.lead?.id);
    expect(await runtime.store.hasLeadBands!()).toBe(true);
  });
});
