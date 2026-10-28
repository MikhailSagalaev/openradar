/**
 * The research section: the live market report, frozen monthly reports, role pages and the
 * methodology. Charts are plain HTML bars, so they read on a phone and in both themes.
 */
import { escapeHtml, jsonForScript } from '../core/text.ts';
import { layout } from '../server/ui.ts';
import { GRADE_LABELS, RUB_PER, ROLES } from './derive.ts';
import {
  MIN_MEDIAN,
  MIN_QUARTILES,
  MONTHS_NOM,
  RELIABLE,
  formatRub,
  formatShare,
  rubMonthToUsdYear,
  type Dist,
  type Report,
  type RoleDetail,
  type Slice,
} from './report.ts';

const REPO_URL = 'https://github.com/MikhailSagalaev/openradar';
const LICENSE = 'CC BY 4.0';

interface BarRow {
  label: string;
  href?: string;
  n: number;
  pay: Dist;
}

const num = (value: number): string => new Intl.NumberFormat('ru-RU').format(value).replace(/ /g, ' ');
const short = (rub: number): string => (rub >= 1000 ? `${num(Math.round(rub / 1000))} тыс.` : num(rub));

/** Median with the middle half of pay: a dot on a band. Rows below the threshold are left out. */
function rangeChart(rows: BarRow[], options: { unit?: (v: number) => string; caption?: string } = {}): string {
  const shown = rows.filter((row) => row.pay.median !== undefined);
  if (!shown.length) return `<p class="muted small">Пока мало данных: нужна хотя бы ${MIN_MEDIAN} публикаций с оплатой в группе.</p>`;
  const unit = options.unit ?? formatRub;
  const top = Math.max(...shown.map((row) => row.pay.p75 ?? row.pay.median!)) * 1.08;
  const pct = (v: number): string => `${Math.min(100, (v / top) * 100).toFixed(2)}%`;
  const body = shown
    .map((row) => {
      const label = row.href ? `<a href="${escapeHtml(row.href)}">${escapeHtml(row.label)}</a>` : escapeHtml(row.label);
      const band = row.pay.p25 !== undefined && row.pay.p75 !== undefined
        ? `<span class="rs-band" style="left:${pct(row.pay.p25)};width:calc(${pct(row.pay.p75)} - ${pct(row.pay.p25)})" title="${escapeHtml(`${unit(row.pay.p25)} — ${unit(row.pay.p75)}`)}"></span>`
        : '';
      return `<div class="rs-row">
  <div class="rs-label">${label}</div>
  <div class="rs-track">${band}<span class="rs-dot" style="left:${pct(row.pay.median!)}"></span></div>
  <div class="rs-val"><b>${escapeHtml(unit(row.pay.median!))}</b><span class="rs-n">n = ${row.pay.n}${row.pay.n < RELIABLE ? ' · мало' : ''}</span></div>
</div>`;
    })
    .join('');
  return `<div class="rs-chart" role="table">${body}</div>
<p class="rs-legend"><span class="rs-dot-key"></span> медиана <span class="rs-band-key"></span> половина вакансий (от 25-го до 75-го процентиля)${options.caption ? ` · ${escapeHtml(options.caption)}` : ''}</p>`;
}

function countBars(rows: Array<{ label: string; n: number; note?: string }>): string {
  if (!rows.length) return '';
  const max = Math.max(...rows.map((row) => row.n));
  return `<div class="rs-chart">${rows
    .map((row) => `<div class="rs-row">
  <div class="rs-label">${escapeHtml(row.label)}</div>
  <div class="rs-track"><span class="rs-fill" style="width:${((row.n / max) * 100).toFixed(2)}%"></span></div>
  <div class="rs-val"><b>${num(row.n)}</b>${row.note ? `<span class="rs-n">${escapeHtml(row.note)}</span>` : ''}</div>
</div>`)
    .join('')}</div>`;
}

function histogram(bins: Report['jobs']['histogram']): string {
  const max = Math.max(1, ...bins.map((b) => b.n));
  return `<div class="rs-hist" role="img" aria-label="Распределение зарплат в вакансиях">${bins
    .map((b) => `<div class="rs-hist-col" title="${escapeHtml(`${b.to ? `${short(b.from)}–${short(b.to)}` : `от ${short(b.from)}`}: ${b.n}`)}">
  <span class="rs-hist-n">${b.n || ''}</span>
  <span class="rs-hist-bar" style="height:${((b.n / max) * 100).toFixed(1)}%"></span>
  <span class="rs-hist-x">${b.to ? short(b.from).replace(' тыс.', '') : `${short(b.from).replace(' тыс.', '')}+`}</span>
</div>`)
    .join('')}</div>
<p class="rs-legend">Зарплата в месяц, тыс. ₽; число вакансий в каждом интервале</p>`;
}

