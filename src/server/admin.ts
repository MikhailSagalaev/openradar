import type { AdminStats, AdminUsersData } from '../core/store.ts';
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
  <div class="admin-links"><a class="btn ghost" href="/admin">${isEn ? 'Back to dashboard' : 'Назад в админку'}</a></div>
</section>`;

  return layout({ title: isEn ? 'Service Users' : 'Пользователи сервиса', version: data.version, body, auth: data.auth, lang });
}

export interface AdminUsersPageData extends AdminUsersData {
  version: string;
  auth?: AuthDisplay;
  lang?: SupportedLang;
}
