/**
 * openradar extension: reads order boards in the browser where the owner is signed in
 * (docs/GIG_SOURCES.md). Lists to walk are saved board addresses, one per city and specialty.
 * It runs only where the owner granted the host and never passes a check on the page: if
 * a board asks for a sign-in or a captcha, no orders are found and a person has to step in.
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

/** Runs inside the page: must not use anything from this file. */
function readOrdersFromPage(platform) {
  const clean = (value) => (value ?? '').replace(/\s+\n/g, '\n').replace(/\n{2,}/g, '\n').trim();
  const money = (value) => {
    const found = /(\d[\d\s ]{2,})\s*(?:₽|руб)/.exec(value ?? '');
    const amount = found ? Number(found[1].replace(/[\s ]/g, '')) : NaN;
    return Number.isFinite(amount) && amount > 0 ? amount : undefined;
  };
  /** The largest block around a link that holds no other order. */
  const cards = (selector, idOf) => {
    const links = Array.from(document.querySelectorAll(selector)).filter((a) => idOf(a));
    const seen = new Set();
    const out = [];
    for (const link of links) {
      const id = idOf(link);
      if (seen.has(id)) continue;
      seen.add(id);
      let card = link;
      while (card.parentElement && Array.from(card.parentElement.querySelectorAll(selector)).every((a) => idOf(a) === id)) card = card.parentElement;
      // A line of one capitalised word is a client's first name.
      const lines = clean(card.innerText).split('\n').map((line) => line.trim()).filter((line) => line && !/^[А-ЯЁ][а-яё]{2,14}$/.test(line));
      out.push({ id, url: link.href, title: lines[0] ?? '', text: lines.join('\n'), budget: money(lines.join('\n')) });
    }
    return out;
  };

  if (platform === 'yandex') {
    return Array.from(document.querySelectorAll('.OrderCard2')).map((card) => {
      const link = card.querySelector('a[href^="/order/"]');
      const part = (name) => clean(card.querySelector(`.OrderCard2-${name}`)?.innerText);
      const id = /\/order\/([0-9a-f-]{36})/.exec(link?.getAttribute('href') ?? '')?.[1];
      if (!id) return undefined;
      const price = part('Price');
      return { id, url: link.href, title: part('TitleRow'), text: [part('Description'), part('Date'), price].filter(Boolean).join('\n'), category: part('RubricName'), budget: money(price) };
    }).filter(Boolean);
  }
  if (platform === 'profi') return cards('a[href*="n.php?o="]', (a) => /[?&]o=(\d+)/.exec(a.href)?.[1]);
  if (platform === 'youdo') return cards('a[href^="/t"]', (a) => /^\/t(\d+)/.exec(a.getAttribute('href') ?? '')?.[1]);
  return [];
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
  const [result] = await chrome.scripting.executeScript({ target: { tabId }, func: readOrdersFromPage, args: [platform] });
  const orders = result?.result ?? [];
  if (!orders.length) return { ok: true, found: 0, inserted: 0 };
  return { found: orders.length, ...(await sendCollected(platform, orders)) };
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
