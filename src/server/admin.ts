import type { AdminStats, AdminUsersData, AgentUsageStats } from '../core/store.ts';
import { escapeHtml } from '../core/text.ts';
import type { SourceHealth, Stats } from '../core/types.ts';
import type { ServiceCheck } from '../core/services.ts';
import type { AnalyticsConfig } from './analytics.ts';
import { type SupportedLang, translateSourceTitle } from './i18n.ts';
import { type AuthDisplay, layout } from './ui.ts';

export interface AdminPageData {
  version: string;
  auth?: AuthDisplay;
  lang?: SupportedLang;
  stats: Stats;
  admin: AdminStats;
  health: SourceHealth[];
  analytics: AnalyticsConfig;
  services?: ServiceCheck[];
}

const number = (value: number, lang: SupportedLang = 'ru'): string =>
  new Intl.NumberFormat(lang === 'en' ? 'en-US' : 'ru-RU').format(value);

/** Operator dashboard: volume by day, sources, people, links to the analytics consoles. */
export type AdminTab = 'overview' | 'users' | 'analytics' | 'decisions' | 'labels' | 'sources';

export function renderAdminTabs(active: AdminTab, isEn: boolean): string {
  const tabs = [
    { key: 'overview', href: '/admin', label: isEn ? 'Overview' : 'Обзор' },
    { key: 'users', href: '/admin/users', label: isEn ? 'Users' : 'Пользователи' },
    { key: 'analytics', href: '/admin/analytics', label: isEn ? 'Agent analytics' : 'Аналитика агентов' },
    { key: 'decisions', href: '/admin/decisions', label: isEn ? 'Decisions' : 'Решения модели' },
    { key: 'labels', href: '/admin/labels', label: isEn ? 'Labels' : 'Ручная разметка' },
    { key: 'sources', href: '/sources/quality', label: isEn ? 'Source Quality' : 'Качество источников' },
  ];
  return `<nav class="type-tabs admin-nav" aria-label="${isEn ? 'Admin navigation' : 'Навигация админки'}">${tabs
    .map((t) => `<a class="type-tab${active === t.key ? ' active' : ''}" href="${t.href}">${escapeHtml(t.label)}</a>`)
    .join('')}</nav>`;
}

