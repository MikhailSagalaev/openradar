/**
 * Facts read from the source page of a lead. Boards put the full vacancy on the page as
 * schema.org JobPosting (hh.ru, Хабр Карьера, Jobicy and most career sites), while their
 * feeds carry only a summary. The closed-post check already loads these pages, so the
 * facts come at no extra request.
 */
import { decodeHtmlEntities, stripHtml } from '../core/text.ts';

export interface PageSalary {
  min?: number;
  max?: number;
  currency: string;
  period: 'month' | 'year' | 'hour' | 'project';
}

export interface PageFacts {
  salary?: PageSalary;
  company?: string;
  /** Seniority as the board states it: «Middle», «Senior». */
  grade?: string;
  /** The board's own specialization: «Бэкенд разработчик». */
  specialization?: string;
  skills?: string[];
  employmentType?: string;
  experience?: string;
  remote?: boolean;
}

const UNIT_PERIOD: Record<string, PageSalary['period']> = {
  HOUR: 'hour',
  DAY: 'month',
  WEEK: 'month',
  MONTH: 'month',
  YEAR: 'year',
};

function asNumber(value: unknown): number | undefined {
  const n = typeof value === 'string' ? Number.parseFloat(value.replace(/[\s,]/g, '')) : typeof value === 'number' ? value : NaN;
  return Number.isFinite(n) && n > 0 ? Math.round(n) : undefined;
}

export function asText(value: unknown, max = 160): string | undefined {
  if (typeof value === 'string') {
    const text = stripHtml(decodeHtmlEntities(value)).replace(/\s+/g, ' ').trim();
    return text ? text.slice(0, max) : undefined;
  }
  if (Array.isArray(value)) return asText(value.filter((v) => typeof v === 'string').join(', '), max);
  return undefined;
}

/** Every JSON-LD object on the page, @graph members included. */
export function jsonLdObjects(html: string): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) node.forEach(visit);
    else if (node && typeof node === 'object') {
      out.push(node as Record<string, unknown>);
      const graph = (node as Record<string, unknown>)['@graph'];
      if (graph) visit(graph);
    }
  };
  for (const match of html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      visit(JSON.parse(match[1]!.trim()));
    } catch {
      // Broken markup on the board's side: skip the block.
    }
  }
  return out;
}

export function isType(node: Record<string, unknown>, type: string): boolean {
  const t = node['@type'];
  return t === type || (Array.isArray(t) && t.includes(type));
}

export function salaryOf(posting: Record<string, unknown>): PageSalary | undefined {
  const base = (posting.baseSalary ?? posting.estimatedSalary) as Record<string, unknown> | undefined;
  if (!base || typeof base !== 'object') return undefined;
  const value = (base.value ?? {}) as Record<string, unknown>;
  const flat = asNumber(base.value);
  const min = asNumber(value.minValue) ?? asNumber(value.value) ?? flat;
  const max = asNumber(value.maxValue) ?? (asNumber(value.minValue) === undefined ? asNumber(value.value) ?? flat : undefined);
  if (min === undefined && max === undefined) return undefined;
  const currency = String(base.currency ?? value.currency ?? 'RUB').toUpperCase().replace('RUR', 'RUB');
  const unit = String(value.unitText ?? base.unitText ?? 'MONTH').toUpperCase();
  return { min, max, currency, period: UNIT_PERIOD[unit] ?? 'month' };
}

export function companyOf(posting: Record<string, unknown>): string | undefined {
  const org = posting.hiringOrganization;
  if (typeof org === 'string') return asText(org, 120);
  if (org && typeof org === 'object') return asText((org as Record<string, unknown>).name, 120);
  return undefined;
}

export function extractPageFacts(html: string): PageFacts {
  const facts: PageFacts = {};
  const posting = jsonLdObjects(html).find((node) => isType(node, 'JobPosting'));
  if (posting) {
    facts.salary = salaryOf(posting);
    facts.company = companyOf(posting);
    facts.employmentType = asText(posting.employmentType, 60);
    const experience = posting.experienceRequirements;
    facts.experience =
      typeof experience === 'object' && experience !== null
        ? asText((experience as Record<string, unknown>).description ?? (experience as Record<string, unknown>).monthsOfExperience?.toString(), 80)
        : asText(experience, 80);
    if (posting.jobLocationType === 'TELECOMMUTE') facts.remote = true;
    const skills = asText(posting.skills, 400);
    if (skills) facts.skills = skills.split(/\s*[,;]\s*/).filter(Boolean).slice(0, 20);

    // Хабр Карьера writes them at the head of the description:
    // «Навыки: Java, Spring. Квалификация: Middle. Специализации: Бэкенд разработчик.»
    const description = asText(posting.description, 2000) ?? '';
    const grade = description.match(/Квалификация:\s*([A-Za-zА-Яа-яё+ ]{3,20}?)\s*(?:\.|$)/u)?.[1];
    if (grade) facts.grade = grade.trim();
    const spec = description.match(/Специализаци[яи]:\s*([^.]{3,80})\./u)?.[1];
    if (spec) facts.specialization = spec.trim();
    if (!facts.skills) {
      const listed = description.match(/Навыки:\s*([^.]{3,300})\./u)?.[1];
      if (listed) facts.skills = listed.split(/\s*,\s*/).filter(Boolean).slice(0, 20);
    }
  }
  for (const key of Object.keys(facts) as Array<keyof PageFacts>) {
    if (facts[key] === undefined) delete facts[key];
  }
  return facts;
}

export function hasFacts(facts: PageFacts): boolean {
  return Object.keys(facts).length > 0;
}
