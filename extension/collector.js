/**
 * openradar extension: reads order boards in the browser where the owner is signed in
 * (docs/GIG_SOURCES.md). What to read comes from boards.js and the owner's choice in the popup.
 * It runs only where the owner granted the host and never passes a check on the page: if
 * a board asks for a sign-in or a captcha, no orders are found and a person has to step in.
 * Readers were checked on the live boards on 5 November 2026. They never press a button that
 * reveals a phone, and they take neither the client's name nor the street.
 */

const COLLECTOR_ALARM = 'radar-collector';
const PAGE_SETTLE_MS = 6000;
const PAUSE_BETWEEN_PAGES_MS = 5000;
/** Orders read per step. A browser stops a worker that sits in one long call. */
const STEP_SIZE = 10;
/** Between two pages of a board: about one request a second, as a person clicking through. */
const READ_PAUSE_MS = 600;

/** Runs inside the Profi.ru board: the orders of the account's own specialties and region. */
async function readProfiBoard(scrolls) {
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const selector = 'a[data-testid$="_order-snippet"]';
  for (let i = 0; i < scrolls; i++) {
    const before = document.querySelectorAll(selector).length;
    for (const box of document.querySelectorAll('*')) if (box.scrollHeight > box.clientHeight + 200) box.scrollTop = 1e7;
    window.scrollTo(0, 1e7);
    await wait(1300);
    if (document.querySelectorAll(selector).length === before) break;
  }
  const months = ['январ', 'феврал', 'март', 'апрел', 'ма', 'июн', 'июл', 'август', 'сентябр', 'октябр', 'ноябр', 'декабр'];
  const dateOf = (age) => {
    const now = new Date();
    const ago = /(\d+)\s+(минут|час|д[ен])/.exec(age);
    if (ago) return new Date(now.getTime() - Number(ago[1]) * { минут: 60000, час: 3600000, де: 86400000, дн: 86400000 }[ago[2]]).toISOString();
    if (/только что/i.test(age)) return now.toISOString();
    const yesterday = /Вчера в (\d+):(\d+)/.exec(age);
    if (yesterday) {
      const day = new Date(now.getTime() - 86400000);
      day.setHours(Number(yesterday[1]), Number(yesterday[2]), 0, 0);
      return day.toISOString();
    }
    const dated = /(\d+)\s+([а-я]+)/.exec(age);
    const month = dated ? months.findIndex((name) => dated[2].startsWith(name)) : -1;
    if (month < 0) return undefined;
    const day = new Date(now.getFullYear(), month, Number(dated[1]), 12);
    if (day > now) day.setFullYear(day.getFullYear() - 1);
    return day.toISOString();
  };
  return Array.from(document.querySelectorAll(selector)).map((card) => {
    const id = /\?o=(\d+)/.exec(card.getAttribute('href') ?? '')?.[1];
    const heading = card.querySelector('h3')?.innerText.trim() ?? '';
    const body = card.querySelector('p')?.innerText.trim() ?? '';
    const price = /(\d[\d\s]*)\s*₽/.exec(card.querySelector('[aria-hidden="true"]')?.innerText ?? '')?.[1];
    const place = Array.from(card.querySelectorAll('li')).map((li) => li.innerText.trim()).find((text) => /·|Дистанционно|^[А-ЯЁ]/.test(text)) ?? '';
    // «Калининград -1 час»: the difference from the reader's clock is no part of the city.
    const parts = place.replace(/\s*[+-]\d+\s*час\S*/, '').split('·').map((part) => part.trim()).filter(Boolean);
    return {
      id,
      url: `https://profi.ru/backoffice/n.php?o=${id}`,
      title: body && heading.length < 25 ? `${heading}: ${body.split('·')[0].trim()}` : heading,
      text: [heading, body].filter(Boolean).join('\n'),
      budget: price ? Number(price.replace(/\s/g, '')) : undefined,
      category: heading,
      city: parts.filter((part) => part !== 'Дистанционно').pop(),
      remote: /Дистанционно/.test(place),
      publishedAt: dateOf(card.querySelector('span')?.innerText ?? ''),
    };
  }).filter((order) => order.id);
}

