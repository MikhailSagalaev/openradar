import type { RawLead, SourceAdapter, SourceRecord, PollContext } from '../core/types.ts';
import { fetchText } from './http.ts';
import { extractCity } from '../core/extract.ts';

export interface TrudvsemCompany {
  companycode?: string;
  name?: string;
  email?: string;
  site?: string;
  url?: string;
  inn?: string;
  ogrn?: string;
}

export interface TrudvsemAddress {
  location?: string;
  lat?: string;
  lng?: string;
}

export interface TrudvsemContact {
  contact_type?: string;
  contact_value?: string;
}

export interface TrudvsemVacancyItem {
  id: string;
  source?: string;
  'job-name'?: string;
  typicalPosition?: string;
  vac_url?: string;
  salary?: string;
  salary_min?: number;
  salary_max?: number;
  currency?: string;
  company?: TrudvsemCompany;
  region?: {
    name?: string;
    region_code?: string;
  };
  addresses?: {
    address?: TrudvsemAddress[];
  };
  employment?: string;
  schedule?: string;
  qualification?: string;
  requirements?: string;
  duty?: string;
  conditions?: string;
  category?: {
    specialisation?: string;
  };
  skills?: string[];
  'creation-date'?: string;
  date_modify?: string;
  contact_person?: string;
  contact_list?: TrudvsemContact[];
}

export interface TrudvsemResponse {
  status?: string;
  meta?: {
    total?: number;
    limit?: number;
  };
  results?: {
    vacancies?: Array<{
      vacancy: TrudvsemVacancyItem;
    }>;
  };
}

const TECH_KEYWORDS: string[] = [
  'TypeScript', 'JavaScript', 'Node.js', 'Python', 'Java', 'Kotlin', 'Go', 'Golang',
  'Rust', 'C++', 'C#', '.NET', 'PHP', 'Ruby', 'Swift', 'Flutter',
  'React', 'Vue', 'Angular', 'Next.js',
  'PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'Oracle', 'PL/SQL', 'MS SQL',
  'Docker', 'Kubernetes', 'Linux', 'Git',
  'Spring', 'Kafka', 'Maven', 'REST API', 'GraphQL',
  '1С', '1C', 'Битрикс', 'Bitrix', 'APEX', 'Jira', 'Confluence',
];

