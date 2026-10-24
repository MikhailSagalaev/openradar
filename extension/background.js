/**
 * OpenRadar - Background Service Worker (Manifest V3)
 * Swiss-style typography, zero emoji.
 */

const notificationUrls = new Map();

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'radar-send-selection-gig',
    title: 'Отправить заказ в Radar',
    contexts: ['selection'],
  });

  chrome.contextMenus.create({
    id: 'radar-send-selection-job',
    title: 'Отправить вакансию в Radar',
    contexts: ['selection'],
  });

  chrome.contextMenus.create({
    id: 'radar-send-page',
    title: 'Отправить текущую страницу в Radar',
    contexts: ['page'],
  });
});

async function sendToRadar(payload) {
  const stored = await chrome.storage.local.get('radarConfig');
  const config = stored.radarConfig;
  if (!config?.base || !config?.sourceId || !config?.token) {
    if (chrome.notifications) {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icon48.png',
        title: 'OpenRadar',
        message: 'Настройте расширение: укажите адрес сервера и токен источника в попапе.',
      });
    }
    return { ok: false, message: 'Не настроены параметры сервера' };
  }

  const base = config.base.replace(/\/+$/, '');
  try {
    const response = await fetch(`${base}/api/ingest/${encodeURIComponent(config.sourceId)}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-radar-token': config.token,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errText = (await response.text()).slice(0, 160);
      return { ok: false, message: `Ошибка сервера: HTTP ${response.status} ${errText}` };
    }

    const data = await response.json().catch(() => null);
    const leadId = data?.outcomes?.[0]?.lead?.id || data?.leadId;
    return { ok: true, leadId, base };
  } catch (err) {
    return { ok: false, message: String(err?.message || err) };
  }
}

function notifyUser(result, itemTitle) {
  if (chrome.action) {
    chrome.action.setBadgeText({ text: result.ok ? 'OK' : 'ERR' });
    chrome.action.setBadgeBackgroundColor({ color: result.ok ? '#111111' : '#dc2626' });
    setTimeout(() => chrome.action.setBadgeText({ text: '' }), 3500);
  }

  if (chrome.notifications) {
    if (result.ok) {
      const leadUrl = result.leadId ? `${result.base}/leads/${encodeURIComponent(result.leadId)}` : null;
      chrome.notifications.create(
        {
          type: 'basic',
          iconUrl: 'icon48.png',
          title: 'OpenRadar — лид сохранён',
          message: leadUrl
            ? `${itemTitle || 'Лид'} успешно добавлен. Нажмите, чтобы открыть карточку.`
            : 'Лид успешно сохранён в базу OpenRadar.',
        },
        (notifId) => {
          if (leadUrl && notifId) {
            notificationUrls.set(notifId, leadUrl);
          }
        },
      );
    } else {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icon48.png',
        title: 'OpenRadar — Ошибка',
        message: result.message || 'Не удалось отправить лид в Radar.',
      });
    }
  }
}

chrome.notifications?.onClicked.addListener((notificationId) => {
  const url = notificationUrls.get(notificationId);
  if (url) {
    chrome.tabs.create({ url });
    notificationUrls.delete(notificationId);
  }
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'radar-send-selection-gig' || info.menuItemId === 'radar-send-selection-job') {
    const text = info.selectionText?.trim();
    if (!text) return;

    const stored = await chrome.storage.local.get('radarConfig');
    const contributor = stored.radarConfig?.contributor;
    const author = contributor ? `${contributor} (community)` : 'Community Extension';
    const type = info.menuItemId === 'radar-send-selection-job' ? 'job' : 'gig';

    const result = await sendToRadar({
      type,
      title: tab?.title || (type === 'job' ? 'Вакансия из браузера' : 'Заказ из браузера'),
      text,
      url: tab?.url || info.pageUrl,
      author,
      externalId: `browser:${Date.now()}:${Math.random().toString(36).slice(2, 7)}`,
    });

    notifyUser(result, tab?.title);
  } else if (info.menuItemId === 'radar-send-page') {
    await processPageExtraction(tab);
  }
});

async function processPageExtraction(tab) {
  if (!tab?.id) return;

  let page = null;
  try {
    page = await chrome.tabs.sendMessage(tab.id, { type: 'EXTRACT_PAGE_DATA' });
  } catch {}

  if (!page) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js'],
      });
      page = await chrome.tabs.sendMessage(tab.id, { type: 'EXTRACT_PAGE_DATA' });
    } catch {}
  }

  if (!page) {
    const [injection] = await chrome.scripting.executeScript({
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
    page = injection?.result;
  }

  if (!page) return;

  const stored = await chrome.storage.local.get('radarConfig');
  const contributor = stored.radarConfig?.contributor;
  const author = contributor ? `${contributor} (community)` : 'Community Extension';

  const type = page.detectedType || (page.jobPosting ? 'job' : 'gig');
  const payload = {
    type,
    title: page.jobPosting?.title || page.title,
    text: page.selection || page.jobPosting?.description || page.description || page.title,
    url: page.url,
    author,
    externalId: `browser:${page.url}`,
  };

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

  const result = await sendToRadar(payload);
  notifyUser(result, payload.title);
}

chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'send-page') {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
      await processPageExtraction(tab);
    }
  }
});