/** Runs inside the Yandex order list: the ids of a few pages, turned with the list's own «Далее». */
async function readYandexList(pages) {
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const ids = new Set();
  for (let page = 0; page < pages; page++) {
    await wait(2500);
    for (const link of document.querySelectorAll('.OrderCard2 a[href^="/order/"]')) {
      const id = /\/order\/([0-9a-f-]{36})/.exec(link.getAttribute('href') ?? '')?.[1];
      if (id) ids.add(id);
    }
    const next = Array.from(document.querySelectorAll('a, button, [role="button"]')).find((el) => el.innerText?.trim() === 'Далее');
    if (!next) break;
    next.click();
  }
  return [...ids];
}

/** Runs inside Yandex: the order its own page carries. Never the client's name or phone. */
async function readYandexOrders(ids, pauseMs) {
  const out = [];
  const find = (node, id, depth) => {
    if (!node || typeof node !== 'object' || depth > 9) return undefined;
    if (node.id === id && 'description' in node) return node;
    for (const value of Object.values(node)) {
      const found = find(value, id, depth + 1);
      if (found) return found;
    }
    return undefined;
  };
  for (const id of ids) {
    await new Promise((resolve) => setTimeout(resolve, pauseMs));
    const response = await fetch(`/order/${id}`, { credentials: 'include' });
    if (!response.ok) continue;
    const page = new DOMParser().parseFromString(await response.text(), 'text/html');
    const state = page.getElementById('__PRELOADED_STATE__')?.textContent;
    const order = state ? find(JSON.parse(state), id, 0) : undefined;
    if (!order?.title) continue;
    // «service» is the whole job; other measures are a rate per lesson or per hour.
    const measure = String(order.price?.measure ?? '');
    const amount = Number(order.price?.amount);
    const names = order.rubricsNames ?? {};
    out.push({
      id,
      url: `https://uslugi.yandex.ru/order/${id}`,
      title: order.title,
      text: order.description ?? '',
      budget: amount > 0 && (!measure || measure === 'service') ? amount : undefined,
      category: names.specialization ?? names.occupation,
      city: order.address?.name ? order.address.name.split(',').map((part) => part.trim()).filter((part) => !/\d/.test(part) && !/улица|проспект|шоссе|переулок/i.test(part))[0] : undefined,
      publishedAt: Number(order.createTime) ? new Date(Number(order.createTime) * 1000).toISOString() : undefined,
    });
  }
  return out;
}

/**
 * Runs inside a YouDo page, in its own world: the same request its «Показать ещё» makes.
 * Filters come from the address fragment of a saved list:
 * #lat=59.93&lng=30.31&radius=30&categories=webdevelopment,design&virtual=1
 */
