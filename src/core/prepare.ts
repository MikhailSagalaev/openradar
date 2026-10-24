import { cleanTitle, extractBudget, extractCity } from './extract.ts';
import { fingerprintOf, titleKeyOf } from './fingerprint.ts';
import { normalizeSalary } from './salary.ts';
import { sanitizePrivacy, toPlainText, truncate } from './text.ts';
import type { LeadType, RawLead, SourceRecord } from './types.ts';
import { canonicalizeUrl, isHttpUrl } from './url.ts';

export interface PreparedLead extends RawLead {
  canonicalUrl?: string;
  titleKey: string;
  fingerprint: string;
  publishedAtDate: Date;
}

/** Hard cap on the stored description: we keep the essence, not a mirror copy. */
const MAX_TEXT_LENGTH = 3000;

const JOB_HINT = /ваканс|vacanc|career|hiring|в\s+штат|оклад|трудоустр|соискател/i;

function detectLeadType(raw: RawLead, title: string, url?: string): LeadType {
  if (raw.type === 'job' || raw.type === 'gig') return raw.type;
  return JOB_HINT.test(`${title} ${url ?? ''}`) ? 'job' : 'gig';
}

function parsePublishedAt(value: string | undefined, now: Date): Date {
  if (!value) return now;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return now;
  if (parsed.getTime() > now.getTime() + 60 * 60 * 1000) return now;
  return parsed;
}

export function prepareRawLead(
  raw: RawLead,
  source: SourceRecord,
  now: Date,
): PreparedLead {
  // PII is stripped centrally so every adapter and user submission is covered (152-ФЗ).
  const text = sanitizePrivacy(toPlainText(raw.text || ''));
  const title = cleanTitle(raw.title, text);
  const normalizedText = truncate(text || title, MAX_TEXT_LENGTH);
  const url = raw.url?.trim();
  const safeHttpUrl = url && isHttpUrl(url) ? url : undefined;
  const canonicalUrl = safeHttpUrl ? canonicalizeUrl(safeHttpUrl) : undefined;

  const explicitBudget =
    typeof raw.budget === 'number' && Number.isFinite(raw.budget) && raw.budget >= 0
      ? raw.budget
      : undefined;
  const budget = explicitBudget ?? extractBudget(`${title}\n${normalizedText}`);

  const explicitCity = raw.city?.trim();
  const extractedCity = extractCity(`${title}\n${normalizedText}`);
  const configuredCity =
    typeof source.config.city === 'string' ? source.config.city.trim() : '';
  const city = explicitCity || extractedCity || configuredCity || undefined;

  const salaryInfo = normalizeSalary({
    text: `${title}\n${normalizedText}`,
    rawSalary: raw.rawSalary,
    budget,
    currency: raw.currency,
    type: raw.type,
  });

  const publishedAtDate = parsePublishedAt(raw.publishedAt, now);
  const titleKey = titleKeyOf(title);
  const fingerprint = fingerprintOf({ canonicalUrl, title, text: normalizedText });

  return {
    ...raw,
    title,
    text: normalizedText,
    type: detectLeadType(raw, title, canonicalUrl ?? safeHttpUrl),
    url: canonicalUrl ?? safeHttpUrl,
    canonicalUrl,
    budget,
    currency: salaryInfo.currency,
    paymentPeriod: salaryInfo.paymentPeriod,
    rawSalary: salaryInfo.rawSalary,
    normalizedUsdMin: salaryInfo.normalizedUsdMin,
    normalizedUsdMax: salaryInfo.normalizedUsdMax,
    city,
    publishedAt: publishedAtDate.toISOString(),
    publishedAtDate,
    titleKey,
    fingerprint,
    externalId:
      raw.externalId?.trim() ||
      canonicalUrl ||
      `${source.id}:${fingerprint.slice(0, 16)}`,
  };
}
