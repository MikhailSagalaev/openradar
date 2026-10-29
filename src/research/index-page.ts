/**
 * The openradar index page: the daily flow of vacancies and orders against the base, a line
 * per series in plain SVG, the roles with an index of their own, and how to cite it.
 */
import { escapeHtml, jsonForScript } from '../core/text.ts';
import { layout } from '../server/ui.ts';
import type { IndexPoint, IndexSeries, OpenradarIndex } from './index.ts';

const num = (value: number): string => new Intl.NumberFormat('ru-RU').format(value).replace(/ /g, ' ');
const dm = (date: string): string => `${date.slice(8, 10)}.${date.slice(5, 7)}`;
const signed = (v: number): string => `${v > 0 ? '+' : v < 0 ? '−' : ''}${num(Math.abs(v))}%`;

/** A line of the index if there is one, else of the daily counts. */
function lineChart(points: IndexPoint[], label: string): string {
  const useIndex = points.some((p) => p.index !== undefined);
  const values = points.map((p) => (useIndex ? p.index : p.count)).map((v) => v ?? NaN);
  const real = values.filter((v) => Number.isFinite(v));
  if (real.length < 2) return '<p class="muted small">График появится, когда наберётся хотя бы два дня данных.</p>';
  const w = 640;
  const h = 180;
  const pad = 24;
  const min = Math.min(...real, useIndex ? 100 : Infinity) * 0.95;
  const max = Math.max(...real, useIndex ? 100 : -Infinity) * 1.05;
  const x = (i: number): number => pad + (i * (w - 2 * pad)) / Math.max(1, points.length - 1);
  const y = (v: number): number => h - pad - ((v - min) * (h - 2 * pad)) / Math.max(1, max - min);
  const path = values
    .map((v, i) => (Number.isFinite(v) ? `${x(i).toFixed(1)},${y(v).toFixed(1)}` : ''))
    .filter(Boolean)
    .join(' ');
  const baseLine = useIndex ? `<line x1="${pad}" x2="${w - pad}" y1="${y(100).toFixed(1)}" y2="${y(100).toFixed(1)}" stroke="currentColor" stroke-opacity=".25" stroke-dasharray="4 4"/>` : '';
  const ticks = [0, Math.floor((points.length - 1) / 2), points.length - 1]
    .map((i) => `<text x="${x(i).toFixed(1)}" y="${h - 4}" font-size="11" text-anchor="middle" fill="currentColor" opacity=".6">${dm(points[i]!.date)}</text>`)
    .join('');
  return `<figure class="rs-chart" style="margin:12px 0 0">
<svg viewBox="0 0 ${w} ${h}" width="100%" role="img" aria-label="${escapeHtml(label)}" style="color:var(--ink);max-width:100%">
${baseLine}<polyline fill="none" stroke="var(--emerald)" stroke-width="2.5" stroke-linejoin="round" points="${path}"/>${ticks}
</svg>
<figcaption class="rs-legend">${useIndex ? 'Индекс по среднему за 7 дней; пунктир — база, 100.' : 'Число публикаций в день; индекс появится, когда наберётся 7 дней.'}</figcaption>
</figure>`;
}

function headline(s: IndexSeries, what: string): string {
  const latest = s.latest;
  if (latest?.index !== undefined) {
    return `<div class="rs-kpi"><b>${num(latest.index)}</b><span>${escapeHtml(what)}: индекс на ${dm(latest.date)}${s.weekChange !== undefined ? `, ${signed(s.weekChange)} за неделю` : ''}</span></div>`;
  }
  return `<div class="rs-kpi"><b>${num(latest?.count ?? 0)}</b><span>${escapeHtml(what)} за ${latest ? dm(latest.date) : '—'}; индекс — через 7 дней данных</span></div>`;
}

