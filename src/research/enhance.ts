import type { SupportedLang } from '../server/i18n.ts';

/**
 * Early theme bootstrap for research pages: respects user choice in localStorage
 * ('openradar-theme': 'light' | 'dark' | 'auto') without flash before first paint.
 */
export const RESEARCH_ENHANCE_HEAD = `<script>(function(){try{var t=localStorage.getItem('openradar-theme');if(t==='light'||t==='dark'){document.documentElement.setAttribute('data-theme',t);}}catch(e){}})();</script>`;

const ENHANCE_STYLE = `<style id="rs-enhance-style">
/* Native OpenRadar research enhancements: stays 100% inside Zinc + Emerald tokens & native radii */
#rs-progress {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 2px;
  z-index: 60;
  pointer-events: none;
  background: transparent;
}
#rs-progress-bar {
  height: 100%;
  width: 100%;
  background: var(--emerald);
  transform: scaleX(0);
  transform-origin: left center;
  will-change: transform;
}
.page-head {
  flex-wrap: wrap;
}
.page-head > div:first-child {
  flex: 1 1 320px;
  min-width: 0;
}
@media (max-width: 700px) {
  .page-head > div:first-child {
    flex: 0 1 auto;
  }
}
.page-head .actions {
  flex-wrap: wrap;
  align-items: center;
}
.rs-section-head {
  flex-wrap: wrap;
}
.rs-table-scroll {
  width: 100%;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}
.rs-table-scroll > table {
  width: 100%;
  min-width: 520px;
}
.rs-table-scroll > table th:first-child,
.rs-table-scroll > table td:first-child {
  position: sticky;
  left: 0;
  z-index: 2;
  background: var(--bg);
  box-shadow: 1px 0 0 var(--line);
}
.rs-table-scroll > table td {
  white-space: nowrap;
}
.rs-table-scroll > table td:first-child,
.rs-table-scroll > table td.small.muted {
  white-space: normal;
  min-width: 150px;
}
.rs-jump-nav {
  position: sticky;
  top: 0;
  z-index: 30;
  display: flex;
  gap: 6px;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
  padding: 8px 0;
  margin: 12px 0 4px;
  background: var(--bg);
  border-bottom: 1px solid var(--line);
}
.rs-jump-nav::-webkit-scrollbar {
  display: none;
}
.rs-jump-chip {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  padding: 4px 6px;
  border-radius: 4px;
  border: none;
  background: transparent;
  color: var(--muted);
  font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  font-size: 12px;
  font-weight: 500;
  text-decoration: none;
  white-space: nowrap;
  transition: color 0.15s ease, background 0.15s ease;
}
.rs-jump-chip:hover {
  color: var(--ink);
  background: var(--surface-hover, var(--soft));
  text-decoration: none;
}
details.rs-academic-fold {
  margin-top: 16px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface);
  padding: 10px 14px;
}
details.rs-academic-fold > summary {
  cursor: pointer;
  font-weight: 600;
  font-size: 13.5px;
  color: var(--ink);
  list-style: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
details.rs-academic-fold > summary::-webkit-details-marker {
  display: none;
}
details.rs-academic-fold > summary::after {
  content: '↓ Развернуть таблицы';
  font-size: 11.5px;
  font-weight: 500;
  color: var(--emerald);
  white-space: nowrap;
}
html[lang="en"] details.rs-academic-fold > summary::after {
  content: '↓ Expand tables';
}
details.rs-academic-fold[open] > summary {
  padding-bottom: 10px;
  margin-bottom: 10px;
  border-bottom: 1px solid var(--line);
}
details.rs-academic-fold[open] > summary::after {
  content: '↑ Свернуть';
  color: var(--muted);
}
html[lang="en"] details.rs-academic-fold[open] > summary::after {
  content: '↑ Collapse';
}
.rs-formula-card {
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface);
  padding: 14px 16px;
  min-width: 0;
  overflow: hidden;
}
.rs-formula-math {
  overflow-x: auto;
  padding: 12px 10px;
  margin-top: 8px;
  background: var(--bg);
  border: 1px solid var(--line);
  border-radius: 6px;
  font-size: 15px;
}
.rs-theme-group {
  display: none;
}
#rs-tt {
  position: fixed;
  z-index: 80;
  pointer-events: none;
  display: none;
  background: var(--ink);
  color: var(--bg);
  border: 1px solid var(--line-strong);
  border-radius: 8px;
  padding: 6px 10px;
  font-size: 12px;
  line-height: 1.4;
  max-width: 280px;
  font-variant-numeric: tabular-nums;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.16);
}
.rs-data-toggle-wrap {
  margin-top: 8px;
  display: flex;
  justify-content: flex-end;
}
@media (max-width: 640px) {
  .rs-table-scroll > table th {
    white-space: normal;
  }
  .rs-table-scroll > table td:first-child {
    max-width: 145px;
    min-width: 125px;
  }
  /* Mobile layout fixes: section heads stack, charts and cards breathe. */
  .rs-section-head {
    flex-direction: column;
    align-items: stretch;
  }
  .rs-head-actions {
    flex-wrap: wrap;
  }
  .rs-bump-box {
    padding: 8px;
  }
  .rs-hist {
    height: 140px;
  }
  .page-head {
    align-items: flex-start;
  }
  .rs-kpi b {
    font-size: 18px;
  }
}
/* Long tokens (ids, formula names, URLs) must never stretch a page sideways. */
h1, h2, h3 {
  overflow-wrap: break-word;
}
.rs-formula-math code, td code, li code {
  overflow-wrap: anywhere;
}
@media (prefers-reduced-motion: reduce) {
  #rs-progress-bar {
    transition: none !important;
  }
}
</style>`;

