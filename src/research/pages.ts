/**
 * The research section: the live market report, frozen monthly reports, role pages and the
 * methodology. Charts are plain HTML bars, so they read on a phone and in both themes.
 */
import { escapeHtml, jsonForScript } from '../core/text.ts';
import { layout, type AuthDisplay } from '../server/ui.ts';
import { RESEARCH_ENHANCE_HEAD, renderResearchEnhancements } from './enhance.ts';
import { translateCity, translateSkill, translateSourceTitle, type SupportedLang } from '../server/i18n.ts';
import { ROLE_EN, periodEn } from './pages-en.ts';
import { GRADE_LABELS, MIN_CONFIDENCE, ROLES, roleLabel } from './derive.ts';
import type { EffectMagnitude } from './stats.ts';

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
  type LanguageMatrixRow,
  type MarketEconometrics,
  type ScientificAnalysis,
  type CrossMarketComparison,
  type IntlMarketResearch,
  type RegionalComparisonRow,
  type RegionalMatrixRow,
  type Report,
  type RoleDetail,
  type CitySlice,
  type Slice,
} from './report.ts';

export const REPO_URL = 'https://github.com/MikhailSagalaev/openradar';
export const ORIGIN_LABELS: Record<SupportedLang, Record<string, string>> = {
  ru: {
    page: 'разметка страницы вакансии',
    text: 'текст публикации',
    budget: 'бюджет, указанный площадкой',
    model: 'разбор текста моделью',
  },
  en: { page: 'vacancy page markup', text: 'post text', budget: "the board's budget", model: 'language model' },
};
export const LICENSE = 'CC BY 4.0';

interface BarRow {
  label: string;
  href?: string;
  n: number;
  pay: Dist;
}

/** Thousands separated: «12 345» in Russian, «12,345» in English. */
export function formatNum(value: number, lang: SupportedLang = 'ru'): string {
  return lang === 'en' ? new Intl.NumberFormat('en-US').format(value) : new Intl.NumberFormat('ru-RU').format(value).replace(/ /g, ' ');
}
const num = (value: number): string => formatNum(value);
const short = (rub: number): string => (rub >= 1000 ? `${num(Math.round(rub / 1000))} тыс.` : num(rub));

