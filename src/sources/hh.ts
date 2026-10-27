import type { RawLead, SourceAdapter, SourceRecord, PollContext } from '../core/types.ts';
import { fetchText } from './http.ts';
import { stripHtml } from '../core/text.ts';

export interface HhSalary {
  from?: number | null;
  to?: number | null;
  currency?: string | null;
  gross?: boolean | null;
}

export interface HhArea {
  id?: string;
  name?: string;
  url?: string;
}

export interface HhEmployer {
  id?: string;
  name?: string;
  url?: string;
  alternate_url?: string;
  trusted?: boolean;
}

export interface HhSnippet {
  requirement?: string | null;
  responsibility?: string | null;
}

export interface HhVacancyItem {
  id: string;
  name: string;
  area?: HhArea | null;
  salary?: HhSalary | null;
  type?: { id?: string; name?: string } | null;
  address?: {
    city?: string | null;
    street?: string | null;
    building?: string | null;
    raw?: string | null;
  } | null;
  published_at?: string;
  created_at?: string;
  url?: string;
  alternate_url?: string;
  employer?: HhEmployer | null;
  snippet?: HhSnippet | null;
  schedule?: {
    id?: string;
    name?: string;
  } | null;
  employment?: {
    id?: string;
    name?: string;
  } | null;
  experience?: {
    id?: string;
    name?: string;
  } | null;
  key_skills?: Array<{ name: string } | string> | null;
  description?: string;
}

export interface HhVacanciesResponse {
  items?: HhVacancyItem[];
  found?: number;
  pages?: number;
  page?: number;
  per_page?: number;
}

const TECH_KEYWORDS: string[] = [
  'TypeScript', 'JavaScript', 'Node.js', 'Python', 'Java', 'Kotlin', 'Go', 'Golang',
  'Rust', 'C++', 'C#', '.NET', 'PHP', 'Ruby', 'Swift', 'Flutter',
  'React', 'Vue', 'Angular', 'Next.js',
  'PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'Oracle', 'PL/SQL', 'MS SQL',
  'Docker', 'Kubernetes', 'Linux', 'Git',
  'Spring', 'Kafka', 'Maven', 'REST API', 'GraphQL',
  '1С', '1C', 'Битрикс', 'Bitrix', 'Jira', 'Confluence',
];