function weekly(rows: Report['jobs']['weekly']): string {
  if (rows.length < 2) return '<p class="muted small">Динамика появится, когда в базе будет хотя бы две недели данных.</p>';
  const max = Math.max(...rows.map((r) => r.n));
  return `<div class="rs-hist">${rows
    .map((r) => `<div class="rs-hist-col" title="${escapeHtml(`Неделя с ${r.week}: ${r.n} вакансий${r.median ? `, медиана ${formatRub(r.median)}` : ''}`)}">
  <span class="rs-hist-n">${r.median ? short(r.median).replace(' тыс.', 'k') : ''}</span>
  <span class="rs-hist-bar" style="height:${((r.n / max) * 100).toFixed(1)}%"></span>
  <span class="rs-hist-x">${r.week.slice(8, 10)}.${r.week.slice(5, 7)}</span>
</div>`)
    .join('')}</div>
<p class="rs-legend">Столбик — число вакансий за неделю (по понедельникам), подпись — медианная зарплата, тыс. ₽</p>`;
}

function kpi(value: string, label: string): string {
  return `<div class="rs-kpi"><b>${escapeHtml(value)}</b><span>${escapeHtml(label)}</span></div>`;
}

function sliceRows(slices: Slice[], href?: (key: string) => string | undefined): BarRow[] {
  return slices.map((s) => ({ label: s.label, href: href?.(s.key), n: s.n, pay: s.pay }));
}

function quoteButton(quote: string): string {
  return `<button type="button" class="rs-quote" data-quote="${escapeHtml(quote)}">Скопировать цитату</button>`;
}

const QUOTE_SCRIPT = `<script>
document.addEventListener('click', (event) => {
  const button = event.target.closest('[data-quote]');
  if (!button) return;
  navigator.clipboard.writeText(button.dataset.quote).then(() => {
    const label = button.textContent;
    button.textContent = 'Скопировано';
    setTimeout(() => { button.textContent = label; }, 1500);
  });
});
</script>`;

function reportUrl(report: Report): string {
  return report.kind === 'month' && report.period.slug ? `/research/${report.period.slug}` : '/research';
}

function citeLine(report: Report, baseUrl: string): string {
  return `OpenRadar, «Рынок труда в IT и фрилансе», ${report.period.label}. ${baseUrl}${reportUrl(report)}`;
}

