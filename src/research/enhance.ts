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
.rs-formula-card {
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface);
  padding: 14px 16px;
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
  display: inline-flex;
  align-items: center;
  border: 1px solid var(--line);
  border-radius: 9999px;
  padding: 2px;
  background: var(--surface);
  gap: 2px;
}
.rs-theme-btn {
  border: none;
  background: transparent;
  color: var(--muted);
  border-radius: 9999px;
  padding: 3px 9px;
  font-size: 11px;
  font-family: inherit;
  cursor: pointer;
  line-height: 1.3;
  transition: background 0.15s ease, color 0.15s ease;
}
.rs-theme-btn[aria-pressed="true"] {
  background: var(--ink);
  color: var(--bg);
  font-weight: 600;
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
    auto: en ? 'Auto' : 'Авто',
    light: en ? 'Light' : 'Светлая',
    dark: en ? 'Dark' : 'Тёмная',
    themeAria: en ? 'Color theme' : 'Цветовая тема',
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

  // 2. Native pill theme switcher inside .page-head .actions
  var actions = document.querySelector('.page-head .actions');
  if (actions && !document.querySelector('.rs-theme-group')) {
    var group = document.createElement('div');
    group.className = 'rs-theme-group';
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', L.themeAria);
    var current = 'auto';
    try {
      var saved = localStorage.getItem('openradar-theme');
      if (saved === 'light' || saved === 'dark') current = saved;
    } catch (e) {}

    [['auto', L.auto], ['light', L.light], ['dark', L.dark]].forEach(function(pair) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'rs-theme-btn';
      btn.textContent = pair[1];
      btn.setAttribute('data-theme-choice', pair[0]);
      btn.setAttribute('aria-pressed', String(current === pair[0]));
      btn.addEventListener('click', function() {
        var mode = pair[0];
        if (mode === 'auto') {
          document.documentElement.removeAttribute('data-theme');
          try { localStorage.removeItem('openradar-theme'); } catch (e) {}
        } else {
          document.documentElement.setAttribute('data-theme', mode);
          try { localStorage.setItem('openradar-theme', mode); } catch (e) {}
        }
        group.querySelectorAll('.rs-theme-btn').forEach(function(b) {
          b.setAttribute('aria-pressed', String(b.getAttribute('data-theme-choice') === mode));
        });
      });
      group.appendChild(btn);
    });
    actions.appendChild(group);
  }

  // 3. Wrap wide tables inside .rs-table-scroll for zero horizontal page overflow on mobile
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
