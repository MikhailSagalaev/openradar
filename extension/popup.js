/**
 * openradar extension: popup (send the page, market estimate, connection settings).
 */

const fields = {
  contributor: document.getElementById('contributor'),
  base: document.getElementById('base'),
  sourceId: document.getElementById('sourceId'),
  token: document.getElementById('token'),
  status: document.getElementById('status'),
  send: document.getElementById('send'),
  pageTitle: document.getElementById('page-title'),
  pageUrl: document.getElementById('page-url'),
  jobChip: document.getElementById('job-chip'),
  selectionSnippet: document.getElementById('selection-snippet'),
  details: document.getElementById('settings-details'),
  testBtn: document.getElementById('test-connection'),
  marketBase: document.getElementById('marketBase'),
  estimate: document.getElementById('estimate'),
  marketResult: document.getElementById('market-result'),
  xraySection: document.getElementById('xray-section'),
  xrayTarget: document.getElementById('xray-target'),
  xrayButtons: document.getElementById('xray-buttons'),
  xrayPitchText: document.getElementById('xray-pitch-text'),
  xrayCopyPitch: document.getElementById('xray-copy-pitch'),
};

/** The hub answers market estimates; any openradar server with priced leads can. */
const DEFAULT_MARKET_BASE = 'https://openradar.fun';

function normalizeBase(value) {
  return value.trim().replace(/\/+$/, '');
}

function setStatus(message, kind = '') {
  fields.status.textContent = message;
  fields.status.className = `status ${kind}`.trim();
}

function getSelectedType() {
  const selected = document.querySelector('input[name="leadType"]:checked');
  return selected ? selected.value : 'gig';
}

function setSelectedType(type) {
  const radio = document.querySelector(`input[name="leadType"][value="${type}"]`);
  if (radio) {
    radio.checked = true;
  }
}

async function loadConfig() {
  const stored = await chrome.storage.local.get('radarConfig');
  const config = stored.radarConfig ?? {};
  fields.contributor.value = config.contributor ?? '';
  fields.base.value = config.base ?? 'http://127.0.0.1:8787';
  fields.sourceId.value = config.sourceId ?? '';
  fields.token.value = config.token ?? '';

  const market = await chrome.storage.local.get('radarMarketBase');
  fields.marketBase.value = market.radarMarketBase ?? DEFAULT_MARKET_BASE;

  return config;
}

async function readConfig() {
  return {
    contributor: fields.contributor.value.trim(),
    base: normalizeBase(fields.base.value),
    sourceId: fields.sourceId.value.trim(),
    token: fields.token.value.trim(),
  };
}

async function saveConfig(event) {
  event?.preventDefault();
  const config = await readConfig();
  if (!config.base || !config.sourceId || !config.token) {
    setStatus(t('errFillNode'), 'err');
    return;
  }
  await chrome.storage.local.set({ radarConfig: config });
  setStatus(t('settingsSaved'), 'ok');
  fields.details.open = false;
}

async function testConnection() {
  const base = normalizeBase(fields.base.value);
  if (!base) {
    setStatus(t('errServerAddress'), 'err');
    return;
  }
  fields.testBtn.disabled = true;
  setStatus(t('checking'));
  try {
    const res = await fetch(`${base}/api/ping`, { method: 'GET' });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const data = await res.json().catch(() => null);
    const ver = data?.version ? ` (v${data.version})` : '';
    setStatus(t('serverOk', [ver]), 'ok');
  } catch (err) {
    setStatus(t('errConnect', [err.message]), 'err');
  } finally {
    fields.testBtn.disabled = false;
  }
}

async function readPage() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error(t('errNoTab'));

  try {
    const response = await chrome.tabs.sendMessage(tab.id, { type: 'EXTRACT_PAGE_DATA' });
    if (response) return response;
  } catch {}

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content.js'],
    });
    const response = await chrome.tabs.sendMessage(tab.id, { type: 'EXTRACT_PAGE_DATA' });
    if (response) return response;
  } catch {}

  const [result] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => {
      const description =
        document.querySelector('meta[name="description"]')?.getAttribute('content') ||
        document.querySelector('meta[property="og:description"]')?.getAttribute('content') ||
        '';
      return {
        title: document.title,
        url: location.href,
        selection: String(window.getSelection() ?? '').trim().slice(0, 4000),
        description,
        jobPosting: null,
        detectedType: 'gig',
      };
    },
  });
  return result?.result;
}

