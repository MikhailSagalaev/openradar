/**
 * openradar extension: background service worker (context menu, shortcut, notifications).
 */

const notificationUrls = new Map();

/** Localised UI string; see _locales/. */
const t = (key, subs) => chrome.i18n.getMessage(key, subs) || key;

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'radar-send-selection-gig',
    title: t('menuSendGig'),
    contexts: ['selection'],
  });

  chrome.contextMenus.create({
    id: 'radar-send-selection-job',
    title: t('menuSendJob'),
    contexts: ['selection'],
  });

  chrome.contextMenus.create({
    id: 'radar-send-page',
    title: t('menuSendPage'),
    contexts: ['page'],
  });
});

async function sendToRadar(payload) {
  // The GitHub-connected account goes to the shared base; otherwise to your own node.
  const { radarAccount: account, radarConfig: config } = await chrome.storage.local.get(['radarAccount', 'radarConfig']);
  const toNode = !account?.token && config?.base && config?.sourceId && config?.token;
  if (!account?.token && !toNode) {
    if (chrome.notifications) {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icon48.png',
        title: 'openradar',
        message: t('notifySignIn'),
      });
    }
    return { ok: false, message: t('notSignedIn') };
  }

  const base = (account?.token ? account.base : config.base).replace(/\/+$/, '');
  try {
    const response = account?.token
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

    if (!response.ok) {
      const errText = (await response.text()).slice(0, 160);
      return { ok: false, message: t('errServer', [String(response.status), errText]) };
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
          title: t('notifySavedTitle'),
          message: leadUrl
            ? t('notifySavedOpen', [itemTitle || t('leadFallback')])
            : t('notifySaved'),
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
        title: t('notifyErrorTitle'),
        message: result.message || t('errSend'),
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
      title: tab?.title || (type === 'job' ? t('jobFromBrowser') : t('gigFromBrowser')),
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
