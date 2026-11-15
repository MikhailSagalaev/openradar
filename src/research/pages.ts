/**
 * The research section: the live market report, frozen monthly reports, role pages and the
 * methodology. Charts are plain HTML bars, so they read on a phone and in both themes.
 */
import { escapeHtml, jsonForScript } from '../core/text.ts';
import { layout, type AuthDisplay } from '../server/ui.ts';
import { translateCity, translateSkill, translateSourceTitle, type SupportedLang } from '../server/i18n.ts';
import { periodEn } from './pages-en.ts';
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
  type GigBracket,
  type GradeMatrixRow,
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
function rangeChart(rows: BarRow[], options: { unit?: (v: number) => string; caption?: string; lang?: SupportedLang } = {}): string {
  const en = options.lang === 'en';
  const shown = rows.filter((row) => row.pay.median !== undefined);
  if (!shown.length) return `<p class="muted small">${en ? `Not enough data yet: at least ${MIN_MEDIAN} posts with stated pay are needed in a group.` : `Пока мало данных: нужна хотя бы ${MIN_MEDIAN} публикаций с оплатой в группе.`}</p>`;
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
      const hint = en
        ? [
            `Median ${unit(row.pay.median!)}`,
            row.pay.ciLow !== undefined ? `95% CI: ${unit(row.pay.ciLow)} — ${unit(row.pay.ciHigh!)}` : '',
            row.pay.p25 !== undefined ? `middle half: ${unit(row.pay.p25)} — ${unit(row.pay.p75!)}` : '',
          ].filter(Boolean).join('; ')
        : [
            `Медиана ${unit(row.pay.median!)}`,
            row.pay.ciLow !== undefined ? `95% интервал: ${unit(row.pay.ciLow)} — ${unit(row.pay.ciHigh!)}` : '',
            row.pay.p25 !== undefined ? `половина публикаций: ${unit(row.pay.p25)} — ${unit(row.pay.p75!)}` : '',
          ].filter(Boolean).join('; ');
      return `<div class="rs-row" title="${escapeHtml(hint)}">
  <div class="rs-label">${label}</div>
  <div class="rs-track">${band}${ci}<span class="rs-dot" style="left:${pct(row.pay.median!)}"></span></div>
  <div class="rs-val"><b>${escapeHtml(unit(row.pay.median!))}</b><span class="rs-n">n = ${row.pay.n}${row.pay.n < RELIABLE ? (en ? ' · low n' : ' · мало') : ''}</span></div>
</div>`;
    })
    .join('');
  return `<div class="rs-chart" role="table">${body}</div>
<p class="rs-legend"><span class="rs-dot-key"></span> ${en ? 'median' : 'медиана'} <span class="rs-ci-key"></span> ${en ? '95% CI of median' : '95% интервал медианы'} <span class="rs-band-key"></span> ${en ? 'middle half (25th to 75th percentile)' : 'половина публикаций (от 25-го до 75-го процентиля)'}${options.caption ? ` · ${escapeHtml(options.caption)}` : ''}</p>`;
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

