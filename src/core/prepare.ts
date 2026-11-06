import { cleanTitle, extractBudget, extractBudgetAndCurrency, extractCity } from './extract.ts';
import { computeMinHashSketch, fingerprintOf, sha256, titleKeyOf } from './fingerprint.ts';
import { extractContacts, mergeContacts, normalizeContact } from './contacts.ts';
import { postKeyOf } from './observation.ts';
import type { Contact } from './types.ts';
import { detectCurrency, normalizeSalary } from './salary.ts';
import { cleanShortField, normalizeForMatch, toPlainText, truncate } from './text.ts';
import type { LeadType, RawLead, SourceRecord } from './types.ts';
import { canonicalizeUrl, isHttpUrl } from './url.ts';

export interface PreparedLead extends RawLead {
  canonicalUrl?: string;
  titleKey: string;
  fingerprint: string;
  publishedAtDate: Date;
  contacts: Contact[];
  minhash_sketch: string;
}

/** Hard cap on the stored text (same as the radar/2 observation limit). */
const MAX_TEXT_LENGTH = 20_000;

const JOB_HINT = /ваканс|vacanc|career|hiring|в\s+штат|оклад|трудоустр|соискател/i;

/** Boards that publish only vacancies: a post from them is a job whatever its title says. */
const JOB_BOARD_URL = /^https?:\/\/(?:www\.)?(?:jobicy\.com|weworkremotely\.com|remoteok\.com|remotive\.com|arbeitnow\.com|himalayas\.app|getmatch\.ru|hh\.ru\/vacancy|career\.habr\.com\/vacancies|trudvsem\.ru|boards\.greenhouse\.io|job-boards\.greenhouse\.io|jobs\.lever\.co|jobs\.ashbyhq\.com|jobs\.gem\.com|remoteworker\.[a-z]+|nodesk\.co|cryptojobslist\.com|cryptocurrencyjobs\.co|landing\.jobs|golangprojects\.com|workingnomads\.com|jobspresso\.co|elixirjobs\.net|pawetta\.ru)\b/i;
/** Freelance exchanges: everything on them is an order, even an order to write a vacancy. */
const GIG_BOARD_URL = /^https?:\/\/(?:www\.)?(?:kwork\.ru|fl\.ru|freelancehunt\.com\/project|freelancer\.com|profi\.ru|uslugi\.yandex\.ru|youdo\.com)\b/i;

export function isJobBoardUrl(url: string | undefined): boolean {
  return Boolean(url && JOB_BOARD_URL.test(url));
}

export function isGigBoardUrl(url: string | undefined): boolean {
  return Boolean(url && GIG_BOARD_URL.test(url));
}

/**
 * Freelancer.com clients pick a budget tier from a list, and the top tiers go to anything:
 * «Seblak Promo Instagram Design» at $50 000–100 000. Above this the tier says nothing.
 */
const FREELANCER_CEILING_USD = 10_000;

/** A share of future profit names no pay, whatever budget tier the post carries. */
const PROFIT_SHARE = /profit[- ]shar|revenue[- ]shar|commission[- ]only|equity[- ]only/i;