export function renderReportPage(options: {
  report: Report;
  baseUrl: string;
  version: string;
  snapshots: Array<{ period: string }>;
}): string {
  const { report, baseUrl, version, snapshots } = options;
  const { jobs, gigs, totals } = report;
  const isLive = report.kind === 'live';
  const title = isLive ? 'Рынок труда в IT и фрилансе' : `Рынок труда в IT и фрилансе: ${report.period.label.toLowerCase()}`;
  const roleHref = (slug: string): string | undefined =>
    jobs.roles.some((r) => r.slug === slug) ? `/research/roles/${slug}` : undefined;
  const intlMedian = jobs.intl.median;

  const body = `
<nav class="crumbs" aria-label="Навигация"><a href="/">OpenRadar</a> / ${isLive ? 'Исследования' : `<a href="/research">Исследования</a> / ${escapeHtml(report.period.label)}`}</nav>
<div class="page-head"><div>
  <h1>${escapeHtml(title)}</h1>
  <p class="muted small">${isLive
    ? `Живой отчёт по ${num(totals.posts)} публикациям за ${escapeHtml(report.period.label)}. Пересчитывается каждые 15 минут.`
    : `Отчёт за ${escapeHtml(report.period.label.toLowerCase())}: ${num(totals.posts)} публикаций. Цифры зафиксированы и не меняются.`}
  Источники: биржи фриланса, hh.ru, Хабр Карьера, «Работа России», Telegram-каналы и участники OpenRadar.</p>
</div><div class="actions"><a class="btn ghost" href="/research/methodology">Методика</a><a class="btn ghost" href="/research/dataset.csv">Данные CSV</a></div></div>

<div class="rs-kpis">
  ${kpi(num(totals.jobs), 'вакансий')}
  ${kpi(formatShare(jobs.payShare), 'с указанной зарплатой')}
  ${kpi(jobs.pay.median ? formatRub(jobs.pay.median) : '—', 'медианная зарплата в месяц')}
  ${kpi(num(totals.gigs), 'заказов на фрилансе')}
  ${kpi(gigs.budget.median ? formatRub(gigs.budget.median) : '—', 'медианный бюджет заказа')}
  ${kpi(num(totals.companies), 'работодателей')}
</div>

${report.findings.length ? `<section class="rs-section">
  <h2>Главное</h2>
  <ul class="rs-findings">${report.findings.map((f) => `<li><span>${escapeHtml(f.text)}</span>${quoteButton(f.quote)}</li>`).join('')}</ul>
  <p class="muted small">Цитата уже содержит источник, период и размер выборки. При публикации укажите ссылку на ${escapeHtml(`${baseUrl}${reportUrl(report)}`)}.</p>
</section>` : ''}

<section class="rs-section">
  <h2>Зарплаты по направлениям</h2>
  <p class="muted small">Вакансии в рублях с указанной зарплатой, в месяц. Направление определяется по названию вакансии.</p>
  ${rangeChart(sliceRows(jobs.byRole.filter((s) => s.key !== 'other'), roleHref))}
</section>

<section class="rs-section">
  <h2>По уровню</h2>
  ${rangeChart(sliceRows(jobs.byGrade), { caption: 'уровень — из названия вакансии или отметки площадки' })}
</section>

<section class="rs-section">
  <h2>По языку программирования</h2>
  <p class="muted small">Вакансии разработчиков, где язык назван в заголовке или в навыках.</p>
  ${rangeChart(sliceRows(jobs.byLanguage))}
</section>

<section class="rs-section">
  <h2>География и удалёнка</h2>
  ${rangeChart(sliceRows(jobs.byRegion))}
  <p class="small">Удалённую работу допускают <b>${formatShare(jobs.remote.share)}</b> вакансий.${jobs.remote.remote.median && jobs.remote.office.median ? ` Медиана: ${formatRub(jobs.remote.remote.median)} с удалёнкой и ${formatRub(jobs.remote.office.median)} без неё.` : ''}</p>
</section>

<section class="rs-section">
  <h2>Распределение зарплат</h2>
  ${histogram(jobs.histogram)}
</section>

<section class="rs-section">
  <h2>Навыки</h2>
  <p class="muted small">Самые частые навыки в вакансиях с зарплатой и медиана в вакансиях, где они упомянуты.</p>
  ${rangeChart(jobs.skills.map((s) => ({ label: s.skill, n: s.n, pay: s.pay })))}
</section>

<section class="rs-section">
  <h2>ИИ в вакансиях</h2>
  <p class="small">Нейросети, LLM, GPT, Cursor, Copilot или машинное обучение упоминают <b>${formatShare(jobs.ai.share)}</b> вакансий.</p>
  ${rangeChart([
    { label: 'Упоминают ИИ', n: jobs.ai.with.n, pay: jobs.ai.with },
    { label: 'Не упоминают', n: jobs.ai.without.n, pay: jobs.ai.without },
  ])}
</section>

<section class="rs-section">
  <h2>Динамика</h2>
  ${weekly(jobs.weekly)}
</section>

${jobs.companies.length ? `<section class="rs-section">
  <h2>Кто больше всех нанимает</h2>
  ${countBars(jobs.companies.slice(0, 12).map((c) => ({ label: c.name, n: c.n })))}
</section>` : ''}

<section class="rs-section">
  <h2>Фриланс: бюджеты заказов</h2>
  <p class="small">Бюджет указан в <b>${formatShare(gigs.budgetShare)}</b> заказов. Бюджет — за весь проект; на Kwork это желаемая цена заказчика.</p>
  ${rangeChart(sliceRows(gigs.byCategory.filter((s) => s.key !== 'other')))}
  ${gigs.hourly.median ? `<p class="small">Почасовая ставка в заказах, где она указана: медиана ${formatRub(gigs.hourly.median)} в час (n = ${gigs.hourly.n}).</p>` : ''}
</section>

${intlMedian ? `<section class="rs-section">
  <h2>Международная удалёнка</h2>
  <p class="small">Вакансии в долларах и евро с We Work Remotely, Jobicy и RemoteOK: медиана <b>$${num(rubMonthToUsdYear(intlMedian))} в год</b> (n = ${jobs.intl.n}). В рублёвую статистику выше они не входят.</p>
</section>` : ''}

<section class="rs-section">
  <h2>Откуда данные</h2>
  ${countBars(totals.platforms.slice(0, 12).map((p) => ({ label: p.key, n: p.n })))}
</section>

<section class="rs-section prose" style="margin-top:36px">
  <h2>Как ссылаться</h2>
  <p>Данные OpenRadar открыты по лицензии ${LICENSE}: их можно использовать в публикациях и исследованиях со ссылкой на источник.</p>
  <p class="rs-cite"><code>${escapeHtml(citeLine(report, baseUrl))}</code> ${quoteButton(citeLine(report, baseUrl))}</p>
  <ul>
    <li><a href="/research/methodology">Методика</a>: откуда публикации, как считается зарплата, что не входит в выборку.</li>
    <li><a href="/research/dataset.csv">Данные по вакансиям и заказам (CSV)</a> — без текстов и контактов.</li>
    <li><a href="${isLive ? '/research/report.json' : `/research/${escapeHtml(report.period.slug ?? '')}.json`}">Этот отчёт в JSON</a>.</li>
    <li>Нужен срез под вашу тему — <a href="${REPO_URL}/issues" target="_blank" rel="noopener">напишите на GitHub</a>.</li>
  </ul>
  ${snapshots.length ? `<h2>Отчёты по месяцам</h2><div class="chip-links">${snapshots.map((s) => `<a href="/research/${escapeHtml(s.period)}">${escapeHtml(monthLabel(s.period))}</a>`).join('')}</div>` : '<p class="muted small">Первый месячный отчёт будет зафиксирован в начале следующего месяца.</p>'}
  ${jobs.roles.length ? `<h2>По направлениям</h2><div class="chip-links">${jobs.roles.map((r) => `<a href="/research/roles/${escapeHtml(r.slug)}">${escapeHtml(r.label)}</a>`).join('')}</div>` : ''}
</section>`;

  const dataset = {
    '@context': 'https://schema.org',
    '@type': 'Dataset',
    name: title,
    description: `Зарплаты и бюджеты в вакансиях и заказах: ${report.period.label}. Медианы и квартили по направлениям, уровням, языкам, городам и навыкам.`,
    url: `${baseUrl}${reportUrl(report)}`,
    license: 'https://creativecommons.org/licenses/by/4.0/',
    creator: { '@type': 'Organization', name: 'OpenRadar', url: `${baseUrl}/` },
    temporalCoverage: `${report.period.from.slice(0, 10)}/${report.period.to.slice(0, 10)}`,
    distribution: [
      { '@type': 'DataDownload', encodingFormat: 'text/csv', contentUrl: `${baseUrl}/research/dataset.csv` },
    ],
  };
  const description = jobs.pay.median
    ? `Медианная зарплата в вакансиях — ${formatRub(jobs.pay.median)}, зарплату указывают в ${formatShare(jobs.payShare)} вакансий. Зарплаты по направлениям, уровням, языкам и городам; бюджеты заказов на фрилансе. ${report.period.label}.`
    : `Зарплаты в вакансиях и бюджеты заказов по данным OpenRadar: ${report.period.label}.`;

  return layout({
    title,
    version,
    active: 'research',
    body,
    script: QUOTE_SCRIPT,
    head: `<meta name="description" content="${escapeHtml(description)}">
<meta property="og:description" content="${escapeHtml(description)}">
<link rel="canonical" href="${escapeHtml(`${baseUrl}${reportUrl(report)}`)}">
<script type="application/ld+json">
${jsonForScript(dataset)}
</script>`,
  });
}

