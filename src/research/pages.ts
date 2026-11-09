/**
 * The research section: the live market report, frozen monthly reports, role pages and the
 * methodology. Charts are plain HTML bars, so they read on a phone and in both themes.
 */
import { escapeHtml, jsonForScript } from '../core/text.ts';
import { layout, type AuthDisplay } from '../server/ui.ts';
import type { SupportedLang } from '../server/i18n.ts';
import { GRADE_LABELS, MIN_CONFIDENCE, ROLES, roleLabel } from './derive.ts';

const MIN_CONFIDENCE_PCT = Math.round(MIN_CONFIDENCE * 100);
import {
  MIN_MEDIAN,
  MIN_QUARTILES,
  MONTHS_NOM,
  RELIABLE,
  REPORT_VERSION,
  formatRub,
  formatShare,
  rubMonthToUsdYear,
  type BumpRankItem,
  type BumpSnapshot,
  type Dist,
  type Report,
  type RoleDetail,
  type Slice,
} from './report.ts';

const REPO_URL = 'https://github.com/MikhailSagalaev/openradar';
const ORIGIN_LABELS: Record<string, string> = {
  page: 'разметка страницы вакансии',
  text: 'текст публикации',
  budget: 'бюджет, указанный площадкой',
  model: 'разбор текста моделью',
};
const LICENSE = 'CC BY 4.0';

interface BarRow {
  label: string;
  href?: string;
  n: number;
  pay: Dist;
}

const num = (value: number): string => new Intl.NumberFormat('ru-RU').format(value).replace(/ /g, ' ');
const short = (rub: number): string => (rub >= 1000 ? `${num(Math.round(rub / 1000))} тыс.` : num(rub));

