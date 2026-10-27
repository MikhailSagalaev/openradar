# Browser extension (Manifest V3)

A dependency-free Manifest V3 extension that sends a vacancy or an order from any site to OpenRadar with one click, the context menu or `Alt+Shift+R`, and shows what similar work usually pays.

The extension speaks Russian and English and follows the browser's language (other languages get Russian). Strings live in `extension/_locales/<lang>/messages.json`; a new language is one more folder.

## Installation (Chrome, Edge, Yandex Browser, Brave)

1. Download the archive: **Скачать extension.zip** on [openradar.fun/extension](https://openradar.fun/extension) or `radar-extension-vX.Y.Z.zip` from the [latest release](https://github.com/MikhailSagalaev/openradar/releases/latest).
2. Unpack it, open the extensions page (`chrome://extensions/`, in Yandex Browser `browser://extensions/`), enable **Developer mode**.
3. **Load unpacked** and select the unpacked folder.

## Updating

When the hub hands out a newer version than the installed one (`GET /api/ext/version`), the popup says so at the top. A copy installed from a store updates itself; the **Обновить** button asks the browser to do it now. An unpacked copy does not update itself: the button opens `/extension` to download the new archive. The current version is also shown on `/extension`. To update an unpacked copy:

- unpack the new archive over the old folder and press the reload arrow on the extension card (the sign-in and settings stay), or
- remove the old extension and load the new folder (sign in again afterwards).

Versions before 0.8.0 have no GitHub sign-in: the popup shows **Настройки подключения** and asks for a server address and a token. Update to get **Войти через GitHub**.

## Sign in

Press **Войти через GitHub** (**Sign in with GitHub** in an English browser) in the popup. A sign-in window opens on the hub (`https://openradar.fun` by default, the **Сервер рыночной оценки** setting); after GitHub sign-in the hub asks you to allow the extension to add leads as you. Nothing else to type: leads go to the shared base under your GitHub name.

How it works: the extension opens `/extension/connect` in a `chrome.identity.launchWebAuthFlow` window. Browsers without that API (or where the window cannot open) get the same page in a regular tab, and the hub sends you back to the extension's own `connected.html`. Either way the personal token (`ext_…`) goes only to the extension: `https://<extension id>.chromiumapp.org/` or `chrome-extension://<extension id>/connected.html`. The token can add leads and nothing else; the hub stores only its SHA-256. **Выйти** revokes it. Firefox is not supported.

You need to be signed in to the site with GitHub in the same browser, or you will be asked to sign in during the flow. The leads you add appear in the feed under your GitHub name and count as yours.

## Your own node (optional)

To send leads to your own server instead, sign out and use the settings:

1. Create a webhook source on your node:
   ```bash
   node bin/radar.js source add --kind webhook --title "Browser"
   ```
   Keep the token it prints. Source ids are also listed on `/extension`.
2. In the popup, open **Свой узел (необязательно)** and fill in the server URL (e.g. `http://127.0.0.1:8787`, check it with **Проверить**), the source id and the token. Save.

## What it captures

- **Whole page** (popup or `Alt+Shift+R`): `schema.org/JobPosting` when present (title, company, salary, city, remote, skills), otherwise OpenGraph / Twitter Card / page title and description. You choose **Заказ** or **Вакансия** before sending.
- **Selection** (right click): the selected text from any site, including Telegram Web and forums.

Contacts in the text are sent as they are. The node keeps them in a structured field; in hub mode guests never see them.

## Market pay estimate

On a vacancy or an order, press **Оценить оплату на рынке** in the popup. The extension asks the market server (`https://openradar.fun` by default, **Сервер рыночной оценки** in the settings) for `/api/market` and shows:

- the median pay for similar leads over the last 90 days (monthly for vacancies, per project for orders);
- the middle half of offers, from the 25th to the 75th percentile;
- whether the pay on this page is below, within or above that range, when the page states it;
- up to three similar leads.

Only the title, the chosen type and the skills from the page markup are sent, and only on the click. The estimate uses leads a guest can already see, so it never reflects posts still under the feed delay.

## Privacy

Only on your command, only to your server. See [extension/PRIVACY.md](../extension/PRIVACY.md).