/** Median with its 95% interval on the middle half of pay. Rows below the threshold are left out. */
export function rangeChart(rows: Array<Omit<BarRow, 'n'> & { n?: number }>, options: { unit?: (v: number) => string; caption?: string; lang?: SupportedLang } = {}): string {
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

export function countBars(rows: Array<{ label: string; n: number; note?: string }>, lang: SupportedLang = 'ru'): string {
  if (!rows.length) return '';
  const num = (value: number): string => formatNum(value, lang);
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

export function kpi(value: string, label: string): string {
  return `<div class="rs-kpi"><b>${escapeHtml(value)}</b><span>${escapeHtml(label)}</span></div>`;
}

function sliceRows(slices: Slice[], href?: (key: string) => string | undefined): BarRow[] {
  return slices.map((s) => ({ label: s.label, href: href?.(s.key), n: s.n, pay: s.pay }));
}

export function quoteButton(quote: string, lang: SupportedLang = 'ru'): string {
  return `<button type="button" class="rs-quote" data-quote="${escapeHtml(quote)}">${lang === 'en' ? 'Copy quote' : 'Скопировать цитату'}</button>`;
}

const TASK_EN: Record<string, string> = {
  'Базовый копирайтинг и рерайт текстов': 'Basic copywriting and rewriting',
  'Шаблонная вёрстка и типовые сайты': 'Template markup and stock websites',
  'Типовой перевод документации и статей': 'Routine translation of documents and articles',
  'Типовые баннеры, креативы и карточки': 'Stock banners, ad creatives and product cards',
  'Интеграция AI-агентов, RAG & n8n/Make': 'AI agent integration, RAG and n8n/Make',
  'Рефакторинг кода после AI (Cursor/Lovable)': 'Fixing AI-generated code (Cursor/Lovable)',
  'Обучение LoRA и ComfyUI пайплайны': 'LoRA training and ComfyUI pipelines',
  'Telegram Mini Apps и AI-боты': 'Telegram Mini Apps and AI bots',
};
const PERIOD_EN: Record<string, string> = {
  'Пн (Старт)': 'Mon (start)',
  'Вт–Ср (Пик)': 'Tue–Wed (peak)',
  'Чт–Пт (Спад)': 'Thu–Fri (decline)',
  'Сб–Вс (Уикенд)': 'Sat–Sun (weekend)',
};

/**
 * The report stores Russian labels (roles by their Russian name, task groups, bump periods);
 * English pages translate them here, so frozen reports read in English too.
 */
export function researchLabel(label: string, lang: SupportedLang): string {
  if (lang !== 'en') return label;
  if (label === 'Другие направления') return 'Other roles';
  const role = ROLES.find((r) => r.label === label);
  if (role) return ROLE_EN[role.slug] ?? label;
  if (label === 'Другое') return ROLE_EN.other ?? 'Other';
  const week = /^Неделя (\d)(.*)$/.exec(label);
  if (week) return `Week ${week[1]}${week[2]}`;
  return TASK_EN[label] ?? PERIOD_EN[label] ?? label;
}

const EMBED_LABEL: Record<SupportedLang, string> = { ru: 'Встроить', en: 'Embed' };

export function renderEditorialInsight(insight?: Report['editorialInsight'], lang: SupportedLang = 'ru'): string {
  if (!insight) return '';
  const en = lang === 'en';
  return `<div class="rs-insight-card">
  <div class="rs-insight-head">
    <span class="rs-insight-tag">${en ? 'openradar editorial takeaway' : 'Редакционный вывод openradar'}</span>
    <button type="button" class="rs-quote" data-quote="${escapeHtml(insight.quote)}">${en ? 'Copy for the press' : 'Скопировать для СМИ'}</button>
  </div>
  <p class="rs-insight-text">
    <b>${en ? 'Fact' : 'Факт'}:</b> ${escapeHtml(insight.fact)}<br>
    <b>${en ? 'Contrast' : 'Контраст'}:</b> ${escapeHtml(insight.contrast)}<br>
    <b>${en ? 'Takeaway' : 'Вывод'}:</b> ${escapeHtml(insight.conclusion)}
  </p>
</div>`;
}

export function renderCartaSection(rows?: Report['cartaCapital'], baseUrl = '', lang: SupportedLang = 'ru'): string {
  if (!rows || !rows.length) return '';
  const en = lang === 'en';
  const num = (value: number): string => formatNum(value, lang);
  const share = (value: number): string => (en ? `${value}%` : formatShare(value));
  const embedCode = `<iframe src="${baseUrl}/embed/carta" width="100%" height="380" frameborder="0"></iframe>`;
  const maxVol = Math.max(...rows.map((r) => r.nShare), 1);
  const maxCap = Math.max(...rows.map((r) => r.capitalShare), 1);
  const totalN = rows.reduce((s, r) => s + r.n, 0);

  return `<section class="rs-section">
  <div class="rs-section-head">
    <div>
      <h2>${en ? 'Freelance orders: count versus total budget' : 'Заказы на фрилансе: число против суммы бюджетов'}</h2>
      <p class="muted small">${en
        ? 'Russian-language orders that state a budget. Left: how many there are; right: their share of the sum of those budgets. The sum is sensitive to single large orders.'
        : 'Русскоязычные заказы с указанным бюджетом. Слева — их число, справа — доля в сумме этих бюджетов. Сумма чувствительна к отдельным крупным заказам.'}</p>
    </div>
    <button type="button" class="btn ghost btn-sm rs-embed-btn" data-embed="${escapeHtml(embedCode)}">&lt;/&gt; ${EMBED_LABEL[lang]}</button>
  </div>
  <div class="rs-dual-table">
    <div class="rs-dual-head">
      <div>${en ? 'Specialisation' : 'Специализация'}</div>
      <div style="text-align:right">${en ? 'Orders' : 'Заказов'}</div>
      <div style="text-align:right">${en ? 'Share of total budget' : 'Доля суммы бюджетов'}</div>
    </div>
    ${rows.map((r) => `<div class="rs-dual-row">
      <div class="rs-dual-name font-medium">${escapeHtml(researchLabel(r.label, lang))}</div>
      <div class="rs-dual-vol">
        <div class="rs-bar-vol-wrap"><div class="rs-bar-vol" style="width:${Math.min(100, Math.round((r.nShare / maxVol) * 100))}%"></div></div>
        <span class="rs-mono">${num(r.n)} <span class="muted small">(${share(r.nShare)})</span></span>
      </div>
      <div class="rs-dual-cap">
        <div class="rs-bar-cap-wrap"><div class="rs-bar-cap" style="width:${Math.min(100, Math.round((r.capitalShare / maxCap) * 100))}%"></div></div>
        <span class="rs-mono" style="font-weight:700">${share(r.capitalShare)}</span>
      </div>
    </div>`).join('')}
  </div>
  <p class="muted small" style="margin-top:8px;text-align:right">${en ? `${num(totalN)} orders with a budget in total` : `Всего ${num(totalN)} заказов с бюджетом`}</p>
</section>`;
}

const signedPct = (value: number): string => (value > 0 ? `+${value}%` : `${value}%`);

export function renderTaskTransformationSection(data?: Report['taskTransformation'], baseUrl = '', lang: SupportedLang = 'ru'): string {
  if (!data) return '';
  const en = lang === 'en';
  const num = (value: number): string => formatNum(value, lang);
  const money = (value: number): string => (en ? `₽${num(value)}` : formatRub(value));
  const embedCode = `<iframe src="${baseUrl}/embed/task-transformation" width="100%" height="420" frameborder="0"></iframe>`;
  const sample = data.totalMatched ? (en ? ` (sample: ${num(data.totalMatched)} orders)` : ` (выборка: ${num(data.totalMatched)} заказов)`) : '';
  const subTitle = data.netShiftPct === undefined
    ? (en ? `Russian-language orders: too few orders with a budget to compare yet${sample}` : `Русскоязычные заказы: для сравнения бюджетов пока мало заказов с суммой${sample}`)
    : en
      ? `Russian-language orders: the median budget of new tasks is ${signedPct(data.netShiftPct)} against routine ones${sample}. This is a price gap between different jobs, not a premium for a skill.`
      : `Русскоязычные заказы: медианный бюджет новых задач ${signedPct(data.netShiftPct)} к типовым${sample}. Это разница в цене разных работ, а не надбавка за навык.`;
  const median = en ? 'median' : 'медиана';

  return `<section class="rs-section">
  <div class="rs-section-head">
    <div>
      <h2>${en ? 'Routine tasks and new AI tasks in freelance orders' : 'Типовые задачи и новые AI-задачи в заказах'}</h2>
      <p class="muted small">${escapeHtml(subTitle)}</p>
    </div>
    <button type="button" class="btn ghost btn-sm rs-embed-btn" data-embed="${escapeHtml(embedCode)}">&lt;/&gt; ${EMBED_LABEL[lang]}</button>
  </div>
  <div class="rs-transform-grid">
    <div class="rs-transform-col">
      <div class="rs-transform-title">
        <span>${en ? 'Routine tasks' : 'Типовые задачи'}</span>
        <span class="rs-mono text-muted">${data.routineMedian ? `${median} ${money(data.routineMedian)}` : en ? 'baseline tasks' : 'базовые задачи'}</span>
      </div>
      <ul class="rs-transform-list">
        ${data.routine.map((item) => `<li>
          <span>${escapeHtml(researchLabel(item.label, lang))} <span class="muted small">(n = ${num(item.n)})</span></span>
          <span class="rs-mono rs-diff-down">${item.medianPay ? money(item.medianPay) : '—'}</span>
        </li>`).join('')}
      </ul>
    </div>
    <div class="rs-transform-col">
      <div class="rs-transform-title">
        <span>${en ? 'New AI tasks' : 'Новые AI-задачи'}</span>
        <span class="rs-mono ${(data.netShiftPct ?? 0) < 0 ? 'rs-diff-down' : 'rs-diff-up'}">${data.emergingMedian ? `${median} ${money(data.emergingMedian)}` : en ? 'AI skills' : 'AI-компетенции'}</span>
      </div>
      <ul class="rs-transform-list">
        ${data.emerging.map((item) => `<li>
          <span>${escapeHtml(researchLabel(item.label, lang))} <span class="muted small">(n = ${num(item.n)})</span></span>
          <span class="rs-mono ${item.changePct !== undefined && item.changePct < 0 ? 'rs-diff-down' : 'rs-diff-up'}">${item.medianPay ? money(item.medianPay) : '—'}${item.changePct !== undefined ? ` · ${signedPct(item.changePct)}` : ''}</span>
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

export function renderBumpChartSection(bump?: Report['bumpChart'], baseUrl = '', lang: SupportedLang = 'ru'): string {
  if (!bump || bump.quarters.length < 4 || bump.months.length < 4) return '';
  const en = lang === 'en';
  const label = (text: string): string => researchLabel(text, lang);
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
        name: label(item.name),
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

  const p0 = label(bump.quarters[0]?.period ?? '');
  const p1 = label(bump.quarters[1]?.period ?? '');
  const p2 = label(bump.quarters[2]?.period ?? '');
  const p3 = label(bump.quarters[3]?.period ?? '');

  const clientData = {
    weeks: {
      periods: bump.quarters.map((q) => label(q.period)),
      lines: weeklyLines,
    },
    days: {
      periods: bump.months.map((m) => label(m.period)),
      lines: rhythmLines,
    },
  };

  return `<section class="rs-section">
  <div class="rs-section-head">
    <div>
      <h2>${en ? 'How roles move in the demand ranking' : 'Эволюция позиций направлений в рейтинге спроса'}</h2>
      <p class="muted small">${en ? 'S-curves track how the leading specialisations change places by week and by day of the week' : 'S-образные кривые отслеживают смену мест ключевых специализаций по неделям и дням недели'}</p>
    </div>
    <div class="rs-head-actions">
      <div class="rs-toggle-group">
        <button type="button" class="rs-toggle-pill active" id="btn-bump-w" onclick="switchBump('weeks')">${en ? 'By week' : 'По неделям'}</button>
        <button type="button" class="rs-toggle-pill" id="btn-bump-d" onclick="switchBump('days')">${en ? 'By day of week' : 'По дням недели'}</button>
      </div>
      <button type="button" class="btn ghost btn-sm rs-embed-btn" data-embed="${escapeHtml(embedCode)}">&lt;/&gt; ${EMBED_LABEL[lang]}</button>
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

/** The dialog the «Embed» buttons open; QUOTE_SCRIPT fills and copies it. */
export function renderEmbedDialog(lang: SupportedLang = 'ru'): string {
  const en = lang === 'en';
  return `<dialog id="embed-dialog" class="auth-dialog">
  <div class="auth-card" style="max-width:520px">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
      <h3 style="margin:0;font-size:16px;font-weight:600">${en ? 'Embed the chart' : 'Встроить график'}</h3>
      <button type="button" class="modal-close-btn" onclick="document.getElementById('embed-dialog').close()" aria-label="${en ? 'Close' : 'Закрыть окно'}">×</button>
    </div>
    <p class="muted small" style="margin-bottom:12px">${en
      ? 'Paste this HTML into your site, article or blog. The chart is responsive and carries the openradar attribution (CC BY 4.0).'
      : 'Вставьте этот HTML-код на свой сайт, в статью на Habr/VC или в блог. График адаптивен и содержит атрибуцию openradar (CC BY 4.0).'}</p>
    <textarea id="embed-code-textarea" readonly rows="3" style="width:100%;font-family:monospace;font-size:12px;padding:8px;border:1px solid var(--line);border-radius:6px;background:var(--soft);resize:none"></textarea>
    <div style="margin-top:12px;display:flex;justify-content:flex-end;gap:8px">
      <button type="button" class="btn" onclick="copyEmbedCode(this)">${en ? 'Copy code' : 'Скопировать код'}</button>
    </div>
  </div>
</dialog>`;
}

export const QUOTE_SCRIPT = `<script>
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


function heatmapStyle(value: number | undefined, minVal: number, maxVal: number): string {
  if (value === undefined || maxVal <= minVal) return "";
  const ratio = Math.max(0, Math.min(1, (value - minVal) / (maxVal - minVal)));
  const alpha = (0.07 + ratio * 0.35).toFixed(2);
  return ` style="background:rgba(16,185,129,${alpha});font-variant-numeric:tabular-nums"`;
}

function heatmapLegend(minVal: number, maxVal: number, lang: SupportedLang = "ru"): string {
  const en = lang === "en";
  const fmt = (v: number): string => (en ? `₽${new Intl.NumberFormat("en-US").format(v)}` : formatRub(v));
  return `<p class="rs-legend" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:8px">
    <span>${en ? "Heatmap scale:" : "Шкала тепловой карты:"}</span>
    <span>${escapeHtml(fmt(minVal))}</span>
    <span style="display:inline-block;width:96px;height:8px;background:linear-gradient(90deg,rgba(16,185,129,0.08),rgba(16,185,129,0.44));border:1px solid var(--line)"></span>
    <span>${escapeHtml(fmt(maxVal))}</span>
    <span class="muted">· ${en ? "QCD = quartile dispersion (P75−P25)/(P75+P25)" : "QCD — квартильная дисперсия (P75−P25)/(P75+P25)"}</span>
  </p>`;
}

export function renderGradeMatrixSection(
  matrix: GradeMatrixRow[] | undefined,
  roleHref: (slug: string) => string | undefined,
  lang: SupportedLang = "ru",
): string {
  const rows = (matrix ?? []).filter((r) => r.median !== undefined && (r.junior !== undefined || r.middle !== undefined || r.senior !== undefined || r.lead !== undefined));
  if (!rows.length) return "";
  const en = lang === "en";
  const fmt = (v: number): string => (en ? `₽${new Intl.NumberFormat("en-US").format(v)}` : formatRub(v));
  const allVals = rows.flatMap((r) => [r.junior, r.middle, r.senior, r.lead, r.median].filter((v): v is number => v !== undefined));
  const minVal = Math.min(...allVals);
  const maxVal = Math.max(...allVals);
  const cell = (v: number | undefined): string =>
    v !== undefined ? `<td${heatmapStyle(v, minVal, maxVal)}>${escapeHtml(fmt(v))}</td>` : `<td class="muted">—</td>`;

  return `<section class="rs-section" id="heatmap-role-grade">
  <h2>${en ? "Salary heatmap: role × seniority" : "Тепловая карта зарплат: направление × грейд"}</h2>
  <p class="muted small">${en
    ? "Color-coded median monthly pay (RUB) within each role and seniority cell (from 5 paid vacancies per cell), Senior/Junior career multiplier, quartile dispersion (QCD), salary disclosure rate, and range half-spread (±%)."
    : "Цветовая тепловая карта медианных зарплат в месяц внутри каждой ячейки «направление × уровень» (от 5 вакансий с оплатой в ячейке), мультипликатор роста Senior/Junior, квартильная дисперсия (QCD), доля открытых вилок и типичный полуразмах вилки (±%)."}</p>
  <div style="overflow-x:auto">
    <table class="table">
      <thead>
        <tr>
          <th>${en ? "Role" : "Направление"}</th>
          <th>${en ? "Median" : "Медиана"}</th>
          <th>Junior</th>
          <th>Middle</th>
          <th>Senior</th>
          <th>Lead</th>
          <th>Senior / Jr</th>
          <th>QCD</th>
          <th>${en ? "Remote" : "Удалёнка"}</th>
          <th>${en ? "Pay stated" : "С зарплатой"}</th>
          <th>${en ? "Range ±%" : "Разброс вилки"}</th>
        </tr>
      </thead>
      <tbody>
        ${rows
          .slice(0, 18)
          .map((r) => {
            const href = roleHref(r.slug);
            const name = escapeHtml(roleLabel(r.slug, lang));
            const link = href ? `<a href="${escapeHtml(href)}">${name}</a>` : name;
            const ratio = r.seniorToJuniorRatio ? `${String(r.seniorToJuniorRatio).replace(".", en ? "." : ",")}×` : "—";
            const qcd = r.qcdPct !== undefined ? (en ? `${r.qcdPct}%` : formatShare(r.qcdPct)) : "—";
            const spread = r.spreadPct !== undefined ? `±${r.spreadPct}%` : "—";
            return `<tr>
              <td><b>${link}</b> <span class="muted small">(${num(r.withPay)})</span></td>
              <td${heatmapStyle(r.median, minVal, maxVal)}><b>${r.median !== undefined ? escapeHtml(fmt(r.median)) : "—"}</b></td>
              ${cell(r.junior)}
              ${cell(r.middle)}
              ${cell(r.senior)}
              ${cell(r.lead)}
              <td><b>${ratio}</b></td>
              <td>${qcd}</td>
              <td>${en ? `${r.remoteShare}%` : formatShare(r.remoteShare)}</td>
              <td>${en ? `${r.payShare}%` : formatShare(r.payShare)}</td>
              <td>${spread}</td>
            </tr>`;
          })
          .join("")}
      </tbody>
    </table>
  </div>
  ${heatmapLegend(minVal, maxVal, lang)}
</section>`;
}

export function renderLanguageMatrixSection(
  matrix: LanguageMatrixRow[] | undefined,
  lang: SupportedLang = "ru",
): string {
  const rows = (matrix ?? []).filter((r) => r.median !== undefined && (r.junior !== undefined || r.middle !== undefined || r.senior !== undefined || r.lead !== undefined));
  if (!rows.length) return "";
  const en = lang === "en";
  const fmt = (v: number): string => (en ? `₽${new Intl.NumberFormat("en-US").format(v)}` : formatRub(v));
  const allVals = rows.flatMap((r) => [r.junior, r.middle, r.senior, r.lead, r.median].filter((v): v is number => v !== undefined));
  const minVal = Math.min(...allVals);
  const maxVal = Math.max(...allVals);
  const cell = (v: number | undefined): string =>
    v !== undefined ? `<td${heatmapStyle(v, minVal, maxVal)}>${escapeHtml(fmt(v))}</td>` : `<td class="muted">—</td>`;

  return `<div style="margin-top:18px" id="heatmap-language-grade">
  <h3>${en ? "Stack heatmap: programming language × seniority" : "Тепловая карта стека: язык программирования × грейд"}</h3>
  <p class="muted small">${en
    ? "How developer pay scales from Junior to Lead within each language ecosystem (cells shown from 3 paid vacancies)."
    : "Как меняется медианная зарплата разработчика от Junior до Lead внутри каждого языка программирования (ячейка публикуется от 3 вакансий с оплатой)."}</p>
  <div style="overflow-x:auto">
    <table class="table">
      <thead>
        <tr>
          <th>${en ? "Language" : "Язык"}</th>
          <th>${en ? "Median (all)" : "Медиана"}</th>
          <th>Junior</th>
          <th>Middle</th>
          <th>Senior</th>
          <th>Lead</th>
          <th>Senior / Jr</th>
          <th>QCD</th>
        </tr>
      </thead>
      <tbody>
        ${rows
          .map((r) => {
            const ratio = r.seniorToJuniorRatio ? `${String(r.seniorToJuniorRatio).replace(".", en ? "." : ",")}×` : "—";
            const qcd = r.qcdPct !== undefined ? (en ? `${r.qcdPct}%` : formatShare(r.qcdPct)) : "—";
            return `<tr>
              <td><b>${escapeHtml(r.language)}</b> <span class="muted small">(${num(r.withPay)})</span></td>
              <td${heatmapStyle(r.median, minVal, maxVal)}><b>${r.median !== undefined ? escapeHtml(fmt(r.median)) : "—"}</b></td>
              ${cell(r.junior)}
              ${cell(r.middle)}
              ${cell(r.senior)}
              ${cell(r.lead)}
              <td><b>${ratio}</b></td>
              <td>${qcd}</td>
            </tr>`;
          })
          .join("")}
      </tbody>
    </table>
  </div>
</div>`;
}

export function renderRegionalComparisonSection(
  comparison: RegionalComparisonRow[] | undefined,
  regionalMatrix: RegionalMatrixRow[] | undefined,
  byCity: CitySlice[] | undefined,
  roleHref: (slug: string) => string | undefined,
  lang: SupportedLang = "ru",
): string {
  const compRows = (comparison ?? []).filter((r) => r.pay.median !== undefined);
  const matRows = (regionalMatrix ?? []).filter((r) => r.median !== undefined);
  if (!compRows.length && !matRows.length) return "";
  const en = lang === "en";
  const fmt = (v: number): string => (en ? `₽${new Intl.NumberFormat("en-US").format(v)}` : formatRub(v));
  const segLabelEn: Record<string, string> = {
    moscow: "Moscow (on-site & hybrid)",
    spb: "Saint Petersburg (on-site & hybrid)",
    regions: "Other Russian cities (on-site & hybrid)",
    remote: "All-Russia Remote (work from anywhere)",
  };
  const signPct = (v: number): string => `${v > 0 ? "+" : v < 0 ? (en ? "-" : "−") : ""}${Math.abs(v)}%`;

  const allMatVals = matRows.flatMap((r) => [r.moscow, r.spb, r.regions, r.remote].filter((v): v is number => v !== undefined));
  const minMat = allMatVals.length ? Math.min(...allMatVals) : 50_000;
  const maxMat = allMatVals.length ? Math.max(...allMatVals) : 350_000;
  const matCell = (v: number | undefined, n: number): string =>
    v !== undefined
      ? `<td${heatmapStyle(v, minMat, maxMat)} title="n = ${n}"><b>${escapeHtml(fmt(v))}</b> <span class="muted small">(${n})</span></td>`
      : `<td class="muted">—</td>`;

  const cityRows = (byCity ?? []).map((s) => ({
    label: en ? (translateCity(s.label, "en") ?? s.label) : s.label,
    n: s.n,
    pay: s.pay,
  }));

  return `<section class="rs-section" id="regional-analysis">
  <h2>${en ? "Regional econometrics, geography heatmap & cities" : "Сравнение регионов, тепловая карта географии и города"}</h2>
  <p class="muted small">${en
    ? "Decomposing the Russian labour market into four structural segments: Moscow on-site, Saint Petersburg on-site, regional on-site markets, and the unified national remote market. In engineering roles, national remote work pays above Moscow on-site (due to senior composition), whereas in support and marketing it pays below Moscow (regional wage arbitrage)."
    : "Декомпозиция рынка на четыре сегмента: московский офис, петербургский офис, локальный найм в регионах РФ и всероссийский рынок удалёнки. В инженерных и продуктовых ролях удалёнка платит выше московского офиса (за счёт концентрации Senior-вакансий) и даёт +80..+173% к региональному офису без релокации; в линейной поддержке и маркетинге удалёнка, напротив, используется для регионального зарплатного арбитража."}</p>
  ${compRows.length ? `<div style="overflow-x:auto;margin-top:12px">
    <table class="table">
      <thead>
        <tr>
          <th>${en ? "Market segment" : "Сегмент рынка"}</th>
          <th>${en ? "Vacancies" : "Вакансий"}</th>
          <th>${en ? "Median (all)" : "Медиана (все)"}</th>
          <th>${en ? "Middle half (P25–P75)" : "Коридор P25–P75"}</th>
          <th>${en ? "IT median" : "Медиана в IT"}</th>
          <th>${en ? "Parity vs Moscow (IT)" : "Паритет к Москве (IT)"}</th>
          <th>${en ? "Adjusted gap vs Moscow (CMH)" : "При той же роли и грейде к Москве"}</th>
          <th>QCD</th>
        </tr>
      </thead>
      <tbody>
        ${compRows
          .map((r) => {
            const pRange = r.pay.p25 && r.pay.p75 ? `${escapeHtml(fmt(r.pay.p25))} – ${escapeHtml(fmt(r.pay.p75))}` : "—";
            const parity = r.itMoscowParityPct !== undefined ? `${r.itMoscowParityPct}%` : r.moscowParityPct !== undefined ? `${r.moscowParityPct}%` : "—";
            const adj =
              r.key === "moscow"
                ? (en ? "100% (base)" : "база (0%)")
                : r.adjustedVsMoscow
                  ? `<b>${signPct(r.adjustedVsMoscow.pct)}</b> <span class="muted small">(n=${num(r.adjustedVsMoscow.n)})</span>`
                  : "—";
            const qcd = r.qcdPct !== undefined ? (en ? `${r.qcdPct}%` : formatShare(r.qcdPct)) : "—";
            return `<tr>
              <td><b>${escapeHtml(en ? (segLabelEn[r.key] ?? r.label) : r.label)}</b></td>
              <td>${num(r.n)} <span class="muted small">(${en ? `${r.sharePct}%` : formatShare(r.sharePct)})</span></td>
              <td><b>${r.pay.median ? escapeHtml(fmt(r.pay.median)) : "—"}</b></td>
              <td class="small">${pRange}</td>
              <td><b>${r.itPay.median ? escapeHtml(fmt(r.itPay.median)) : "—"}</b></td>
              <td>${parity}</td>
              <td>${adj}</td>
              <td>${qcd}</td>
            </tr>`;
          })
          .join("")}
      </tbody>
    </table>
  </div>` : ""}
  ${matRows.length ? `<h3 style="margin-top:20px">${en ? "Geography heatmap: role × region & remote work" : "Тепловая карта географии: направление × регион и удалёнка"}</h3>
  <p class="muted small">${en
    ? "Median monthly pay across Moscow on-site, Saint Petersburg on-site, regional Russian offices, and all-Russia remote work (from 5 paid vacancies per cell). The last two columns show the regional office discount vs Moscow and the remote work premium over a regional office without relocation."
    : "Медианная зарплата в месяц по четырём гео-сегментам внутри каждого направления (от 5 вакансий с оплатой в ячейке). Два правых столбца показывают дисконт регионального офиса к Москве и премию всероссийской удалёнки к локальному офису в регионе без переезда."}</p>
  <div style="overflow-x:auto">
    <table class="table">
      <thead>
        <tr>
          <th>${en ? "Role" : "Направление"}</th>
          <th>${en ? "Moscow (office)" : "Москва (офис)"}</th>
          <th>${en ? "St. Petersburg" : "СПб (офис)"}</th>
          <th>${en ? "Regions (office)" : "Регионы РФ (офис)"}</th>
          <th>${en ? "Remote (RU)" : "Удалёнка (РФ)"}</th>
          <th>${en ? "Regions vs Moscow" : "Регионы к Москве"}</th>
          <th>${en ? "Remote vs Regions" : "Премия удалёнки к региону"}</th>
        </tr>
      </thead>
      <tbody>
        ${matRows
          .slice(0, 16)
          .map((r) => {
            const href = roleHref(r.slug);
            const name = escapeHtml(roleLabel(r.slug, lang));
            const link = href ? `<a href="${escapeHtml(href)}">${name}</a>` : name;
            const regMsk = r.regVsMskPct !== undefined ? signPct(r.regVsMskPct) : "—";
            const remReg =
              r.remoteVsRegPct !== undefined
                ? `<b style="color:${r.remoteVsRegPct > 0 ? "var(--emerald)" : "inherit"}">${signPct(r.remoteVsRegPct)}</b>`
                : "—";
            return `<tr>
              <td><b>${link}</b></td>
              ${matCell(r.moscow, r.moscowN)}
              ${matCell(r.spb, r.spbN)}
              ${matCell(r.regions, r.regionsN)}
              ${matCell(r.remote, r.remoteN)}
              <td>${regMsk}</td>
              <td>${remReg}</td>
            </tr>`;
          })
          .join("")}
      </tbody>
    </table>
  </div>
  ${heatmapLegend(minMat, maxMat, lang)}` : ""}
  ${cityRows.length >= 3 ? `<h3 style="margin-top:20px">${en ? "Pay across major cities & regional IT hubs" : "Зарплаты по крупнейшим городам и ИТ-хабам"}</h3>
  <p class="muted small">${en
    ? "Top Russian labour markets by sample volume (with at least 10 paid vacancies), ranked by median monthly pay: overall median, 95% confidence interval, interquartile range, and IT-sector median."
    : "Крупнейшие региональные рынки труда и ИТ-хабы по объёму выборки (от 10 вакансий с оплатой), ранжированные по медиане: общая медиана, 95% доверительный интервал, межквартильный размах и чистая медиана в IT."}</p>
  ${rangeChart(cityRows, { lang, unit: fmt })}
  ${(byCity ?? []).some((c) => c.itPay?.median !== undefined) ? `<div style="overflow-x:auto;margin-top:12px">
    <table class="table">
      <thead>
        <tr>
          <th>${en ? "City / Agglomeration" : "Город / ИТ-хаб"}</th>
          <th>${en ? "Total vacancies (paid)" : "Вакансий (с вилкой)"}</th>
          <th>${en ? "Overall median" : "Медиана (все)"}</th>
          <th>${en ? "IT median (RUB)" : "Медиана в IT"}</th>
          <th>${en ? "IT P25–P75 range" : "Коридор P25–P75 в IT"}</th>
        </tr>
      </thead>
      <tbody>
        ${(byCity ?? []).filter((c) => c.itPay?.median !== undefined).map((c) => {
          const cName = en ? (translateCity(c.label, "en") ?? c.label) : c.label;
          const itRange = c.itPay?.p25 && c.itPay?.p75 ? `${escapeHtml(fmt(c.itPay.p25))} – ${escapeHtml(fmt(c.itPay.p75))}` : "—";
          return `<tr>
            <td><b>${escapeHtml(cName)}</b></td>
            <td>${num(c.n)} <span class="muted small">(${num(c.withPay)})</span></td>
            <td><b>${c.pay.median ? escapeHtml(fmt(c.pay.median)) : "—"}</b></td>
            <td><b style="color:var(--emerald)">${c.itPay?.median ? escapeHtml(fmt(c.itPay.median)) : "—"}</b> <span class="muted small">(n=${num(c.itPay?.n ?? 0)})</span></td>
            <td class="small">${itRange}</td>
          </tr>`;
        }).join("")}
      </tbody>
    </table>
  </div>` : ""}` : ""}
</section>`;
}

export function renderEconometricsSection(
  econ: MarketEconometrics | undefined,
  lang: SupportedLang = "ru",
): string {
  if (!econ || !econ.all.p50) return "";
  const en = lang === "en";
  const fmt = (v: number | undefined): string =>
    v !== undefined ? (en ? `₽${new Intl.NumberFormat("en-US").format(v)}` : formatRub(v)) : "—";
  const { all, it, employerConcentration, gradeTransparency, ipwCorrectedIt } = econ;
  const gradeLabelEn: Record<string, string> = { intern: "Intern", junior: "Junior", middle: "Middle", senior: "Senior", lead: "Lead" };

  return `<section class="rs-section" id="econometrics">
  <h2>${en ? "Econometric profile, inequality & market concentration" : "Эконометрический профиль, индексы неравенства и концентрация рынка"}</h2>
  <p class="muted small">${en
    ? "Non-parametric distributional diagnostics used in labour economics: decile structure (P10–P90), the P90/P10 decile ratio, the Gini coefficient of offered pay, quartile coefficient of dispersion (QCD), Bowley and Kelley skewness indices, and the Herfindahl–Hirschman employer concentration index (HHI)."
    : "Непараметрическая диагностика распределения зарплатных предложений по стандартам экономики труда: децильный профиль (P10–P90), коэффициент фондов P90/P10, индекс концентрации Джини (G), коэффициент квартильной дисперсии (QCD), индексы правосторонней асимметрии Боули и Келли, а также индекс концентрации нанимателей Херфиндаля — Хиршмана (HHI)."}</p>
  <div style="overflow-x:auto">
    <table class="table">
      <thead>
        <tr>
          <th>${en ? "Econometric metric" : "Показатель"}</th>
          <th>${en ? "All vacancies (RUB)" : "Весь рынок вакансий"}</th>
          <th>${en ? "IT & Tech sector" : "IT-сектор"}</th>
          <th>${en ? "Economic interpretation" : "Экономический смысл"}</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><b>${en ? "Sample size (paid vacancies, n)" : "Выборка вакансий с оплатой (n)"}</b></td>
          <td>${num(all.n)}</td>
          <td>${num(it.n)}</td>
          <td class="small muted">${en ? "Deduplicated monthly RUB offers" : "Дедуплицированные месячные предложения в рублях"}</td>
        </tr>
        <tr>
          <td><b>${en ? "Decile corridor P10 — P90" : "Децильный коридор P10 — P90"}</b></td>
          <td>${escapeHtml(fmt(all.p10))} — ${escapeHtml(fmt(all.p90))}</td>
          <td><b>${escapeHtml(fmt(it.p10))} — ${escapeHtml(fmt(it.p90))}</b></td>
          <td class="small muted">${en ? "80% of all market offers fall within this band" : "Внутри этого коридора находится 80% всех предложений рынка"}</td>
        </tr>
        <tr>
          <td><b>${en ? "Median (P50) vs 5% Trimmed Mean" : "Медиана (P50) и 5% усечённое среднее"}</b></td>
          <td>${escapeHtml(fmt(all.p50))} / ${escapeHtml(fmt(all.trimmedMean))} ${all.meanToMedianPct !== undefined ? `(+${all.meanToMedianPct}%)` : ""}</td>
          <td><b>${escapeHtml(fmt(it.p50))} / ${escapeHtml(fmt(it.trimmedMean))}</b> ${it.meanToMedianPct !== undefined ? `(+${it.meanToMedianPct}%)` : ""}</td>
          <td class="small muted">${en ? "Gap between mean and median reflects right-tail senior salaries" : "Превышение среднего над медианой из-за правого хвоста Senior/Lead вилок"}</td>
        </tr>
        <tr>
          <td><b>${en ? "Decile dispersion ratio (P90 / P10)" : "Децильный коэффициент (P90 / P10)"}</b></td>
          <td><b>${all.decileRatio !== undefined ? `${all.decileRatio}×` : "—"}</b></td>
          <td><b>${it.decileRatio !== undefined ? `${it.decileRatio}×` : "—"}</b></td>
          <td class="small muted">${en ? "Pay ratio between top 10% and bottom 10% of vacancies" : "Во сколько раз порог топ-10% вакансий выше нижних 10%"}</td>
        </tr>
        <tr>
          <td><b>${en ? "Quartile ratio (P75 / P25) & QCD" : "Квартильный размах (P75 / P25) и QCD"}</b></td>
          <td>${all.quartileRatio !== undefined ? `${all.quartileRatio}×` : "—"} (${all.qcdPct !== undefined ? `${all.qcdPct}%` : "—"})</td>
          <td><b>${it.quartileRatio !== undefined ? `${it.quartileRatio}×` : "—"} (${it.qcdPct !== undefined ? `${it.qcdPct}%` : "—"})</b></td>
          <td class="small muted">${en ? "Robust non-parametric relative dispersion (P75−P25)/(P75+P25)" : "Относительный разброс центральной половины рынка без влияния выбросов"}</td>
        </tr>
        <tr>
          <td><b>${en ? "Gini inequality index (G)" : "Индекс неравенства Джини (G)"}</b></td>
          <td><b>${all.gini !== undefined ? all.gini.toFixed(3) : "—"}</b></td>
          <td><b>${it.gini !== undefined ? it.gini.toFixed(3) : "—"}</b></td>
          <td class="small muted">${en ? "0 = uniform pay, 1 = total concentration; IT is wider due to grade progression" : "0 — полное равенство, 1 — максимальная концентрация; в IT выше из-за разрыва Junior–Lead"}</td>
        </tr>
        <tr>
          <td><b>${en ? "Theil entropy index T = GE(1)" : "Индекс энтропии Тейла T = GE(1)"}</b></td>
          <td><b>${all.theil !== undefined ? all.theil.toFixed(3) : "—"}</b></td>
          <td><b>${it.theil !== undefined ? it.theil.toFixed(3) : "—"}</b></td>
          <td class="small muted">${en ? "Additively decomposable generalized entropy measure of upper-tail wage dispersion" : "Аддитивно разложимая мера обобщённой энтропии GE(1), чувствительная к правому хвосту окладов"}</td>
        </tr>
        <tr>
          <td><b>${en ? "Bowley (S_B) / Kelley (S_K) skewness" : "Асимметрия Боули (S_B) / Келли (S_K)"}</b></td>
          <td>${all.bowleySkew ?? "—"} / ${all.kelleySkew ?? "—"}</td>
          <td><b>${it.bowleySkew ?? "—"} / ${it.kelleySkew ?? "—"}</b></td>
          <td class="small muted">${en ? "Positive values (> 0) confirm right-skewed log-normal pay structure" : "Значения > 0 подтверждают правостороннюю скошенность распределения"}</td>
        </tr>
        <tr>
          <td><b>${en ? "Employer concentration (HHI / CR5 / CR10)" : "Концентрация нанимателей (HHI / CR5 / CR10)"}</b></td>
          <td colspan="2"><b>HHI = ${num(employerConcentration.hhi)}</b> · CR₅ = ${en ? `${employerConcentration.cr5Pct}%` : formatShare(employerConcentration.cr5Pct)} · CR₁₀ = ${en ? `${employerConcentration.cr10Pct}%` : formatShare(employerConcentration.cr10Pct)} <span class="muted small">(${num(employerConcentration.totalEmployers)} ${en ? "IT employers" : "IT-нанимателей"})</span></td>
          <td class="small muted">${employerConcentration.hhi < 150 ? (en ? "HHI < 150 — highly competitive, non-monopolized demand" : "HHI < 150 — высококонкурентный рынок без доминирования одного нанимателя") : (en ? "Moderate concentration among largest ecosystems" : "Умеренная концентрация спроса у крупнейших экосистем")}</td>
        </tr>${ipwCorrectedIt ? `
        <tr>
          <td><b>${en ? "IPW selection-corrected IT median (Horvitz–Thompson)" : "IPW-медиана IT с поправкой на скрытые вилки (Хорвица — Томпсона)"}</b></td>
          <td>${fmt(ipwCorrectedIt.rawMedian)} <span class="muted small">(${en ? "observed" : "наблюдаемая"})</span></td>
          <td><b>${fmt(ipwCorrectedIt.ipwMedian)}</b> <span class="muted small">(${ipwCorrectedIt.biasPct >= 0 ? "+" : ""}${ipwCorrectedIt.biasPct}%)</span></td>
          <td class="small muted">${en ? "Weighted by inverse disclosure probability 1 / P(Disclosed | Grade) across N = " + num(ipwCorrectedIt.n) + " graded IT vacancies" : "Взвешивание по обратной вероятности раскрытия вилки 1 / P(Disclosed | Grade), N = " + num(ipwCorrectedIt.n)}</td>
        </tr>` : ""}
      </tbody>
    </table>
  </div>
  ${gradeTransparency.length >= 3 ? `<h3 style="margin-top:18px">${en ? "Salary transparency & bargaining range width by seniority" : "Градиент зарплатной прозрачности и ширина вилки по грейдам"}</h3>
  <p class="muted small">${en
    ? "Empirical disclosure bias: employers state salary ranges much more often for Junior/Intern positions than for Senior/Lead roles, while internal pay dispersion (QCD) widens at higher grades."
    : "Эмпирическая проверка смещения раскрытия (Disclosure Bias): на младших грейдах работодатели публикуют вилку открыто в большинстве вакансий, тогда как на уровнях Senior и Lead доля скрытых окладов («по результатам собеседования») растёт."}</p>
  <table class="table">
    <thead>
      <tr>
        <th>${en ? "Seniority grade" : "Уровень (грейд)"}</th>
        <th>${en ? "IT vacancies" : "IT-вакансий"}</th>
        <th>${en ? "Pay stated (%)" : "Раскрытие вилки (%)"}</th>
        <th>${en ? "Median (RUB)" : "Медиана"}</th>
        <th>${en ? "Bargaining spread (±%)" : "Полуразмах вилки (±%)"}</th>
        <th>${en ? "Within-grade QCD" : "Внутригрейдовая дисперсия QCD"}</th>
      </tr>
    </thead>
    <tbody>
      ${gradeTransparency
        .map((g) => `<tr>
          <td><b>${escapeHtml(en ? (gradeLabelEn[g.grade] ?? g.label) : g.label)}</b></td>
          <td>${num(g.n)}</td>
          <td><b>${en ? `${g.payShare}%` : formatShare(g.payShare)}</b> <span class="muted small">(${num(g.withPay)})</span></td>
          <td><b>${fmt(g.median)}</b></td>
          <td>${g.spreadPct !== undefined ? `±${g.spreadPct}%` : "—"}</td>
          <td>${g.qcdPct !== undefined ? (en ? `${g.qcdPct}%` : formatShare(g.qcdPct)) : "—"}</td>
        </tr>`)
        .join("")}
    </tbody>
  </table>` : ""}
</section>`;
}


export function scholarMetaTags(options: {
  title: string;
  baseUrl: string;
  path: string;
  dateIso: string;
  lang: "ru" | "en";
}): string {
  const { title, baseUrl, path, dateIso, lang } = options;
  const pubDate = dateIso.slice(0, 10).replace(/-/g, "/");
  const keywords =
    lang === "ru"
      ? "рынок труда; зарплаты в IT; фриланс; эконометрика; уравнение Минсера; индекс Джини; региональное неравенство; открытые данные"
      : "labour market; IT salaries; freelance; econometrics; Mincer earnings regression; Gini index; regional wage inequality; open data";
  return `<meta name="citation_title" content="${escapeHtml(title)}">
<meta name="citation_author" content="openradar Research">
<meta name="citation_publication_date" content="${escapeHtml(pubDate)}">
<meta name="citation_online_date" content="${escapeHtml(pubDate)}">
<meta name="citation_language" content="${lang}">
<meta name="citation_public_url" content="${escapeHtml(`${baseUrl}${path}`)}">
<meta name="citation_keywords" content="${escapeHtml(keywords)}">
<meta name="DC.title" content="${escapeHtml(title)}">
<meta name="DC.creator" content="openradar">
<meta name="DC.type" content="Dataset">
<meta name="DC.format" content="text/csv">
<meta name="DC.rights" content="https://creativecommons.org/licenses/by/4.0/">`;
}

export function renderAcademicCitations(report: Report, baseUrl: string, lang: SupportedLang = "ru"): string {
  const en = lang === "en";
  const url = `${baseUrl}${reportUrl(report)}`;
  const year = report.period.to.slice(0, 4);
  const accessDate = report.generatedAt.slice(0, 10);
  const gost = `Рынок труда в IT и фрилансе: эмпирическое исследование и открытый датасет (${report.period.label}) [Электронный ресурс] // openradar: открытая исследовательская сеть рынка труда. — ${year}. — URL: ${url} (дата обращения: ${accessDate}). — Лицензия: CC BY 4.0.`;
  const apa = `openradar Research. (${year}). Russian IT & Freelance Labour Market Empirical Dataset and Econometric Report (${report.period.label}) [Data set]. openradar. ${url}`;
  const bibtex = `@dataset{openradar_${year}_${(report.period.slug ?? "live").replace(/[^a-z0-9]/gi, "_")}, author = {{openradar Research}}, title = {{Russian IT and Freelance Labour Market Empirical Dataset (${report.period.label})}}, year = {${year}}, publisher = {openradar}, version = {v${report.version}.0}, url = {${url}}, note = {Open data CC BY 4.0; CSV: ${baseUrl}/research/dataset.csv}}`;

  return `<div style="margin-top:16px">
  <h3>${en ? "Academic citation formats (GOST / APA 7th / BibTeX)" : "Библиографические ссылки для научных работ и ВКР (ГОСТ / APA / BibTeX)"}</h3>
  <p class="muted small">${en
    ? "Ready-to-use bibliographic references for academic papers, bachelor/master theses, and preprints:"
    : "Готовые библиографические описания для цитирования в научных статьях (РИНЦ, ВАК), аналитических записках, выпускных квалификационных работах (ВКР) и диссертациях:"}</p>
  <table class="table">
    <thead>
      <tr>
        <th style="width:150px">${en ? "Standard" : "Стандарт"}</th>
        <th>${en ? "Bibliographic reference" : "Текст библиографической ссылки"}</th>
        <th style="width:110px"></th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><b>ГОСТ Р 7.0.5–2008</b><br><span class="muted small">${en ? "RU theses & papers" : "ВКР, РИНЦ, ВАК"}</span></td>
        <td class="small"><code>${escapeHtml(gost)}</code></td>
        <td>${quoteButton(gost, lang)}</td>
      </tr>
      <tr>
        <td><b>APA (7th ed.)</b><br><span class="muted small">${en ? "International" : "Международный"}</span></td>
        <td class="small"><code>${escapeHtml(apa)}</code></td>
        <td>${quoteButton(apa, lang)}</td>
      </tr>
      <tr>
        <td><b>BibTeX</b><br><span class="muted small">LaTeX / Overleaf</span></td>
        <td class="small"><code>${escapeHtml(bibtex)}</code></td>
        <td>${quoteButton(bibtex, lang)}</td>
      </tr>
      <tr>
        <td><b>IMRaD LaTeX (.tex)</b><br><span class="muted small">${en ? "Full preprint template" : "Шаблон статьи / ВКР"}</span></td>
        <td class="small">${en ? "Ready-to-compile LaTeX manuscript with Mincer OLS, ANOVA, Blinder–Oaxaca & booktabs tables:" : "Готовый к компиляции в Overleaf LaTeX-препринт научной статьи (IMRaD) с таблицами booktabs и уравнениями:"} <a href="${en ? "/en/research/paper.tex" : "/research/paper.tex"}"><b>${en ? "Download paper.tex" : "Скачать paper.tex"}</b></a></td>
        <td><a class="btn-ghost small" href="${en ? "/en/research/paper.tex" : "/research/paper.tex"}">.tex</a></td>
      </tr>
    </tbody>
  </table>
</div>`;
}


export function renderFormulaGallerySection(lang: SupportedLang = "ru"): string {
  const en = lang === "en";
  const cards = [{"key":"mincer","num":1,"tex":"\\ln(W_i) = \\beta_0 + \\beta_1\\,\\text{Middle}_i + \\beta_2\\,\\text{Senior}_i + \\beta_3\\,\\text{Lead}_i + \\gamma_1\\,\\text{Moscow}_i + \\gamma_2\\,\\text{SPb}_i + \\gamma_3\\,\\text{Remote}_i + \\delta\\,\\text{AI}_i + \\varepsilon_i","ruTitle":"Уравнение заработной платы Якоба Минсера (Mincer Log-Wage OLS)","enTitle":"Mincerian Log-Wage Regression (OLS)","ruNote":"Зависимая переменная ln(W_i) — натуральный логарифм месячного оклада в рублях; β₀ — базовая оплата Junior/Intern в региональном офисе.","enNote":"Dependent variable ln(W_i) is log monthly pay in RUB; β₀ is the baseline Junior/Intern pay in a regional office.","mathml":"<span class=\"katex\"><math xmlns=\"http://www.w3.org/1998/Math/MathML\" display=\"block\"><semantics><mrow><mi>ln</mi><mo>⁡</mo><mo stretchy=\"false\">(</mo><msub><mi>W</mi><mi>i</mi></msub><mo stretchy=\"false\">)</mo><mo>=</mo><msub><mi>β</mi><mn>0</mn></msub><mo>+</mo><msub><mi>β</mi><mn>1</mn></msub><mtext> </mtext><msub><mtext>Middle</mtext><mi>i</mi></msub><mo>+</mo><msub><mi>β</mi><mn>2</mn></msub><mtext> </mtext><msub><mtext>Senior</mtext><mi>i</mi></msub><mo>+</mo><msub><mi>β</mi><mn>3</mn></msub><mtext> </mtext><msub><mtext>Lead</mtext><mi>i</mi></msub><mo>+</mo><msub><mi>γ</mi><mn>1</mn></msub><mtext> </mtext><msub><mtext>Moscow</mtext><mi>i</mi></msub><mo>+</mo><msub><mi>γ</mi><mn>2</mn></msub><mtext> </mtext><msub><mtext>SPb</mtext><mi>i</mi></msub><mo>+</mo><msub><mi>γ</mi><mn>3</mn></msub><mtext> </mtext><msub><mtext>Remote</mtext><mi>i</mi></msub><mo>+</mo><mi>δ</mi><mtext> </mtext><msub><mtext>AI</mtext><mi>i</mi></msub><mo>+</mo><msub><mi>ε</mi><mi>i</mi></msub></mrow><annotation encoding=\"application/x-tex\">\\ln(W_i) = \\beta_0 + \\beta_1\\,\\text{Middle}_i + \\beta_2\\,\\text{Senior}_i + \\beta_3\\,\\text{Lead}_i + \\gamma_1\\,\\text{Moscow}_i + \\gamma_2\\,\\text{SPb}_i + \\gamma_3\\,\\text{Remote}_i + \\delta\\,\\text{AI}_i + \\varepsilon_i</annotation></semantics></math></span>"},{"key":"whiteHc1","num":2,"tex":"\\widehat{V}_{\\text{HC1}}(\\hat{\\beta}) = \\frac{n}{n - k}\\,(X^\\top X)^{-1}\\!\\left(\\sum_{i=1}^{n} \\hat{\\varepsilon}_i^{\\,2}\\, x_i x_i^\\top\\right)(X^\\top X)^{-1}, \\qquad \\Delta\\% = \\left(\\exp(\\hat{\\beta}_j) - 1\\right)\\times 100\\%","ruTitle":"Робастная ковариационная матрица Уайта (HC1) и поправка Халворсена — Палмквиста","enTitle":"White HC1 Heteroskedasticity-Robust Covariance & Halvorsen–Palmquist Semi-Elasticity","ruNote":"Устойчивые к гетероскедастичности стандартные ошибки SE_HC1 и точный процентный эффект бинарного фактора при прочих равных.","enNote":"Heteroskedasticity-consistent standard errors SE_HC1 and exact percentage wage premium of binary dummy variables.","mathml":"<span class=\"katex\"><math xmlns=\"http://www.w3.org/1998/Math/MathML\" display=\"block\"><semantics><mrow><msub><mover accent=\"true\"><mi>V</mi><mo stretchy=\"true\">^</mo></mover><mtext>HC1</mtext></msub><mo stretchy=\"false\">(</mo><mover accent=\"true\"><mi>β</mi><mo>^</mo></mover><mo stretchy=\"false\">)</mo><mo>=</mo><mfrac><mi>n</mi><mrow><mi>n</mi><mo>−</mo><mi>k</mi></mrow></mfrac><mtext> </mtext><mo stretchy=\"false\">(</mo><msup><mi>X</mi><mi mathvariant=\"normal\">⊤</mi></msup><mi>X</mi><msup><mo stretchy=\"false\">)</mo><mrow><mo>−</mo><mn>1</mn></mrow></msup><mtext> ⁣</mtext><mrow><mo fence=\"true\">(</mo><munderover><mo>∑</mo><mrow><mi>i</mi><mo>=</mo><mn>1</mn></mrow><mi>n</mi></munderover><msubsup><mover accent=\"true\"><mi>ε</mi><mo>^</mo></mover><mi>i</mi><mrow><mtext> </mtext><mn>2</mn></mrow></msubsup><mtext> </mtext><msub><mi>x</mi><mi>i</mi></msub><msubsup><mi>x</mi><mi>i</mi><mi mathvariant=\"normal\">⊤</mi></msubsup><mo fence=\"true\">)</mo></mrow><mo stretchy=\"false\">(</mo><msup><mi>X</mi><mi mathvariant=\"normal\">⊤</mi></msup><mi>X</mi><msup><mo stretchy=\"false\">)</mo><mrow><mo>−</mo><mn>1</mn></mrow></msup><mo separator=\"true\">,</mo><mspace width=\"2em\"/><mi mathvariant=\"normal\">Δ</mi><mi mathvariant=\"normal\">%</mi><mo>=</mo><mrow><mo fence=\"true\">(</mo><mi>exp</mi><mo>⁡</mo><mo stretchy=\"false\">(</mo><msub><mover accent=\"true\"><mi>β</mi><mo>^</mo></mover><mi>j</mi></msub><mo stretchy=\"false\">)</mo><mo>−</mo><mn>1</mn><mo fence=\"true\">)</mo></mrow><mo>×</mo><mn>100</mn><mi mathvariant=\"normal\">%</mi></mrow><annotation encoding=\"application/x-tex\">\\widehat{V}_{\\text{HC1}}(\\hat{\\beta}) = \\frac{n}{n - k}\\,(X^\\top X)^{-1}\\!\\left(\\sum_{i=1}^{n} \\hat{\\varepsilon}_i^{\\,2}\\, x_i x_i^\\top\\right)(X^\\top X)^{-1}, \\qquad \\Delta\\% = \\left(\\exp(\\hat{\\beta}_j) - 1\\right)\\times 100\\%</annotation></semantics></math></span>"},{"key":"anova","num":3,"tex":"\\eta^2 = \\frac{SS_{\\text{between}}}{SS_{\\text{total}}} = \\frac{\\sum_{g=1}^{G} n_g \\left(\\bar{y}_g - \\bar{y}\\right)^2}{\\sum_{g=1}^{G}\\sum_{i=1}^{n_g}\\left(y_{gi} - \\bar{y}\\right)^2}, \\qquad F = \\frac{SS_{\\text{between}} / (G - 1)}{SS_{\\text{within}} / (N - G)}","ruTitle":"Декомпозиция дисперсии логарифма зарплат (Однофакторный ANOVA, η² и F-критерий)","enTitle":"One-Way ANOVA Log-Wage Variance Decomposition (η² & Fisher’s F-test)","ruNote":"Доля общей дисперсии логарифма зарплат y = ln(W), объясняемая группирующим институциональным фактором из G категорий на выборке N.","enNote":"Proportion of total log-wage variance y = ln(W) explained by an institutional grouping factor with G categories across N observations.","mathml":"<span class=\"katex\"><math xmlns=\"http://www.w3.org/1998/Math/MathML\" display=\"block\"><semantics><mrow><msup><mi>η</mi><mn>2</mn></msup><mo>=</mo><mfrac><mrow><mi>S</mi><msub><mi>S</mi><mtext>between</mtext></msub></mrow><mrow><mi>S</mi><msub><mi>S</mi><mtext>total</mtext></msub></mrow></mfrac><mo>=</mo><mfrac><mrow><munderover><mo>∑</mo><mrow><mi>g</mi><mo>=</mo><mn>1</mn></mrow><mi>G</mi></munderover><msub><mi>n</mi><mi>g</mi></msub><msup><mrow><mo fence=\"true\">(</mo><msub><mover accent=\"true\"><mi>y</mi><mo>ˉ</mo></mover><mi>g</mi></msub><mo>−</mo><mover accent=\"true\"><mi>y</mi><mo>ˉ</mo></mover><mo fence=\"true\">)</mo></mrow><mn>2</mn></msup></mrow><mrow><munderover><mo>∑</mo><mrow><mi>g</mi><mo>=</mo><mn>1</mn></mrow><mi>G</mi></munderover><munderover><mo>∑</mo><mrow><mi>i</mi><mo>=</mo><mn>1</mn></mrow><msub><mi>n</mi><mi>g</mi></msub></munderover><msup><mrow><mo fence=\"true\">(</mo><msub><mi>y</mi><mrow><mi>g</mi><mi>i</mi></mrow></msub><mo>−</mo><mover accent=\"true\"><mi>y</mi><mo>ˉ</mo></mover><mo fence=\"true\">)</mo></mrow><mn>2</mn></msup></mrow></mfrac><mo separator=\"true\">,</mo><mspace width=\"2em\"/><mi>F</mi><mo>=</mo><mfrac><mrow><mi>S</mi><msub><mi>S</mi><mtext>between</mtext></msub><mi mathvariant=\"normal\">/</mi><mo stretchy=\"false\">(</mo><mi>G</mi><mo>−</mo><mn>1</mn><mo stretchy=\"false\">)</mo></mrow><mrow><mi>S</mi><msub><mi>S</mi><mtext>within</mtext></msub><mi mathvariant=\"normal\">/</mi><mo stretchy=\"false\">(</mo><mi>N</mi><mo>−</mo><mi>G</mi><mo stretchy=\"false\">)</mo></mrow></mfrac></mrow><annotation encoding=\"application/x-tex\">\\eta^2 = \\frac{SS_{\\text{between}}}{SS_{\\text{total}}} = \\frac{\\sum_{g=1}^{G} n_g \\left(\\bar{y}_g - \\bar{y}\\right)^2}{\\sum_{g=1}^{G}\\sum_{i=1}^{n_g}\\left(y_{gi} - \\bar{y}\\right)^2}, \\qquad F = \\frac{SS_{\\text{between}} / (G - 1)}{SS_{\\text{within}} / (N - G)}</annotation></semantics></math></span>"},{"key":"mannWhitney","num":4,"tex":"U_1 = R_1 - \\frac{n_1(n_1 + 1)}{2}, \\qquad z = \\frac{U_1 - \\frac{n_1 n_2}{2}}{\\sqrt{\\frac{n_1 n_2}{12}\\!\\left(N + 1 - \\frac{\\sum (t_k^3 - t_k)}{N(N - 1)}\\right)}}, \\qquad \\delta = \\frac{2U_1}{n_1 n_2} - 1","ruTitle":"Ранговый U-критерий Манна — Уитни с поправкой на связки и дельта Клиффа (δ)","enTitle":"Mann–Whitney U Test with Tie Correction & Cliff’s Delta Effect Size (δ)","ruNote":"R₁ — сумма рангов первой выборки объёма n₁; t_k — число совпадающих наблюдений в k-й группе связок; δ ∈ [−1, +1] — непараметрический размер эффекта.","enNote":"R₁ is the rank sum of group 1 (size n₁); t_k is the number of tied observations in tie group k; δ ∈ [−1, +1] is the non-parametric effect size.","mathml":"<span class=\"katex\"><math xmlns=\"http://www.w3.org/1998/Math/MathML\" display=\"block\"><semantics><mrow><msub><mi>U</mi><mn>1</mn></msub><mo>=</mo><msub><mi>R</mi><mn>1</mn></msub><mo>−</mo><mfrac><mrow><msub><mi>n</mi><mn>1</mn></msub><mo stretchy=\"false\">(</mo><msub><mi>n</mi><mn>1</mn></msub><mo>+</mo><mn>1</mn><mo stretchy=\"false\">)</mo></mrow><mn>2</mn></mfrac><mo separator=\"true\">,</mo><mspace width=\"2em\"/><mi>z</mi><mo>=</mo><mfrac><mrow><msub><mi>U</mi><mn>1</mn></msub><mo>−</mo><mfrac><mrow><msub><mi>n</mi><mn>1</mn></msub><msub><mi>n</mi><mn>2</mn></msub></mrow><mn>2</mn></mfrac></mrow><msqrt><mrow><mfrac><mrow><msub><mi>n</mi><mn>1</mn></msub><msub><mi>n</mi><mn>2</mn></msub></mrow><mn>12</mn></mfrac><mtext> ⁣</mtext><mrow><mo fence=\"true\">(</mo><mi>N</mi><mo>+</mo><mn>1</mn><mo>−</mo><mfrac><mrow><mo>∑</mo><mo stretchy=\"false\">(</mo><msubsup><mi>t</mi><mi>k</mi><mn>3</mn></msubsup><mo>−</mo><msub><mi>t</mi><mi>k</mi></msub><mo stretchy=\"false\">)</mo></mrow><mrow><mi>N</mi><mo stretchy=\"false\">(</mo><mi>N</mi><mo>−</mo><mn>1</mn><mo stretchy=\"false\">)</mo></mrow></mfrac><mo fence=\"true\">)</mo></mrow></mrow></msqrt></mfrac><mo separator=\"true\">,</mo><mspace width=\"2em\"/><mi>δ</mi><mo>=</mo><mfrac><mrow><mn>2</mn><msub><mi>U</mi><mn>1</mn></msub></mrow><mrow><msub><mi>n</mi><mn>1</mn></msub><msub><mi>n</mi><mn>2</mn></msub></mrow></mfrac><mo>−</mo><mn>1</mn></mrow><annotation encoding=\"application/x-tex\">U_1 = R_1 - \\frac{n_1(n_1 + 1)}{2}, \\qquad z = \\frac{U_1 - \\frac{n_1 n_2}{2}}{\\sqrt{\\frac{n_1 n_2}{12}\\!\\left(N + 1 - \\frac{\\sum (t_k^3 - t_k)}{N(N - 1)}\\right)}}, \\qquad \\delta = \\frac{2U_1}{n_1 n_2} - 1</annotation></semantics></math></span>"},{"key":"kruskalWallis","num":5,"tex":"H = \\frac{\\frac{12}{N(N + 1)}\\sum_{g=1}^{G}\\frac{R_g^2}{n_g} - 3(N + 1)}{1 - \\frac{\\sum (t_k^3 - t_k)}{N^3 - N}}, \\qquad \\varepsilon^2 = \\frac{H}{N - 1}","ruTitle":"Ранговый дисперсионный критерий Краскела — Уоллиса (H) и коэффициент ε²","enTitle":"Kruskal–Wallis Rank ANOVA (H) & Epsilon-Squared Effect Size (ε²)","ruNote":"Непараметрический аналог ANOVA для G ≥ 3 независимых групп (регионов или грейдов) с поправкой на связанные ранги.","enNote":"Non-parametric multi-group rank test across G ≥ 3 independent groups (regions or seniority grades) with tie correction.","mathml":"<span class=\"katex\"><math xmlns=\"http://www.w3.org/1998/Math/MathML\" display=\"block\"><semantics><mrow><mi>H</mi><mo>=</mo><mfrac><mrow><mfrac><mn>12</mn><mrow><mi>N</mi><mo stretchy=\"false\">(</mo><mi>N</mi><mo>+</mo><mn>1</mn><mo stretchy=\"false\">)</mo></mrow></mfrac><munderover><mo>∑</mo><mrow><mi>g</mi><mo>=</mo><mn>1</mn></mrow><mi>G</mi></munderover><mfrac><msubsup><mi>R</mi><mi>g</mi><mn>2</mn></msubsup><msub><mi>n</mi><mi>g</mi></msub></mfrac><mo>−</mo><mn>3</mn><mo stretchy=\"false\">(</mo><mi>N</mi><mo>+</mo><mn>1</mn><mo stretchy=\"false\">)</mo></mrow><mrow><mn>1</mn><mo>−</mo><mfrac><mrow><mo>∑</mo><mo stretchy=\"false\">(</mo><msubsup><mi>t</mi><mi>k</mi><mn>3</mn></msubsup><mo>−</mo><msub><mi>t</mi><mi>k</mi></msub><mo stretchy=\"false\">)</mo></mrow><mrow><msup><mi>N</mi><mn>3</mn></msup><mo>−</mo><mi>N</mi></mrow></mfrac></mrow></mfrac><mo separator=\"true\">,</mo><mspace width=\"2em\"/><msup><mi>ε</mi><mn>2</mn></msup><mo>=</mo><mfrac><mi>H</mi><mrow><mi>N</mi><mo>−</mo><mn>1</mn></mrow></mfrac></mrow><annotation encoding=\"application/x-tex\">H = \\frac{\\frac{12}{N(N + 1)}\\sum_{g=1}^{G}\\frac{R_g^2}{n_g} - 3(N + 1)}{1 - \\frac{\\sum (t_k^3 - t_k)}{N^3 - N}}, \\qquad \\varepsilon^2 = \\frac{H}{N - 1}</annotation></semantics></math></span>"},{"key":"cmhAndGini","num":6,"tex":"\\text{Gap}_{\\text{CMH}} = \\exp\\!\\left(\\frac{\\sum_{c} w_c \\ln(\\tilde{y}_{c,1} / \\tilde{y}_{c,0})}{\\sum_{c} w_c}\\right) - 1, \\qquad G = \\frac{\\sum_{i=1}^{n}(2i - n - 1)\\,x_{(i)}}{n\\sum_{i=1}^{n} x_{(i)}}, \\qquad \\text{QCD} = \\frac{P_{75} - P_{25}}{P_{75} + P_{25}}","ruTitle":"Поправка Кохрана — Мантеля — Хензеля на парадокс Симпсона, индекс Джини (G) и дисперсия (QCD)","enTitle":"Cochran–Mantel–Haenszel Stratified Adjustment, Gini Coefficient (G) & Quartile Dispersion (QCD)","ruNote":"Внутриячеечное сопоставление при равной роли и грейде c = (role, grade) с весами w_c = min(n_{c,1}, n_{c,0}), индекс концентрации Джини и квартильная дисперсия.","enNote":"Within-cell matching across c = (role, grade) strata with weights w_c = min(n_{c,1}, n_{c,0}), Gini inequality index, and quartile dispersion.","mathml":"<span class=\"katex\"><math xmlns=\"http://www.w3.org/1998/Math/MathML\" display=\"block\"><semantics><mrow><msub><mtext>Gap</mtext><mtext>CMH</mtext></msub><mo>=</mo><mi>exp</mi><mo>⁡</mo><mtext> ⁣</mtext><mrow><mo fence=\"true\">(</mo><mfrac><mrow><munder><mo>∑</mo><mi>c</mi></munder><msub><mi>w</mi><mi>c</mi></msub><mi>ln</mi><mo>⁡</mo><mo stretchy=\"false\">(</mo><msub><mover accent=\"true\"><mi>y</mi><mo>~</mo></mover><mrow><mi>c</mi><mo separator=\"true\">,</mo><mn>1</mn></mrow></msub><mi mathvariant=\"normal\">/</mi><msub><mover accent=\"true\"><mi>y</mi><mo>~</mo></mover><mrow><mi>c</mi><mo separator=\"true\">,</mo><mn>0</mn></mrow></msub><mo stretchy=\"false\">)</mo></mrow><mrow><munder><mo>∑</mo><mi>c</mi></munder><msub><mi>w</mi><mi>c</mi></msub></mrow></mfrac><mo fence=\"true\">)</mo></mrow><mo>−</mo><mn>1</mn><mo separator=\"true\">,</mo><mspace width=\"2em\"/><mi>G</mi><mo>=</mo><mfrac><mrow><munderover><mo>∑</mo><mrow><mi>i</mi><mo>=</mo><mn>1</mn></mrow><mi>n</mi></munderover><mo stretchy=\"false\">(</mo><mn>2</mn><mi>i</mi><mo>−</mo><mi>n</mi><mo>−</mo><mn>1</mn><mo stretchy=\"false\">)</mo><mtext> </mtext><msub><mi>x</mi><mrow><mo stretchy=\"false\">(</mo><mi>i</mi><mo stretchy=\"false\">)</mo></mrow></msub></mrow><mrow><mi>n</mi><munderover><mo>∑</mo><mrow><mi>i</mi><mo>=</mo><mn>1</mn></mrow><mi>n</mi></munderover><msub><mi>x</mi><mrow><mo stretchy=\"false\">(</mo><mi>i</mi><mo stretchy=\"false\">)</mo></mrow></msub></mrow></mfrac><mo separator=\"true\">,</mo><mspace width=\"2em\"/><mtext>QCD</mtext><mo>=</mo><mfrac><mrow><msub><mi>P</mi><mn>75</mn></msub><mo>−</mo><msub><mi>P</mi><mn>25</mn></msub></mrow><mrow><msub><mi>P</mi><mn>75</mn></msub><mo>+</mo><msub><mi>P</mi><mn>25</mn></msub></mrow></mfrac></mrow><annotation encoding=\"application/x-tex\">\\text{Gap}_{\\text{CMH}} = \\exp\\!\\left(\\frac{\\sum_{c} w_c \\ln(\\tilde{y}_{c,1} / \\tilde{y}_{c,0})}{\\sum_{c} w_c}\\right) - 1, \\qquad G = \\frac{\\sum_{i=1}^{n}(2i - n - 1)\\,x_{(i)}}{n\\sum_{i=1}^{n} x_{(i)}}, \\qquad \\text{QCD} = \\frac{P_{75} - P_{25}}{P_{75} + P_{25}}</annotation></semantics></math></span>"},{"key":"blinderOaxaca","num":7,"tex":"\\Delta\\overline{\\ln W} = \\overline{\\ln W}_A - \\overline{\\ln W}_B = \\underbrace{(\\bar{\\mathbf{X}}_A - \\bar{\\mathbf{X}}_B)^\\top \\hat{\\boldsymbol{\\beta}}^*}_{\\text{Endowments } (E)} + \\underbrace{\\bigl[\\bar{\\mathbf{X}}_A^\\top (\\hat{\\boldsymbol{\\beta}}_A - \\hat{\\boldsymbol{\\beta}}^*) + \\bar{\\mathbf{X}}_B^\\top (\\hat{\\boldsymbol{\\beta}}^* - \\hat{\\boldsymbol{\\beta}}_B)\\bigr]}_{\\text{Coefficients / Pure Returns } (C)}","ruTitle":"Двухфакторная декомпозиция Оахаки — Блайндера (Blinder–Oaxaca Decomposition)","enTitle":"Blinder–Oaxaca Twofold Econometric Wage Decomposition","ruNote":"Разложение межгруппового разрыва логарифмов зарплат на эффект композиции квалификации (Endowments E) и чистую ценовую ренту (Coefficients C).","enNote":"Decomposes mean log-wage differentials into human-capital composition (Endowments E) and pure structural returns (Coefficients C).","mathml":"<span class=\"katex\"><math xmlns=\"http://www.w3.org/1998/Math/MathML\" display=\"block\"><semantics><mrow><mi mathvariant=\"normal\">Δ</mi><mover accent=\"true\"><mrow><mi>ln</mi><mo>⁡</mo><mi>W</mi></mrow><mo stretchy=\"true\">‾</mo></mover><mo>=</mo><msub><mover accent=\"true\"><mrow><mi>ln</mi><mo>⁡</mo><mi>W</mi></mrow><mo stretchy=\"true\">‾</mo></mover><mi>A</mi></msub><mo>−</mo><msub><mover accent=\"true\"><mrow><mi>ln</mi><mo>⁡</mo><mi>W</mi></mrow><mo stretchy=\"true\">‾</mo></mover><mi>B</mi></msub><mo>=</mo><munder><munder><mrow><mo stretchy=\"false\">(</mo><msub><mover accent=\"true\"><mi mathvariant=\"bold\">X</mi><mo>ˉ</mo></mover><mi>A</mi></msub><mo>−</mo><msub><mover accent=\"true\"><mi mathvariant=\"bold\">X</mi><mo>ˉ</mo></mover><mi>B</mi></msub><msup><mo stretchy=\"false\">)</mo><mi mathvariant=\"normal\">⊤</mi></msup><msup><mover accent=\"true\"><mi mathvariant=\"bold-italic\">β</mi><mo>^</mo></mover><mo>∗</mo></msup></mrow><mo stretchy=\"true\">⏟</mo></munder><mrow><mtext>Endowments </mtext><mo stretchy=\"false\">(</mo><mi>E</mi><mo stretchy=\"false\">)</mo></mrow></munder><mo>+</mo><munder><munder><mrow><mo fence=\"true\" stretchy=\"true\" minsize=\"1.2em\" maxsize=\"1.2em\">[</mo><msubsup><mover accent=\"true\"><mi mathvariant=\"bold\">X</mi><mo>ˉ</mo></mover><mi>A</mi><mi mathvariant=\"normal\">⊤</mi></msubsup><mo stretchy=\"false\">(</mo><msub><mover accent=\"true\"><mi mathvariant=\"bold-italic\">β</mi><mo>^</mo></mover><mi>A</mi></msub><mo>−</mo><msup><mover accent=\"true\"><mi mathvariant=\"bold-italic\">β</mi><mo>^</mo></mover><mo>∗</mo></msup><mo stretchy=\"false\">)</mo><mo>+</mo><msubsup><mover accent=\"true\"><mi mathvariant=\"bold\">X</mi><mo>ˉ</mo></mover><mi>B</mi><mi mathvariant=\"normal\">⊤</mi></msubsup><mo stretchy=\"false\">(</mo><msup><mover accent=\"true\"><mi mathvariant=\"bold-italic\">β</mi><mo>^</mo></mover><mo>∗</mo></msup><mo>−</mo><msub><mover accent=\"true\"><mi mathvariant=\"bold-italic\">β</mi><mo>^</mo></mover><mi>B</mi></msub><mo stretchy=\"false\">)</mo><mo fence=\"true\" stretchy=\"true\" minsize=\"1.2em\" maxsize=\"1.2em\">]</mo></mrow><mo stretchy=\"true\">⏟</mo></munder><mrow><mtext>Coefficients / Pure Returns </mtext><mo stretchy=\"false\">(</mo><mi>C</mi><mo stretchy=\"false\">)</mo></mrow></munder></mrow><annotation encoding=\"application/x-tex\">\\Delta\\overline{\\ln W} = \\overline{\\ln W}_A - \\overline{\\ln W}_B = \\underbrace{(\\bar{\\mathbf{X}}_A - \\bar{\\mathbf{X}}_B)^\\top \\hat{\\boldsymbol{\\beta}}^*}_{\\text{Endowments } (E)} + \\underbrace{\\bigl[\\bar{\\mathbf{X}}_A^\\top (\\hat{\\boldsymbol{\\beta}}_A - \\hat{\\boldsymbol{\\beta}}^*) + \\bar{\\mathbf{X}}_B^\\top (\\hat{\\boldsymbol{\\beta}}^* - \\hat{\\boldsymbol{\\beta}}_B)\\bigr]}_{\\text{Coefficients / Pure Returns } (C)}</annotation></semantics></math></span>"},{"key":"theilAndIpw","num":8,"tex":"T_{\\text{Theil}} = \\frac{1}{n}\\sum_{i=1}^{n}\\frac{W_i}{\\overline{W}}\\ln\\!\\left(\\frac{W_i}{\\overline{W}}\\right), \\qquad \\widehat{M}_{\\text{IPW}} = \\operatorname{median}_{w_i}(W_i), \\quad w_i = \\frac{1}{\\hat{P}(\\text{Disclosed}=1 \\mid \\text{Grade}_i)}","ruTitle":"Индекс энтропии Тейла GE(1) и поправка Хорвица — Томпсона (IPW) на цензурирование вилок","enTitle":"Theil Entropy Index GE(1) & Horvitz–Thompson IPW Selection Bias Correction","ruNote":"Аддитивно разложимый индекс неравенства Тейла и оценка медианы с весами обратной вероятности раскрытия зарплатной вилки по грейдам.","enNote":"Additively decomposable generalized entropy index and inverse-probability-weighted median correcting for non-random salary hiding.","mathml":"<span class=\"katex\"><math xmlns=\"http://www.w3.org/1998/Math/MathML\" display=\"block\"><semantics><mrow><msub><mi>T</mi><mtext>Theil</mtext></msub><mo>=</mo><mfrac><mn>1</mn><mi>n</mi></mfrac><munderover><mo>∑</mo><mrow><mi>i</mi><mo>=</mo><mn>1</mn></mrow><mi>n</mi></munderover><mfrac><msub><mi>W</mi><mi>i</mi></msub><mover accent=\"true\"><mi>W</mi><mo stretchy=\"true\">‾</mo></mover></mfrac><mi>ln</mi><mo>⁡</mo><mtext> ⁣</mtext><mrow><mo fence=\"true\">(</mo><mfrac><msub><mi>W</mi><mi>i</mi></msub><mover accent=\"true\"><mi>W</mi><mo stretchy=\"true\">‾</mo></mover></mfrac><mo fence=\"true\">)</mo></mrow><mo separator=\"true\">,</mo><mspace width=\"2em\"/><msub><mover accent=\"true\"><mi>M</mi><mo stretchy=\"true\">^</mo></mover><mtext>IPW</mtext></msub><mo>=</mo><msub><mrow><mi mathvariant=\"normal\">median</mi><mo>⁡</mo></mrow><msub><mi>w</mi><mi>i</mi></msub></msub><mo stretchy=\"false\">(</mo><msub><mi>W</mi><mi>i</mi></msub><mo stretchy=\"false\">)</mo><mo separator=\"true\">,</mo><mspace width=\"1em\"/><msub><mi>w</mi><mi>i</mi></msub><mo>=</mo><mfrac><mn>1</mn><mrow><mover accent=\"true\"><mi>P</mi><mo>^</mo></mover><mo stretchy=\"false\">(</mo><mtext>Disclosed</mtext><mo>=</mo><mn>1</mn><mo>∣</mo><msub><mtext>Grade</mtext><mi>i</mi></msub><mo stretchy=\"false\">)</mo></mrow></mfrac></mrow><annotation encoding=\"application/x-tex\">T_{\\text{Theil}} = \\frac{1}{n}\\sum_{i=1}^{n}\\frac{W_i}{\\overline{W}}\\ln\\!\\left(\\frac{W_i}{\\overline{W}}\\right), \\qquad \\widehat{M}_{\\text{IPW}} = \\operatorname{median}_{w_i}(W_i), \\quad w_i = \\frac{1}{\\hat{P}(\\text{Disclosed}=1 \\mid \\text{Grade}_i)}</annotation></semantics></math></span>"}];
  return `<div style="margin-top:20px" id="mathematical-apparatus">
  <h3>${en ? "Mathematical apparatus & econometric specification (LaTeX / MathML)" : "Математический аппарат и спецификация эконометрических моделей (LaTeX / MathML)"}</h3>
  <p class="muted small">${en
    ? "Exact mathematical formulations used in the automated econometric pipeline. Each equation is typeset via KaTeX/MathML and includes its raw LaTeX source code for direct citation in academic papers and theses:"
    : "Строгая математическая запись уравнений и критериев, заложенных в расчётное ядро openradar. Каждая формула свёрстана в стандарте KaTeX / W3C MathML и снабжена кнопкой копирования исходного кода LaTeX для вставки в научные статьи, диссертации и ВКР:"}</p>
  <div style="display:grid;grid-template-columns:1fr;gap:12px;margin-top:12px">
    ${cards
      .map(
        (c) => `<div class="rs-formula-card">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap">
          <div>
            <b>(${c.num}) ${escapeHtml(en ? c.enTitle : c.ruTitle)}</b>
            <p class="muted small" style="margin:4px 0 0 0">${escapeHtml(en ? c.enNote : c.ruNote)}</p>
          </div>
          <div style="display:flex;align-items:center;gap:6px">
            <span class="muted small">LaTeX:</span>
            ${quoteButton(c.tex, lang)}
          </div>
        </div>
        <div class="rs-formula-math">
          ${c.mathml}
        </div>
        <div class="small muted" style="margin-top:6px;font-family:monospace;overflow-x:auto"><code>${escapeHtml(c.tex)}</code></div>
      </div>`,
      )
      .join("")}
  </div>
</div>`;
}

const MAGNITUDE_TEXT: Record<SupportedLang, Record<EffectMagnitude, string>> = {
  ru: { negligible: "пренебрежимый", small: "малый", medium: "средний", large: "большой" },
  en: { negligible: "negligible", small: "small", medium: "medium", large: "large" },
};

function magnitudeText(m: EffectMagnitude, lang: SupportedLang): string {
  return MAGNITUDE_TEXT[lang][m];
}

/** "< 0.001" stays as is; "0.042" reads "= 0.042". */
function pText(formatted: string): string {
  return formatted.startsWith("<") ? formatted : `= ${formatted}`;
}

export function renderScientificSection(scientific: ScientificAnalysis | undefined, lang: SupportedLang = "ru"): string {
  if (!scientific) return "";
  const { mincer, varianceDecomposition, hypotheses, oaxaca } = scientific;
  if (!mincer && !varianceDecomposition.length && !hypotheses.length) return "";
  const en = lang === "en";
  const fmt = (v: number): string => (en ? `₽${new Intl.NumberFormat("en-US").format(v)}` : formatRub(v));
  const mincerLabelEn: Record<string, string> = {
    intercept: "Intercept β₀ (Junior/Intern, regional office)",
    middle: "Seniority: Middle (vs Junior/Intern)",
    senior: "Seniority: Senior (vs Junior/Intern)",
    lead: "Seniority: Lead / Staff (vs Junior/Intern)",
    moscow: "Location: Moscow office/hybrid (vs regions)",
    spb: "Location: St. Petersburg office/hybrid (vs regions)",
    remote: "Work mode: All-Russia Remote (vs regional office)",
    ai: "Skill requirement: AI / LLM mentioned",
  };
  const anovaLabelEn: Record<string, string> = {
    grade: "Seniority grade (Intern → Lead in IT)",
    geo: "Geography & work mode (Moscow, SPb, regions, remote)",
    role: "Professional specialization (role)",
    language: "Primary programming language / stack",
  };
  const hypTitleEn: Record<string, { title: string; method: string; effectLabel: string }> = {
    H1: {
      title: "All-Russia Remote IT wage premium over regional offices",
      method: "Mann–Whitney U test & Cliff’s delta (δ)",
      effectLabel: "Cliff’s delta δ",
    },
    H2: {
      title: "Inter-regional IT wage stratification across 4 segments",
      method: "Kruskal–Wallis H test (rank ANOVA)",
      effectLabel: "Explained variance ε²",
    },
    H3: {
      title: "Monotonic wage returns to seniority grade (Intern → Lead)",
      method: "Kruskal–Wallis H test across grades",
      effectLabel: "Explained variance ε²",
    },
    H4: {
      title: "Salary disclosure selection bias in higher-paid roles",
      method: "Spearman rank correlation (ρ_s) between median & % stated pay",
      effectLabel: "Spearman ρ_s",
    },
  };

  return `<section class="rs-section" id="scientific-models">
  <h2>${en ? "Econometric modeling, variance decomposition & hypothesis testing" : "Эконометрическое моделирование, декомпозиция дисперсии и проверка гипотез"}</h2>
  <p class="muted small">${en
    ? "Inferential statistical models estimated directly on the empirical micro-dataset: a multi-factor Mincerian log-wage OLS regression with White (HC1) heteroskedasticity-robust standard errors, one-way ANOVA decomposition of log-wage inequality (η²), and non-parametric hypothesis tests."
    : "Инференциальный статистический анализ по микроданным выборки: оценка многофакторного лог-линейного уравнения заработной платы Якоба Минсера методом МНК (OLS) с гетероскедастично-робастными стандартными ошибками Уайта (HC1), однофакторная декомпозиция дисперсии логарифма зарплат (ANOVA η²) и формальная проверка исследовательских гипотез."}</p>
  ${mincer ? `<h3 style="margin-top:16px">${en ? "Table 1. Mincerian log-wage regression (OLS with White HC1 robust standard errors)" : "Таблица 1. Оценка уравнения заработной платы Минсера (МНК с робастными ошибками Уайта HC1)"}</h3>
  <p class="muted small">${en
    ? "Dependent variable: natural logarithm of monthly pay ln(W_i) in graded IT vacancies. Reference baseline (β₀): Junior/Intern specialist in a regional office without AI requirements. Exact semi-elasticity: Δ% = (exp(β) − 1) × 100%."
    : "Зависимая переменная — натуральный логарифм месячной оплаты ln(W_i) в IT-вакансиях с указанным грейдом. Базовая категория (константа β₀) — специалист уровня Junior/Intern в региональном офисе. Точный процентный вклад фактора при прочих равных (ceteris paribus) вычисляется по поправке Халворсена — Палмквиста: Δ% = (exp(β) − 1) × 100%."}</p>
  <div style="overflow-x:auto">
    <table class="table">
      <thead>
        <tr>
          <th>${en ? "Explanatory factor (variable)" : "Фактор модели (объясняющая переменная)"}</th>
          <th>${en ? "Coeff. β (log)" : "Коэффициент β"}</th>
          <th>${en ? "Robust SE (HC1)" : "Робастная SE (HC1)"}</th>
          <th>${en ? "t-statistic" : "t-статистика"}</th>
          <th>p-value</th>
          <th>${en ? "Pure effect Δ% (ceteris paribus)" : "Чистый эффект Δ% (ceteris paribus)"}</th>
        </tr>
      </thead>
      <tbody>
        ${mincer.coefficients
          .map((c) => {
            const eff =
              c.key === "intercept" && c.baselineRub
                ? `<b>${escapeHtml(fmt(c.baselineRub))}</b> <span class="muted small">(${en ? "base" : "база"})</span>`
                : c.effectPct !== undefined
                  ? `<b style="color:${c.effectPct > 0 ? "var(--emerald)" : "inherit"}">${c.effectPct > 0 ? "+" : ""}${c.effectPct}%</b>`
                  : "—";
            return `<tr>
              <td><b>${escapeHtml(en ? (mincerLabelEn[c.key] ?? c.label) : c.label)}</b></td>
              <td><code>${c.beta > 0 && c.key !== "intercept" ? "+" : ""}${c.beta.toFixed(3)}${c.stars}</code></td>
              <td><code>${c.se.toFixed(3)}</code></td>
              <td><code>${c.tStat.toFixed(2)}</code></td>
              <td><b>${escapeHtml(c.pValue)}</b></td>
              <td>${eff}</td>
            </tr>`;
          })
          .join("")}
      </tbody>
    </table>
  </div>
  <p class="rs-legend">
    <span><b>${en ? "Model diagnostics:" : "Диагностика модели:"}</b> N = ${num(mincer.n)}</span>
    <span>· R² = <b>${mincer.r2.toFixed(3)}</b> (${en ? "adj. R²" : "скорр. R²"} = <b>${mincer.adjR2.toFixed(3)}</b>)</span>
    <span>· ${en ? "Fisher F-statistic" : "F-статистика Фишера"} = <b>${mincer.fStat}</b>${mincer.fPValue ? ` (p ${escapeHtml(pText(mincer.fPValue))})` : ""}</span>
    <span class="muted">· *** p &lt; 0.001, ** p &lt; 0.01, * p &lt; 0.05${mincer.df !== undefined ? (en ? `; t-test with df = ${num(mincer.df)}` : `; t-критерий, df = ${num(mincer.df)}`) : ""}</span>
  </p>` : ""}
  ${varianceDecomposition.length ? `<h3 style="margin-top:20px">${en ? "Table 2. ANOVA decomposition of log-wage variance (η² Eta-squared)" : "Таблица 2. Декомпозиция дисперсии логарифма зарплат (ANOVA η²)"}</h3>
  <p class="muted small">${en
    ? "Share of total variance in log-wages ln(W) explained by each institutional dimension (η² = SS_between / SS_total)."
    : "Какую долю общего разброса логарифма зарплат ln(W) объясняет каждый институциональный фактор в отдельности (коэффициент детерминации η² = SS_between / SS_total)."}</p>
  <div style="overflow-x:auto">
    <table class="table">
      <thead>
        <tr>
          <th>${en ? "Institutional factor" : "Институциональный фактор"}</th>
          <th>${en ? "Sample (N)" : "Выборка (N)"}</th>
          <th>${en ? "Categories (G)" : "Групп (G)"}</th>
          <th>${en ? "Variance explained (η²)" : "Объяснённая дисперсия (η²)"}</th>
          <th>${en ? "Fisher F-stat" : "F-критерий Фишера"}</th>
          <th>p-value</th>
        </tr>
      </thead>
      <tbody>
        ${varianceDecomposition
          .map(
            (v) => `<tr>
              <td><b>${escapeHtml(en ? (anovaLabelEn[v.key] ?? v.label) : v.label)}</b></td>
              <td>${num(v.n)}</td>
              <td>${v.groups}</td>
              <td><b>${en ? `${v.etaSqPct}%` : formatShare(v.etaSqPct)}</b></td>
              <td><code>F = ${v.fStat}</code></td>
              <td><b>${escapeHtml(v.pValue)}</b></td>
            </tr>`,
          )
          .join("")}
      </tbody>
    </table>
  </div>` : ""}
  ${hypotheses.length ? `<h3 style="margin-top:20px">${en ? "Table 3. Formal hypothesis testing summary (H1–H4)" : "Таблица 3. Сводка проверки статистических гипотез (H1–H4)"}</h3>
  <p class="muted small">${en
    ? "Distribution-free rank tests (Mann–Whitney U, Kruskal–Wallis H, Spearman ρ_s) and standardized effect sizes. Exact p-values; Holm–Bonferroni adjustment across H1–H4. A hypothesis is confirmed only when the adjusted p &lt; 0.05 and the effect is at least small: with thousands of observations almost any difference is significant."
    : "Непараметрические ранговые критерии (Манна — Уитни U, Краскела — Уоллиса H, корреляция Спирмена ρ_s), защищённые от правосторонней асимметрии и выбросов. p-значения точные, поправка Холма — Бонферрони на четыре гипотезы. Гипотеза подтверждена, только если скорректированное p &lt; 0,05 и эффект не меньше малого: на тысячах наблюдений значимой оказывается почти любая разница."}</p>
  <div style="overflow-x:auto">
    <table class="table">
      <thead>
        <tr>
          <th>ID</th>
          <th>${en ? "Research hypothesis" : "Исследовательская гипотеза"}</th>
          <th>${en ? "Statistical test" : "Статистический критерий"}</th>
          <th>n</th>
          <th>${en ? "Test statistic" : "Статистика"}</th>
          <th>p-value</th>
          <th>${en ? "p (Holm)" : "p (Холм)"}</th>
          <th>${en ? "Effect size" : "Размер эффекта"}</th>
          <th>${en ? "Verdict" : "Вывод"}</th>
        </tr>
      </thead>
      <tbody>
        ${hypotheses
          .map((h) => {
            const tr = en ? hypTitleEn[h.id] : undefined;
            return `<tr>
              <td><b>${h.id}</b></td>
              <td><b>${escapeHtml(tr?.title ?? h.title)}</b></td>
              <td class="small">${escapeHtml(tr?.method ?? h.method)}</td>
              <td>${num(h.n)}</td>
              <td><code>${escapeHtml(h.statValue)}</code></td>
              <td>${escapeHtml(h.pValue)}</td>
              <td><b>${h.pAdjustedLabel ? escapeHtml(h.pAdjustedLabel) : "—"}</b></td>
              <td><b>${escapeHtml(tr?.effectLabel ?? h.effectLabel)}: ${escapeHtml(h.effectValue)}</b>${h.effectMagnitude ? ` <span class="muted small">(${escapeHtml(magnitudeText(h.effectMagnitude, lang))})</span>` : ""}</td>
              <td>${h.confirmed ? `<b style="color:var(--emerald)">${en ? "confirmed" : "подтверждена"}</b>` : `<span class="muted">${en ? "not confirmed" : "не подтверждена"}</span>`}</td>
            </tr>`;
          })
          .join("")}
      </tbody>
    </table>
  </div>` : ""}
  ${oaxaca && oaxaca.length ? `<h3 style="margin-top:20px">${en ? "Table 4. Blinder–Oaxaca twofold wage gap decomposition (Endowments vs Pure Returns)" : "Таблица 4. Эконометрическая декомпозиция зарплатных разрывов Оахаки — Блайндера"}</h3>
  <p class="muted small">${en
    ? "Separates the mean log-wage differential Δln(W) between groups into the Endowment Effect (E: differences in seniority grade, high-paying roles, and AI skills) and the pure Coefficient / Returns Effect (C: pure location or remote rent at equal human capital)."
    : "Разделяет наблюдаемый разрыв логарифмов зарплат Δln(W) на две составляющие: эффект структуры / характеристик (Endowments E — различия в доле Senior/Lead и дорогих специализаций) и чистый ценовой эффект (Coefficients C — чистая рента локации или удалёнки при равной квалификационной структуре)."}</p>
  <div style="overflow-x:auto">
    <table class="table">
      <thead>
        <tr>
          <th>${en ? "Structural comparison (A vs B)" : "Сравниваемые сегменты (A против B)"}</th>
          <th>${en ? "Sample (n_A / n_B)" : "Выборка (n_A / n_B)"}</th>
          <th>${en ? "Total gap Δln(W)" : "Общий разрыв Δln(W)"}</th>
          <th>${en ? "Endowment effect E (composition)" : "Эффект структуры E (композиция)"}</th>
          <th>${en ? "Pure returns effect C (rent)" : "Чистый ценовой эффект C (рента)"}</th>
        </tr>
      </thead>
      <tbody>
        ${oaxaca
          .map((o) => {
            const label = en
              ? o.key === "moscow_vs_regions"
                ? "Moscow (office) vs Russian Regions (office) in IT"
                : "All-Russia Remote vs Russian Regions (office) in IT"
              : o.label;
            return `<tr>
              <td><b>${escapeHtml(label)}</b></td>
              <td>${num(o.nA)} / ${num(o.nB)}</td>
              <td><b>${o.totalLogGap >= 0 ? "+" : ""}${o.totalLogGap.toFixed(3)}</b> <span class="muted small">(${o.rawGapPct >= 0 ? "+" : ""}${o.rawGapPct}%)</span></td>
              <td><code>${o.endowmentLog >= 0 ? "+" : ""}${o.endowmentLog.toFixed(3)}</code> <span class="muted small">(${o.endowmentSharePct}% ${en ? "of gap" : "разрыва"})</span></td>
              <td><b><code>${o.coefficientLog >= 0 ? "+" : ""}${o.coefficientLog.toFixed(3)}</code></b> <span class="muted small">(${o.coefficientSharePct}% ${en ? "of gap" : "разрыва"}, ${o.coefficientPct >= 0 ? "+" : ""}${o.coefficientPct}%)</span></td>
            </tr>`;
          })
          .join("")}
      </tbody>
    </table>
  </div>` : ""}
  ${renderFormulaGallerySection(lang)}
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
  const oldMethod = report.version === 2 && REPORT_VERSION > 2
    ? `<p class="notice">Отчёт зафиксирован по версии методики 2: p-значения в блоке проверки гипотез там приблизительные, без поправки на множественные сравнения и без порога размера эффекта. Остальные цифры считаются так же. <a href="/research/methodology#versions">Что изменилось</a>.</p>`
    : report.version < REPORT_VERSION
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
  ${renderLanguageMatrixSection(jobs.languageMatrix, 'ru')}
</section>

<section class="rs-section">
  <h2>География и удалёнка</h2>
  ${rangeChart(sliceRows(jobs.byRegion))}
  <p class="small">Удалённую работу допускают <b>${formatShare(jobs.remote.share)}</b> вакансий.${jobs.remote.remote.median && jobs.remote.office.median ? ` Медиана: ${formatRub(jobs.remote.remote.median)} с удалёнкой и ${formatRub(jobs.remote.office.median)} без неё.` : ''}${jobs.remote.adjusted ? ` Вакансии с удалёнкой в среднем старше по уровню, поэтому важнее другое сравнение: при той же роли и уровне разница ${signedPct(jobs.remote.adjusted.pct)} (сравнение по ${num(jobs.remote.adjusted.n)} вакансиям).` : ''}</p>
</section>

${renderRegionalComparisonSection(jobs.regionalComparison, jobs.regionalMatrix, jobs.byCity, roleHref, 'ru')}

<section class="rs-section">
  <h2>Распределение зарплат</h2>
  ${histogram(jobs.histogram)}
</section>

${renderEconometricsSection(jobs.econometrics, 'ru')}

${renderScientificSection(jobs.scientific, 'ru')}

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

${renderCrossMarketSection(jobs.crossMarket, (slug) => (jobs.roles.some((r) => r.slug === slug) ? `/research/roles/${slug}` : undefined), 'ru')}
${renderIntlResearchSection(report, (slug) => (jobs.roles.some((r) => r.slug === slug) ? `/research/roles/${slug}` : undefined), 'ru')}

<section class="rs-section">
  <h2>Откуда данные</h2>
  ${countBars(totals.platforms.slice(0, 12).map((p) => ({ label: p.key, n: p.n })))}
  ${totals.payOrigins && Object.keys(totals.payOrigins).length ? `<p class="small">Откуда взята оплата: ${Object.entries(totals.payOrigins).map(([origin, n]) => `${escapeHtml(ORIGIN_LABELS.ru[origin] ?? origin)} — ${num(n)}`).join(', ')}.${totals.excluded ? ` Модель отсеяла ${num(totals.excluded)} рекламных и нерелевантных публикаций.` : ''}</p>` : ''}
  ${jobs.byPlatform?.length ? `<h3>Медиана зависит от площадки</h3><p class="small">На площадках разные вакансии, поэтому общая медиана меняется вместе с составом источников.</p>${rangeChart(sliceRows(jobs.byPlatform))}` : ''}
  ${jobs.bounds ? `<p class="small">Как указана сумма: вилка — ${num(jobs.bounds.range)}, только «от» — ${num(jobs.bounds.from)}, только «до» — ${num(jobs.bounds.to)}, одна сумма — ${num(jobs.bounds.single)}.${jobs.bounds.rangeMedian ? ` Медиана только по вилкам — ${formatRub(jobs.bounds.rangeMedian)}.` : ''}${totals.foreignPayJobs ? ` Ещё ${num(totals.foreignPayJobs)} русскоязычных вакансий платят в долларах или евро и в рублёвую медиану не входят.` : ''}</p>` : ''}
</section>

<section class="rs-section prose" style="margin-top:36px">
  <h2>Как ссылаться</h2>
  <p>Данные openradar открыты по лицензии ${LICENSE}: их можно использовать в публикациях и исследованиях со ссылкой на источник.</p>
  <p class="rs-cite"><code>${escapeHtml(citeLine(report, baseUrl))}</code> ${quoteButton(citeLine(report, baseUrl))}</p>
  ${renderAcademicCitations(report, baseUrl, 'ru')}
  <ul>
    <li><a href="/research/methodology">Методика</a>: откуда публикации, как считается зарплата, что не входит в выборку.</li>
    <li><a href="/research/dataset.csv">Данные по вакансиям и заказам (CSV)</a> — без текстов и контактов.</li>
    <li><a href="${isLive ? '/research/report.json' : `/research/${escapeHtml(report.period.slug ?? '')}.json`}">Этот отчёт в JSON</a>.</li>
    <li>Нужен срез под вашу тему — <a href="${REPO_URL}/issues" target="_blank" rel="noopener">напишите на GitHub</a>.</li>
  </ul>
  ${snapshots.length ? `<h2>Отчёты по месяцам</h2><div class="chip-links">${snapshots.map((s) => `<a href="/research/${escapeHtml(s.period)}">${escapeHtml(monthLabel(s.period))}</a>`).join('')}</div>` : '<p class="muted small">Первый месячный отчёт будет зафиксирован в начале следующего месяца.</p>'}
  ${jobs.roles.length ? `<h2>По направлениям</h2><div class="chip-links">${jobs.roles.map((r) => `<a href="/research/roles/${escapeHtml(r.slug)}">${escapeHtml(r.label)}</a>`).join('')}</div>` : ''}
</section>

${renderEmbedDialog('ru')}`;

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
    body: body + renderResearchEnhancements('ru'),
    script: QUOTE_SCRIPT,
    head: `${RESEARCH_ENHANCE_HEAD}<meta name="description" content="${escapeHtml(description)}">
<meta property="og:description" content="${escapeHtml(description)}">
${scholarMetaTags({ title, baseUrl, path: reportUrl(report), dateIso: report.generatedAt, lang: 'ru' })}
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


export function renderCrossMarketSection(
  crossMarket: CrossMarketComparison | undefined,
  roleHref: (slug: string) => string | undefined,
  lang: SupportedLang = "ru",
): string {
  if (!crossMarket || (!crossMarket.byGrade.length && !crossMarket.byRole.length)) return "";
  const en = lang === "en";
  const fmtRub = (v: number): string => (en ? `₽${new Intl.NumberFormat("en-US").format(v)}` : formatRub(v));
  const fmtUsdYr = (v: number): string => `$${num(v)}${en ? "/yr" : " / год"}`;
  const gradeLabelEn: Record<string, string> = {
    intern: "Intern",
    junior: "Junior",
    middle: "Middle",
    senior: "Senior",
    lead: "Lead / Staff",
  };
  const metricLabelEn: Record<string, { label: string; interpretation: string }> = {
    gini: {
      label: "Gini wage inequality index (G)",
      interpretation: "Cross-border dispersion across US, EU, and CEE vs unified national IT market in Russia",
    },
    theil: {
      label: "Theil entropy index T = GE(1)",
      interpretation: "Upper-tail concentration driven by US Staff/Principal and global remote packages",
    },
    decile_ratio: {
      label: "Decile dispersion ratio (P90 / P10)",
      interpretation: "Pay ratio between the top 10% and bottom 10% of IT vacancies",
    },
    anova_grade: {
      label: "Variance explained by Seniority Grade (ANOVA η²)",
      interpretation: "In Russia seniority grade explains ~52% of variance; globally geography competes with seniority",
    },
    hhi: {
      label: "Employer concentration index (HHI)",
      interpretation: "Both markets are highly competitive (HHI < 150), with global demand distributed across more employers",
    },
  };

  return `<section class="rs-section" id="cross-market-comparison">
  <h2>${en ? "Cross-market econometric comparison: Russian IT vs Global IT (nominal & PPP)" : "Межстрановое эконометрическое сравнение: IT-рынок РФ против глобального рынка (номинал и ППС)"}</h2>
  <p class="muted small">${en
    ? `Comparative analysis of annualised IT compensation in Russia (converted from monthly RUB at ${crossMarket.usdRate} RUB/USD) against the international English-language market ($/year). Because non-tradable services and housing costs differ substantially across countries, we report both nominal USD exchange-rate comparisons and Purchasing Power Parity (PPP) real consumption equivalents using the IMF / World Bank ICP conversion factor (${crossMarket.pppFactor}×).`
    : `Сопоставление годовых IT-зарплат в России (пересчёт из месячных рублёвых медиан по курсу ${crossMarket.usdRate} ₽/$) с глобальным англоязычным рынком ($/год). Поскольку стоимость жизни, жилья и неторгуемых услуг кратно различается между странами, расчёт приводится в двух стандартах: по номинальному биржевому курсу USD и по паритету покупательной способности (ППС / PPP, коэффициент Всемирного банка и МВФ ${crossMarket.pppFactor}×).`}</p>
  ${crossMarket.byGrade.length ? `<h3 style="margin-top:16px">${en ? "1. Compensation parity across seniority grades (Nominal USD vs Real PPP)" : "1. Паритет вознаграждения по грейдам (номинальный курс USD и реальный ППС)"}</h3>
  <div style="overflow-x:auto">
    <table class="table">
      <thead>
        <tr>
          <th>${en ? "Seniority grade" : "Грейд"}</th>
          <th>${en ? "Russia IT (RUB/mo)" : "РФ IT (₽ / мес)"}</th>
          <th>${en ? "Russia Nominal ($/yr)" : "РФ номинал ($ / год)"}</th>
          <th>${en ? "Russia Real PPP ($/yr)" : "РФ по ППС ($ / год PPP)"}</th>
          <th>${en ? "Global IT ($/yr)" : "Глобальный рынок ($ / год)"}</th>
          <th>${en ? "Nominal gap (Global / RU)" : "Номинальный разрыв"}</th>
          <th>${en ? "Real PPP parity (RU / Global)" : "Реальный паритет по ППС"}</th>
        </tr>
      </thead>
      <tbody>
        ${crossMarket.byGrade
          .map((g) => {
            const label = en ? (gradeLabelEn[g.grade] ?? g.label) : g.label;
            const parityColor = g.pppParityPct >= 95 ? "var(--emerald)" : g.pppParityPct >= 75 ? "var(--ink)" : "var(--muted)";
            return `<tr>
              <td><b>${escapeHtml(label)}</b></td>
              <td><b>${escapeHtml(fmtRub(g.ruMedianRubMo))}</b></td>
              <td>${escapeHtml(fmtUsdYr(g.ruMedianUsdYr))}</td>
              <td><b>${escapeHtml(fmtUsdYr(g.ruPppUsdYr))}</b></td>
              <td><b>${escapeHtml(fmtUsdYr(g.intlMedianUsdYr))}</b></td>
              <td><code>${g.nominalGapRatio}×</code></td>
              <td><b style="color:${parityColor}">${g.pppParityPct}%</b></td>
            </tr>`;
          })
          .join("")}
      </tbody>
    </table>
  </div>` : ""}
  ${crossMarket.byRole.length ? `<h3 style="margin-top:18px">${en ? "2. Compensation parity by specialization (Russia vs Global IT)" : "2. Межстрановое сравнение по специализациям (РФ против глобального рынка)"}</h3>
  <div style="overflow-x:auto">
    <table class="table">
      <thead>
        <tr>
          <th>${en ? "Specialization" : "Направление"}</th>
          <th>${en ? "Russia (RUB/mo)" : "РФ (₽ / мес)"}</th>
          <th>${en ? "Russia Nominal ($/yr)" : "РФ номинал ($ / год)"}</th>
          <th>${en ? "Russia PPP ($/yr)" : "РФ по ППС ($ / год)"}</th>
          <th>${en ? "Global ($/yr)" : "Мир ($ / год)"}</th>
          <th>${en ? "Nominal gap" : "Разрыв (ном.)"}</th>
          <th>${en ? "Real PPP parity" : "Паритет ППС"}</th>
        </tr>
      </thead>
      <tbody>
        ${crossMarket.byRole
          .slice(0, 12)
          .map((r) => {
            const href = roleHref(r.slug);
            const name = escapeHtml(roleLabel(r.slug, lang));
            const link = href ? `<a href="${escapeHtml(href)}">${name}</a>` : name;
            return `<tr>
              <td><b>${link}</b></td>
              <td>${escapeHtml(fmtRub(r.ruMedianRubMo))}</td>
              <td>${escapeHtml(fmtUsdYr(r.ruMedianUsdYr))}</td>
              <td><b>${escapeHtml(fmtUsdYr(r.ruPppUsdYr))}</b></td>
              <td><b>${escapeHtml(fmtUsdYr(r.intlMedianUsdYr))}</b></td>
              <td><code>${r.nominalGapRatio}×</code></td>
              <td><b>${r.pppParityPct}%</b></td>
            </tr>`;
          })
          .join("")}
      </tbody>
    </table>
  </div>` : ""}
  ${crossMarket.structuralMetrics.length ? `<h3 style="margin-top:18px">${en ? "3. Institutional & inequality structure: Russia vs Global market" : "3. Сравнение институциональной структуры и неравенства: РФ против глобального рынка"}</h3>
  <div style="overflow-x:auto">
    <table class="table">
      <thead>
        <tr>
          <th>${en ? "Econometric indicator" : "Эконометрический показатель"}</th>
          <th>${en ? "Russia IT" : "Рынок РФ (IT)"}</th>
          <th>${en ? "Global / International IT" : "Глобальный рынок (IT)"}</th>
          <th>${en ? "Structural interpretation" : "Аналитическая интерпретация"}</th>
        </tr>
      </thead>
      <tbody>
        ${crossMarket.structuralMetrics
          .map((m) => {
            const tr = en ? metricLabelEn[m.key] : undefined;
            return `<tr>
              <td><b>${escapeHtml(tr?.label ?? m.label)}</b></td>
              <td><b>${escapeHtml(m.ruValue)}</b></td>
              <td><b>${escapeHtml(m.intlValue)}</b></td>
              <td class="small muted">${escapeHtml(tr?.interpretation ?? m.interpretation)}</td>
            </tr>`;
          })
          .join("")}
      </tbody>
    </table>
  </div>` : ""}
</section>`;
}

export function renderIntlResearchSection(
  report: Report,
  roleHref: (slug: string) => string | undefined,
  lang: SupportedLang = "ru",
): string {
  const { jobs, gigs, totals } = report;
  const intlMedian = jobs.intl.median;
  if (!intlMedian) return "";
  const en = lang === "en";
  const usd = report.fx?.USD;
  const ir = jobs.intlResearch;
  const fmtUsdYr = (v: number): string => `$${num(v)}${en ? "/yr" : " / год"}`;
  const fmtUsdShort = (v: number): string => `$${num(v)}`;
  const signPct = (v: number): string => `${v > 0 ? "+" : v < 0 ? (en ? "-" : "−") : ""}${Math.abs(v)}%`;

  const gmRows = (ir?.gradeMatrix ?? []).filter(
    (r) => r.median !== undefined && (r.junior !== undefined || r.middle !== undefined || r.senior !== undefined || r.lead !== undefined),
  );
  const gmVals = gmRows.flatMap((r) => [r.junior, r.middle, r.senior, r.lead, r.median].filter((v): v is number => v !== undefined));
  const gmMin = gmVals.length ? Math.min(...gmVals) : 20_000;
  const gmMax = gmVals.length ? Math.max(...gmVals) : 200_000;
  const gmCell = (v: number | undefined): string =>
    v !== undefined ? `<td${heatmapStyle(v, gmMin, gmMax)}>${escapeHtml(fmtUsdShort(v))}</td>` : `<td class="muted">—</td>`;

  const lmRows = (ir?.languageMatrix ?? []).filter(
    (r) => r.median !== undefined && (r.junior !== undefined || r.middle !== undefined || r.senior !== undefined || r.lead !== undefined),
  );
  const lmVals = lmRows.flatMap((r) => [r.junior, r.middle, r.senior, r.lead, r.median].filter((v): v is number => v !== undefined));
  const lmMin = lmVals.length ? Math.min(...lmVals) : 25_000;
  const lmMax = lmVals.length ? Math.max(...lmVals) : 200_000;
  const lmCell = (v: number | undefined): string =>
    v !== undefined ? `<td${heatmapStyle(v, lmMin, lmMax)}>${escapeHtml(fmtUsdShort(v))}</td>` : `<td class="muted">—</td>`;

  const macroLabelEn: Record<string, string> = {
    north_america: "North America (US & Canada, USD)",
    western_europe: "Western Europe & UK (EUR / GBP / CHF)",
    cee_poland: "Central & Eastern Europe (PLN / CEE hubs)",
    global_remote: "Global Remote / Worldwide",
  };

  const econ = ir?.econometrics;
  const sci = ir?.scientific;

  const mincerLabelEn: Record<string, string> = {
    intercept: "Intercept β₀ (Junior/Intern, CEE/regional baseline, $/yr)",
    middle: "Seniority: Middle (vs Junior/Intern)",
    senior: "Seniority: Senior (vs Junior/Intern)",
    lead: "Seniority: Lead / Staff (vs Junior/Intern)",
    moscow: "Location: North America / US-tier pay (vs baseline)",
    spb: "Location: Western Europe / UK / CH (vs baseline)",
    remote: "Work mode: Global Remote (vs on-site baseline)",
    ai: "Skill requirement: AI / LLM mentioned",
  };
  const mincerLabelRu: Record<string, string> = {
    intercept: "Константа β₀ (Junior/Intern, базовый хаб ЦВЕ, $/год)",
    middle: "Грейд: Middle (к Junior/Intern)",
    senior: "Грейд: Senior (к Junior/Intern)",
    lead: "Грейд: Lead / Staff (к Junior/Intern)",
    moscow: "Макрорегион: Северная Америка / США (к базе)",
    spb: "Макрорегион: Западная Европа / Британия / Швейцария (к базе)",
    remote: "Формат: Глобальная удалёнка / Worldwide Remote (к базе)",
    ai: "Навык: требование AI / LLM в вакансии",
  };
  const anovaLabelEn: Record<string, string> = {
    grade: "Seniority grade (Intern → Lead)",
    geo: "Macro-region (North America, W. Europe, CEE, Global Remote)",
    role: "Professional specialization (role)",
    language: "Primary programming language / stack",
  };
  const anovaLabelRu: Record<string, string> = {
    grade: "Квалификационный грейд (Intern → Lead)",
    geo: "Макрорегион (Сев. Америка, Зап. Европа, ЦВЕ, Global Remote)",
    role: "Профессиональная специализация (роль)",
    language: "Основной язык программирования / стек",
  };

  const hubRows: BarRow[] = (ir?.byHub ?? []).slice(0, 14).map((s) => ({
    label: en ? (translateCity(s.label, "en") ?? s.label) : s.label,
    n: s.n,
    pay: s.pay,
  }));

  const intlRoleRows: BarRow[] = (jobs.intlByRole ?? []).map((s) => ({
    label: en ? roleLabel(s.key, "en") : s.label,
    href: roleHref(s.key),
    n: s.n,
    pay: {
      n: s.pay.n,
      median: s.pay.median ? rubMonthToUsdYear(s.pay.median, usd) : undefined,
      p25: s.pay.p25 ? rubMonthToUsdYear(s.pay.p25, usd) : undefined,
      p75: s.pay.p75 ? rubMonthToUsdYear(s.pay.p75, usd) : undefined,
      ciLow: s.pay.ciLow ? rubMonthToUsdYear(s.pay.ciLow, usd) : undefined,
      ciHigh: s.pay.ciHigh ? rubMonthToUsdYear(s.pay.ciHigh, usd) : undefined,
    },
  }));

  const intlGradeLabelEn: Record<string, string> = { intern: "Intern", junior: "Junior", middle: "Middle", senior: "Senior", lead: "Lead" };
  const intlGradeRows: BarRow[] = (jobs.intlByGrade ?? []).map((s) => ({
    label: en ? (intlGradeLabelEn[s.key] ?? s.label) : s.label,
    n: s.n,
    pay: {
      n: s.pay.n,
      median: s.pay.median ? rubMonthToUsdYear(s.pay.median, usd) : undefined,
      p25: s.pay.p25 ? rubMonthToUsdYear(s.pay.p25, usd) : undefined,
      p75: s.pay.p75 ? rubMonthToUsdYear(s.pay.p75, usd) : undefined,
      ciLow: s.pay.ciLow ? rubMonthToUsdYear(s.pay.ciLow, usd) : undefined,
      ciHigh: s.pay.ciHigh ? rubMonthToUsdYear(s.pay.ciHigh, usd) : undefined,
    },
  }));

  const intlGigRows: BarRow[] = (gigs.intlByCategory ?? []).map((s) => ({
    label: en ? roleLabel(s.key, "en") : s.label,
    n: s.n,
    pay: s.pay,
  }));

  const naRow = ir?.macroRegions?.find((m) => m.key === "north_america");
  const naMedian = naRow?.pay.median;

  return `<section class="rs-section" id="international">
  <h2>${en ? "International & Global IT Labour Market: Econometric Study ($/year)" : "Глобальный и международный рынок IT: полноценное эконометрическое исследование ($/год)"}</h2>
  <p class="small">${en
    ? `Empirical analysis of <b>${num(totals.intlJobs ?? 0)}</b> English-language international vacancies collected from global remote boards and company ATS career portals (Greenhouse, Lever, Ashby, Workable, European & North American tech hubs). Compensation is stated in <b>${ir ? `${ir.payShare}%` : formatShare(Math.round((jobs.intl.n / Math.max(1, totals.intlJobs ?? 1)) * 100))}</b> of listings (n = <b>${num(jobs.intl.n)}</b> paid vacancies); global median annual pay is <b>$${num(rubMonthToUsdYear(intlMedian, usd))}/yr</b>${jobs.intl.p25 && jobs.intl.p75 ? ` (interquartile range $${num(rubMonthToUsdYear(jobs.intl.p25, usd))}–$${num(rubMonthToUsdYear(jobs.intl.p75, usd))}/yr)` : ""}. Remote-eligible positions account for <b>${ir ? `${ir.remoteShare}%` : "—"}</b> of global demand. Daily dynamics are tracked in the <a href="/en/research/index#global-index">openradar international index</a>.`
    : `Эмпирическое исследование <b>${num(totals.intlJobs ?? 0)}</b> англоязычных вакансий на зарубежных job-бордах и в ATS-системах прямых нанимателей (Greenhouse, Lever, Ashby, технологические хабы США, Великобритании, Западной и Центральной Европы). Зарплатная вилка раскрыта в <b>${ir ? formatShare(ir.payShare) : "—"}</b> публикаций (выборка с оплатой n = <b>${num(jobs.intl.n)}</b>); годовая медиана составляет <b>$${num(rubMonthToUsdYear(intlMedian, usd))} в год</b>${jobs.intl.p25 && jobs.intl.p75 ? ` (межквартильный коридор $${num(rubMonthToUsdYear(jobs.intl.p25, usd))}–$${num(rubMonthToUsdYear(jobs.intl.p75, usd))} в год)` : ""}. Удалённый формат допускают <b>${ir ? formatShare(ir.remoteShare) : "—"}</b> международных вакансий. Ежедневная динамика потока отслеживается в <a href="/research/index#global-index">международном индексе openradar</a>.`}</p>

  ${intlRoleRows.length ? `<h3 style="margin-top:16px">${en ? "Global annual pay by specialization ($/year)" : "Годовые зарплаты на международном рынке по направлениям ($/год)"}</h3>
  ${rangeChart(intlRoleRows, { unit: fmtUsdYr, lang })}` : ""}

  ${intlGradeRows.length ? `<h3 style="margin-top:16px">${en ? "Global annual pay by seniority grade ($/year)" : "Годовые зарплаты на глобальном рынке по грейдам ($/год)"}</h3>
  ${rangeChart(intlGradeRows, { unit: fmtUsdYr, lang })}` : ""}

  ${gmRows.length ? `<h3 style="margin-top:20px" id="intl-heatmap-role-grade">${en ? "Global salary heatmap: specialization × seniority ($/year)" : "Тепловая карта глобального рынка: направление × грейд ($/год)"}</h3>
  <p class="muted small">${en
    ? "Median annual compensation ($/year) across global roles and seniority grades, Senior/Junior progression multiplier, and within-role quartile dispersion (QCD)."
    : "Медианная годовая зарплата ($/год) на пересечении специализации и грейда на международном рынке, мультипликатор карьерного роста Senior/Junior и внутриролевая дисперсия (QCD)."}</p>
  <div style="overflow-x:auto">
    <table class="table">
      <thead>
        <tr>
          <th>${en ? "Role" : "Направление"}</th>
          <th>${en ? "Median ($/yr)" : "Медиана ($/год)"}</th>
          <th>Junior</th>
          <th>Middle</th>
          <th>Senior</th>
          <th>Lead</th>
          <th>Senior / Jr</th>
          <th>QCD</th>
          <th>${en ? "Remote" : "Удалёнка"}</th>
          <th>${en ? "Pay stated" : "С вилкой"}</th>
        </tr>
      </thead>
      <tbody>
        ${gmRows
          .slice(0, 16)
          .map((r) => {
            const href = roleHref(r.slug);
            const name = escapeHtml(roleLabel(r.slug, lang));
            const link = href ? `<a href="${escapeHtml(href)}">${name}</a>` : name;
            const ratio = r.seniorToJuniorRatio ? `${String(r.seniorToJuniorRatio).replace(".", en ? "." : ",")}×` : "—";
            const qcd = r.qcdPct !== undefined ? (en ? `${r.qcdPct}%` : formatShare(r.qcdPct)) : "—";
            return `<tr>
              <td><b>${link}</b> <span class="muted small">(${num(r.withPay)})</span></td>
              <td${heatmapStyle(r.median, gmMin, gmMax)}><b>${r.median !== undefined ? escapeHtml(fmtUsdShort(r.median)) : "—"}</b></td>
              ${gmCell(r.junior)}
              ${gmCell(r.middle)}
              ${gmCell(r.senior)}
              ${gmCell(r.lead)}
              <td><b>${ratio}</b></td>
              <td>${qcd}</td>
              <td>${en ? `${r.remoteShare}%` : formatShare(r.remoteShare)}</td>
              <td>${en ? `${r.payShare}%` : formatShare(r.payShare)}</td>
            </tr>`;
          })
          .join("")}
      </tbody>
    </table>
  </div>` : ""}

  ${lmRows.length ? `<h3 style="margin-top:20px" id="intl-heatmap-language-grade">${en ? "Global stack heatmap: programming language × seniority ($/year)" : "Тепловая карта глобального стека: язык программирования × грейд ($/год)"}</h3>
  <div style="overflow-x:auto">
    <table class="table">
      <thead>
        <tr>
          <th>${en ? "Language" : "Язык"}</th>
          <th>${en ? "Median ($/yr)" : "Медиана ($/год)"}</th>
          <th>Junior</th>
          <th>Middle</th>
          <th>Senior</th>
          <th>Lead</th>
          <th>Senior / Jr</th>
          <th>QCD</th>
        </tr>
      </thead>
      <tbody>
        ${lmRows
          .map((r) => {
            const ratio = r.seniorToJuniorRatio ? `${String(r.seniorToJuniorRatio).replace(".", en ? "." : ",")}×` : "—";
            const qcd = r.qcdPct !== undefined ? (en ? `${r.qcdPct}%` : formatShare(r.qcdPct)) : "—";
            return `<tr>
              <td><b>${escapeHtml(r.language)}</b> <span class="muted small">(${num(r.withPay)})</span></td>
              <td${heatmapStyle(r.median, lmMin, lmMax)}><b>${r.median !== undefined ? escapeHtml(fmtUsdShort(r.median)) : "—"}</b></td>
              ${lmCell(r.junior)}
              ${lmCell(r.middle)}
              ${lmCell(r.senior)}
              ${lmCell(r.lead)}
              <td><b>${ratio}</b></td>
              <td>${qcd}</td>
            </tr>`;
          })
          .join("")}
      </tbody>
    </table>
  </div>` : ""}

  ${ir?.macroRegions?.length ? `<h3 style="margin-top:20px" id="intl-macro-regions">${en ? "Global macro-regions & Cochran–Mantel–Haenszel adjusted pay gaps ($/year)" : "Макрорегионы глобального рынка и стратифицированные разрывы CMH ($/год)"}</h3>
  <p class="muted small">${en
    ? "Comparison across four international macro-segments: North America (US/Canada USD), Western Europe & UK (EUR/GBP/CHF), Central & Eastern Europe (Poland/CEE hubs), and Global Remote. Adjusted gap controls for role and seniority composition relative to North America."
    : "Декомпозиция международного рынка на четыре макрорегиона: Северная Америка (США и Канада), Западная Европа и Великобритания (EUR/GBP/CHF), Центральная и Восточная Европа (хабы Польши и ЦВЕ) и глобальная удалёнка (Worldwide Remote). Поправка Кохрана — Мантеля — Хензеля (CMH) показывает разницу к Северной Америке при одинаковой роли и грейде."}</p>
  <div style="overflow-x:auto">
    <table class="table">
      <thead>
        <tr>
          <th>${en ? "International macro-region" : "Макрорегион"}</th>
          <th>${en ? "Vacancies" : "Вакансий"}</th>
          <th>${en ? "Pay stated" : "С вилкой"}</th>
          <th>${en ? "Median ($/yr)" : "Медиана ($/год)"}</th>
          <th>${en ? "Middle half (P25–P75)" : "Коридор P25–P75"}</th>
          <th>${en ? "Parity vs North America" : "Паритет к Сев. Америке"}</th>
          <th>${en ? "Adjusted gap vs NA (CMH)" : "При той же роли и грейде к США"}</th>
          <th>QCD</th>
        </tr>
      </thead>
      <tbody>
        ${ir.macroRegions
          .map((m) => {
            const label = en ? (macroLabelEn[m.key] ?? m.label) : m.label;
            const iqr = m.pay.p25 && m.pay.p75 ? `${fmtUsdShort(m.pay.p25)}–${fmtUsdShort(m.pay.p75)}` : "—";
            const parityPct = naMedian && m.pay.median ? Math.round((m.pay.median / naMedian) * 100) : undefined;
            const adj =
              m.key === "north_america"
                ? en ? "100% (reference)" : "эталон (база)"
                : m.adjustedVsNa
                  ? `<b>${signPct(m.adjustedVsNa.pct)}</b> <span class="muted small">(n=${num(m.adjustedVsNa.n)})</span>`
                  : "—";
            return `<tr>
              <td><b>${escapeHtml(label)}</b></td>
              <td>${num(m.n)} <span class="muted small">(${en ? `${m.sharePct}%` : formatShare(m.sharePct)})</span></td>
              <td>${en ? `${m.payShare}%` : formatShare(m.payShare)} <span class="muted small">(${num(m.withPay)})</span></td>
              <td><b>${m.pay.median !== undefined ? escapeHtml(fmtUsdYr(m.pay.median)) : "—"}</b></td>
              <td class="small">${escapeHtml(iqr)}</td>
              <td><b>${parityPct !== undefined ? `${parityPct}%` : "—"}</b></td>
              <td>${adj}</td>
              <td>${m.qcdPct !== undefined ? (en ? `${m.qcdPct}%` : formatShare(m.qcdPct)) : "—"}</td>
            </tr>`;
          })
          .join("")}
      </tbody>
    </table>
  </div>` : ""}

  ${hubRows.length ? `<h3 style="margin-top:18px">${en ? "Major international tech hubs ($/year)" : "Крупнейшие зарубежные тех-хабы и города ($/год)"}</h3>
  <p class="muted small">${en
    ? "Top global cities and regional hubs by vacancy volume, with annual median and interquartile salary range ($/year)."
    : "Ведущие мировые города и технологические хабы по числу вакансий с медианной годовой зарплатой и межквартильным коридором ($/год)."}</p>
  ${rangeChart(hubRows, { unit: fmtUsdYr, lang })}` : ""}

  ${econ && econ.all.n >= 20 ? `<h3 style="margin-top:20px" id="intl-econometrics">${en ? "Global distributional econometrics & inequality profile ($/year)" : "Эконометрический профиль распределения и неравенства на глобальном рынке ($/год)"}</h3>
  <div style="overflow-x:auto">
    <table class="table">
      <thead>
        <tr>
          <th>${en ? "Distributional metric" : "Статистическая метрика"}</th>
          <th>${en ? "Global Market (all)" : "Все международные вакансии"}</th>
          <th>${en ? "Global IT Core" : "Глобальный IT-сегмент"}</th>
          <th>${en ? "Econometric meaning" : "Эконометрический смысл"}</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><b>${en ? "Sample with stated pay (n)" : "Выборка с вилкой (n)"}</b></td>
          <td><b>${num(econ.all.n)}</b></td>
          <td><b>${num(econ.it.n)}</b></td>
          <td class="small muted">${en ? "Verified international postings with annualised USD pay" : "Международные публикации с валидированной годовой оплатой в USD"}</td>
        </tr>
        <tr>
          <td><b>${en ? "Decile ladder P10 / P25 / P50 / P75 / P90" : "Децильная лестница P10 / P25 / P50 / P75 / P90"}</b></td>
          <td class="small">${[econ.all.p10, econ.all.p25, econ.all.p50, econ.all.p75, econ.all.p90].map((v) => (v ? fmtUsdShort(v) : "—")).join(" · ")}</td>
          <td class="small"><b>${[econ.it.p10, econ.it.p25, econ.it.p50, econ.it.p75, econ.it.p90].map((v) => (v ? fmtUsdShort(v) : "—")).join(" · ")}</b></td>
          <td class="small muted">${en ? "Full non-parametric quantile profile ($/year)" : "Полный квантильный профиль годовых зарплат ($/год)"}</td>
        </tr>
        <tr>
          <td><b>${en ? "Trimmed mean (5%) & right-tail premium" : "Усечённое среднее (5%) и премия правого хвоста"}</b></td>
          <td>${econ.all.trimmedMean ? fmtUsdYr(econ.all.trimmedMean) : "—"} ${econ.all.meanToMedianPct !== undefined ? `(+${econ.all.meanToMedianPct}%)` : ""}</td>
          <td><b>${econ.it.trimmedMean ? fmtUsdYr(econ.it.trimmedMean) : "—"}</b> ${econ.it.meanToMedianPct !== undefined ? `(+${econ.it.meanToMedianPct}%)` : ""}</td>
          <td class="small muted">${en ? "Exceedance of mean over median due to US Staff/Principal packages" : "Превышение среднего над медианой за счёт высоких офферов США и Staff/Lead ролей"}</td>
        </tr>
        <tr>
          <td><b>${en ? "Gini index (G) & Theil entropy T = GE(1)" : "Индекс Джини (G) и индекс энтропии Тейла T = GE(1)"}</b></td>
          <td><b>G = ${econ.all.gini?.toFixed(3) ?? "—"}</b> · T = ${econ.all.theil?.toFixed(3) ?? "—"}</td>
          <td><b>G = ${econ.it.gini?.toFixed(3) ?? "—"} · T = ${econ.it.theil?.toFixed(3) ?? "—"}</b></td>
          <td class="small muted">${en ? "Cross-border dispersion across CEE, Western Europe, and US pay bands" : "Межстрановое неравенство между вилками Восточной Европы, ЕС и США"}</td>
        </tr>
        <tr>
          <td><b>${en ? "Decile ratio (P90/P10) & Quartile ratio (P75/P25)" : "Децильный (P90/P10) и квартильный (P75/P25) коэффициенты"}</b></td>
          <td>${econ.all.decileRatio ?? "—"}× / ${econ.all.quartileRatio ?? "—"}× (QCD ${econ.all.qcdPct ?? "—"}%)</td>
          <td><b>${econ.it.decileRatio ?? "—"}× / ${econ.it.quartileRatio ?? "—"}×</b> (QCD ${econ.it.qcdPct ?? "—"}%)</td>
          <td class="small muted">${en ? "Ratio between top-decile US/Remote roles and entry-level international roles" : "Соотношение верхнего дециля (США / Senior Remote) к стартовым позициям"}</td>
        </tr>
        <tr>
          <td><b>${en ? "Employer concentration (HHI / CR5 / CR10)" : "Концентрация нанимателей (HHI / CR5 / CR10)"}</b></td>
          <td colspan="2"><b>HHI = ${num(econ.employerConcentration.hhi)}</b> · CR₅ = ${econ.employerConcentration.cr5Pct}% · CR₁₀ = ${econ.employerConcentration.cr10Pct}% <span class="muted small">(${num(econ.employerConcentration.totalEmployers)} ${en ? "employers" : "нанимателей"})</span></td>
          <td class="small muted">${en ? "Fragmented global demand across thousands of companies" : "Низкая концентрация: спрос распределён между тысячами глобальных нанимателей"}</td>
        </tr>${econ.ipwCorrectedIt ? `
        <tr>
          <td><b>${en ? "IPW selection-corrected global IT median" : "IPW-медиана глобального IT с поправкой Хорвица — Томпсона"}</b></td>
          <td>${fmtUsdYr(econ.ipwCorrectedIt.rawMedian)} <span class="muted small">(${en ? "observed" : "наблюдаемая"})</span></td>
          <td><b>${fmtUsdYr(econ.ipwCorrectedIt.ipwMedian)}</b> <span class="muted small">(${econ.ipwCorrectedIt.biasPct >= 0 ? "+" : ""}${econ.ipwCorrectedIt.biasPct}%)</span></td>
          <td class="small muted">${en ? `Inverse disclosure probability weighted across N = ${num(econ.ipwCorrectedIt.n)} graded global IT vacancies` : `Взвешивание по обратной вероятности раскрытия вилки 1 / P(Disclosed | Grade), N = ${num(econ.ipwCorrectedIt.n)}`}</td>
        </tr>` : ""}
      </tbody>
    </table>
  </div>` : ""}

  ${sci?.mincer ? `<h3 style="margin-top:20px" id="intl-mincer">${en ? "Global Mincerian log-wage OLS regression (ln USD/year, White HC1 robust SEs)" : "Глобальное уравнение Минсера (МНК для ln USD/год с робастными ошибками Уайта HC1)"}</h3>
  <p class="muted small">${en
    ? `Estimated across N = ${num(sci.mincer.n)} graded international IT vacancies (R² = ${sci.mincer.r2.toFixed(3)}, F = ${sci.mincer.fStat}${sci.mincer.fPValue ? `, p ${escapeHtml(pText(sci.mincer.fPValue))}` : ""}). Baseline β₀ represents a Junior/Intern engineer in Central/Eastern Europe without AI skill requirements.`
    : `Оценка по N = ${num(sci.mincer.n)} международным IT-вакансиям с указанным грейдом (R² = ${sci.mincer.r2.toFixed(3)}, F = ${sci.mincer.fStat}${sci.mincer.fPValue ? `, p ${escapeHtml(pText(sci.mincer.fPValue))}` : ""}). Базовая категория (β₀) — специалист уровня Junior/Intern в хабе ЦВЕ без требований AI.`}</p>
  <div style="overflow-x:auto">
    <table class="table">
      <thead>
        <tr>
          <th>${en ? "Variable (global model)" : "Переменная (глобальная модель)"}</th>
          <th>${en ? "Coeff. β (log)" : "Коэффициент β"}</th>
          <th>${en ? "Robust SE (HC1)" : "Робастная SE (HC1)"}</th>
          <th>t-stat</th>
          <th>p-value</th>
          <th>${en ? "Pure effect Δ% (ceteris paribus)" : "Чистый вклад Δ% (ceteris paribus)"}</th>
        </tr>
      </thead>
      <tbody>
        ${sci.mincer.coefficients
          .map((c) => {
            const label = en ? (mincerLabelEn[c.key] ?? c.label) : (mincerLabelRu[c.key] ?? c.label);
            const eff =
              c.key === "intercept" && c.baselineRub
                ? `<b>${escapeHtml(fmtUsdYr(c.baselineRub))}</b> <span class="muted small">(${en ? "base" : "база"})</span>`
                : c.effectPct !== undefined
                  ? `<b style="color:${c.effectPct > 0 ? "var(--emerald)" : "inherit"}">${c.effectPct > 0 ? "+" : ""}${c.effectPct}%</b>`
                  : "—";
            return `<tr>
              <td><b>${escapeHtml(label)}</b></td>
              <td><code>${c.beta > 0 && c.key !== "intercept" ? "+" : ""}${c.beta.toFixed(3)}${c.stars}</code></td>
              <td><code>${c.se.toFixed(3)}</code></td>
              <td><code>${c.tStat.toFixed(2)}</code></td>
              <td><b>${escapeHtml(c.pValue)}</b></td>
              <td>${eff}</td>
            </tr>`;
          })
          .join("")}
      </tbody>
    </table>
  </div>` : ""}

  ${sci?.varianceDecomposition?.length ? `<h3 style="margin-top:18px">${en ? "Global ANOVA log-wage variance decomposition (η²)" : "Глобальная декомпозиция дисперсии логарифма зарплат (ANOVA η²)"}</h3>
  <div style="overflow-x:auto">
    <table class="table">
      <thead>
        <tr>
          <th>${en ? "Global institutional factor" : "Институциональный фактор (глобальный рынок)"}</th>
          <th>${en ? "Sample (N)" : "Выборка (N)"}</th>
          <th>${en ? "Groups (G)" : "Групп (G)"}</th>
          <th>${en ? "Variance explained (η²)" : "Объяснённая дисперсия (η²)"}</th>
          <th>${en ? "Fisher F-stat" : "F-критерий Фишера"}</th>
          <th>p-value</th>
        </tr>
      </thead>
      <tbody>
        ${sci.varianceDecomposition
          .map(
            (v) => `<tr>
              <td><b>${escapeHtml(en ? (anovaLabelEn[v.key] ?? v.label) : (anovaLabelRu[v.key] ?? v.label))}</b></td>
              <td>${num(v.n)}</td>
              <td>${v.groups}</td>
              <td><b>${en ? `${v.etaSqPct}%` : formatShare(v.etaSqPct)}</b></td>
              <td><code>F = ${v.fStat}</code></td>
              <td><b>${escapeHtml(v.pValue)}</b></td>
            </tr>`,
          )
          .join("")}
      </tbody>
    </table>
  </div>` : ""}

  ${sci?.oaxaca?.length ? `<h3 style="margin-top:18px">${en ? "Global Blinder–Oaxaca twofold wage gap decomposition" : "Декомпозиция Оахаки — Блайндера на глобальном рынке"}</h3>
  <div style="overflow-x:auto">
    <table class="table">
      <thead>
        <tr>
          <th>${en ? "International comparison (A vs B)" : "Сравниваемые макросегменты (A против B)"}</th>
          <th>n_A / n_B</th>
          <th>${en ? "Total log gap Δln(W)" : "Общий разрыв Δln(W)"}</th>
          <th>${en ? "Endowments E (grade/role mix)" : "Эффект структуры E (грейды и роли)"}</th>
          <th>${en ? "Pure returns C (location rent)" : "Чистый ценовой эффект C (рента локации)"}</th>
        </tr>
      </thead>
      <tbody>
        ${sci.oaxaca
          .map((o) => {
            const label =
              o.key === "moscow_vs_regions"
                ? en
                  ? "North America (USD) vs Central & Eastern Europe (CEE) in IT"
                  : "Северная Америка (USD) против Центральной и Восточной Европы (ЦВЕ) в IT"
                : en
                  ? "Global Remote (Worldwide) vs Central & Eastern Europe (CEE) in IT"
                  : "Глобальная удалёнка (Worldwide Remote) против хабов ЦВЕ в IT";
            return `<tr>
              <td><b>${escapeHtml(label)}</b></td>
              <td>${num(o.nA)} / ${num(o.nB)}</td>
              <td><b>${o.totalLogGap >= 0 ? "+" : ""}${o.totalLogGap.toFixed(3)}</b> <span class="muted small">(${o.rawGapPct >= 0 ? "+" : ""}${o.rawGapPct}%)</span></td>
              <td><code>${o.endowmentLog >= 0 ? "+" : ""}${o.endowmentLog.toFixed(3)}</code> <span class="muted small">(${o.endowmentSharePct}%)</span></td>
              <td><b><code>${o.coefficientLog >= 0 ? "+" : ""}${o.coefficientLog.toFixed(3)}</code></b> <span class="muted small">(${o.coefficientSharePct}%, ${o.coefficientPct >= 0 ? "+" : ""}${o.coefficientPct}%)</span></td>
            </tr>`;
          })
          .join("")}
      </tbody>
    </table>
  </div>` : ""}

  ${jobs.intlCompanies?.length ? `<h3 style="margin-top:18px">${en ? "Top hiring international employers" : "Крупнейшие международные наниматели за период"}</h3>
  ${countBars(jobs.intlCompanies.slice(0, 12).map((c) => ({ label: c.name, n: c.n })))}` : ""}

  ${gigs.intlBudget?.median ? `<div style="margin-top:22px;padding-top:16px;border-top:1px solid var(--line)" id="intl-freelance">
    <h3>${en ? `Global freelance market (Freelancer.com, ${num(totals.intlGigs ?? 0)} orders)` : `Глобальный рынок фриланса (Freelancer.com, ${num(totals.intlGigs ?? 0)} заказов)`}</h3>
    <p class="small">${en
      ? `Median fixed-price project budget is <b>$${num(Math.round(gigs.intlBudget.median / (usd ?? 80)))}</b>${gigs.intlBudget.p25 && gigs.intlBudget.p75 ? ` (interquartile range $${num(Math.round(gigs.intlBudget.p25 / (usd ?? 80)))}–$${num(Math.round(gigs.intlBudget.p75 / (usd ?? 80)))})` : ""}, sample n = <b>${num(gigs.intlBudget.n)}</b> orders with stated budget.`
      : `Медианный бюджет зарубежного проекта — <b>$${num(Math.round(gigs.intlBudget.median / (usd ?? 80)))}</b>${gigs.intlBudget.p25 && gigs.intlBudget.p75 ? ` (межквартильный коридор от $${num(Math.round(gigs.intlBudget.p25 / (usd ?? 80)))} до $${num(Math.round(gigs.intlBudget.p75 / (usd ?? 80)))})` : ""}, выборка n = <b>${num(gigs.intlBudget.n)}</b> заказов с указанным бюджетом.`}</p>
    ${intlGigRows.length ? rangeChart(intlGigRows, { unit: fmtUsdShort, lang }) : ""}
    ${gigs.intlBrackets?.length ? `<div style="overflow-x:auto;margin-top:12px">
      <table class="table">
        <thead>
          <tr>
            <th>${en ? "Project price bracket (USD)" : "Ценовой сегмент заказа (USD)"}</th>
            <th>${en ? "Orders" : "Заказов"}</th>
            <th>${en ? "Share of volume" : "Доля в числе заказов"}</th>
            <th>${en ? "Share of total budget pool" : "Доля в сумме бюджетов"}</th>
            <th>${en ? "Median in bracket" : "Медиана в сегменте"}</th>
          </tr>
        </thead>
        <tbody>
          ${gigs.intlBrackets
            .map(
              (b) => `<tr>
                <td><b>${escapeHtml(b.label)}</b></td>
                <td>${num(b.n)}</td>
                <td>${en ? `${b.nShare}%` : formatShare(b.nShare)}</td>
                <td><b>${en ? `${b.capitalShare}%` : formatShare(b.capitalShare)}</b></td>
                <td>${b.median !== undefined ? escapeHtml(fmtUsdShort(b.median)) : "—"}</td>
              </tr>`,
            )
            .join("")}
        </tbody>
      </table>
    </div>` : ""}
  </div>` : ""}
</section>`;
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
${detail.companies.length ? `<section class="rs-section"><h2>${ru ? 'Кто нанимает' : 'Who is hiring'}</h2>${countBars(detail.companies.map((c) => ({ label: translateSourceTitle(c.name, options.lang), n: c.n })), options.lang)}` + '</section>' : ''}
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
    body: body + renderResearchEnhancements(options.lang ?? 'ru'),
    lang: options.lang,
    script: QUOTE_SCRIPT,
    head: `${RESEARCH_ENHANCE_HEAD}<meta name="description" content="${escapeHtml(description)}">
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
    <li><b>Точечная оценка вилки:</b> полная вилка <code>[y_min, y_max]</code> приводится к середине <code>y = (y_min + y_max) / 2</code>. Если верхняя граница текстовой вилки превышает потолок 1 000 000 ₽ («от 350 000 до 5 000 000 ₽ в продажах»), берётся только консервативная нижняя граница <code>y_min</code>. Кроме общей медианы отчёт публикует распределение способов указания оплаты («вилка», только «от», только «до», «одна сумма»), медиану строго по полным вилкам и <b>медианный полуразмах вилки</b> <code>±(y_max − y_min) / (2·y) × 100%</code>.</li>
    <li><b>Валютная привязка:</b> суммы конвертируются по официальному курсу Банка России на 1-е число месяца публикации, что гарантирует 100% воспроизводимость исторических срезов.</li>
  </ul>

  <h2>6. Классификация направлений, грейдов и навыков</h2>
  <p>Направление (25 специализаций для вакансий и заказов: ${escapeHtml(roles)}) определяется приоритетным каскадом регулярных выражений по заголовку, а при размытом заголовке («Специалист», «Инженер») — по полю специализации площадки и первым строкам описания. Физический и линейный персонал розницы, складов и курьерских служб жёстко изолируется в категорию «Другое» и исключается из лестницы IT-грейдов.</p>
  <p>Грейд (<code>Стажёр</code>, <code>Junior</code>, <code>Middle</code>, <code>Senior</code>, <code>Lead</code>) определяется по заголовку, полю квалификации площадки, явным строкам <code>Грейд: / Уровень:</code> в описании и тегам <code>#junior..#lead</code>. При указании смежного грейда («Middle+/Senior») фиксируется верхний уровень. В общей лестнице грейдов русскоязычные прилагательные «старший / ведущий / руководитель» не применяются к не-IT ролям и рознице, чтобы линейные позиции («Старший кассир», «Старший смены») не занижали медиану уровня Senior (эффект парадокса Симпсона).</p>
  <p>В рейтинге навыков обобщённые названия рубрик («Разработка», «Маркетинг», «Продажи», «Дизайн») отфильтровываются — остаются только конкретные технологии, языки, фреймворки и инструменты. Исходный код правил открыт: <a href="${REPO_URL}/blob/main/src/research/derive.ts" target="_blank" rel="noopener">src/research/derive.ts</a>.</p>

  <h2>7. Статистический аппарат и защита от смещений</h2>
  <ul>
    <li><b>Непараметрический 95% доверительный интервал медианы:</b> зарплатные распределения скошены вправо, поэтому вместо среднего арифметического и стандартного отклонения используются медиана и порядковые статистики. Для выборки объёма <code>n</code>, упорядоченной по возрастанию <code>x_(1) ≤ … ≤ x_(n)</code>, ранги границ 95% доверительного интервала вычисляются по нормальному приближению биномиального распределения:
      <p><code>r = round(n / 2 − 0.98 · √n),  s = round(n / 2 + 1 + 0.98 · √n),  CI_95% = [ x_(r),  x_(s) ]</code></p>
      Если доверительные интервалы двух направлений пересекаются, отчёт не называет одно направление «самым высокооплачиваемым», а использует строгую формулировку «среди самых высоких».</li>
    <li><b>Стратифицированная поправка Кохрана — Мантеля — Хензеля (борьба с парадоксом Симпсона):</b> прямое сравнение медиан удалённых и офисных вакансий (или вакансий с упоминанием ИИ) даёт смещённую разницу, так как на удалёнку чаще нанимают Senior-разработчиков, а в офис — линейный персонал. Поэтому openradar делит выборку на однородные ячейки <code>c = (role, grade)</code>, где в обеих сравниваемых подгруппах есть минимум по 3 вакансии с зарплатой, и вычисляет взвешенный логарифмический сдвиг медиан с весами <code>w_c = min(n_{c,1}, n_{c,0})</code>:
      <p><code>adjustedGap = exp( ∑_c ( w_c · ln(median_{c,1} / median_{c,0}) ) / ∑_c w_c ) − 1</code></p>
      Показатель публикуется только при суммарном весе сопоставленных ячеек <code>∑ w_c ≥ 30</code>. По этой же формуле рассчитывается чистая зарплатная премия отдельных технологий и навыков.</li>
    <li><b>Недельный индекс зарплат с фиксированной корзиной ролей (индекс Ласпейреса):</b> чтобы недельный график зарплат не зависел от колебаний доли массовых вакансий, в <code>weeklyIndexed</code> фиксируются базовые веса направлений <code>w_r = N_r / ∑ N_j</code> (для ролей с <code>N_r ≥ 30</code>). В каждую неделю средневзвешенная медиана считается в неизменной структуре ролей (база первой недели = 100).</li>
    <li><b>Индекс концентрации Джини (G) и квартильная дисперсия (QCD):</b> для оценки зарплатного расслоения рассчитываются децильный коэффициент фондов <code>P90 / P10</code>, робастный коэффициент квартильной вариации <code>QCD = (P75 − P25) / (P75 + P25)</code> и непараметрический индекс Джини по упорядоченному ряду окладов <code>x_(1) ≤ … ≤ x_(n)</code>:
      <p><code>G = ∑_{i=1..n} ( (2·i − n − 1) · x_(i) ) / ( n · ∑_{i=1..n} x_(i) )</code></p>
    </li>
    <li><b>Асимметрия Боули (S_B) и Келли (S_K) и индекс Херфиндаля — Хиршмана (HHI):</b> правосторонняя скошенность зарплатных распределений измеряется квантильными индексами <code>S_B = ((P75 − P50) − (P50 − P25)) / (P75 − P25)</code> и <code>S_K = ((P90 − P50) − (P50 − P10)) / (P90 − P10)</code>, а концентрация спроса со стороны работодателей — индексом <code>HHI = ∑ s_i² × 10 000</code>, где <code>s_i</code> — доля вакансий i-го нанимателя.</li>
    <li><b>Лог-линейное уравнение заработной платы Якоба Минсера (Mincer Earnings Regression, OLS + White HC1):</b> для отделения вклада квалификационного грейда от географического расположения и удалённого формата оценивается многофакторная регрессия методом наименьших квадратов (МНК) по логарифму месячной зарплаты в IT:
      <p><code>ln(W_i) = β₀ + β₁·Middle_i + β₂·Senior_i + β₃·Lead_i + γ₁·Moscow_i + γ₂·SPb_i + γ₃·Remote_i + δ·AI_i + ε_i</code></p>
      Стандартные ошибки коэффициентов оцениваются в гетероскедастично-робастной форме Уайта <code>HC1: V_HC1 = (n / (n − k)) · (XᵀX)⁻¹ · (∑ e_i² x_i x_iᵀ) · (XᵀX)⁻¹</code>, а точный процентный вклад бинарного фактора вычисляется по формуле Халворсена — Палмквиста: <code>Δ% = (exp(β_j) − 1) × 100%</code>.</li>
    <li><b>Дисперсионный анализ (ANOVA η²) и непараметрические ранговые критерии:</b> доля общей дисперсии логарифма зарплат, объясняемая каждым институциональным фактором (грейд, география, направление, язык программирования), рассчитывается как <code>η² = SS_between / SS_total</code>. Проверка статистических гипотез выполняется непараметрическими критериями Манна — Уитни (<code>U</code>-тест с поправкой на связки и рангово-бисериальной дельтой Клиффа <code>δ = 2U / (n₁n₂) − 1</code>), Краскела — Уоллиса (<code>H</code>-тест и <code>ε² = H / (N − 1)</code>) и ранговой корреляцией Спирмена (<code>ρ_s</code>).</li>
    <li><b>Статистический вывод (версия отчёта 3):</b> все p-значения точные, а не по таблице критических значений. Для H-критерия Краскела — Уоллиса p берётся из распределения χ² с фактическим числом степеней свободы df = k − 1 (группы меньше пяти наблюдений отбрасываются, поэтому df меняется), H делится на поправку на связанные ранги <code>1 − Σ(t³ − t) / (N³ − N)</code>; размер эффекта <code>ε² = H / (N − 1)</code> (0,01 — малый, 0,08 — средний, 0,26 — большой; Tomczak &amp; Tomczak, 2014). Для U-критерия Манна — Уитни p из нормального приближения с поправкой на связи, размер эффекта — дельта Клиффа (0,147 / 0,33 / 0,474; Romano и соавт., 2006). Для корреляции Спирмена <code>t = ρ·√((k − 2)/(1 − ρ²))</code> и распределение Стьюдента с k − 2 степенями свободы, пороги |ρ| 0,1 / 0,3 / 0,5 (Cohen, 1988). Коэффициенты уравнения Минсера: <code>t = β / SE(HC1)</code>, p из распределения Стьюдента с df = n − k, звёзды выводятся из p (*** &lt; 0,001, ** &lt; 0,01, * &lt; 0,05). F-критерии ANOVA и регрессии — по распределению Фишера. Гипотезы H1–H4 проверяются на одних данных, поэтому к ним применяется поправка Холма — Бонферрони; публикуются и исходное, и скорректированное p. Гипотеза считается подтверждённой, только если скорректированное p &lt; 0,05, эффект не меньше малого и направление совпадает с ожидаемым. На десятках тысяч наблюдений значимой оказывается почти любая разница, поэтому значимость без размера эффекта ничего не доказывает. p записываются по APA: «&lt; 0,001» или три знака после запятой. Попарные сравнения Данна после H-критерия не публикуются.</li>
  </ul>

  ${renderFormulaGallerySection('ru')}

  <h2 id="index">8. Индекс openradar (панельный индекс рыночной активности)</h2>
  <p>Индекс (<a href="/research/index">/research/index</a>) показывает, сколько новых вакансий и фриланс-заказов появляется на рынке каждый день относительно базового периода (9 ноября — 6 декабря 2026 = 100).</p>
  <ul>
    <li><b>Две независимые фиксированные панели (РФ и Global):</b> русскоязычный индекс строится на постоянной панели из 8 эталонных лент (<code>hh-it</code>, <code>hh-remote-project</code>, <code>habr-career</code>, <code>getmatch</code>, <code>trudvsem-remote</code>, <code>kwork-all</code>, <code>fl-all</code>, <code>freelancehunt</code>), а международный индекс (Global &amp; Remote) — на постоянной панели из 10 англоязычных площадок и ATS-систем (<code>himalayas.app</code>, <code>arbeitnow.com</code>, <code>justjoin.it</code>, <code>jobicy.com</code>, <code>weworkremotely.com</code>, <code>remoteworker.co.uk</code>, <code>cryptojobslist.com</code>, <code>jobs.ashbyhq.com</code>, <code>job-boards.greenhouse.io</code>, <code>jobs.lever.co</code>) и глобальной фриланс-биржи <code>freelancer.com</code>. Подключение новых Telegram-каналов или досок в агрегатор не раздувает ни одну из панелей.</li>
    <li><b>Отсечение поднятых старых вакансий (Freshness Gate):</b> на hh.ru и Хабр Карьере вакансии нумеруются последовательно. Если номер вакансии отстаёт от максимального замеченного за окно более чем на <code>230 000</code> (на hh.ru генерируется ~32 тыс. номеров в сутки) или на <code>100</code> (на Хабр Карьере), это старая вакансия, поднятая работодателем в поиске — в индекс новых публикаций она не входит.</li>
    <li><b>Скользящее 7-дневное окно и виндзоризация технических всплесков:</b> поскольку в субботу и воскресенье поток вакансий падает в 4–6 раз, значение дня рассчитывается как среднее за последние 7 суток <code>MA_7(t) = (1/7) · ∑_{i=0..6} C_{t−i}</code>. Если до начала базового периода при первичном подключении ленты произошла разовая выгрузка архива за несколько дней (<code>C_t &gt; 2,5 × median(C)</code>), при расчёте <code>MA_7</code> этот день ограничивается порогом <code>2,5 × median(C)</code>, чтобы через 7 суток выход пика из окна не создавал искусственного обвала индекса.</li>
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
  <p><b>Отчёт, версия 3 (ноябрь 2026).</b> Точные p-значения вместо таблиц критических значений: χ² с фактическим df для H-критерия (раньше всегда брались пороги для df = 3), распределение Стьюдента для коэффициентов Минсера и корреляции Спирмена (раньше нормальные пороги и всегда «*** p &lt; 0,001» для константы), распределение Фишера для F. Поправка Холма — Бонферрони на семейство гипотез H1–H4 и решение «подтверждена» только при скорректированном p &lt; 0,05 и эффекте не меньше малого. Остальные цифры отчёта не изменились.</p>
  <p><b>Отчёт, версия 2, и индекс, версия 2 (ноябрь 2026).</b> Заказы считаются только по русскоязычному рынку (исключение англоязычных заказов убрало смещение медианы на +40%). Сравнение объёма бюджетов и AI-задач изолировано внутри проектных заказов. Введены курсы Банка России, непараметрические 95% ДИ медиан, стратифицированная поправка Кохрана — Мантеля — Хензеля на состав ролей и грейдов, матрица «Направление × Грейд», расчёт зарплатных премий навыков и очистка лестницы грейдов от не-IT розницы. В индексе введена фиксированная панель лент, фильтр поднятых вакансий по номеру публикации и защита 7-дневного среднего от залповых выгрузок при старте лент. Отчёт за октябрь 2026 сохранён в версии 1 для неизменности цитат.</p>

    <h2>12. Открытые данные и словарь переменных (Codebook / Data Dictionary)</h2>
  <p>Данные публикуются по открытой лицензии ${LICENSE}. Ежедневная выгрузка <a href="/research/dataset.csv">/research/dataset.csv</a> содержит по одной строке на публикацию со всеми производными полями без персональных данных и исходных текстов, что позволяет напрямую загружать массив в Python (<code>pandas</code>, <code>statsmodels</code>), R или Stata для воспроизведения расчётов, написания научных статей и выпускных квалификационных работ (ВКР).</p>
  <div style="overflow-x:auto">
    <table class="table">
      <thead>
        <tr>
          <th>Поле CSV</th>
          <th>Тип</th>
          <th>Описание и кодировка значений в датасете</th>
        </tr>
      </thead>
      <tbody>
        <tr><td><code>id</code></td><td>string</td><td>Уникальный детерминированный идентификатор записи после 3-уровневой дедупликации</td></tr>
        <tr><td><code>date</code></td><td>YYYY-MM-DD</td><td>Дата публикации вакансии или заказа (UTC)</td></tr>
        <tr><td><code>type</code></td><td>enum</td><td>Тип публикации: <code>job</code> (вакансия в штат) или <code>gig</code> (проектный фриланс-заказ)</td></tr>
        <tr><td><code>platform</code></td><td>string</td><td>Код площадки или источника (например, <code>hh.ru</code>, <code>career.habr.com</code>, <code>kwork.ru</code>, <code>telegram</code>)</td></tr>
        <tr><td><code>role</code></td><td>enum</td><td>Код специализации (25 направлений: <code>backend</code>, <code>frontend</code>, <code>devops</code>, <code>data</code>, <code>qa</code> и др.)</td></tr>
        <tr><td><code>grade</code></td><td>enum</td><td>Квалификационный грейд: <code>intern</code>, <code>junior</code>, <code>middle</code>, <code>senior</code>, <code>lead</code> (пусто, если не указан)</td></tr>
        <tr><td><code>language</code></td><td>string</td><td>Основной язык программирования для разработчиков (<code>Go</code>, <code>Python</code>, <code>TypeScript</code>, <code>Rust</code>, <code>1С</code> и др.)</td></tr>
        <tr><td><code>region</code></td><td>enum</td><td>Макрорегион РФ: <code>Москва</code>, <code>Санкт-Петербург</code>, <code>Другие города</code>, <code>Не указан</code></td></tr>
        <tr><td><code>remote</code></td><td>0 | 1</td><td>Индикатор удалённого формата работы (<code>1</code> — удалёнка / remote, <code>0</code> — офис или гибрид)</td></tr>
        <tr><td><code>company</code></td><td>string</td><td>Нормализованное название работодателя (для вакансий)</td></tr>
        <tr><td><code>pay_min_rub</code> / <code>pay_max_rub</code></td><td>integer</td><td>Нижняя и верхняя границы заявленной вилки в рублях (по курсу Банка России на месяц публикации)</td></tr>
        <tr><td><code>pay_rub</code></td><td>integer</td><td>Точечная оценка оплаты в рублях (середина полной вилки или единственная указанная граница)</td></tr>
        <tr><td><code>pay_period</code></td><td>enum</td><td>Расчётный период: <code>month</code> (в месяц), <code>project</code> (за проект), <code>hour</code> (в час), <code>day</code> (в смену)</td></tr>
        <tr><td><code>currency</code></td><td>ISO 4217</td><td>Исходная валюта публикации (<code>RUB</code>, <code>USD</code>, <code>EUR</code>, <code>KZT</code>, <code>BYN</code>)</td></tr>
        <tr><td><code>pay_origin</code></td><td>enum</td><td>Источник извлечения цены: <code>page</code> (schema.org), <code>board</code> (поле биржи), <code>text</code> (парсер), <code>model</code> (LLM)</td></tr>
        <tr><td><code>ai_mention</code></td><td>0 | 1</td><td>Индикатор упоминания технологий ИИ / LLM / RAG / ML в требованиях (<code>1</code> — да, <code>0</code> — нет)</td></tr>
        <tr><td><code>skills</code></td><td>string</td><td>Список нормализованных технологических навыков и инструментов через точку с запятой (<code>;</code>)</td></tr>
        <tr><td><code>scope</code></td><td>enum</td><td>Языковой контур рынка: <code>ru</code> (русскоязычный рынок) или <code>intl</code> (международный англоязычный рынок)</td></tr>
      </tbody>
    </table>
  </div>
  <h2 id="citation">13. Как цитировать методику и датасет в научных работах</h2>
  <p>При использовании данных, таблиц, индекса или эконометрических моделей в научных публикациях (РИНЦ, ВАК, Scopus), аналитических докладах и выпускных квалификационных работах (ВКР) рекомендуем приводить библиографическую ссылку по ГОСТ Р 7.0.5–2008 или APA 7th:</p>
  <ul>
    <li><b>По ГОСТ Р 7.0.5–2008:</b> <code>Методика эмпирических исследований и панельного индекса рынка труда в IT и фрилансе [Электронный ресурс] // openradar: открытая исследовательская сеть рынка труда. — 2026. — URL: ${escapeHtml(baseUrl)}/research/methodology (Лицензия CC BY 4.0).</code></li>
    <li><b>В формате APA (7th ed.):</b> <code>openradar Research. (2026). Methodology of the Russian IT &amp; Freelance Labour Market Study and Panel Index (Version 2). openradar. ${escapeHtml(baseUrl)}/research/methodology</code></li>
    <li><b>Машиночитаемые потоки для исследователей и AI-агентов:</b> <a href="/research/report.json">/research/report.json</a> (полный JSON-отчёт с матрицами и регрессией Минсера), <a href="/research/dataset.csv">/research/dataset.csv</a> (обезличенные микроданные), <a href="/research/index.json">/research/index.json</a> (временные ряды индекса), <a href="/openapi.json">/openapi.json</a> (OpenAPI 3.1) и <a href="/llms.txt">/llms.txt</a>.</li>
  </ul>
</section>`;
  return layout({
    auth: options.auth,
    title: 'Методика исследований и индекса openradar',
    version,
    active: 'research',
    body: body + renderResearchEnhancements('ru'),
    head: `${RESEARCH_ENHANCE_HEAD}<meta name="description" content="Полная методика исследований и индекса openradar: источники, нормализация зарплатных вилок, 95% доверительные интервалы, поправка на парадокс Симпсона и формула индекса.">
${scholarMetaTags({ title: "Методика исследований и индекса openradar", baseUrl, path: "/research/methodology", dateIso: new Date().toISOString(), lang: "ru" })}
<link rel="canonical" href="${escapeHtml(baseUrl)}/research/methodology">
<link rel="alternate" hreflang="en" href="${escapeHtml(baseUrl)}/en/research/methodology">`,
  });
}

export { GRADE_LABELS };

export function renderAcademicPaperLatex(report: Report, baseUrl = "https://openradar.fun", lang: SupportedLang = "ru"): string {
  const en = lang === "en";
  const mincer = report.jobs.scientific?.mincer;
  const anova = report.jobs.scientific?.varianceDecomposition ?? [];
  const oaxaca = report.jobs.scientific?.oaxaca ?? [];
  const econ = report.jobs.econometrics;
  const escTex = (s: string): string =>
    s.replace(/\\/g, "\\textbackslash{}").replace(/([&%$#_{}])/g, "\\$1").replace(/~/g, "\\textasciitilde{}").replace(/\^/g, "\\textasciicircum{}");

  return [
    "\\documentclass[11pt,a4paper]{article}",
    "\\usepackage[utf8]{inputenc}",
    "\\usepackage[T2A,T1]{fontenc}",
    "\\usepackage[english,russian]{babel}",
    "\\usepackage{amsmath,amssymb,amsfonts}",
    "\\usepackage{booktabs}",
    "\\usepackage{geometry}",
    "\\usepackage{hyperref}",
    "\\geometry{margin=2.5cm}",
    "",
    `\\title{${en ? "Empirical Econometric Analysis of the IT and Freelance Labour Market" : "Эмпирический эконометрический анализ рынка труда в IT и фрилансе"} (${escTex(report.period.label)})}`,
    "\\author{openradar Research}",
    `\\date{${escTex(report.generatedAt.slice(0, 10))}}`,
    "",
    "\\begin{document}",
    "\\maketitle",
    "",
    "\\begin{abstract}",
    en
      ? `This paper presents an automated empirical econometric study of ${report.totals.posts} labour market observations (${report.totals.jobs} vacancies and ${report.totals.gigs} freelance orders; ${report.totals.jobsWithPay} vacancies with disclosed pay) collected by the openradar research network over ${escTex(report.period.label)}. We estimate a Mincerian log-wage equation via Ordinary Least Squares (OLS) with White HC1 heteroskedasticity-robust standard errors, perform one-way ANOVA variance decomposition ($\\eta^2$), two-fold Blinder--Oaxaca wage gap decomposition, and non-parametric Mann--Whitney $U$, Kruskal--Wallis $H$, and Spearman $\\rho_s$ hypothesis tests.`
      : `В работе представлено эмпирическое эконометрическое исследование на выборке из ${report.totals.posts} наблюдений рынка труда (${report.totals.jobs} вакансий и ${report.totals.gigs} фриланс-заказов; ${report.totals.jobsWithPay} вакансий с раскрытой оплатой), собранных открытой исследовательской сетью openradar за период ${escTex(report.period.label)}. Проведена оценка лог-линейного уравнения заработной платы Якоба Минсера методом МНК с гетероскедастично-робастными ошибками Уайта (HC1), однофакторная декомпозиция дисперсии логарифма зарплат (ANOVA $\\eta^2$), двухфакторная декомпозиция Оахаки — Блайндера, а также непараметрическая проверка гипотез по критериям Манна — Уитни $U$, Краскела — Уоллиса $H$ и ранговой корреляции Спирмена $\\rho_s$.`,
    "\\end{abstract}",
    "",
    "\\section{Econometric Specification}",
    "\\begin{equation}",
    "  \\ln(y_i) = \\beta_0 + \\sum_{g} \\beta_g \\mathbb{I}(\\text{Grade}_i = g) + \\sum_{r} \\gamma_r \\mathbb{I}(\\text{Region}_i = r) + \\delta_{\\text{AI}} \\mathbb{I}(\\text{AI}_i = 1) + \\varepsilon_i",
    "\\end{equation}",
    "\\begin{equation}",
    "  \\widehat{\\mathbf{V}}_{\\text{HC1}}(\\hat{\\boldsymbol{\\beta}}) = \\frac{n}{n - k}(\\mathbf{X}^\\top \\mathbf{X})^{-1}\\left(\\sum_{i=1}^{n} \\hat{\\varepsilon}_i^2 \\mathbf{x}_i \\mathbf{x}_i^\\top\\right)(\\mathbf{X}^\\top \\mathbf{X})^{-1}, \\qquad \\Delta\\%_j = (\\exp(\\hat{\\beta}_j) - 1)\\times 100\\%",
    "\\end{equation}",
    "\\begin{equation}",
    "  \\Delta\\overline{\\ln W} = (\\bar{\\mathbf{X}}_A - \\bar{\\mathbf{X}}_B)^\\top \\hat{\\boldsymbol{\\beta}}^* + \\bigl[\\bar{\\mathbf{X}}_A^\\top (\\hat{\\boldsymbol{\\beta}}_A - \\hat{\\boldsymbol{\\beta}}^*) + \\bar{\\mathbf{X}}_B^\\top (\\hat{\\boldsymbol{\\beta}}^* - \\hat{\\boldsymbol{\\beta}}_B)\\bigr]",
    "\\end{equation}",
    "",
    "\\section{Empirical Results}",
    mincer
      ? [
          "\\begin{table}[htbp]",
          "\\centering",
          `\\caption{Mincerian Log-Wage OLS Regression (N = ${mincer.n}, R^2 = ${mincer.r2.toFixed(3)}, F = ${mincer.fStat})}`,
          "\\begin{tabular}{lrrrrr}",
          "\\toprule",
          "Variable & Coeff. $\\hat{\\beta}$ & Robust SE (HC1) & $t$-stat & $p$-value & Semi-elasticity $\\Delta\\%$ \\\\",
          "\\midrule",
          ...mincer.coefficients.map(
            (c) =>
              `${escTex(c.label)} & ${c.beta.toFixed(3)}${c.stars} & ${c.se.toFixed(3)} & ${c.tStat.toFixed(2)} & ${escTex(c.pValue)} & ${c.effectPct !== undefined ? `${c.effectPct}\\%` : "---"} \\\\`,
          ),
          "\\bottomrule",
          "\\end{tabular}",
          "\\end{table}",
        ].join("\n")
      : "",
    anova.length
      ? [
          "\\begin{table}[htbp]",
          "\\centering",
          "\\caption{One-Way ANOVA Log-Wage Variance Decomposition ($\\eta^2$)}",
          "\\begin{tabular}{lrrrr}",
          "\\toprule",
          "Factor & Sample $N$ & Groups $G$ & $\\eta^2$ (\\%) & Fisher $F$-stat \\\\",
          "\\midrule",
          ...anova.map((v) => `${escTex(v.label)} & ${v.n} & ${v.groups} & ${v.etaSqPct}\\% & ${v.fStat} \\\\`),
          "\\bottomrule",
          "\\end{tabular}",
          "\\end{table}",
        ].join("\n")
      : "",
    oaxaca.length
      ? [
          "\\begin{table}[htbp]",
          "\\centering",
          "\\caption{Blinder--Oaxaca Twofold Wage Gap Decomposition}",
          "\\begin{tabular}{lrrrr}",
          "\\toprule",
          "Comparison & $n_A / n_B$ & $\\Delta\\ln(W)$ & Endowments $E$ & Pure Returns $C$ \\\\",
          "\\midrule",
          ...oaxaca.map(
            (o) =>
              `${escTex(o.label)} & ${o.nA}/${o.nB} & ${o.totalLogGap.toFixed(3)} & ${o.endowmentLog.toFixed(3)} (${o.endowmentSharePct}\\%) & ${o.coefficientLog.toFixed(3)} (${o.coefficientSharePct}\\%) \\\\`,
          ),
          "\\bottomrule",
          "\\end{tabular}",
          "\\end{table}",
        ].join("\n")
      : "",
    econ
      ? `\\noindent\\textbf{Distributional & Inequality Summary:} Overall median = ${econ.all.p50 ?? "---"} RUB (Gini $G = ${econ.all.gini?.toFixed(3) ?? "---"}$, Theil $T = ${econ.all.theil?.toFixed(3) ?? "---"}$); IT median = ${econ.it.p50 ?? "---"} RUB (Gini $G = ${econ.it.gini?.toFixed(3) ?? "---"}$, Theil $T = ${econ.it.theil?.toFixed(3) ?? "---"}$); Employer HHI = ${econ.employerConcentration.hhi}.${econ.ipwCorrectedIt ? ` Horvitz--Thompson IPW selection-corrected IT median = ${econ.ipwCorrectedIt.ipwMedian} RUB (${econ.ipwCorrectedIt.biasPct >= 0 ? "+" : ""}${econ.ipwCorrectedIt.biasPct}\\% vs observed).`: ""}`
      : "",
    "",
    report.jobs.crossMarket?.byGrade.length
      ? [
          "\\section{International & Cross-Market Econometric Comparison (Nominal vs PPP)}",
          "\\begin{table}[htbp]",
          "\\centering",
          `\\caption{Russia IT vs Global IT Compensation by Seniority Grade (FX = ${report.jobs.crossMarket.usdRate} RUB/USD, IMF/WB PPP Factor = ${report.jobs.crossMarket.pppFactor}\\times)}`,
          "\\begin{tabular}{lrrrrrr}",
          "\\toprule",
          "Grade & RU (RUB/mo) & RU Nominal (\\$/yr) & RU PPP (\\$/yr) & Global (\\$/yr) & Nominal Gap & PPP Parity \\\\",
          "\\midrule",
          ...report.jobs.crossMarket.byGrade.map(
            (g) =>
              `${escTex(g.label)} & ${g.ruMedianRubMo} & ${g.ruMedianUsdYr} & ${g.ruPppUsdYr} & ${g.intlMedianUsdYr} & ${g.nominalGapRatio}\\times & ${g.pppParityPct}\\% \\\\`,
          ),
          "\\bottomrule",
          "\\end{tabular}",
          "\\end{table}",
        ].join("\n")
      : "",
    "\\section*{Data Availability & Citation}",
    `Open dataset (CC BY 4.0): \\url{${baseUrl}/research/dataset.csv}, JSON report: \\url{${baseUrl}/research/report.json}, Methodology: \\url{${baseUrl}/research/methodology}.`,
    "\\end{document}",
    "",
  ].join("\n");
}
