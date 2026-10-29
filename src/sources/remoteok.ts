import type { RawLead, SourceAdapter, SourceRecord, PollContext } from '../core/types.ts';
import { fetchText } from './http.ts';
import { stripHtml } from '../core/text.ts';

export interface RemoteOkJobItem {
  slug?: string;
  id?: string | number;
  epoch?: string | number;
  date?: string;
  company?: string;
  company_logo?: string;
  position?: string;
  tags?: string[];
  description?: string;
  original?: boolean;
  url?: string;
  apply_url?: string;
  location?: string;
  salary_min?: number | null;
  salary_max?: number | null;
  legal?: string;
  legal_notice?: string;
}

export const remoteokSource: SourceAdapter = {
  kind: 'remoteok',
  access: 'official',
  description:
    'Официальный публичный JSON API RemoteOK (remoteok.com/api). Международные удаленные вакансии.',
  risks: [
    'Возвращает полный список вакансий в одном массиве',
    'Ограничение частоты запросов (rate limit) со стороны сервиса',
  ],

  async poll(source: SourceRecord, ctx: PollContext): Promise<RawLead[]> {
    const base =
      typeof source.config.url === 'string' && source.config.url.trim()
        ? source.config.url.trim()
        : 'https://remoteok.com/api';

    const url = new URL(base);

    // Filter by tag if configured
    const tag =
      (typeof source.config.tag === 'string' && source.config.tag.trim()) ||
      (typeof source.config.query === 'string' && source.config.query.trim()) ||
      (Array.isArray(source.config.includeKeywords) && source.config.includeKeywords[0]?.trim()) ||
      '';

    if (tag && !url.searchParams.has('tag')) {
      url.searchParams.set('tag', tag.toLowerCase());
    }

    const jsonText = await fetchText(ctx, url.toString(), {
      Accept: 'application/json',
      'User-Agent': ctx.userAgent || 'openradar/1.0 (https://github.com/MikhailSagalaev/openradar)',
    });

    let items: RemoteOkJobItem[];
    try {
      const parsed = JSON.parse(jsonText);
      if (!Array.isArray(parsed)) {
        ctx.logger.warn('RemoteOK: expected array response', { url: url.toString() });
        return [];
      }
      items = parsed as RemoteOkJobItem[];
    } catch (err) {
      ctx.logger.warn('RemoteOK: failed to parse JSON response', {
        error: err instanceof Error ? err.message : String(err),
        url: url.toString(),
      });
      return [];
    }

    const limit = Math.max(1, Math.min(Number(source.config.limit ?? 50), 200));
    const leads: RawLead[] = [];

    for (const item of items) {
      // First item or metadata objects without id or position are skipped
      if (!item || !item.id || !item.position) continue;

      const title = String(item.position).trim();
      if (!title) continue;

      const companyName = item.company ? String(item.company).trim() : undefined;
      const salaryMin = typeof item.salary_min === 'number' && item.salary_min > 0 ? Math.round(item.salary_min) : undefined;
      const salaryMax = typeof item.salary_max === 'number' && item.salary_max > 0 ? Math.round(item.salary_max) : undefined;
      const budget = salaryMin ?? salaryMax;

      let rawSalary: string | undefined;
      if (salaryMin !== undefined && salaryMax !== undefined) {
        rawSalary = `$${salaryMin} - $${salaryMax} / year`;
      } else if (salaryMin !== undefined) {
        rawSalary = `from $${salaryMin} / year`;
      } else if (salaryMax !== undefined) {
        rawSalary = `up to $${salaryMax} / year`;
      }

      const tags = Array.isArray(item.tags)
        ? item.tags.map((t) => String(t).trim()).filter(Boolean)
        : [];

      // Format description and text
      const sections: string[] = [];
      if (companyName) sections.push(`Company: ${companyName}`);
      if (item.location) sections.push(`Location: ${item.location}`);
      if (rawSalary) sections.push(`Salary: ${rawSalary}`);
      if (tags.length) sections.push(`Tags: ${tags.join(', ')}`);
      if (item.description) {
        sections.push(stripHtml(item.description).trim());
      }

      const rawText = sections.length ? `${title}\n\n${sections.join('\n\n')}` : title;
      const text = rawText;

      const itemUrl =
        item.url ||
        (item.slug ? `https://remoteok.com/remote-jobs/${item.slug}` : `https://remoteok.com/remote-jobs/${item.id}`);

      // Parse publication date
      let publishedAt: string | undefined = item.date;
      if (!publishedAt && item.epoch) {
        const epochMs = Number(item.epoch) * 1000;
        if (Number.isFinite(epochMs)) {
          publishedAt = new Date(epochMs).toISOString();
        }
      }

      const safeRaw: Record<string, unknown> = {
        slug: item.slug,
        salary_min: item.salary_min,
        salary_max: item.salary_max,
        original: item.original,
        apply_url: item.apply_url,
        location: item.location,
      };

      leads.push({
        sourceId: source.id,
        type: 'job',
        externalId: `remoteok:${item.id}`,
        url: itemUrl,
        title,
        text,
        author: companyName,
        city: item.location?.toLowerCase().includes('worldwide') ? 'Онлайн' : (item.location || 'Онлайн'),
        budget,
        currency: 'USD',
        paymentPeriod: 'monthly',
        rawSalary,
        normalizedUsdMin: salaryMin,
        normalizedUsdMax: salaryMax,
        category: 'Информационные технологии',
        skills: tags.length ? tags : undefined,
        isRemote: true,
        publishedAt,
        raw: safeRaw,
      });

      if (leads.length >= limit) break;
    }

    return leads;
  },
};
