import { describe, it, expect } from 'vitest';
import {
  calculateRobustStats,
  calculateOlqi,
  classifyTaskTransformation,
  formatEditorialTakeaway,
  quantile,
  trimmedMean,
} from '../src/research/methodology.ts';

describe('Research Methodology & Scientific Scoring Engine', () => {
  describe('Robust Statistics Triad', () => {
    it('computes exact quantiles for clean arrays', () => {
      const arr = [10, 20, 30, 40, 50];
      expect(quantile(arr, 0.5)).toBe(30);
      expect(quantile(arr, 0.25)).toBe(20);
      expect(quantile(arr, 0.75)).toBe(40);
    });

    it('calculates 10% trimmed mean discarding extreme outliers', () => {
      // 10 elements: outliers 5 and 1000
      const arr = [5, 50, 52, 54, 55, 56, 58, 60, 62, 1000];
      const mean = trimmedMean(arr, 0.10);
      // Discards 5 and 1000, averages [50..62]
      expect(mean).toBeGreaterThan(50);
      expect(mean).toBeLessThan(65);
    });

    it('marks sample as low when n < 10 and unreliable when n < 30', () => {
      const small = [100, 200, 300];
      const statsSmall = calculateRobustStats(small);
      expect(statsSmall.isLowSample).toBe(true);
      expect(statsSmall.isReliable).toBe(false);

      const mid = Array.from({ length: 20 }, (_, i) => 1000 + i * 50);
      const statsMid = calculateRobustStats(mid);
      expect(statsMid.isLowSample).toBe(false);
      expect(statsMid.isReliable).toBe(false); // n < 30 (CLT rule)
      expect(statsMid.median).toBeDefined();
      expect(statsMid.iqr).toBeDefined();

      const reliable = Array.from({ length: 35 }, (_, i) => 2000 + i * 50);
      const statsRel = calculateRobustStats(reliable);
      expect(statsRel.isReliable).toBe(true);
      expect(statsRel.n).toBe(35);
    });
  });

  describe('OpenRadar Lead Quality Index (OLQI)', () => {
    it('awards high score for transparent, structured briefs with direct client', () => {
      const lead = {
        text: `Ищем разработчика для интеграции Telegram Mini App с бэкендом на Node.js.
Требования:
- Опыт разработки ботов от 2 лет
- Знание TypeScript и PostgreSQL
- Умение настраивать Docker
Бюджет фиксированный: 120 000 рублей. Срок 3 недели.`,
        hasExplicitBudget: true,
        budgetAmount: 120000,
        authorHandle: 'tech_lead_alex',
        isDirectClient: true,
        authorRecentPostCount: 1,
        identifiedSkillsCount: 3,
      };

      const olqi = calculateOlqi(lead);
      expect(olqi.score).toBeGreaterThanOrEqual(80);
      expect(olqi.grade).toBe('A');
      expect(olqi.financialTransparency).toBe(100);
      expect(olqi.directClientVerification).toBe(100);
      expect(olqi.authorReputation).toBe(100);
    });

    it('penalizes vague briefs, lack of budget, and mass-repost spam bots', () => {
      const spamLead = {
        text: 'Срочно нужен спец!! Писать в лс!',
        hasExplicitBudget: false,
        authorHandle: undefined,
        isDirectClient: false,
        authorRecentPostCount: 25,
        identifiedSkillsCount: 0,
      };

      const olqi = calculateOlqi(spamLead);
      expect(olqi.score).toBeLessThan(45);
      expect(olqi.grade).toBe('D');
      expect(olqi.financialTransparency).toBeLessThan(35);
      expect(olqi.authorReputation).toBe(20);
    });
  });

  describe('Task Transformation Taxonomy (Routine Automation vs Emerging Skills)', () => {
    it('correctly classifies emerging specialized competencies', () => {
      const r1 = classifyTaskTransformation('Нужно настроить сложный пайплайн в n8n с вызовом AI-агентов');
      expect(r1.type).toBe('emerging');
      expect(r1.key).toBe('agent_rag');

      const r2 = classifyTaskTransformation('Требуется доработать MVP после Cursor и сделать рефакторинг');
      expect(r2.type).toBe('emerging');
      expect(r2.key).toBe('vibe_refactoring');

      const r3 = classifyTaskTransformation('Обучение LoRA модели под ComfyUI');
      expect(r3.type).toBe('emerging');
      expect(r3.key).toBe('lora_comfyui');
    });

    it('correctly classifies routine tasks undergoing automation', () => {
      const r1 = classifyTaskTransformation('Требуется простой рерайт статей для сайта туристической тематики');
      expect(r1.type).toBe('routine');
      expect(r1.key).toBe('copywriting_basic');

      const r2 = classifyTaskTransformation('Сделать перевод текста с английского на русский');
      expect(r2.type).toBe('routine');
      expect(r2.key).toBe('translation_simple');
    });
  });

  describe('Editorial Takeaway Formatter', () => {
    it('formats 3-step journalistic takeaway with quote attribution', () => {
      const res = formatEditorialTakeaway({
        fact: 'Около 84% публикуемых заказов имеют бюджет меньше 100 000 ₽.',
        contrast: '58% всей денежной массы сосредоточено в заказах крупнее 100 000 ₽.',
        conclusion: 'Мелкие задачи создают видимость потока, но реальная покупательная способность сконцентрирована в комплексных проектах.',
        sampleN: 18450,
        periodLabel: 'Q1 2026',
      });

      expect(res.html).toContain('rs-editorial-insight');
      expect(res.html).toContain('Выборка N = 18 450');
      expect(res.quote).toContain('OpenRadar, Q1 2026, n = 18450');
    });
  });
});