/** Line icons in the text colour: the extension has no emoji. */
const ICON_PATHS = {
  briefcase: 'M4 7h16v13H4zM9 7V4h6v3',
  send: 'M22 2 11 13M22 2l-7 20-4-9-9-4z',
  file: 'M14 2H6v20h12V6zM14 2v4h4M9 13h6M9 17h6',
  code: 'm8 6-6 6 6 6M16 6l6 6-6 6',
};

function lineIcon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  for (const [key, value] of Object.entries({ width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' })) {
    svg.setAttribute(key, String(value));
  }
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', ICON_PATHS[name] ?? '');
  svg.append(path);
  return svg;
}

let cachedPage = null;

async function initPreview() {
  try {
    const page = await readPage();
    cachedPage = page;
    if (page) {
      if (page.jobPosting) {
        setSelectedType('job');
        const jp = page.jobPosting;
        fields.pageTitle.textContent = jp.title || page.title;

        const details = [];
        if (jp.company) details.push(jp.company);
        if (jp.city) details.push(jp.city);
        if (jp.isRemote) details.push(t('remote'));
        if (typeof jp.budget === 'number') {
          const cur = jp.currency === 'RUB' ? '₽' : jp.currency;
          details.push(`${jp.budget.toLocaleString(uiLocale())} ${cur}`);
        }

        if (details.length) {
          fields.jobChip.textContent = details.join(' · ');
          fields.jobChip.style.display = 'inline-block';
        }
      } else {
        fields.pageTitle.textContent = page.title || t('untitledTab');
        fields.jobChip.style.display = 'none';
      }

      fields.pageUrl.textContent = page.url ? new URL(page.url).hostname : '';

      if (page.selection) {
        fields.selectionSnippet.textContent = t('selection', [String(page.selection.length), `${page.selection.slice(0, 160)}${page.selection.length > 160 ? '...' : ''}`]);
        fields.selectionSnippet.style.display = 'block';
      } else {
        fields.selectionSnippet.style.display = 'none';
      }

      initXRay(page);
    }
  } catch {
    fields.pageTitle.textContent = t('currentPage');
  }
}

function initXRay(page) {
  if (!fields.xraySection || !window.openRadarXRay) return;

  const jp = page?.jobPosting;
  let company = jp?.company;
  const role = jp?.title || page?.title || '';
  const skills = jp?.skills || [];

  if (!company && page?.url) {
    try {
      const u = new URL(page.url);
      const host = u.hostname.replace(/^www\./i, '');
      const genericBoards = ['hh.ru', 'habr.com', 'career.habr.com', 'linkedin.com', 'fl.ru', 'kwork.ru', 'remoteok.com'];
      if (!genericBoards.includes(host)) {
        company = host.split('.')[0];
      }
    } catch {}
  }

  if (!company && page?.title) {
    const match = page.title.match(/(?:в\s+компани[юие]|в|at)\s+["'«»]?([A-Za-zА-Яа-я0-9\s._-]{2,40})["'«»]?/i);
    if (match && match[1]) {
      company = match[1].trim();
    }
  }

  if (!company) {
    fields.xraySection.hidden = true;
    return;
  }

  const plan = window.openRadarXRay.buildXRayPlan(company, role, skills, uiLanguage());
  fields.xrayTarget.textContent = plan.cleanCompany || plan.company;
  fields.xrayButtons.innerHTML = '';

  for (const dork of plan.dorks) {
    const link = document.createElement('a');
    link.className = 'xray-link-btn';
    link.href = dork.url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';

    const icon = document.createElement('span');
    icon.className = 'xray-link-icon';
    icon.append(lineIcon(dork.icon));

    const label = document.createElement('span');
    label.className = 'xray-link-label';
    label.textContent = dork.title;

    const arrow = document.createElement('span');
    arrow.className = 'xray-link-arrow';
    arrow.textContent = '↗';

    link.appendChild(icon);
    link.appendChild(label);
    link.appendChild(arrow);
    fields.xrayButtons.appendChild(link);
  }

  fields.xrayPitchText.value = plan.outreachTemplate;
  fields.xraySection.hidden = false;
}

async function sendPage() {
  const account = await getAccount();
  const config = await readConfig();
  const toNode = !account && config.base && config.sourceId && config.token;
  if (!account && !toNode) {
    setStatus(t('errNotSignedIn'), 'err');
    return;
  }

  fields.send.disabled = true;
  setStatus(t('sending'));
  try {
    const page = (await readPage()) || cachedPage;
    if (!page) throw new Error(t('errReadPage'));

    const selectedType = getSelectedType();
    const text = page.selection || page.jobPosting?.description || page.description || page.title;
    if (!text) throw new Error(t('errNoText'));

    const payload = {
      type: selectedType,
      title: (selectedType === 'job' && page.jobPosting?.title) || page.title,
      text,
      url: page.url,
      externalId: `browser:${page.url}`,
    };
    // On your own node the author is whoever you set; on the hub it is your GitHub account.
    if (toNode) payload.author = config.contributor ? `${config.contributor} (community)` : 'Community Extension';

    if (page.jobPosting) {
      if (page.jobPosting.city) payload.city = page.jobPosting.city;
      if (typeof page.jobPosting.budget === 'number') payload.budget = page.jobPosting.budget;
      if (page.jobPosting.currency) payload.currency = page.jobPosting.currency;
      if (page.jobPosting.skills?.length) payload.skills = page.jobPosting.skills;
      if (typeof page.jobPosting.isRemote === 'boolean') payload.isRemote = page.jobPosting.isRemote;
      if (page.jobPosting.company) {
        payload.metadata = { company: page.jobPosting.company };
      }
    }

    const base = account ? account.base : config.base;
    const response = account
      ? await fetch(`${base}/api/ext/submit`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${account.token}` },
          body: JSON.stringify(payload),
        })
      : await fetch(`${base}/api/ingest/${encodeURIComponent(config.sourceId)}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-radar-token': config.token },
          body: JSON.stringify(payload),
        });

    if (response.status === 401 && account) {
      await chrome.storage.local.remove('radarAccount');
      renderAccount(null);
      throw new Error(t('errSessionExpired'));
    }
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(errText.slice(0, 160) || `HTTP ${response.status}`);
    }
    const data = await response.json().catch(() => null);
    const leadId = data?.outcomes?.[0]?.lead?.id || data?.leadId;
    if (leadId) {
      const link = document.createElement('a');
      link.href = `${base}/leads/${encodeURIComponent(leadId)}`;
      link.target = '_blank';
      link.rel = 'noopener';
      link.textContent = t('openLead');
      link.style.cssText = 'color:inherit;text-decoration:underline;display:block;margin-top:6px;font-weight:600';
      fields.status.replaceChildren(document.createTextNode(t('sent')), link);
      fields.status.className = 'status ok';
    } else {
      setStatus(t('sent'), 'ok');
    }
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), 'err');
  } finally {
    fields.send.disabled = false;
  }
}

