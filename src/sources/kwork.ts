import type { PollContext, RawLead, SourceAdapter, SourceRecord } from '../core/types.ts';
import { fetchText } from './http.ts';

/**
 * Kwork adapter: parses the embedded window.stateData of the public
 * projects page (kwork.ru/projects). Works strictly without login or credentials.
 */

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
    'Kwork projects parsed via public page window.stateData (no login or account required).',
  risks: [
    'Public page parsing depends on the page markup structure',
  ],
  async poll(source: SourceRecord, ctx: PollContext): Promise<RawLead[]> {
    return pollViaStateData(source, ctx);
  },
};