/**
 * Progressive-enhancement bundle for /research, /en/research, /research/methodology,
 * /research/index, and /research/roles/:slug. Preserves OpenRadar's native header,
 * Zinc + Emerald palette, 8px cards and pill controls.
 */
export function renderResearchEnhancements(lang: SupportedLang = 'ru'): string {
  const en = lang === 'en';
  const labels = JSON.stringify({
    showTable: en ? 'Show data table ↓' : 'Показать таблицу данных ↓',
    hideTable: en ? 'Hide data table ↑' : 'Скрыть таблицу ↑',
  });

  return `${ENHANCE_STYLE}
<div id="rs-progress" aria-hidden="true"><div id="rs-progress-bar"></div></div>
<div id="rs-tt" role="status" aria-live="polite"></div>
<script>(function(){
  var L = ${labels};
  // 1. Reading progress bar (2px emerald)
  var bar = document.getElementById('rs-progress-bar');
  var raf = 0;
  function updateProgress() {
    raf = 0;
    if (!bar) return;
    var doc = document.documentElement;
    var max = Math.max(1, doc.scrollHeight - window.innerHeight);
    var p = Math.min(1, Math.max(0, window.scrollY / max));
    bar.style.transform = 'scaleX(' + p.toFixed(4) + ')';
  }
  function onScroll() { if (!raf) raf = requestAnimationFrame(updateProgress); }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  updateProgress();

  // 2. Wrap wide tables inside .rs-table-scroll for zero horizontal page overflow on mobile
  document.querySelectorAll('table.table').forEach(function(tbl) {
    if (tbl.parentElement && (tbl.parentElement.classList.contains('rs-table-scroll') || tbl.parentElement.style.overflowX === 'auto')) {
      tbl.parentElement.classList.add('rs-table-scroll');
      return;
    }
    var wrap = document.createElement('div');
    wrap.className = 'rs-table-scroll';
    tbl.parentNode.insertBefore(wrap, tbl);
    wrap.appendChild(tbl);
  });

  // 4. Native floating tooltip for SVG charts with <title>
  var tt = document.getElementById('rs-tt');
  if (tt) {
    document.querySelectorAll('svg [data-tip], svg title').forEach(function(el) {
      var target = el.tagName.toLowerCase() === 'title' ? el.parentElement : el;
      if (!target || target.getAttribute('data-rs-bound')) return;
      var text = el.tagName.toLowerCase() === 'title' ? (el.textContent || '').trim() : (el.getAttribute('data-tip') || '').trim();
      if (!text) return;
      if (el.tagName.toLowerCase() === 'title') el.textContent = '';
      target.setAttribute('data-rs-bound', '1');
      target.setAttribute('data-rs-tip', text);
      target.style.cursor = 'pointer';
      target.addEventListener('pointerenter', function(ev) {
        tt.textContent = text;
        tt.style.display = 'block';
        moveTip(ev);
      });
      target.addEventListener('pointermove', moveTip);
      target.addEventListener('pointerleave', function() { tt.style.display = 'none'; });
    });
  }
  function moveTip(ev) {
    if (!tt || tt.style.display !== 'block') return;
    var r = tt.getBoundingClientRect();
    var pad = 12;
    var left = ev.clientX + 14;
    var top = ev.clientY - r.height - 12;
    if (left + r.width > window.innerWidth - pad) left = Math.max(pad, ev.clientX - r.width - 14);
    if (top < pad) top = Math.min(window.innerHeight - r.height - pad, ev.clientY + 16);
    tt.style.left = left + 'px';
    tt.style.top = top + 'px';
  }

  // 5. Keyboard navigation between sections (J / K / Escape)
  document.addEventListener('keydown', function(ev) {
    var tag = (ev.target && ev.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || ev.metaKey || ev.ctrlKey || ev.altKey) return;
    if (ev.key === 'Escape' && tt) { tt.style.display = 'none'; return; }
    var k = ev.key.toLowerCase();
    if (k !== 'j' && k !== 'k') return;
    var secs = Array.prototype.slice.call(document.querySelectorAll('.rs-section, main h2'));
    if (!secs.length) return;
    var y = window.scrollY + 80;
    var idx = 0;
    for (var i = 0; i < secs.length; i++) {
      if (secs[i].getBoundingClientRect().top + window.scrollY <= y) idx = i;
    }
    var next = Math.max(0, Math.min(secs.length - 1, idx + (k === 'j' ? 1 : -1)));
    secs[next].scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
})();</script>`;
}
