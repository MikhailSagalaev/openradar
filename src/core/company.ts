/**
 * The employer of a vacancy as a comparable key. Aggregators and company ATS pages carry the
 * same vacancy under different addresses and texts; the title alone does not join them
 * («IT Support Engineer» is open at dozens of companies), the title and the employer do.
 */

/** Hosts whose address names the company: the first path segment or the subdomain. */
const COMPANY_IN_URL: Array<[RegExp, number]> = [
  [/^https?:\/\/(?:www\.)?himalayas\.app\/companies\/([^/?#]+)/i, 1],
  [/^https?:\/\/(?:job-boards(?:\.eu)?|boards(?:\.eu)?)\.greenhouse\.io\/([^/?#]+)/i, 1],
  [/^https?:\/\/jobs\.ashbyhq\.com\/([^/?#]+)/i, 1],
  [/^https?:\/\/jobs\.(?:eu\.)?lever\.co\/([^/?#]+)/i, 1],
  [/^https?:\/\/apply\.workable\.com\/([^/?#]+)/i, 1],
  [/^https?:\/\/jobs\.smartrecruiters\.com\/([^/?#]+)/i, 1],
  [/^https?:\/\/([^./]+)\.recruitee\.com\//i, 1],
  [/^https?:\/\/([^./]+)\.jobs\.personio\.(?:de|com)\//i, 1],
  [/^https?:\/\/([^./]+)\.teamtailor\.com\//i, 1],
];

// \b is ASCII-only even with the u flag, so the boundaries are written out for Cyrillic.
const LEGAL_FORMS = /(?<![\p{L}\p{N}])(?:inc|llc|ltd|limited|gmbh|ag|sa|sas|bv|plc|corp|corporation|co|ооо|оао|зао|пао|ао|ип)(?![\p{L}\p{N}])\.?/giu;

export function normalizeCompany(name: string): string | undefined {
  const key = name
    .toLowerCase()
    .replace(/&/g, ' ')
    .replace(LEGAL_FORMS, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, '');
  return key.length >= 2 ? key : undefined;
}

/** Names of channels, boards and placeholders: where a post appeared, not who hires. */
const OUTLET_NAME = /(?:^|[^\p{L}])(?:ваканси[а-я]*|работа\s+(?:в|для)|job\s+for|jobs?(?![\p{L}])|hiring|careerspace|хабр\s+карьер|компания\s+скрыта|it\s+job\s+hub|remote\s+jobs?|hn:|stagirovky|стажировк[а-я]*)/iu;

/** True when a name in the author field is an outlet or a placeholder, not an employer. */
export function isOutletName(name: string, channelTitle?: string): boolean {
  if (/^(?:@|https?:)/i.test(name) || OUTLET_NAME.test(name)) return true;
  return Boolean(channelTitle) && normalizeCompany(name) === normalizeCompany(channelTitle!);
}

/** Feeds that name the employer only in the text: hh.ru, Habr Career, company boards. */
const COMPANY_IN_TEXT = [
  /Вакансия компании:\s*([^\n]{2,80})/u,
  /Компания «([^»]{2,80})»/u,
  /^(?:Компания|Company):\s*([^\n]{2,80})/mu,
];

/** Sources whose author is a person or a participant, not the employer. */
const AUTHOR_IS_A_PERSON = new Set(['telegram', 'webhook', 'imap']);

/**
 * The employer of a vacancy, to show and to group by. Only vacancies: the customer of an
 * order is a private person, and openradar keeps no client names.
 */
export function employerOf(
  lead: { type?: string; author?: string | null; text?: string | null },
  sourceKind?: string,
): { key: string; name: string } | undefined {
  if (lead.type !== 'job') return undefined;
  const fromText = (): string | undefined => {
    for (const re of COMPANY_IN_TEXT) {
      const name = lead.text ? re.exec(lead.text)?.[1] : undefined;
      if (name) return name;
    }
    return undefined;
  };
  const author = lead.author?.trim();
  const named = author && !AUTHOR_IS_A_PERSON.has(sourceKind ?? '') ? author : fromText();
  const name = named?.trim().slice(0, 80);
  if (!name || isOutletName(name)) return undefined;
  const key = normalizeCompany(name);
  return key ? { key, name } : undefined;
}

/** The company key of a lead: from its address on boards that name the company, else its author or text. */
export function companyKeyOf(lead: { url?: string; author?: string; text?: string }): string | undefined {
  if (lead.url) {
    for (const [re, group] of COMPANY_IN_URL) {
      const slug = re.exec(lead.url)?.[group];
      if (slug) return normalizeCompany(decodeURIComponent(slug).replace(/[-_]+/g, ' '));
    }
  }
  // Telegram and free-text boards put a person or a channel here, not an employer.
  if (lead.author && !/^@|^https?:/i.test(lead.author)) return normalizeCompany(lead.author);
  for (const re of COMPANY_IN_TEXT) {
    const name = lead.text ? re.exec(lead.text)?.[1] : undefined;
    if (name) return normalizeCompany(name);
  }
  return undefined;
}
