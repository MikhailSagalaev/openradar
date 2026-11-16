/**
 * schema.org JobPosting for a lead page.
 *
 * Google requires hiringOrganization from the posting itself, and for a fully remote
 * posting (`jobLocationType: TELECOMMUTE`) it requires applicantLocationRequirements.
 * Both come only from fields the lead actually carries. A missing employer, or a remote
 * posting with no location requirement, is omitted rather than filled with a placeholder.
 */
import type { Lead } from '../core/types.ts';
import { isIndexable, validThrough, w3cDateTime, type TtlEnv } from '../core/indexable.ts';

/** Names that are not an employer. «openradar» is the old page-level fallback. */
const PLACEHOLDER_ORG = /^(?:unknown|n\/?a|none|null|undefined|openradar|confidential|не\s*указан(?:о|а)?|неизвестно|нет(?:\s+данных)?|—|–|-|\.+)$/i;

/** A city field that names no place. */
const PLACEHOLDER_CITY = /^(?:online|онлайн|remote|удал[её]нн?(?:о|ая)?|удаленка|anywhere|worldwide|global|не\s*указан(?:о|а)?|n\/?a|—|–|-)$/i;

export type JobPostingSkipReason = 'not-indexable' | 'no-organization' | 'remote-without-location';

export interface JobPostingDecision {
  posting?: Record<string, unknown>;
  skip?: JobPostingSkipReason;
}

function cleanName(value: unknown, max = 120): string | undefined {
  if (typeof value !== 'string') return undefined;
  const text = value.replace(/\s+/g, ' ').trim();
  if (!text || text.length < 2 || text.length > max) return undefined;
  if (PLACEHOLDER_ORG.test(text)) return undefined;
  return text;
}

/** Employer written on the post itself («Компания: …»). */
function companyFromText(text: string | undefined): string | undefined {
  const match = (text || '').match(/(?:Компания|Работодатель|Company)\s*:\s*([^·\n\r|]{1,60}?)(?=\s*(?:Формат|Локация|ЗП|З\/П|График|Занятость|Вилка|Опыт|Стек|Требования|Обязанности|Условия|О нас|Всем привет|Мы\b|Контакты|$|[·\n\r|]))/iu);
  if (!match?.[1]) return undefined;
  const raw = match[1].trim().replace(/^[\s«"„“]+|[\s»"”\.…,;]+$/g, '').slice(0, 45).trim();
  if (raw.length < 2 || raw.length > 45) return undefined;
  return cleanName(raw, 45);
}

function factsCompany(lead: Lead): string | undefined {
  const facts = lead.metadata?.facts;
  if (!facts || typeof facts !== 'object') return undefined;
  return cleanName((facts as { company?: unknown }).company);
}

function countryField(value: unknown): string | undefined {
  return cleanName(value, 64);
}

/** Country the lead actually records. A city is not turned into a country. */
export function countryOf(lead: Lead): string | undefined {
  const meta = lead.metadata ?? {};
  const raw = (lead.raw ?? {}) as Record<string, unknown>;
  const location = meta.location;
  const fromLocation = location && typeof location === 'object'
    ? [(location as { country?: unknown }).country, (location as { country_code?: unknown }).country_code]
    : [];
  const candidates = [
    meta.country,
    meta.countryCode,
    meta.country_code,
    meta.addressCountry,
    ...fromLocation,
    raw.country,
    raw.country_code,
    raw.addressCountry,
  ];
  for (const candidate of candidates) {
    const country = countryField(candidate);
    if (country) return country;
  }
  const labeled = lead.text?.match(/(?:^|\n)\s*(?:Страна|Country)\s*:\s*([^\n·|]{2,60})/i)?.[1];
  if (!labeled) return undefined;
  return cleanName(labeled.replace(/[.,;]+$/g, '').trim(), 64);
}

function cityOf(lead: Lead): string | undefined {
  const city = lead.city?.replace(/\s+/g, ' ').trim();
  if (!city || PLACEHOLDER_CITY.test(city)) return undefined;
  return city.slice(0, 80);
}

function organizationOf(lead: Lead): string | undefined {
  const author = lead.author?.trim();
  const authorOrg = author && !author.startsWith('@') ? cleanName(author) : undefined;
  return cleanName(lead.company) || factsCompany(lead) || companyFromText(lead.text) || authorOrg;
}

export function explainJobPosting(
  lead: Lead,
  options: { env: TtlEnv; baseUrl?: string; title?: string; now?: number },
): JobPostingDecision {
  if (!isIndexable(lead, options.env, options.now)) return { skip: 'not-indexable' };
  const hiringName = organizationOf(lead);
  if (!hiringName) return { skip: 'no-organization' };

  const city = cityOf(lead);
  const country = countryOf(lead);
  // Fully remote and no office on the card: Google allows TELECOMMUTE only together
  // with applicantLocationRequirements. Without a real requirement the type is dropped,
  // and a JobPosting with neither a place nor a requirement does not pass, so it is omitted.
  const telecommute = Boolean(lead.isRemote) && !city;
  if (telecommute && !country) return { skip: 'remote-without-location' };

  const through = validThrough(lead, options.env);
  const postedMs = Date.parse(lead.publishedAt || lead.createdAt);
  const posting: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'JobPosting',
    title: options.title || lead.title,
    description: lead.text || lead.title,
    datePosted: Number.isFinite(postedMs) ? w3cDateTime(postedMs) : lead.createdAt,
    employmentType: lead.type === 'gig' ? 'CONTRACTOR' : 'FULL_TIME',
    hiringOrganization: { '@type': 'Organization', name: hiringName },
  };
  if (options.baseUrl) posting.url = `${options.baseUrl}/leads/${lead.id}`;
  if (through) posting.validThrough = through;
  if (telecommute && country) {
    posting.jobLocationType = 'TELECOMMUTE';
    posting.applicantLocationRequirements = { '@type': 'Country', name: country };
  } else if (city || country) {
    posting.jobLocation = {
      '@type': 'Place',
      address: {
        '@type': 'PostalAddress',
        ...(city ? { addressLocality: city } : {}),
        ...(country ? { addressCountry: country } : {}),
      },
    };
  }
  if (typeof lead.budget === 'number') {
    posting.baseSalary = {
      '@type': 'MonetaryAmount',
      currency: lead.currency || 'RUB',
      value: { '@type': 'QuantitativeValue', value: lead.budget, unitText: lead.type === 'gig' ? 'PROJECT' : 'MONTH' },
    };
  }
  return { posting };
}

export function buildJobPosting(
  lead: Lead,
  options: { env: TtlEnv; baseUrl?: string; title?: string; now?: number },
): Record<string, unknown> | undefined {
  return explainJobPosting(lead, options).posting;
}
