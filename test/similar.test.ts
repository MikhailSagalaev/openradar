import { describe, expect, it } from 'vitest';
import { computeMinHashSketch } from '../src/core/fingerprint.ts';
import { SimilarIndex } from '../src/pipeline/similar.ts';

describe('SimilarIndex LSH deduplication', () => {
  const store = {
    listRecentSketches: async () => [],
  };

  const text1 = `
    Мы ищем опытного Senior Go разработчика в распределенную команду финтеха.
    Требования:
    - От 4 лет коммерческой разработки на Go (Golang)
    - Глубокое понимание PostgreSQL, оптимизация сложных SQL запросов
    - Опыт работы с Apache Kafka, RabbitMQ и микросервисной архитектурой
    - Понимание Docker, Kubernetes, CI/CD
    Предлагаем:
    - Полная удаленка (remote worldwide)
    - Зарплатная вилка от 400 000 до 550 000 рублей на руки
    - Оформление по ТК РФ или контракт через зарубежное юрлицо
  `;

  const text1Duplicate = `
    Срочно ищем Senior Go разработчика (Golang)!
    Предлагаем:
    - Зарплатная вилка от 400 000 до 550 000 рублей на руки
    - Полная удаленка (remote worldwide)
    - Оформление по ТК РФ или контракт через зарубежное юрлицо
    Требования к кандидату:
    - От 4 лет коммерческой разработки на Go (Golang)
    - Глубокое понимание PostgreSQL, оптимизация сложных SQL запросов
    - Опыт работы с Apache Kafka, RabbitMQ и микросервисной архитектурой
    - Понимание Docker, Kubernetes, CI/CD
    Ждем ваши отклики!
  `;

  const text2 = `
    Требуется дизайнер карточек для Wildberries и Ozon.
    Опыт создания продающей инфографики в Figma или Photoshop.
    Оплата 2000 руб за карточку товара.
  `;

  it('detects near-duplicate leads via LSH band index', async () => {
    const index = new SimilarIndex(store);
    const now = new Date('2026-10-30T12:00:00Z');

    const sketch1 = computeMinHashSketch(text1);
    index.add('lead-1', sketch1, now.toISOString());

    const sketchDup = computeMinHashSketch(text1Duplicate);
    const foundId = await index.findSimilar(sketchDup, now, 0.75);

    expect(foundId).toBe('lead-1');
  });

  it('does not match completely different leads', async () => {
    const index = new SimilarIndex(store);
    const now = new Date('2026-10-30T12:00:00Z');

    const sketch1 = computeMinHashSketch(text1);
    index.add('lead-1', sketch1, now.toISOString());

    const sketch2 = computeMinHashSketch(text2);
    const foundId = await index.findSimilar(sketch2, now, 0.75);

    expect(foundId).toBeUndefined();
  });

  it('respects the 7-day cutoff window', async () => {
    const index = new SimilarIndex(store);
    const oldDate = new Date('2026-10-20T12:00:00Z');
    const now = new Date('2026-10-30T12:00:00Z'); // 10 days later

    const sketch1 = computeMinHashSketch(text1);
    index.add('lead-old', sketch1, oldDate.toISOString());

    const sketchDup = computeMinHashSketch(text1Duplicate);
    const foundId = await index.findSimilar(sketchDup, now, 0.75);

    expect(foundId).toBeUndefined();
  });

  it('handles removal of leads', async () => {
    const index = new SimilarIndex(store);
    const now = new Date('2026-10-30T12:00:00Z');

    const sketch1 = computeMinHashSketch(text1);
    index.add('lead-1', sketch1, now.toISOString());
    index.remove('lead-1');

    const sketchDup = computeMinHashSketch(text1Duplicate);
    const foundId = await index.findSimilar(sketchDup, now, 0.75);

    expect(foundId).toBeUndefined();
  });
});
