/**
 * The research section in English: the live and monthly reports, the openradar index and
 * the methodology. The figures are the same as on the Russian pages; only the words differ.
 * Findings are written here from the report's numbers, so frozen monthly reports read in
 * English too.
 */
import { escapeHtml, jsonForScript } from '../core/text.ts';
import { layout, type AuthDisplay } from '../server/ui.ts';
import { RUB_PER } from './derive.ts';
import type { IndexSeries, OpenradarIndex } from './index.ts';
import { lineChart } from './index-page.ts';
import { MIN_MEDIAN, RELIABLE, rubMonthToUsdYear, type Dist, type Report, type Slice } from './report.ts';

const LICENSE = 'CC BY 4.0';
const REPO_URL = 'https://github.com/MikhailSagalaev/openradar';

export const ROLE_EN: Record<string, string> = {
  ai: 'AI engineering and vibe coding',
  '1c': '1C developer',
  security: 'Information security',
  qa: 'QA engineer',
  devops: 'DevOps and SRE',
  architect: 'Software architect',
  sysadmin: 'System administrator',
  'data-engineer': 'Data engineer',
  'analyst-system': 'Systems analyst',
  'analyst-business': 'Business analyst',
  'analyst-data': 'Data and product analyst',
  ml: 'Data science and ML',
  product: 'Product manager',
  project: 'Project manager',
  design: 'Designer',
  gamedev: 'Game developer',
  mobile: 'Mobile developer',
  fullstack: 'Fullstack developer',
  frontend: 'Frontend developer',
  embedded: 'Embedded developer',
  backend: 'Backend developer',
  education: 'Teaching and mentoring',
  support: 'Tech support',
  marketing: 'Marketing and ads',
  content: 'Writing and content',
  sales: 'Sales',
  hr: 'HR and recruiting',
  web: 'Websites',
  bots: 'Bots',
  parsing: 'Scraping and automation',
  marketplaces: 'Marketplaces',
  video: 'Video and animation',
  translation: 'Translation',
  'dev-other': 'Other development',
  other: 'Other',
};
const GRADE_EN: Record<string, string> = { intern: 'Intern', junior: 'Junior', middle: 'Middle', senior: 'Senior', lead: 'Lead' };
const REGION_EN: Record<string, string> = {
  Москва: 'Moscow',
  'Санкт-Петербург': 'Saint Petersburg',
  'Другие города': 'Other cities',
  'Не указан': 'Not stated',
};
const ORIGIN_EN: Record<string, string> = { page: 'vacancy page markup', text: 'post text', budget: "the board's budget", model: 'language model' };

const num = (value: number): string => new Intl.NumberFormat('en-US').format(value);
const rub = (value: number): string => `₽${num(value)}`;
const pct = (value: number): string => `${value}%`;
const dateEn = (iso: string): string => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

