/**
 * openradar extension: finishes the sign-in.
 * The hub redirects here with #token=…&handle=…&base=…&state=… after the user allows the extension.
 * The write is gated by a one-time state nonce the popup generated: connected.html is
 * web-accessible, so without the nonce any page could replace the stored account.
 */

/** Pure validation of the redirect fragment against the stored flow nonce. */
function validateConnectFragment(params, storedState) {
  const token = params.get('token') || '';
  const base = (params.get('base') || '').replace(/\/+$/, '');
  const state = params.get('state') || '';
  if (!token.startsWith('ext_')) return { ok: false };
  // The nonce must be present, match the popup's flow, and be single-use.
  if (!storedState || !state || state !== storedState) return { ok: false };
  let parsed;
  try {
    parsed = new URL(base);
  } catch {
    return { ok: false };
  }
  // Only https hosts, or plain http on loopback for self-hosted nodes.
  const loopback = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
  if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && loopback)) return { ok: false };
  return { ok: true, token, base, handle: params.get('handle') || '' };
}

if (typeof document !== 'undefined' && typeof chrome !== 'undefined' && chrome.storage) {
  (async () => {
    const title = document.getElementById('title');
    const text = document.getElementById('text');
    const params = new URLSearchParams(location.hash.slice(1));
    // The token must not stay in the address bar or the history.
    history.replaceState(null, '', location.pathname);
    const stored = await chrome.storage.local.get('radarConnectState');
    const result = validateConnectFragment(params, stored.radarConnectState);
    if (!result.ok) {
      title.textContent = t('connectFailedTitle');
      text.textContent = t('connectFailedText');
      return;
    }
    // Single use: a replayed fragment must not overwrite the account again.
    await chrome.storage.local.remove('radarConnectState');
    await chrome.storage.local.set({ radarAccount: { token: result.token, handle: result.handle, base: result.base } });
    title.textContent = t('connectedTitle');
    text.textContent = t('connectedText', [new URL(result.base).hostname, result.handle]);
    // Nothing is left to do here: the popup shows the account from now on.
    setTimeout(() => chrome.tabs.getCurrent((tab) => tab?.id && chrome.tabs.remove(tab.id)), 1200);
  })();
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { validateConnectFragment };
}
