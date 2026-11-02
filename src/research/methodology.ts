/**
 * OpenRadar Research Methodology & Scientific Scoring Engine
 *
 * Implements robust statistics (median, IQR, trimmed mean), the OpenRadar
 * Lead Quality Index (OLQI), AI displacement vs creation tracking,
 * platform transparency scoring, and publishing heatmaps.
 */

export interface RobustStats {
  n: number;
  isReliable: boolean; // n >= 30 (Central Limit Theorem baseline)
  isLowSample: boolean; // n < 10
  median?: number;
  p25?: number;
  p75?: number;
  iqr?: number;
  trimmedMean?: number; // 10% trimmed mean (P05..P95)
  min?: number;
  max?: number;
}

export interface OlqiBreakdown {
  score: number; // 0..100
  financialTransparency: number; // 0..100 (weight 30%)
  briefCompleteness: number; // 0..100 (weight 30%)
  directClientVerification: number; // 0..100 (weight 25%)
  authorReputation: number; // 0..100 (weight 15%)
  grade: 'A' | 'B' | 'C' | 'D';
}

export interface AiCategoryMetrics {
  displacedTasks: {
    category: string;
    label: string;
    count: number;
    prevCount: number;
    changePct: number;
  }[];
  createdTasks: {
    category: string;
    label: string;
    count: number;
    prevCount: number;
    changePct: number;
  }[];
  netAiIndexPct: number; // Net growth or shift
}

export interface PlatformTransparencyMetric {
  platform: string;
  totalLeads: number;
  leadsWithBudget: number;
  budgetDisclosureRatePct: number; // % of leads with explicit money
  medianBudgetUsd?: number;
  averageOlqi: number;
  transparencyRank: number;
}

export interface HeatmapCell {
  dayOfWeek: number; // 0 = Sunday, 1 = Monday, ... 6 = Saturday
  hourUtc: number; // 0..23
  totalCount: number;
  topDecileCount: number; // Count of orders in top 10% budget
  topDecileRatio: number; // topDecileCount / totalCount
}

/** Quantile of a sorted array using linear interpolation (R type 7 / standard) */
export function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0]!;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
}

/** Calculates 10% trimmed mean (discarding lower 5% and upper 5% outliers) */
export function trimmedMean(values: number[], trimRatio = 0.05): number | undefined {
  const valid = values.filter((v) => Number.isFinite(v) && v > 0).sort((a, b) => a - b);
  if (valid.length === 0) return undefined;
  if (valid.length < 5) {
    return Math.round(valid.reduce((sum, v) => sum + v, 0) / valid.length);
  }
  const lowIndex = Math.floor(valid.length * trimRatio);
  const highIndex = Math.ceil(valid.length * (1 - trimRatio));
  const slice = valid.slice(lowIndex, highIndex);
  if (slice.length === 0) return Math.round(valid[0]!);
  const sum = slice.reduce((acc, v) => acc + v, 0);
  return Math.round(sum / slice.length);
}

/** Robust statistics triad: Median, Interquartile Range (IQR), and 10% Trimmed Mean */
export function calculateRobustStats(values: number[]): RobustStats {
  const sorted = values.filter((v) => Number.isFinite(v) && v > 0).sort((a, b) => a - b);
  const n = sorted.length;
  if (n === 0) {
    return { n: 0, isReliable: false, isLowSample: true };
  }

  const isReliable = n >= 30; // CLT rule
  const isLowSample = n < 10;

  if (isLowSample) {
    return { n, isReliable: false, isLowSample: true, min: sorted[0], max: sorted[sorted.length - 1] };
  }

  const p25 = Math.round(quantile(sorted, 0.25));
  const median = Math.round(quantile(sorted, 0.50));
  const p75 = Math.round(quantile(sorted, 0.75));
  const iqr = p75 - p25;
  const tMean = trimmedMean(sorted, 0.05);

  return {
    n,
    isReliable,
    isLowSample: false,
    p25,
    median,
    p75,
    iqr,
    trimmedMean: tMean,
    min: sorted[0],
    max: sorted[sorted.length - 1],
  };
}

/**
 * OpenRadar Lead Quality Index (OLQI)
 * Formula: OLQI = 0.30*F + 0.30*S + 0.25*V + 0.15*R
 */
