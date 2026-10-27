import type { AdminStats } from '../core/store.ts';
import { escapeHtml } from '../core/text.ts';
import type { SourceHealth, Stats } from '../core/types.ts';
import type { AnalyticsConfig } from './analytics.ts';
import type { SupportedLang } from './i18n.ts';
import { type AuthDisplay, layout } from './ui.ts';

export interface AdminPageData {
  version: string;
  auth?: AuthDisplay;
  lang?: SupportedLang;
  stats: Stats;
  admin: AdminStats;
  health: SourceHealth[];
  analytics: AnalyticsConfig;
}

const number = (value: number): string => new Intl.NumberFormat('ru-RU').format(value);

/** Operator dashboard: volume by day, sources, people, links to the analytics consoles. */
export function renderAdminPage(data: AdminPageData): string {
  const { stats, admin, health, analytics } = data;
  const lang = data.lang ?? 'ru';
  const errors = new Map(health.map((item) => [item.source.id, item.lastRun?.error]));
  const week = admin.days.slice(-7);
  const week7 = week.reduce((sum, d) => sum + d.gigs + d.jobs, 0);

  const tiles: Array<[string, string, string?]> = [
    ['Новых за сутки', number(stats.last24h)],
    ['За 7 дней', number(week7), `${number(Math.round(week7 / 7))} в день`],
    ['Всего заказов', number(stats.leads), `${number(stats.rejectedLeads)} отклонено`],
    ['Пользователи', number(admin.users), `+${number(admin.usersNew7d)} за неделю`],
    ['Голоса', number(admin.votes), `+${number(admin.votes7d)} за неделю`],
    ['Участники сети', number(admin.participants), `${number(admin.observations7d)} наблюдений за неделю`],
  ];

  const peak = Math.max(1, ...admin.days.map((d) => d.gigs + d.jobs + d.rejected));
  const bars = admin.days
    .map((d) => {
      const pct = (value: number): string => `${((value / peak) * 100).toFixed(1)}%`;
      const label = `${d.day}: заказы ${d.gigs}, вакансии ${d.jobs}, отклонено ${d.rejected}`;
      return `<div class="admin-bar" title="${escapeHtml(label)}">
        <div class="admin-bar-stack">
          <span class="seg rejected" style="height:${pct(d.rejected)}"></span>
          <span class="seg jobs" style="height:${pct(d.jobs)}"></span>
          <span class="seg gigs" style="height:${pct(d.gigs)}"></span>
        </div>
        <span class="admin-bar-day">${escapeHtml(d.day.slice(8, 10))}</span>
      </div>`;
    })
    .join('');

  const sourceRows = admin.sources
    .map((s) => {
      const error = errors.get(s.sourceId);
      return `<tr>
        <td><a href="/sources/${escapeHtml(s.sourceId)}">${escapeHtml(s.title)}</a></td>
        <td class="num">${number(s.inserted7d)}</td>
        <td class="num muted">${number(s.rejected7d)}</td>
        <td class="small">${!s.enabled ? '<span class="muted">выключен</span>' : error ? `<span class="text-warn">${escapeHtml(error.slice(0, 90))}</span>` : '<span class="muted">в порядке</span>'}</td>
      </tr>`;
    })
    .join('');

  const consoles = [
    analytics.yandexMetrikaId ? ['Яндекс Метрика', `https://metrika.yandex.ru/dashboard?id=${analytics.yandexMetrikaId}`] : undefined,
    analytics.googleAnalyticsId ? ['Google Analytics', 'https://analytics.google.com/analytics/web/'] : undefined,
    analytics.googleSiteVerification ? ['Google Search Console', 'https://search.google.com/search-console'] : undefined,
    analytics.yandexVerification ? ['Яндекс Вебмастер', 'https://webmaster.yandex.ru/sites/'] : undefined,
  ].filter((item): item is string[] => Boolean(item));

  const body = `
<div class="page-head"><div><h1>Админка</h1>
  <p class="muted small">Сводка по хабу. Посещаемость — в системах аналитики.</p></div></div>
<div class="admin-tiles">
  ${tiles.map(([label, value, hint]) => `<div class="admin-tile"><div class="admin-tile-label">${escapeHtml(label)}</div><div class="admin-tile-value">${value}</div>${hint ? `<div class="admin-tile-hint">${escapeHtml(hint)}</div>` : ''}</div>`).join('')}
</div>
<section class="admin-section">
  <h2>Заказы по дням, ${admin.days.length} дней</h2>
  <div class="admin-legend"><span class="seg gigs"></span>заказы <span class="seg jobs"></span>вакансии <span class="seg rejected"></span>отклонено</div>
  <div class="admin-chart">${bars}</div>
</section>
<section class="admin-section">
  <h2>Источники за 7 дней</h2>
  <table class="admin-table"><thead><tr><th>Источник</th><th class="num">Новых</th><th class="num">Отклонено</th><th>Состояние</th></tr></thead>
  <tbody>${sourceRows}</tbody></table>
</section>
<section class="admin-section">
  <h2>Ссылки</h2>
  <div class="admin-links">
    <a class="btn ghost" href="/sources">Источники</a>
    <a class="btn ghost" href="/?status=rejected">Отклонённые заказы</a>
    <a class="btn ghost" href="/api/runs?limit=50">Журнал опросов (JSON)</a>
    ${consoles.map(([name, href]) => `<a class="btn ghost" href="${escapeHtml(href!)}" target="_blank" rel="noopener noreferrer">${escapeHtml(name!)} ↗</a>`).join('')}
  </div>
</section>`;

  return layout({ title: 'Админка', version: data.version, body, auth: data.auth, lang });
}
