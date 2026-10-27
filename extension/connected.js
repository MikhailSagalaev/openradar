/**
 * OpenRadar extension: finishes GitHub sign-in in browsers without chrome.identity.
 * The hub redirects here with #token=…&handle=…&base=… after the user allows the extension.
 */
(async () => {
  const title = document.getElementById('title');
  const text = document.getElementById('text');
  const params = new URLSearchParams(location.hash.slice(1));
  // The token must not stay in the address bar or the history.
  history.replaceState(null, '', location.pathname);
  const token = params.get('token') || '';
  const base = (params.get('base') || '').replace(/\/+$/, '');
  if (!token.startsWith('ext_') || !/^https?:\/\//.test(base)) {
    title.textContent = 'Не получилось подключить';
    text.textContent = 'Откройте расширение и нажмите «Войти через GitHub» ещё раз.';
    return;
  }
  const handle = params.get('handle') || '';
  await chrome.storage.local.set({ radarAccount: { token, handle, base } });
  title.textContent = 'Готово';
  text.textContent = `Расширение подключено к ${new URL(base).hostname} как @${handle}. Эту вкладку можно закрыть.`;
})();
