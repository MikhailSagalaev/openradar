/**
 * openradar extension: reads the open page, including schema.org/JobPosting markup.
 */

function cleanText(htmlOrText) {
  if (!htmlOrText) return '';
  return String(htmlOrText)
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

function findJobPosting(data) {
  if (!data) return null;
  if (Array.isArray(data)) {
    for (const item of data) {
      const found = findJobPosting(item);
      if (found) return found;
    }
    return null;
  }
  if (typeof data !== 'object') return null;

  const typeVal = data['@type'];
  const typeStr = Array.isArray(typeVal) ? typeVal.join(' ') : String(typeVal || '');
  if (typeStr.toLowerCase().includes('jobposting')) {
    return data;
  }

  if (Array.isArray(data['@graph'])) {
    for (const item of data['@graph']) {
      const found = findJobPosting(item);
      if (found) return found;
    }
  }

  for (const key of Object.keys(data)) {
    if (typeof data[key] === 'object' && data[key] !== null) {
      const found = findJobPosting(data[key]);
      if (found) return found;
    }
  }

  return null;
}

function extractCompany(org) {
  if (!org) return '';
  if (typeof org === 'string') return org.trim();
  if (typeof org === 'object') {
    return String(org.name || org.legalName || '').trim();
  }
  return '';
}

function extractCity(loc) {
  if (!loc) return '';
  if (Array.isArray(loc)) {
    return loc.map(extractCity).filter(Boolean).slice(0, 3).join(', ');
  }
  if (typeof loc === 'string') return loc.trim();
  if (typeof loc === 'object') {
    const addr = loc.address;
    if (typeof addr === 'string') return addr.trim();
    if (typeof addr === 'object' && addr !== null) {
      return String(addr.addressLocality || addr.addressRegion || addr.streetAddress || '').trim();
    }
    return String(loc.name || '').trim();
  }
  return '';
}

const FULLY_REMOTE = /fully\s+remote|100%\s+remote|remote[- ]first|полностью\s+удал/i;
const OFFICE_BOUND = /transition\s+to\s+on-?site|in[- ]office|hybrid|гибрид|no\s+remote|not\s+remote/i;

// The same rules as remoteOfPosting in src/core/extract.ts.
function extractRemote(posting) {
  const combined = `${posting.title || ''} ${posting.description || ''}`;
  if (FULLY_REMOTE.test(combined)) return true;
  // «Remote until the office opens» is office work, whatever the markup says.
  if (OFFICE_BOUND.test(combined)) return false;
  const types = Array.isArray(posting.jobLocationType) ? posting.jobLocationType : [posting.jobLocationType];
  if (types.includes('TELECOMMUTE')) return true;
  if (/on-?site/i.test(combined)) return false;
  return /удал[её]нн|remote|telecommute/i.test(combined);
}

/** The first lines of the page: boards print the place and the work mode under the title. */
function headLines(doc) {
  const text = doc?.body?.innerText || '';
  return text.split('\n').map((line) => line.trim()).filter(Boolean).slice(0, 15);
}

/** A short line that is only a work mode: «In office», «Hybrid», «Remote», «Удалённо». */
function workModeOf(lines) {
  for (const line of lines) {
    if (line.length > 24) continue;
    if (/^(?:in[- ]office|on-?site|office|hybrid|гибрид|офис|в офисе)$/i.test(line)) return false;
    if (/^(?:fully\s+)?remote$|^удал[её]нн\S*(?:\s+работа)?$/i.test(line)) return true;
  }
  return undefined;
}

/** «Dallas-Fort Worth Area • San Francisco Bay Area» under the title. */
function placeLineOf(lines) {
  const line = lines.find((item) => item.length < 160 && /\s[•·|]\s/.test(item) && !/https?:|©/.test(item));
  if (!line) return '';
  return line.split(/\s[•·|]\s/).map((part) => part.replace(/\s+Area$/i, '').trim()).filter(Boolean).slice(0, 3).join(', ');
}

/** Vacancies abroad state pay by the year; a sum that large is no month's pay. */
function periodOfPay(after, amount, currency) {
  if (/per\s+year|annual|a\s+year|\/\s*y(?:ea)?r|в\s+год/i.test(after)) return 'year';
  if (/per\s+month|a\s+month|\/\s*mo|в\s+месяц/i.test(after)) return 'month';
  return currency !== 'RUB' && amount >= 20000 ? 'year' : 'month';
}

/** Pay written in the text: all overlapping ranges of a vacancy make one, as on the hub. */
function moneyInText(text) {
  const signs = { $: 'USD', '€': 'EUR', '£': 'GBP' };
  let found;
  for (const m of String(text || '').matchAll(/([$€£])\s?(\d{1,3}(?:,\d{3})+|\d{4,7})\s*(?:-|–|—|to)\s*[$€£]?\s?(\d{1,3}(?:,\d{3})+|\d{4,7})/g)) {
    const min = Number(m[2].replace(/,/g, ''));
    const max = Number(m[3].replace(/,/g, ''));
    if (!found) found = { budget: min, salaryMax: max, currency: signs[m[1]], payPeriod: periodOfPay(String(text).slice(m.index + m[0].length, m.index + m[0].length + 40), max, signs[m[1]]) };
    else if (min <= found.salaryMax && max >= found.budget) {
      found = { ...found, budget: Math.min(found.budget, min), salaryMax: Math.max(found.salaryMax, max) };
    }
  }
  return found;
}

const JOB_PAGE = /jobs\.gem\.com\/|greenhouse\.io\/|jobs\.lever\.co\/|jobs\.ashbyhq\.com\/|apply\.workable\.com\/|\.recruitee\.com\/|\/careers?\/|\/jobs?\/|\/vacanc/i;

function companyFromUrl(url) {
  const slug = /(?:jobs\.gem\.com|greenhouse\.io|jobs\.lever\.co|jobs\.ashbyhq\.com|apply\.workable\.com)\/([^/?#]+)/i.exec(url)?.[1];
  return slug ? slug.replace(/[-_]+/g, ' ').replace(/^\p{L}/u, (c) => c.toUpperCase()) : '';
}

/** Boards like Gem have no JobPosting markup: the page itself is read. */
function jobFromPage(doc) {
  const url = doc?.location?.href || '';
  if (!JOB_PAGE.test(url)) return null;
  const meta = (name) => doc.querySelector?.(`meta[property="${name}"]`)?.getAttribute?.('content')
    || doc.querySelector?.(`meta[name="${name}"]`)?.getAttribute?.('content') || '';
  const title = meta('og:title') || doc.title || '';
  const body = doc.body?.innerText || '';
  const description = meta('og:description') || meta('description') || body.slice(0, 8000);
  if (!title || !description) return null;
  const lines = headLines(doc);
  const money = moneyInText(body) || moneyInText(description);
  return {
    type: 'job',
    title: title.trim(),
    description: cleanText(description),
    company: meta('og:site_name') || companyFromUrl(url),
    city: placeLineOf(lines),
    isRemote: workModeOf(lines) ?? extractRemote({ title, description: body || description }),
    budget: money?.budget,
    salaryMax: money?.salaryMax,
    currency: money?.currency,
    payPeriod: money?.payPeriod,
    skills: [],
    url,
  };
}

function extractSalary(salary) {
  if (!salary) return { budget: undefined, salaryMax: undefined, currency: undefined };
  const currency = typeof salary.currency === 'string' && salary.currency.trim() ? salary.currency.trim().toUpperCase() : undefined;
  const val = salary.value;
  if (typeof val === 'number') {
    return { budget: val, salaryMax: val, currency };
  }
  if (typeof val === 'object' && val !== null) {
    const min = typeof val.minValue === 'number' ? val.minValue : undefined;
    const max = typeof val.maxValue === 'number' ? val.maxValue : (typeof val.value === 'number' ? val.value : undefined);
    const unit = String(val.unitText ?? salary.unitText ?? '').toUpperCase();
    return { budget: min ?? max, salaryMax: max, currency, payPeriod: unit === 'YEAR' ? 'year' : unit === 'MONTH' ? 'month' : undefined };
  }
  const min = typeof salary.minValue === 'number' ? salary.minValue : undefined;
  const max = typeof salary.maxValue === 'number' ? salary.maxValue : (typeof salary.value === 'number' ? salary.value : undefined);
  return { budget: min ?? max, salaryMax: max, currency };
}

function extractSkills(posting) {
  const result = [];
  if (Array.isArray(posting.skills)) {
    for (const s of posting.skills) {
      if (typeof s === 'string' && s.trim()) result.push(s.trim());
    }
  } else if (typeof posting.skills === 'string') {
    result.push(...posting.skills.split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean));
  }
  return result;
}

function normalizeJobPosting(posting, doc) {
  const salary = extractSalary(posting.baseSalary);
  const lines = headLines(doc);
  const description = cleanText(posting.description || '');
  // Markup often leaves pay out while the page prints it.
  const money = salary.budget === undefined ? moneyInText(doc?.body?.innerText) || moneyInText(description) : undefined;
  return {
    type: 'job',
    title: String(posting.title || posting.name || '').trim(),
    description,
    company: extractCompany(posting.hiringOrganization),
    city: extractCity(posting.jobLocation) || placeLineOf(lines),
    // What the page shows the reader beats the markup.
    isRemote: workModeOf(lines) ?? extractRemote(posting),
    budget: salary.budget ?? money?.budget,
    salaryMax: salary.salaryMax ?? money?.salaryMax,
    currency: salary.currency ?? money?.currency,
    payPeriod: salary.payPeriod ?? money?.payPeriod,
    skills: extractSkills(posting),
    url: posting.url || (doc?.location?.href ?? ''),
  };
}

function extractJobPosting(doc = typeof document !== 'undefined' ? document : null) {
  if (!doc) return null;
  const scripts = doc.querySelectorAll('script[type="application/ld+json"]');
  for (let i = 0; i < scripts.length; i++) {
    const content = scripts[i]?.textContent;
    if (!content) continue;
    try {
      const data = JSON.parse(content);
      const posting = findJobPosting(data);
      if (posting) {
        return normalizeJobPosting(posting, doc);
      }
    } catch {
      // Ignore JSON parse errors in invalid tags
    }
  }
  return jobFromPage(doc);
}

function extractPageData(doc = typeof document !== 'undefined' ? document : null) {
  if (!doc) return null;
  const jobPosting = extractJobPosting(doc);
  const metaDesc =
    doc.querySelector?.('meta[name="description"]')?.getAttribute?.('content') ||
    doc.querySelector?.('meta[property="og:description"]')?.getAttribute?.('content') ||
    doc.querySelector?.('meta[name="twitter:description"]')?.getAttribute?.('content') ||
    '';
  const metaTitle =
    jobPosting?.title ||
    doc.querySelector?.('meta[property="og:title"]')?.getAttribute?.('content') ||
    doc.title ||
    '';
  let selection = '';
  try {
    if (typeof doc.getSelection === 'function') {
      selection = String(doc.getSelection() ?? '').trim().slice(0, 4000);
    } else if (typeof window !== 'undefined' && window.getSelection) {
      selection = String(window.getSelection() ?? '').trim().slice(0, 4000);
    }
  } catch {}

  return {
    title: metaTitle,
    url: doc.location?.href || '',
    selection,
    description: metaDesc,
    jobPosting: jobPosting || null,
    detectedType: jobPosting ? 'job' : 'gig',
  };
}

// Nothing is sent automatically: the popup asks for page data on click.
if (typeof chrome !== 'undefined' && chrome?.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request?.type === 'EXTRACT_PAGE_DATA' || request?.action === 'extract') {
      sendResponse(extractPageData(document));
    }
    return true;
  });
}

if (typeof window !== 'undefined') {
  window.openRadarExtractJobPosting = extractJobPosting;
  window.openRadarExtractPageData = extractPageData;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    cleanText,
    findJobPosting,
    extractJobPosting,
    extractPageData,
    normalizeJobPosting,
    moneyInText,
  };
}
