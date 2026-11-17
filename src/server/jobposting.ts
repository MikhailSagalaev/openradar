/**
 * schema.org JobPosting for a lead page.
 *
 * Google requires hiringOrganization from the posting itself, and for a fully remote
 * posting (`jobLocationType: TELECOMMUTE`) it requires applicantLocationRequirements.
 * Both come only from fields the lead actually carries. A missing employer, or a remote
 * posting with no location requirement, is omitted rather than filled with a placeholder.
 */
import type { AccessPolicy } from '../core/access.ts';
import type { Lead, SourceRecord } from '../core/types.ts';
import { EMPLOYER_AUTHOR_KINDS } from '../core/employer-kinds.ts';
import { atsCompaniesFromConfig } from '../core/lead-quality.ts';
import { isIndexable, NODE_INDEX_POLICY, validThrough, w3cDateTime, type TtlEnv } from '../core/indexable.ts';
import { companiesOf } from '../sources/ats.ts';

/** Names that are not an employer. «openradar» is the old page-level fallback. */
const PLACEHOLDER_ORG = /^(?:unknown|n\/?a|none|null|undefined|openradar|confidential|не\s*указан(?:о|а)?|неизвестно|нет(?:\s+данных)?|—|–|-|\.+)$/i;

/** A city field that names no place. */
const PLACEHOLDER_CITY = /^(?:online|онлайн|remote|удал[её]нн?(?:о|ая)?|удаленка|anywhere|worldwide|global|не\s*указан(?:о|а)?|n\/?a|—|–|-)$/i;

export type JobPostingSkipReason = 'not-indexable' | 'no-organization' | 'remote-without-location' | 'no-location';

const EMPLOYMENT_TYPES = new Set([
  'FULL_TIME', 'PART_TIME', 'CONTRACTOR', 'TEMPORARY', 'INTERN', 'VOLUNTEER', 'PER_DIEM', 'OTHER',
]);

const SALARY_UNIT: Record<string, string> = { monthly: 'MONTH', hourly: 'HOUR' };

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

function employmentTypeOf(lead: Lead): string | undefined {
  const facts = lead.metadata?.facts;
  const raw = facts && typeof facts === 'object' ? (facts as { employmentType?: unknown }).employmentType : undefined;
  if (typeof raw !== 'string') return undefined;
  const token = raw.trim().toUpperCase().replace(/[\s-]+/g, '_');
  return EMPLOYMENT_TYPES.has(token) ? token : undefined;
}

/** An ATS author that is only the board slug (`acme`), not `acme=Acme` or a name the board sent. */
function atsSlugAuthor(source: SourceRecord, author: string): boolean {
  return companiesOf(source).some((company) => !company.name && company.slug === author);
}

function authorEmployer(lead: Lead, source: SourceRecord | undefined, sourceKind: string | undefined): string | undefined {
  const author = lead.author?.trim();
  if (!author || author.startsWith('@')) return undefined;
  const kind = source?.kind ?? sourceKind;
  if (!kind || !EMPLOYER_AUTHOR_KINDS.has(kind)) return undefined;
  if (kind === 'ats' && source && atsSlugAuthor(source, author)) return undefined;
  if (kind === 'ats' && !source) return undefined;
  return cleanName(author);
}

function textEmployer(lead: Lead, source: SourceRecord | undefined): string | undefined {
  const found = companyFromText(lead.text);
  if (!found) return undefined;
  if (source?.kind === 'ats' && atsSlugAuthor(source, found)) return undefined;
  return found;
}

/** A stored ATS slug (`company` or page facts) is not an employer. */
function notAtsSlug(source: SourceRecord | undefined, name: string | undefined): string | undefined {
  if (!name) return undefined;
  if (source?.kind === 'ats' && atsSlugAuthor(source, name)) return undefined;
  return name;
}

function organizationOf(lead: Lead, source: SourceRecord | undefined, sourceKind: string | undefined): string | undefined {
  return notAtsSlug(source, cleanName(lead.company))
    || notAtsSlug(source, factsCompany(lead))
    || textEmployer(lead, source)
    || authorEmployer(lead, source, sourceKind);
}

export function explainJobPosting(
  lead: Lead,
  options: { env: TtlEnv; policy?: AccessPolicy; baseUrl?: string; title?: string; now?: number; source?: SourceRecord; sourceKind?: string },
): JobPostingDecision {
  const now = options.now ?? Date.now();
  const sourceKind = options.source?.kind ?? options.sourceKind;
  if (!isIndexable({
    ...lead,
    sourceKind,
    atsCompanies: atsCompaniesFromConfig(sourceKind, options.source?.config),
  }, options.env, options.policy ?? NODE_INDEX_POLICY, now)) return { skip: 'not-indexable' };
  const hiringName = organizationOf(lead, options.source, options.sourceKind);
  if (!hiringName) return { skip: 'no-organization' };

  const city = cityOf(lead);
  const country = countryOf(lead);
  // Fully remote and no office on the card: Google allows TELECOMMUTE only together
  // with applicantLocationRequirements. Without a real requirement the type is dropped,
  // and a JobPosting with neither a place nor a requirement does not pass, so it is omitted.
  const telecommute = Boolean(lead.isRemote) && !city;
  if (telecommute && !country) return { skip: 'remote-without-location' };
  // Google requires jobLocation unless the posting is TELECOMMUTE with a location requirement.
  if (!telecommute && !city && !country) return { skip: 'no-location' };

  const through = validThrough(lead, options.env);
  const postedMs = Date.parse(lead.publishedAt || lead.createdAt);
  const employmentType = employmentTypeOf(lead);
  const posting: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'JobPosting',
    title: options.title || lead.title,
    description: lead.text || lead.title,
    datePosted: Number.isFinite(postedMs) ? w3cDateTime(postedMs) : lead.createdAt,
    hiringOrganization: { '@type': 'Organization', name: hiringName },
  };
  if (employmentType) posting.employmentType = employmentType;
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
  const unit = lead.paymentPeriod ? SALARY_UNIT[lead.paymentPeriod] : undefined;
  // A sum without a period (a fixed gig budget, or pay we could not classify) is not a salary.
  if (typeof lead.budget === 'number' && lead.currency && unit) {
    posting.baseSalary = {
      '@type': 'MonetaryAmount',
      currency: lead.currency,
      value: { '@type': 'QuantitativeValue', value: lead.budget, unitText: unit },
    };
  }
  return { posting };
}

export function buildJobPosting(
  lead: Lead,
  options: { env: TtlEnv; policy?: AccessPolicy; baseUrl?: string; title?: string; now?: number; source?: SourceRecord; sourceKind?: string },
): Record<string, unknown> | undefined {
  return explainJobPosting(lead, options).posting;
}
