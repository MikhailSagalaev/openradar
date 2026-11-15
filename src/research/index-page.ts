/**
 * The openradar index page: the daily flow of vacancies and orders against the base, a line
 * per series in plain SVG, panel board breakdown, weekday seasonality profile, roles with an
 * index of their own, and how to cite it.
 */
import { escapeHtml, jsonForScript } from '../core/text.ts';
import { layout, type AuthDisplay } from '../server/ui.ts';
import type { IndexPoint, IndexSeries, OpenradarIndex, PlatformIndex, WeekdayPoint } from './index.ts';

const num = (value: number): string => new Intl.NumberFormat('ru-RU').format(value).replace(/\u00a0/g, ' ');
const dm = (date: string): string => `${date.slice(8, 10)}.${date.slice(5, 7)}`;
const signed = (v: number): string => `${v > 0 ? '+' : v < 0 ? '−' : ''}${num(Math.abs(v))}%`;

/** A line of the index if there is one, else of the daily counts, with subtle daily volume bars. */
export function lineChart(points: IndexPoint[], label: string, lang: 'ru' | 'en' = 'ru'): string {
  const en = lang === 'en';
  const useIndex = points.some((p) => p.index !== undefined);
  const values = points.map((p) => (useIndex ? p.index : p.count)).map((v) => v ?? NaN);
  const real = values.filter((v) => Number.isFinite(v));
  if (real.length < 2) {
    return `<p class="muted small">${en ? 'The chart appears once there are two days of data.' : 'График появится, когда наберётся хотя бы два дня данных.'}</p>`;
  }
  const w = 640;
  const h = 190;
  const padL = 36;
  const padR = 28;
  const padY = 24;
  const min = Math.min(...real, useIndex ? 90 : Infinity) * 0.94;
  const max = Math.max(...real, useIndex ? 110 : -Infinity) * 1.06;
  const x = (i: number): number => padL + (i * (w - padL - padR)) / Math.max(1, points.length - 1);
  const y = (v: number): number => h - padY - ((v - min) * (h - 2 * padY)) / Math.max(1, max - min);

  // Subtle background bars for daily raw counts so weekday/weekend rhythm is visible
  const maxCount = Math.max(1, ...points.map((p) => p.count));
  const barW = Math.max(3, Math.min(14, Math.floor((w - padL - padR) / Math.max(points.length * 1.6, 8))));
  const bars = points
    .map((p, i) => {
      const bh = Math.max(2, ((p.count / maxCount) * (h - 2 * padY)) * 0.55);
      const bx = x(i) - barW / 2;
      const by = h - padY - bh;
      return `<rect x="${bx.toFixed(1)}" y="${by.toFixed(1)}" width="${barW}" height="${bh.toFixed(1)}" rx="1.5" fill="currentColor" opacity="0.08"><title>${p.date}: ${p.count}</title></rect>`;
    })
    .join('');

  const path = values
    .map((v, i) => (Number.isFinite(v) ? `${x(i).toFixed(1)},${y(v).toFixed(1)}` : ''))
    .filter(Boolean)
    .join(' ');

  const baseLine = useIndex
    ? `<line x1="${padL}" x2="${w - padR}" y1="${y(100).toFixed(1)}" y2="${y(100).toFixed(1)}" stroke="currentColor" stroke-opacity=".28" stroke-dasharray="4 4"/>` +
      `<text x="${padL - 6}" y="${(y(100) + 3).toFixed(1)}" font-size="10" text-anchor="end" fill="currentColor" opacity=".55">100</text>`
    : '';

  const lastIdx = points.length - 1;
  const lastVal = values[lastIdx];
  const lastDot =
    lastVal !== undefined && Number.isFinite(lastVal)
      ? `<circle cx="${x(lastIdx).toFixed(1)}" cy="${y(lastVal).toFixed(1)}" r="3.5" fill="var(--emerald)" />`
      : '';

  const ticks = [0, Math.floor((points.length - 1) / 2), points.length - 1]
    .filter((v, i, a) => a.indexOf(v) === i)
    .map((i) => `<text x="${x(i).toFixed(1)}" y="${h - 5}" font-size="11" text-anchor="middle" fill="currentColor" opacity=".6">${dm(points[i]!.date)}</text>`)
    .join('');

  return `<figure class="rs-chart" style="margin:12px 0 0">
<svg viewBox="0 0 ${w} ${h}" width="100%" role="img" aria-label="${escapeHtml(label)}" style="color:var(--ink);max-width:100%">
  ${bars}${baseLine}<polyline fill="none" stroke="var(--emerald)" stroke-width="2.5" stroke-linejoin="round" points="${path}"/>${lastDot}${ticks}
</svg>
<figcaption class="rs-legend">${useIndex
    ? (en
        ? 'Green line — index of the 7-day rolling mean (dashed line = base 100); background bars — daily raw post volume.'
        : 'Зелёная линия — индекс по скользящему среднему за 7 дней (пунктир — база 100); светлые столбцы на фоне — суточное число публикаций.')
    : (en ? 'Posts a day; the index appears after 7 days.' : 'Число публикаций в день; индекс появится, когда наберётся 7 дней.')}</figcaption>
</figure>`;
}

