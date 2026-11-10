import type { Lead } from './types.ts';

export interface IscoOccupation {
  code: string;
  label: string;
  labelRu: string;
}

export const ISCO_OCCUPATIONS: Record<string, IscoOccupation> = {
  '2512': {
    code: '2512',
    label: 'Software developers',
    labelRu: 'Разработчики программного обеспечения',
  },
  '2513': {
    code: '2513',
    label: 'Web and multimedia developers',
    labelRu: 'Разработчики веб- и мультимедийных приложений',
  },
  '2514': {
    code: '2514',
    label: 'Applications programmers',
    labelRu: 'Прикладные программисты (1С, ERP, боты)',
  },
  '2511': {
    code: '2511',
    label: 'Systems analysts',
    labelRu: 'Системные и бизнес-аналитики',
  },
  '2519': {
    code: '2519',
    label: 'Software and applications developers and analysts NEC (QA)',
    labelRu: 'Инженеры по тестированию и QA',
  },
  '2521': {
    code: '2521',
    label: 'Database designers and administrators',
    labelRu: 'Инженеры данных и администраторы БД',
  },
  '2522': {
    code: '2522',
    label: 'Systems administrators',
    labelRu: 'DevOps-инженеры и системные администраторы',
  },
  '2529': {
    code: '2529',
    label: 'Database and network professionals NEC (Security)',
    labelRu: 'Специалисты по информационной безопасности',
  },
  '2120': {
    code: '2120',
    label: 'Mathematicians, actuaries and statisticians (Data Science & AI)',
    labelRu: 'Специалисты по Data Science и машинному обучению',
  },
  '2166': {
    code: '2166',
    label: 'Graphic and multimedia designers',
    labelRu: 'Дизайнеры интерфейсов, графики и мультимедиа',
  },
  '2421': {
    code: '2421',
    label: 'Management and organization analysts (Product & Project)',
    labelRu: 'Продуктовые и проектные менеджеры',
  },
  '2423': {
    code: '2423',
    label: 'Personnel and careers professionals',
    labelRu: 'Специалисты по подбору персонала (HR / IT-рекрутеры)',
  },
  '2431': {
    code: '2431',
    label: 'Advertising and marketing professionals',
    labelRu: 'Специалисты по маркетингу, рекламе и продвижению',
  },
  '2433': {
    code: '2433',
    label: 'Technical and medical sales professionals',
    labelRu: 'Менеджеры по продажам и развитию бизнеса',
  },
  '2641': {
    code: '2641',
    label: 'Authors and related writers',
    labelRu: 'Копирайтеры, редакторы и технические писатели',
  },
  '3343': {
    code: '3343',
    label: 'Administrative and executive secretaries (Support)',
    labelRu: 'Специалисты технической и клиентской поддержки',
  },
};

const DIRECTION_TO_ISCO: Record<string, string> = {
  backend: '2512',
  mobile: '2512',
  gamedev: '2512',
  frontend: '2513',
  fullstack: '2513',
  qa: '2519',
  devops: '2522',
  security: '2529',
  ai: '2120',
  data: '2521',
  analytics: '2511',
  design: '2166',
  product: '2421',
  hr: '2423',
  marketing: '2431',
  sales: '2433',
  content: '2641',
  support: '3343',
};

/**
 * Classifies a lead into a 4-digit ILO ISCO-08 occupation unit group using
 * its derived direction, skills, and title keywords.
 */