function quoteButton(quote: string, lang: SupportedLang = 'ru'): string {
  return `<button type="button" class="rs-quote" data-quote="${escapeHtml(quote)}">${lang === 'en' ? 'Copy quote' : 'Скопировать цитату'}</button>`;
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
      quoteBtn.textContent = document.documentElement.lang === 'en' ? '✓ Copied' : '✓ Скопировано';
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
    button.textContent = document.documentElement.lang === 'en' ? '✓ Copied' : '✓ Скопировано';
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


export function renderGradeMatrixSection(
  matrix: GradeMatrixRow[] | undefined,
  roleHref: (slug: string) => string | undefined,
  lang: SupportedLang = 'ru',
): string {
  const rows = (matrix ?? []).filter((r) => r.median !== undefined && (r.junior !== undefined || r.middle !== undefined || r.senior !== undefined || r.lead !== undefined));
  if (rows.length < 2) return '';
  const en = lang === 'en';
  const cell = (v: number | undefined): string => (v !== undefined ? formatRub(v) : '—');
  return `<section class="rs-section">
  <h2>${en ? 'Salary matrix: role × seniority' : 'Матрица зарплат: направление × грейд'}</h2>
  <p class="muted small">${en
    ? 'Median monthly pay (RUB) within each role and seniority cell (shown from 5 vacancies with stated pay per cell), salary disclosure rate, remote share, and typical range spread.'
    : 'Медианная зарплата в месяц внутри каждой пары «направление × уровень» (показывается от 5 вакансий с оплатой в ячейке), доля вакансий с открытой вилкой, удалёнка и типичный разброс внутри вилки.'}</p>
  <div style="overflow-x:auto">
    <table class="table">
      <thead>
        <tr>
          <th>${en ? 'Role' : 'Направление'}</th>
          <th>${en ? 'Median' : 'Медиана'}</th>
          <th>Junior</th>
          <th>Middle</th>
          <th>Senior</th>
          <th>Lead</th>
          <th>Senior / Jr</th>
          <th>${en ? 'Remote' : 'Удалёнка'}</th>
          <th>${en ? 'Pay stated' : 'С зарплатой'}</th>
          <th>${en ? 'Range ±%' : 'Разброс вилки'}</th>
        </tr>
      </thead>
      <tbody>
        ${rows
          .slice(0, 18)
          .map((r) => {
            const href = roleHref(r.slug);
            const name = escapeHtml(roleLabel(r.slug, lang));
            const link = href ? `<a href="${escapeHtml(href)}">${name}</a>` : name;
            const ratio = r.seniorToJuniorRatio ? `${String(r.seniorToJuniorRatio).replace('.', en ? '.' : ',')}×` : '—';
            const spread = r.spreadPct !== undefined ? `±${r.spreadPct}%` : '—';
            return `<tr>
              <td><b>${link}</b> <span class="muted small">(${num(r.withPay)})</span></td>
              <td><b>${cell(r.median)}</b></td>
              <td>${cell(r.junior)}</td>
              <td>${cell(r.middle)}</td>
              <td>${cell(r.senior)}</td>
              <td>${cell(r.lead)}</td>
              <td>${ratio}</td>
              <td>${en ? `${r.remoteShare}%` : formatShare(r.remoteShare)}</td>
              <td>${en ? `${r.payShare}%` : formatShare(r.payShare)}</td>
              <td>${spread}</td>
            </tr>`;
          })
          .join('')}
      </tbody>
    </table>
  </div>
</section>`;
}

export function renderGigBracketsSection(brackets: GigBracket[] | undefined, lang: SupportedLang = 'ru'): string {
  const rows = (brackets ?? []).filter((b) => b.n > 0);
  if (rows.length < 2) return '';
  const en = lang === 'en';
  const labelEn: Record<string, string> = {
    micro: 'Under 3 000 ₽ (micro-tasks)',
    small: '3 000 – 15 000 ₽ (small orders)',
    medium: '15 000 – 50 000 ₽ (mid-sized projects)',
    large: '50 000+ ₽ (large projects & MVPs)',
  };
  return `<div style="margin-top:16px">
  <h3>${en ? 'Order structure by project budget bracket' : 'Структура заказов по размеру чека'}</h3>
  <p class="muted small">${en
    ? 'How order count and total stated budget volume split between micro-tasks and full-scale projects.'
    : 'Как распределяется поток заказов и совокупный объём бюджетов между мелкими доработками и крупными проектами.'}</p>
  <table class="table">
    <thead>
      <tr>
        <th>${en ? 'Budget bracket' : 'Диапазон бюджета'}</th>
        <th>${en ? 'Orders' : 'Заказов'}</th>
        <th>${en ? 'Share of orders' : 'Доля заказов'}</th>
        <th>${en ? 'Share of total budget' : 'Доля суммы бюджетов'}</th>
        <th>${en ? 'Segment median' : 'Медиана в сегменте'}</th>
      </tr>
    </thead>
    <tbody>
      ${rows
        .map(
          (b) => `<tr>
            <td><b>${escapeHtml(en ? (labelEn[b.key] ?? b.label) : b.label)}</b></td>
            <td>${num(b.n)}</td>
            <td>${en ? `${b.nShare}%` : formatShare(b.nShare)}</td>
            <td><b>${en ? `${b.capitalShare}%` : formatShare(b.capitalShare)}</b></td>
            <td>${b.median !== undefined ? formatRub(b.median) : '—'}</td>
          </tr>`,
        )
        .join('')}
    </tbody>
  </table>
</div>`;
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
  <h2>По уровню (грейду)</h2>
  <p class="muted small">Медиана и межквартильный размах (25–75 процентили) по уровням квалификации. Уровень определяется по заголовку, разметке площадки и явным отметкам грейда в тексте.</p>
  ${rangeChart(sliceRows(jobs.itByGrade?.some((s) => s.pay.median !== undefined) ? jobs.itByGrade : jobs.byGrade), { caption: 'грейды в IT-направлениях: от стажёра до руководителя и архитектора' })}
</section>
${renderGradeMatrixSection(jobs.gradeMatrix, roleHref, 'ru')}

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
  <h2>Навыки и зарплатная премия</h2>
  <p class="muted small">Конкретные технологии и инструменты в вакансиях с зарплатой (без общих категорий), отсортированные по медиане. Для частых навыков рассчитана стратифицированная премия при той же роли и грейде.</p>
  ${rangeChart(jobs.skills.map((s) => ({ label: s.premiumPct !== undefined && s.premiumPct !== 0 ? `${s.skill} (${signedPct(s.premiumPct)})` : s.skill, n: s.n, pay: s.pay })))}
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

${(jobs.itCompanies?.length || jobs.companies.length) ? `<section class="rs-section">
  <h2>Кто больше всех нанимает в IT</h2>
  <p class="muted small">Работодатели с наибольшим числом открытых IT-вакансий за период (без розничного и линейного персонала магазинов).</p>
  ${countBars((jobs.itCompanies?.length ? jobs.itCompanies : jobs.companies).slice(0, 12).map((c) => ({ label: c.name, n: c.n })))}
</section>` : ''}

<section class="rs-section">
  <h2>Фриланс: бюджеты заказов</h2>
  <p class="small">Русскоязычные заказы. Бюджет указан в <b>${formatShare(gigs.budgetShare)}</b> из них. Бюджет — за весь проект; на Kwork это желаемая цена заказчика.${totals.intlGigs ? ` Англоязычные заказы (${num(totals.intlGigs)}) сюда не входят.` : ''}</p>
  ${rangeChart(sliceRows(gigs.byCategory.filter((s) => s.key !== 'other')))}
  ${renderGigBracketsSection(gigs.brackets, 'ru')}
  ${gigs.hourly.median ? `<p class="small" style="margin-top:12px">Почасовая ставка в заказах, где она указана: медиана ${formatRub(gigs.hourly.median)} в час (n = ${gigs.hourly.n}).</p>` : ''}
</section>

${intlMedian ? `<section class="rs-section" id="international">
  <h2>Международная удалёнка и глобальный рынок</h2>
  <p class="small">Англоязычные вакансии на зарубежных job-бордах и карьерных страницах компаний в Greenhouse, Lever, Ashby (${num(totals.intlJobs ?? 0)} вакансий). Годовая медиана в валюте — <b>${num(rubMonthToUsdYear(intlMedian, usd))} в год</b>${jobs.intl.p25 && jobs.intl.p75 ? ` (межквартильный коридор ${num(rubMonthToUsdYear(jobs.intl.p25, usd))}–${num(rubMonthToUsdYear(jobs.intl.p75, usd))} в год)` : ''}, n = ${num(jobs.intl.n)} вакансий с указанной вилкой. В рублёвые медианы РФ эти публикации не входят; динамика потока отслеживается в <a href="/research/index#global-index">международном индексе openradar</a>.</p>
  ${jobs.intlByRole?.length ? `<h3 style="margin-top:16px">Годовые зарплаты на глобальном рынке по направлениям ($/год)</h3>
  ${rangeChart(sliceRows(jobs.intlByRole), { unit: (v) => `${num(rubMonthToUsdYear(v, usd))} / год` })}` : ''}
  ${jobs.intlByGrade?.length ? `<h3 style="margin-top:16px">По грейду на международном рынке ($/год)</h3>
  ${rangeChart(sliceRows(jobs.intlByGrade), { unit: (v) => `${num(rubMonthToUsdYear(v, usd))} / год` })}` : ''}
  ${jobs.intlCompanies?.length ? `<h3 style="margin-top:16px">Крупнейшие международные наниматели за период</h3>
  ${countBars(jobs.intlCompanies.slice(0, 10).map((c) => ({ label: c.name, n: c.n })))}` : ''}
  ${gigs.intlBudget?.median ? `<p class="small" style="margin-top:14px"><b>Глобальный фриланс (Freelancer.com, ${num(totals.intlGigs ?? 0)} заказов):</b> медианный проектный бюджет — <b>${num(Math.round(gigs.intlBudget.median / (usd ?? 80)))}</b>${gigs.intlBudget.p25 && gigs.intlBudget.p75 ? ` (половина проектов — от ${num(Math.round(gigs.intlBudget.p25 / (usd ?? 80)))} до ${num(Math.round(gigs.intlBudget.p75 / (usd ?? 80)))})` : ''}, выборка n = ${num(gigs.intlBudget.n)} заказов с бюджетом.</p>` : ''}
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
  const periodLabel = ru ? report.period.label : periodEn(report).label;
  const title = ru ? `Зарплаты: ${roleName}` : `Salaries: ${roleName}`;
  const path = ru ? `/research/roles/${detail.slug}` : `/en/research/roles/${detail.slug}`;
  const quote = detail.pay.median
    ? (ru
        ? `По данным openradar, медианная зарплата в вакансиях направления «${roleName}» ${report.period.phrase} составила ${formatRub(detail.pay.median)} в месяц (выборка: ${detail.pay.n} вакансий).`
        : `According to openradar, the median salary in "${roleName}" vacancies for ${periodLabel} was ${formatRub(detail.pay.median)} per month (sample: ${detail.pay.n} vacancies).`)
    : '';
  const gradeLabelEn: Record<string, string> = { intern: 'Intern', junior: 'Junior', middle: 'Middle', senior: 'Senior', lead: 'Lead' };
  const gradeRows = sliceRows(detail.byGrade).map((r, i) => ({
    ...r,
    label: ru ? r.label : (gradeLabelEn[detail.byGrade[i]?.key ?? ''] ?? r.label),
  }));
  const regionRows = sliceRows(detail.byRegion).map((r) => ({
    ...r,
    label: ru ? r.label : (translateCity(r.label, 'en') ?? r.label),
  }));
  const skillRows = detail.skills.map((s) => {
    const baseName = ru ? s.skill : translateSkill(s.skill, 'en');
    const prem = s.premiumPct !== undefined && s.premiumPct !== 0 ? ` (${signedPct(s.premiumPct)})` : '';
    return {
      label: `${baseName}${prem}`,
      n: s.n,
      pay: s.pay,
    };
  });
  const body = `
<nav class="crumbs" aria-label="${ru ? 'Навигация' : 'Navigation'}"><a href="/">openradar</a> / <a href="${ru ? '/research' : '/en/research'}">${ru ? 'Исследования' : 'Research'}</a> / ${escapeHtml(roleName)}</nav>
<div class="page-head"><div>
  <h1>${escapeHtml(title)}</h1>
  <p class="muted small">${ru
    ? `${num(detail.n)} вакансий за ${escapeHtml(periodLabel)}, зарплата указана в ${num(detail.withPay)}. Удалённую работу допускают ${formatShare(detail.remoteShare)}.`
    : `${num(detail.n)} vacancies in ${escapeHtml(periodLabel)}, pay specified in ${num(detail.withPay)}. Remote allowed in ${formatShare(detail.remoteShare)}.`}</p>
</div></div>
<div class="rs-kpis">
  ${kpi(detail.pay.median ? formatRub(detail.pay.median) : '—', ru ? 'медиана в месяц' : 'monthly median')}
  ${kpi(detail.pay.p25 ? formatRub(detail.pay.p25) : '—', ru ? '25-й процентиль' : '25th percentile')}
  ${kpi(detail.pay.p75 ? formatRub(detail.pay.p75) : '—', ru ? '75-й процентиль' : '75th percentile')}
  ${detail.pay.median && report.jobs.it?.median ? kpi(signedPct(Math.round(((detail.pay.median - report.jobs.it.median) / report.jobs.it.median) * 100)), ru ? 'к медиане в IT' : 'vs IT median') : ''}
  ${kpi(detail.n ? formatShare(Math.round((detail.withPay / detail.n) * 1000) / 10) : '—', ru ? 'указывают зарплату' : 'state the pay')}
  ${detail.spreadPct ? kpi(`±${detail.spreadPct}%`, ru ? 'разброс внутри вилки' : 'typical range spread') : ''}
  ${kpi(num(detail.n), ru ? 'вакансий' : 'vacancies')}
</div>
${quote ? `<p class="small">${escapeHtml(quote)} ${quoteButton(quote, options.lang)}</p>` : ''}
<section class="rs-section"><h2>${ru ? 'По уровню' : 'By level'}</h2>${rangeChart(gradeRows, { lang: options.lang })}</section>
${detail.byLanguage.some((s) => s.pay.median) ? `<section class="rs-section"><h2>${ru ? 'По языку' : 'By language'}</h2>${rangeChart(sliceRows(detail.byLanguage), { lang: options.lang })}</section>` : ''}
<section class="rs-section"><h2>${ru ? 'По городам' : 'By city'}</h2>${rangeChart(regionRows, { lang: options.lang })}</section>
${skillRows.length ? `<section class="rs-section"><h2>${ru ? 'Навыки' : 'Skills'}</h2>${rangeChart(skillRows, { lang: options.lang })}</section>` : ''}
${detail.companies.length ? `<section class="rs-section"><h2>${ru ? 'Кто нанимает' : 'Who is hiring'}</h2>${countBars(detail.companies.map((c) => ({ label: translateSourceTitle(c.name, options.lang), n: c.n })))}` + '</section>' : ''}
<section class="rs-section prose" style="margin-top:36px">
  <p>${ru
    ? 'Свежие вакансии этого направления — в <a href="/?type=job">ленте вакансий</a>. Как считаются цифры — в <a href="/research/methodology">методике</a>. Все направления — в <a href="/research">общем отчёте</a>.'
    : 'Fresh vacancies for this role — in the <a href="/?type=job">job feed</a>. How figures are calculated — in the <a href="/en/research/methodology">methodology</a>. All roles — in the <a href="/en/research">main report</a>.'}</p>
  <div class="chip-links">${report.jobs.roles.filter((r) => r.slug !== detail.slug).slice(0, 12).map((r) => `<a href="${ru ? '/research/roles/' : '/en/research/roles/'}${escapeHtml(r.slug)}">${escapeHtml(roleLabel(r.slug, options.lang))}</a>`).join('')}</div>
</section>`;
  const description = detail.pay.median
    ? (ru
        ? `${roleName}: медианная зарплата в вакансиях ${formatRub(detail.pay.median)} в месяц. Зарплаты по уровням, городам и навыкам, ${periodLabel}.`
        : `${roleName}: median salary in vacancies ${formatRub(detail.pay.median)} per month. Pay by level, city and skills, ${periodLabel}.`)
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
  const body = `<nav class="crumbs" aria-label="Навигация"><a href="/">openradar</a> / <a href="/research">Исследования</a> / Методика</nav>
<div class="page-head"><div><h1>Методика исследований и индекса</h1><p class="muted small">Полная спецификация сбора данных, очистки вилок, стратифицированной статистики и расчёта индекса openradar.</p></div>
<div class="actions"><a class="btn ghost" href="/research">Отчёт</a><a class="btn ghost" href="/research/index">Индекс</a><a class="btn ghost" href="/research/dataset.csv">CSV</a></div></div>

<section class="prose" style="margin-top:0">
  <h2>1. Что измеряется</h2>
  <p>Исследования openradar измеряют <b>сторону спроса (офферы работодателей и заказчиков)</b>: какую оплату предлагают в открытых вакансиях и проектных заказах. Это не опрос работников и не данные ФНС о фонде оплаты труда. Преимущество данных по открытым предложениям — минимальный временной лаг: сдвиги зарплатных вилок, спроса на грейды и стоимости фриланс-задач фиксируются в режиме реального времени.</p>

  <h2>2. Сводная таблица порогов и параметров (Версия 2)</h2>
  <div style="overflow-x:auto">
    <table class="table">
      <thead>
        <tr>
          <th>Параметр</th>
          <th>Значение</th>
          <th>Назначение в расчётах</th>
        </tr>
      </thead>
      <tbody>
        <tr><td><code>MIN_MEDIAN</code></td><td><b>${MIN_MEDIAN}</b> публикаций</td><td>Минимальное число публикаций с оплатой для расчёта медианы и 95% ДИ</td></tr>
        <tr><td><code>MIN_QUARTILES</code></td><td><b>${MIN_QUARTILES}</b> публикаций</td><td>Минимальное число публикаций для показа 25-го и 75-го процентилей (IQR)</td></tr>
        <tr><td><code>RELIABLE</code></td><td><b>${RELIABLE}</b> публикаций</td><td>Порог высокой надёжности; срезы с <code>n &lt; ${RELIABLE}</code> помечаются «мало» и не входят в автовыводы</td></tr>
        <tr><td><code>MIN_ADJUSTED</code></td><td><b>30</b> (от <b>3</b> в ячейке)</td><td>Минимум сопоставленных вакансий в парах «роль × грейд» для расчёта стратифицированной поправки</td></tr>
        <tr><td><code>BASKET_MIN / WEEK_CELL_MIN</code></td><td><b>30 / 10</b> вакансий</td><td>Порог включения направления в фиксированную корзину недельного индекса зарплат Ласпейреса</td></tr>
        <tr><td>Границы зарплат (месяц)</td><td><b>12 000 – 3 000 000 ₽</b></td><td>Допустимый коридор месячного дохода (для сумм из свободного текста потолок — <b>1 000 000 ₽</b>)</td></tr>
        <tr><td>Границы заказа (проект)</td><td><b>300 – 5 000 000 ₽</b></td><td>Допустимый коридор бюджета за проект (для сумм из текста на биржах потолок — <b>150 000 ₽</b>)</td></tr>
        <tr><td>Фильтр свежести панели</td><td><b>Δid ≤ 230 000</b> (hh.ru)<br><b>Δid ≤ 100</b> (Хабр)</td><td>Отсечение старых вакансий, повторно поднятых в поиске (около 7 суток сквозной нумерации)</td></tr>
        <tr><td>Порог доверия LLM</td><td><b>confidence ≥ 0,70</b><br><b>согласие ≥ 85%</b></td><td>Модель дополняет только пропуски правил при уверенности от 70% и совпадении с эталоном от 85%</td></tr>
      </tbody>
    </table>
  </div>

  <h2>3. Источники и трёхуровневая дедупликация</h2>
  <p>В выборку входят вакансии и заказы с российских площадок (hh.ru, Хабр Карьера, getmatch, GeekJob, «Работа России», FL.ru, Kwork, Freelancehunt), профильных Telegram-каналов, международных досок и карьерных страниц компаний (публичные API систем найма Greenhouse, Lever, Ashby), а также сигналы участников сети. <a href="/sources">Полный список источников</a>.</p>
  <ul>
    <li><b>Уровень 1 (Канонический URL и ID):</b> нормализация ссылки и сквозного номера вакансии/заказа на доске.</li>
    <li><b>Уровень 2 (Заголовок + Работодатель):</b> кросс-платформенная склейка одной и той же вакансии, опубликованной одновременно на hh.ru, в Хабр Карьере и в Telegram.</li>
    <li><b>Уровень 3 (Внутрикорпоративное тиражирование по городам):</b> крупные работодатели часто публикуют одну и ту же удалённую вакансию в 20–40 городах с одинаковой вилкой. При расчёте зарплатных медиан комбинация <code>компания + роль + грейд + сумма</code> учитывается строго <b>один раз</b>, чтобы массовый постинг одной компании не смещал медиану рынка.</li>
  </ul>

  <h2>4. Разделение русскоязычного и международного рынков</h2>
  <p>Основные показатели отчёта описывают <b>русскоязычный рынок</b> (публикации, где доля кириллицы в заголовке и первых 600 символах текста не ниже 25%). Англоязычные публикации международных досок и зарубежных карьерных страниц выделены в отдельный блок «Международная удалёнка» (в долларах в год) и не смешиваются с рублёвыми медианами, долей удалёнки или рейтингом российских работодателей.</p>

  <h2>5. Извлечение и нормализация оплаты</h2>
  <ul>
    <li><b>Иерархия источников цены:</b> 1) структурированная разметка <code>schema.org/JobPosting</code> со страницы вакансии; 2) специализированное поле бюджета на фриланс-биржах (Kwork, FL.ru, Freelancehunt); 3) парсер денежных выражений в тексте; 4) верифицированная LLM-экстракция.</li>
    <li><b>Защита от ложных срабатываний:</b> парсер текста принимает число только рядом с явным маркером валюты или словами «оклад / зарплата / доход / на руки». Выражения «3–5 лет опыта», «команда до 20 человек», рекламные бюджеты («открутка от 500 000 ₽»), оборот компании, бонусы за рекомендацию и цены курсов отсекаются контекстными фильтрами.</li>
    <li><b>Точечная оценка вилки:</b> полная вилка $[y_{\min}, y_{\max}]$ приводится к середине $y = (y_{\min} + y_{\max}) / 2$. Если верхняя граница текстовой вилки превышает потолок 1 000 000 ₽ («от 350 000 до 5 000 000 ₽ в продажах»), берётся только консервативная нижняя граница $y_{\min}$. Кроме общей медианы отчёт публикует распределение способов указания оплаты («вилка», только «от», только «до», «одна сумма»), медиану строго по полным вилкам и <b>медианный полуразмах вилки</b> $\pm\frac{y_{\max}-y_{\min}}{2y}\times 100\%$.</li>
    <li><b>Валютная привязка:</b> суммы конвертируются по официальному курсу Банка России на 1-е число месяца публикации, что гарантирует 100% воспроизводимость исторических срезов.</li>
  </ul>

  <h2>6. Классификация направлений, грейдов и навыков</h2>
  <p>Направление (25 специализаций для вакансий и заказов: ${escapeHtml(roles)}) определяется приоритетным каскадом регулярных выражений по заголовку, а при размытом заголовке («Специалист», «Инженер») — по полю специализации площадки и первым строкам описания. Физический и линейный персонал розницы, складов и курьерских служб жёстко изолируется в категорию «Другое» и исключается из лестницы IT-грейдов.</p>
  <p>Грейд (<code>Стажёр</code>, <code>Junior</code>, <code>Middle</code>, <code>Senior</code>, <code>Lead</code>) определяется по заголовку, полю квалификации площадки, явным строкам <code>Грейд: / Уровень:</code> в описании и тегам <code>#junior..#lead</code>. При указании смежного грейда («Middle+/Senior») фиксируется верхний уровень. В общей лестнице грейдов русскоязычные прилагательные «старший / ведущий / руководитель» не применяются к не-IT ролям и рознице, чтобы линейные позиции («Старший кассир», «Старший смены») не занижали медиану уровня Senior (эффект парадокса Симпсона).</p>
  <p>В рейтинге навыков обобщённые названия рубрик («Разработка», «Маркетинг», «Продажи», «Дизайн») отфильтровываются — остаются только конкретные технологии, языки, фреймворки и инструменты. Исходный код правил открыт: <a href="${REPO_URL}/blob/main/src/research/derive.ts" target="_blank" rel="noopener">src/research/derive.ts</a>.</p>

  <h2>7. Статистический аппарат и защита от смещений</h2>
  <ul>
    <li><b>Непараметрический 95% доверительный интервал медианы:</b> зарплатные распределения скошены вправо, поэтому вместо среднего арифметического и стандартного отклонения используется медиана и порядковые статистики. Для выборки объёма $n$, упорядоченной по возрастанию $x_{(0)} \le \dots \le x_{(n-1)}$, ранги границ 95% ДИ вычисляются как:
      <p><code>k = floor((n - 1)/2 - 1.96 * sqrt(n)/2),  CI_95% = [ x_(k),  x_(n - 1 - k) ]</code></p>
      Если доверительные интервалы двух направлений пересекаются, отчёт не называет одно направление «самым высокооплачиваемым», а использует аккуратную формулировку «среди самых высоких».</li>
    <li><b>Стратифицированная поправка Кохрана — Мантеля — Хензеля (борьба с парадоксом Симпсона):</b> прямое сравнение медиан удалённых и офисных вакансий (или вакансий с упоминанием ИИ) даёт ложную разницу, так как на удалёнку чаще нанимают Senior-разработчиков, а в офис — линейный персонал. Поэтому openradar делит выборку на однородные ячейки $c = (\text{role}, \text{grade})$, где в обеих сравниваемых подгруппах есть минимум по 3 вакансии с зарплатой, и вычисляет взвешенный логарифмический сдвиг медиан с весами $w_c = \min(n_{c,1}, n_{c,0})$:
      <p><code>adjustedGap = exp( sum_c( w_c * ln(median_{c,1} / median_{c,0}) ) / sum_c(w_c) ) - 1</code></p>
      Показатель публикуется только при суммарном весе сопоставленных ячеек $\sum w_c \ge 30$. По этой же формуле рассчитывается зарплатная премия отдельных технологий и навыков.</li>
    <li><b>Недельный индекс зарплат с фиксированной корзиной ролей (индекс Ласпейреса):</b> чтобы недельный график зарплат не скакал из-за того, что в одну неделю пришло больше вакансий курьеров или стажёров, в <code>weeklyIndexed</code> фиксируются базовые веса направлений $w_r = N_r / \sum N_j$ (для ролей с $N_r \ge 30$). В каждую неделю средневзвешенная медиана считается в неизменной структуре ролей (база первой недели = 100).</li>
  </ul>

  <h2 id="index">8. Индекс openradar (панельный индекс рыночной активности)</h2>
  <p>Индекс (<a href="/research/index">/research/index</a>) показывает, сколько новых вакансий и фриланс-заказов появляется на рынке каждый день относительно базового периода (9 ноября — 6 декабря 2026 = 100).</p>
  <ul>
    <li><b>Две независимые фиксированные панели (РФ и Global):</b> русскоязычный индекс строится на постоянной панели из 8 эталонных лент (<code>hh-it</code>, <code>hh-remote-project</code>, <code>habr-career</code>, <code>getmatch</code>, <code>trudvsem-remote</code>, <code>kwork-all</code>, <code>fl-all</code>, <code>freelancehunt</code>), а международный индекс (Global &amp; Remote) — на постоянной панели из 10 англоязычных площадок и ATS-систем (<code>himalayas.app</code>, <code>arbeitnow.com</code>, <code>justjoin.it</code>, <code>jobicy.com</code>, <code>weworkremotely.com</code>, <code>remoteworker.co.uk</code>, <code>cryptojobslist.com</code>, <code>jobs.ashbyhq.com</code>, <code>job-boards.greenhouse.io</code>, <code>jobs.lever.co</code>) и глобальной фриланс-биржи <code>freelancer.com</code>. Подключение новых Telegram-каналов или досок в агрегатор не раздувает ни одну из панелей.</li>
    <li><b>Отсечение поднятых старых вакансий (Freshness Gate):</b> на hh.ru и Хабр Карьере вакансии нумеруются последовательно. Если номер вакансии отстаёт от максимального замеченного за окно более чем на $230\,000$ (на hh.ru генерируется ~32 тыс. номеров в сутки) или на $100$ (на Хабр Карьере), это старая вакансия, поднятая работодателем в поиске — в индекс новых публикаций она не входит.</li>
    <li><b>Скользящее 7-дневное окно и виндзоризация технических всплесков:</b> поскольку в субботу и воскресенье поток вакансий падает в 4–6 раз, значение дня рассчитывается как среднее за последние 7 суток $\text{MA}_7(t) = \frac{1}{7}\sum_{i=0}^6 C_{t-i}$. Если до начала базового периода при первичном подключении ленты произошла разовая выгрузка архива за несколько дней ($C_t > 2{,}5 \times \text{median}(C)$), при расчёте $\text{MA}_7$ этот день ограничивается порогом $2{,}5 \times \text{median}(C)$, чтобы через 7 суток выход пика из окна не создавал искусственного обвала индекса.</li>
    <li><b>Субиндексы и недельный профиль:</b> помимо сводных индексов вакансий и фриланс-заказов рассчитываются субиндексы по IT-вакансиям, по каждой площадке панели, по направлениям (от 3 вакансий в день в базе) и профиль внутринедельной сезонности (Пн–Вс).</li>
  </ul>

  <h2>9. Аналитика фриланс-заказов и AI-трансформации</h2>
  <p>Все расчёты по фрилансу выполняются строго внутри потока русскоязычных проектных заказов (<code>payPeriod = project</code>). Отчёт разделяет заказы на 4 бюджетных эшелона (до 3 тыс. ₽, 3–15 тыс. ₽, 15–50 тыс. ₽ и от 50 тыс. ₽), сопоставляя долю в потоке заказов с долей в совокупном объёме заявленных бюджетов. В блоке трансформации задач сравниваются медианы типовых рутинных работ (копирайтинг, шаблонная вёрстка, перевод статей, баннеры) и новых задач вокруг генеративного ИИ (интеграция AI-агентов, RAG, n8n/Make, рефакторинг после Cursor/Lovable, LoRA/ComfyUI, Telegram Mini Apps).</p>

  <h2>10. Ограничения данных</h2>
  <ul>
    <li><b>Смещение раскрытия зарплаты (Disclosure Bias):</b> зарплату указывают не случайно — в младших и массовых ролях вилку публикуют значительно чаще, чем для уровня Senior и Staff. Поэтому в матрице зарплат для каждого направления явно приводится процент раскрытия оплаты.</li>
    <li><b>До и после вычета налогов (Gross vs Net):</b> поскольку в Telegram и части досок работодатели не указывают налоговый статус суммы, начисления до и после вычета НДФЛ не разделяются.</li>
    <li><b>Оценка бюджета до торгов:</b> бюджет заказа на фриланс-бирже — стартовая оценка заказчика до откликов исполнителей.</li>
  </ul>

  <h2 id="versions">11. История версий методики</h2>
  <p><b>Отчёт, версия 2, и индекс, версия 2 (ноябрь 2026).</b> Заказы считаются только по русскоязычному рынку (исключение англоязычных заказов убрало смещение медианы на +40%). Сравнение объёма бюджетов и AI-задач изолировано внутри проектных заказов. Введены курсы Банка России, непараметрические 95% ДИ медиан, стратифицированная поправка Кохрана — Мантеля — Хензеля на состав ролей и грейдов, матрица «Направление × Грейд», расчёт зарплатных премий навыков и очистка лестницы грейдов от не-IT розницы. В индексе введена фиксированная панель лент, фильтр поднятых вакансий по номеру публикации и защита 7-дневного среднего от залповых выгрузок при старте лент. Отчёт за октябрь 2026 сохранён в версии 1 для неизменности цитат.</p>

  <h2>12. Открытые данные</h2>
  <p>Данные публикуются по открытой лицензии ${LICENSE}. Ежедневная выгрузка <a href="/research/dataset.csv">/research/dataset.csv</a> содержит по одной строке на публикацию со всеми производными полями (дата, площадка, направление, грейд, язык программирования, регион, удалёнка, работодатель, нормализованная вилка в рублях, источник цены, теги навыков) без персональных данных и исходных текстов.</p>
</section>`;
  return layout({
    auth: options.auth,
    title: 'Методика исследований и индекса openradar',
    version,
    active: 'research',
    body,
    head: `<meta name="description" content="Полная методика исследований и индекса openradar: источники, нормализация зарплатных вилок, 95% доверительные интервалы, поправка на парадокс Симпсона и формула индекса.">
<link rel="canonical" href="${escapeHtml(baseUrl)}/research/methodology">
<link rel="alternate" hreflang="en" href="${escapeHtml(baseUrl)}/en/research/methodology">`,
  });
}

export { GRADE_LABELS };