export function renderPlatformIndexTable(byPlatform: PlatformIndex[] | undefined, lang: 'ru' | 'en' = 'ru'): string {
  if (!byPlatform?.length) return '';
  const en = lang === 'en';
  const rows = byPlatform.filter((p) => p.latest !== undefined);
  if (!rows.length) return '';
  return `<section class="rs-section">
  <h2>${en ? 'By panel board' : 'По площадкам панели'}</h2>
  <p class="small muted">${en
    ? 'Each board of the fixed panel separately: current 7-day index, weekly dynamics, and daily publication flow.'
    : 'Динамика каждой площадки из постоянной панели отдельно: индекс к собственной базе, недельное изменение и среднесуточный поток.'}</p>
  <table class="table">
    <thead>
      <tr>
        <th>${en ? 'Board' : 'Площадка'}</th>
        <th>${en ? 'Stream' : 'Поток'}</th>
        <th>${en ? 'Index' : 'Индекс'}</th>
        <th>${en ? 'Week' : 'За неделю'}</th>
        <th>${en ? 'Daily (7d avg)' : 'В день (7 дн.)'}</th>
        <th>${en ? 'Base (per day)' : 'База (в день)'}</th>
      </tr>
    </thead>
    <tbody>
      ${rows
        .map((p) => {
          const typeLabel = p.type === 'job' ? (en ? 'Vacancies' : 'Вакансии') : (en ? 'Freelance' : 'Фриланс');
          const idx = p.latest?.index !== undefined ? num(p.latest.index) : '—';
          const wk = p.weekChange !== undefined ? signed(p.weekChange) : '—';
          const avg7 = p.latest?.avg7 !== undefined ? num(p.latest.avg7) : num(p.latest?.count ?? 0);
          return `<tr>
            <td><b>${escapeHtml(p.platform)}</b></td>
            <td class="muted">${typeLabel}</td>
            <td><b>${idx}</b></td>
            <td>${wk}</td>
            <td>${avg7}</td>
            <td>${num(p.base)}</td>
          </tr>`;
        })
        .join('')}
    </tbody>
  </table>
</section>`;
}

export function renderWeekdayProfileSection(weekdayProfile: WeekdayPoint[] | undefined, lang: 'ru' | 'en' = 'ru'): string {
  if (!weekdayProfile?.length) return '';
  const en = lang === 'en';
  return `<section class="rs-section">
  <h2>${en ? 'Weekday publication rhythm (Mon–Sun)' : 'Недельный профиль публикаций (Пн–Вс)'}</h2>
  <p class="small muted">${en
    ? 'Why the index uses a 7-day rolling mean: employer vacancies drop sharply on weekends, whereas freelance orders stay active all week.'
    : 'Почему индекс строится по 7-дневному окну: публикация вакансий работодателями падает в субботу и воскресенье в 4–6 раз, тогда как фриланс-заказы выходят всю неделю.'}</p>
  <table class="table">
    <thead>
      <tr>
        <th>${en ? 'Day of week' : 'День недели'}</th>
        <th>${en ? 'Vacancies / day' : 'Вакансий в день'}</th>
        <th>${en ? '% of weekly mean' : '% от средненедельного'}</th>
        <th>${en ? 'Freelance orders / day' : 'Заказов в день'}</th>
        <th>${en ? '% of weekly mean' : '% от средненедельного'}</th>
      </tr>
    </thead>
    <tbody>
      ${weekdayProfile
        .map(
          (w) => `<tr>
            <td><b>${escapeHtml(en ? w.labelEn : w.label)}</b></td>
            <td>${num(w.jobAvg)}</td>
            <td>${w.jobPctOfMean}%</td>
            <td>${num(w.gigAvg)}</td>
            <td>${w.gigPctOfMean}%</td>
          </tr>`,
        )
        .join('')}
    </tbody>
  </table>
</section>`;
}