export function renderIndexPage(options: { index: OpenradarIndex; baseUrl: string; version: string }): string {
  const { index, baseUrl, version } = options;
  const { jobs, gigs, base } = index;
  const baseNote = base.provisional
    ? `База пока предварительная: среднее за все дни с ${dm(index.jobs.points[0]?.date ?? base.from)} (${base.days} дн.). Окончательная база — 2–29 ноября 2026 года, она зафиксируется 30 ноября, и значения пересчитаются.`
    : `База — среднее число публикаций в день за 2–29 ноября 2026 года (${base.days} дн.) = 100.`;
  const latest = jobs.latest;
  const quote = latest?.index !== undefined
    ? `По данным openradar, индекс вакансий на ${dm(latest.date)} — ${num(latest.index)} (база: ноябрь 2026 = 100${base.provisional ? ', предварительно' : ''}).`
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
<div class="actions"><a class="btn ghost" href="/research/index.csv">CSV</a><a class="btn ghost" href="/research/index.json">JSON</a></div></div>

<div class="rs-kpis">${headline(jobs, 'Вакансии')}${headline(gigs, 'Заказы')}</div>
<p class="small muted">${escapeHtml(baseNote)}</p>
${quote ? `<p class="small">${escapeHtml(quote)} <button type="button" class="rs-quote" data-quote="${escapeHtml(quote)}">Скопировать цитату</button></p>` : ''}

<section class="rs-section">
  <h2>Вакансии</h2>
  <p class="small">Площадки панели: ${escapeHtml(index.panel.job.join(', '))}.</p>
  ${lineChart(jobs.points, 'Индекс вакансий openradar')}
</section>

<section class="rs-section">
  <h2>Заказы на фрилансе</h2>
  <p class="small">Площадки панели: ${escapeHtml(index.panel.gig.join(', '))}.</p>
  ${lineChart(gigs.points, 'Индекс заказов openradar')}
</section>

${roles.length ? `<section class="rs-section">
  <h2>По направлениям</h2>
  <p class="small">Направления, где в базе в среднем от трёх вакансий в день.</p>
  <table class="table"><thead><tr><th>Направление</th><th>Индекс</th><th>За неделю</th><th>В день в базе</th></tr></thead><tbody>
  ${roles.map((r) => `<tr><td><a href="/research/roles/${escapeHtml(r.slug)}">${escapeHtml(r.label)}</a></td><td>${num(r.latest!.index!)}</td><td>${r.weekChange !== undefined ? signed(r.weekChange) : '—'}</td><td>${num(r.base)}</td></tr>`).join('')}
  </tbody></table>
</section>` : ''}

<section class="rs-section prose">
  <h2>Как устроен индекс</h2>
  <ul>
    <li>Считаются новые русскоязычные вакансии и заказы, опубликованные за день на постоянной панели площадок. Источники, подключённые позже, в индекс не входят: он показывает рынок, а не рост нашего охвата.</li>
    <li>Значение дня — среднее за 7 дней, чтобы будни и выходные не давали пилы. Индекс = это среднее / среднее базового периода × 100.</li>
    <li>Публикации, которые участники отметили как мусор или мошенничество, и те, что модель уверенно признала не вакансиями, не считаются.</li>
    <li>Последние два дня пересчитываются: часть публикаций приходит с опозданием.</li>
  </ul>
  <p>Подробности — в <a href="/research/methodology#index">методике</a>. Данные открыты по лицензии CC BY 4.0. Ссылка для цитирования: openradar, «Индекс openradar». ${escapeHtml(baseUrl)}/research/index</p>
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
    title: 'Индекс openradar: вакансии и заказы в IT и фрилансе',
    version,
    active: 'research',
    body,
    head: `<meta name="description" content="Ежедневный индекс openradar: сколько новых вакансий и заказов появляется в русскоязычном IT и фрилансе относительно базы 100. Открытые данные CC BY 4.0.">
<link rel="canonical" href="${escapeHtml(baseUrl)}/research/index">`,
  });
}
