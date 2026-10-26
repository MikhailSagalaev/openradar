# Privacy Policy for the OpenRadar Extension

**Extension version:** 0.7.0
**Effective date:** October 26, 2026

## What the extension does

The extension sends the page you are looking at, or the text you selected, to **your own** OpenRadar server, and only when you ask it to: the popup button, the context menu or the `Alt+Shift+R` shortcut. Nothing is sent while you browse.

## What is sent, and where

- **Destination:** only the server URL you configured in the extension settings (`/api/ingest/<source id>` with your source token). There is no default server and no third-party endpoint.
- **Content:** page title, URL, the selected text or the page description, and `schema.org/JobPosting` fields when the page has them (title, company, salary, city, skills, description). Contacts written in the text are sent as they are: your server stores them and hides them from guests.

## What is stored in the browser

`chrome.storage.local` keeps your server URL, the source id and the source token. No keys, no history, no analytics.

## Permissions

- `activeTab`, `scripting`: read the open tab when you press send.
- `storage`: keep the connection settings above.
- `contextMenus`, `notifications`: the right-click menu and the "sent" notification.

## No tracking

No analytics, telemetry or third-party scripts. The source code is open: https://github.com/MikhailSagalaev/radar-oss (AGPL-3.0).