export function classifyIsco08(
  lead: Pick<Lead, 'title' | 'text' | 'skills' | 'direction' | 'category'>,
): IscoOccupation | undefined {
  const title = (lead.title ?? '').toLowerCase();
  const skills = new Set((lead.skills ?? []).map((s) => s.toLowerCase()));

  // Specific application programming niches (1C, SAP, Bitrix, Telegram bots, no-code/CMS)
  if (
    skills.has('1с') ||
    skills.has('telegram bot') ||
    /\b(1с|1c|битрикс|bitrix|sap\b|abap|erp\b|telegram[-\s]+bot|телеграм[-\s]+бот)\b/i.test(title)
  ) {
    return ISCO_OCCUPATIONS['2514'];
  }

  // Web & CMS builders (WordPress, Tilda, Webflow, Frontend)
  if (
    skills.has('wordpress') ||
    skills.has('tilda') ||
    skills.has('woocommerce') ||
    skills.has('opencart') ||
    /\b(верстк|лендинг|landing\s+page|tilda|тильд|wordpress|webflow|frontend|фронтэнд|фронтенд)\b/i.test(title)
  ) {
    return ISCO_OCCUPATIONS['2513'];
  }

  if (lead.direction && DIRECTION_TO_ISCO[lead.direction]) {
    return ISCO_OCCUPATIONS[DIRECTION_TO_ISCO[lead.direction]!];
  }

  // Fallback heuristics on title + skills when direction is absent
  if (/\b(data\s+scien|machine\s+learning|ml\s+engineer|ai\s+engineer|llm|nlp|computer\s+vision|нейросет)\b/i.test(title) || skills.has('ml') || skills.has('ai / ml')) {
    return ISCO_OCCUPATIONS['2120'];
  }
  if (/\b(data\s+engineer|dba\b|database\s+admin|etl\b|clickhouse|airflow)\b/i.test(title)) {
    return ISCO_OCCUPATIONS['2521'];
  }
  if (/\b(devops|sre\b|sysadmin|сисадмин|системный\s+администратор|kubernetes|infrastructure\s+engineer)\b/i.test(title) || skills.has('devops') || skills.has('kubernetes')) {
    return ISCO_OCCUPATIONS['2522'];
  }
  if (/\b(infosec|cybersecurity|pentest|soc\s+analyst|appsec|информационн\w+\s+безопасн)\b/i.test(title)) {
    return ISCO_OCCUPATIONS['2529'];
  }
  if (/\b(qa\b|test\s+engineer|sdet|тестировщик|автотест)\b/i.test(title) || skills.has('тестирование')) {
    return ISCO_OCCUPATIONS['2519'];
  }
  if (/\b(system\s+analyst|business\s+analyst|системный\s+аналитик|бизнес[-\s]?аналитик|аналитик\s+данных|bi\s+analyst)\b/i.test(title)) {
    return ISCO_OCCUPATIONS['2511'];
  }
  if (/\b(дизайнер|designer|ui\/ux|ux\/ui|figma|иллюстратор|motion\s+design)\b/i.test(title) || skills.has('figma')) {
    return ISCO_OCCUPATIONS['2166'];
  }
  if (/\b(product\s+manager|project\s+manager|продакт|проджект|руководитель\s+проект|scrum\s+master)\b/i.test(title)) {
    return ISCO_OCCUPATIONS['2421'];
  }
  if (/\b(recruiter|рекрутер|сорсер|sourcer|talent\s+acquisition|hr\s+manager)\b/i.test(title)) {
    return ISCO_OCCUPATIONS['2423'];
  }
  if (/\b(маркетолог|таргетолог|smm\b|seo[-\s]|директолог|performance\s+marketing|media\s+buyer)\b/i.test(title)) {
    return ISCO_OCCUPATIONS['2431'];
  }
  if (/\b(менеджер\s+по\s+продажам|sales\s+manager|account\s+executive|bizdev|business\s+development|моп\b|роп\b)\b/i.test(title)) {
    return ISCO_OCCUPATIONS['2433'];
  }
  if (/\b(копирайтер|copywriter|редактор|technical\s+writer|техписатель|сценарист)\b/i.test(title)) {
    return ISCO_OCCUPATIONS['2641'];
  }
  if (/\b(саппорт|оператор\s+поддержки|customer\s+support|helpdesk|ассистент)\b/i.test(title)) {
    return ISCO_OCCUPATIONS['3343'];
  }
  if (
    /\b(разработчик|программист|developer|software\s+engineer|backend|golang|python|java\b|kotlin|swift|c\+\+|rust\b)\b/i.test(title) ||
    skills.has('python') ||
    skills.has('golang') ||
    skills.has('java') ||
    skills.has('typescript') ||
    skills.has('javascript') ||
    skills.has('разработка')
  ) {
    return ISCO_OCCUPATIONS['2512'];
  }

  return undefined;
}

/**
 * Parses a comma-separated or array input of ISCO-08 occupation codes/prefixes
 * (e.g. "2512,2513" or ["2512", "2166"]).
 */
export function parseOccupationCodes(raw: unknown): string[] {
  if (!raw) return [];
  const parts = Array.isArray(raw) ? raw.map(String) : [String(raw)];
  const codes: string[] = [];
  for (const part of parts) {
    for (const token of part.split(/[\s,;]+/)) {
      const cleaned = token.trim();
      if (/^\d{2,4}$/.test(cleaned)) {
        codes.push(cleaned);
      }
    }
  }
  return Array.from(new Set(codes));
}

/**
 * Checks whether a lead's ISCO-08 occupation code matches any of the requested
 * 2-, 3-, or 4-digit ISCO-08 codes/prefixes.
 */
export function matchesOccupationCodes(
  lead: Pick<Lead, 'title' | 'text' | 'skills' | 'direction' | 'category'>,
  codes: readonly string[],
): boolean {
  if (!codes.length) return true;
  const isco = classifyIsco08(lead);
  if (!isco) return false;
  return codes.some((prefix) => isco.code.startsWith(prefix));
}