async function readYoudoList(fragment, page) {
  const wanted = new URLSearchParams(fragment.replace(/^#/, ''));
  const body = { q: wanted.get('q') ?? '', list: 'all', status: 'opened', page, noOffers: false, onlySbr: false, onlyB2B: false, onlyVacancies: false, priceMin: wanted.get('priceMin') ?? '', sortType: 1, onlyVirtual: wanted.get('virtual') === '1' };
  if (wanted.get('lat') && wanted.get('lng')) Object.assign(body, { lat: Number(wanted.get('lat')), lng: Number(wanted.get('lng')), radius: Number(wanted.get('radius')) || 30 });
  if (wanted.get('categories')) body.categories = wanted.get('categories').split(',');
  if (wanted.get('sub')) body.sub = wanted.get('sub').split(',').map(Number);
  const response = await fetch('/api/tasks/tasks/', { method: 'POST', headers: { 'content-type': 'application/json', 'x-requested-with': 'XMLHttpRequest' }, credentials: 'include', body: JSON.stringify(body) });
  if (!response.ok) return { error: `http_${response.status}`, ids: [], total: 0 };
  const result = (await response.json()).ResultObject ?? {};
  return { ids: (result.Items ?? []).map((item) => item.Id), total: result.Total ?? 0 };
}

/** Runs inside a YouDo page: the task data its own page carries. Never the client or the street. */
async function readYoudoTasks(ids, pauseMs) {
  const out = [];
  for (const id of ids) {
    await new Promise((resolve) => setTimeout(resolve, pauseMs));
    const response = await fetch(`/t${id}`, { credentials: 'include' });
    if (!response.ok) continue;
    const page = new DOMParser().parseFromString(await response.text(), 'text/html');
    const data = page.getElementById('__NEXT_DATA__')?.textContent;
    const task = data ? JSON.parse(data).props?.initialState?.taskState?.taskInfo : undefined;
    if (!task?.title || task.isVacancy) {
      out.push({ id, skip: true });
      continue;
    }
    const city = task.addresses?.[0]?.locality ?? (typeof task.city === 'string' ? task.city : '');
    out.push({
      id: String(id),
      url: `https://youdo.com/t${id}`,
      title: task.title,
      text: task.description ?? '',
      budget: task.price?.ownBudget || task.priceRange?.max || undefined,
      category: task.subCategoryInfo?.name ?? task.categoryName,
      city: city || undefined,
      remote: task.isVirtual === true,
      publishedAt: task.dates?.creationDateTime,
    });
  }
  return out;
}

const YOUDO_PAGES_PER_WALK = 8;
const YOUDO_TASKS_PER_WALK = 200;
const YOUDO_SEEN_KEPT = 30000;

/** New tasks of one list, newest first: pages stop once a page holds nothing new. */
let youdoLeft = YOUDO_TASKS_PER_WALK;

async function walkYoudo(tabId, url) {
  const fragment = new URL(url).hash;
  const run = async (func, args) => (await chrome.scripting.executeScript({ target: { tabId }, world: 'MAIN', func, args }))[0]?.result;
  const { radarYoudoSeen: stored } = await chrome.storage.local.get(['radarYoudoSeen']);
  const seen = new Set(stored ?? []);
  const fresh = [];
  for (let page = 1; page <= YOUDO_PAGES_PER_WALK && fresh.length < YOUDO_TASKS_PER_WALK; page++) {
    const list = await run(readYoudoList, [fragment, page]);
    if (list?.error) return { ok: false, error: list.error };
    const unseen = (list?.ids ?? []).filter((id) => !seen.has(id));
    fresh.push(...unseen);
    if (!unseen.length) break;
  }
  const batch = fresh.slice(0, Math.max(0, youdoLeft));
  youdoLeft -= batch.length;
  return readInSteps(batch, 'youdo', (ids) => run(readYoudoTasks, [ids, READ_PAUSE_MS]), seen, 'radarYoudoSeen');
}

/** Reads and sends a few orders at a time, so a stopped walk loses one step at most. */
async function readInSteps(ids, platform, read, seen, key) {
  for (let start = 0; start < ids.length; start += STEP_SIZE) {
    const step = ids.slice(start, start + STEP_SIZE);
    const orders = ((await read(step)) ?? []).filter((order) => !order.skip);
    if (orders.length) {
      const result = await sendCollected(platform, orders);
      if (result.ok === false) return result;
      await noteProgress(orders.length, result.inserted ?? 0);
    }
    for (const id of step) seen.add(id);
    await chrome.storage.local.set({ [key]: [...seen].slice(-YOUDO_SEEN_KEPT) });
  }
  return { ok: true };
}

const YANDEX_PAGES_PER_WALK = 3;
const YANDEX_ORDERS_PER_WALK = 60;
const PROFI_SCROLLS = 8;

/** New orders of a Yandex list: order pages are read once, in small portions. */
async function walkYandex(tabId) {
  const run = async (func, args) => (await chrome.scripting.executeScript({ target: { tabId }, world: 'MAIN', func, args }))[0]?.result;
  const { radarYandexSeen: stored } = await chrome.storage.local.get(['radarYandexSeen']);
  const seen = new Set(stored ?? []);
  const ids = ((await run(readYandexList, [YANDEX_PAGES_PER_WALK])) ?? []).filter((id) => !seen.has(id)).slice(0, YANDEX_ORDERS_PER_WALK);
  return readInSteps(ids, 'yandex', (step) => run(readYandexOrders, [step, READ_PAUSE_MS]), seen, 'radarYandexSeen');
}

async function walkProfi(tabId) {
  const [result] = await chrome.scripting.executeScript({ target: { tabId }, world: 'MAIN', func: readProfiBoard, args: [PROFI_SCROLLS] });
  const orders = result?.result ?? [];
  if (!orders.length) return { ok: true };
  const sent = await sendCollected('profi', orders);
  if (sent.ok !== false) await noteProgress(orders.length, sent.inserted ?? 0);
  return sent;
}

async function sendCollected(platform, orders) {
  const { radarAccount: account } = await chrome.storage.local.get(['radarAccount']);
  if (!account?.token) return { ok: false, error: 'not_signed_in' };
  const response = await fetch(`${account.base.replace(/\/+$/, '')}/api/ext/orders`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${account.token}` },
    body: JSON.stringify({ platform, orders: orders.slice(0, 100) }),
  });
  const json = await response.json().catch(() => ({}));
  return response.ok ? { ...json, ok: true } : { ok: false, error: json.error ?? `http_${response.status}` };
}

async function readBoardPage(board, tabId, url) {
  if (board.id === 'youdo') return walkYoudo(tabId, url);
  if (board.id === 'yandex') return walkYandex(tabId);
  return walkProfi(tabId);
}

const collectorWait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function tabLoaded(tabId) {
  return new Promise((resolve) => {
    const timer = setTimeout(done, 30000);
    function done() {
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    }
    function listener(id, info) {
      if (id === tabId && info.status === 'complete') done();
    }
    chrome.tabs.onUpdated.addListener(listener);
  });
}

let walkStatus;
let walkBoardId;

/** The popup shows the walk as it goes, not when a list of a hundred orders is over. */
async function noteProgress(found, inserted) {
  if (!walkStatus) return;
  walkStatus.found += found;
  walkStatus.inserted += inserted;
  walkStatus.at = new Date().toISOString();
  await saveBoardStatus(walkBoardId, walkStatus);
}

async function saveBoardStatus(id, status) {
  const { radarCollectorStatus: all } = await chrome.storage.local.get(['radarCollectorStatus']);
  await chrome.storage.local.set({ radarCollectorStatus: { ...all, [id]: status } });
}

/** One page of a board in a tab that does not take the focus. */
async function walkPage(board, url) {
  const tab = await chrome.tabs.create({ url, active: false });
  try {
    await tabLoaded(tab.id);
    await collectorWait(PAGE_SETTLE_MS);
    const opened = await chrome.tabs.get(tab.id);
    if (board.isSignIn(opened.url ?? '', opened.title ?? '')) return { ok: false, error: 'sign_in' };
    return await readBoardPage(board, tab.id, url);
  } finally {
    await chrome.tabs.remove(tab.id).catch(() => {});
  }
}

/** Vacancy pages read per site in one walk. */
const VACANCIES_PER_WALK = 8;
const SEEN_PER_SITE = 500;

/** Runs inside a career page: the links that lead to vacancies. */
function readVacancyLinks(pattern) {
  const re = new RegExp(pattern);
  return [...new Set([...document.querySelectorAll('a[href]')].map((a) => a.href.split('#')[0]))].filter((href) => re.test(href));
}

/** Runs inside a vacancy page: what a visitor sees. */
function readVacancyPage() {
  const heading = document.querySelector('h1')?.innerText?.trim();
  const body = document.querySelector('main, article, [role="main"]') ?? document.body;
  return { url: location.href.split('#')[0], title: heading || document.title, text: body.innerText };
}

async function inTab(url, read, args = []) {
  const tab = await chrome.tabs.create({ url, active: false });
  try {
    await tabLoaded(tab.id);
    await collectorWait(PAGE_SETTLE_MS);
    const [result] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: read, args });
    return result?.result;
  } finally {
    await chrome.tabs.remove(tab.id).catch(() => {});
  }
}

async function sendVacancies(site, vacancies) {
  const { radarAccount: account } = await chrome.storage.local.get(['radarAccount']);
  if (!account?.token) return { ok: false, error: 'not_signed_in' };
  const response = await fetch(`${account.base.replace(/\/+$/, '')}/api/ext/vacancies`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${account.token}` },
    body: JSON.stringify({ site, vacancies }),
  });
  const json = await response.json().catch(() => ({}));
  return response.ok ? { ...json, ok: true } : { ok: false, error: json.error ?? `http_${response.status}` };
}