/** The GitHub-connected account: { base, token, handle } or null. */
async function getAccount() {
  const stored = await chrome.storage.local.get('radarAccount');
  const account = stored.radarAccount;
  return account?.token && account?.base ? account : null;
}

function renderAccount(account) {
  document.getElementById('account-signed-out').hidden = Boolean(account);
  document.getElementById('account-signed-in').hidden = !account;
  if (account) {
    document.getElementById('account-handle').textContent = `@${account.handle}`;
    document.getElementById('account-host').textContent = new URL(account.base).hostname;
  }
}

/**
 * GitHub sign-in on the hub,
 * in a tab that the hub sends back to the extension's connected.html, which closes itself.
 */
async function signIn() {
  const base = normalizeBase(fields.marketBase.value) || DEFAULT_MARKET_BASE;
  const back = chrome.runtime.getURL('connected.html');
  await chrome.tabs.create({ url: `${base}/extension/connect?redirect_uri=${encodeURIComponent(back)}` });
  window.close();
}

async function signOut() {
  const account = await getAccount();
  if (account) {
    // Revoke on the server too; the local copy goes away even if the hub is unreachable.
    fetch(`${account.base}/api/ext/token`, { method: 'DELETE', headers: { authorization: `Bearer ${account.token}` } }).catch(() => {});
  }
  await chrome.storage.local.remove('radarAccount');
  renderAccount(null);
  setStatus(t('signedOut'), '');
}

