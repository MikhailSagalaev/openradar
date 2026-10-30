import * as cheerio from 'cheerio';
import type { LeadType } from '../core/types.ts';
import { cleanTitle, extractBudgetAndCurrency, extractCity as extractCityFromText } from '../core/extract.ts';

export interface LeadPreview {
  type: LeadType;
  title: string;
  author?: string;
  category?: string;
  city?: string;
  budget?: number;
  salaryMax?: number;
  currency?: string;
  text: string;
  url: string;
  skills?: string[];
  isRemote?: boolean;
}

export function cleanHtmlText(htmlOrText: string): string {
  if (!htmlOrText) return '';
  return htmlOrText
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n/g, '\n\n')
    .trim();
}

function findJobPosting(data: unknown): Record<string, unknown> | null {
  if (!data) return null;
  if (Array.isArray(data)) {
    for (const item of data) {
      const found = findJobPosting(item);
      if (found) return found;
    }
    return null;
  }
  if (typeof data !== 'object') return null;

  const obj = data as Record<string, unknown>;
  const typeVal = obj['@type'];
  const typeStr = Array.isArray(typeVal) ? typeVal.join(' ') : String(typeVal || '');
  if (typeStr.toLowerCase().includes('jobposting')) {
    return obj;
  }

  if (Array.isArray(obj['@graph'])) {
    for (const item of obj['@graph']) {
      const found = findJobPosting(item);
      if (found) return found;
    }
  }

  for (const key of Object.keys(obj)) {
    if (typeof obj[key] === 'object' && obj[key] !== null) {
      const found = findJobPosting(obj[key]);
      if (found) return found;
    }
  }

  return null;
}

function extractCompany(org: unknown): string {
  if (!org) return '';
  if (typeof org === 'string') return org.trim();
  if (typeof org === 'object' && org !== null) {
    const o = org as Record<string, unknown>;
    return String(o.name || o.legalName || '').trim();
  }
  return '';
}

function extractCity(loc: unknown): string {
  if (!loc) return '';
  if (typeof loc === 'string') return loc.trim();
  if (typeof loc === 'object' && loc !== null) {
    const l = loc as Record<string, unknown>;
    const addr = l.address;
    if (typeof addr === 'string') return addr.trim();
    if (typeof addr === 'object' && addr !== null) {
      const a = addr as Record<string, unknown>;
      return String(a.addressLocality || a.addressRegion || a.streetAddress || '').trim();
    }
    return String(l.name || '').trim();
  }
  return '';
}

function extractRemote(posting: Record<string, unknown>): boolean {
  if (posting.jobLocationType === 'TELECOMMUTE') return true;
  if (posting.applicantLocationRequirements) return true;
  const combined = `${posting.title || ''} ${posting.description || ''}`.toLowerCase();
  return combined.includes('удаленн') || combined.includes('remote') || combined.includes('telecommute');
}

function extractSalary(salary: unknown): { budget?: number; salaryMax?: number; currency: string } {
  if (!salary || typeof salary !== 'object') {
    return { currency: 'RUB' };
  }
  const s = salary as Record<string, unknown>;
  const currency = typeof s.currency === 'string' ? s.currency : 'RUB';
  const val = s.value;
  if (typeof val === 'number') {
    return { budget: val, salaryMax: val, currency };
  }
  if (typeof val === 'object' && val !== null) {
    const v = val as Record<string, unknown>;
    const min = typeof v.minValue === 'number' ? v.minValue : undefined;
    const max = typeof v.maxValue === 'number' ? v.maxValue : (typeof v.value === 'number' ? v.value : undefined);
    return { budget: min ?? max, salaryMax: max, currency };
  }
  const min = typeof s.minValue === 'number' ? s.minValue : undefined;
  const max = typeof s.maxValue === 'number' ? s.maxValue : (typeof s.value === 'number' ? s.value : undefined);
  return { budget: min ?? max, salaryMax: max, currency };
}

function extractSkills(posting: Record<string, unknown>): string[] {
  const result: string[] = [];
  if (Array.isArray(posting.skills)) {
    for (const s of posting.skills) {
      if (typeof s === 'string' && s.trim()) result.push(s.trim());
    }
  } else if (typeof posting.skills === 'string') {
    result.push(...posting.skills.split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean));
  }
  return result;
}