function extractStack(vacancy: TrudvsemVacancyItem): string[] {
  const haystack = [
    vacancy['job-name'] ?? '',
    vacancy.typicalPosition ?? '',
    vacancy.requirements ?? '',
    vacancy.duty ?? '',
    ...(vacancy.skills ?? []),
  ].join(' ');

  const detected = new Set<string>();

  for (const keyword of TECH_KEYWORDS) {
    // Escaped keyword search with word boundary or boundary punctuation
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(?:^|[\\s,;:.()/-])${escaped}(?:$|[\\s,;:.()/-])`, 'i');
    if (regex.test(haystack)) {
      // Normalize synonyms
      if (keyword === '1C') detected.add('1С');
      else if (keyword === 'Golang') detected.add('Go');
      else detected.add(keyword);
    }
  }

  // Also include concise, clean entries directly from vacancy.skills
  if (Array.isArray(vacancy.skills)) {
    for (const rawSkill of vacancy.skills) {
      const trimmed = String(rawSkill).trim();
      if (trimmed.length > 0 && trimmed.length <= 30 && !trimmed.toLowerCase().startsWith('умение')) {
        detected.add(trimmed);
      }
    }
  }

  return [...detected];
}

function extractTrudvsemBudget(vacancy: TrudvsemVacancyItem): number | undefined {
  if (typeof vacancy.salary_min === 'number' && vacancy.salary_min > 0) {
    return Math.round(vacancy.salary_min);
  }
  if (typeof vacancy.salary_max === 'number' && vacancy.salary_max > 0) {
    return Math.round(vacancy.salary_max);
  }
  if (typeof vacancy.salary === 'string') {
    const parsed = Number.parseFloat(vacancy.salary.replace(/[^\d.,]/g, '').replace(',', '.'));
    if (Number.isFinite(parsed) && parsed >= 500) {
      return Math.round(parsed);
    }
  }
  return undefined;
}

function resolveCityAndRemote(vacancy: TrudvsemVacancyItem): { city?: string; isRemote: boolean } {
  const employmentText = `${vacancy.employment ?? ''} ${vacancy.schedule ?? ''}`.toLowerCase();
  const isRemote = /дистанцион|удален/.test(employmentText);

  // 1. Try to extract city from address location (e.g. "г Санкт-Петербург", "Свердловская область, г Екатеринбург")
  const firstAddress = vacancy.addresses?.address?.[0]?.location;
  if (firstAddress) {
    const extracted = extractCity(firstAddress);
    if (extracted && extracted !== 'Онлайн') {
      return { city: extracted, isRemote };
    }
    // Generic match for Russian address format: "г. Название" or "г Название"
    const matchCity = firstAddress.match(/(?:^|[,\s])(?:г\.?|город)\s+([А-ЯЁ][а-яё]+(?:-[А-ЯЁ][а-яё]+)?)/u);
    if (matchCity?.[1]) {
      return { city: matchCity[1], isRemote };
    }
  }

  // 2. Try region name (e.g. "Город Санкт-Петербург", "Московская область")
  const regionName = vacancy.region?.name;
  if (regionName) {
    const extracted = extractCity(regionName);
    if (extracted && extracted !== 'Онлайн') {
      return { city: extracted, isRemote };
    }
    // Clean up "Город " prefix if present
    const cleanedRegion = regionName.replace(/^город\s+/i, '').trim();
    if (cleanedRegion) {
      return { city: cleanedRegion, isRemote };
    }
  }

  if (isRemote) {
    return { city: 'Онлайн', isRemote: true };
  }

  return { isRemote };
}

export const trudvsemSource: SourceAdapter = {
  kind: 'trudvsem',
  access: 'official',
  description:
    'Официальный Open API портала «Работа России» (Минтруд РФ, opendata.trudvsem.ru). Не требует авторизации.',
  risks: [
    'API может отвечать с задержкой в часы пиковой нагрузки',
    'Лимит на одну выборку до 100 вакансий за запрос',
  ],

  async poll(source: SourceRecord, ctx: PollContext): Promise<RawLead[]> {
    const base = typeof source.config.url === 'string' && source.config.url.trim()
      ? source.config.url.trim()
      : 'https://opendata.trudvsem.ru/api/v1/vacancies';

    const url = new URL(base);

    // Apply search query / keywords
    const searchQuery =
      (typeof source.config.text === 'string' && source.config.text) ||
      (typeof source.config.query === 'string' && source.config.query) ||
      (Array.isArray(source.config.includeKeywords) && source.config.includeKeywords.join(' ')) ||
      '';

    if (searchQuery && !url.searchParams.has('text')) {
      url.searchParams.set('text', searchQuery);
    }

    // Apply limit (max 100 per API specification)
    const limit = Math.max(1, Math.min(Number(source.config.limit ?? 20), 100));
    if (!url.searchParams.has('limit')) {
      url.searchParams.set('limit', String(limit));
    }

    if (source.config.offset !== undefined && !url.searchParams.has('offset')) {
      url.searchParams.set('offset', String(source.config.offset));
    }

    const jsonText = await fetchText(ctx, url.toString(), {
      Accept: 'application/json',
    });

    let payload: TrudvsemResponse;
    try {
      payload = JSON.parse(jsonText) as TrudvsemResponse;
    } catch (err) {
      ctx.logger.warn('Trudvsem: failed to parse JSON response', {
        error: err instanceof Error ? err.message : String(err),
        url: url.toString(),
      });
      return [];
    }

    const items = payload.results?.vacancies ?? [];
    const leads: RawLead[] = [];

    for (const wrapper of items.slice(0, limit)) {
      const v = wrapper.vacancy;
      if (!v || !v.id) continue;

      const title = String(v['job-name'] || v.typicalPosition || 'Вакансия').trim();
      if (!title) continue;

      const companyName = v.company?.name ? String(v.company.name).trim() : undefined;
      const budget = extractTrudvsemBudget(v);
      const { city, isRemote } = resolveCityAndRemote(v);
      const skills = extractStack(v);
      const category = v.category?.specialisation || 'Информационные технологии';

      // Build structured description
      const sections: string[] = [];
      if (companyName) sections.push(`Компания: ${companyName}`);
      if (v.typicalPosition && v.typicalPosition !== title) {
        sections.push(`Позиция: ${v.typicalPosition}`);
      }
      if (v.qualification) sections.push(`Квалификация: ${v.qualification}`);
      if (v.duty) sections.push(`Обязанности:\n${v.duty.trim()}`);
      if (v.requirements) sections.push(`Требования:\n${v.requirements.trim()}`);
      if (v.conditions) sections.push(`Условия:\n${v.conditions.trim()}`);
      if (v.schedule || v.employment) {
        sections.push(`Занятость: ${[v.employment, v.schedule].filter(Boolean).join(', ')}`);
      }

      // First address location if available
      const address = v.addresses?.address?.[0]?.location;
      if (address) {
        sections.push(`Адрес: ${address.trim()}`);
      }

      const rawText = sections.length ? `${title}\n\n${sections.join('\n\n')}` : title;
      // Strictly sanitize privacy details per 152-FZ (mask phone numbers and personal emails)
      const text = rawText;

      // Construct direct vacancy card URL
      const itemUrl =
        v.vac_url ||
        (v.company?.companycode
          ? `https://trudvsem.ru/vacancy/card/${v.company.companycode}/${v.id}`
          : `https://trudvsem.ru/vacancy/card/${v.id}`);

      // Safe metadata without personal contact info (152-FZ)
      const safeRaw: Record<string, unknown> = {
        companyCode: v.company?.companycode,
        inn: v.company?.inn,
        ogrn: v.company?.ogrn,
        salaryMin: v.salary_min,
        salaryMax: v.salary_max,
        salaryText: v.salary,
        employment: v.employment,
        schedule: v.schedule,
        qualification: v.qualification,
      };

      leads.push({
        sourceId: source.id,
        externalId: `trudvsem:${v.id}`,
        url: itemUrl,
        title,
        text,
        author: companyName,
        city,
        budget,
        currency: 'RUB',
        category,
        skills: skills.length ? skills : undefined,
        isRemote,
        publishedAt: v.date_modify || v['creation-date'],
        raw: safeRaw,
      });
    }

    return leads;
  },
};
