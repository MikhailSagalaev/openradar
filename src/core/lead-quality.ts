/**
 * Whether a lead is substantial enough to be indexed.
 *
 * The score is how many of the real checks pass. `isIndexable` compares it with
 * the runtime threshold and does not replace the guest, closed, or expiry rules.
 * Nothing here calls a model or the network.
 *
 * Employer follows the same rule as JobPosting's organization: a company name,
 * or the author only for source kinds that put the employer there. A Telegram
 * channel title, a bare contact, and an ATS board slug do not count.
 */
import { EMPLOYER_AUTHOR_KINDS } from './employer-kinds.ts';
import type { SourceConfig } from './types.ts';

/** How many checks `leadQuality` scores. */
export const QUALITY_POINTS = 4;

/**
 * At least three of employer, budget, skills, and location-or-format.
 * Two signals still leave a thin page; requiring all four drops most real posts.
 * `0` turns the gate off.
 */
export const DEFAULT_INDEXABLE_MIN_QUALITY = 3;

const PLACEHOLDER_NAME =
  /^(?:unknown|n\/?a|none|null|undefined|openradar|confidential|не\s*указан(?:о|а)?|неизвестно|нет(?:\s+данных)?|—|–|-|\.+)$/i;

const PLACEHOLDER_CITY =
  /^(?:online|онлайн|remote|удал[её]нн?(?:о|ая)?|удаленка|anywhere|worldwide|global|не\s*указан(?:о|а)?|n\/?a|—|–|-)$/i;

export interface LeadQualityInput {
  company?: string;
  author?: string;
  budget?: number;
  skills?: string[];
  city?: string;
  isRemote?: boolean;
  workplaceType?: string;
  text?: string;
  metadata?: Record<string, unknown>;
  /** Source kind, when the caller knows it. Author is an employer only for the allowlist. */
  sourceKind?: string;
  /** ATS `config.companies` entries (`slug` or `slug=Name`). A bare slug is not an employer. */
  atsCompanies?: string[];
}

export interface LeadQualityChecks {
  /** Company, or author on a source kind that stores the employer there. */
  employer: boolean;
  /** A numeric budget greater than zero. */
  budget: boolean;
  /** At least one skill. */
  skills: boolean;
  /** A real city, or an explicit remote/hybrid format. */
  place: boolean;
}

export interface LeadQuality {
  /** Passed checks, 0–4. */
  score: number;
  checks: LeadQualityChecks;
}

function cleanName(value: unknown, max = 120): string | undefined {
  if (typeof value !== 'string') return undefined;
  const text = value.replace(/\s+/g, ' ').trim();
  if (text.length < 2 || text.length > max || PLACEHOLDER_NAME.test(text)) return undefined;
  return text;
}

function atsBoards(entries: string[] | undefined): Array<{ slug: string; name?: string }> {
  if (!entries) return [];
  return entries.filter((entry) => typeof entry === 'string' && entry.trim()).map((entry) => {
    const [slug, name] = entry.split('=', 2) as [string, string | undefined];
    return { slug: slug.toLowerCase(), name: name?.trim() || undefined };
  });
}

/** True when `name` is only the ATS board slug (`acme`), not `acme=Acme`. */
function isAtsSlug(name: string, entries: string[] | undefined): boolean {
  return atsBoards(entries).some((company) => !company.name && company.slug === name.toLowerCase());
}

/**
 * Employer for the index threshold: the stored `company`, or `author` on an allowlisted
 * source. A «Компания:» line and `metadata.facts.company` are not stored columns, and a
 * guest never sees facts, so they stay out of this check. JobPosting still reads them
 * when it builds the organization name.
 */
export function employerLabel(lead: LeadQualityInput): string | undefined {
  const company = cleanName(lead.company);
  if (company && !(lead.sourceKind === 'ats' && isAtsSlug(company, lead.atsCompanies))) return company;
  return authorEmployer(lead);
}

function authorEmployer(lead: LeadQualityInput): string | undefined {
  const author = lead.author?.trim();
  if (!author || author.startsWith('@')) return undefined;
  if (!lead.sourceKind || !EMPLOYER_AUTHOR_KINDS.has(lead.sourceKind)) return undefined;
  if (lead.sourceKind === 'ats' && (!lead.atsCompanies || lead.atsCompanies.length === 0 || isAtsSlug(author, lead.atsCompanies))) {
    return undefined;
  }
  return cleanName(author);
}

export function hasEmployer(lead: LeadQualityInput): boolean {
  return Boolean(employerLabel(lead));
}

function hasPlace(lead: LeadQualityInput): boolean {
  const city = lead.city?.replace(/\s+/g, ' ').trim();
  if (city && !PLACEHOLDER_CITY.test(city)) return true;
  if (lead.isRemote === true) return true;
  return lead.workplaceType === 'remote' || lead.workplaceType === 'hybrid';
}

export function leadQuality(lead: LeadQualityInput): LeadQuality {
  const checks: LeadQualityChecks = {
    employer: hasEmployer(lead),
    budget: typeof lead.budget === 'number' && Number.isFinite(lead.budget) && lead.budget > 0,
    skills: Array.isArray(lead.skills) && lead.skills.some((skill) => skill.trim().length > 0),
    place: hasPlace(lead),
  };
  const score = Number(checks.employer) + Number(checks.budget) + Number(checks.skills) + Number(checks.place);
  return { score, checks };
}

/** ATS company list from a source config, for the slug check. Other config keys are ignored. */
export function atsCompaniesFromConfig(kind: string | undefined, config: SourceConfig | undefined): string[] | undefined {
  if (kind !== 'ats' || !Array.isArray(config?.companies)) return undefined;
  return config.companies.filter((entry): entry is string => typeof entry === 'string');
}

/** A deadline the post already states. No date is invented when it does not. */
export function statedDeadline(lead: { text?: string; metadata?: Record<string, unknown> }): string | undefined {
  const meta = lead.metadata ?? {};
  for (const key of ['deadline', 'duration', 'term'] as const) {
    const value = meta[key];
    if (typeof value !== 'string') continue;
    const text = value.replace(/\s+/g, ' ').trim();
    if (text.length >= 2 && text.length <= 80) return text;
  }
  const match = (lead.text ?? '').match(
    /(?:срок(?:и)?(?:\s+выполнения)?|deadline|duration)\s*[:—–-]\s*([^\n·|]{2,80})/iu,
  );
  if (!match?.[1]) return undefined;
  const text = match[1].trim().replace(/[.,;]+$/g, '').trim();
  if (text.length < 2 || text.length > 80) return undefined;
  return text;
}