function formatMoney(value, currency) {
  const sign = { RUB: '₽', USD: '$', EUR: '€' }[currency] ?? currency;
  return `${Math.round(value).toLocaleString(uiLocale())} ${sign}`;
}

function marketLine(className, text) {
  const el = document.createElement('div');
  el.className = className;
  el.textContent = text;
  return el;
}

/** Pay on this page against the market range, in the same currency when we can tell it. */
function compareWithPage(estimate, page) {
  const budget = page?.jobPosting?.budget;
  if (typeof budget !== 'number' || !estimate.rub || !estimate.usd) return null;
  const currency = page.jobPosting.currency || 'RUB';
  const range = currency === 'USD' ? estimate.usd : currency === 'RUB' ? estimate.rub : null;
  if (!range) return null;
  const verdict = budget < range.p25 ? t('belowMarket') : budget > range.p75 ? t('aboveMarket') : t('inMarket');
  return t('onThisPage', [formatMoney(budget, currency), verdict]);
}

/** Sends only the title, type and skills: no URL, no page text. On the user's click only. */
async function estimateMarket() {
  const page = cachedPage || (await readPage().catch(() => null));
  const title = (page?.jobPosting?.title || page?.title || '').trim();
  if (title.length < 3) {
    setStatus(t('errNoTitle'), 'err');
    return;
  }
  const base = normalizeBase(fields.marketBase.value) || DEFAULT_MARKET_BASE;
  const type = getSelectedType();
  const params = new URLSearchParams({ title: title.slice(0, 300), type });
  if (page?.jobPosting?.skills?.length) params.set('skills', page.jobPosting.skills.slice(0, 12).join(','));

  fields.estimate.disabled = true;
  fields.marketResult.hidden = false;
  fields.marketResult.replaceChildren(marketLine('market-note', t('estimating')));
  try {
    const res = await fetch(`${base}/api/market?${params}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const e = await res.json();
    const nodes = [];
    if ((!e.rub && !e.usd) || e.basis === 'none') {
      nodes.push(marketLine('market-note', t('tooFewBudgets')));
    } else {
      const pageCur = page?.jobPosting?.currency;
      const isUsd = pageCur === 'USD' || (e.usd && !pageCur && !title.match(/[а-яё]/i));
      const range = (isUsd && e.usd) ? e.usd : (e.rub || e.usd);
      const curCode = (isUsd && e.usd) ? 'USD' : 'RUB';
      const per = e.period === 'month' ? t('perMonth') : t('perProject');
      nodes.push(marketLine('market-median', `≈ ${formatMoney(range.median, curCode)}${per}`));
      nodes.push(marketLine('market-range', t('middleHalf', [formatMoney(range.p25, curCode), formatMoney(range.p75, curCode)])));
      const what = e.type === 'job' ? t('ofJobs') : t('ofGigs');
      const basis = e.basis === 'type'
        ? t('basisType', [what, String(e.count)])
        : t('basisSimilar', [String(e.count), what]);
      nodes.push(marketLine('market-note', `${basis} · ${new URL(base).hostname}`));
      const compare = compareWithPage(e, page);
      if (compare) nodes.push(marketLine('market-compare', compare));
      if (e.basis !== 'type' && e.examples?.length) {
        const list = document.createElement('ul');
        list.className = 'market-examples';
        for (const example of e.examples) {
          const item = document.createElement('li');
          const link = document.createElement('a');
          link.href = `${base}/leads/${encodeURIComponent(example.id)}`;
          link.target = '_blank';
          link.rel = 'noopener';
          link.textContent = example.title;
          item.append(link);
          list.append(item);
        }
        nodes.push(list);
      }
    }
    fields.marketResult.replaceChildren(...nodes);
  } catch (error) {
    fields.marketResult.replaceChildren(
      marketLine('market-note', t('errEstimate', [error instanceof Error ? error.message : String(error)])),
    );
  } finally {
    fields.estimate.disabled = false;
  }
}

document.getElementById('config').addEventListener('submit', saveConfig);
fields.send.addEventListener('click', sendPage);
fields.testBtn?.addEventListener('click', testConnection);
fields.estimate.addEventListener('click', estimateMarket);
fields.marketBase.addEventListener('change', () => {
  chrome.storage.local.set({ radarMarketBase: normalizeBase(fields.marketBase.value) || DEFAULT_MARKET_BASE });
});
document.querySelectorAll('input[name="leadType"]').forEach((radio) => {
  radio.addEventListener('change', () => {
    fields.marketResult.hidden = true;
  });
});

/** True when version a is newer than b ("0.9.0" > "0.8.1"). */
function isNewer(a, b) {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d !== 0) return d > 0;
  }
  return false;
}

/**
 * Offers a newer version the hub hands out. A store install asks the browser to update
 * right away (it would also update on its own); an unpacked install links to the download page.
 */
async function checkUpdate() {
  const account = await getAccount();
  const base = account?.base || normalizeBase(fields.marketBase.value) || DEFAULT_MARKET_BASE;
  const res = await fetch(`${base}/api/ext/version`);
  if (!res.ok) return;
  const latest = await res.json();
  const current = chrome.runtime.getManifest().version;
  if (!latest?.version || !isNewer(latest.version, current)) return;

  const self = await chrome.management?.getSelf?.().catch(() => null);
  // Without the management API, fall back to the download page: it works for any install.
  const unpacked = !self || self.installType === 'development';
  document.getElementById('update-text').textContent = t('updateAvailable', [latest.version, current]);
  const button = document.getElementById('update-btn');
  button.textContent = unpacked ? t('download') : t('update');
  button.addEventListener('click', async () => {
    if (unpacked) {
      chrome.tabs.create({ url: latest.url });
      return;
    }
    const { status } = await chrome.runtime.requestUpdateCheck();
    if (status === 'update_available') chrome.runtime.reload();
    else document.getElementById('update-text').textContent = t('updating');
  });
  document.getElementById('update').hidden = false;
}

document.getElementById('sign-in').addEventListener('click', signIn);
document.getElementById('sign-out').addEventListener('click', signOut);

if (fields.xrayCopyPitch) {
  fields.xrayCopyPitch.addEventListener('click', async () => {
    const text = fields.xrayPitchText?.value;
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      const original = fields.xrayCopyPitch.textContent;
      fields.xrayCopyPitch.textContent = t('copied');
      setTimeout(() => {
        fields.xrayCopyPitch.textContent = original;
      }, 1500);
    } catch {}
  });
}

getAccount().then(renderAccount);

loadConfig().catch((error) => setStatus(String(error), 'err'));
initPreview();
checkUpdate().catch(() => {});

// Order boards: boards.js says what exists, the boards say what they offer, collector.js reads them.
const collector = {
  box: document.getElementById('collector'),
  boards: document.getElementById('collector-boards'),
  now: document.getElementById('collector-now'),
  auto: document.getElementById('collector-auto'),
  minutes: document.getElementById('collector-minutes'),
  status: document.getElementById('collector-status'),
};
const collectorLang = () => uiLanguage();
const STALE_RUN_MS = 15 * 60_000;
const CHIPS_FOLDED = 8;
let collectorSettings = { auto: false, minutes: 30, boards: {} };
let collectorData = {};
const openFilters = new Set();
const openBlocks = new Set();

async function saveCollector() {
  await chrome.storage.local.set({ radarCollector: collectorSettings });
  await chrome.runtime.sendMessage({ type: 'collector-schedule' });
}

function collectorAgo(iso) {
  const minutes = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
  if (minutes < 60) return t('collectorAgoMin', [String(minutes)]);
  return t('collectorAgoHour', [String(Math.round(minutes / 60))]);
}

function sessionLine(board) {
  const line = document.createElement('div');
  line.className = 'board-session';
  const state = collectorData.states?.[board.id];
  if (!board.signInNeeded) {
    line.textContent = board.hint[collectorLang()];
    return line;
  }
  if (state === 'signed_out') {
    line.textContent = t('collectorSignedOut');
    const link = document.createElement('a');
    link.href = board.open;
    link.target = '_blank';
    link.textContent = t('collectorSignInLink');
    line.append(' ', link);
    return line;
  }
  line.textContent = state === 'signed_in' ? `${t('collectorSignedIn')}. ${board.hint[collectorLang()]}` : board.hint[collectorLang()];
  return line;
}

function runLine(status) {
  const line = document.createElement('div');
  line.className = 'board-hint';
  if (status.error === 'sign_in') line.textContent = t('collectorSignedOut');
  else if (status.error) line.textContent = t('collectorFailed', [status.error]);
  else line.textContent = t('collectorLast', [collectorAgo(status.at), String(status.found), String(status.inserted)]);
  return line;
}

function textOf(label) {
  return typeof label === 'string' ? label : label[collectorLang()];
}

/** One row of chips: «Все» first, the board's own options after it, folded when long. */
function chipRow(board, title, key, options, chosen) {
  const group = document.createElement('div');
  group.className = 'chips';
  const label = document.createElement('span');
  label.className = 'chips-title';
  label.textContent = title;
  group.append(label);
  const foldKey = `${board.id}:${key}:${title}`;
  const picked = chosen[key] ?? [];
  const own = options.map(([value]) => value);
  const pickedHere = picked.filter((value) => own.includes(value));
  const save = async (next) => {
    collectorSettings.boards[board.id] = { ...chosen, [key]: next };
    await saveCollector();
    renderBoards();
  };
  const chip = (text, on, click) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = on ? 'chip on' : 'chip';
    button.setAttribute('aria-pressed', String(on));
    button.textContent = text;
    button.addEventListener('click', click);
    return button;
  };
  group.append(chip(t('collectorAll'), !pickedHere.length, () => save(picked.filter((value) => !own.includes(value)))));
  const unfolded = openFilters.has(foldKey);
  const shown = unfolded ? options : options.filter(([value], index) => index < CHIPS_FOLDED || picked.includes(value));
  for (const [value, text] of shown) {
    const on = picked.includes(value);
    group.append(chip(textOf(text), on, () => save(on ? picked.filter((item) => item !== value) : [...picked, value])));
  }
  if (options.length > CHIPS_FOLDED) {
    const more = document.createElement('button');
    more.type = 'button';
    more.className = 'chips-more';
    more.textContent = unfolded ? t('collectorLess') : t('collectorMore', [String(options.length - shown.length)]);
    more.addEventListener('click', () => {
      if (unfolded) openFilters.delete(foldKey);
      else openFilters.add(foldKey);
      renderBoards();
    });
    if (unfolded || options.length > shown.length) group.append(more);
  }
  return group;
}

/** The filters of a board, folded until asked for: the popup stays one short list. */
function filtersBlock(board, chosen) {
  const filters = board.filters(collectorData.catalogs?.[board.id]).filter((filter) => filter.options.length);
  if (!filters.length) return undefined;
  const block = document.createElement('details');
  block.className = 'board-filters';
  block.open = openBlocks.has(board.id);
  block.addEventListener('toggle', () => {
    if (block.open) openBlocks.add(board.id);
    else openBlocks.delete(board.id);
  });
  const summary = document.createElement('summary');
  const count = filters.reduce((total, filter) => total + (chosen[filter.key]?.length ?? 0), 0);
  summary.textContent = count ? t('collectorFiltersOn', [String(count)]) : t('collectorFiltersOff');
  block.append(summary);
  for (const filter of filters) {
    block.append(chipRow(board, filter.title[collectorLang()], filter.key, filter.options, chosen));
    if (!filter.childKey) continue;
    for (const [value, name, children] of filter.options) {
      if ((chosen[filter.key] ?? []).includes(value) && children?.length) block.append(chipRow(board, textOf(name), filter.childKey, children, chosen));
    }
  }
  return block;
}

function renderBoards() {
  collector.boards.textContent = '';
  for (const board of BOARDS) {
    const chosen = collectorSettings.boards[board.id] ?? {};
    const row = document.createElement('div');
    row.className = 'board';
    const head = document.createElement('label');
    head.className = 'switch-row board-head';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = Boolean(chosen.on);
    input.addEventListener('change', async () => {
      collectorSettings.boards[board.id] = { ...chosen, on: input.checked };
      await saveCollector();
      renderBoards();
    });
    const knob = document.createElement('span');
    knob.className = 'switch';
    const name = document.createElement('strong');
    name.textContent = board.title;
    head.append(input, knob, name);
    row.append(head, sessionLine(board));
    const status = collectorData.statuses?.[board.id];
    if (status) row.append(runLine(status));
    const block = input.checked ? filtersBlock(board, chosen) : undefined;
    if (block) row.append(block);
    collector.boards.append(row);
  }
}

async function refreshCollector() {
  const stored = await chrome.storage.local.get(['radarCollector', 'radarCollectorStatus', 'radarCollectorRunning', 'radarBoardCatalog', 'radarBoardState']);
  collectorSettings = { auto: false, minutes: 30, boards: {}, ...stored.radarCollector };
  collectorData = { statuses: stored.radarCollectorStatus, catalogs: stored.radarBoardCatalog, states: stored.radarBoardState };
  collector.auto.checked = Boolean(collectorSettings.auto);
  collector.minutes.value = String(collectorSettings.minutes);
  renderBoards();
  // A walk the browser cut off leaves its mark behind: it must not lock the button for good.
  const running = stored.radarCollectorRunning && Date.now() - Date.parse(stored.radarCollectorRunning) < STALE_RUN_MS;
  collector.now.disabled = Boolean(running);
  collector.status.textContent = running ? t('collectorRunning') : '';
}

/** Reads each board's own page: is the owner signed in, and which filters does it offer today. */
async function probeBoards() {
  const { radarBoardCatalog: catalogs, radarBoardState: states } = await chrome.storage.local.get(['radarBoardCatalog', 'radarBoardState']);
  const nextCatalogs = { ...catalogs };
  const nextStates = { ...states };
  await Promise.all(BOARDS.map(async (board) => {
    try {
      // A sign-in page answers with a redirect to another host, which this page may not read.
      const response = await fetch(board.open, { credentials: 'include', redirect: board.signInNeeded ? 'manual' : 'follow' });
      const result = response.type === 'opaqueredirect' ? { state: 'signed_out' } : board.probe(await response.text(), response.url);
      nextStates[board.id] = result.state;
      if (result.catalog) nextCatalogs[board.id] = result.catalog;
    } catch {
      nextStates[board.id] = 'unknown';
    }
  }));
  await chrome.storage.local.set({ radarBoardCatalog: nextCatalogs, radarBoardState: nextStates });
}

/** The section is for the hub's owner. The saved answer shows it at once, the hub confirms it. */
async function showCollector() {
  const { radarAccount: account, radarCollectorAllowed: allowed } = await chrome.storage.local.get(['radarAccount', 'radarCollectorAllowed']);
  if (!account?.token) return;
  if (allowed) {
    collector.box.hidden = false;
    await refreshCollector();
  }
  const response = await fetch(`${account.base.replace(/\/+$/, '')}/api/ext/me`, { headers: { authorization: `Bearer ${account.token}` } }).catch(() => undefined);
  const me = response?.ok ? await response.json() : undefined;
  if (me === undefined) return;
  await chrome.storage.local.set({ radarCollectorAllowed: Boolean(me.collector) });
  collector.box.hidden = !me.collector;
  if (!me.collector) return;
  await refreshCollector();
  await probeBoards();
}

collector.auto.addEventListener('change', async () => {
  collectorSettings.auto = collector.auto.checked;
  await saveCollector();
});
collector.minutes.addEventListener('change', async () => {
  collectorSettings.minutes = Number(collector.minutes.value) || 30;
  await saveCollector();
});
collector.now.addEventListener('click', () => chrome.runtime.sendMessage({ type: 'collector-run' }));
chrome.storage.onChanged.addListener((changes) => {
  if (collector.box.hidden) return;
  if (changes.radarCollectorStatus || changes.radarCollectorRunning || changes.radarBoardState || changes.radarBoardCatalog) refreshCollector();
});
showCollector();