export function validateSubmissionUrl(url: string): { valid: boolean; error?: string } {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { valid: false, error: 'Разрешены только http:// и https:// ссылки.' };
    }
    const hostname = parsed.hostname.toLowerCase();
    if (
      ['localhost', '127.0.0.1', '0.0.0.0', '::1'].includes(hostname) ||
      hostname.endsWith('.localhost') ||
      hostname.endsWith('.local')
    ) {
      return { valid: false, error: 'Локальные адреса запрещены.' };
    }
    return { valid: true };
  } catch {
    return { valid: false, error: 'Некорректный URL.' };
  }
}

export function extractPreviewFromHtml(html: string, url: string): LeadPreview {
  const $ = cheerio.load(html);

  // 1. Try schema.org/JobPosting before removing any elements
  const scripts = $('script[type="application/ld+json"]').toArray();
  for (const script of scripts) {
    const content = $(script).text();
    if (!content) continue;
    try {
      const data = JSON.parse(content);
      const posting = findJobPosting(data);
      if (posting) {
        const salary = extractSalary(posting.baseSalary);
        const category =
          String(posting.occupationalCategory || posting.industry || '').trim() ||
          undefined;
        const rawTitle = String(posting.title || posting.name || '').trim() || $('title').text().trim() || 'Вакансия';
        const rawDesc = cleanHtmlText(String(posting.description || ''));
        const title = cleanTitle(rawTitle, rawDesc);
        const fallbackMoney = !salary.budget ? extractBudgetAndCurrency(`${rawTitle}\n${rawDesc}`) : undefined;
        return {
          type: 'job',
          title,
          text: rawDesc,
          author: extractCompany(posting.hiringOrganization) || undefined,
          category,
          city: extractCity(posting.jobLocation) || extractCityFromText(`${title}\n${rawDesc}`) || undefined,
          isRemote: extractRemote(posting),
          budget: salary.budget ?? fallbackMoney?.budget,
          salaryMax: salary.salaryMax ?? fallbackMoney?.budget,
          currency: salary.budget ? salary.currency : (fallbackMoney?.currency || salary.currency),
          skills: extractSkills(posting),
          url: String(posting.url || url),
        };
      }
    } catch {
      // Ignore JSON errors in invalid ld+json tags
    }
  }

  // Remove boilerplate DOM elements before extracting fallback text
  $('script, style, noscript, svg, nav, header, footer, aside, .breadcrumbs, .breadcrumb, [role="navigation"], [role="banner"], [role="contentinfo"], .cookie-notice, .cookie-banner').remove();

  // 2. OpenGraph and Meta tags fallback
  const ogTitle =
    $('meta[property="og:title"]').attr('content') ||
    $('meta[name="twitter:title"]').attr('content') ||
    $('title').text() ||
    '';
  const ogDesc =
    $('meta[property="og:description"]').attr('content') ||
    $('meta[name="twitter:description"]').attr('content') ||
    $('meta[name="description"]').attr('content') ||
    '';
  const ogSite =
    $('meta[property="og:site_name"]').attr('content') ||
    $('meta[name="author"]').attr('content') ||
    '';

  const bodyText =
    $('article').text().trim() ||
    $('main').text().trim() ||
    $('body').text().trim() ||
    '';
  const rawDesc = cleanHtmlText(ogDesc.trim() || bodyText.slice(0, 3000));
  const rawTitle = cleanHtmlText(ogTitle) || 'Новый лид';
  const title = cleanTitle(rawTitle, rawDesc);

  // Determine type
  const lowerUrl = url.toLowerCase();
  const lowerTitle = rawTitle.toLowerCase();
  const isJob =
    lowerUrl.includes('/vacancy') ||
    lowerUrl.includes('/job') ||
    lowerUrl.includes('/vacancies') ||
    lowerUrl.includes('/career') ||
    lowerTitle.includes('ваканси') ||
    lowerTitle.includes('job') ||
    lowerTitle.includes('hiring');

  const metaKeywords =
    $('meta[name="keywords"]').attr('content') ||
    $('meta[property="article:tag"]').toArray().map((el) => $(el).attr('content')).filter(Boolean).join(', ') ||
    '';
  const fallbackSkills = metaKeywords
    ? metaKeywords.split(/[,;\n]+/).map((s) => s.trim()).filter((s) => s.length > 1 && s.length < 30).slice(0, 8)
    : undefined;

  const extractedMoney = extractBudgetAndCurrency(`${rawTitle}\n${rawDesc}`);
  const city = extractCityFromText(`${title}\n${rawDesc}`);

  return {
    type: isJob ? 'job' : 'gig',
    title,
    text: rawDesc,
    author: ogSite.trim() || undefined,
    city: city || undefined,
    budget: extractedMoney.budget,
    currency: extractedMoney.currency,
    skills: fallbackSkills,
    url,
    isRemote: true,
  };
}
