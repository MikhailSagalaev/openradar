/**
 * openradar extension: reads order boards in the browser where the owner is signed in
 * (docs/GIG_SOURCES.md). Lists to walk are saved board addresses, one per city and specialty.
 * It runs only where the owner granted the host and never passes a check on the page: if
 * a board asks for a sign-in or a captcha, no orders are found and a person has to step in.
 * Readers were checked on the live boards on 5 November 2026. They never press a button that
 * reveals a phone, and they take neither the client's name nor the street.
 */

const COLLECTOR_ALARM = 'radar-collector';
const COLLECTOR_ORIGINS = ['https://profi.ru/*', 'https://uslugi.yandex.ru/*', 'https://youdo.com/*'];
const PAGE_SETTLE_MS = 6000;
const PAUSE_BETWEEN_PAGES_MS = 20000;

function collectorPlatform(url) {
  try {
    const host = new URL(url).hostname;
    if (host === 'profi.ru' || host.endsWith('.profi.ru')) return 'profi';
    if (host === 'uslugi.yandex.ru') return 'yandex';
    if (host === 'youdo.com' || host.endsWith('.youdo.com')) return 'youdo';
  } catch {
    // Not a page of a board.
  }
  return undefined;
}

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
    const parts = place.split('·').map((part) => part.trim()).filter(Boolean);
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

const YOUDO_PAGES_PER_WALK = 5;
const YOUDO_TASKS_PER_WALK = 60;
const YOUDO_SEEN_KEPT = 30000;

/** New tasks of one list, newest first: pages stop once a page holds nothing new. */
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
  const batch = fresh.slice(0, YOUDO_TASKS_PER_WALK);
  if (!batch.length) return { ok: true, found: 0, inserted: 0 };
  const read = (await run(readYoudoTasks, [batch, 1500])) ?? [];
  const orders = read.filter((task) => !task.skip);
  const result = orders.length ? await sendCollected('youdo', orders) : { ok: true, inserted: 0 };
  if (result.ok !== false) {
    for (const task of read) seen.add(Number(task.id));
    await chrome.storage.local.set({ radarYoudoSeen: [...seen].slice(-YOUDO_SEEN_KEPT) });
  }
  return { found: orders.length, ...result };
}

const YANDEX_PAGES_PER_WALK = 3;
const YANDEX_ORDERS_PER_WALK = 30;
const PROFI_SCROLLS = 8;

/** New orders of a Yandex list: order pages are read once, in small portions. */
async function walkYandex(tabId) {
  const run = async (func, args) => (await chrome.scripting.executeScript({ target: { tabId }, world: 'MAIN', func, args }))[0]?.result;
  const { radarYandexSeen: stored } = await chrome.storage.local.get(['radarYandexSeen']);
  const seen = new Set(stored ?? []);
  const ids = ((await run(readYandexList, [YANDEX_PAGES_PER_WALK])) ?? []).filter((id) => !seen.has(id)).slice(0, YANDEX_ORDERS_PER_WALK);
  if (!ids.length) return { ok: true, found: 0, inserted: 0 };
  const orders = (await run(readYandexOrders, [ids, 1500])) ?? [];
  const result = orders.length ? await sendCollected('yandex', orders) : { ok: true, inserted: 0 };
  if (result.ok !== false) {
    for (const id of ids) seen.add(id);
    await chrome.storage.local.set({ radarYandexSeen: [...seen].slice(-YOUDO_SEEN_KEPT) });
  }
  return { found: orders.length, ...result };
}

async function walkProfi(tabId) {
  const [result] = await chrome.scripting.executeScript({ target: { tabId }, world: 'MAIN', func: readProfiBoard, args: [PROFI_SCROLLS] });
  const orders = result?.result ?? [];
  if (!orders.length) return { ok: true, found: 0, inserted: 0 };
  return { found: orders.length, ...(await sendCollected('profi', orders)) };
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
  return response.ok ? { ok: true, ...json } : { ok: false, error: json.error ?? `http_${response.status}` };
}

async function collectFromTab(tabId, url) {
  const platform = collectorPlatform(url);
  if (!platform) return { ok: false, error: 'not_a_board' };
  if (platform === 'youdo') return walkYoudo(tabId, url);
  if (platform === 'yandex') return walkYandex(tabId);
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

/** One walk over the saved lists, a page at a time, in a tab that does not take the focus. */
async function walkCollectorLists() {
  const { radarCollector: settings } = await chrome.storage.local.get(['radarCollector']);
  const urls = (settings?.urls ?? []).filter(collectorPlatform);
  const summary = { pages: 0, found: 0, inserted: 0, errors: 0, at: new Date().toISOString() };
  for (const url of urls) {
    const tab = await chrome.tabs.create({ url, active: false });
    try {
      await tabLoaded(tab.id);
      await collectorWait(PAGE_SETTLE_MS);
      const result = await collectFromTab(tab.id, url);
      summary.pages++;
      summary.found += result.found ?? 0;
      summary.inserted += result.inserted ?? 0;
      if (result.ok === false) summary.errors++;
    } catch {
      summary.errors++;
    } finally {
      await chrome.tabs.remove(tab.id).catch(() => {});
    }
    await collectorWait(PAUSE_BETWEEN_PAGES_MS);
  }
  await chrome.storage.local.set({ radarCollectorLast: summary });
  return summary;
}

async function scheduleCollector() {
  const { radarCollector: settings } = await chrome.storage.local.get(['radarCollector']);
  await chrome.alarms.clear(COLLECTOR_ALARM);
  if (settings?.auto && settings.urls?.length) {
    chrome.alarms.create(COLLECTOR_ALARM, { periodInMinutes: Math.max(15, Number(settings.minutes) || 30) });
  }
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === COLLECTOR_ALARM) walkCollectorLists();
});

chrome.runtime.onMessage.addListener((message, _sender, reply) => {
  if (message?.type === 'collector-tab') {
    collectFromTab(message.tabId, message.url).then(reply, (error) => reply({ ok: false, error: String(error?.message ?? error) }));
    return true;
  }
  if (message?.type === 'collector-schedule') {
    scheduleCollector().then(() => reply({ ok: true }));
    return true;
  }
  return false;
});

globalThis.COLLECTOR_ORIGINS = COLLECTOR_ORIGINS;