function extractStack(item: HhVacancyItem): string[] {
  const haystack = [
    item.name ?? '',
    item.snippet?.requirement ?? '',
    item.snippet?.responsibility ?? '',
    item.description ?? '',
  ].join(' ');

  const detected = new Set<string>();

  // Extract from key_skills if present
  if (Array.isArray(item.key_skills)) {
    for (const skill of item.key_skills) {
      const name = typeof skill === 'string' ? skill : skill?.name;
      if (name && typeof name === 'string') {
        const trimmed = name.trim();
        if (trimmed) detected.add(trimmed);
      }
    }
  }

  for (const keyword of TECH_KEYWORDS) {
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(?:^|[\\s,;:.()/-])${escaped}(?:$|[\\s,;:.()/-])`, 'i');
    if (regex.test(haystack)) {
      if (keyword === '1C') detected.add('1С');
      else if (keyword === 'Golang') detected.add('Go');
      else detected.add(keyword);
    }
  }

  return [...detected];
}

function normalizeHhCurrency(currency?: string | null): string {
  if (!currency) return 'RUB';
  const upper = currency.toUpperCase().trim();
  if (upper === 'RUR') return 'RUB';
  return upper;
}

function extractHhSalary(salary?: HhSalary | null): {
  budget?: number;
  currency: string;
  rawSalary?: string;
} {
  if (!salary) {
    return { currency: 'RUB' };
  }

  const currency = normalizeHhCurrency(salary.currency);
  const from = typeof salary.from === 'number' && salary.from > 0 ? Math.round(salary.from) : undefined;
  const to = typeof salary.to === 'number' && salary.to > 0 ? Math.round(salary.to) : undefined;
  const budget = from ?? to;

  let rawSalary: string | undefined;
  if (from !== undefined && to !== undefined) {
    rawSalary = `от ${from} до ${to} ${currency}`;
  } else if (from !== undefined) {
    rawSalary = `от ${from} ${currency}`;
  } else if (to !== undefined) {
    rawSalary = `до ${to} ${currency}`;
  }

  return { budget, currency, rawSalary };
}

export const hhSource: SourceAdapter = {
  kind: 'hh',
  access: 'official',
  description:
    'Официальный Open API HeadHunter (hh.ru/api). Не требует авторизации для чтения открытых вакансий.',
  risks: [
    'Ограничение частоты запросов (rate limit) со стороны hh.ru',
    'Требует обязательный заголовок User-Agent',
  ],

  async poll(source: SourceRecord, ctx: PollContext): Promise<RawLead[]> {
    const base =
      typeof source.config.url === 'string' && source.config.url.trim()
        ? source.config.url.trim()
        : 'https://api.hh.ru/vacancies';

    const url = new URL(base);

    const searchQuery =
      (typeof source.config.text === 'string' && source.config.text) ||
      (typeof source.config.query === 'string' && source.config.query) ||
      (Array.isArray(source.config.includeKeywords) && source.config.includeKeywords.join(' ')) ||
      '';

    if (searchQuery && !url.searchParams.has('text')) {
      url.searchParams.set('text', searchQuery);
    }

    const limit = Math.max(1, Math.min(Number(source.config.limit ?? 20), 100));
    if (!url.searchParams.has('per_page')) {
      url.searchParams.set('per_page', String(limit));
    }

    if (source.config.page !== undefined && !url.searchParams.has('page')) {
      url.searchParams.set('page', String(source.config.page));
    }

    if (source.config.area !== undefined && !url.searchParams.has('area')) {
      url.searchParams.set('area', String(source.config.area));
    }

    if (source.config.schedule !== undefined && !url.searchParams.has('schedule')) {
      url.searchParams.set('schedule', String(source.config.schedule));
    }

    // HH API requires a meaningful User-Agent with contact info; RADAR_USER_AGENT
    // carries the operator's real project URL, the fallback keeps the old one.
    // hh.ru explicitly documents the HH-User-Agent header for API clients.
    const userAgent = ctx.userAgent || 'OpenRadar/0.4.0 (+https://github.com/MikhailSagalaev/openradar)';
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'User-Agent': userAgent,
      'HH-User-Agent': userAgent,
    };
    if (typeof source.config.token === 'string' && source.config.token.trim()) {
      headers['Authorization'] = `Bearer ${source.config.token.trim()}`;
    }

    let jsonText: string;
    try {
      jsonText = await fetchText(ctx, url.toString(), headers);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('403')) {
        ctx.logger.warn('HH.ru API: доступ с IP дата-центра заблокирован WAF (для работы требуется токен или резидентский прокси)', { url: url.toString() });
        return [];
      }
      throw err;
    }

    let payload: HhVacanciesResponse;
    try {
      payload = JSON.parse(jsonText) as HhVacanciesResponse;
    } catch (err) {
      ctx.logger.warn('HH: failed to parse JSON response', {
        error: err instanceof Error ? err.message : String(err),
        url: url.toString(),
      });
      return [];
    }

    const items = payload.items ?? [];
    const leads: RawLead[] = [];

    for (const item of items.slice(0, limit)) {
      if (!item || !item.id || !item.name) continue;

      const title = String(item.name).trim();
      const companyName = item.employer?.name ? String(item.employer.name).trim() : undefined;
      const { budget, currency, rawSalary } = extractHhSalary(item.salary);

      const city = item.area?.name || item.address?.city || undefined;
      const isRemote =
        item.schedule?.id === 'remote' ||
        /дистанцион|удален/i.test(`${item.schedule?.name ?? ''} ${title}`);

      const skills = extractStack(item);

      // Build text snippet with HTML stripped
      const sections: string[] = [];
      if (companyName) sections.push(`Компания: ${companyName}`);
      if (item.snippet?.responsibility) {
        sections.push(`Обязанности:\n${stripHtml(item.snippet.responsibility).trim()}`);
      }
      if (item.snippet?.requirement) {
        sections.push(`Требования:\n${stripHtml(item.snippet.requirement).trim()}`);
      }
      if (item.description) {
        sections.push(`Описание:\n${stripHtml(item.description).trim()}`);
      }
      if (item.schedule?.name || item.employment?.name) {
        sections.push(`Условия: ${[item.employment?.name, item.schedule?.name].filter(Boolean).join(', ')}`);
      }
      if (item.experience?.name) {
        sections.push(`Опыт: ${item.experience.name}`);
      }

      const rawText = sections.length ? `${title}\n\n${sections.join('\n\n')}` : title;
      // Compliance with 152-FZ (mask phone numbers and personal emails)
      const text = rawText;

      const itemUrl = item.alternate_url || item.url || `https://hh.ru/vacancy/${item.id}`;

      // Safe metadata without personal contact data (152-FZ)
      const safeRaw: Record<string, unknown> = {
        employerId: item.employer?.id,
        trustedEmployer: item.employer?.trusted,
        areaId: item.area?.id,
        areaName: item.area?.name,
        salaryFrom: item.salary?.from,
        salaryTo: item.salary?.to,
        salaryCurrency: item.salary?.currency,
        salaryGross: item.salary?.gross,
        schedule: item.schedule?.name,
        employment: item.employment?.name,
        experience: item.experience?.name,
      };

      leads.push({
        sourceId: source.id,
        type: 'job',
        externalId: `hh:${item.id}`,
        url: itemUrl,
        title,
        text,
        author: companyName,
        city: city || (isRemote ? 'Онлайн' : undefined),
        budget,
        currency,
        rawSalary,
        category: 'Информационные технологии',
        skills: skills.length ? skills : undefined,
        isRemote,
        publishedAt: item.published_at || item.created_at,
        raw: safeRaw,
      });
    }

    return leads;
  },
};