/** True when a sum on a post offers nothing real: the top tiers of Freelancer.com, a share of profit. */
export function payNotOffered(lead: { url?: string; title: string }, usd: number | undefined): boolean {
  if (usd === undefined) return false;
  if (PROFIT_SHARE.test(lead.title)) return true;
  return Boolean(lead.url && usd > FREELANCER_CEILING_USD && /^https?:\/\/(?:www\.)?freelancer\.com\//i.test(lead.url));
}
const JOB_PATH_RE = /\/(?:jobs?|vacanc(?:y|ies)|careers?|positions?)\b/i;

function detectLeadType(raw: RawLead, title: string, url?: string): LeadType {
  // A board's kind beats what an adapter says: the RSS adapter calls every post an order.
  if (isGigBoardUrl(url)) return 'gig';
  if (isJobBoardUrl(url)) return 'job';
  if (raw.type === 'job' || raw.type === 'gig') return raw.type;
  if (url && JOB_PATH_RE.test(url)) return 'job';
  return JOB_HINT.test(`${title} ${url ?? ''}`) ? 'job' : 'gig';
}

/**
 * The publication date, or the collection moment when the source gave none. The estimated
 * flag lets the output say «~date» instead of passing a guess off as the real date.
 */
function parsePublishedAt(value: string | undefined, now: Date): { date: Date; estimated: boolean } {
  if (!value) return { date: now, estimated: true };
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return { date: now, estimated: true };
  if (parsed.getTime() > now.getTime() + 60 * 60 * 1000) return { date: now, estimated: true };
  return { date: parsed, estimated: false };
}

export function prepareRawLead(
  raw: RawLead,
  source: SourceRecord,
  now: Date,
): PreparedLead {
  // Text is kept as written, contacts included (radar/2): guests get a redacted projection at read time.
  const text = toPlainText(raw.text || '');
  const title = cleanTitle(raw.title, text);
  const normalizedText = truncate(text || title, MAX_TEXT_LENGTH);
  const url = raw.url?.trim();
  const safeHttpUrl = url && isHttpUrl(url) ? url : undefined;
  const canonicalUrl = safeHttpUrl ? canonicalizeUrl(safeHttpUrl) : undefined;

  const explicitBudget =
    typeof raw.budget === 'number' && Number.isFinite(raw.budget) && raw.budget >= 0
      ? raw.budget
      : undefined;
  const extractedMoney = extractBudgetAndCurrency(`${raw.title || ''}\n${normalizedText}`);
  let budget = explicitBudget ?? extractedMoney.budget;
  const detected = detectCurrency(`${raw.title || ''}\n${normalizedText}`);
  let currency = cleanShortField(raw.currency, 8);
  if (!currency || (!explicitBudget && extractedMoney.currency)) {
    currency = extractedMoney.currency || detected || 'RUB';
  } else if (currency === 'RUB' && detected !== 'RUB' && (extractedMoney.currency === detected || !explicitBudget)) {
    currency = detected;
  }

  const explicitCity = cleanShortField(raw.city, 100);
  const extractedCity = extractCity(`${title}\n${normalizedText}`);
  const configuredCity =
    typeof source.config.city === 'string' ? source.config.city.trim() : '';
  const city = explicitCity || extractedCity || configuredCity || undefined;

  const type = detectLeadType(raw, title, canonicalUrl ?? safeHttpUrl);
  const salaryInfo = normalizeSalary({
    text: `${title}\n${normalizedText}`,
    rawSalary: raw.rawSalary,
    budget,
    currency,
    type,
  });
  const implausible = salaryInfo.implausible === true || payNotOffered({ url, title }, salaryInfo.normalizedUsdMax ?? salaryInfo.normalizedUsdMin);
  if (implausible) budget = undefined;

  const { date: publishedAtDate, estimated: publishedEstimated } = parsePublishedAt(raw.publishedAt, now);
  const titleKey = titleKeyOf(title);
  // The same post (platform + channel + message id) is one lead whatever source delivered it.
  const postKey = raw.sourceRef ? postKeyOf(raw.sourceRef) : undefined;
  const fingerprint = postKey ? sha256(`post:${postKey}`) : fingerprintOf({ canonicalUrl, title, text: normalizedText });
  // Contacts from the parser (normalised) plus everything written in the text, before any truncation.
  const given = (raw.contacts ?? [])
    .map((c) => normalizeContact(c.type, c.value))
    .filter((c): c is Contact => c !== null);
  const contacts = mergeContacts(given, extractContacts(`${raw.title ?? ''}\n${text}`));
  const minhash = computeMinHashSketch(normalizeForMatch(`${title}\n${normalizedText}`));

  return {
    ...raw,
    metadata: { ...(raw.metadata ?? {}), ...(publishedEstimated ? { publishedAtEstimated: true } : {}) },
    author: cleanShortField(raw.author, 200),
    category: cleanShortField(raw.category, 100),
    title,
    text: normalizedText,
    type,
    url: canonicalUrl ?? safeHttpUrl,
    canonicalUrl,
    budget,
    currency: salaryInfo.currency,
    paymentPeriod: salaryInfo.paymentPeriod,
    rawSalary: implausible ? undefined : salaryInfo.rawSalary,
    normalizedUsdMin: implausible ? undefined : salaryInfo.normalizedUsdMin,
    normalizedUsdMax: implausible ? undefined : salaryInfo.normalizedUsdMax,
    city,
    publishedAt: publishedAtDate.toISOString(),
    publishedAtDate,
    titleKey,
    fingerprint,
    contacts,
    minhash_sketch: minhash,
    externalId:
      raw.externalId?.trim() ||
      canonicalUrl ||
      `${source.id}:${fingerprint.slice(0, 16)}`,
  };
}
