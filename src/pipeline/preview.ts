import { assertSafeUrl } from '../core/ssrf.ts';
import { cleanTitle, extractCity } from '../core/extract.ts';
import { normalizeSalary, type SalaryInfo } from '../core/salary.ts';
import { decodeHtmlEntities, stripHtml } from '../core/text.ts';

export interface FetchSafeOptions {
  timeoutMs?: number;
  userAgent?: string;
  fetchImpl?: typeof fetch;
  extraHeaders?: Record<string, string>;
}

export interface UrlPreview {
  url: string;
  title: string;
  text: string;
  type: 'job' | 'gig';
  company?: string;
  city?: string;
  budget?: number;
  currency?: string;
  rawSalary?: string;
  normalizedUsdMin?: number;
  normalizedUsdMax?: number;
  isRemote?: boolean;
  skills?: string[];
}

const DEFAULT_USER_AGENT = 'OpenRadar/1.0 (https://github.com/MikhailSagalaev/openradar)';

export async function fetchSafeHttp(
  initialUrl: string,
  options?: FetchSafeOptions,
): Promise<string> {
  const fetchImpl = options?.fetchImpl ?? fetch;
  const timeoutMs = options?.timeoutMs ?? 8000;
  const userAgent = options?.userAgent ?? DEFAULT_USER_AGENT;

  let currentUrl = initialUrl;
  let redirects = 0;
  const maxRedirects = 5;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    while (redirects <= maxRedirects) {
      await assertSafeUrl(currentUrl);

      const response = await fetchImpl(currentUrl, {
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          'User-Agent': userAgent,
          Accept: options?.extraHeaders?.Accept ?? 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'ru-RU,ru;q=0.9,en;q=0.8',
          ...options?.extraHeaders,
        },
      });

      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location');
        if (!location) {
          throw new Error(`HTTP ${response.status} redirect without Location header from ${currentUrl}`);
        }
        redirects++;
        if (redirects > maxRedirects) {
          throw new Error(`Too many redirects (max ${maxRedirects})`);
        }
        currentUrl = new URL(location, currentUrl).toString();
        continue;
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} fetching ${currentUrl}`);
      }

      return await response.text();
    }

    throw new Error(`Too many redirects (max ${maxRedirects})`);
  } finally {
    clearTimeout(timer);
  }
}

function extractMetaTag(html: string, nameOrProperty: string): string | undefined {
  const escaped = nameOrProperty.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Matches <meta ... property="og:title" ... content="value" ...>
  const pattern1 = new RegExp(
    `<meta\\s+[^>]*?(?:property|name)=["']${escaped}["'][^>]*?content=["']([^"']*)["']`,
    'i',
  );
  const match1 = html.match(pattern1);
  if (match1?.[1] !== undefined) {
    return decodeHtmlEntities(match1[1]).trim();
  }

  // Matches <meta ... content="value" ... property="og:title" ...>
  const pattern2 = new RegExp(
    `<meta\\s+[^>]*?content=["']([^"']*)["'][^>]*?(?:property|name)=["']${escaped}["']`,
    'i',
  );
  const match2 = html.match(pattern2);
  if (match2?.[1] !== undefined) {
    return decodeHtmlEntities(match2[1]).trim();
  }

  return undefined;
}

function extractHtmlTitle(html: string): string | undefined {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (match?.[1]) {
    return decodeHtmlEntities(stripHtml(match[1])).trim();
  }
  return undefined;
}

interface JsonLdJobPosting {
  '@type'?: string | string[];
  title?: string;
  name?: string;
  description?: string;
  hiringOrganization?: string | { name?: string; legalName?: string };
  jobLocation?: string | {
    name?: string;
    address?: string | {
      addressLocality?: string;
      addressRegion?: string;
      streetAddress?: string;
    };
  };
  jobLocationType?: string;
  applicantLocationRequirements?: unknown;
  baseSalary?: {
    currency?: string;
    value?: number | {
      value?: number;
      minValue?: number;
      maxValue?: number;
    };
    minValue?: number;
    maxValue?: number;
  };
  estimatedSalary?: unknown;
  skills?: string[] | string;
  occupationalCategory?: string | string[];
  employmentType?: string | string[];
}

function findJobPosting(data: unknown): JsonLdJobPosting | null {
  if (!data) return null;
  if (Array.isArray(data)) {
    for (const item of data) {
      const found = findJobPosting(item);
      if (found) return found;
    }
    return null;
  }
  if (typeof data !== 'object') return null;

  const record = data as Record<string, unknown>;
  const typeVal = record['@type'];
  const typeStr = Array.isArray(typeVal) ? typeVal.join(' ') : String(typeVal || '');
  if (typeStr.toLowerCase().includes('jobposting')) {
    return record as JsonLdJobPosting;
  }

  if (Array.isArray(record['@graph'])) {
    for (const item of record['@graph']) {
      const found = findJobPosting(item);
      if (found) return found;
    }
  }

  for (const key of Object.keys(record)) {
    if (typeof record[key] === 'object' && record[key] !== null) {
      const found = findJobPosting(record[key]);
      if (found) return found;
    }
  }

  return null;
}

function extractJsonLd(html: string): JsonLdJobPosting | null {
  const regex = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(html)) !== null) {
    const jsonStr = match[1]?.trim();
    if (!jsonStr) continue;
    try {
      const parsed = JSON.parse(jsonStr);
      const posting = findJobPosting(parsed);
      if (posting) return posting;
    } catch {
      // Ignore invalid JSON-LD blocks and check remaining
    }
  }

  return null;
}