function headline(s: IndexSeries, what: string): string {
  const latest = s.latest;
  if (latest?.index !== undefined) {
    return `<div class="rs-kpi"><b>${num(latest.index)}</b><span>${escapeHtml(what)}: индекс на ${dm(latest.date)}${s.weekChange !== undefined ? `, ${signed(s.weekChange)} за неделю` : ''}</span></div>`;
  }
  return `<div class="rs-kpi"><b>${num(latest?.count ?? 0)}</b><span>${escapeHtml(what)} за ${latest ? dm(latest.date) : '—'}; индекс — через 7 дней данных</span></div>`;
}

export function renderIndexPage(options: { index: OpenradarIndex; baseUrl: string; version: string; auth?: AuthDisplay }): string {
  const { index, baseUrl, version } = options;
  const { jobs, itJobs, gigs, base } = index;
  const baseNote = base.provisional
    ? `База пока предварительная: среднее за все дни с ${dm(index.jobs.points[0]?.date ?? base.from)} (${base.days} дн.). Окончательная база — 9 ноября — 6 декабря 2026 года, она зафиксируется 7 декабря, и значения пересчитаются.`
    : `База — среднее число публикаций в день за 9 ноября — 6 декабря 2026 года (${base.days} дн.) = 100.`;
  const latest = jobs.latest;
  const quote = latest?.index !== undefined
    ? `По данным openradar, индекс вакансий на ${dm(latest.date)} — ${num(latest.index)}${itJobs?.latest?.index !== undefined ? ` (в IT-направлениях — ${num(itJobs.latest.index)})` : ''} (база: 9 ноября — 6 декабря 2026 = 100${base.provisional ? ', предварительно' : ''}).`
    : '';
  const roles = index.roles.filter((r) => r.latest?.index !== undefined);
  const dataset = {
    '@context': 'https://schema.org',
    '@type': 'Dataset',
    name: 'Индекс openradar',
    description: 'Ежедневный индекс числа новых вакансий и заказов в русскоязычном IT и фрилансе на постоянной панели площадок.',
    url: `${baseUrl}/research/index`,
    license: 'https://creativecommons.org/licenses/by/4.0/',
    creator: { '@type': 'Organization', name: 'openradar', url: baseUrl },
    temporalCoverage: `${index.jobs.points[0]?.date ?? base.from}/..`,
    distribution: [
      { '@type': 'DataDownload', encodingFormat: 'text/csv', contentUrl: `${baseUrl}/research/index.csv` },
      { '@type': 'DataDownload', encodingFormat: 'application/json', contentUrl: `${baseUrl}/research/index.json` },
    ],
  };

  const body = `<nav class="crumbs" aria-label="Навигация"><a href="/">openradar</a> / <a href="/research">Исследования</a> / Индекс</nav>
<div class="page-head"><div><h1>Индекс openradar</h1><p class="muted small">Сколько новых вакансий и заказов появляется в русскоязычном IT и фрилансе каждый день — относительно базы, равной 100.</p></div>
<div class="actions"><a class="btn ghost" href="/research">Отчёт по зарплатам</a><a class="btn ghost" href="/research/methodology#index">Методика</a><a class="btn ghost" href="/research/index.csv">CSV</a><a class="btn ghost" href="/research/index.json">JSON</a></div></div>

<div class="rs-kpis">${headline(jobs, 'Вакансии')}${itJobs?.latest?.index !== undefined ? headline(itJobs, 'IT-вакансии') : ''}${headline(gigs, 'Заказы')}</div>
<p class="small muted">${escapeHtml(baseNote)}</p>
${quote ? `<p class="small">${escapeHtml(quote)} <button type="button" class="rs-quote" data-quote="${escapeHtml(quote)}">Скопировать цитату</button></p>` : ''}

<section class="rs-section">
  <h2>Вакансии</h2>
  <p class="small">Площадки панели: ${escapeHtml(index.panel.job.join(', '))}.${jobs.latest?.avg7 !== undefined && jobs.base !== undefined ? ` Текущий 7-дневный поток — <b>${num(jobs.latest.avg7)}</b> вакансий в день против <b>${num(jobs.base)}</b> в базе.` : ''}</p>
  ${lineChart(jobs.points, 'Индекс вакансий openradar')}
</section>

<section class="rs-section">
  <h2>Заказы на фрилансе</h2>
  <p class="small">Площадки панели: ${escapeHtml(index.panel.gig.join(', '))}.${gigs.latest?.avg7 !== undefined && gigs.base !== undefined ? ` Текущий 7-дневный поток — <b>${num(gigs.latest.avg7)}</b> заказов в день против <b>${num(gigs.base)}</b> в базе.` : ''}</p>
  ${lineChart(gigs.points, 'Индекс заказов openradar')}
</section>

${renderPlatformIndexTable(index.byPlatform, 'ru')}

${roles.length ? `<section class="rs-section">
  <h2>По направлениям</h2>
  <p class="small">Направления, где в базе в среднем от трёх вакансий в день. Клик по направлению открывает зарплатную аналитику и грейды.</p>
  <table class="table"><thead><tr><th>Направление</th><th>Индекс</th><th>За неделю</th><th>В день (7 дн.)</th><th>В день в базе</th><th>Доля панели</th></tr></thead><tbody>
  ${roles.map((r) => `<tr><td><a href="/research/roles/${escapeHtml(r.slug)}">${escapeHtml(r.label)}</a></td><td><b>${num(r.latest!.index!)}</b></td><td>${r.weekChange !== undefined ? signed(r.weekChange) : '—'}</td><td>${r.latest?.avg7 !== undefined ? num(r.latest.avg7) : '—'}</td><td>${num(r.base)}</td><td>${r.sharePct !== undefined ? `${num(r.sharePct)}%` : '—'}</td></tr>`).join('')}
  </tbody></table>
</section>` : ''}

${renderWeekdayProfileSection(index.weekdayProfile, 'ru')}

<section class="rs-section prose">
  <h2>Как устроен индекс</h2>
  <ul>
    <li><b>Фиксированная панель лент:</b> считаются только новые русскоязычные вакансии и заказы, увиденные постоянной панелью из 8 эталонных лент (<code>hh-it</code>, <code>hh-remote-project</code>, <code>habr-career</code>, <code>getmatch</code>, <code>trudvsem-remote</code>, <code>kwork-all</code>, <code>fl-all</code>, <code>freelancehunt</code>). Новые источники, подключённые к openradar позже, в индекс не входят — поэтому индекс отражает движение рынка, а не рост охвата агрегатора.</li>
    <li><b>Отсечение поднятых вакансий (Freshness Gate):</b> старая вакансия, поднятая работодателем в поиске, не считается новой. На hh.ru и Хабр Карьере это проверяется по сквозному номеру публикации ($\Delta\text{id} \le 230\,000$ для hh.ru и $\le 100$ для Хабр Карьеры — около 7 суток номеров).</li>
    <li><b>7-дневное сглаживание и защита от залповых выгрузок:</b> значение дня — скользящее среднее за 7 суток ($\text{MA}_7$), убирающее провалы выходных дней. Разовые технические всплески при первичном подключении ленты до базового периода ($> 2{,}5 \times \text{медианы}$) виндзоризуются при расчёте скользящего среднего, чтобы не создавать ложного падения через 7 дней.</li>
    <li><b>Честная сезонность:</b> индекс не очищается от календарных праздников, майских и новогодних каникул — сезонные спады и волны найма видны как есть.</li>
    <li><b>Окно догрузки (2 суток):</b> последние два завершённых дня пересчитываются при каждом прогоне, так как часть публикаций попадает в RSS и слепки с задержкой.</li>
  </ul>
  <p>Подробная математическая спецификация — в <a href="/research/methodology#index">методике</a>. Данные открыты по лицензии CC BY 4.0. Ссылка для цитирования: openradar, «Индекс openradar». ${escapeHtml(baseUrl)}/research/index</p>
</section>
<script type="application/ld+json">${jsonForScript(dataset)}</script>
<script>
document.addEventListener('click', (event) => {
  const button = event.target.closest('[data-quote]');
  if (!button) return;
  navigator.clipboard.writeText(button.dataset.quote).then(() => { button.textContent = 'Скопировано'; });
});
</script>`;
  return layout({
    auth: options.auth,
    title: 'Индекс openradar: вакансии и заказы в IT и фрилансе',
    version,
    active: 'research',
    body,
    head: `<meta name="description" content="Ежедневный индекс openradar: сколько новых вакансий и заказов появляется в русскоязычном IT и фрилансе относительно базы 100. Открытые данные CC BY 4.0.">
<link rel="canonical" href="${escapeHtml(baseUrl)}/research/index">
<link rel="alternate" hreflang="en" href="${escapeHtml(baseUrl)}/en/research/index">`,
  });
}