export function renderAdminPage(data: AdminPageData): string {
  const { stats, admin, health, analytics } = data;
  const lang = data.lang ?? 'ru';
  const isEn = lang === 'en';
  const errors = new Map(health.map((item) => [item.source.id, item.lastRun?.error]));
  const week = admin.days.slice(-7);
  const week7 = week.reduce((sum, d) => sum + d.gigs + d.jobs, 0);

  const tiles: Array<[string, string, string?]> = isEn
    ? [
        ['New in 24h', number(stats.last24h, lang)],
        ['Last 7 days', number(week7, lang), `${number(Math.round(week7 / 7), lang)} per day`],
        ['Total leads', number(stats.leads, lang), `${number(stats.rejectedLeads, lang)} rejected`],
        ['Users', number(admin.users, lang), `+${number(admin.usersNew7d, lang)} this week`],
        ['Votes', number(admin.votes, lang), `+${number(admin.votes7d, lang)} this week`],
        ['Network peers', number(admin.participants, lang), `${number(admin.observations7d, lang)} observations this week`],
      ]
    : [
        ['Новых за сутки', number(stats.last24h, lang)],
        ['За 7 дней', number(week7, lang), `${number(Math.round(week7 / 7), lang)} в день`],
        ['Всего заказов', number(stats.leads, lang), `${number(stats.rejectedLeads, lang)} отклонено`],
        ['Пользователи', number(admin.users, lang), `+${number(admin.usersNew7d, lang)} за неделю`],
        ['Голоса', number(admin.votes, lang), `+${number(admin.votes7d, lang)} за неделю`],
        ['Участники сети', number(admin.participants, lang), `${number(admin.observations7d, lang)} наблюдений за неделю`],
      ];

  const peak = Math.max(1, ...admin.days.map((d) => d.gigs + d.jobs + d.rejected));
  const bars = admin.days
    .map((d) => {
      const pct = (value: number): string => `${((value / peak) * 100).toFixed(1)}%`;
      const label = isEn
        ? `${d.day}: gigs ${d.gigs}, jobs ${d.jobs}, rejected ${d.rejected}`
        : `${d.day}: заказы ${d.gigs}, вакансии ${d.jobs}, отклонено ${d.rejected}`;
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
      const displayTitle = translateSourceTitle(s.title, lang);
      return `<tr>
        <td><a href="/sources/${escapeHtml(s.sourceId)}">${escapeHtml(displayTitle)}</a></td>
        <td class="num">${number(s.inserted7d, lang)}</td>
        <td class="num muted">${number(s.rejected7d, lang)}</td>
        <td class="small">${!s.enabled ? `<span class="muted">${isEn ? 'disabled' : 'выключен'}</span>` : error ? `<span class="text-warn">${escapeHtml(error.slice(0, 90))}</span>` : `<span class="muted">${isEn ? 'healthy' : 'в порядке'}</span>`}</td>
      </tr>`;
    })
    .join('');

  const servicesRows = (data.services ?? [])
    .map((s) => {
      const isOk = s.status === 'ok';
      const isErr = s.status === 'error';
      const badgeStyle = isOk
        ? 'background:#e6f4ea;color:#137333;'
        : isErr
        ? 'background:#fce8e6;color:#c5221f;'
        : 'background:#fef7e0;color:#b06000;';
      const badgeText = isEn
        ? (isOk ? 'healthy' : isErr ? 'needs attention' : 'degraded')
        : (isOk ? 'в порядке' : isErr ? 'требует внимания' : 'деградация');
      const okNote = isEn ? 'Requests succeeding normally' : 'Запросы выполняются успешно';
      return `<tr>
        <td><strong>${escapeHtml(s.label)}</strong> <span class="muted small">(${escapeHtml(s.name)})</span></td>
        <td><span style="${badgeStyle}font-weight:600;padding:2px 8px;border-radius:4px;font-size:12px;">${badgeText}</span></td>
        <td class="small muted">${s.lastChecked ? escapeHtml(s.lastChecked.replace('T', ' ').slice(0, 19)) : '—'}</td>
        <td class="small ${isErr ? 'text-warn' : 'muted'}">${s.error ? escapeHtml(s.error) : isOk ? okNote : '—'}</td>
      </tr>`;
    })
    .join('');

  const consoles = [
    analytics.yandexMetrikaId ? [isEn ? 'Yandex Metrika' : 'Яндекс Метрика', `https://metrika.yandex.ru/dashboard?id=${analytics.yandexMetrikaId}`] : undefined,
    analytics.googleAnalyticsId ? ['Google Analytics', 'https://analytics.google.com/analytics/web/'] : undefined,
    analytics.googleSiteVerification ? ['Google Search Console', 'https://search.google.com/search-console'] : undefined,
    analytics.yandexVerification ? [isEn ? 'Yandex Webmaster' : 'Яндекс Вебмастер', 'https://webmaster.yandex.ru/sites/'] : undefined,
  ].filter((item): item is string[] => Boolean(item));

  const body = `<div class="page-head"><div><h1>${isEn ? 'Admin Dashboard' : 'Админка'}</h1>
  <p class="muted small">${isEn ? 'Hub summary. Traffic analytics are in external consoles.' : 'Сводка по хабу. Посещаемость — в системах аналитики.'}</p></div></div>
${renderAdminTabs('overview', isEn)}
<div class="admin-tiles">
  ${tiles.map(([label, value, hint]) => `<div class="admin-tile"><div class="admin-tile-label">${escapeHtml(label)}</div><div class="admin-tile-value">${value}</div>${hint ? `<div class="admin-tile-hint">${escapeHtml(hint)}</div>` : ''}</div>`).join('')}
</div>
<section class="admin-section">
  <h2>${isEn ? `Leads by day, ${admin.days.length} days` : `Заказы по дням, ${admin.days.length} дней`}</h2>
  <div class="admin-legend"><span class="seg gigs"></span>${isEn ? 'gigs' : 'заказы'} <span class="seg jobs"></span>${isEn ? 'jobs' : 'вакансии'} <span class="seg rejected"></span>${isEn ? 'rejected' : 'отклонено'}</div>
  <div class="admin-chart">${bars}</div>
</section>
<section class="admin-section">
  <h2>${isEn ? 'Sources over 7 days' : 'Источники за 7 дней'}</h2>
  <table class="admin-table"><thead><tr><th>${isEn ? 'Source' : 'Источник'}</th><th class="num">${isEn ? 'New' : 'Новых'}</th><th class="num">${isEn ? 'Rejected' : 'Отклонено'}</th><th>${isEn ? 'Status' : 'Состояние'}</th></tr></thead>
  <tbody>${sourceRows}</tbody></table>
</section>
${servicesRows ? `<section class="admin-section">
  <h2>${isEn ? 'External Services & APIs' : 'Внешние сервисы и API'}</h2>
  <table class="admin-table"><thead><tr><th>${isEn ? 'Service' : 'Сервис'}</th><th>${isEn ? 'Status' : 'Состояние'}</th><th>${isEn ? 'Last checked' : 'Последний опрос'}</th><th>${isEn ? 'Details' : 'Детали'}</th></tr></thead>
  <tbody>${servicesRows}</tbody></table>
</section>` : ''}
<section class="admin-section">
  <h2>${isEn ? 'Links' : 'Ссылки'}</h2>
  <div class="admin-links">
    <a class="btn ghost" href="/admin/users">${isEn ? 'Users' : 'Пользователи'}</a>
    <a class="btn ghost" href="/admin/decisions">${isEn ? 'Decisions' : 'Решения модели'}</a>
    <a class="btn ghost" href="/admin/labels">${isEn ? 'Labels' : 'Ручная разметка'}</a>
    <a class="btn ghost" href="/sources/quality">${isEn ? 'Source quality' : 'Качество источников'}</a>
    <a class="btn ghost" href="/sources">${isEn ? 'Sources' : 'Источники'}</a>
    <a class="btn ghost" href="/?status=rejected">${isEn ? 'Rejected leads' : 'Отклонённые заказы'}</a>
    <a class="btn ghost" href="/api/runs?limit=50">${isEn ? 'Poll log (JSON)' : 'Журнал опросов (JSON)'}</a>
    ${consoles.map(([name, href]) => `<a class="btn ghost" href="${escapeHtml(href!)}" target="_blank" rel="noopener noreferrer">${escapeHtml(name!)} ↗</a>`).join('')}
  </div>
</section>`;

  return layout({ title: isEn ? 'Admin' : 'Админка', version: data.version, body, auth: data.auth, lang });
}

