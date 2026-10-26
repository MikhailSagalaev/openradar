# Browser extension (Manifest V3)

A dependency-free Manifest V3 extension that sends a vacancy or an order from any site to your OpenRadar node with one click, the context menu or `Alt+Shift+R`.

## Installation (Chrome, Edge, Yandex Browser, Brave)

1. Open your OpenRadar dashboard, page **Расширение** (`/extension`), and download `extension.zip` (or use the `extension/` folder of the repository).
2. Unpack it, open `chrome://extensions/`, enable **Developer mode**.
3. **Load unpacked** and select the unpacked folder.

## Configuration

1. Create a webhook source on your node:
   ```bash
   node bin/radar.js source add --kind webhook --title "Browser"
   ```
   Keep the token it prints. Source ids are also listed on `/extension`.
2. In the popup, open **Настройки подключения** and fill in the server URL (e.g. `http://127.0.0.1:8787`, check it with **Проверить**), the source id and the token. Save.

## What it captures

- **Whole page** (popup or `Alt+Shift+R`): `schema.org/JobPosting` when present (title, company, salary, city, remote, skills), otherwise OpenGraph / Twitter Card / page title and description. You choose **Заказ** or **Вакансия** before sending.
- **Selection** (right click): the selected text from any site, including Telegram Web and forums.

Contacts in the text are sent as they are. The node keeps them in a structured field; in hub mode guests never see them.

## Privacy

Only on your command, only to your server. See [extension/PRIVACY.md](../extension/PRIVACY.md).