/** Median with its 95% interval on the middle half of pay. Rows below the threshold are left out. */
function rangeChart(rows: BarRow[], options: { unit?: (v: number) => string; caption?: string } = {}): string {
  const shown = rows.filter((row) => row.pay.median !== undefined);
  if (!shown.length) return `<p class="muted small">Пока мало данных: нужна хотя бы ${MIN_MEDIAN} публикаций с оплатой в группе.</p>`;
  const unit = options.unit ?? formatRub;
  const top = Math.max(...shown.map((row) => Math.max(row.pay.p75 ?? 0, row.pay.ciHigh ?? 0, row.pay.median!))) * 1.08;
  const pct = (v: number): string => `${Math.min(100, (v / top) * 100).toFixed(2)}%`;
  const body = shown
    .map((row) => {
      const label = row.href ? `<a href="${escapeHtml(row.href)}">${escapeHtml(row.label)}</a>` : escapeHtml(row.label);
      const band = row.pay.p25 !== undefined && row.pay.p75 !== undefined
        ? `<span class="rs-band" style="left:${pct(row.pay.p25)};width:calc(${pct(row.pay.p75)} - ${pct(row.pay.p25)})"></span>`
        : '';
      const ci = row.pay.ciLow !== undefined && row.pay.ciHigh !== undefined
        ? `<span class="rs-ci" style="left:${pct(row.pay.ciLow)};width:calc(${pct(row.pay.ciHigh)} - ${pct(row.pay.ciLow)})"></span>`
        : '';
      const hint = [
        `Медиана ${unit(row.pay.median!)}`,
        row.pay.ciLow !== undefined ? `95% интервал: ${unit(row.pay.ciLow)} — ${unit(row.pay.ciHigh!)}` : '',
        row.pay.p25 !== undefined ? `половина публикаций: ${unit(row.pay.p25)} — ${unit(row.pay.p75!)}` : '',
      ].filter(Boolean).join('; ');
      return `<div class="rs-row" title="${escapeHtml(hint)}">
  <div class="rs-label">${label}</div>
  <div class="rs-track">${band}${ci}<span class="rs-dot" style="left:${pct(row.pay.median!)}"></span></div>
  <div class="rs-val"><b>${escapeHtml(unit(row.pay.median!))}</b><span class="rs-n">n = ${row.pay.n}${row.pay.n < RELIABLE ? ' · мало' : ''}</span></div>
</div>`;
    })
    .join('');
  return `<div class="rs-chart" role="table">${body}</div>
<p class="rs-legend"><span class="rs-dot-key"></span> медиана <span class="rs-ci-key"></span> 95% интервал медианы <span class="rs-band-key"></span> половина публикаций (от 25-го до 75-го процентиля)${options.caption ? ` · ${escapeHtml(options.caption)}` : ''}</p>`;
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

function weekly(rows: Report['jobs']['weekly'], indexed?: Report['jobs']['weeklyIndexed']): string {
  if (rows.length < 2) return '<p class="muted small">Динамика появится, когда в базе будет хотя бы две недели данных.</p>';
  const max = Math.max(...rows.map((r) => r.n));
  return `<div class="rs-hist">${rows
    .map((r) => `<div class="rs-hist-col" title="${escapeHtml(`Неделя с ${r.week}: ${r.n} вакансий${r.median ? `, медиана ${formatRub(r.median)}` : ''}`)}">
  <span class="rs-hist-n">${r.median ? short(r.median).replace(' тыс.', 'k') : ''}</span>
  <span class="rs-hist-bar" style="height:${((r.n / max) * 100).toFixed(1)}%"></span>
  <span class="rs-hist-x">${r.week.slice(8, 10)}.${r.week.slice(5, 7)}</span>
</div>`)
    .join('')}</div>
<p class="rs-legend">Столбик — число вакансий за неделю (по понедельникам), подпись — медианная зарплата, тыс. ₽</p>
<p class="muted small" style="margin-top: 10px; line-height: 1.5; border-left: 2px solid var(--line-strong); padding-left: 10px;">
  <b>Состав выборки менялся:</b> новые источники подключались в октябре и ноябре, а в первые дни лента площадки отдаёт и старые вакансии, поднятые в поиске. Поэтому недели здесь не сравниваются между собой. Для динамики смотрите <a href="/research/index">индекс</a>: он считается на постоянной панели источников.
</p>
${indexed && indexed.length >= 2 ? `<p class="muted small">Индекс состава, 100 = первая неделя корзины: ${indexed.map((row) => `${row.week.slice(8, 10)}.${row.week.slice(5, 7)} — ${row.index}`).join('; ')}. В корзине роли с 30 и более оплачиваемыми вакансиями за период; неделя роли берётся, если в ней 10 и более.</p>` : ''}`;
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

function renderEditorialInsight(insight?: Report['editorialInsight']): string {
  if (!insight) return '';
  return `<div class="rs-insight-card">
  <div class="rs-insight-head">
    <span class="rs-insight-tag">Редакционный вывод openradar</span>
    <button type="button" class="rs-quote" data-quote="${escapeHtml(insight.quote)}">Скопировать для СМИ</button>
  </div>
  <p class="rs-insight-text">
    <b>Факт:</b> ${escapeHtml(insight.fact)}<br>
    <b>Контраст:</b> ${escapeHtml(insight.contrast)}<br>
    <b>Вывод:</b> ${escapeHtml(insight.conclusion)}
  </p>
</div>`;
}

function renderCartaSection(rows?: Report['cartaCapital'], baseUrl = ''): string {
  if (!rows || !rows.length) return '';
  const embedCode = `<iframe src="${baseUrl}/embed/carta" width="100%" height="380" frameborder="0"></iframe>`;
  const maxVol = Math.max(...rows.map((r) => r.nShare), 1);
  const maxCap = Math.max(...rows.map((r) => r.capitalShare), 1);
  const totalN = rows.reduce((s, r) => s + r.n, 0);

  return `<section class="rs-section">
  <div class="rs-section-head">
    <div>
      <h2>Заказы на фрилансе: число против суммы бюджетов</h2>
      <p class="muted small">Русскоязычные заказы с указанным бюджетом. Слева — их число, справа — доля в сумме этих бюджетов. Сумма чувствительна к отдельным крупным заказам.</p>
    </div>
    <button type="button" class="btn ghost btn-sm rs-embed-btn" data-embed="${escapeHtml(embedCode)}">&lt;/&gt; Встроить</button>
  </div>
  <div class="rs-dual-table">
    <div class="rs-dual-head">
      <div>Специализация</div>
      <div style="text-align:right">Заказов</div>
      <div style="text-align:right">Доля суммы бюджетов</div>
    </div>
    ${rows.map((r) => `<div class="rs-dual-row">
      <div class="rs-dual-name font-medium">${escapeHtml(r.label)}</div>
      <div class="rs-dual-vol">
        <div class="rs-bar-vol-wrap"><div class="rs-bar-vol" style="width:${Math.min(100, Math.round((r.nShare / maxVol) * 100))}%"></div></div>
        <span class="rs-mono">${num(r.n)} <span class="muted small">(${formatShare(r.nShare)})</span></span>
      </div>
      <div class="rs-dual-cap">
        <div class="rs-bar-cap-wrap"><div class="rs-bar-cap" style="width:${Math.min(100, Math.round((r.capitalShare / maxCap) * 100))}%"></div></div>
        <span class="rs-mono" style="font-weight:700">${formatShare(r.capitalShare)}</span>
      </div>
    </div>`).join('')}
  </div>
  <p class="muted small" style="margin-top:8px;text-align:right">Всего ${num(totalN)} заказов с бюджетом</p>
</section>`;
}

const signedPct = (value: number): string => (value > 0 ? `+${value}%` : `${value}%`);

function renderTaskTransformationSection(data?: Report['taskTransformation'], baseUrl = ''): string {
  if (!data) return '';
  const embedCode = `<iframe src="${baseUrl}/embed/task-transformation" width="100%" height="420" frameborder="0"></iframe>`;
  const sample = data.totalMatched ? ` (выборка: ${num(data.totalMatched)} заказов)` : '';
  const subTitle = data.netShiftPct === undefined
    ? `Русскоязычные заказы: для сравнения бюджетов пока мало заказов с суммой${sample}`
    : `Русскоязычные заказы: медианный бюджет новых задач ${signedPct(data.netShiftPct)} к типовым${sample}. Это разница в цене разных работ, а не надбавка за навык.`;

  return `<section class="rs-section">
  <div class="rs-section-head">
    <div>
      <h2>Типовые задачи и новые AI-задачи в заказах</h2>
      <p class="muted small">${escapeHtml(subTitle)}</p>
    </div>
    <button type="button" class="btn ghost btn-sm rs-embed-btn" data-embed="${escapeHtml(embedCode)}">&lt;/&gt; Встроить</button>
  </div>
  <div class="rs-transform-grid">
    <div class="rs-transform-col">
      <div class="rs-transform-title">
        <span>Типовые задачи</span>
        <span class="rs-mono text-muted">${data.routineMedian ? `медиана ${formatRub(data.routineMedian)}` : 'базовые задачи'}</span>
      </div>
      <ul class="rs-transform-list">
        ${data.routine.map((item) => `<li>
          <span>${escapeHtml(item.label)} <span class="muted small">(n = ${num(item.n)})</span></span>
          <span class="rs-mono rs-diff-down">${item.medianPay ? formatRub(item.medianPay) : '—'}</span>
        </li>`).join('')}
      </ul>
    </div>
    <div class="rs-transform-col">
      <div class="rs-transform-title">
        <span>Новые AI-задачи</span>
        <span class="rs-mono ${(data.netShiftPct ?? 0) < 0 ? 'rs-diff-down' : 'rs-diff-up'}">${data.emergingMedian ? `медиана ${formatRub(data.emergingMedian)}` : 'AI-компетенции'}</span>
      </div>
      <ul class="rs-transform-list">
        ${data.emerging.map((item) => `<li>
          <span>${escapeHtml(item.label)} <span class="muted small">(n = ${num(item.n)})</span></span>
          <span class="rs-mono ${item.changePct !== undefined && item.changePct < 0 ? 'rs-diff-down' : 'rs-diff-up'}">${item.medianPay ? formatRub(item.medianPay) : '—'}${item.changePct !== undefined ? ` · ${signedPct(item.changePct)}` : ''}</span>
        </li>`).join('')}
      </ul>
    </div>
  </div>
</section>`;
}

function bumpSpline(r0: number, r1: number, r2: number, r3: number): string {
  const y0 = 50 + (r0 - 1) * 40;
  const y1 = 50 + (r1 - 1) * 40;
  const y2 = 50 + (r2 - 1) * 40;
  const y3 = 50 + (r3 - 1) * 40;
  return `M 60 ${y0} C 155 ${y0}, 155 ${y1}, 250 ${y1} S 345 ${y2}, 440 ${y2} S 535 ${y3}, 630 ${y3}`;
}

function renderBumpChartSection(bump?: Report['bumpChart'], baseUrl = ''): string {
  if (!bump || bump.quarters.length < 4 || bump.months.length < 4) return '';
  const embedCode = `<iframe src="${baseUrl}/embed/bump" width="100%" height="380" frameborder="0"></iframe>`;

  const getLines = (snapshots: BumpSnapshot[]) => {
    const lastSnap = snapshots[3];
    if (!lastSnap) return [];
    const sorted = [...lastSnap.ranks].sort((a, b) => a.rank - b.rank);
    return sorted.map((item) => {
      const r0 = snapshots[0]?.ranks.find((r: BumpRankItem) => r.name === item.name)?.rank ?? item.rank;
      const r1 = snapshots[1]?.ranks.find((r: BumpRankItem) => r.name === item.name)?.rank ?? item.rank;
      const r2 = snapshots[2]?.ranks.find((r: BumpRankItem) => r.name === item.name)?.rank ?? item.rank;
      const r3 = item.rank;
      const cy = 50 + (r3 - 1) * 40;
      return {
        name: item.name,
        rank: r3,
        d: bumpSpline(r0, r1, r2, r3),
        cy,
        ty: cy + 4,
      };
    });
  };

  const weeklyLines = getLines(bump.quarters);
  const rhythmLines = getLines(bump.months);
  if (weeklyLines.length < 5 || rhythmLines.length < 5) return '';

  const STYLES = [
    { stroke: 'var(--emerald)', fill: 'var(--emerald)', width: 3.5, fontColor: 'var(--emerald)', weight: 'bold' },
    { stroke: '#2563eb', fill: '#2563eb', width: 3.5, fontColor: '#2563eb', weight: 'bold' },
    { stroke: 'var(--ink)', fill: 'var(--ink)', width: 3, fontColor: 'var(--muted)', weight: '500' },
    { stroke: 'var(--muted)', fill: 'var(--muted)', width: 2.5, fontColor: 'var(--muted)', weight: '500' },
    { stroke: 'var(--line-strong)', fill: 'var(--line-strong)', width: 2, fontColor: 'var(--muted)', weight: '500' },
  ];

  const p0 = bump.quarters[0]?.period ?? '';
  const p1 = bump.quarters[1]?.period ?? '';
  const p2 = bump.quarters[2]?.period ?? '';
  const p3 = bump.quarters[3]?.period ?? '';

  const clientData = {
    weeks: {
      periods: bump.quarters.map((q) => q.period),
      lines: weeklyLines,
    },
    days: {
      periods: bump.months.map((m) => m.period),
      lines: rhythmLines,
    },
  };

  return `<section class="rs-section">
  <div class="rs-section-head">
    <div>
      <h2>Эволюция позиций направлений в рейтинге спроса</h2>
      <p class="muted small">S-образные кривые отслеживают смену мест ключевых специализаций по неделям и дням недели</p>
    </div>
    <div class="rs-head-actions">
      <div class="rs-toggle-group">
        <button type="button" class="rs-toggle-pill active" id="btn-bump-w" onclick="switchBump('weeks')">По неделям</button>
        <button type="button" class="rs-toggle-pill" id="btn-bump-d" onclick="switchBump('days')">По дням недели</button>
      </div>
      <button type="button" class="btn ghost btn-sm rs-embed-btn" data-embed="${escapeHtml(embedCode)}">&lt;/&gt; Встроить</button>
    </div>
  </div>
  <div class="rs-bump-box">
    <svg id="bump-chart-svg" viewBox="0 0 760 250" class="rs-bump-svg">
      <g id="bump-axis-labels" font-size="11" font-weight="600" fill="var(--muted)" text-anchor="middle">
        <text x="60" y="25">${escapeHtml(p0)}</text>
        <text x="250" y="25">${escapeHtml(p1)}</text>
        <text x="440" y="25">${escapeHtml(p2)}</text>
        <text x="630" y="25" fill="var(--ink)">${escapeHtml(p3)}</text>
      </g>
      <g stroke="var(--line)" stroke-width="1">
        <line x1="60" y1="50" x2="630" y2="50" />
        <line x1="60" y1="90" x2="630" y2="90" />
        <line x1="60" y1="130" x2="630" y2="130" />
        <line x1="60" y1="170" x2="630" y2="170" />
        <line x1="60" y1="210" x2="630" y2="210" />
      </g>
      ${weeklyLines.map((l, i) => {
        const s = STYLES[i] ?? STYLES[4]!;
        return `
      <path id="bump-p${i + 1}" class="bump-spline" d="${l.d}" fill="none" stroke="${s.stroke}" stroke-width="${s.width}" />
      <circle id="bump-d${i + 1}" cx="630" cy="${l.cy}" r="${i < 2 ? 5 : 4}" fill="${s.fill}" />
      <text id="bump-l${i + 1}" x="645" y="${l.ty}" font-size="11" font-weight="${s.weight}" fill="${s.fontColor}">#${l.rank} ${escapeHtml(l.name)}</text>
      `;
      }).join('')}
    </svg>
  </div>
  <script>
    window.BUMP_DATA = ${jsonForScript(clientData)};
  </script>
</section>`;
}

const QUOTE_SCRIPT = `<script>
document.addEventListener('click', (event) => {
  const quoteBtn = event.target.closest('[data-quote]');
  if (quoteBtn) {
    navigator.clipboard.writeText(quoteBtn.dataset.quote).then(() => {
      const label = quoteBtn.textContent;
      quoteBtn.textContent = '✓ Скопировано';
      setTimeout(() => { quoteBtn.textContent = label; }, 1800);
    });
    return;
  }
  const embedBtn = event.target.closest('[data-embed]');
  if (embedBtn) {
    const dialog = document.getElementById('embed-dialog');
    const textarea = document.getElementById('embed-code-textarea');
    if (dialog && textarea) {
      textarea.value = embedBtn.dataset.embed;
      dialog.showModal();
    }
  }
});

function copyEmbedCode(button) {
  const textarea = document.getElementById('embed-code-textarea');
  if (!textarea) return;
  navigator.clipboard.writeText(textarea.value).then(() => {
    const label = button.textContent;
    button.textContent = '✓ Скопировано';
    setTimeout(() => { button.textContent = label; }, 1800);
  });
}

function switchBump(mode) {
  const btnW = document.getElementById('btn-bump-w');
  const btnD = document.getElementById('btn-bump-d');
  const axis = document.getElementById('bump-axis-labels');
  if (!window.BUMP_DATA || !axis) return;
  const isWeeks = mode === 'weeks';
  if (btnW) btnW.classList.toggle('active', isWeeks);
  if (btnD) btnD.classList.toggle('active', !isWeeks);

  const data = isWeeks ? window.BUMP_DATA.weeks : window.BUMP_DATA.days;
  if (!data || !data.periods || !data.lines) return;

  axis.innerHTML = '<text x="60" y="25">' + data.periods[0] + '</text>' +
    '<text x="250" y="25">' + data.periods[1] + '</text>' +
    '<text x="440" y="25">' + data.periods[2] + '</text>' +
    '<text x="630" y="25" fill="var(--ink)">' + data.periods[3] + '</text>';

  data.lines.forEach((l, idx) => {
    const p = document.getElementById('bump-p' + (idx + 1));
    const d = document.getElementById('bump-d' + (idx + 1));
    const t = document.getElementById('bump-l' + (idx + 1));
    if (p) p.setAttribute('d', l.d);
    if (d) d.setAttribute('cy', l.cy);
    if (t) {
      t.setAttribute('y', l.ty);
      t.textContent = '#' + l.rank + ' ' + l.name;
    }
  });
}
</script>`;

function reportUrl(report: Report): string {
  return report.kind === 'month' && report.period.slug ? `/research/${report.period.slug}` : '/research';
}

function citeLine(report: Report, baseUrl: string): string {
  return `openradar, «Рынок труда в IT и фрилансе», ${report.period.label}. ${baseUrl}${reportUrl(report)}`;
}

export function renderReportPage(options: {
  report: Report;
  baseUrl: string;
  version: string;
  snapshots: Array<{ period: string }>;
  auth?: AuthDisplay;
}): string {
  const { report, baseUrl, version, snapshots } = options;
  const { jobs, gigs, totals } = report;
  const isLive = report.kind === 'live';
  const title = isLive ? 'Рынок труда в IT и фрилансе' : `Рынок труда в IT и фрилансе: ${report.period.label.toLowerCase()}`;
  const roleHref = (slug: string): string | undefined =>
    jobs.roles.some((r) => r.slug === slug) ? `/research/roles/${slug}` : undefined;
  const intlMedian = jobs.intl.median;
  const usd = report.fx?.USD;
  const oldMethod = report.version < REPORT_VERSION
    ? `<p class="notice">Отчёт зафиксирован по прежней версии методики (${report.version}): в нём заказы смешаны с зарубежными, а «денежная масса» складывает зарплаты с бюджетами проектов. Цифры не менялись, чтобы ссылки на них оставались верными, но эти разделы цитировать не стоит. <a href="/research/methodology#versions">Что изменилось</a>.</p>`
    : '';

  const body = `
<nav class="crumbs" aria-label="Навигация"><a href="/">openradar</a> / ${isLive ? 'Исследования' : `<a href="/research">Исследования</a> / ${escapeHtml(report.period.label)}`}</nav>
<div class="page-head"><div>
  <h1>${escapeHtml(title)}</h1>
  <p class="muted small">${isLive
    ? `Живой отчёт по ${num(totals.posts)} публикациям за ${escapeHtml(report.period.label)}. Пересчитывается каждые 15 минут.`
    : `Отчёт за ${escapeHtml(report.period.label.toLowerCase())}: ${num(totals.posts)} публикаций. Цифры зафиксированы и не меняются.`}
  Источники: биржи фриланса, hh.ru, Хабр Карьера, «Работа России», Telegram-каналы и участники openradar.</p>
</div><div class="actions"><a class="btn ghost" href="/research/index">Индекс</a><a class="btn ghost" href="/research/methodology">Методика</a><a class="btn ghost" href="/research/dataset.csv">Данные CSV</a></div></div>
${oldMethod}

<div class="rs-kpis">
  ${kpi(num(totals.jobs), 'вакансий')}
  ${kpi(formatShare(jobs.payShare), 'с указанной зарплатой')}
  ${kpi(jobs.pay.median ? formatRub(jobs.pay.median) : '—', 'медианная зарплата в месяц')}
  ${jobs.it?.median ? kpi(formatRub(jobs.it.median), 'медиана в IT-вакансиях') : ''}
  ${kpi(num(totals.gigs), 'заказов на фрилансе')}
  ${kpi(gigs.budget.median ? formatRub(gigs.budget.median) : '—', 'медианный бюджет заказа')}
  ${kpi(num(totals.companies), 'работодателей')}
</div>

${renderEditorialInsight(report.editorialInsight)}

${renderCartaSection(report.cartaCapital, baseUrl)}

${renderTaskTransformationSection(report.taskTransformation, baseUrl)}

${renderBumpChartSection(report.bumpChart, baseUrl)}

${report.findings.length ? `<section class="rs-section">
  <h2>Главные показатели</h2>
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
  <p class="small">Удалённую работу допускают <b>${formatShare(jobs.remote.share)}</b> вакансий.${jobs.remote.remote.median && jobs.remote.office.median ? ` Медиана: ${formatRub(jobs.remote.remote.median)} с удалёнкой и ${formatRub(jobs.remote.office.median)} без неё.` : ''}${jobs.remote.adjusted ? ` Вакансии с удалёнкой в среднем старше по уровню, поэтому важнее другое сравнение: при той же роли и уровне разница ${signedPct(jobs.remote.adjusted.pct)} (сравнение по ${num(jobs.remote.adjusted.n)} вакансиям).` : ''}</p>
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
  ${jobs.ai.adjusted ? `<p class="small">При той же роли и уровне разница ${signedPct(jobs.ai.adjusted.pct)} (сравнение по ${num(jobs.ai.adjusted.n)} вакансиям).</p>` : ''}
</section>

<section class="rs-section">
  <h2>Динамика</h2>
  ${weekly(jobs.weekly, jobs.weeklyIndexed)}
</section>

${jobs.companies.length ? `<section class="rs-section">
  <h2>Кто больше всех нанимает</h2>
  ${countBars(jobs.companies.slice(0, 12).map((c) => ({ label: c.name, n: c.n })))}
</section>` : ''}

<section class="rs-section">
  <h2>Фриланс: бюджеты заказов</h2>
  <p class="small">Русскоязычные заказы. Бюджет указан в <b>${formatShare(gigs.budgetShare)}</b> из них. Бюджет — за весь проект; на Kwork это желаемая цена заказчика.${totals.intlGigs ? ` Англоязычные заказы (${num(totals.intlGigs)}) сюда не входят.` : ''}</p>
  ${rangeChart(sliceRows(gigs.byCategory.filter((s) => s.key !== 'other')))}
  ${gigs.hourly.median ? `<p class="small">Почасовая ставка в заказах, где она указана: медиана ${formatRub(gigs.hourly.median)} в час (n = ${gigs.hourly.n}).</p>` : ''}
</section>

${intlMedian ? `<section class="rs-section">
  <h2>Международная удалёнка</h2>
  <p class="small">Англоязычные вакансии: зарубежные доски и карьерные страницы компаний (${num(totals.intlJobs ?? 0)} вакансий). Медиана в долларах и евро — <b>$${num(rubMonthToUsdYear(intlMedian, usd))} в год</b> (n = ${jobs.intl.n}). В основные цифры отчёта они не входят.</p>
</section>` : ''}

<section class="rs-section">
  <h2>Откуда данные</h2>
  ${countBars(totals.platforms.slice(0, 12).map((p) => ({ label: p.key, n: p.n })))}
  ${totals.payOrigins && Object.keys(totals.payOrigins).length ? `<p class="small">Откуда взята оплата: ${Object.entries(totals.payOrigins).map(([origin, n]) => `${escapeHtml(ORIGIN_LABELS[origin] ?? origin)} — ${num(n)}`).join(', ')}.${totals.excluded ? ` Модель отсеяла ${num(totals.excluded)} рекламных и нерелевантных публикаций.` : ''}</p>` : ''}
  ${jobs.byPlatform?.length ? `<h3>Медиана зависит от площадки</h3><p class="small">На площадках разные вакансии, поэтому общая медиана меняется вместе с составом источников.</p>${rangeChart(sliceRows(jobs.byPlatform))}` : ''}
  ${jobs.bounds ? `<p class="small">Как указана сумма: вилка — ${num(jobs.bounds.range)}, только «от» — ${num(jobs.bounds.from)}, только «до» — ${num(jobs.bounds.to)}, одна сумма — ${num(jobs.bounds.single)}.${jobs.bounds.rangeMedian ? ` Медиана только по вилкам — ${formatRub(jobs.bounds.rangeMedian)}.` : ''}${totals.foreignPayJobs ? ` Ещё ${num(totals.foreignPayJobs)} русскоязычных вакансий платят в долларах или евро и в рублёвую медиану не входят.` : ''}</p>` : ''}
</section>

<section class="rs-section prose" style="margin-top:36px">
  <h2>Как ссылаться</h2>
  <p>Данные openradar открыты по лицензии ${LICENSE}: их можно использовать в публикациях и исследованиях со ссылкой на источник.</p>
  <p class="rs-cite"><code>${escapeHtml(citeLine(report, baseUrl))}</code> ${quoteButton(citeLine(report, baseUrl))}</p>
  <ul>
    <li><a href="/research/methodology">Методика</a>: откуда публикации, как считается зарплата, что не входит в выборку.</li>
    <li><a href="/research/dataset.csv">Данные по вакансиям и заказам (CSV)</a> — без текстов и контактов.</li>
    <li><a href="${isLive ? '/research/report.json' : `/research/${escapeHtml(report.period.slug ?? '')}.json`}">Этот отчёт в JSON</a>.</li>
    <li>Нужен срез под вашу тему — <a href="${REPO_URL}/issues" target="_blank" rel="noopener">напишите на GitHub</a>.</li>
  </ul>
  ${snapshots.length ? `<h2>Отчёты по месяцам</h2><div class="chip-links">${snapshots.map((s) => `<a href="/research/${escapeHtml(s.period)}">${escapeHtml(monthLabel(s.period))}</a>`).join('')}</div>` : '<p class="muted small">Первый месячный отчёт будет зафиксирован в начале следующего месяца.</p>'}
  ${jobs.roles.length ? `<h2>По направлениям</h2><div class="chip-links">${jobs.roles.map((r) => `<a href="/research/roles/${escapeHtml(r.slug)}">${escapeHtml(r.label)}</a>`).join('')}</div>` : ''}
</section>

<dialog id="embed-dialog" class="auth-dialog">
  <div class="auth-card" style="max-width:520px">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
      <h3 style="margin:0;font-size:16px;font-weight:600">Встроить график</h3>
      <button type="button" class="modal-close-btn" onclick="document.getElementById('embed-dialog').close()" aria-label="Закрыть окно">×</button>
    </div>
    <p class="muted small" style="margin-bottom:12px">Вставьте этот HTML-код на свой сайт, в статью на Habr/VC или в блог. График адаптивен и содержит атрибуцию openradar (CC BY 4.0).</p>
    <textarea id="embed-code-textarea" readonly rows="3" style="width:100%;font-family:monospace;font-size:12px;padding:8px;border:1px solid var(--line);border-radius:6px;background:var(--soft);resize:none"></textarea>
    <div style="margin-top:12px;display:flex;justify-content:flex-end;gap:8px">
      <button type="button" class="btn" onclick="copyEmbedCode(this)">Скопировать код</button>
    </div>
  </div>
</dialog>`;

  const dataset = {
    '@context': 'https://schema.org',
    '@type': 'Dataset',
    name: title,
    description: `Зарплаты и бюджеты в вакансиях и заказах: ${report.period.label}. Медианы и квартили по направлениям, уровням, языкам, городам и навыкам.`,
    url: `${baseUrl}${reportUrl(report)}`,
    license: 'https://creativecommons.org/licenses/by/4.0/',
    creator: { '@type': 'Organization', name: 'openradar', url: `${baseUrl}/` },
    temporalCoverage: `${report.period.from.slice(0, 10)}/${report.period.to.slice(0, 10)}`,
    variableMeasured: ['Salary', 'Contract Budget', 'Tech Stack', 'Role', 'Quality Score'],
    distribution: [
      { '@type': 'DataDownload', encodingFormat: 'text/csv', contentUrl: `${baseUrl}/research/dataset.csv` },
      { '@type': 'DataDownload', encodingFormat: 'application/json', contentUrl: `${baseUrl}/research/report.json` },
    ],
  };
  const description = jobs.pay.median
    ? `Медианная зарплата в вакансиях — ${formatRub(jobs.pay.median)}, зарплату указывают в ${formatShare(jobs.payShare)} вакансий. Зарплаты по направлениям, уровням, языкам и городам; бюджеты заказов на фрилансе. ${report.period.label}.`
    : `Зарплаты в вакансиях и бюджеты заказов по данным openradar: ${report.period.label}.`;

  return layout({
    auth: options.auth,
    title,
    version,
    active: 'research',
    body,
    script: QUOTE_SCRIPT,
    head: `<meta name="description" content="${escapeHtml(description)}">
<meta property="og:description" content="${escapeHtml(description)}">
<link rel="canonical" href="${escapeHtml(`${baseUrl}${reportUrl(report)}`)}">
<link rel="alternate" hreflang="ru" href="${escapeHtml(`${baseUrl}${reportUrl(report)}`)}">
<link rel="alternate" hreflang="en" href="${escapeHtml(`${baseUrl}/en${reportUrl(report)}`)}">
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

export function renderEmbedPage(options: { chartId: string; report: Report; baseUrl: string }): string | undefined {
  const { chartId, report, baseUrl } = options;
  let chartHtml = '';
  let title = '';

  if (chartId === 'carta') {
    title = 'Заказы: число против суммы бюджетов — openradar';
    chartHtml = renderCartaSection(report.cartaCapital, baseUrl);
  } else if (chartId === 'task-transformation') {
    title = 'Типовые и новые AI-задачи в заказах — openradar';
    chartHtml = renderTaskTransformationSection(report.taskTransformation, baseUrl);
  } else if (chartId === 'bump') {
    title = 'Рейтинг технологий — openradar';
    chartHtml = renderBumpChartSection(report.bumpChart, baseUrl);
  } else {
    return undefined;
  }

  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    :root {
      --bg: #ffffff;
      --surface: #fafafa;
      --surface-hover: #f4f4f5;
      --ink: #09090b;
      --muted: #71717a;
      --line: #e4e4e7;
      --line-strong: #d4d4d8;
      --soft: #f4f4f5;
      --emerald: #10b981;
      --rose: #ef4444;
      --blue: #2563eb;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #09090b;
        --surface: #121215;
        --surface-hover: #1c1c22;
        --ink: #f4f4f5;
        --muted: #a1a1aa;
        --line: #27272a;
        --line-strong: #3f3f46;
        --soft: #18181b;
        --emerald: #34d399;
        --rose: #f87171;
        --blue: #3b82f6;
      }
    }
    * { box-sizing: border-box; }
    body { margin: 0; padding: 12px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: var(--bg); color: var(--ink); font-size: 13px; }
    .rs-section { margin-top: 0; }
    .rs-section > h2 { font-size: 15px; margin: 0 0 4px; color: var(--ink); }
    .rs-embed-btn { display: none !important; }
    .muted { color: var(--muted); }
    .small { font-size: 12px; }
    .rs-section-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 12px; }
    .rs-head-actions { display: flex; align-items: center; gap: 8px; }
    .rs-toggle-group { display: inline-flex; border: 1px solid var(--line); border-radius: 9999px; padding: 2px; background: var(--surface); }
    .rs-toggle-pill { border: none; background: transparent; padding: 3px 10px; font-size: 11px; border-radius: 9999px; color: var(--muted); cursor: pointer; transition: all 0.15s ease; font-family: inherit; }
    .rs-toggle-pill.active { background: var(--ink); color: var(--bg); font-weight: 600; }
    .rs-dual-table { border: 1px solid var(--line); border-radius: 8px; padding: 12px 16px; background: var(--bg); }
    .rs-dual-head { display: grid; grid-template-columns: minmax(140px, 35%) 1fr 1fr; font-size: 11.5px; font-weight: 600; color: var(--muted); padding-bottom: 6px; border-bottom: 1px solid var(--line); }
    .rs-dual-row { display: grid; grid-template-columns: minmax(140px, 35%) 1fr 1fr; align-items: center; padding: 8px 0; border-bottom: 1px solid var(--line); font-size: 12px; }
    .rs-dual-row:last-child { border-bottom: none; }
    .rs-dual-vol, .rs-dual-cap { display: flex; align-items: center; justify-content: flex-end; gap: 8px; }
    .rs-bar-vol-wrap { width: 80px; height: 7px; border-radius: 9999px; background: var(--soft); overflow: hidden; display: flex; justify-content: flex-end; }
    .rs-bar-vol { height: 100%; background: var(--ink); border-radius: 9999px; }
    .rs-bar-cap-wrap { width: 100px; height: 9px; border-radius: 9999px; background: var(--soft); border: 1px solid var(--ink); padding: 1px; }
    .rs-bar-cap { height: 100%; background: var(--emerald); border-radius: 9999px; }
    .rs-transform-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .rs-transform-col { border: 1px solid var(--line); border-radius: 8px; padding: 12px 14px; background: var(--bg); }
    .rs-transform-title { display: flex; justify-content: space-between; align-items: center; font-size: 11.5px; font-weight: 600; padding-bottom: 6px; border-bottom: 1px solid var(--line); margin-bottom: 6px; }
    .rs-transform-list { list-style: none; padding: 0; margin: 0; font-size: 12px; }
    .rs-transform-list li { display: flex; justify-content: space-between; align-items: center; padding: 5px 0; border-bottom: 1px solid var(--line); }
    .rs-transform-list li:last-child { border-bottom: none; }
    .rs-diff-down { color: var(--rose); font-weight: 600; font-family: monospace; }
    .rs-diff-up { color: var(--emerald); font-weight: 600; font-family: monospace; }
    .rs-bump-box { border: 1px solid var(--line); border-radius: 8px; padding: 12px; background: var(--bg); overflow-x: auto; }
    .rs-bump-svg { width: 100%; height: auto; min-width: 460px; }
    .bump-spline { transition: d 0.45s cubic-bezier(0.4, 0, 0.2, 1); }
    .embed-footer { margin-top: 14px; padding-top: 8px; border-top: 1px solid var(--line); font-size: 11px; color: var(--muted); display: flex; justify-content: space-between; align-items: center; }
    .embed-footer a { color: var(--ink); text-decoration: none; font-weight: 500; }
    .embed-footer a:hover { text-decoration: underline; }
    @media (max-width: 600px) {
      .rs-transform-grid { grid-template-columns: 1fr; }
      .rs-dual-head, .rs-dual-row { grid-template-columns: 1fr; gap: 4px; }
      .rs-dual-vol, .rs-dual-cap { justify-content: flex-start; }
    }
  </style>
</head>
<body>
  ${chartHtml}
  <footer class="embed-footer">
    <span>Данные: <a href="${escapeHtml(baseUrl)}/research" target="_blank" rel="noopener">openradar</a> (CC BY 4.0)</span>
    <span>Обновляется каждые 15 минут</span>
  </footer>
  ${QUOTE_SCRIPT}
  <script>
    function sendHeight() {
      try { window.parent.postMessage({ type: 'openradar:resize', height: document.body.scrollHeight }, '*'); } catch(e) {}
    }
    window.addEventListener('load', sendHeight);
    window.addEventListener('resize', sendHeight);
  </script>
</body>
</html>`;
}

export function renderRolePage(options: { detail: RoleDetail; report: Report; baseUrl: string; version: string; auth?: AuthDisplay; lang?: SupportedLang }): string {
  const { detail, report, baseUrl, version } = options;
  const ru = (options.lang ?? 'ru') !== 'en';
  const roleName = roleLabel(detail.slug, options.lang);
  const title = ru ? `Зарплаты: ${roleName}` : `Salaries: ${roleName}`;
  const path = ru ? `/research/roles/${detail.slug}` : `/en/research/roles/${detail.slug}`;
  const quote = detail.pay.median
    ? (ru
        ? `По данным openradar, медианная зарплата в вакансиях направления «${roleName}» ${report.period.phrase} составила ${formatRub(detail.pay.median)} в месяц (выборка: ${detail.pay.n} вакансий).`
        : `According to openradar, the median salary in "${roleName}" vacancies for ${report.period.label} was ${formatRub(detail.pay.median)} per month (sample: ${detail.pay.n} vacancies).`)
    : '';
  const body = `
<nav class="crumbs" aria-label="${ru ? 'Навигация' : 'Navigation'}"><a href="/">openradar</a> / <a href="${ru ? '/research' : '/en/research'}">${ru ? 'Исследования' : 'Research'}</a> / ${escapeHtml(roleName)}</nav>
<div class="page-head"><div>
  <h1>${escapeHtml(title)}</h1>
  <p class="muted small">${ru
    ? `${num(detail.n)} вакансий за ${escapeHtml(report.period.label)}, зарплата указана в ${num(detail.withPay)}. Удалённую работу допускают ${formatShare(detail.remoteShare)}.`
    : `${num(detail.n)} vacancies in ${escapeHtml(report.period.label)}, pay specified in ${num(detail.withPay)}. Remote allowed in ${formatShare(detail.remoteShare)}.`}</p>
</div></div>
<div class="rs-kpis">
  ${kpi(detail.pay.median ? formatRub(detail.pay.median) : '—', ru ? 'медиана в месяц' : 'monthly median')}
  ${kpi(detail.pay.p25 ? formatRub(detail.pay.p25) : '—', ru ? '25-й процентиль' : '25th percentile')}
  ${kpi(detail.pay.p75 ? formatRub(detail.pay.p75) : '—', ru ? '75-й процентиль' : '75th percentile')}
  ${kpi(num(detail.n), ru ? 'вакансий' : 'vacancies')}
</div>
${quote ? `<p class="small">${escapeHtml(quote)} ${quoteButton(quote)}</p>` : ''}
<section class="rs-section"><h2>${ru ? 'По уровню' : 'By level'}</h2>${rangeChart(sliceRows(detail.byGrade))}</section>
${detail.byLanguage.some((s) => s.pay.median) ? `<section class="rs-section"><h2>${ru ? 'По языку' : 'By language'}</h2>${rangeChart(sliceRows(detail.byLanguage))}</section>` : ''}
<section class="rs-section"><h2>${ru ? 'По городам' : 'By city'}</h2>${rangeChart(sliceRows(detail.byRegion))}</section>
${detail.skills.length ? `<section class="rs-section"><h2>${ru ? 'Навыки' : 'Skills'}</h2>${rangeChart(detail.skills.map((s) => ({ label: s.skill, n: s.n, pay: s.pay })))}</section>` : ''}
${detail.companies.length ? `<section class="rs-section"><h2>Кто нанимает</h2>${countBars(detail.companies.map((c) => ({ label: c.name, n: c.n })))}</section>` : ''}
<section class="rs-section prose" style="margin-top:36px">
  <p>${ru
    ? 'Свежие вакансии этого направления — в <a href="/?type=job">ленте вакансий</a>. Как считаются цифры — в <a href="/research/methodology">методике</a>. Все направления — в <a href="/research">общем отчёте</a>.'
    : 'Fresh vacancies for this role — in the <a href="/?type=job">job feed</a>. How figures are calculated — in the <a href="/en/research/methodology">methodology</a>. All roles — in the <a href="/en/research">main report</a>.'}</p>
  <div class="chip-links">${report.jobs.roles.filter((r) => r.slug !== detail.slug).slice(0, 12).map((r) => `<a href="${ru ? '/research/roles/' : '/en/research/roles/'}${escapeHtml(r.slug)}">${escapeHtml(roleLabel(r.slug, options.lang))}</a>`).join('')}</div>
</section>`;
  const description = detail.pay.median
    ? (ru
        ? `${roleName}: медианная зарплата в вакансиях ${formatRub(detail.pay.median)} в месяц. Зарплаты по уровням, городам и навыкам, ${report.period.label}.`
        : `${roleName}: median salary in vacancies ${formatRub(detail.pay.median)} per month. Pay by level, city and skills, ${report.period.label}.`)
    : (ru
        ? `${roleName}: зарплаты в вакансиях по данным openradar.`
        : `${roleName}: salaries in vacancies according to openradar.`);
  return layout({
    auth: options.auth,
    title,
    version,
    active: 'research',
    body,
    lang: options.lang,
    script: QUOTE_SCRIPT,
    head: `<meta name="description" content="${escapeHtml(description)}">
<link rel="canonical" href="${escapeHtml(baseUrl + path)}">`,
  });
}

export function renderMethodologyPage(options: { baseUrl: string; version: string; auth?: AuthDisplay }): string {
  const { baseUrl, version } = options;
  const roles = ROLES.filter((r) => r.types.includes('job')).map((r) => r.label).join(', ');
  const body = `
<nav class="crumbs" aria-label="Навигация"><a href="/">openradar</a> / <a href="/research">Исследования</a> / Методика</nav>
<div class="page-head"><div><h1>Методика</h1><p class="muted small">Как openradar считает зарплаты и бюджеты.</p></div></div>
<section class="prose" style="margin-top:0">
  <h2>Что считается</h2>
  <p>Исследования openradar показывают предложение работодателей и заказчиков: какую оплату указывают в опубликованных вакансиях и заказах. Это не зарплаты, которые люди получают на руки, и не результаты опроса. Такие данные хорошо показывают рынок найма прямо сейчас и его изменения от месяца к месяцу.</p>

  <h2>Откуда данные</h2>
  <p>Вакансии и заказы, опубликованные за период на российских площадках (hh.ru, Хабр Карьера, getmatch, GeekJob, «Работа России», FL.ru, Kwork, Freelancehunt), в Telegram-каналах, на международных досках и на карьерных страницах компаний (публичные API систем найма), а также добавленные участниками. <a href="/sources">Полный список источников</a>. Одна и та же публикация на разных площадках считается один раз: openradar склеивает дубликаты по ссылке, по заголовку вместе с работодателем и по близости текста; копии записываются, но в цифры не входят. Публикации, которые участники отметили как мусор или мошенничество, в выборку не входят. Закрытые позже вакансии входят: они были опубликованы в этот период.</p>

  <h2>Русскоязычный и зарубежный рынок</h2>
  <p>Основные цифры отчёта описывают русскоязычный рынок: публикации, написанные в основном кириллицей. Это правило одно для вакансий и заказов. Англоязычные публикации показаны отдельно и в доли, медианы и списки компаний основной части не входят. Иначе тысячи вакансий крупных зарубежных компаний изменили бы долю удалёнки или список работодателей, не говоря ничего о рынке в России.</p>

  <h2>Как определяется зарплата</h2>
  <ul>
    <li>Сначала берётся разметка страницы вакансии (schema.org JobPosting), затем текст публикации, затем бюджет, который указала площадка.</li>
    <li>В тексте учитываются только суммы рядом с валютой или словами «оклад», «зарплата»: «3–5 лет опыта» зарплатой не станет.</li>
    <li>Вилка «от 150 000 до 200 000 ₽» даёт одно значение — середину, 175 000 ₽. Если указана одна граница («от 150 000 ₽» или «до 200 000 ₽»), берётся она, хотя это не точная сумма: отчёт показывает, сколько сумм указано каждым способом, и медиану только по вилкам.</li>
    <li>Годовые суммы делятся на 12. Почасовые ставки в месячную статистику не входят.</li>
    <li>Валюты переводятся в рубли по курсу Банка России на первое число месяца публикации. Один курс на месяц нужен, чтобы отчёт можно было воспроизвести.</li>
    <li>Зарплаты в долларах и евро в рублёвую медиану не входят, в том числе в русскоязычных вакансиях: их число указано в отчёте.</li>
    <li>Заказ с оплатой в месяц в бюджеты проектов не входит.</li>
    <li>Значения меньше 12 000 ₽ или больше 3 000 000 ₽ в месяц считаются ошибкой разбора и отбрасываются. Для суммы месячной оплаты или заказа, прочитанной из свободного текста, верхняя граница 1 000 000 ₽: выше стояли комиссии и случайные числа. У диапазона, верх которого выше границы, берётся нижняя сумма. Рекламные бюджеты, прибыль, бонусы, цены подписок и статистика рынка оплатой не считаются.</li>
    <li>У бирж с полем бюджета (Kwork, FL.ru, Freelancehunt) сумма берётся из этого поля. Сумма из описания без такого поля учитывается только до 150 000 ₽.</li>
    <li>Реклама, статьи каналов и подборки вакансий не входят ни в какие цифры: в них нет одного предложения работы.</li>
    <li>Указана ли сумма до или после вычета налогов, площадки сообщают не всегда, поэтому эти суммы не разделяются.</li>
  </ul>

  <h2 id="index">Индекс openradar</h2>
  <p>Индекс показывает, сколько новых вакансий и заказов появляется каждый день, относительно базового периода, равного 100. Считаются только русскоязычные публикации, которые увидела постоянная панель лент: две ленты hh.ru, общая лента Хабр Карьеры, getmatch, «Работа России», Kwork, FL.ru, Freelancehunt. Другие ленты тех же площадок и новые источники в индекс не входят, иначе он рос бы вместе с нашим охватом, а не с рынком.</p>
  <p>Лента площадки отдаёт и старые вакансии, поднятые в поиске. Поэтому на hh.ru и Хабр Карьере новой считается вакансия, номер которой не больше чем примерно на неделю отстаёт от самого нового. В первую неделю наблюдений без этого правила почти половина «новых» вакансий hh.ru была старше недели.</p>
  <p>Значение дня — среднее за 7 дней. База — среднее число публикаций в день за четыре полные недели с 9 ноября по 6 декабря 2026 года; до 7 декабря база предварительная и считается по всем дням с 30 октября. Индекс не скорректирован на сезонность: для этого нужно хотя бы два года наблюдений, поэтому праздники и конец года видны в нём как есть. Индекс показывает панель лент, а не весь рынок: на hh.ru это небольшая часть всех вакансий. Последние два дня пересчитываются, потому что часть публикаций приходит с опозданием. Если лента панели закроется или изменится, это будет отмечено, а индекс — пересчитан с новой версией.</p>

  <h2>Языковая модель</h2>
  <p>Часть публикаций написана свободным текстом: «оплата 50к», «нужен мидл на питоне». Такие публикации дополнительно читает языковая модель и возвращает строгий набор полей: оплату, направление, уровень, язык, город, компанию. Модель только заполняет пробелы: разметка страницы, правила и бюджет площадки всегда важнее. Ответы с уверенностью ниже ${MIN_CONFIDENCE_PCT}% в статистику не попадают. Сейчас ответы модели в цифры не входят. Они войдут только после проверки на выборке постов, размеченных вручную: совпадение с ручной разметкой должно быть не ниже 85% по направлению и оплате. Сверка модели с нашими же правилами для этого не годится, потому что правила тоже ошибаются. Если модель уверена, что публикация — реклама услуг, резюме или спам, публикация исключается из всех цифр. Сколько зарплат получено каждым способом, указано в отчёте в разделе «Откуда данные».</p>

  <h2>Направление, уровень, язык</h2>
  <p>Направление определяется по названию вакансии по словарю правил, а если название ничего не говорит — по специализации, которую указала площадка. Направления: ${escapeHtml(roles)}. Уровень (Стажёр, Junior, Middle, Senior, Lead) берётся из названия, из отметки площадки или из тегов вроде #middle. Когда в названии несколько уровней («Middle/Senior»), берётся старший. Язык программирования — из названия, затем из списка навыков.</p>
  <p>Правила открыты: <a href="${REPO_URL}/blob/main/src/research/derive.ts" target="_blank" rel="noopener">src/research/derive.ts</a>. Если вакансия попала не в то направление, <a href="${REPO_URL}/issues" target="_blank" rel="noopener">сообщите на GitHub</a>.</p>

  <h2>Статистика</h2>
  <ul>
    <li>Главная величина — медиана: половина вакансий предлагает больше, половина меньше. В отличие от среднего, она не скачет из-за единичных очень высоких зарплат.</li>
    <li>Широкая полоса на графиках — от 25-го до 75-го процентиля: в этот диапазон попадает средняя половина публикаций.</li>
    <li>Тонкая линия — 95% доверительный интервал медианы, он считается по порядковым статистикам и не требует предположений о распределении. Если интервалы двух групп пересекаются, разницу между ними утверждать нельзя. Интервал учитывает только случайность выборки, но не то, какие вакансии вообще публикуют с зарплатой.</li>
    <li>Разница между группами (удалёнка и офис, Москва и регионы, упоминание ИИ) показывается при той же роли и уровне: простая разница медиан в основном отражает разный состав групп. Сравниваются пары «роль и уровень», где в каждой группе есть хотя бы три вакансии, вес пары — меньшая из групп, всего нужно не меньше 30 вакансий. Это сравнение, а не доказательство причины.</li>
    <li>Медиана показывается, если в группе не меньше ${MIN_MEDIAN} публикаций с оплатой, процентили — от ${MIN_QUARTILES}. Группы меньше ${RELIABLE} помечены «мало»: такие цифры стоит цитировать осторожно. В выводы отчёта они не попадают.</li>
    <li>Суммы округлены до тысячи рублей.</li>
  </ul>

  <h2>Заказы: сумма бюджетов и новые AI-задачи</h2>
  <p>Оба блока считаются только по русскоязычным заказам с бюджетом за проект, чтобы сравнивались одинаковые величины. Доля суммы бюджетов показывает, где сосредоточены указанные деньги, и зависит от отдельных крупных заказов. Сравнение типовых и новых AI-задач — это разница в цене разных работ, а не надбавка за навык.</p>

  <h2>Периоды</h2>
  <p>На странице <a href="/research">Исследования</a> — живой отчёт за последние 30 дней, он пересчитывается каждые 15 минут. В начале каждого месяца отчёт за прошедший месяц фиксируется и больше не меняется: на него можно ссылаться.</p>

  <h2>Ограничения</h2>
  <ul>
    <li>Выборка определяется тем, какие ленты мы читаем: это не случайная выборка рынка, и веса к официальной статистике не применяются. Общая медиана меняется вместе с составом источников, поэтому отчёт показывает её по площадкам. Сравнивать месяцы между собой лучше внутри одного направления.</li>
    <li>Зарплату указывают не случайно. Исследования объявлений в США показывают: оплату реже раскрывают высокооплачиваемые профессии и компании, а в низкооплачиваемых указанные суммы выше реальных. Здесь вероятно то же самое, поэтому отчёт описывает только вакансии с указанной оплатой.</li>
    <li>Бюджет заказа на фрилансе — оценка заказчика до переговоров; на Kwork это желаемая цена.</li>
    <li>Направление определяется правилами по заголовку, поэтому часть вакансий попадает не туда или в «Другое». Точность правил ещё не измерена на ручной разметке.</li>
  </ul>

  <h2 id="versions">Версии методики</h2>
  <p><b>Отчёт, версия 2, и индекс, версия 2 (ноябрь 2026).</b> Заказы считаются только по русскоязычному рынку: раньше зарубежные заказы завышали медиану примерно на 40%. «Денежная масса» и сравнение задач считаются внутри одного потока: раньше складывались месячные зарплаты и бюджеты проектов. Курс — Банка России вместо постоянного справочного. Разницы между группами — при той же роли и уровне, у медиан появились интервалы. В индексе панель определяется лентами, а не площадками, поднятые вакансии не считаются новыми, база перенесена на 9 ноября — 6 декабря. Отчёт за октябрь 2026 зафиксирован по версии 1 и не пересчитывался.</p>

  <h2>Данные</h2>
  <p>Данные открыты по лицензии ${LICENSE}. <a href="/research/dataset.csv">CSV</a> содержит по строке на публикацию: дату, площадку, направление, уровень, язык, город, компанию, вилку в рублях и навыки. Тексты и контакты в него не входят. Последние сутки в выгрузку не попадают.</p>
</section>`;
  return layout({
    auth: options.auth,
    title: 'Методика исследований',
    version,
    active: 'research',
    body,
    head: `<meta name="description" content="Как openradar считает зарплаты и бюджеты: источники, разбор вилок, направления и уровни, медианы и пороги выборки.">
<link rel="canonical" href="${escapeHtml(baseUrl)}/research/methodology">
<link rel="alternate" hreflang="en" href="${escapeHtml(baseUrl)}/en/research/methodology">`,
  });
}

export { GRADE_LABELS };