/** One career site: the new vacancies of its list, a few per walk. */
async function walkCareerSite(site) {
  const status = { at: new Date().toISOString(), found: 0, inserted: 0 };
  await saveBoardStatus(site.id, status);
  try {
    const { radarCareerSeen: seen = {} } = await chrome.storage.local.get(['radarCareerSeen']);
    const done = new Set(seen[site.id] ?? []);
    const links = (await inTab(site.list, readVacancyLinks, [site.link])) ?? [];
    const fresh = links.filter((link) => !done.has(link)).slice(0, VACANCIES_PER_WALK);
    const pages = [];
    for (const link of fresh) {
      const page = await inTab(link, readVacancyPage);
      if (page) pages.push({ ...page, url: link });
      await collectorWait(READ_PAUSE_MS);
    }
    if (pages.length) {
      const sent = await sendVacancies(site.id, pages);
      if (sent.ok === false) status.error = sent.error;
      else {
        status.found = sent.found ?? pages.length;
        status.inserted = sent.inserted ?? 0;
        const kept = [...done, ...fresh].slice(-SEEN_PER_SITE);
        await chrome.storage.local.set({ radarCareerSeen: { ...seen, [site.id]: kept } });
      }
    }
  } catch (error) {
    status.error = String(error?.message ?? error);
  }
  status.at = new Date().toISOString();
  await saveBoardStatus(site.id, status);
}