/** «October 2026», «22–31 October 2026», «30 Sep – 29 Oct 2026». */
export function periodEn(report: Report): { label: string; phrase: string } {
  const from = report.period.from.slice(0, 10);
  const last = new Date(Date.parse(report.period.to) - (report.kind === 'live' ? 0 : 86_400_000)).toISOString().slice(0, 10);
  if (report.kind === 'month' && report.period.slug) {
    const month = new Date(`${report.period.slug}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    const full = from.endsWith('-01');
    return full
      ? { label: month, phrase: `in ${month}` }
      : { label: `${month} (from ${Number(from.slice(8))} ${month.split(' ')[0]})`, phrase: `from ${dateEn(from)} to ${dateEn(last)}` };
  }
  return { label: `${dateEn(from)} – ${dateEn(last)}`, phrase: 'over the last 30 days' };
}

function translate(slices: Slice[], names: Record<string, string>): Slice[] {
  return slices.map((s) => ({ ...s, label: names[s.key] ?? s.label }));
}

function rangeChart(rows: Array<{ label: string; href?: string; pay: Dist }>, unit: (v: number) => string = rub): string {
  const shown = rows.filter((row) => row.pay.median !== undefined);
  if (!shown.length) return `<p class="muted small">Not enough data yet: a group needs at least ${MIN_MEDIAN} posts with pay.</p>`;
  const top = Math.max(...shown.map((row) => row.pay.p75 ?? row.pay.median!)) * 1.08;
  const at = (v: number): string => `${Math.min(100, (v / top) * 100).toFixed(2)}%`;
  return `<div class="rs-chart" role="table">${shown.map((row) => `<div class="rs-row">
  <div class="rs-label">${row.href ? `<a href="${escapeHtml(row.href)}">${escapeHtml(row.label)}</a>` : escapeHtml(row.label)}</div>
  <div class="rs-track">${row.pay.p25 !== undefined && row.pay.p75 !== undefined ? `<span class="rs-band" style="left:${at(row.pay.p25)};width:calc(${at(row.pay.p75)} - ${at(row.pay.p25)})"></span>` : ''}<span class="rs-dot" style="left:${at(row.pay.median!)}"></span></div>
  <div class="rs-val"><b>${escapeHtml(unit(row.pay.median!))}</b><span class="rs-n">n = ${row.pay.n}${row.pay.n < RELIABLE ? ' · few' : ''}</span></div>
</div>`).join('')}</div>
<p class="rs-legend"><span class="rs-dot-key"></span> median <span class="rs-band-key"></span> middle half of posts (25th to 75th percentile)</p>`;
}

function countBars(rows: Array<{ label: string; n: number }>): string {
  if (!rows.length) return '';
  const max = Math.max(...rows.map((row) => row.n));
  return `<div class="rs-chart">${rows.map((row) => `<div class="rs-row">
  <div class="rs-label">${escapeHtml(row.label)}</div>
  <div class="rs-track"><span class="rs-fill" style="width:${((row.n / max) * 100).toFixed(2)}%"></span></div>
  <div class="rs-val"><b>${num(row.n)}</b></div>
</div>`).join('')}</div>`;
}

const kpi = (value: string, label: string): string => `<div class="rs-kpi"><b>${escapeHtml(value)}</b><span>${escapeHtml(label)}</span></div>`;
const quoteButton = (quote: string): string => `<button type="button" class="rs-quote" data-quote="${escapeHtml(quote)}">Copy quote</button>`;
const QUOTE_SCRIPT = `<script>
document.addEventListener('click', (event) => {
  const button = event.target.closest('[data-quote]');
  if (!button) return;
  navigator.clipboard.writeText(button.dataset.quote).then(() => { button.textContent = 'Copied'; });
});
</script>`;

/** The findings of the Russian report, written in English from the same figures. */
export function findingsEn(report: Report): Array<{ text: string; quote: string }> {
  const out: Array<{ text: string; quote: string }> = [];
  const { phrase } = periodEn(report);
  const cite = (text: string, n: number): string => `According to openradar, ${text} ${phrase} (sample: ${num(n)} vacancies).`;
  const { jobs, gigs } = report;
  if (jobs.pay.median !== undefined) {
    out.push({
      text: `The median monthly pay in Russian-language vacancies that state it is ${rub(jobs.pay.median)}.`,
      quote: cite(`the median monthly pay offered in Russian-language IT vacancies was ${rub(jobs.pay.median)}`, jobs.pay.n),
    });
  }
  if (report.totals.jobs >= RELIABLE) {
    out.push({
      text: `${pct(jobs.payShare)} of vacancies state the pay.`,
      quote: `According to openradar, ${pct(jobs.payShare)} of Russian-language vacancies stated the pay ${phrase} (sample: ${num(report.totals.jobs)} vacancies).`,
    });
  }
  const ranked = jobs.roles.filter((r) => r.pay.n >= MIN_MEDIAN);
  const top = ranked.slice().sort((a, b) => b.pay.median! - a.pay.median!)[0];
  if (top && ranked.length >= 3) {
    const name = ROLE_EN[top.slug] ?? top.label;
    out.push({ text: `${name} vacancies offer the most: a median of ${rub(top.pay.median!)}.`, quote: cite(`${name} vacancies offered the highest median pay, ${rub(top.pay.median!)} a month`, top.pay.n) });
  }
  const junior = jobs.byGrade.find((s) => s.key === 'junior')?.pay;
  const senior = jobs.byGrade.find((s) => s.key === 'senior')?.pay;
  if (junior?.median && senior?.median) {
    const ratio = Math.round((senior.median / junior.median) * 10) / 10;
    out.push({
      text: `Senior roles are offered ${ratio} times as much as Junior ones: ${rub(senior.median)} against ${rub(junior.median)}.`,
      quote: cite(`the median pay offered to Senior specialists (${rub(senior.median)}) was ${ratio} times that of Juniors (${rub(junior.median)})`, senior.n + junior.n),
    });
  }
  if (jobs.remote.remote.median && jobs.remote.office.median) {
    const diff = Math.round(((jobs.remote.remote.median - jobs.remote.office.median) / jobs.remote.office.median) * 100);
    out.push({
      text: `${pct(jobs.remote.share)} of vacancies allow remote work; their median is ${rub(jobs.remote.remote.median)} against ${rub(jobs.remote.office.median)} on site.`,
      quote: cite(`${pct(jobs.remote.share)} of vacancies allowed remote work, and their median pay was ${Math.abs(diff)}% ${diff >= 0 ? 'higher' : 'lower'} than on site`, jobs.remote.remote.n + jobs.remote.office.n),
    });
  }
  if (jobs.ai.with.median && jobs.ai.without.median) {
    const diff = Math.round(((jobs.ai.with.median - jobs.ai.without.median) / jobs.ai.without.median) * 100);
    out.push({
      text: `${pct(jobs.ai.share)} of vacancies mention AI; they offer ${rub(jobs.ai.with.median)} against ${rub(jobs.ai.without.median)} in the rest.`,
      quote: cite(`AI was mentioned in ${pct(jobs.ai.share)} of vacancies, and their median pay was ${Math.abs(diff)}% ${diff >= 0 ? 'higher' : 'lower'} than in the rest`, jobs.ai.with.n + jobs.ai.without.n),
    });
  }
  if (gigs.budget.median !== undefined) {
    out.push({
      text: `The median freelance order budget is ${rub(gigs.budget.median)}; ${pct(gigs.budgetShare)} of orders state one.`,
      quote: `According to openradar, the median budget of freelance orders on Russian-language boards and Telegram channels ${phrase} was ${rub(gigs.budget.median)} (sample: ${num(gigs.budget.n)} orders).`,
    });
  }
  return out;
}

function enHead(description: string, canonical: string, ruPath: string, baseUrl: string): string {
  return `<meta name="description" content="${escapeHtml(description)}">
<link rel="canonical" href="${escapeHtml(canonical)}">
<link rel="alternate" hreflang="ru" href="${escapeHtml(`${baseUrl}${ruPath}`)}">
<link rel="alternate" hreflang="en" href="${escapeHtml(canonical)}">`;
}

export function renderReportPageEn(options: { report: Report; baseUrl: string; version: string; auth?: AuthDisplay; snapshots: Array<{ period: string }> }): string {
  const { report, baseUrl, version, snapshots } = options;
  const { jobs, gigs, totals } = report;
  const isLive = report.kind === 'live';
  const { label } = periodEn(report);
  const path = isLive ? '/en/research' : `/en/research/${report.period.slug}`;
  const ruPath = isLive ? '/research' : `/research/${report.period.slug}`;
  const title = isLive ? 'IT and freelance labour market in Russia' : `IT and freelance labour market in Russia: ${label}`;
  const findings = findingsEn(report);
  const intlMedian = jobs.intl.median;
  const cite = `openradar, “IT and freelance labour market in Russia”, ${label}. ${baseUrl}${path}`;
  const body = `<nav class="crumbs" aria-label="Breadcrumbs"><a href="/">openradar</a> / ${isLive ? 'Research' : `<a href="/en/research">Research</a> / ${escapeHtml(label)}`}</nav>
<div class="page-head"><div>
  <h1>${escapeHtml(title)}</h1>
  <p class="muted small">${isLive ? `A live report on ${num(totals.posts)} posts, ${escapeHtml(label)}, recalculated every 15 minutes.` : `The report for ${escapeHtml(label)}: ${num(totals.posts)} posts. The figures are frozen.`}
  Pay offered in published Russian-language vacancies and freelance orders: hh.ru, Habr Career, the state portal «Работа России», freelance boards and Telegram channels.</p>
</div><div class="actions"><a class="btn ghost" href="/en/research/index">Index</a><a class="btn ghost" href="/en/research/methodology">Methodology</a><a class="btn ghost" href="/research/dataset.csv">CSV data</a></div></div>

<div class="rs-kpis">
  ${kpi(num(totals.jobs), 'vacancies')}
  ${kpi(pct(jobs.payShare), 'state the pay')}
  ${kpi(jobs.pay.median ? rub(jobs.pay.median) : '—', 'median monthly pay')}
  ${kpi(num(totals.gigs), 'freelance orders')}
  ${kpi(gigs.budget.median ? rub(gigs.budget.median) : '—', 'median order budget')}
  ${kpi(num(totals.companies), 'employers')}
</div>
<p class="small muted">Pay is in Russian roubles a month (₽${num(Math.round(RUB_PER.USD!))} ≈ $1 at the reference rate).</p>

${findings.length ? `<section class="rs-section">
  <h2>Key findings</h2>
  <ul class="rs-findings">${findings.map((f) => `<li><span>${escapeHtml(f.text)}</span>${quoteButton(f.quote)}</li>`).join('')}</ul>
  <p class="muted small">Each quote names the source, the period and the sample. Please link to ${escapeHtml(`${baseUrl}${path}`)}.</p>
</section>` : ''}

<section class="rs-section"><h2>Pay by role</h2>
  <p class="muted small">Vacancies in roubles that state the pay, a month. The role comes from the vacancy title.</p>
  ${rangeChart(translate(jobs.byRole.filter((s) => s.key !== 'other'), ROLE_EN))}</section>
<section class="rs-section"><h2>By seniority</h2>${rangeChart(translate(jobs.byGrade, GRADE_EN))}</section>
<section class="rs-section"><h2>By programming language</h2>${rangeChart(jobs.byLanguage)}</section>
<section class="rs-section"><h2>Location and remote work</h2>${rangeChart(translate(jobs.byRegion, REGION_EN))}
  <p class="small"><b>${pct(jobs.remote.share)}</b> of vacancies allow remote work.${jobs.remote.remote.median && jobs.remote.office.median ? ` Median: ${rub(jobs.remote.remote.median)} remote, ${rub(jobs.remote.office.median)} on site.` : ''}</p></section>
<section class="rs-section"><h2>Skills</h2>${rangeChart(jobs.skills.map((s) => ({ label: s.skill, pay: s.pay })))}</section>
<section class="rs-section"><h2>AI in vacancies</h2>
  <p class="small">Neural networks, LLMs, GPT, Cursor, Copilot or machine learning appear in <b>${pct(jobs.ai.share)}</b> of vacancies.</p>
  ${rangeChart([{ label: 'Mention AI', pay: jobs.ai.with }, { label: 'Do not', pay: jobs.ai.without }])}</section>
${jobs.companies.length ? `<section class="rs-section"><h2>Who hires most</h2>${countBars(jobs.companies.slice(0, 12).map((c) => ({ label: c.name, n: c.n })))}</section>` : ''}
<section class="rs-section"><h2>Freelance order budgets</h2>
  <p class="small"><b>${pct(gigs.budgetShare)}</b> of orders state a budget, for the whole project.</p>
  ${rangeChart(translate(gigs.byCategory.filter((s) => s.key !== 'other'), ROLE_EN))}</section>
${intlMedian ? `<section class="rs-section"><h2>International remote vacancies</h2>
  <p class="small">English-language vacancies from international boards and company career pages (${num(totals.intlJobs ?? 0)}): a median of <b>$${num(rubMonthToUsdYear(intlMedian))} a year</b> (n = ${jobs.intl.n}). They stay out of the main figures above.</p></section>` : ''}
<section class="rs-section"><h2>Where the data comes from</h2>
  ${countBars(totals.platforms.slice(0, 12).map((p) => ({ label: p.key, n: p.n })))}
  ${totals.payOrigins && Object.keys(totals.payOrigins).length ? `<p class="small">Where the pay was read: ${Object.entries(totals.payOrigins).map(([o, n]) => `${escapeHtml(ORIGIN_EN[o] ?? o)} — ${num(n)}`).join(', ')}.</p>` : ''}</section>

<section class="rs-section prose"><h2>How to cite</h2>
  <p>openradar data is open under ${LICENSE}: use it in articles and research with a link to the source.</p>
  <p class="rs-cite"><code>${escapeHtml(cite)}</code> ${quoteButton(cite)}</p>
  <ul>
    <li><a href="/en/research/methodology">Methodology</a>: sources, how pay is read, what is left out.</li>
    <li><a href="/research/dataset.csv">Vacancies and orders (CSV)</a>, without texts or contacts.</li>
    <li><a href="${isLive ? '/research/report.json' : `/research/${escapeHtml(report.period.slug ?? '')}.json`}">This report as JSON</a>.</li>
    <li>Need a cut for your topic? <a href="${REPO_URL}/issues" target="_blank" rel="noopener">Ask on GitHub</a>.</li>
  </ul>
  ${snapshots.length ? `<h2>Monthly reports</h2><div class="chip-links">${snapshots.map((s) => `<a href="/en/research/${escapeHtml(s.period)}">${escapeHtml(new Date(`${s.period}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }))}</a>`).join('')}</div>` : ''}
</section>`;
  const dataset = {
    '@context': 'https://schema.org',
    '@type': 'Dataset',
    name: title,
    description: `Pay and budgets in Russian-language IT vacancies and freelance orders: ${label}. Medians and quartiles by role, seniority, language, city and skill.`,
    url: `${baseUrl}${path}`,
    inLanguage: 'en',
    license: 'https://creativecommons.org/licenses/by/4.0/',
    creator: { '@type': 'Organization', name: 'openradar', url: `${baseUrl}/` },
    temporalCoverage: `${report.period.from.slice(0, 10)}/${report.period.to.slice(0, 10)}`,
    distribution: [{ '@type': 'DataDownload', encodingFormat: 'text/csv', contentUrl: `${baseUrl}/research/dataset.csv` }],
  };
  const description = jobs.pay.median
    ? `Median pay in Russian-language IT vacancies: ${rub(jobs.pay.median)} a month; ${pct(jobs.payShare)} state the pay. By role, seniority, language and city; freelance budgets. ${label}.`
    : `Pay in Russian-language IT vacancies and freelance orders, by openradar: ${label}.`;
  return layout({
    title,
    version,
    active: 'research',
    body,
    lang: 'en',
    auth: options.auth,
    script: QUOTE_SCRIPT,
    head: `${enHead(description, `${baseUrl}${path}`, ruPath, baseUrl)}
<script type="application/ld+json">${jsonForScript(dataset)}</script>`,
  });
}

function headlineEn(s: IndexSeries, what: string): string {
  const latest = s.latest;
  const dm = (d: string): string => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  if (latest?.index !== undefined) {
    return kpi(num(latest.index), `${what}: index on ${dm(latest.date)}${s.weekChange !== undefined ? `, ${s.weekChange > 0 ? '+' : ''}${s.weekChange}% a week` : ''}`);
  }
  return kpi(num(latest?.count ?? 0), `${what} on ${latest ? dm(latest.date) : '—'}; the index needs 7 days of data`);
}

export function renderIndexPageEn(options: { index: OpenradarIndex; baseUrl: string; version: string; auth?: AuthDisplay }): string {
  const { index, baseUrl, version } = options;
  const roles = index.roles.filter((r) => r.latest?.index !== undefined);
  const baseNote = index.base.provisional
    ? `The base is provisional for now: the mean of every day since 27 October (${index.base.days} days). The final base is 2–29 November 2026; it is fixed on 30 November and the values are recalculated.`
    : `The base is the mean number of posts a day over 2–29 November 2026 (${index.base.days} days) = 100.`;
  const body = `<nav class="crumbs" aria-label="Breadcrumbs"><a href="/">openradar</a> / <a href="/en/research">Research</a> / Index</nav>
<div class="page-head"><div><h1>The openradar index</h1><p class="muted small">How many new vacancies and freelance orders appear in Russian-language IT and freelance each day, against a base of 100.</p></div>
<div class="actions"><a class="btn ghost" href="/research/index.csv">CSV</a><a class="btn ghost" href="/research/index.json">JSON</a></div></div>
<div class="rs-kpis">${headlineEn(index.jobs, 'Vacancies')}${headlineEn(index.gigs, 'Orders')}</div>
<p class="small muted">${escapeHtml(baseNote)}</p>
<section class="rs-section"><h2>Vacancies</h2><p class="small">Panel boards: ${escapeHtml(index.panel.job.join(', '))}.</p>${lineChart(index.jobs.points, 'openradar vacancy index', 'en')}</section>
<section class="rs-section"><h2>Freelance orders</h2><p class="small">Panel boards: ${escapeHtml(index.panel.gig.join(', '))}.</p>${lineChart(index.gigs.points, 'openradar order index', 'en')}</section>
${roles.length ? `<section class="rs-section"><h2>By role</h2><table class="table"><thead><tr><th>Role</th><th>Index</th><th>Week</th><th>A day in the base</th></tr></thead><tbody>
${roles.map((r) => `<tr><td>${escapeHtml(ROLE_EN[r.slug] ?? r.label)}</td><td>${num(r.latest!.index!)}</td><td>${r.weekChange !== undefined ? `${r.weekChange > 0 ? '+' : ''}${r.weekChange}%` : '—'}</td><td>${num(r.base)}</td></tr>`).join('')}
</tbody></table></section>` : ''}
<section class="rs-section prose"><h2>How the index works</h2><ul>
  <li>It counts new Russian-language vacancies and orders published each day on a fixed panel of boards. Sources added later never enter it: it follows the market, not our coverage.</li>
  <li>A day's value is the mean of the last seven days. The index is that mean divided by the mean of the base period, times 100.</li>
  <li>Posts flagged as junk or scam, and those the model is sure are not posts, are not counted. The last two days are recalculated as late posts arrive.</li>
</ul><p>Details are in the <a href="/en/research/methodology#index">methodology</a>. Open data under ${LICENSE}. Cite as: openradar, “The openradar index”. ${escapeHtml(baseUrl)}/en/research/index</p></section>`;
  return layout({
    title: 'The openradar index: vacancies and freelance orders in Russia',
    version,
    active: 'research',
    body,
    lang: 'en',
    auth: options.auth,
    head: enHead('The daily openradar index: new vacancies and freelance orders in Russian-language IT against a base of 100. Open data, CC BY 4.0.', `${baseUrl}/en/research/index`, '/research/index', baseUrl),
  });
}

export function renderMethodologyPageEn(options: { baseUrl: string; version: string; auth?: AuthDisplay }): string {
  const { baseUrl, version } = options;
  const rates = Object.entries(RUB_PER).map(([code, v]) => `${code} ${v}`).join(', ');
  const body = `<nav class="crumbs" aria-label="Breadcrumbs"><a href="/">openradar</a> / <a href="/en/research">Research</a> / Methodology</nav>
<div class="page-head"><div><h1>Methodology</h1><p class="muted small">How openradar counts pay and budgets.</p></div></div>
<section class="prose" style="margin-top:0">
  <h2>What is measured</h2>
  <p>openradar research shows what employers and clients offer: the pay stated in published vacancies and orders. It is neither what people take home nor a survey. Such data shows the hiring market as it is now and how it changes month to month.</p>
  <h2>Sources</h2>
  <p>Vacancies and orders published in the period on hh.ru, Habr Career, the state portal «Работа России», getmatch, FL.ru, Kwork, Freelancehunt, Telegram channels, international boards and company career pages (the public job-board APIs of Greenhouse, Lever and Ashby), and posts added by participants. A post on several boards counts once: openradar merges duplicates by link, text and similarity. Posts flagged as junk or scam are left out.</p>
  <h2>Russian-language and international market</h2>
  <p>The main figures describe the Russian-language market: posts written mostly in Cyrillic. English-language vacancies are shown in a section of their own and do not enter the shares, medians or employer lists of the main part.</p>
  <h2>How pay is read</h2>
  <ul>
    <li>First the vacancy page markup (schema.org JobPosting), then the post text, then the budget the board states.</li>
    <li>Only sums next to a currency or words like «оклад», «зарплата» count: «3–5 years of experience» never becomes pay.</li>
    <li>A range gives its middle; a single bound («from ₽150,000») gives itself. Yearly sums are divided by 12; hourly rates stay out of the monthly figures.</li>
    <li>Currencies are converted to roubles at a reference rate: ${escapeHtml(rates)}.</li>
    <li>Values below ₽12,000 or above ₽3,000,000 a month are parsing errors and dropped.</li>
  </ul>
  <h2 id="index">The openradar index</h2>
  <p>The index shows how many new vacancies and orders appear each day against a base of 100. Only Russian-language posts on a fixed panel count: vacancies on hh.ru, Habr Career, getmatch and «Работа России»; orders on Kwork, FL.ru and Freelancehunt. A day's value is the seven-day mean. The base is the mean daily count over 2–29 November 2026; until 30 November it is provisional and covers every day since 27 October. The last two days are recalculated as late posts arrive.</p>
  <h2>Language model</h2>
  <p>Some posts are free text («pay 50k», «need a mid-level Python dev»). A language model reads them and returns a strict set of fields. It only fills gaps: page markup, rules and the board's budget always win. Answers below 70% confidence are dropped, and the model enters the figures only once it agrees with the rules on at least 85% of role and pay on 30+ comparisons.</p>
  <h2>Limits</h2>
  <ul>
    <li>Not every vacancy states the pay; the share is shown in each report.</li>
    <li>Whether a sum is before or after tax is not always stated, so the two are not separated.</li>
    <li>A freelance budget is the client's estimate before negotiation.</li>
  </ul>
  <h2>Data</h2>
  <p>Open under ${LICENSE}. The <a href="/research/dataset.csv">CSV</a> has a row per post with derived fields only: date, board, role, seniority, language, city, company, pay in roubles, skills and market scope.</p>
</section>`;
  return layout({
    title: 'Methodology of openradar research',
    version,
    active: 'research',
    body,
    lang: 'en',
    auth: options.auth,
    head: enHead('How openradar counts pay and budgets: sources, pay parsing, roles and seniority, medians, the index and sample thresholds.', `${baseUrl}/en/research/methodology`, '/research/methodology', baseUrl),
  });
}
