/**
 * OpenRadar extension: popup (send the page, market estimate, connection settings).
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
};

/** The hub answers market estimates; any OpenRadar server with priced leads can. */
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

  if (!config.sourceId || !config.token) {
    fields.details.open = true;
  }
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
    setStatus('Заполните адрес, ID и токен источника.', 'err');
    return;
  }
  await chrome.storage.local.set({ radarConfig: config });
  setStatus('Настройки успешно сохранены.', 'ok');
  fields.details.open = false;
}

async function testConnection() {
  const base = normalizeBase(fields.base.value);
  if (!base) {
    setStatus('Укажите адрес сервера.', 'err');
    return;
  }
  fields.testBtn.disabled = true;
  setStatus('Проверка соединения...');
  try {
    const res = await fetch(`${base}/api/ping`, { method: 'GET' });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const data = await res.json().catch(() => null);
    const ver = data?.version ? ` (v${data.version})` : '';
    setStatus(`Сервер доступен${ver}`, 'ok');
  } catch (err) {
    setStatus(`Ошибка подключения: ${err.message}`, 'err');
  } finally {
    fields.testBtn.disabled = false;
  }
}

async function readPage() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error('Нет активной вкладки.');

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
        if (jp.isRemote) details.push('Удалённо');
        if (typeof jp.budget === 'number') {
          const cur = jp.currency === 'RUB' ? '₽' : jp.currency;
          details.push(`${jp.budget.toLocaleString('ru-RU')} ${cur}`);
        }

        if (details.length) {
          fields.jobChip.textContent = details.join(' · ');
          fields.jobChip.style.display = 'inline-block';
        }
      } else {
        fields.pageTitle.textContent = page.title || 'Вкладка без названия';
        fields.jobChip.style.display = 'none';
      }

      fields.pageUrl.textContent = page.url ? new URL(page.url).hostname : '';

      if (page.selection) {
        fields.selectionSnippet.textContent = `Выделен фрагмент (${page.selection.length} симв.): "${page.selection.slice(0, 160)}${page.selection.length > 160 ? '...' : ''}"`;
        fields.selectionSnippet.style.display = 'block';
      } else {
        fields.selectionSnippet.style.display = 'none';
      }
    }
  } catch {
    fields.pageTitle.textContent = 'Текущая страница';
  }
}

async function sendPage() {
  const config = await readConfig();
  if (!config.base || !config.sourceId || !config.token) {
    fields.details.open = true;
    setStatus('Сначала сохраните настройки сервера.', 'err');
    return;
  }

  fields.send.disabled = true;
  setStatus('Отправляем в Radar...');
  try {
    const page = (await readPage()) || cachedPage;
    if (!page) throw new Error('Не удалось прочитать страницу.');

    const selectedType = getSelectedType();
    const text = page.selection || page.jobPosting?.description || page.description || page.title;
    if (!text) throw new Error('На странице нет текста для отправки.');

    const author = config.contributor
      ? `${config.contributor} (community)`
      : 'Community Extension';

    const payload = {
      type: selectedType,
      title: (selectedType === 'job' && page.jobPosting?.title) || page.title,
      text,
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

    const response = await fetch(
      `${config.base}/api/ingest/${encodeURIComponent(config.sourceId)}`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-radar-token': config.token,
        },
        body: JSON.stringify(payload),
      },
    );

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(errText.slice(0, 160) || `HTTP ${response.status}`);
    }
    const data = await response.json().catch(() => null);
    const leadId = data?.outcomes?.[0]?.lead?.id || data?.leadId;
    if (leadId) {
      const leadUrl = `${config.base}/leads/${encodeURIComponent(leadId)}`;
      fields.status.innerHTML = `Отправлено в Radar. <a href="${leadUrl}" target="_blank" rel="noopener" style="color:inherit;text-decoration:underline;display:block;margin-top:6px;font-weight:600">Открыть карточку лида →</a>`;
      fields.status.className = 'status ok';
    } else {
      setStatus('Успешно отправлено в Radar', 'ok');
    }
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), 'err');
  } finally {
    fields.send.disabled = false;
  }
}

function formatMoney(value, currency) {
  const sign = { RUB: '₽', USD: '$', EUR: '€' }[currency] ?? currency;
  return `${Math.round(value).toLocaleString('ru-RU')} ${sign}`;
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
  const verdict = budget < range.p25 ? 'ниже рынка' : budget > range.p75 ? 'выше рынка' : 'в рынке';
  return `На этой странице: ${formatMoney(budget, currency)} — ${verdict}`;
}

/** Sends only the title, type and skills: no URL, no page text. On the user's click only. */
async function estimateMarket() {
  const page = cachedPage || (await readPage().catch(() => null));
  const title = (page?.jobPosting?.title || page?.title || '').trim();
  if (title.length < 3) {
    setStatus('На странице нет заголовка для оценки.', 'err');
    return;
  }
  const base = normalizeBase(fields.marketBase.value) || DEFAULT_MARKET_BASE;
  const type = getSelectedType();
  const params = new URLSearchParams({ title: title.slice(0, 300), type });
  if (page?.jobPosting?.skills?.length) params.set('skills', page.jobPosting.skills.slice(0, 12).join(','));

  fields.estimate.disabled = true;
  fields.marketResult.hidden = false;
  fields.marketResult.replaceChildren(marketLine('market-note', 'Считаем по похожим заказам...'));
  try {
    const res = await fetch(`${base}/api/market?${params}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const e = await res.json();
    const nodes = [];
    if (!e.rub || e.basis === 'none') {
      nodes.push(marketLine('market-note', 'Пока мало заказов с бюджетом, чтобы оценить.'));
    } else {
      const per = e.period === 'month' ? ' в месяц' : ' за проект';
      nodes.push(marketLine('market-median', `≈ ${formatMoney(e.rub.median, 'RUB')}${per}`));
      nodes.push(marketLine('market-range', `Половина предложений — от ${formatMoney(e.rub.p25, 'RUB')} до ${formatMoney(e.rub.p75, 'RUB')}`));
      const what = e.type === 'job' ? 'вакансиям' : 'заказам';
      const basis = e.basis === 'type'
        ? `Похожих мало: по всем ${what} за 90 дней (${e.count})`
        : `По ${e.count} похожим ${what} за 90 дней`;
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
      marketLine('market-note', `Не удалось получить оценку: ${error instanceof Error ? error.message : String(error)}`),
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

loadConfig().catch((error) => setStatus(String(error), 'err'));
initPreview();