export function monthLabel(slug: string): string {
  const [y, m] = slug.split('-').map(Number) as [number, number];
  const name = MONTHS_NOM[m - 1] ?? slug;
  return `${name[0]!.toUpperCase()}${name.slice(1)} ${y}`;
}

export function renderRolePage(options: { detail: RoleDetail; report: Report; baseUrl: string; version: string }): string {
  const { detail, report, baseUrl, version } = options;
  const title = `Зарплаты: ${detail.label}`;
  const path = `/research/roles/${detail.slug}`;
  const quote = detail.pay.median
    ? `По данным OpenRadar, медианная зарплата в вакансиях направления «${detail.label}» ${report.period.phrase} составила ${formatRub(detail.pay.median)} в месяц (выборка: ${detail.pay.n} вакансий).`
    : '';
  const body = `
<nav class="crumbs" aria-label="Навигация"><a href="/">OpenRadar</a> / <a href="/research">Исследования</a> / ${escapeHtml(detail.label)}</nav>
<div class="page-head"><div>
  <h1>${escapeHtml(title)}</h1>
  <p class="muted small">${num(detail.n)} вакансий за ${escapeHtml(report.period.label)}, зарплата указана в ${num(detail.withPay)}. Удалённую работу допускают ${formatShare(detail.remoteShare)}.</p>
</div></div>
<div class="rs-kpis">
  ${kpi(detail.pay.median ? formatRub(detail.pay.median) : '—', 'медиана в месяц')}
  ${kpi(detail.pay.p25 ? formatRub(detail.pay.p25) : '—', '25-й процентиль')}
  ${kpi(detail.pay.p75 ? formatRub(detail.pay.p75) : '—', '75-й процентиль')}
  ${kpi(num(detail.n), 'вакансий')}
</div>
${quote ? `<p class="small">${escapeHtml(quote)} ${quoteButton(quote)}</p>` : ''}
<section class="rs-section"><h2>По уровню</h2>${rangeChart(sliceRows(detail.byGrade))}</section>
${detail.byLanguage.some((s) => s.pay.median) ? `<section class="rs-section"><h2>По языку</h2>${rangeChart(sliceRows(detail.byLanguage))}</section>` : ''}
<section class="rs-section"><h2>По городам</h2>${rangeChart(sliceRows(detail.byRegion))}</section>
${detail.skills.length ? `<section class="rs-section"><h2>Навыки</h2>${rangeChart(detail.skills.map((s) => ({ label: s.skill, n: s.n, pay: s.pay })))}</section>` : ''}
${detail.companies.length ? `<section class="rs-section"><h2>Кто нанимает</h2>${countBars(detail.companies.map((c) => ({ label: c.name, n: c.n })))}</section>` : ''}
<section class="rs-section prose" style="margin-top:36px">
  <p>Свежие вакансии этого направления — в <a href="/?type=job">ленте вакансий</a>. Как считаются цифры — в <a href="/research/methodology">методике</a>. Все направления — в <a href="/research">общем отчёте</a>.</p>
  <div class="chip-links">${report.jobs.roles.filter((r) => r.slug !== detail.slug).slice(0, 12).map((r) => `<a href="/research/roles/${escapeHtml(r.slug)}">${escapeHtml(r.label)}</a>`).join('')}</div>
</section>`;
  const description = detail.pay.median
    ? `${detail.label}: медианная зарплата в вакансиях ${formatRub(detail.pay.median)} в месяц. Зарплаты по уровням, городам и навыкам, ${report.period.label}.`
    : `${detail.label}: зарплаты в вакансиях по данным OpenRadar.`;
  return layout({
    title,
    version,
    active: 'research',
    body,
    script: QUOTE_SCRIPT,
    head: `<meta name="description" content="${escapeHtml(description)}">
<link rel="canonical" href="${escapeHtml(baseUrl + path)}">`,
  });
}