/** Operator view of the people on the service: sign-ups, their actions, and the delivery consumers. */
export function renderAdminUsersPage(data: AdminUsersPageData): string {
  const { totals, users, subscriptions } = data;
  const lang = data.lang ?? 'ru';
  const isEn = lang === 'en';

  const tiles: Array<[string, string, string?]> = isEn
    ? [
        ['Users', number(totals.users, lang)],
        ['New in 30 days', number(totals.new30d, lang)],
        ['Active sessions', number(totals.sessions, lang)],
        ['Reviewers', number(totals.reviewers, lang)],
        ['Voters', number(totals.voters, lang)],
        ['Deliveries, 7 days', number(totals.deliveries7d, lang)],
      ]
    : [
        ['Пользователи', number(totals.users, lang)],
        ['Новые за 30 дней', number(totals.new30d, lang)],
        ['Активные сессии', number(totals.sessions, lang)],
        ['Ревьюеры', number(totals.reviewers, lang)],
        ['Голосовавшие', number(totals.voters, lang)],
        ['Доставки, 7 дней', number(totals.deliveries7d, lang)],
      ];

  const userRows = users
    .map((u) => {
      const active = u.votes + u.reviews + u.labels;
      return `<tr>
        <td><strong>${escapeHtml(u.handle)}</strong></td>
        <td class="small muted">${escapeHtml(u.role)}</td>
        <td class="num">${u.reputation === null ? '—' : number(u.reputation, lang)}</td>
        <td class="small muted">${u.createdAt ? escapeHtml(u.createdAt.slice(0, 10)) : '—'}</td>
        <td class="num">${number(u.votes, lang)}</td>
        <td class="num">${number(u.reviews, lang)}</td>
        <td class="num">${number(u.labels, lang)}</td>
        <td>${u.banned ? `<span class="text-warn">${isEn ? 'banned' : 'забанен'}</span>` : active > 0 ? `<span class="muted">${isEn ? 'active' : 'активен'}</span>` : `<span class="muted">${isEn ? '—' : '—'}</span>`}</td>
      </tr>`;
    })
    .join('');

  const subRows = subscriptions
    .map((s) => {
      const last = s.lastSentAt ? s.lastSentAt.replace('T', ' ').slice(0, 16) : isEn ? 'never' : 'ещё не отправлялась';
      return `<tr>
        <td><strong>${escapeHtml(s.name)}</strong> <span class="muted small">${escapeHtml(s.id.slice(0, 8))}</span></td>
        <td class="small">${escapeHtml(s.channel)}</td>
        <td>${s.paused ? `<span class="text-warn">${isEn ? 'paused' : 'на паузе'}</span>` : `<span class="muted">${isEn ? 'running' : 'работает'}</span>`}</td>
        <td class="small muted">${escapeHtml(last)}</td>
      </tr>`;
    })
    .join('');

  const body = `<div class="page-head"><div><h1>${isEn ? 'Service Users' : 'Пользователи сервиса'}</h1>
  <p class="muted small">${isEn ? 'Sign-ups, their activity, and the delivery consumers. Full detail in the database.' : 'Регистрации, их активность и потребители доставок. Полные данные — в базе.'}</p></div></div>
${renderAdminTabs('users', isEn)}
<div class="admin-tiles">
  ${tiles.map(([label, value, hint]) => `<div class="admin-tile"><div class="admin-tile-label">${escapeHtml(label)}</div><div class="admin-tile-value">${value}</div>${hint ? `<div class="admin-tile-hint">${escapeHtml(hint)}</div>` : ''}</div>`).join('')}
</div>
<section class="admin-section">
  <h2>${isEn ? 'Latest sign-ups (up to 100)' : 'Последние регистрации (до 100)'}</h2>
  <table class="admin-table"><thead><tr>
    <th>${isEn ? 'Handle' : 'Хендл'}</th><th>${isEn ? 'Role' : 'Роль'}</th><th class="num">${isEn ? 'Reputation' : 'Репутация'}</th><th>${isEn ? 'Joined' : 'Регистрация'}</th>
    <th class="num">${isEn ? 'Votes' : 'Голоса'}</th><th class="num">${isEn ? 'Reviews' : 'Ревью'}</th><th class="num">${isEn ? 'Labels' : 'Метки'}</th><th>${isEn ? 'Status' : 'Статус'}</th>
  </tr></thead><tbody>${userRows}</tbody></table>
</section>
<section class="admin-section">
  <h2>${isEn ? 'Delivery consumers (subscriptions)' : 'Потребители доставок (подписки)'}</h2>
  <table class="admin-table"><thead><tr><th>${isEn ? 'Name' : 'Название'}</th><th>${isEn ? 'Channel' : 'Канал'}</th><th>${isEn ? 'State' : 'Состояние'}</th><th>${isEn ? 'Last delivery' : 'Последняя доставка'}</th></tr></thead>
  <tbody>${subRows}</tbody></table>
</section>
<section class="admin-section">
  <div class="admin-links">
    <a class="btn ghost" href="/admin">${isEn ? 'Overview' : 'Обзор админки'}</a>
    <a class="btn ghost" href="/admin/decisions">${isEn ? 'Decisions' : 'Решения модели'}</a>
    <a class="btn ghost" href="/admin/labels">${isEn ? 'Labels' : 'Ручная разметка'}</a>
    <a class="btn ghost" href="/sources/quality">${isEn ? 'Source quality' : 'Качество источников'}</a>
  </div>
</section>`;

  return layout({ title: isEn ? 'Service Users' : 'Пользователи сервиса', version: data.version, body, auth: data.auth, lang });
}

