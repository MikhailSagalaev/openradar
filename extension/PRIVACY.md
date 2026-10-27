# Privacy Policy for the OpenRadar Extension

**Extension version:** 0.11.0
**Effective date:** October 27, 2026

## What the extension does

The extension sends the page you are looking at, or the text you selected, to OpenRadar, and only when you ask it to: the popup button, the context menu or the `Alt+Shift+R` shortcut. Nothing is sent while you browse.

## What is sent, and where

- **Destination:** after **Войти через GitHub**, the hub you signed in to (`https://openradar.fun` by default), as your GitHub account (`/api/ext/submit` with a personal token). Without signing in, only the server URL you configured under **Свой узел** (`/api/ingest/<source id>` with your source token). No third-party endpoint.
- **Sign-in:** the sign-in window is the hub's own page and GitHub's. The extension receives a token that can only add leads; it never sees your GitHub password or GitHub token.
- **Market estimate:** when you press «Оценить оплату на рынке», the extension asks the market server for typical pay (`/api/market`). It sends only the page title, the type you chose (order or vacancy) and the skills from the page markup: no URL, no page text, no contacts. The market server is `https://openradar.fun` by default and can be changed in the settings.
- **Content:** page title, URL, the selected text or the page description, and `schema.org/JobPosting` fields when the page has them (title, company, salary, city, skills, description). Contacts written in the text are sent as they are: your server stores them and hides them from guests.

## What is stored in the browser

`chrome.storage.local` keeps the hub address, your GitHub name and the extension token after sign-in, and, if you use your own node, its URL, source id and source token, plus the market server URL. No history, no analytics.

## Permissions

- `activeTab`, `scripting`: read the open tab when you press send.
- `identity`: open the GitHub sign-in window on the hub and receive the extension token.
- `storage`: keep the connection settings above.
- `contextMenus`, `notifications`: the right-click menu and the "sent" notification.

## No tracking

No analytics, telemetry or third-party scripts. The source code is open: https://github.com/MikhailSagalaev/openradar (AGPL-3.0).