export function renderMethodologyPage(options: { baseUrl: string; version: string }): string {
  const { baseUrl, version } = options;
  const rates = Object.entries(RUB_PER)
    .filter(([code]) => !['RUB', 'RUR', 'USDT'].includes(code))
    .map(([code, rate]) => `${code} — ${String(rate).replace('.', ',')} ₽`)
    .join(', ');
  const roles = ROLES.filter((r) => r.types.includes('job')).map((r) => r.label).join(', ');
  const body = `
<nav class="crumbs" aria-label="Навигация"><a href="/">OpenRadar</a> / <a href="/research">Исследования</a> / Методика</nav>
<div class="page-head"><div><h1>Методика</h1><p class="muted small">Как OpenRadar считает зарплаты и бюджеты.</p></div></div>
<section class="prose" style="margin-top:0">
  <h2>Что считается</h2>
  <p>Исследования OpenRadar показывают предложение работодателей и заказчиков: какую оплату указывают в опубликованных вакансиях и заказах. Это не зарплаты, которые люди получают на руки, и не результаты опроса. Такие данные хорошо показывают рынок найма прямо сейчас и его изменения от месяца к месяцу.</p>

  <h2>Откуда данные</h2>
  <p>Вакансии и заказы, опубликованные за период на hh.ru, Хабр Карьере, портале «Работа России», FL.ru, Kwork, Freelancehunt, We Work Remotely, Jobicy, RemoteOK, в Telegram-каналах, а также добавленные участниками. Одна и та же публикация на разных площадках считается один раз: OpenRadar склеивает дубликаты по ссылке, тексту и близости содержания. Публикации, которые участники отметили как мусор или мошенничество, в выборку не входят. Закрытые позже вакансии входят: они были опубликованы в этот период.</p>

  <h2>Как определяется зарплата</h2>
  <ul>
    <li>Сначала берётся разметка страницы вакансии (schema.org JobPosting), затем текст публикации, затем бюджет, который указала площадка.</li>
    <li>В тексте учитываются только суммы рядом с валютой или словами «оклад», «зарплата»: «3–5 лет опыта» зарплатой не станет.</li>
    <li>Вилка «от 150 000 до 200 000 ₽» даёт одно значение — середину, 175 000 ₽. Если указана одна граница («от 150 000 ₽» или «до 200 000 ₽»), берётся она.</li>
    <li>Годовые суммы делятся на 12. Почасовые ставки в месячную статистику не входят.</li>
    <li>Валюты переводятся в рубли по справочному курсу: ${escapeHtml(rates)}.</li>
    <li>Зарплаты в вакансиях в долларах и евро (международные доски) показаны отдельно и в рублёвую медиану не входят.</li>
    <li>Значения меньше 12 000 ₽ или больше 3 000 000 ₽ в месяц считаются ошибкой разбора и отбрасываются.</li>
    <li>Указана ли сумма до или после вычета налогов, площадки сообщают не всегда, поэтому эти суммы не разделяются.</li>
  </ul>

  <h2>Направление, уровень, язык</h2>
  <p>Направление определяется по названию вакансии по словарю правил, а если название ничего не говорит — по специализации, которую указала площадка. Направления: ${escapeHtml(roles)}. Уровень (Стажёр, Junior, Middle, Senior, Lead) берётся из названия, из отметки площадки или из тегов вроде #middle. Когда в названии несколько уровней («Middle/Senior»), берётся старший. Язык программирования — из названия, затем из списка навыков.</p>
  <p>Правила открыты: <a href="${REPO_URL}/blob/main/src/research/derive.ts" target="_blank" rel="noopener">src/research/derive.ts</a>. Если вакансия попала не в то направление, <a href="${REPO_URL}/issues" target="_blank" rel="noopener">сообщите на GitHub</a>.</p>

  <h2>Статистика</h2>
  <ul>
    <li>Главная величина — медиана: половина вакансий предлагает больше, половина меньше. В отличие от среднего, она не скачет из-за единичных очень высоких зарплат.</li>
    <li>Полоса на графиках — от 25-го до 75-го процентиля: в этот диапазон попадает средняя половина вакансий.</li>
    <li>Медиана показывается, если в группе не меньше ${MIN_MEDIAN} вакансий с оплатой, процентили — от ${MIN_QUARTILES}. Группы меньше ${RELIABLE} помечены «мало»: такие цифры стоит цитировать осторожно.</li>
    <li>Суммы округлены до тысячи рублей.</li>
  </ul>

  <h2>Периоды</h2>
  <p>На странице <a href="/research">Исследования</a> — живой отчёт за последние 30 дней, он пересчитывается каждые 15 минут. В начале каждого месяца отчёт за прошедший месяц фиксируется и больше не меняется: на него можно ссылаться.</p>

  <h2>Ограничения</h2>
  <ul>
    <li>В выборке больше фриланса и Telegram-каналов, чем у классических сайтов вакансий, и меньше вакансий без указанной зарплаты на hh.ru: площадка не всегда отдаёт такие вакансии в ленты.</li>
    <li>Работодатели чаще указывают зарплату в массовых и младших вакансиях, чем в старших, поэтому медиана по всем вакансиям ниже медианы по рынку старших специалистов.</li>
    <li>Бюджет заказа на фрилансе — оценка заказчика до переговоров; на Kwork это желаемая цена.</li>
  </ul>

  <h2>Данные</h2>
  <p>Данные открыты по лицензии ${LICENSE}. <a href="/research/dataset.csv">CSV</a> содержит по строке на публикацию: дату, площадку, направление, уровень, язык, город, компанию, вилку в рублях и навыки. Тексты и контакты в него не входят. Последние сутки в выгрузку не попадают.</p>
</section>`;
  return layout({
    title: 'Методика исследований',
    version,
    active: 'research',
    body,
    head: `<meta name="description" content="Как OpenRadar считает зарплаты и бюджеты: источники, разбор вилок, направления и уровни, медианы и пороги выборки.">
<link rel="canonical" href="${escapeHtml(baseUrl)}/research/methodology">`,
  });
}

export { GRADE_LABELS };