export interface AdminUsersPageData extends AdminUsersData {
  version: string;
  auth?: AuthDisplay;
  lang?: SupportedLang;
}

/** Agent analytics (/admin/analytics): aggregated counters, no per-call rows exist. */
export function renderAdminAnalyticsPage(data: AdminAnalyticsPageData): string {
  const { days, details, tokens, via, clients } = data;
  const lang = data.lang ?? 'ru';
  const isEn = lang === 'en';
  const last7 = days.slice(-7);
  const sum = (pick: (d: AgentUsageStats['days'][number]) => number) => last7.reduce((acc, d) => acc + pick(d), 0);
  const tokensToday = tokens.at(-1)?.active ?? 0;
  const tokens7 = tokens.filter((t) => t.active > 0 && last7.some((d) => d.day === t.day)).length;

  const tiles: Array<[string, string]> = isEn
    ? [
        ['API calls, 7 days', number(sum((d) => d.api), lang)],
        ['MCP calls, 7 days', number(sum((d) => d.mcp), lang)],
        ['Research files, 7 days', number(sum((d) => d.research), lang)],
        ['Active agent tokens today', number(tokensToday, lang)],
        ['Days with tokens, 7 days', `${number(tokens7, lang)} / 7`],
      ]
    : [
        ['Вызовы API, 7 дней', number(sum((d) => d.api), lang)],
        ['Вызовы MCP, 7 дней', number(sum((d) => d.mcp), lang)],
        ['Research-файлы, 7 дней', number(sum((d) => d.research), lang)],
        ['Активные токены агентов сегодня', number(tokensToday, lang)],
        ['Дни с токенами, 7 дней', `${number(tokens7, lang)} / 7`],
      ];

  const maxTotal = Math.max(1, ...days.map((d) => d.api + d.mcp + d.research));
  const dayRows = days
    .map((d) => {
      const total = d.api + d.mcp + d.research;
      const pct = Math.round((total / maxTotal) * 100);
      const bar = `<span aria-hidden="true" style="display:inline-block;width:120px;height:8px;background:rgba(127,127,127,.2);border-radius:4px;vertical-align:middle;overflow:hidden"><span style="display:block;height:8px;max-width:100%;width:${pct}%;background:#2dd4bf;border-radius:4px"></span></span>`;
      return `<tr>
        <td class="small muted">${escapeHtml(d.day)}</td>
        <td class="num">${number(d.api, lang)}</td>
        <td class="num">${number(d.mcp, lang)}</td>
        <td class="num">${number(d.research, lang)}</td>
        <td class="num">${number(tokens.find((t) => t.day === d.day)?.active ?? 0, lang)}</td>
        <td>${bar}</td>
      </tr>`;
    })
    .join('');

  const detailRows = details
    .map((d) => `<tr><td><span class="muted small">${escapeHtml(d.surface)}</span> <strong>${escapeHtml(d.detail)}</strong></td><td class="num">${number(d.calls, lang)}</td></tr>`)
    .join('');
  const viaRows = via
    .map((v) => `<tr><td><strong>${escapeHtml(v.via === 'direct' ? (isEn ? 'direct / no label' : 'напрямую / без метки') : v.via)}</strong></td><td class="num">${number(v.calls, lang)}</td></tr>`)
    .join('');
  const clientRows = clients
    .map((v) => `<tr><td><strong>${escapeHtml(v.client)}</strong></td><td class="num">${number(v.calls, lang)}</td></tr>`)
    .join('');

  const empty = isEn
    ? 'No counted calls yet. Counters start with the next API, MCP or research-file request after this release.'
    : 'Посчитанных вызовов ещё нет. Счётчики начнут заполняться с первым запросом API, MCP или research-файла после этого релиза.';

  const body = `<div class="page-head"><div><h1>${isEn ? 'Agent Analytics' : 'Аналитика агентов'}</h1>
  <p class="muted small">${isEn
    ? 'Aggregated daily counters over the API, MCP and research surfaces. No per-call rows: a day × route × tier × client-class × via-label cell holds one number. Guest GETs served by the edge cache are not counted.'
    : 'Агрегированные дневные счётчики по поверхностям API, MCP и research. Почасовых строк нет: одна цифра на ячейку день × маршрут × уровень × класс клиента × метка источника. Гостевые GET из edge-кэша не считаются.'}</p></div></div>
${renderAdminTabs('analytics', isEn)}
<div class="admin-tiles">
  ${tiles.map(([label, value]) => `<div class="admin-tile"><div class="admin-tile-label">${escapeHtml(label)}</div><div class="admin-tile-value">${value}</div></div>`).join('')}
</div>
<div class="admin-grid">
  <section class="card">
    <h2>${isEn ? 'By day (last 14)' : 'По дням (14 дней)'}</h2>
    <table>
      <thead><tr><th>${isEn ? 'Day' : 'День'}</th><th>API</th><th>MCP</th><th>Research</th><th>${isEn ? 'Tokens' : 'Токены'}</th><th></th></tr></thead>
      <tbody>${dayRows || `<tr><td colspan="6" class="muted">${empty}</td></tr>`}</tbody>
    </table>
  </section>
  <section class="card">
    <h2>${isEn ? 'Top routes and tools' : 'Топ маршрутов и инструментов'}</h2>
    <table><tbody>${detailRows || `<tr><td class="muted">${empty}</td></tr>`}</tbody></table>
    <h2>${isEn ? 'Client classes' : 'Классы клиентов'}</h2>
    <table><tbody>${clientRows || `<tr><td class="muted">—</td></tr>`}</tbody></table>
    <h2>${isEn ? 'Where they came from' : 'Откуда пришли'}</h2>
    <table><tbody>${viaRows || `<tr><td class="muted">—</td></tr>`}</tbody></table>
  </section>
</div>
<p class="muted small">${isEn ? 'Attribution: distribution links carry a whitelisted ?via= label; an absent or unknown label counts as direct.' : 'Атрибуция: ссылки дистрибуции несут метку ?via= из белого списка; без метки или с неизвестной — считается «напрямую».'}</p>`;

  return layout({ title: isEn ? 'Agent Analytics' : 'Аналитика агентов', version: data.version, body, auth: data.auth, lang });
}

export interface AdminAnalyticsPageData extends AgentUsageStats {
  version: string;
  auth?: AuthDisplay;
  lang?: SupportedLang;
}
