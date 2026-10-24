import type { PollContext, RawLead, SourceAdapter, SourceRecord } from '../core/types.ts';
import { fetchText } from './http.ts';

/**
 * Kwork adapter with two modes:
 * 1. Closed API (preferred): when RADAR_KWORK_LOGIN / RADAR_KWORK_PASSWORD are
 *    configured, the adapter signs in through the mobile-app API
 *    (api.kwork.ru/signIn -> token -> POST /projects). This is the same
 *    protocol as the community wrappers (pykwork / kwork-api).
 * 2. Anonymous fallback: parses the embedded window.stateData of the public
 *    projects page. Works without an account but breaks when the markup changes.
 */

const API_HOST = 'https://api.kwork.ru';
// Public credentials of the Kwork mobile application (same constant as pykwork).
const MOBILE_API_BASIC = 'Basic bW9iaWxlX2FwaTpxRnZmUmw3dw==';

interface KworkWant {
  id?: number | string;
  name?: string;
  description?: string;
  kworkPrice?: number | string;
  priceLimit?: number | string;
  possiblePriceLimit?: number | string;
  price?: number | string;
  category_id?: number | string;
  user?: { username?: string };
  username?: string;
}

function parseMoney(value: number | string | undefined): number | undefined {
  if (value === undefined || value === null) return undefined;
  const parsed = Number.parseFloat(String(value).replace(/[^\d.,]/g, '').replace(',', '.'));
  if (!Number.isFinite(parsed) || parsed < 500) return undefined;
  return Math.round(parsed);
}

function wantToRawLead(want: KworkWant, source: SourceRecord): RawLead | null {
  if (!want.id || !want.name) return null;
  const description = String(want.description ?? '').trim();
  const title = String(want.name).trim();
  const text = description ? `${title}\n\n${description}` : title;
  if (text.length < 35) return null;

  return {
    sourceId: source.id,
    externalId: `kwork:${want.id}`,
    url: `https://kwork.ru/projects/${want.id}`,
    title,
    text,
    author: want.user?.username ?? want.username,
    budget: parseMoney(want.kworkPrice ?? want.priceLimit ?? want.possiblePriceLimit ?? want.price),
    raw: { categoryId: want.category_id },
  };
}

async function apiPost(
  ctx: PollContext,
  endpoint: string,
  params: Record<string, string>,
): Promise<any> {
  const response = await ctx.fetchImpl(`${API_HOST}/${endpoint}`, {
    method: 'POST',
    headers: {
      Authorization: MOBILE_API_BASIC,
      'content-type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
      'User-Agent': ctx.userAgent,
    },
    body: new URLSearchParams(params).toString(),
    signal: AbortSignal.timeout(ctx.timeoutMs),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data) {
    throw new Error(`Kwork API ${endpoint} failed: HTTP ${response.status}`);
  }
  return data;
}

async function pollViaApi(
  source: SourceRecord,
  ctx: PollContext,
): Promise<RawLead[]> {
  const login = process.env.RADAR_KWORK_LOGIN?.trim();
  const password = process.env.RADAR_KWORK_PASSWORD?.trim();
  if (!login || !password) throw new Error('Kwork API mode requires RADAR_KWORK_LOGIN and RADAR_KWORK_PASSWORD');

  const signIn = await apiPost(ctx, 'signIn', { login, password });
  const token = signIn?.response?.token ?? signIn?.token;
  if (!token) throw new Error('Kwork signIn did not return a token');
  ctx.logger.info('Kwork: signed in via closed API');

  const categoryId = typeof source.config.categoryId === 'string' ? source.config.categoryId : '';
  const page = Math.max(1, Number(source.config.page ?? 1) || 1);
  const params: Record<string, string> = {
    categories: categoryId,
    page: String(page),
    token: String(token),
  };
  if (typeof source.config.query === 'string' && source.config.query.trim()) {
    params.query = source.config.query.trim();
  }

  const data = await apiPost(ctx, 'projects', params);
  const wants: KworkWant[] = Array.isArray(data?.response)
    ? data.response
    : Array.isArray(data?.response?.data)
      ? data.response.data
      : [];

  const limit = Math.max(1, Math.min(Number(source.config.limit ?? 20), 100));
  const leads: RawLead[] = [];
  for (const want of wants.slice(0, limit)) {
    const lead = wantToRawLead(want, source);
    if (lead) leads.push(lead);
  }
  return leads;
}

async function pollViaStateData(
  source: SourceRecord,
  ctx: PollContext,
): Promise<RawLead[]> {
  const categoryId =
    typeof source.config.categoryId === 'string' ? source.config.categoryId : '';
  const base = typeof source.config.url === 'string'
    ? source.config.url
    : 'https://kwork.ru/projects';
  const url = categoryId
    ? `${base}${base.includes('?') ? '&' : '?'}c=${encodeURIComponent(categoryId)}`
    : base;

  const html = await fetchText(ctx, url);
  const match = html.match(/window\.stateData\s*=\s*(\{[\s\S]*?\});/);
  if (!match?.[1]) {
    ctx.logger.warn('Kwork: window.stateData not found; markup may have changed', { url });
    return [];
  }

  let state: { wantsListData?: { pagination?: { data?: KworkWant[] } } };
  try {
    state = JSON.parse(match[1]);
  } catch (error) {
    ctx.logger.warn('Kwork: failed to parse page state', {
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }

  const items = state.wantsListData?.pagination?.data ?? [];
  const limit = Math.max(1, Math.min(Number(source.config.limit ?? 10), 50));
  const leads: RawLead[] = [];
  for (const item of items.slice(0, limit)) {
    const lead = wantToRawLead(item, source);
    if (lead) leads.push(lead);
  }
  return leads;
}

export const kworkSource: SourceAdapter = {
  kind: 'kwork',
  access: 'public',
  description:
    'Kwork projects. With RADAR_KWORK_LOGIN/PASSWORD set, uses the closed mobile API (stable JSON); otherwise falls back to parsing the public page state.',
  risks: [
    'API protocol is unofficial and can change without notice',
    'Account-based mode requires a Kwork account and may violate platform terms',
    'Anonymous mode depends on the page markup',
  ],
  async poll(source: SourceRecord, ctx: PollContext): Promise<RawLead[]> {
    const hasCredentials =
      Boolean(process.env.RADAR_KWORK_LOGIN?.trim()) &&
      Boolean(process.env.RADAR_KWORK_PASSWORD?.trim());
    if (hasCredentials) {
      try {
        return await pollViaApi(source, ctx);
      } catch (error) {
        ctx.logger.warn('Kwork API failed; falling back to page parsing', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return pollViaStateData(source, ctx);
  },
};