let collectorBusy = false;

/** One walk over the boards the owner switched on, a page at a time. */
async function walkBoards() {
  if (collectorBusy) return;
  collectorBusy = true;
  // A worker with no calls in flight is stopped after 30 seconds, mid-walk.
  const keepAlive = setInterval(() => chrome.runtime.getPlatformInfo(() => {}), 20000);
  await chrome.storage.local.set({ radarCollectorRunning: new Date().toISOString() });
  youdoLeft = YOUDO_TASKS_PER_WALK;
  try {
    const { radarCollector: settings, radarBoardCatalog: catalogs } = await chrome.storage.local.get(['radarCollector', 'radarBoardCatalog']);
    for (const board of BOARDS) {
      const chosen = settings?.boards?.[board.id];
      if (!chosen?.on) continue;
      const status = { at: new Date().toISOString(), found: 0, inserted: 0 };
      walkStatus = status;
      walkBoardId = board.id;
      await saveBoardStatus(board.id, status);
      for (const url of board.lists(chosen, catalogs?.[board.id])) {
        try {
          const result = await walkPage(board, url);
          if (result.ok === false) status.error = result.error;
        } catch (error) {
          status.error = String(error?.message ?? error);
        }
        status.at = new Date().toISOString();
        await saveBoardStatus(board.id, status);
        if (status.error || (board.id === 'youdo' && youdoLeft <= 0)) break;
        await collectorWait(PAUSE_BETWEEN_PAGES_MS);
      }
    }
    for (const site of CAREER_SITES) {
      if (settings?.sites?.[site.id]) await walkCareerSite(site);
    }
  } finally {
    clearInterval(keepAlive);
    collectorBusy = false;
    await chrome.storage.local.set({ radarCollectorRunning: false });
  }
}

async function scheduleCollector() {
  const { radarCollector: settings } = await chrome.storage.local.get(['radarCollector']);
  await chrome.alarms.clear(COLLECTOR_ALARM);
  if (settings?.auto) chrome.alarms.create(COLLECTOR_ALARM, { periodInMinutes: Math.max(15, Number(settings.minutes) || 30) });
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === COLLECTOR_ALARM) walkBoards();
});

chrome.runtime.onMessage.addListener((message, _sender, reply) => {
  if (message?.type === 'collector-run') {
    walkBoards();
    reply({ ok: true });
    return false;
  }
  if (message?.type === 'collector-schedule') {
    scheduleCollector().then(() => reply({ ok: true }));
    return true;
  }
  return false;
});
