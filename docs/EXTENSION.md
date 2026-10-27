# Browser extension (Manifest V3)

A dependency-free Manifest V3 extension that sends a vacancy or an order from any site to OpenRadar with one click, the context menu or `Alt+Shift+R`, and shows what similar work usually pays.

## Installation (Chrome, Edge, Yandex Browser, Brave)

1. Open your OpenRadar dashboard, page **Расширение** (`/extension`), and download `extension.zip` (or use the `extension/` folder of the repository).
2. Unpack it, open `chrome://extensions/`, enable **Developer mode**.
3. **Load unpacked** and select the unpacked folder.

## Sign in

Press **Войти через GitHub** in the popup. A sign-in window opens on the hub (`https://openradar.fun` by default, the **Сервер рыночной оценки** setting); after GitHub sign-in the hub asks you to allow the extension to add leads as you. Nothing else to type: leads go to the shared base under your GitHub name.

How it works: the extension opens `/extension/connect` with `chrome.identity.launchWebAuthFlow`. The hub returns a personal token (`ext_…`) only to the extension's own `https://<extension id>.chromiumapp.org/` address. The token can add leads and nothing else; the hub stores only its SHA-256. **Выйти** revokes it. Firefox is not supported by this flow.

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