export function calculateOlqi(input: {
  text: string;
  hasExplicitBudget: boolean;
  budgetAmount?: number;
  authorHandle?: string;
  isDirectClient?: boolean;
  authorRecentPostCount?: number;
  identifiedSkillsCount?: number;
}): OlqiBreakdown {
  const {
    text,
    hasExplicitBudget,
    budgetAmount,
    authorHandle,
    isDirectClient = true,
    authorRecentPostCount = 1,
    identifiedSkillsCount = 0,
  } = input;

  // 1. Financial transparency (F: 30%)
  let f = 0;
  if (hasExplicitBudget && budgetAmount && budgetAmount > 0) {
    f = 70;
    // Reasonable non-placeholder budget range check
    if (budgetAmount >= 1000 && budgetAmount <= 5_000_000) {
      f = 100;
    }
  } else if (/договорная|по договоренности|обсуждаем/i.test(text)) {
    f = 30;
  } else {
    f = 10;
  }

  // 2. Brief completeness & specification quality (S: 30%)
  const words = text.trim().split(/\s+/).filter(Boolean);
  const wordCount = words.length;
  let s = 20;
  if (wordCount >= 20 && wordCount < 60) {
    s = 50;
  } else if (wordCount >= 60 && wordCount <= 250) {
    s = 85; // Sweet spot for a concise, actionable contract brief
  } else if (wordCount > 250) {
    s = 70; // Overly verbose or corporate boilerplate
  }

  // Bonus for structured bullet points (-, *, •, \d+\.)
  if (/(?:^|\n)\s*[-*•\d+.]\s+/m.test(text)) {
    s = Math.min(100, s + 10);
  }
  // Bonus for explicit tech stack tokens
  if (identifiedSkillsCount >= 2) {
    s = Math.min(100, s + 10);
  }

  // 3. Direct client verification (V: 25%)
  let v = 50;
  const isAgency = /кадровое агентство|ищу для клиента|рекрутинговое|it-agency|outstaff/i.test(text);
  if (isAgency) {
    v = 20;
  } else if (isDirectClient) {
    v = 80;
    if (authorHandle && authorHandle.trim().length > 0) {
      v = 100; // Direct contact provided
    }
  }

  // 4. Author anti-spam reputation (R: 15%)
  let r = 100;
  if (authorRecentPostCount > 20) {
    r = 20; // High frequency mass-reposting bot
  } else if (authorRecentPostCount > 5) {
    r = 60;
  } else {
    r = 100; // Normal client
  }

  const totalScore = Math.round(0.30 * f + 0.30 * s + 0.25 * v + 0.15 * r);
  let grade: 'A' | 'B' | 'C' | 'D' = 'D';
  if (totalScore >= 80) grade = 'A';
  else if (totalScore >= 65) grade = 'B';
  else if (totalScore >= 45) grade = 'C';

  return {
    score: totalScore,
    financialTransparency: f,
    briefCompleteness: s,
    directClientVerification: v,
    authorReputation: r,
    grade,
  };
}

/**
 * Task Transformation Benchmark taxonomy
 * Categorizes routine tasks undergoing automation vs emerging specialized competencies
 */
export const TASK_TRANSFORMATION_TAXONOMY = {
  routineAutomated: [
    { key: 'copywriting_basic', label: 'Базовый копирайтинг и рерайт текстов', patterns: [/копирайт/i, /рерайт/i, /статьи для сайта/i, /написание текста/i] },
    { key: 'translation_simple', label: 'Типовой перевод технической документации и статей', patterns: [/переводчик/i, /перевод текста/i, /перевести статью/i] },
    { key: 'html_simple', label: 'Шаблонная вёрстка лендингов и типовых блоков', patterns: [/сверстать лендинг/i, /простая верстка/i, /верстка html\/css/i] },
    { key: 'banner_simple', label: 'Типовые баннеры, креативы и карточки', patterns: [/простой баннер/i, /обложки для каналов/i, /шаблонные креативы/i] },
  ],
  emergingSpecialized: [
    { key: 'agent_rag', label: 'Интеграция AI-агентов, RAG & автоматизация пайплайнов (n8n/Make)', patterns: [/ai[- ]?агент/i, /rag\b/i, /n8n/i, /make\.com/i, /автоматизаци[яи] llm/i, /langchain/i, /llamaindex/i] },
    { key: 'lora_comfyui', label: 'Обучение LoRA и генеративные пайплайны ComfyUI', patterns: [/comfyui/i, /lora/i, /stable diffusion/i, /flux\.1/i, /lora training/i] },
    { key: 'vibe_refactoring', label: 'Рефакторинг и доработка кода после AI-генераторов (Cursor/Lovable)', patterns: [/cursor/i, /lovable/i, /v0\.dev/i, /доработать mvp/i, /починить после ai/i, /вайб[- ]?кодинг/i] },
    { key: 'tg_miniapps_ai', label: 'Telegram Mini Apps с генеративными функциями', patterns: [/tma\b/i, /mini[- ]?app/i, /telegram mini app/i] },
  ],
};

/** Categorizes a job/gig text into routine automated or emerging specialized bucket */
export function classifyTaskTransformation(text: string): { type: 'routine' | 'emerging' | 'none'; key?: string; label?: string } {
  for (const item of TASK_TRANSFORMATION_TAXONOMY.emergingSpecialized) {
    if (item.patterns.some((p) => p.test(text))) {
      return { type: 'emerging', key: item.key, label: item.label };
    }
  }
  for (const item of TASK_TRANSFORMATION_TAXONOMY.routineAutomated) {
    if (item.patterns.some((p) => p.test(text))) {
      return { type: 'routine', key: item.key, label: item.label };
    }
  }
  return { type: 'none' };
}

/** Formats text by the 3-step editorial standard: Fact -> Contrast -> Actionable Conclusion */
export function formatEditorialTakeaway(options: {
  fact: string;
  contrast: string;
  conclusion: string;
  sampleN: number;
  periodLabel: string;
}): { html: string; quote: string } {
  const { fact, contrast, conclusion, sampleN, periodLabel } = options;
  const quote = `${fact} ${contrast} ${conclusion} (OpenRadar, ${periodLabel}, n = ${sampleN})`;
  const html = `
<div class="rs-editorial-insight">
  <p class="rs-insight-fact">${fact}</p>
  <p class="rs-insight-contrast"><b>Однако:</b> ${contrast}</p>
  <p class="rs-insight-conclusion"><b>Вывод:</b> ${conclusion}</p>
  <div class="rs-insight-meta">
    <span class="rs-badge">Выборка N = ${new Intl.NumberFormat('ru-RU').format(sampleN).replace(/\u00A0/g, ' ')}</span>
    <button type="button" class="rs-quote" data-quote="${quote.replace(/"/g, '&quot;')}">Скопировать для СМИ / Telegram</button>
  </div>
</div>`;
  return { html, quote };
}
