import { describe, expect, it } from 'vitest';
import {
  computeMinHashBands,
  computeMinHashSketch,
  estimateJaccardFromSketches,
  fingerprintOf,
  MINHASH_BANDS,
  sha256,
  titleKeyOf,
} from '../src/core/fingerprint.ts';

describe('MinHash sketches & fuzzy deduplication (radar/1)', () => {
  const baseJobText = `
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

  const repostedJobText = `
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

  const completelyDifferentJobText = `
    Ищем Middle+ React Native разработчика для мобильного фитнес-приложения.
    Стек: React Native, TypeScript, Redux Toolkit, iOS, Android, Expo.
    Нужно верстать адаптивные экраны по макетам в Figma, настраивать пуш-уведомления
    и оптимизировать анимации через Reanimated 3.
    Оплата: 150 000 - 200 000 руб, работа в офисе в Москве.
  `;

  it('identical texts give Jaccard similarity of 1.0', () => {
    const sketchA = computeMinHashSketch(baseJobText);
    const sketchB = computeMinHashSketch(baseJobText);

    expect(sketchA.length).toBeGreaterThan(0);
    expect(estimateJaccardFromSketches(sketchA, sketchB)).toBe(1.0);
  });

  it('reposted vacancy with rearranged sections gives Jaccard >= 0.75', () => {
    const sketchOriginal = computeMinHashSketch(baseJobText);
    const sketchRepost = computeMinHashSketch(repostedJobText);

    const jaccard = estimateJaccardFromSketches(sketchOriginal, sketchRepost);
    expect(jaccard).toBeGreaterThanOrEqual(0.75);
  });

  it('different vacancies give Jaccard < 0.25', () => {
    const sketchGo = computeMinHashSketch(baseJobText);
    const sketchReact = computeMinHashSketch(completelyDifferentJobText);

    const jaccard = estimateJaccardFromSketches(sketchGo, sketchReact);
    expect(jaccard).toBeLessThan(0.25);
  });

  it('handles empty or short texts gracefully', () => {
    const sketchEmpty = computeMinHashSketch('');
    const sketchShort = computeMinHashSketch('Нужен лендинг');

    expect(typeof sketchEmpty).toBe('string');
    expect(typeof sketchShort).toBe('string');
    expect(estimateJaccardFromSketches(sketchEmpty, sketchShort)).toBeLessThan(0.25);
  });

  it('preserves classic fingerprint and titleKey functions', () => {
    const titleKey = titleKeyOf('Senior Go (Golang) Developer / Архитектор!');
    expect(titleKey).toContain('senior go golang developer');

    const fp = fingerprintOf({
      canonicalUrl: 'https://example.com/job/1',
      title: 'Senior Go',
      text: 'Sample text',
    });
    expect(fp).toMatch(/^[0-9a-f]{64}$/);
    expect(sha256('test')).toBe('9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08');
  });

  it('computes 16 LSH bands and collides on near-duplicates', () => {
    const sketchOriginal = computeMinHashSketch(baseJobText);
    const sketchRepost = computeMinHashSketch(repostedJobText);
    const sketchReact = computeMinHashSketch(completelyDifferentJobText);

    const bandsOriginal = computeMinHashBands(sketchOriginal);
    const bandsRepost = computeMinHashBands(sketchRepost);
    const bandsReact = computeMinHashBands(sketchReact);

    expect(bandsOriginal).toHaveLength(MINHASH_BANDS);
    expect(bandsRepost).toHaveLength(MINHASH_BANDS);
    expect(bandsReact).toHaveLength(MINHASH_BANDS);

    // Near duplicate must collide in at least one band (usually 3-10 bands for 0.75+ similarity)
    const repostCollisions = bandsOriginal.filter((b, idx) => b === bandsRepost[idx]);
    expect(repostCollisions.length).toBeGreaterThanOrEqual(1);

    // Completely different text should have 0 collisions
    const diffCollisions = bandsOriginal.filter((b, idx) => b === bandsReact[idx]);
    expect(diffCollisions.length).toBe(0);
  });
});
