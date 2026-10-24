/**
 * OpenRadar - Content Script & schema.org/JobPosting extraction helper
 * Swiss-style typography, zero emoji.
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

function extractRemote(posting) {
  if (posting.jobLocationType === 'TELECOMMUTE') return true;
  if (posting.applicantLocationRequirements) return true;
  const combined = `${posting.title || ''} ${posting.description || ''}`.toLowerCase();
  return combined.includes('удаленн') || combined.includes('remote') || combined.includes('telecommute');
}

function extractSalary(salary) {
  if (!salary) return { budget: undefined, salaryMax: undefined, currency: 'RUB' };
  const currency = typeof salary.currency === 'string' ? salary.currency : 'RUB';
  const val = salary.value;
  if (typeof val === 'number') {
    return { budget: val, salaryMax: val, currency };
  }
  if (typeof val === 'object' && val !== null) {
    const min = typeof val.minValue === 'number' ? val.minValue : undefined;
    const max = typeof val.maxValue === 'number' ? val.maxValue : (typeof val.value === 'number' ? val.value : undefined);
    return { budget: min ?? max, salaryMax: max, currency };
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
  const { budget, salaryMax, currency } = extractSalary(posting.baseSalary);
  return {
    type: 'job',
    title: String(posting.title || posting.name || '').trim(),
    description: cleanText(posting.description || ''),
    company: extractCompany(posting.hiringOrganization),
    city: extractCity(posting.jobLocation),
    isRemote: extractRemote(posting),
    budget,
    salaryMax,
    currency,
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
  return null;
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
  };
}
