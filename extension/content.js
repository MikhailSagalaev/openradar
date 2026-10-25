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

const XRAY_DOMAINS = [
  'hh.ru',
  'linkedin.com',
  'career.habr.com',
  'habr.com',
  'kwork.ru',
  'upwork.com',
];

function isJobDomain(hostname) {
  if (!hostname) return false;
  return XRAY_DOMAINS.some((d) => hostname.includes(d));
}

function findVacancyTitleHeading(doc) {
  if (!doc) return null;
  return (
    doc.querySelector('[data-qa="vacancy-title"]') ||
    doc.querySelector('.job-details-jobs-unified-top-card__job-title') ||
    doc.querySelector('.page-title') ||
    doc.querySelector('h1') ||
    doc.querySelector('h2')
  );
}

function renderXrayBar(data, doc = typeof document !== 'undefined' ? document : null) {
  if (!doc || doc.getElementById('openradar-xray-bar')) return;

  const targetHeading = findVacancyTitleHeading(doc);
  if (!targetHeading || !targetHeading.parentNode) return;

  const bar = doc.createElement('div');
  bar.id = 'openradar-xray-bar';
  bar.className = 'openradar-xray-bar';
  bar.setAttribute('style', [
    'display: flex',
    'align-items: center',
    'flex-wrap: wrap',
    'gap: 8px',
    'background: #111111',
    'color: #ffffff',
    'font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace',
    'font-size: 12px',
    'line-height: 1.4',
    'padding: 6px 12px',
    'margin: 8px 0',
    'border: 1px solid #27272a',
    'border-radius: 2px',
    'box-sizing: border-box',
    'width: 100%',
    'z-index: 9999',
  ].join('; '));

  const tag = doc.createElement('span');
  tag.textContent = '[ OpenRadar X-Ray ]';
  tag.style.fontWeight = '600';
  tag.style.letterSpacing = '0.5px';
  tag.style.color = '#38bdf8';

  const metrics = doc.createElement('span');
  metrics.style.color = '#d4d4d8';

  const market = data.market || {};
  const median = market.median_salary ? `$${market.median_salary}` : 'нет данных';
  const range = (market.percentile_25 && market.percentile_75)
    ? ` ($${market.percentile_25}–$${market.percentile_75})`
    : '';
  const dups = typeof market.duplicate_count === 'number' ? market.duplicate_count : 0;
  const trust = typeof data.source_trust === 'number' ? `${Math.round(data.source_trust * 100)}%` : '80%';

  metrics.textContent = `Вилка по рынку: ${median}${range} · Дубликаты: ${dups} · Надежность источника: ${trust}`;

  bar.appendChild(tag);
  bar.appendChild(metrics);

  targetHeading.parentNode.insertBefore(bar, targetHeading);
}

async function runXrayEngine() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const hostname = window.location.hostname || '';
  if (!isJobDomain(hostname)) return;

  try {
    let base = 'https://openradar.fun';
    if (typeof chrome !== 'undefined' && chrome?.storage?.local) {
      const stored = await chrome.storage.local.get('radarConfig');
      if (stored?.radarConfig?.base) {
        base = stored.radarConfig.base.replace(/\/+$/, '');
      }
    }

    const currentUrl = window.location.href;
    const res = await fetch(`${base}/api/v1/xray?url=${encodeURIComponent(currentUrl)}`);
    if (!res.ok) return;

    const data = await res.json();
    renderXrayBar(data, document);

    const posting = extractJobPosting(document);
    if (posting && typeof chrome !== 'undefined' && chrome?.runtime?.sendMessage) {
      chrome.runtime.sendMessage({
        type: 'XRAY_ATTESTATION_CANDIDATE',
        payload: {
          url: currentUrl,
          title: posting.title,
          posting,
        },
      }).catch(() => {});
    }
  } catch {
    // Fail silently in content script
  }
}

// X-Ray is never automatic: the page URL goes to the server only when the user
// asks for it (popup button / explicit action), see PRIVACY.md.
if (typeof chrome !== 'undefined' && chrome?.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request?.type === 'EXTRACT_PAGE_DATA' || request?.action === 'extract') {
      sendResponse(extractPageData(document));
    } else if (request?.type === 'RUN_XRAY') {
      runXrayEngine()
        .then(() => sendResponse({ ok: true }))
        .catch(() => sendResponse({ ok: false }));
    }
    return true;
  });
}

if (typeof window !== 'undefined') {
  window.openRadarExtractJobPosting = extractJobPosting;
  window.openRadarExtractPageData = extractPageData;
  window.openRadarRenderXrayBar = renderXrayBar;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    cleanText,
    findJobPosting,
    extractJobPosting,
    extractPageData,
    normalizeJobPosting,
    isJobDomain,
    findVacancyTitleHeading,
    renderXrayBar,
  };
}
