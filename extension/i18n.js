/**
 * openradar extension: UI strings from _locales/ in the browser's language: Russian, or English
 * for every other language.
 * Elements carry data-i18n (text) or data-i18n-placeholder (placeholder) with a message key.
 */

/** Localised UI string; `subs` fill $1, $2... */
function t(key, subs) {
  return chrome.i18n.getMessage(key, subs) || key;
}

/** Locale for numbers and dates: the one the strings are in. */
function uiLocale() {
  return chrome.i18n.getMessage('@@ui_locale').replace('_', '-') || 'en-US';
}

/** The language of the strings, for what is written in code: X-Ray searches and the pitch. */
function uiLanguage() {
  return chrome.i18n.getMessage('@@ui_locale').startsWith('ru') ? 'ru' : 'en';
}

document.documentElement.lang = uiLanguage();
for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
for (const el of document.querySelectorAll('[data-i18n-placeholder]')) el.placeholder = t(el.dataset.i18nPlaceholder);
