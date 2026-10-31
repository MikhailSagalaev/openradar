import type { SourceRecord } from '../core/types.ts';
import { checkRobots, type RobotsVerdict } from '../net/robots.ts';
import type { SourceRegistry } from '../sources/index.ts';

/**
 * The robots.txt log of a node's sources: for each source, the address it polls and what that
 * site's robots.txt says about our crawler. The rule for adapters: a site's protection is not
 * worked round. A source that robots.txt disallows is set aside, not tricked.
 */
export interface SourceRobots {
  source: Pick<SourceRecord, 'id' | 'kind' | 'title' | 'enabled'>;
  access?: string;
  /** The address the adapter polls; undefined when the source is not fetched over HTTP. */
  url?: string;
  /** Why there is no address: Telegram account (MTProto), incoming webhook, several company boards. */
  note?: string;
  robots?: RobotsVerdict;
}

/** The address a source polls, or why it has none. */
export function pollUrlOf(source: Pick<SourceRecord, 'kind' | 'config'>): { url?: string; note?: string } {
  const url = typeof source.config.url === 'string' && /^https?:\/\//.test(source.config.url) ? source.config.url : undefined;
  if (url) return { url };
  const channel = typeof source.config.channel === 'string' ? source.config.channel.replace(/^@/, '').trim() : '';
  if (source.kind === 'telegram' && channel) return { url: `https://t.me/s/${channel}` };
  if (source.kind === 'kwork') return { url: 'https://kwork.ru/projects' };
  if (source.kind === 'telegram-account') return { note: 'Telegram-аккаунт (MTProto): не HTTP, robots.txt не применяется' };
  if (source.kind === 'webhook') return { note: 'входящий вебхук: данные присылают нам' };
  if (source.kind === 'ats') return { note: 'публичные API карьерных страниц компаний (Greenhouse, Ashby, Lever)' };
  return { note: 'адрес задаёт адаптер' };
}

export async function auditSourceRobots(
  sources: SourceRecord[],
  registry: Pick<SourceRegistry, 'get'>,
  userAgent: string,
  fetchImpl?: typeof fetch,
): Promise<SourceRobots[]> {
  const out: SourceRobots[] = [];
  for (const source of sources) {
    const { url, note } = pollUrlOf(source);
    const item: SourceRobots = {
      source: { id: source.id, kind: source.kind, title: source.title, enabled: source.enabled },
      access: registry.get(source.kind)?.access,
      url,
      note,
    };
    if (url) item.robots = await checkRobots(url, userAgent, fetchImpl);
    out.push(item);
  }
  return out;
}

/** The last daily audit of this process, for the source pages; empty until the first run. */
let lastAudit: { at: string; items: Map<string, SourceRobots> } | undefined;
const AUDIT_INTERVAL_MS = 24 * 3600_000;

/** Runs the audit when the last one is a day old; the runner calls it from its hourly maintenance. */
export async function auditSourceRobotsIfDue(
  sources: SourceRecord[],
  registry: Pick<SourceRegistry, 'get'>,
  userAgent: string,
  fetchImpl?: typeof fetch,
  now: Date = new Date(),
): Promise<SourceRobots[] | undefined> {
  if (lastAudit && now.getTime() - Date.parse(lastAudit.at) < AUDIT_INTERVAL_MS) return undefined;
  const items = await auditSourceRobots(sources, registry, userAgent, fetchImpl);
  lastAudit = { at: now.toISOString(), items: new Map(items.map((item) => [item.source.id, item])) };
  return items;
}

/** What the last audit found for one source, and when. */
export function robotsFor(sourceId: string): { at: string; item: SourceRobots } | undefined {
  const item = lastAudit?.items.get(sourceId);
  return item && lastAudit ? { at: lastAudit.at, item } : undefined;
}

const VERDICT_RU: Record<RobotsVerdict['verdict'], string> = {
  allowed: 'разрешено',
  disallowed: '**запрещено**',
  unknown: 'не удалось проверить',
};

/** The log as Markdown, for docs/SOURCES_ROBOTS.md. */
export function robotsMarkdown(items: SourceRobots[], checkedAt: Date, userAgent: string): string {
  const rows = items.map((item) => {
    const where = item.url ? `\`${item.url.replace(/\|/g, '%7C')}\`` : item.note ?? '—';
    const verdict = item.robots
      ? `${VERDICT_RU[item.robots.verdict]}${item.robots.rule ? ` (\`${item.robots.rule}\`)` : ''}${item.robots.reason ? ` — ${item.robots.reason}` : ''}`
      : 'не применяется';
    return `| ${item.source.title.replace(/\|/g, '/')} | ${item.source.kind} | ${item.access ?? '—'} | ${item.source.enabled ? 'да' : 'нет'} | ${where} | ${verdict} |`;
  });
  const disallowed = items.filter((item) => item.robots?.verdict === 'disallowed');
  return [
    '# Источники и robots.txt',
    '',
    `Проверено ${checkedAt.toISOString().slice(0, 10)} командой \`radar robots --markdown\` с User-Agent \`${userAgent}\` (RFC 9309).`,
    '',
    'Правило: защиту сайтов не обходим. Если robots.txt запрещает адрес, который опрашивает источник,',
    'источник откладывают или переводят на разрешённый адрес (официальный API, RSS). Решение по каждому',
    'такому источнику записывается ниже.',
    '',
    '| Источник | Тип | Доступ | Включён | Адрес | robots.txt |',
    '| --- | --- | --- | --- | --- | --- |',
    ...rows,
    '',
    '## Решения',
    '',
    disallowed.length
      ? disallowed.map((item) => `- **${item.source.title}** — robots.txt запрещает \`${item.robots?.rule ?? ''}\`. Решение: _ждёт решения оператора_.`).join('\n')
      : '- Запретов нет.',
    '',
  ].join('\n');
}