export function extractPreviewFromHtml(html: string, url: string): UrlPreview {
  const jobPosting = extractJsonLd(html);

  // 1. OpenGraph tags
  const ogTitle = extractMetaTag(html, 'og:title');
  const ogDescription = extractMetaTag(html, 'og:description');
  const ogSiteName = extractMetaTag(html, 'og:site_name');

  // 2. HTML standard tags
  const htmlTitle = extractHtmlTitle(html);
  const metaDescription = extractMetaTag(html, 'description');

  // Candidate title & text
  const candidateTitle = jobPosting?.title || jobPosting?.name || ogTitle || htmlTitle || '';
  const candidateText = jobPosting?.description || ogDescription || metaDescription || '';

  const cleanCandidateText = stripHtml(candidateText).trim();
  const title = cleanTitle(candidateTitle, cleanCandidateText);
  const text = cleanCandidateText || title;

  // Extract company
  let company: string | undefined;
  if (jobPosting?.hiringOrganization) {
    if (typeof jobPosting.hiringOrganization === 'string') {
      company = jobPosting.hiringOrganization.trim();
    } else if (typeof jobPosting.hiringOrganization === 'object') {
      company = (jobPosting.hiringOrganization.name || jobPosting.hiringOrganization.legalName || '').trim();
    }
  }
  if (!company && ogSiteName) {
    company = ogSiteName.trim();
  }

  // Extract city & remote status
  let city: string | undefined;
  if (jobPosting?.jobLocation) {
    if (typeof jobPosting.jobLocation === 'string') {
      city = jobPosting.jobLocation.trim();
    } else if (typeof jobPosting.jobLocation === 'object') {
      const addr = jobPosting.jobLocation.address;
      if (typeof addr === 'string') {
        city = addr.trim();
      } else if (typeof addr === 'object' && addr !== null) {
        city = (addr.addressLocality || addr.addressRegion || addr.streetAddress || '').trim();
      }
      if (!city && jobPosting.jobLocation.name) {
        city = jobPosting.jobLocation.name.trim();
      }
    }
  }

  if (!city) {
    city = extractCity(`${candidateTitle} ${text}`);
  }

  const isRemote = Boolean(
    jobPosting?.jobLocationType === 'TELECOMMUTE' ||
    jobPosting?.applicantLocationRequirements ||
    /дистанцион|удален|remote|telecommute/i.test(`${candidateTitle} ${text}`)
  );

  if (isRemote && (!city || city === 'Онлайн')) {
    city = 'Онлайн';
  }

  // Extract Salary & Normalization
  let jpMin: number | undefined;
  let jpMax: number | undefined;
  let jpCurrency: string | undefined;

  const baseSalary = jobPosting?.baseSalary;
  if (baseSalary) {
    jpCurrency = baseSalary.currency;
    if (typeof baseSalary.value === 'number') {
      jpMin = baseSalary.value;
      jpMax = baseSalary.value;
    } else if (typeof baseSalary.value === 'object' && baseSalary.value !== null) {
      jpMin = baseSalary.value.minValue ?? baseSalary.value.value;
      jpMax = baseSalary.value.maxValue ?? baseSalary.value.value;
    }
    if (jpMin === undefined && typeof baseSalary.minValue === 'number') {
      jpMin = baseSalary.minValue;
    }
    if (jpMax === undefined && typeof baseSalary.maxValue === 'number') {
      jpMax = baseSalary.maxValue;
    }
  }

  let jpRawSalary: string | undefined;
  if (jpMin !== undefined && jpMax !== undefined && jpMin !== jpMax) {
    jpRawSalary = `${jpMin} - ${jpMax} ${jpCurrency ?? ''}`.trim();
  } else if (jpMin !== undefined) {
    jpRawSalary = `${jpMin} ${jpCurrency ?? ''}`.trim();
  } else if (jpMax !== undefined) {
    jpRawSalary = `${jpMax} ${jpCurrency ?? ''}`.trim();
  }

  const salaryInfo: SalaryInfo = normalizeSalary({
    text,
    rawSalary: jpRawSalary,
    budget: jpMin ?? jpMax,
    currency: jpCurrency,
    type: 'job',
  });

  const budget = salaryInfo.normalizedUsdMin !== undefined
    ? (jpMin ?? jpMax)
    : (jpMin ?? jpMax);

  // Extract skills
  let skills: string[] | undefined;
  if (Array.isArray(jobPosting?.skills)) {
    skills = jobPosting.skills.map((s) => String(s).trim()).filter(Boolean);
  } else if (typeof jobPosting?.skills === 'string') {
    skills = jobPosting.skills.split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean);
  }

  return {
    url,
    title,
    text,
    type: 'job',
    company: company || undefined,
    city: city || undefined,
    budget: budget !== undefined ? budget : undefined,
    currency: salaryInfo.currency,
    rawSalary: salaryInfo.rawSalary,
    normalizedUsdMin: salaryInfo.normalizedUsdMin,
    normalizedUsdMax: salaryInfo.normalizedUsdMax,
    isRemote,
    skills: skills?.length ? skills : undefined,
  };
}

export async function previewUrl(url: string, options?: FetchSafeOptions): Promise<UrlPreview> {
  const html = await fetchSafeHttp(url, options);
  return extractPreviewFromHtml(html, url);
}
